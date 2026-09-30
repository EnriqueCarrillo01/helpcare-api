const express = require('express');
const db = require('../db');
const { HttpError, noEncontrado } = require('../errors');
const { publicar } = require('../events');
const { autenticar, autorizar } = require('../middleware/auth');
const { validar, opcion, idDeRuta, paginacion } = require('../utils/validar');
const { ESTADOS_USUARIO, ESTADOS_NECESIDAD } = require('../constantes');
const { usuarioPublico } = require('../services/formato');
const { necesidadesConCentro, mapaPorId, unicos } = require('../services/catalogo');

const router = express.Router();
router.use(autenticar, autorizar('administrador'));

// ---------- Instituciones ----------
router.get('/instituciones', async (req, res) => {
  const { pagina, porPagina, limit, offset } = paginacion(req.query);
  const { estado } = validar(req.query, {
    estado: opcion('El estado', ESTADOS_USUARIO, { porDefecto: 'pendiente' }),
  });
  const { items, total } = await db.repo().listarUsuarios({ rol: 'institucion', estado, limit, offset });
  res.json({ items: items.map(usuarioPublico), total, pagina, porPagina });
});

router.patch('/instituciones/:id', async (req, res) => {
  const id = idDeRuta(req, 'Institución');
  const { estado } = validar(req.body, {
    estado: opcion('La decisión', ['activo', 'rechazado']),
  });
  const repo = db.repo();
  const usuario = await repo.usuarioPorId(id);
  if (!usuario || usuario.rol !== 'institucion') throw noEncontrado('Institución');
  const actualizado = await repo.actualizarUsuario(id, { estado });
  res.json(usuarioPublico(actualizado));
});

// ---------- Necesidades (aprobar causas) ----------
router.get('/necesidades', async (req, res) => {
  const { pagina, porPagina, limit, offset } = paginacion(req.query);
  const { estado } = validar(req.query, {
    estado: opcion('El estado', ESTADOS_NECESIDAD, { porDefecto: 'pendiente' }),
  });
  const repo = db.repo();
  const { items, total } = await repo.listarNecesidades({ estados: [estado], limit, offset });
  const conCentro = await necesidadesConCentro(items);
  const centros = await mapaPorId((f) => repo.listarCentros(f), unicos(items.map((n) => n.centroId)));
  const instituciones = await mapaPorId(
    (f) => repo.listarUsuarios(f),
    unicos([...centros.values()].map((c) => c.institucionId))
  );
  const resultado = conCentro.map((n, i) => {
    const inst = instituciones.get(centros.get(items[i].centroId).institucionId);
    return { ...n, institucion: { id: inst.id, nombre: inst.organizacion || inst.nombre } };
  });
  res.json({ items: resultado, total, pagina, porPagina });
});

router.patch('/necesidades/:id', async (req, res) => {
  const id = idDeRuta(req, 'Necesidad');
  const { estado } = validar(req.body, {
    estado: opcion('La decisión', ['abierta', 'rechazada']),
  });
  const repo = db.repo();
  const necesidad = await repo.necesidadPorId(id);
  if (!necesidad) throw noEncontrado('Necesidad');
  if (necesidad.estado !== 'pendiente') {
    throw new HttpError(409, `Esta necesidad ya fue revisada (estado: ${necesidad.estado})`);
  }
  const actualizada = await repo.actualizarNecesidad(id, { estado });
  if (estado === 'abierta') publicar('necesidad', { id, centroId: necesidad.centroId });
  const [conCentro] = await necesidadesConCentro([actualizada]);
  res.json(conCentro);
});

module.exports = router;
