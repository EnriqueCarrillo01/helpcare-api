const { rateLimit } = require('express-rate-limit');

// Limitadores por IP. Protegen de fuerza bruta en el login y del abuso de CPU
// (bcrypt es costoso a propósito).
function crearLimitadores(limites) {
  const base = (windowMs, limit, error) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => !limites.activos,
      message: { error },
    });

  return {
    general: base(15 * 60 * 1000, limites.general, 'Demasiadas peticiones; intenta en unos minutos'),
    login: base(15 * 60 * 1000, limites.login, 'Demasiados intentos de inicio de sesión; espera 15 minutos'),
    registro: base(60 * 60 * 1000, limites.registro, 'Demasiados registros desde esta red; intenta más tarde'),
  };
}

module.exports = { crearLimitadores };
