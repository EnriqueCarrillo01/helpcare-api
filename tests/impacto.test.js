const h = require('./helpers');

const { app, request, auth } = h;
h.prepararBase();

describe('GET /api/impacto', () => {
  it('cuenta solo entregas confirmadas y no expone datos personales', async () => {
    const { donante, institucion, necesidad } = await h.escenarioBase({ cantidadRequerida: 10 });
    const { body: d1 } = await h.donar(donante.token, necesidad.id, 4);
    await h.donar(donante.token, necesidad.id, 3);
    await request(app).patch(`/api/donaciones/${d1.id}`).set(auth(institucion.token)).send({ estado: 'entregada' });

    const res = await request(app).get('/api/impacto');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      centrosActivos: 1,
      institucionesActivas: 1,
      necesidadesAbiertas: 1,
      necesidadesCriticas: 1,
      necesidadesCubiertas: 0,
      donacionesEntregadas: 1,
      unidadesEntregadas: 4,
      donantesParticipantes: 1,
    });
    expect(res.body.porTipo).toEqual([{ tipo: 'agua', necesidades: 1, unidadesEntregadas: 4 }]);
    expect(res.body.ultimasEntregas[0]).toMatchObject({ cantidad: 4, centro: 'Centro de prueba' });
    expect(JSON.stringify(res.body)).not.toMatch(/@example\.com/);
  });

  it('responde con ceros cuando no hay datos', async () => {
    const res = await request(app).get('/api/impacto');
    expect(res.body).toMatchObject({ donacionesEntregadas: 0, unidadesEntregadas: 0, porTipo: [], ultimasEntregas: [] });
  });
});
