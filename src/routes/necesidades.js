const express = require('express');
const db = require('../db');
const { HttpError, noEncontrado } = require('../errors');
const { publicar } = require('../events');
const { autenticar, autenticarOpcional, autorizar, requiereCuentaActiva } = require('../middleware/auth');
const { validar, texto, numero, opcion, idDeRuta, paginacion } = require('../utils/validar');
const { TIPOS_NECESIDAD, URGENCIAS, ESTADOS_NECESIDAD } = require('../constantes');
const { centroPublico } = require('../services/formato');
const { necesidadesConCentro } = require('../services/catalogo');

const router = express.Router();
const VISIBLES = ['abierta', 'cubierta', 'cerrada'];
const MAX_CANTIDAD = 1000000;

// Catálogo público de necesidades aprobadas.
router.get('/', async (req, res) => {
  const { pagina, porPagina, limit, offset } = paginacion(req.query);
  const f = validar(req.query, {
    tipo: opcion('El tipo', TIPOS_NECESIDAD, { opcional: true }),
    urgencia: opcion('La urgencia', URGENCIAS, { opcional: true }),
    estado: opcion('El estado', ['abierta', 'cubierta'], { porDefecto: 'abierta' }),
    centroId: numero('El centro', { min: 1, entero: true, opcional: true }),
  });
  const repo = db.repo();
  // Solo necesidades de centros activos: si un centro se desactiva, sus
  // necesidades dejan de ofrecerse aunque sigan abiertas.
  const activos = (await repo.listarCentros({ estado: 'activo' })).map((c) => c.id);
  const { items, total } = await repo.listarNecesidades({
    estados: [f.estado],
    tipo: f.tipo,
    urgencia: f.urgencia,
    centroIds: f.centroId ? activos.filter((id) => id === f.centroId) : activos,
    limit,
    offset,
  });
  res.json({ items: await necesidadesConCentro(items), total, pagina, porPagina });
});

// Todas las necesidades de la institución, en cualquier estado.
router.get('/mias', autenticar, autorizar('institucion'), async (req, res) => {
  const { pagina, porPagina, limit, offset } = paginacion(req.query);
  const { estado } = validar(req.query, {
    estado: opcion('El estado', ESTADOS_NECESIDAD, { opcional: true }),
  });
  const { items, total } = await db.repo().listarNecesidades({
    institucionId: req.usuario.id,
    estados: estado ? [estado] : undefined,
    limit,
    offset,
  });
  res.json({ items: await necesidadesConCentro(items), total, pagina, porPagina });
});

// Detalle con trazabilidad: qué se ha comprometido y entregado, sin revelar quién dona.
router.get('/:id', autenticarOpcional, async (req, res) => {
  const id = idDeRuta(req, 'Necesidad');
  const repo = db.repo();
  const necesidad = await repo.necesidadPorId(id);
  if (!necesidad) throw noEncontrado('Necesidad');
  const centro = await repo.centroPorId(necesidad.centroId);
  const u = req.usuario;
  const puedeVer =
    VISIBLES.includes(necesidad.estado) ||
    (u && (u.rol === 'administrador' || u.id === centro.institucionId));
  if (!puedeVer) throw noEncontrado('Necesidad');

  const institucion = await repo.usuarioPorId(centro.institucionId);
  const { items: donaciones } = await repo.listarDonaciones({ necesidadId: id, limit: 100 });
  const [detalle] = await necesidadesConCentro([necesidad]);
  res.json({
    ...detalle,
    institucion: centroPublico(centro, institucion).institucion,
    seguimiento: donaciones.map((d) => ({
      id: d.id,
      cantidad: d.cantidad,
      estado: d.estado,
      creadoEn: d.creadoEn,
      actualizadoEn: d.actualizadoEn,
    })),
  });
});

router.post('/', autenticar, autorizar('institucion'), requiereCuentaActiva, async (req, res) => {
  const datos = validar(req.body, {
    centroId: numero('El centro de acopio', { min: 1, entero: true }),
    titulo: texto('El título', { min: 3, max: 120 }),
    descripcion: texto('La descripción', { max: 1000, opcional: true }),
    tipo: opcion('El tipo', TIPOS_NECESIDAD),
    unidad: texto('La unidad', { min: 1, max: 40 }),
    cantidadRequerida: numero('La cantidad', { min: 1, max: MAX_CANTIDAD, entero: true }),
    urgencia: opcion('La urgencia', URGENCIAS),
  });
  const repo = db.repo();
  const centro = await repo.centroPorId(datos.centroId);
  if (!centro || centro.institucionId !== req.usuario.id) {
    throw new HttpError(400, 'Datos inválidos', ['El centro de acopio no pertenece a tu institución']);
  }
  if (centro.estado !== 'activo') {
    throw new HttpError(409, 'El centro está inactivo; actívalo antes de publicar necesidades');
  }
  // Toda necesidad nueva la revisa un administrador antes de publicarse.
  const necesidad = await repo.crearNecesidad({ ...datos, estado: 'pendiente' });
  const [respuesta] = await necesidadesConCentro([necesidad]);
  res.status(201).json(respuesta);
});

router.patch('/:id', autenticar, autorizar('institucion'), requiereCuentaActiva, async (req, res) => {
  const id = idDeRuta(req, 'Necesidad');
  const cambios = validar(req.body, {
    titulo: texto('El título', { min: 3, max: 120, opcional: true }),
    descripcion: texto('La descripción', { max: 1000, opcional: true }),
    urgencia: opcion('La urgencia', URGENCIAS, { opcional: true }),
    cantidadRequerida: numero('La cantidad', { min: 1, max: MAX_CANTIDAD, entero: true, opcional: true }),
    estado: opcion('El estado', ['cerrada'], { opcional: true }),
  });
  if (Object.keys(cambios).length === 0) {
    throw new HttpError(400, 'Datos inválidos', ['No se envió ningún cambio']);
  }

  const resultado = await db.repo().transaccion(async (tx) => {
    const necesidad = await tx.necesidadPorId(id, { bloquear: true });
    const centro = necesidad && (await tx.centroPorId(necesidad.centroId));
    if (!necesidad || centro.institucionId !== req.usuario.id) throw noEncontrado('Necesidad');
    if (!['pendiente', 'abierta'].includes(necesidad.estado)) {
      throw new HttpError(409, `Una necesidad ${necesidad.estado} ya no se puede modificar`);
    }
    if (cambios.cantidadRequerida !== undefined) {
      if (cambios.cantidadRequerida < necesidad.cantidadComprometida) {
        throw new HttpError(
          409,
          `Ya hay ${necesidad.cantidadComprometida} ${necesidad.unidad} comprometidas; la cantidad no puede ser menor`
        );
      }
      if (necesidad.estado === 'abierta' && necesidad.cantidadEntregada >= cambios.cantidadRequerida) {
        cambios.estado = cambios.estado || 'cubierta';
      }
    }
    return tx.actualizarNecesidad(id, cambios);
  });

  publicar('necesidad', { id, centroId: resultado.centroId });
  const [respuesta] = await necesidadesConCentro([resultado]);
  res.json(respuesta);
});

module.exports = router;
