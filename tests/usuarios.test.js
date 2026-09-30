const h = require('./helpers');
const db = require('../src/db');
const jwt = require('jsonwebtoken');

const { app, request, auth } = h;
h.prepararBase();

describe('Perfil y rutas protegidas', () => {
  it('rechaza sin token, con header mal formado o con token inválido', async () => {
    expect((await request(app).get('/api/donantes/perfil')).status).toBe(401);
    expect((await request(app).get('/api/donantes/perfil').set('Authorization', 'SinBearer')).status).toBe(401);
    expect((await request(app).get('/api/donantes/perfil').set(auth('a.b.c'))).status).toBe(401);
  });

  it('rechaza un token firmado con otro secreto o con otro emisor', async () => {
    const falso = jwt.sign({ rol: 'administrador' }, 'secreto-de-un-atacante', { subject: '1' });
    expect((await request(app).get('/api/donantes/perfil').set(auth(falso))).status).toBe(401);
  });

  it('devuelve el perfil propio sin exponer el hash', async () => {
    const { token, usuario } = await h.crearDonante();
    const res = await request(app).get('/api/donantes/perfil').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(usuario.email);
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('también responde en /api/usuarios/perfil', async () => {
    const { token } = await h.crearDonante();
    expect((await request(app).get('/api/usuarios/perfil').set(auth(token))).status).toBe(200);
  });

  it('responde 401 si la cuenta del token ya no existe', async () => {
    const { token, usuario } = await h.crearDonante();
    await db.repo().eliminarUsuario(usuario.id);
    const res = await request(app).get('/api/donantes/perfil').set(auth(token));
    expect(res.status).toBe(401);
  });

  it('aplica un cambio de rol de inmediato, sin esperar a que expire el token', async () => {
    const { token, usuario } = await h.crearAdmin();
    await db.repo().actualizarUsuario(usuario.id, { rol: 'donante' });
    expect((await request(app).get('/api/donantes').set(auth(token))).status).toBe(403);
  });
});

describe('GET /api/donantes (administración)', () => {
  it('impide que una persona donante liste usuarios', async () => {
    const { token } = await h.crearDonante();
    expect((await request(app).get('/api/donantes').set(auth(token))).status).toBe(403);
  });

  it('lista con paginación y filtros', async () => {
    const admin = await h.crearAdmin();
    for (let i = 0; i < 3; i += 1) await h.crearDonante();
    await h.crearInstitucion('pendiente');

    const res = await request(app).get('/api/donantes?porPagina=2&pagina=1').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 5, pagina: 1, porPagina: 2 });
    expect(res.body.items).toHaveLength(2);

    const filtrado = await request(app).get('/api/donantes?rol=donante').set(auth(admin.token));
    expect(filtrado.body.total).toBe(3);

    const invalido = await request(app).get('/api/donantes?porPagina=500').set(auth(admin.token));
    expect(invalido.status).toBe(400);
  });
});
