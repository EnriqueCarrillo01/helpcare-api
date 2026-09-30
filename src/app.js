const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('node:crypto');

const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const { HttpError } = require('./errors');
const { crearLimitadores } = require('./middleware/limites');
const crearRutasAuth = require('./routes/auth');
const rutasUsuarios = require('./routes/usuarios');
const rutasAdmin = require('./routes/admin');
const rutasCentros = require('./routes/centros');
const rutasNecesidades = require('./routes/necesidades');
const rutasDonaciones = require('./routes/donaciones');
const rutasImpacto = require('./routes/impacto');
const crearRutasEventos = require('./routes/eventos');

// CORS: en producción solo se aceptan los orígenes de CORS_ORIGIN. En
// desarrollo, si no se configuró, se acepta cualquiera para no estorbar.
function opcionesCors(origenes) {
  if (origenes.includes('*')) return { origin: true };
  if (origenes.length > 0) return { origin: origenes };
  if (config.esProduccion) {
    logger.warn('CORS_ORIGIN no está definido: el navegador bloqueará las peticiones del frontend');
    return { origin: false };
  }
  return { origin: true };
}

function crearApp(opciones = {}) {
  const limites = { ...config.limites, ...opciones.limites };
  const limitadores = crearLimitadores(limites);
  const rutasEventos = crearRutasEventos();

  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.locals.rutasEventos = rutasEventos;

  // Encabezados de seguridad (CSP, HSTS, X-Content-Type-Options, oculta X-Powered-By...).
  // Corrigen las alertas que reportó OWASP ZAP.
  app.use(helmet());
  app.use(cors(opcionesCors(opciones.corsOrigins || config.corsOrigins)));
  app.use(express.json({ limit: '20kb' }));
  // Las respuestas de la API pueden llevar datos personales: que no se guarden en caché.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Id de petición para relacionar logs, y registro de cada respuesta.
  app.use((req, res, next) => {
    const id = crypto.randomUUID();
    res.set('X-Request-Id', id);
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/health') return;
      logger.info('peticion', {
        id,
        metodo: req.method,
        ruta: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Number(process.hrtime.bigint() - inicio) / 1e6,
      });
    });
    next();
  });

  // RENDER_GIT_COMMIT lo define Render en cada despliegue; el pipeline lo usa
  // para confirmar que el entorno de prueba ya sirve la versión nueva.
  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', commit: process.env.RENDER_GIT_COMMIT || 'local' })
  );

  // Preparado para recibir tráfico: la base de datos responde.
  app.get('/ready', async (_req, res) => {
    try {
      await db.repo().ping();
      res.json({ status: 'ok', almacenamiento: db.repo().tipo });
    } catch (err) {
      logger.error('ready: base de datos no disponible', { detalle: err.message });
      res.status(503).json({ status: 'error', error: 'Base de datos no disponible' });
    }
  });

  app.use('/api/eventos', rutasEventos);
  app.use('/api', limitadores.general);
  app.use('/api/auth', crearRutasAuth(limitadores));
  app.use('/api/donantes', rutasUsuarios);
  app.use('/api/usuarios', rutasUsuarios);
  app.use('/api/admin', rutasAdmin);
  app.use('/api/centros', rutasCentros);
  app.use('/api/necesidades', rutasNecesidades);
  app.use('/api/donaciones', rutasDonaciones);
  app.use('/api/impacto', rutasImpacto);

  app.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

  // Manejo centralizado de errores. Express 5 también envía aquí los errores
  // de funciones async, así que una excepción ya no puede tumbar el proceso.
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      const cuerpo = { error: err.message };
      if (err.errores) cuerpo.errores = err.errores;
      return res.status(err.status).json(cuerpo);
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'La petición es demasiado grande' });
    }
    logger.error('error no controlado', { ruta: req.originalUrl, detalle: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

module.exports = crearApp;
