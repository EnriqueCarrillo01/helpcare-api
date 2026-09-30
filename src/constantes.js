// Catálogos de valores válidos, compartidos por validadores, base de datos y pruebas.
module.exports = {
  ROLES: ['donante', 'institucion', 'administrador'],
  ESTADOS_USUARIO: ['activo', 'pendiente', 'rechazado'],
  ESTADOS_CENTRO: ['activo', 'inactivo'],
  TIPOS_NECESIDAD: [
    'alimentos',
    'agua',
    'ropa',
    'higiene',
    'medicinas',
    'servicios_medicos',
    'voluntariado',
    'otro',
  ],
  URGENCIAS: ['baja', 'media', 'critica'],
  ESTADOS_NECESIDAD: ['pendiente', 'abierta', 'cubierta', 'rechazada', 'cerrada'],
  ESTADOS_DONACION: ['comprometida', 'en_camino', 'entregada', 'cancelada'],
};
