const express = require('express');
const db = require('../db');

const router = express.Router();

// Cifras públicas de impacto: solo agregados y entregas confirmadas, sin datos personales.
router.get('/', async (_req, res) => {
  res.json(await db.repo().estadisticas());
});

module.exports = router;
