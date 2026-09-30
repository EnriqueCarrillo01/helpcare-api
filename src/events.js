// Bus de eventos en proceso. Las rutas publican cambios y /api/eventos los
// reenvía a los navegadores por Server-Sent Events. Los eventos solo llevan
// tipo e id (nunca datos personales); el cliente vuelve a pedir lo que necesite.
const { EventEmitter } = require('node:events');

const bus = new EventEmitter();
bus.setMaxListeners(0);

function publicar(tipo, datos = {}) {
  bus.emit('evento', { tipo, ...datos, fecha: new Date().toISOString() });
}

module.exports = { bus, publicar };
