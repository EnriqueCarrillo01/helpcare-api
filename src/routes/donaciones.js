const express = require('express');
const db = require('../db');
const { publicar } = require('../events');
const { autenticar, autorizar, requiereCuentaActiva } = require('../middleware/auth');
const { validar, texto, numero, opcion, idDeRuta, paginacion } = require('../utils/validar');
const { ESTADOS_DONACION } = require('../constantes');
const { donacionPublica, centroResumen } = require('../services/formato');
const { mapaPorId, unicos } = require('../services/catalogo');
const servicio = require('../services/donaciones');

const router = express.Router();

// Añade a cada donación su necesidad y su centro (y, si se pide, quién dona).
async function enriquecer(donaciones, { conDonante = false } = {}) {
  const repo = db.repo();
  const necesidades = await mapaPorId(
    (f) => repo.listarNecesidades(f),
    unicos(donaciones.map((d) => d.necesidadId))
  );
  const centros = await mapaPorId(
    (f) => repo.listarCentros(f),
    unicos([...necesidades.values()].map((n) => n.centroId))
  );
  const donantes = conDonante
    ? await mapaPorId((f) => repo.listarUsuarios(f), unicos(donaciones.map((d) => d.donanteId)))
    : null;

  return donaciones.map((d) => {
    const n = necesidades.get(d.necesidadId);
    const item = {
      ...donacionPublica(d),
      necesidad: { id: n.id, titulo: n.titulo, unidad: n.unidad, estado: n.estado, tipo: n.tipo },
      centro: centroResumen(centros.get(n.centroId)),
    };
    // La institución que recibe necesita saber a quién esperar para coordinar la entrega.
    if (donantes) {
      const u = donantes.get(d.donanteId);
      item.donante = u ? { nombre: u.nombre, email: u.email } : null;
    }
    return item;
  });
}

router.post('/', autenticar, autorizar('donante'), requiereCuentaActiva, async (req, res) => {
  const datos = validar(req.body, {
    necesidadId: numero('La necesidad', { min: 1, entero: true }),
    cantidad: numero('La cantidad', { min: 1, max: 1000000, entero: true }),
    nota: texto('La nota', { max: 300, opcional: true }),
  });
  const { donacion, centro } = await servicio.crearDonacion(req.usuario, datos);
  publicar('donacion', { necesidadId: donacion.necesidadId, centroId: centro.id });
  const [respuesta] = await enriquecer([donacion]);
  res.status(201).json(respuesta);
});

router.get('/mias', autenticar, autorizar('donante'), async (req, res) => {
  const { pagina, porPagina, limit, offset } = paginacion(req.query);
  const { items, total } = await db.repo().listarDonaciones({ donanteId: req.usuario.id, limit, offset });
  res.json({ items: await enriquecer(items), total, pagina, porPagina });
});

router.get('/recibidas', autenticar, autorizar('institucion'), async (req, res) => {
  const { pagina, porPagina, limit, offset } = paginacion(req.query);
  const { estado } = validar(req.query, {
    estado: opcion('El estado', ESTADOS_DONACION, { opcional: true }),
  });
  const { items, total } = await db.repo().listarDonaciones({
    institucionId: req.usuario.id,
    estado,
    limit,
    offset,
  });
  res.json({ items: await enriquecer(items, { conDonante: true }), total, pagina, porPagina });
});

router.patch('/:id', autenticar, autorizar('donante', 'institucion'), async (req, res) => {
  const id = idDeRuta(req, 'Donación');
  const { estado } = validar(req.body, {
    estado: opcion('El estado', ['en_camino', 'entregada', 'cancelada']),
  });
  const { donacion, necesidad } = await servicio.cambiarEstado(req.usuario, id, estado);
  publicar('donacion', { necesidadId: necesidad.id, centroId: necesidad.centroId });
  const [respuesta] = await enriquecer([donacion], { conDonante: req.usuario.rol === 'institucion' });
  res.json(respuesta);
});

module.exports = router;
