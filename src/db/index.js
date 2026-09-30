// Punto único de acceso a datos. Elige PostgreSQL si hay DATABASE_URL y el
// almacén en memoria si no. Las rutas llaman a repo() en cada petición.
const config = require('../config');
const logger = require('../logger');
const MemoryRepo = require('./memoryRepo');

let actual = null;

async function init({ url = config.databaseUrl, ssl = config.databaseSsl } = {}) {
  if (actual) return actual;
  if (url) {
    const PgRepo = require('./pgRepo');
    actual = PgRepo.crear(url, { ssl });
  } else {
    if (config.esProduccion) {
      logger.warn('Sin DATABASE_URL: se usa almacenamiento en memoria y los datos se perderán al reiniciar');
    }
    actual = new MemoryRepo();
  }
  await actual.migrar();
  return actual;
}

function repo() {
  if (!actual) throw new Error('La base de datos no está inicializada: llama a db.init() antes');
  return actual;
}

async function cerrar() {
  if (actual) await actual.cerrar();
  actual = null;
}

module.exports = { init, repo, cerrar };
