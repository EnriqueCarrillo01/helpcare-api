const http = require('node:http');
const h = require('./helpers');
const crearApp = require('../src/app');
const { publicar } = require('../src/events');

h.prepararBase();

// Abre /api/eventos, espera a leer el texto indicado y cierra la conexión.
function escuchar(servidor, hasta, alConectar) {
  return new Promise((resolve, reject) => {
    const { port } = servidor.address();
    const req = http.get({ port, path: '/api/eventos' }, (res) => {
      let texto = '';
      res.setEncoding('utf8');
      res.on('data', (trozo) => {
        texto += trozo;
        if (texto.includes('retry:') && alConectar) {
          const f = alConectar;
          alConectar = null;
          f();
        }
        if (texto.includes(hasta)) {
          req.destroy();
          resolve({ headers: res.headers, texto });
        }
      });
    });
    req.on('error', (err) => (err.code === 'ECONNRESET' ? null : reject(err)));
  });
}

describe('GET /api/eventos (Server-Sent Events)', () => {
  let servidor;
  let app;
  beforeAll((listo) => {
    app = crearApp();
    servidor = app.listen(0, listo);
  });
  afterAll((listo) => {
    app.locals.rutasEventos.cerrarTodos();
    servidor.close(listo);
  });

  it('entrega en tiempo real los cambios publicados', async () => {
    const { headers, texto } = await escuchar(servidor, 'event: necesidad', () =>
      publicar('necesidad', { id: 7 })
    );
    expect(headers['content-type']).toMatch(/text\/event-stream/);
    expect(texto).toMatch(/"id":7/);
  });

  it('rechaza conexiones por encima del máximo configurado', async () => {
    const config = require('../src/config');
    const original = config.maxClientesSse;
    config.maxClientesSse = 0;
    const res = await h.request(servidor).get('/api/eventos');
    config.maxClientesSse = original;
    expect(res.status).toBe(503);
  });
});
