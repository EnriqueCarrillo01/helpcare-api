const h = require('./helpers');

const { app, request, auth } = h;
h.prepararBase();

const cambiar = (token, id, estado) =>
  request(app).patch(`/api/donaciones/${id}`).set(auth(token)).send({ estado });

describe('Compromiso de donación', () => {
  it('una donante se compromete y la necesidad descuenta lo que falta', async () => {
    const { donante, necesidad } = await h.escenarioBase({ cantidadRequerida: 10 });
    const res = await h.donar(donante.token, necesidad.id, 4, { nota: 'Paso el sábado' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ estado: 'comprometida', cantidad: 4, necesidad: { titulo: 'Agua embotellada' } });
    const detalle = await request(app).get(`/api/necesidades/${necesidad.id}`);
    expect(detalle.body).toMatchObject({ cantidadComprometida: 4, restante: 6 });
  });

  it('no permite comprometer más de lo que falta', async () => {
    const { donante, necesidad } = await h.escenarioBase({ cantidadRequerida: 5 });
    const res = await h.donar(donante.token, necesidad.id, 6);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Solo faltan 5/);
    await h.donar(donante.token, necesidad.id, 5);
    const lleno = await h.donar(donante.token, necesidad.id, 1);
    expect(lleno.status).toBe(409);
  });

  it('no se puede donar a una necesidad pendiente, inexistente o de un centro inactivo', async () => {
    const inst = await h.crearInstitucion();
    const donante = await h.crearDonante();
    const centro = await h.crearCentro(inst.token);
    const pendiente = await h.crearNecesidad(inst.token, centro.id);
    expect((await h.donar(donante.token, pendiente.id, 1)).status).toBe(409);
    expect((await h.donar(donante.token, 9999, 1)).status).toBe(409);

    const esc = await h.escenarioBase();
    await request(app).patch(`/api/centros/${esc.centro.id}`).set(auth(esc.institucion.token)).send({ estado: 'inactivo' });
    expect((await h.donar(esc.donante.token, esc.necesidad.id, 1)).status).toBe(409);
  });

  it('valida la cantidad y solo permite donar a cuentas donantes', async () => {
    const { donante, institucion, necesidad } = await h.escenarioBase();
    expect((await h.donar(donante.token, necesidad.id, 0)).status).toBe(400);
    expect((await h.donar(donante.token, necesidad.id, 1.5)).status).toBe(400);
    expect((await h.donar(donante.token, necesidad.id, '3; DROP TABLE')).status).toBe(400);
    expect((await h.donar(institucion.token, necesidad.id, 1)).status).toBe(403);
  });
});

describe('Seguimiento de la entrega', () => {
  it('flujo completo: comprometida → en camino → entregada confirma y cubre la necesidad', async () => {
    const { donante, institucion, necesidad } = await h.escenarioBase({ cantidadRequerida: 5 });
    const { body: d } = await h.donar(donante.token, necesidad.id, 5);

    const enCamino = await cambiar(donante.token, d.id, 'en_camino');
    expect(enCamino.body.estado).toBe('en_camino');

    // Quien dona no puede marcarla como entregada: la confirma quien la recibe.
    expect((await cambiar(donante.token, d.id, 'entregada')).status).toBe(409);

    const recibidas = await request(app).get('/api/donaciones/recibidas').set(auth(institucion.token));
    expect(recibidas.body.items[0].donante).toMatchObject({ nombre: 'Usuario donante' });

    const entregada = await cambiar(institucion.token, d.id, 'entregada');
    expect(entregada.status).toBe(200);
    expect(entregada.body.donante).toBeDefined();

    const detalle = await request(app).get(`/api/necesidades/${necesidad.id}`);
    expect(detalle.body).toMatchObject({ estado: 'cubierta', cantidadEntregada: 5 });

    // Una entrega confirmada ya no se puede cancelar.
    expect((await cambiar(institucion.token, d.id, 'cancelada')).status).toBe(409);
  });

  it('cancelar devuelve la cantidad a la necesidad', async () => {
    const { donante, necesidad } = await h.escenarioBase({ cantidadRequerida: 10 });
    const { body: d } = await h.donar(donante.token, necesidad.id, 7);
    await cambiar(donante.token, d.id, 'cancelada');
    const detalle = await request(app).get(`/api/necesidades/${necesidad.id}`);
    expect(detalle.body.restante).toBe(10);
  });

  it('la institución puede cancelar una donación que nunca llegó', async () => {
    const { donante, institucion, necesidad } = await h.escenarioBase();
    const { body: d } = await h.donar(donante.token, necesidad.id, 2);
    expect((await cambiar(institucion.token, d.id, 'cancelada')).body.estado).toBe('cancelada');
  });

  it('otra persona u otra institución no pueden tocar la donación (404)', async () => {
    const { donante, necesidad } = await h.escenarioBase();
    const intrusa = await h.crearDonante();
    const otraInst = await h.crearInstitucion();
    const { body: d } = await h.donar(donante.token, necesidad.id, 1);
    expect((await cambiar(intrusa.token, d.id, 'cancelada')).status).toBe(404);
    expect((await cambiar(otraInst.token, d.id, 'entregada')).status).toBe(404);
    expect((await cambiar(donante.token, 9999, 'cancelada')).status).toBe(404);
    expect((await cambiar(donante.token, d.id, 'comprometida')).status).toBe(400);
  });

  it('cada donante ve solo sus donaciones, con el centro donde entregarlas', async () => {
    const { donante, necesidad, centro } = await h.escenarioBase();
    const otra = await h.crearDonante();
    await h.donar(donante.token, necesidad.id, 1);
    await h.donar(otra.token, necesidad.id, 2);
    const mias = await request(app).get('/api/donaciones/mias').set(auth(donante.token));
    expect(mias.body.total).toBe(1);
    expect(mias.body.items[0].centro).toMatchObject({ id: centro.id, direccion: centro.direccion });
    expect(mias.body.items[0].donante).toBeUndefined();
  });

  it('la institución filtra las donaciones recibidas por estado', async () => {
    const { donante, institucion, necesidad } = await h.escenarioBase();
    const { body: d } = await h.donar(donante.token, necesidad.id, 1);
    await h.donar(donante.token, necesidad.id, 1);
    await cambiar(donante.token, d.id, 'en_camino');
    const res = await request(app).get('/api/donaciones/recibidas?estado=en_camino').set(auth(institucion.token));
    expect(res.body.total).toBe(1);
  });

  it('dos compromisos simultáneos no superan lo que falta', async () => {
    const { donante, necesidad } = await h.escenarioBase({ cantidadRequerida: 5 });
    const otra = await h.crearDonante();
    const [a, b] = await Promise.all([
      h.donar(donante.token, necesidad.id, 4),
      h.donar(otra.token, necesidad.id, 4),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });
});
