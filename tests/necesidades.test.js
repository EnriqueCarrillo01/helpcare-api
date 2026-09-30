const h = require('./helpers');

const { app, request, auth } = h;
h.prepararBase();

describe('Catálogo de necesidades', () => {
  it('muestra necesidades abiertas con su centro y filtra por tipo y urgencia', async () => {
    const { institucion, admin, centro } = await h.escenarioBase();
    const n2 = await h.crearNecesidad(institucion.token, centro.id, {
      titulo: 'Cobijas',
      tipo: 'ropa',
      unidad: 'piezas',
      urgencia: 'baja',
    });
    await h.aprobarNecesidad(admin.token, n2.id);

    const todas = await request(app).get('/api/necesidades');
    expect(todas.body.total).toBe(2);
    // Primero lo crítico.
    expect(todas.body.items[0].urgencia).toBe('critica');
    expect(todas.body.items[0].centro).toMatchObject({ id: centro.id, lat: 17.9892 });

    const ropa = await request(app).get('/api/necesidades?tipo=ropa');
    expect(ropa.body.items.map((n) => n.titulo)).toEqual(['Cobijas']);
    const baja = await request(app).get(`/api/necesidades?urgencia=baja&centroId=${centro.id}`);
    expect(baja.body.total).toBe(1);
    expect((await request(app).get('/api/necesidades?tipo=juguetes')).status).toBe(400);
  });

  it('el detalle incluye el seguimiento de donaciones sin datos del donante', async () => {
    const { donante, necesidad } = await h.escenarioBase();
    await h.donar(donante.token, necesidad.id, 3, { nota: 'Llevo en la tarde' });
    const res = await request(app).get(`/api/necesidades/${necesidad.id}`);
    expect(res.status).toBe(200);
    expect(res.body.seguimiento).toHaveLength(1);
    expect(res.body.seguimiento[0]).toEqual(
      expect.not.objectContaining({ donanteId: expect.anything(), nota: expect.anything() })
    );
    expect(res.body.institucion.nombre).toBe('Organización de prueba');
  });

  it('no permite publicar en un centro ajeno o inactivo', async () => {
    const inst = await h.crearInstitucion();
    const otra = await h.crearInstitucion();
    const centro = await h.crearCentro(inst.token);
    const ajeno = await request(app)
      .post('/api/necesidades')
      .set(auth(otra.token))
      .send({ centroId: centro.id, titulo: 'Agua', tipo: 'agua', unidad: 'L', cantidadRequerida: 5, urgencia: 'media' });
    expect(ajeno.status).toBe(400);

    await request(app).patch(`/api/centros/${centro.id}`).set(auth(inst.token)).send({ estado: 'inactivo' });
    await expect(h.crearNecesidad(inst.token, centro.id)).rejects.toThrow(/409/);
  });

  it('la institución ve todas sus necesidades, en cualquier estado', async () => {
    const inst = await h.crearInstitucion();
    const centro = await h.crearCentro(inst.token);
    await h.crearNecesidad(inst.token, centro.id);
    const res = await request(app).get('/api/necesidades/mias').set(auth(inst.token));
    expect(res.body.items[0].estado).toBe('pendiente');
    // Y puede ver el detalle aunque siga pendiente.
    const detalle = await request(app).get(`/api/necesidades/${res.body.items[0].id}`).set(auth(inst.token));
    expect(detalle.status).toBe(200);
    const filtrado = await request(app).get('/api/necesidades/mias?estado=abierta').set(auth(inst.token));
    expect(filtrado.body.total).toBe(0);
  });

  it('una necesidad de un centro desactivado deja de ofrecerse', async () => {
    const { institucion, centro } = await h.escenarioBase();
    await request(app).patch(`/api/centros/${centro.id}`).set(auth(institucion.token)).send({ estado: 'inactivo' });
    const res = await request(app).get('/api/necesidades');
    expect(res.body.items).toHaveLength(0);
  });
});

describe('Edición de necesidades', () => {
  it('permite ajustar urgencia y cantidad, pero no por debajo de lo comprometido', async () => {
    const { institucion, donante, necesidad } = await h.escenarioBase({ cantidadRequerida: 10 });
    await h.donar(donante.token, necesidad.id, 6);

    const baja = await request(app)
      .patch(`/api/necesidades/${necesidad.id}`)
      .set(auth(institucion.token))
      .send({ cantidadRequerida: 5 });
    expect(baja.status).toBe(409);

    const ok = await request(app)
      .patch(`/api/necesidades/${necesidad.id}`)
      .set(auth(institucion.token))
      .send({ cantidadRequerida: 20, urgencia: 'media', descripcion: 'Botellas de 1.5 L' });
    expect(ok.body).toMatchObject({ cantidadRequerida: 20, urgencia: 'media', restante: 14 });
  });

  it('marca como cubierta si la nueva cantidad ya se entregó', async () => {
    const { institucion, donante, necesidad } = await h.escenarioBase({ cantidadRequerida: 10 });
    const d = await h.donar(donante.token, necesidad.id, 6);
    await request(app).patch(`/api/donaciones/${d.body.id}`).set(auth(institucion.token)).send({ estado: 'entregada' });
    const res = await request(app)
      .patch(`/api/necesidades/${necesidad.id}`)
      .set(auth(institucion.token))
      .send({ cantidadRequerida: 6 });
    expect(res.body.estado).toBe('cubierta');
  });

  it('permite cerrarla y después ya no se puede modificar', async () => {
    const { institucion, necesidad } = await h.escenarioBase();
    const cerrada = await request(app)
      .patch(`/api/necesidades/${necesidad.id}`)
      .set(auth(institucion.token))
      .send({ estado: 'cerrada' });
    expect(cerrada.body.estado).toBe('cerrada');
    const otra = await request(app)
      .patch(`/api/necesidades/${necesidad.id}`)
      .set(auth(institucion.token))
      .send({ urgencia: 'baja' });
    expect(otra.status).toBe(409);
  });

  it('rechaza cambios vacíos y a instituciones ajenas', async () => {
    const { institucion, necesidad } = await h.escenarioBase();
    const otra = await h.crearInstitucion();
    const vacio = await request(app).patch(`/api/necesidades/${necesidad.id}`).set(auth(institucion.token)).send({});
    expect(vacio.status).toBe(400);
    const ajena = await request(app)
      .patch(`/api/necesidades/${necesidad.id}`)
      .set(auth(otra.token))
      .send({ urgencia: 'baja' });
    expect(ajena.status).toBe(404);
    expect((await request(app).get('/api/necesidades/424242')).status).toBe(404);
  });
});
