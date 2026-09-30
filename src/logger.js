// Logger mínimo en formato JSON (una línea por evento), legible por Render y
// por cualquier agregador de logs. En pruebas queda en silencio.
const config = require('./config');

function escribir(nivel, mensaje, datos) {
  if (config.esTest) return;
  const linea = JSON.stringify({ nivel, mensaje, fecha: new Date().toISOString(), ...datos });
  if (nivel === 'error' || nivel === 'warn') console.error(linea);
  else console.log(linea);
}

module.exports = {
  info: (m, d) => escribir('info', m, d),
  warn: (m, d) => escribir('warn', m, d),
  error: (m, d) => escribir('error', m, d),
};
