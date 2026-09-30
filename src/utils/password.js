const bcrypt = require('bcryptjs');
const config = require('../config');

// bcrypt es una función hash (no cifrado): el resultado no se puede revertir.
async function hashPassword(plano) {
  return bcrypt.hash(plano, config.bcryptRounds);
}

async function comparePassword(plano, hash) {
  return bcrypt.compare(plano, hash);
}

// Hash de relleno: el login lo compara aunque el correo no exista, para que el
// tiempo de respuesta no revele qué correos están registrados.
let hashRelleno = null;
function obtenerHashRelleno() {
  if (!hashRelleno) hashRelleno = hashPassword('relleno-que-nunca-coincide');
  return hashRelleno;
}

module.exports = { hashPassword, comparePassword, obtenerHashRelleno };
