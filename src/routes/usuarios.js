const express = require('express');
const db = require('../db');
const { autenticar, autorizar } = require('../middleware/auth');
const { paginacion, validar, opcion } = require('../utils/validar');
const { ROLES, ESTADOS_USUARIO } = require('../constantes');
const { usuarioPublico } = require('../services/formato');

// Montado en /api/donantes (ruta original del módulo) y en /api/usuarios.
const router = express.Router();

router.get('/perfil', autenticar, (req, res) => {
  res.json(usuarioPublico(req.usuario));
});

// Listado de cuentas, paginado. Solo administración.
router.get('/', autenticar, autorizar('administrador'), async (req, res) => {
  const { pagina, porPagina, limit, offset } = paginacion(req.query);
  const filtros = validar(req.query, {
    rol: opcion('El rol', ROLES, { opcional: true }),
    estado: opcion('El estado', ESTADOS_USUARIO, { opcional: true }),
  });
  const { items, total } = await db.repo().listarUsuarios({ ...filtros, limit, offset });
  res.json({ items: items.map(usuarioPublico), total, pagina, porPagina });
});

module.exports = router;
