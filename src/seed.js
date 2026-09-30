// Datos iniciales: el primer administrador (desde variables de entorno) y, si
// se pide, datos de ejemplo para demostrar el mapa en Villahermosa, Tabasco.
const crypto = require('node:crypto');
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const { hashPassword } = require('./utils/password');

// Crea el administrador de ADMIN_EMAIL/ADMIN_PASSWORD si todavía no existe.
async function asegurarAdmin({ email, password, nombre } = config.admin) {
  if (!email || !password) return null;
  const repo = db.repo();
  const correo = email.trim().toLowerCase();
  const existente = await repo.usuarioPorEmail(correo);
  if (existente) return existente;
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres');
  }
  const admin = await repo.crearUsuario({
    nombre,
    email: correo,
    passwordHash: await hashPassword(password),
    rol: 'administrador',
    estado: 'activo',
  });
  logger.info('administrador inicial creado', { email: correo });
  return admin;
}

const CENTROS_DEMO = [
  {
    nombre: 'Centro de acopio Zona Centro (demo)',
    direccion: 'Dirección de ejemplo, Centro, Villahermosa',
    lat: 17.9892,
    lng: -92.9281,
    horario: 'Lunes a sábado, 9:00 a 18:00',
    necesidades: [
      { titulo: 'Agua embotellada de 1.5 L', tipo: 'agua', unidad: 'botellas', cantidadRequerida: 400, urgencia: 'critica' },
      { titulo: 'Despensas básicas', tipo: 'alimentos', unidad: 'despensas', cantidadRequerida: 120, urgencia: 'media' },
    ],
  },
  {
    nombre: 'Comedor comunitario Gaviotas (demo)',
    direccion: 'Dirección de ejemplo, Gaviotas, Villahermosa',
    lat: 17.976,
    lng: -92.911,
    horario: 'Todos los días, 8:00 a 14:00',
    necesidades: [
      { titulo: 'Voluntariado para servir comidas', tipo: 'voluntariado', unidad: 'turnos', cantidadRequerida: 30, urgencia: 'media' },
      { titulo: 'Leche en polvo', tipo: 'alimentos', unidad: 'latas', cantidadRequerida: 60, urgencia: 'critica' },
    ],
  },
  {
    nombre: 'Punto de acopio Tabasco 2000 (demo)',
    direccion: 'Dirección de ejemplo, Tabasco 2000, Villahermosa',
    lat: 18.002,
    lng: -92.946,
    horario: 'Lunes a viernes, 10:00 a 17:00',
    necesidades: [
      { titulo: 'Kits de higiene personal', tipo: 'higiene', unidad: 'kits', cantidadRequerida: 200, urgencia: 'baja' },
      { titulo: 'Ropa para niñas y niños', tipo: 'ropa', unidad: 'prendas', cantidadRequerida: 300, urgencia: 'baja' },
    ],
  },
  {
    nombre: 'Brigada médica Atasta (demo)',
    direccion: 'Dirección de ejemplo, Atasta, Villahermosa',
    lat: 17.996,
    lng: -92.936,
    horario: 'Sábados, 9:00 a 13:00',
    necesidades: [
      { titulo: 'Suero oral', tipo: 'medicinas', unidad: 'sobres', cantidadRequerida: 500, urgencia: 'critica' },
      { titulo: 'Consultas de medicina general', tipo: 'servicios_medicos', unidad: 'consultas', cantidadRequerida: 40, urgencia: 'media' },
    ],
  },
];

// Carga los datos de ejemplo solo si la base no tiene centros. Las cuentas de
// ejemplo reciben una contraseña aleatoria que no se muestra: sirven para
// poblar el mapa, no para iniciar sesión.
async function cargarDemo() {
  const repo = db.repo();
  if ((await repo.listarCentros()).length > 0) return false;

  const passwordHash = await hashPassword(crypto.randomBytes(24).toString('hex'));
  const institucion = await repo.crearUsuario({
    nombre: 'Coordinación de ejemplo',
    email: 'institucion.demo@helpcare.example',
    organizacion: 'Red de Ayuda Tabasco (demo)',
    passwordHash,
    rol: 'institucion',
    estado: 'activo',
  });
  const donante = await repo.crearUsuario({
    nombre: 'Donante de ejemplo',
    email: 'donante.demo@helpcare.example',
    passwordHash,
    rol: 'donante',
    estado: 'activo',
  });

  for (const { necesidades, ...datosCentro } of CENTROS_DEMO) {
    const centro = await repo.crearCentro({ ...datosCentro, institucionId: institucion.id, estado: 'activo' });
    for (const n of necesidades) {
      const necesidad = await repo.crearNecesidad({ ...n, centroId: centro.id, estado: 'abierta' });
      // Una entrega confirmada por necesidad para que la vista de impacto tenga datos.
      const cantidad = Math.max(1, Math.round(n.cantidadRequerida * 0.25));
      await repo.crearDonacion({ necesidadId: necesidad.id, donanteId: donante.id, cantidad, estado: 'entregada' });
      await repo.actualizarNecesidad(necesidad.id, { cantidadComprometida: cantidad, cantidadEntregada: cantidad });
    }
  }
  logger.info('datos de ejemplo cargados', { centros: CENTROS_DEMO.length });
  return true;
}

module.exports = { asegurarAdmin, cargarDemo, CENTROS_DEMO };
