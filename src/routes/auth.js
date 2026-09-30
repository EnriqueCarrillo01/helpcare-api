const express = require('express');
const db = require('../db');
const { HttpError } = require('../errors');
const { ROLES } = require('../constantes');
const { hashPassword, comparePassword, obtenerHashRelleno } = require('../utils/password');
const { generarToken } = require('../utils/jwt');
const { validar, texto, email, password, opcion } = require('../utils/validar');
const { autenticarOpcional } = require('../middleware/auth');
const { usuarioPublico } = require('../services/formato');

function crearRutasAuth(limitadores) {
  const router = express.Router();

  // Registro de donantes e instituciones. Un administrador autenticado también
  // puede crear otros administradores (o instituciones ya aprobadas).
  router.post('/registro', limitadores.registro, autenticarOpcional, async (req, res) => {
    const datos = validar(req.body, {
      nombre: texto('El nombre', { min: 2, max: 100 }),
      email: email(),
      password: password(),
      rol: opcion('El tipo de cuenta', ROLES, { porDefecto: 'donante' }),
      organizacion: texto('El nombre de la organización', { min: 2, max: 150, opcional: true }),
    });

    const esAdmin = req.usuario && req.usuario.rol === 'administrador';
    if (datos.rol === 'administrador' && !esAdmin) {
      throw new HttpError(403, 'Solo un administrador puede crear cuentas de administrador');
    }
    if (datos.rol === 'institucion' && !datos.organizacion) {
      throw new HttpError(400, 'Datos inválidos', ['El nombre de la organización es obligatorio']);
    }

    // Una institución nueva queda en revisión hasta que un administrador la aprueba.
    const estado = datos.rol === 'institucion' && !esAdmin ? 'pendiente' : 'activo';

    let usuario;
    try {
      usuario = await db.repo().crearUsuario({
        nombre: datos.nombre,
        email: datos.email,
        organizacion: datos.rol === 'institucion' ? datos.organizacion : null,
        passwordHash: await hashPassword(datos.password),
        rol: datos.rol,
        estado,
      });
    } catch (err) {
      if (err.code === 'EMAIL_DUPLICADO') throw new HttpError(409, 'El correo ya está registrado');
      throw err;
    }

    // Si un admin crea la cuenta de otra persona, no se le entrega el token de esa cuenta.
    const respuesta = { usuario: usuarioPublico(usuario) };
    if (!esAdmin) respuesta.token = generarToken(usuario);
    res.status(201).json(respuesta);
  });

  router.post('/login', limitadores.login, async (req, res) => {
    const datos = validar(req.body, {
      email: email(),
      password: password({ nueva: false }),
    });

    const usuario = await db.repo().usuarioPorEmail(datos.email);
    // Se compara siempre (aunque el correo no exista) para no revelar por el
    // tiempo de respuesta qué correos están registrados.
    const hash = usuario ? usuario.passwordHash : await obtenerHashRelleno();
    const valido = await comparePassword(datos.password, hash);
    if (!usuario || !valido) throw new HttpError(401, 'Credenciales inválidas');
    if (usuario.estado === 'rechazado') throw new HttpError(403, 'Esta cuenta fue rechazada');

    res.json({ usuario: usuarioPublico(usuario), token: generarToken(usuario) });
  });

  return router;
}

module.exports = crearRutasAuth;
