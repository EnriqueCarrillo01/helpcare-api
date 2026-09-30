// Piezas compartidas por las dos implementaciones del repositorio.
const ORDEN_URGENCIA = { critica: 0, media: 1, baja: 2 };

class EmailDuplicadoError extends Error {
  constructor() {
    super('El correo ya está registrado');
    this.code = 'EMAIL_DUPLICADO';
  }
}

module.exports = { ORDEN_URGENCIA, EmailDuplicadoError };
