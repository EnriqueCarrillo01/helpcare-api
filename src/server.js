// Carga .env si existe (Node ≥ 20.12 lo trae integrado, sin dependencias).
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno.
}

const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const crearApp = require('./app');
const { asegurarAdmin, cargarDemo } = require('./seed');

async function iniciar() {
  if (config.jwt.usaSecretoDesarrollo) {
    logger.warn('JWT_SECRET no definido: se usa un secreto de desarrollo (nunca en producción)');
  }
  await db.init();
  await asegurarAdmin();
  if (config.seedDemo) await cargarDemo();

  const app = crearApp();
  const servidor = app.listen(config.puerto, () => {
    logger.info('HelpCare API escuchando', { puerto: config.puerto, almacenamiento: db.repo().tipo });
  });

  // Apagado ordenado: Render envía SIGTERM antes de reemplazar la instancia.
  let cerrando = false;
  const apagar = (senal) => {
    if (cerrando) return;
    cerrando = true;
    logger.info('apagando', { senal });
    app.locals.rutasEventos.cerrarTodos();
    servidor.close(async () => {
      await db.cerrar();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', apagar);
  process.on('SIGINT', apagar);
}

iniciar().catch((err) => {
  logger.error('no se pudo iniciar el servidor', { detalle: err.message });
  console.error(err);
  process.exit(1);
});
