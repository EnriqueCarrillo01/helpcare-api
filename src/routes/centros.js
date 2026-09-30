const express = require('express');
const db = require('../db');
const { HttpError, noEncontrado } = require('../errors');
const { publicar } = require('../events');
const { autenticar, autenticarOpcional, autorizar, requiereCuentaActiva } = require('../middleware/auth');
const { validar, texto, numero, opcion, idDeRuta } = require('../utils/validar');
const { TIPOS_NECESIDAD, URGENCIAS, ESTADOS_CENTRO } = require('../constantes');
const { centroPublico, necesidadPublica } = require('../services/formato');
const { centrosParaMapa } = require('../services/catalogo');

const router = express.Router();

const latitud = (opts) => numero('La latitud', { min: -90, max: 90, ...opts });
const longitud = (opts) => numero('La longitud', { min: -180, max: 180, ...opts });

// Mapa público: centros de acopio activos con sus necesidades abiertas.
// GET /api/centros?lat=17.98&lng=-92.93&radioKm=25&urgencia=critica&tipo=agua
router.get('/', async (req, res) => {
  const filtros = validar(req.query, {
    lat: latitud({ opcional: true }),
    lng: longitud({ opcional: true }),
    radioKm: numero('El radio', { min: 0.1, max: 1000, opcional: true }),
    tipo: opcion('El tipo', TIPOS_NECESIDAD, { opcional: true }),
    urgencia: opcion('La urgencia', URGENCIAS, { opcional: true }),
  });
  if ((filtros.lat === undefined) !== (filtros.lng === undefined)) {
    throw new HttpError(400, 'Datos inválidos', ['Envía latitud y longitud juntas']);
  }
  res.json(await centrosParaMapa({ radioKm: 50, ...filtros }));
});

// Centros de la institución que inició sesión (incluye los inactivos).
router.get('/mios', autenticar, autorizar('institucion'), async (req, res) => {
  const repo = db.repo();
  const centros = await repo.listarCentros({ institucionId: req.usuario.id });
  const { items: necesidades } = await repo.listarNecesidades({
    institucionId: req.usuario.id,
    estados: ['pendiente', 'abierta'],
  });
  res.json(
    centros.map((c) => ({
      ...centroPublico(c, req.usuario),
      necesidadesActivas: necesidades.filter((n) => n.centroId === c.id).length,
    }))
  );
});

router.get('/:id', autenticarOpcional, async (req, res) => {
  const id = idDeRuta(req, 'Centro');
  const repo = db.repo();
  const centro = await repo.centroPorId(id);
  const esDueno = req.usuario && req.usuario.id === (centro && centro.institucionId);
  const esAdmin = req.usuario && req.usuario.rol === 'administrador';
  if (!centro || (centro.estado !== 'activo' && !esDueno && !esAdmin)) throw noEncontrado('Centro');
  const institucion = await repo.usuarioPorId(centro.institucionId);
  const { items } = await repo.listarNecesidades({ centroIds: [id], estados: ['abierta'] });
  res.json({
    ...centroPublico(centro, institucion),
    necesidades: items.map((n) => {
      const { centro: _c, ...resto } = necesidadPublica(n);
      return resto;
    }),
  });
});

const camposCentro = (opcional) => ({
  nombre: texto('El nombre del centro', { min: 2, max: 120, opcional }),
  direccion: texto('La dirección', { min: 5, max: 250, opcional }),
  lat: latitud({ opcional }),
  lng: longitud({ opcional }),
  horario: texto('El horario', { max: 120, opcional: true }),
});

router.post('/', autenticar, autorizar('institucion'), requiereCuentaActiva, async (req, res) => {
  const datos = validar(req.body, camposCentro(false));
  const centro = await db.repo().crearCentro({ ...datos, institucionId: req.usuario.id, estado: 'activo' });
  publicar('centro', { id: centro.id });
  res.status(201).json(centroPublico(centro, req.usuario));
});

router.patch('/:id', autenticar, autorizar('institucion'), requiereCuentaActiva, async (req, res) => {
  const id = idDeRuta(req, 'Centro');
  const cambios = validar(req.body, {
    ...camposCentro(true),
    estado: opcion('El estado', ESTADOS_CENTRO, { opcional: true }),
  });
  if (Object.keys(cambios).length === 0) {
    throw new HttpError(400, 'Datos inválidos', ['No se envió ningún cambio']);
  }
  const repo = db.repo();
  const centro = await repo.centroPorId(id);
  if (!centro || centro.institucionId !== req.usuario.id) throw noEncontrado('Centro');
  const actualizado = await repo.actualizarCentro(id, cambios);
  publicar('centro', { id });
  res.json(centroPublico(actualizado, req.usuario));
});

module.exports = router;
