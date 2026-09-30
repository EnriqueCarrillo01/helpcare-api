const h = require('./helpers');

const { app, request, auth } = h;
h.prepararBase();

// Villahermosa (centro) y un punto a ~100 km (Coatzacoalcos aprox.).
const VILLAHERMOSA = { lat: 17.9892, lng: -92.9281 };
const LEJOS = { lat: 18.14, lng: -94.45 };

describe('Centros de acopio', () => {
  it('valida coordenadas y campos obligatorios', async () => {
    const inst = await h.crearInstitucion();
    const res = await request(app)
      .post('/api/centros')
      .set(auth(inst.token))
      .send({ nombre: 'X', direccion: 'corta', lat: 120, lng: 'oeste' });
    expect(res.status).toBe(400);
    expect(res.body.errores.length).toBeGreaterThanOrEqual(3);
  });

  it('una persona donante no puede crear centros', async () => {
    const donante = await h.crearDonante();
    const res = await request(app).post('/api/centros').set(auth(donante.token)).send({});
    expect(res.status).toBe(403);
  });

  it('el mapa filtra por radio, ordena por distancia y muestra necesidades abiertas', async () => {
    const admin = await h.crearAdmin();
    const inst = await h.crearInstitucion();
    const cerca = await h.crearCentro(inst.token, { nombre: 'Cerca', ...VILLAHERMOSA });
    const lejos = await h.crearCentro(inst.token, { nombre: 'Lejos', ...LEJOS });
    const n = await h.crearNecesidad(inst.token, cerca.id);
    await h.aprobarNecesidad(admin.token, n.id);

    const radio = await request(app).get('/api/centros').query({ lat: 17.99, lng: -92.93, radioKm: 20 });
    expect(radio.status).toBe(200);
    expect(radio.body.map((c) => c.nombre)).toEqual(['Cerca']);
    expect(radio.body[0]).toMatchObject({
      urgenciaMaxima: 'critica',
      institucion: { nombre: 'Organización de prueba' },
    });
    expect(radio.body[0].distanciaKm).toBeLessThan(1);
    expect(radio.body[0].necesidades).toHaveLength(1);

    const amplio = await request(app).get('/api/centros').query({ lat: 17.99, lng: -92.93, radioKm: 500 });
    expect(amplio.body.map((c) => c.id)).toEqual([cerca.id, lejos.id]);

    // Sin coordenadas: primero los de urgencia más alta.
    const todos = await request(app).get('/api/centros');
    expect(todos.body.map((c) => c.nombre)).toEqual(['Cerca', 'Lejos']);
    expect(todos.body[1].distanciaKm).toBeNull();
  });

  it('filtra por tipo y urgencia de necesidad', async () => {
    const { centro } = await h.escenarioBase({ tipo: 'medicinas', urgencia: 'media' });
    expect((await request(app).get('/api/centros?tipo=medicinas')).body.map((c) => c.id)).toEqual([centro.id]);
    expect((await request(app).get('/api/centros?tipo=ropa')).body).toHaveLength(0);
    expect((await request(app).get('/api/centros?urgencia=critica')).body).toHaveLength(0);
  });

  it('exige latitud y longitud juntas', async () => {
    expect((await request(app).get('/api/centros?lat=17.9')).status).toBe(400);
    expect((await request(app).get('/api/centros?lat=17.9&lng=abc')).status).toBe(400);
  });

  it('solo la institución dueña edita su centro; al desactivarlo desaparece del mapa', async () => {
    const inst = await h.crearInstitucion();
    const otra = await h.crearInstitucion();
    const centro = await h.crearCentro(inst.token);

    const ajena = await request(app).patch(`/api/centros/${centro.id}`).set(auth(otra.token)).send({ horario: 'x' });
    expect(ajena.status).toBe(404);

    const vacio = await request(app).patch(`/api/centros/${centro.id}`).set(auth(inst.token)).send({});
    expect(vacio.status).toBe(400);

    const res = await request(app)
      .patch(`/api/centros/${centro.id}`)
      .set(auth(inst.token))
      .send({ estado: 'inactivo', horario: 'Cerrado temporalmente' });
    expect(res.body).toMatchObject({ estado: 'inactivo', horario: 'Cerrado temporalmente' });
    expect((await request(app).get('/api/centros')).body).toHaveLength(0);

    // El público ya no lo ve, pero su institución sí.
    expect((await request(app).get(`/api/centros/${centro.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/centros/${centro.id}`).set(auth(inst.token))).status).toBe(200);
  });

  it('detalle público y listado propio de la institución', async () => {
    const { centro, institucion } = await h.escenarioBase();
    const detalle = await request(app).get(`/api/centros/${centro.id}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.necesidades).toHaveLength(1);

    const mios = await request(app).get('/api/centros/mios').set(auth(institucion.token));
    expect(mios.body).toHaveLength(1);
    expect(mios.body[0].necesidadesActivas).toBe(1);

    expect((await request(app).get('/api/centros/999')).status).toBe(404);
  });
});
