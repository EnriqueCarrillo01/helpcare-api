const { verificarToken } = require('../utils/jwt');
const { HttpError } = require('../errors');
const db = require('../db');

function leerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

// Verifica el token y carga al usuario desde la base de datos en cada petición.
// Así un cambio de rol, una aprobación o una cuenta eliminada surten efecto de
// inmediato, sin esperar a que el token expire.
async function cargarUsuario(token) {
  let payload;
  try {
    payload = verificarToken(token);
  } catch (err) {
    throw new HttpError(401, 'Token inválido o expirado');
  }
  const id = Number(payload.sub);
  const usuario = Number.isSafeInteger(id) ? await db.repo().usuarioPorId(id) : null;
  if (!usuario) throw new HttpError(401, 'La cuenta de este token ya no existe');
  if (usuario.estado === 'rechazado') throw new HttpError(403, 'Esta cuenta fue rechazada');
  return usuario;
}

async function autenticar(req, _res, next) {
  const token = leerToken(req);
  if (!token) throw new HttpError(401, 'Token no proporcionado');
  req.usuario = await cargarUsuario(token);
  next();
}

// Si llega un token, debe ser válido (401 si no): un admin con sesión vencida
// debe enterarse, no terminar creando por error una cuenta con menos permisos.
async function autenticarOpcional(req, _res, next) {
  const token = leerToken(req);
  if (token) req.usuario = await cargarUsuario(token);
  next();
}

function autorizar(...rolesPermitidos) {
  return (req, _res, next) => {
    if (!req.usuario) throw new HttpError(401, 'No autenticado');
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      throw new HttpError(403, 'No tienes permisos para esta acción');
    }
    next();
  };
}

// Las instituciones pueden entrar mientras se revisa su registro, pero no
// publicar centros ni necesidades hasta que un administrador las apruebe.
function requiereCuentaActiva(req, _res, next) {
  if (req.usuario.estado !== 'activo') {
    throw new HttpError(403, 'Tu cuenta está en revisión; un administrador debe aprobarla primero');
  }
  next();
}

module.exports = { autenticar, autenticarOpcional, autorizar, requiereCuentaActiva };
