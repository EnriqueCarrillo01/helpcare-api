const h = require('./helpers');
const crearApp = require('../src/app');

const { app, request, auth } = h;
h.prepararBase();

const registrar = (datos) => request(app).post('/api/auth/registro').send(datos);
const base = { nombre: 'Ana Pérez', email: 'ana@example.com', password: '12345678' };

describe('POST /api/auth/registro', () => {
  it('registra una persona donante con datos válidos', async () => {
    const res = await registrar(base);
    expect(res.status).toBe(201);
    expect(res.body.usuario).toMatchObject({ rol: 'donante', estado: 'activo' });
    expect(res.body.usuario.passwordHash).toBeUndefined();
    expect(res.body.token).toBeDefined();
  });

  it('rechaza datos inválidos y lista todos los errores', async () => {
    const res = await registrar({ nombre: 'A', email: 'no-es-un-correo', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.errores).toHaveLength(3);
  });

  it.each([
    ['nombre numérico', { nombre: 123 }],
    ['correo como objeto', { email: { $gt: '' } }],
    ['contraseña como arreglo', { password: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }],
    ['rol inexistente', { rol: 'superusuario' }],
  ])('responde 400 (sin tumbar el servidor) con %s', async (_caso, cambio) => {
    const res = await registrar({ ...base, ...cambio });
    expect(res.status).toBe(400);
    const salud = await request(app).get('/health');
    expect(salud.status).toBe(200);
  });

  it('rechaza contraseñas de más de 72 bytes (límite de bcrypt)', async () => {
    const res = await registrar({ ...base, password: 'x'.repeat(73) });
    expect(res.status).toBe(400);
  });

  it('normaliza el correo: mayúsculas y espacios no crean cuentas duplicadas', async () => {
    await registrar(base);
    const res = await registrar({ ...base, email: '  ANA@Example.com ' });
    expect(res.status).toBe(409);
  });

  it('responde 403 si se pide rol administrador sin sesión de admin', async () => {
    const res = await registrar({ ...base, rol: 'administrador' });
    expect(res.status).toBe(403);
  });

  it('responde 401 si llega un token inválido (no crea la cuenta en silencio)', async () => {
    const res = await registrar(base).set(auth('token.invalido'));
    expect(res.status).toBe(401);
  });

  it('un administrador puede crear otro administrador (sin recibir su token)', async () => {
    const admin = await h.crearAdmin();
    const res = await registrar({ ...base, rol: 'administrador' }).set(auth(admin.token));
    expect(res.status).toBe(201);
    expect(res.body.usuario.rol).toBe('administrador');
    expect(res.body.token).toBeUndefined();
  });

  it('una institución queda en revisión y requiere nombre de organización', async () => {
    const sinOrg = await registrar({ ...base, rol: 'institucion' });
    expect(sinOrg.status).toBe(400);
    const res = await registrar({ ...base, rol: 'institucion', organizacion: 'Banco de Alimentos' });
    expect(res.status).toBe(201);
    expect(res.body.usuario).toMatchObject({ estado: 'pendiente', organizacion: 'Banco de Alimentos' });
  });

  it('una institución creada por un admin queda activa', async () => {
    const admin = await h.crearAdmin();
    const res = await registrar({ ...base, rol: 'institucion', organizacion: 'Cruz Local' }).set(
      auth(admin.token)
    );
    expect(res.body.usuario.estado).toBe('activo');
  });

  it('una donante no guarda organización aunque la envíe', async () => {
    const res = await registrar({ ...base, organizacion: 'Algo' });
    expect(res.body.usuario.organizacion).toBeNull();
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registrar(base);
  });

  it('inicia sesión con credenciales correctas, sin importar mayúsculas en el correo', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ANA@example.com', password: '12345678' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rechaza contraseña incorrecta y correo inexistente con el mismo mensaje', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'incorrecta' });
    const b = await request(app).post('/api/auth/login').send({ email: 'otro@example.com', password: '12345678' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });

  it('rechaza login sin datos o con tipos inválidos', async () => {
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
    const res = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: { x: 1 } });
    expect(res.status).toBe(400);
  });

  it('bloquea el login de una cuenta rechazada', async () => {
    const db = require('../src/db');
    const u = await db.repo().usuarioPorEmail('ana@example.com');
    await db.repo().actualizarUsuario(u.id, { estado: 'rechazado' });
    const res = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: '12345678' });
    expect(res.status).toBe(403);
  });
});

describe('Límite de intentos', () => {
  it('responde 429 tras superar los intentos de login permitidos', async () => {
    const appLimitada = crearApp({ limites: { activos: true, login: 3 } });
    const intento = () =>
      request(appLimitada).post('/api/auth/login').send({ email: 'x@example.com', password: 'nada1234' });
    for (let i = 0; i < 3; i += 1) expect((await intento()).status).toBe(401);
    const bloqueado = await intento();
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error).toMatch(/intentos/);
  });
});
