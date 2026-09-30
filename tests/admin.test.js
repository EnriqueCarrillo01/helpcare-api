const h = require('./helpers');

const { app, request, auth } = h;
h.prepararBase();

describe('Aprobación de instituciones', () => {
  it('lista pendientes y permite aprobar o rechazar', async () => {
    const admin = await h.crearAdmin();
    const inst = await h.crearInstitucion('pendiente');

    const lista = await request(app).get('/api/admin/instituciones').set(auth(admin.token));
    expect(lista.body.items.map((u) => u.id)).toEqual([inst.usuario.id]);

    const res = await request(app)
      .patch(`/api/admin/instituciones/${inst.usuario.id}`)
      .set(auth(admin.token))
      .send({ estado: 'activo' });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('activo');
  });

  it('una institución pendiente no puede publicar centros hasta ser aprobada', async () => {
    const admin = await h.crearAdmin();
    const inst = await h.crearInstitucion('pendiente');
    const intento = await request(app)
      .post('/api/centros')
      .set(auth(inst.token))
      .send({ nombre: 'Centro', direccion: 'Calle 1, Centro', lat: 18, lng: -92.9 });
    expect(intento.status).toBe(403);

    await request(app)
      .patch(`/api/admin/instituciones/${inst.usuario.id}`)
      .set(auth(admin.token))
      .send({ estado: 'activo' });
    await expect(h.crearCentro(inst.token)).resolves.toHaveProperty('id');
  });

  it('una institución rechazada pierde el acceso', async () => {
    const admin = await h.crearAdmin();
    const inst = await h.crearInstitucion('pendiente');
    await request(app)
      .patch(`/api/admin/instituciones/${inst.usuario.id}`)
      .set(auth(admin.token))
      .send({ estado: 'rechazado' });
    expect((await request(app).get('/api/usuarios/perfil').set(auth(inst.token))).status).toBe(403);
  });

  it('valida la decisión y que el id sea de una institución', async () => {
    const admin = await h.crearAdmin();
    const donante = await h.crearDonante();
    const inst = await h.crearInstitucion('pendiente');
    const r1 = await request(app)
      .patch(`/api/admin/instituciones/${inst.usuario.id}`)
      .set(auth(admin.token))
      .send({ estado: 'quizas' });
    expect(r1.status).toBe(400);
    const r2 = await request(app)
      .patch(`/api/admin/instituciones/${donante.usuario.id}`)
      .set(auth(admin.token))
      .send({ estado: 'activo' });
    expect(r2.status).toBe(404);
    const r3 = await request(app).patch('/api/admin/instituciones/abc').set(auth(admin.token)).send({ estado: 'activo' });
    expect(r3.status).toBe(404);
  });

  it('solo administración accede a /api/admin', async () => {
    const inst = await h.crearInstitucion();
    expect((await request(app).get('/api/admin/instituciones').set(auth(inst.token))).status).toBe(403);
  });
});

describe('Aprobación de necesidades (causas de ayuda)', () => {
  it('una necesidad nueva queda pendiente y no aparece en el catálogo público', async () => {
    const inst = await h.crearInstitucion();
    const centro = await h.crearCentro(inst.token);
    const n = await h.crearNecesidad(inst.token, centro.id);
    expect(n.estado).toBe('pendiente');
    const publico = await request(app).get('/api/necesidades');
    expect(publico.body.items).toHaveLength(0);
    expect((await request(app).get(`/api/necesidades/${n.id}`)).status).toBe(404);
  });

  it('el admin la ve con su institución, la aprueba y ya no puede revisarla dos veces', async () => {
    const admin = await h.crearAdmin();
    const inst = await h.crearInstitucion();
    const centro = await h.crearCentro(inst.token);
    const n = await h.crearNecesidad(inst.token, centro.id);

    const pendientes = await request(app).get('/api/admin/necesidades').set(auth(admin.token));
    expect(pendientes.body.items[0]).toMatchObject({
      id: n.id,
      institucion: { nombre: 'Organización de prueba' },
      centro: { id: centro.id },
    });

    const aprobada = await h.aprobarNecesidad(admin.token, n.id);
    expect(aprobada.estado).toBe('abierta');

    const otraVez = await request(app)
      .patch(`/api/admin/necesidades/${n.id}`)
      .set(auth(admin.token))
      .send({ estado: 'rechazada' });
    expect(otraVez.status).toBe(409);
  });

  it('permite rechazar y responde 404 si no existe', async () => {
    const admin = await h.crearAdmin();
    const inst = await h.crearInstitucion();
    const centro = await h.crearCentro(inst.token);
    const n = await h.crearNecesidad(inst.token, centro.id);
    const r = await request(app)
      .patch(`/api/admin/necesidades/${n.id}`)
      .set(auth(admin.token))
      .send({ estado: 'rechazada' });
    expect(r.body.estado).toBe('rechazada');
    const r404 = await request(app)
      .patch('/api/admin/necesidades/9999')
      .set(auth(admin.token))
      .send({ estado: 'abierta' });
    expect(r404.status).toBe(404);
  });
});
