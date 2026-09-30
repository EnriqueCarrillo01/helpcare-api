const express = require('express');
const { bus } = require('../events');
const config = require('../config');

// Actualizaciones en tiempo real por Server-Sent Events. El navegador mantiene
// la conexión abierta (EventSource) y recibe un aviso cada vez que cambia un
// centro, una necesidad o una donación; entonces refresca lo que está viendo.
function crearRutasEventos() {
  const router = express.Router();
  const clientes = new Set();

  router.get('/', (req, res) => {
    if (clientes.size >= config.maxClientesSse) {
      res.status(503).json({ error: 'Demasiadas conexiones en tiempo real; intenta más tarde' });
      return;
    }
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 5000\n\n');

    const enviar = (evento) => res.write(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`);
    // Comentario periódico para que proxies y balanceadores no corten la conexión.
    const latido = setInterval(() => res.write(': latido\n\n'), 25000);

    clientes.add(res);
    bus.on('evento', enviar);
    req.on('close', () => {
      clearInterval(latido);
      bus.off('evento', enviar);
      clientes.delete(res);
    });
  });

  router.cerrarTodos = () => {
    for (const res of clientes) res.end();
    clientes.clear();
  };

  return router;
}

module.exports = crearRutasEventos;
