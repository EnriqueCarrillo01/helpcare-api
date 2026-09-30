const jwt = require('jsonwebtoken');
const config = require('../config');

const OPCIONES = { issuer: config.jwt.emisor, audience: config.jwt.audiencia };

// El token es firmado (no cifrado): su contenido se puede leer, por eso solo
// lleva el id y el rol, nunca datos sensibles.
function generarToken(usuario) {
  return jwt.sign({ rol: usuario.rol }, config.jwt.secreto, {
    ...OPCIONES,
    subject: String(usuario.id),
    expiresIn: config.jwt.expiraEn,
    algorithm: 'HS256',
  });
}

function verificarToken(token) {
  return jwt.verify(token, config.jwt.secreto, { ...OPCIONES, algorithms: ['HS256'] });
}

module.exports = { generarToken, verificarToken };
