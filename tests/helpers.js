// Utilidades compartidas por las pruebas. Funcionan igual con el almacén en
// memoria y con PostgreSQL (cuando existe DATABASE_URL).
const request = require('supertest');
const db = require('../src/db');
const crearApp = require('../src/app');
const { hashPassword } = require('../src/utils/password');
const { generarToken } = require('../src/utils/jwt');

const app = crearApp();

function prepararBase() {
  beforeAll(async () => {
    await db.init();
  });
  beforeEach(async () => {
    await db.repo().reset();
  });
  afterAll(async () => {
    await db.cerrar();
  });
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

let contador = 0;
const correo = (prefijo) => `${prefijo}${++contador}@example.com`;

async function crearUsuarioDirecto({ rol = 'donante', estado = 'activo', nombre, organizacion } = {}) {
  const usuario = await db.repo().crearUsuario({
    nombre: nombre || `Usuario ${rol}`,
    email: correo(rol),
    organizacion: rol === 'institucion' ? organizacion || 'Organización de prueba' : null,
    passwordHash: await hashPassword('contraseña-segura'),
    rol,
    estado,
  });
  return { usuario, token: generarToken(usuario) };
}

const crearAdmin = () => crearUsuarioDirecto({ rol: 'administrador' });
const crearDonante = () => crearUsuarioDirecto({ rol: 'donante' });
const crearInstitucion = (estado = 'activo') => crearUsuarioDirecto({ rol: 'institucion', estado });

async function crearCentro(token, datos = {}) {
  const res = await request(app)
    .post('/api/centros')
    .set(auth(token))
    .send({
      nombre: 'Centro de prueba',
      direccion: 'Calle Falsa 123, Villahermosa',
      lat: 17.9892,
      lng: -92.9281,
      horario: 'Lunes a viernes',
      ...datos,
    });
  if (res.status !== 201) throw new Error(`crearCentro: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function crearNecesidad(token, centroId, datos = {}) {
  const res = await request(app)
    .post('/api/necesidades')
    .set(auth(token))
    .send({
      centroId,
      titulo: 'Agua embotellada',
      tipo: 'agua',
      unidad: 'botellas',
      cantidadRequerida: 10,
      urgencia: 'critica',
      ...datos,
    });
  if (res.status !== 201) throw new Error(`crearNecesidad: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function aprobarNecesidad(tokenAdmin, id) {
  const res = await request(app)
    .patch(`/api/admin/necesidades/${id}`)
    .set(auth(tokenAdmin))
    .send({ estado: 'abierta' });
  if (res.status !== 200) throw new Error(`aprobarNecesidad: ${res.status}`);
  return res.body;
}

// Escenario completo: institución activa con un centro y una necesidad abierta.
async function escenarioBase(datosNecesidad = {}) {
  const admin = await crearAdmin();
  const institucion = await crearInstitucion();
  const donante = await crearDonante();
  const centro = await crearCentro(institucion.token);
  const pendiente = await crearNecesidad(institucion.token, centro.id, datosNecesidad);
  const necesidad = await aprobarNecesidad(admin.token, pendiente.id);
  return { admin, institucion, donante, centro, necesidad };
}

async function donar(token, necesidadId, cantidad, extra = {}) {
  return request(app).post('/api/donaciones').set(auth(token)).send({ necesidadId, cantidad, ...extra });
}

module.exports = {
  app,
  request,
  prepararBase,
  auth,
  correo,
  crearUsuarioDirecto,
  crearAdmin,
  crearDonante,
  crearInstitucion,
  crearCentro,
  crearNecesidad,
  aprobarNecesidad,
  escenarioBase,
  donar,
};
