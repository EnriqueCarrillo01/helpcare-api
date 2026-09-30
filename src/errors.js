// Error con código HTTP. Las rutas lo lanzan y el manejador central lo traduce.
class HttpError extends Error {
  constructor(status, mensaje, errores) {
    super(mensaje);
    this.status = status;
    this.errores = errores;
  }
}

const noEncontrado = (que = 'Recurso') => new HttpError(404, `${que} no encontrado`);

module.exports = { HttpError, noEncontrado };
