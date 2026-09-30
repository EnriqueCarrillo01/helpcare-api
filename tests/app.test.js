const h = require('./helpers');
const crearApp = require('../src/app');
const db = require('../src/db');

const { app, request } = h;
h.prepararBase();

describe('Salud del servicio', () => {
  const commitOriginal = process.env.RENDER_GIT_COMMIT;
  afterEach(() => {
    if (commitOriginal === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = commitOriginal;
  });

  it('GET /health responde ok e indica "local" fuera de Render', async () => {
    delete process.env.RENDER_GIT_COMMIT;
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok', commit: 'local' });
  });

  it('GET /health devuelve el commit desplegado cuando Render lo informa', async () => {
    process.env.RENDER_GIT_COMMIT = 'abc123';
    expect((await request(app).get('/health')).body.commit).toBe('abc123');
  });

  it('GET /ready confirma la base de datos y responde 503 si falla', async () => {
    const ok = await request(app).get('/ready');
    expect(ok.status).toBe(200);
    expect(['memoria', 'postgres']).toContain(ok.body.almacenamiento);

    const spy = jest.spyOn(db.repo(), 'ping').mockRejectedValue(new Error('caída'));
    const mal = await request(app).get('/ready');
    spy.mockRestore();
    expect(mal.status).toBe(503);
  });
});

describe('Seguridad HTTP (alertas de OWASP ZAP)', () => {
  it('envía CSP, HSTS, nosniff, no-store y oculta X-Powered-By', async () => {
    const res = await request(app).get('/api/impacto');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('CORS: solo autoriza los orígenes configurados', async () => {
    const restringida = crearApp({ corsOrigins: ['https://helpcare.example'] });
    const permitido = await request(restringida).get('/health').set('Origin', 'https://helpcare.example');
    expect(permitido.headers['access-control-allow-origin']).toBe('https://helpcare.example');
    const ajeno = await request(restringida).get('/health').set('Origin', 'https://malicioso.example');
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();

    const abierta = crearApp({ corsOrigins: ['*'] });
    const cualquiera = await request(abierta).get('/health').set('Origin', 'https://x.example');
    expect(cualquiera.headers['access-control-allow-origin']).toBe('https://x.example');
  });
});

describe('Errores', () => {
  it('JSON mal formado → 400, cuerpo enorme → 413, ruta inexistente → 404', async () => {
    const malo = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(malo.status).toBe(400);

    const enorme = await request(app).post('/api/auth/registro').send({ nombre: 'x'.repeat(30000) });
    expect(enorme.status).toBe(413);

    expect((await request(app).get('/api/no-existe')).status).toBe(404);
  });

  it('un error inesperado responde 500 sin filtrar detalles internos', async () => {
    const spy = jest.spyOn(db.repo(), 'estadisticas').mockRejectedValue(new Error('detalle interno'));
    const res = await request(app).get('/api/impacto');
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno del servidor' });
  });
});
