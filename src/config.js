// Toda la configuración se lee aquí, una sola vez, desde variables de entorno.
// cargarConfig es una función pura para poder probarla con entornos simulados.

const SECRETO_DESARROLLO = 'helpcare_secreto_solo_para_desarrollo_local_no_usar';

function lista(valor) {
  return (valor || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function numero(valor, porDefecto, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(valor);
  if (valor === undefined || valor === '' || !Number.isFinite(n)) return porDefecto;
  return Math.min(Math.max(n, min), max);
}

function cargarConfig(env = process.env) {
  const entorno = env.NODE_ENV || 'development';
  const esTest = entorno === 'test';
  // Render define RENDER=true; se trata como producción aunque no se defina NODE_ENV.
  const esProduccion = entorno === 'production' || env.RENDER === 'true';

  let secreto = env.JWT_SECRET;
  if (!secreto || secreto.length < 32) {
    if (esProduccion) {
      throw new Error(
        'JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres'
      );
    }
    secreto = SECRETO_DESARROLLO;
  }

  return {
    entorno,
    esTest,
    esProduccion,
    puerto: numero(env.PORT, 3000),
    jwt: {
      secreto,
      usaSecretoDesarrollo: secreto === SECRETO_DESARROLLO,
      expiraEn: env.JWT_EXPIRES_IN || '2h',
      emisor: 'helpcare-api',
      audiencia: 'helpcare-app',
    },
    bcryptRounds: numero(env.BCRYPT_ROUNDS, esTest ? 4 : 10, { min: 4, max: 15 }),
    databaseUrl: env.DATABASE_URL || null,
    databaseSsl: env.DATABASE_SSL === 'true',
    corsOrigins: lista(env.CORS_ORIGIN),
    // Render (y casi cualquier PaaS) pone un proxy delante; sin esto todas las
    // peticiones parecerían venir de la misma IP y el rate limit no serviría.
    trustProxy: numero(env.TRUST_PROXY, env.RENDER === 'true' ? 1 : 0, { min: 0, max: 5 }),
    limites: {
      activos: !esTest,
      login: numero(env.RATE_LIMIT_LOGIN, 10, { min: 1 }),
      registro: numero(env.RATE_LIMIT_REGISTRO, 20, { min: 1 }),
      general: numero(env.RATE_LIMIT_GENERAL, 300, { min: 1 }),
    },
    admin: {
      email: env.ADMIN_EMAIL || null,
      password: env.ADMIN_PASSWORD || null,
      nombre: env.ADMIN_NOMBRE || 'Administración HelpCare',
    },
    seedDemo: env.SEED_DEMO === 'true',
    maxClientesSse: numero(env.MAX_SSE_CLIENTS, 500, { min: 1 }),
  };
}

const config = cargarConfig();

module.exports = config;
module.exports.cargarConfig = cargarConfig;
