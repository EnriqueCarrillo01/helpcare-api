// Cómo se ve cada entidad hacia fuera. Nunca se expone passwordHash, y el
// seguimiento público de una necesidad no incluye quién donó.

const usuarioPublico = (u) => ({
  id: u.id,
  nombre: u.nombre,
  email: u.email,
  organizacion: u.organizacion,
  rol: u.rol,
  estado: u.estado,
  creadoEn: u.creadoEn,
});

const centroResumen = (c) => ({
  id: c.id,
  nombre: c.nombre,
  direccion: c.direccion,
  lat: c.lat,
  lng: c.lng,
  horario: c.horario,
});

const centroPublico = (c, institucion) => ({
  ...centroResumen(c),
  estado: c.estado,
  institucion: institucion ? { id: institucion.id, nombre: institucion.organizacion || institucion.nombre } : null,
});

const necesidadPublica = (n, centro) => ({
  id: n.id,
  titulo: n.titulo,
  descripcion: n.descripcion,
  tipo: n.tipo,
  unidad: n.unidad,
  urgencia: n.urgencia,
  estado: n.estado,
  cantidadRequerida: n.cantidadRequerida,
  cantidadComprometida: n.cantidadComprometida,
  cantidadEntregada: n.cantidadEntregada,
  restante: Math.max(0, n.cantidadRequerida - n.cantidadComprometida),
  creadoEn: n.creadoEn,
  actualizadoEn: n.actualizadoEn,
  centro: centro ? centroResumen(centro) : null,
});

const donacionPublica = (d) => ({
  id: d.id,
  necesidadId: d.necesidadId,
  cantidad: d.cantidad,
  estado: d.estado,
  nota: d.nota,
  creadoEn: d.creadoEn,
  actualizadoEn: d.actualizadoEn,
});

module.exports = { usuarioPublico, centroPublico, centroResumen, necesidadPublica, donacionPublica };
