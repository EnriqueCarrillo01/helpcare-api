// Reglas de negocio de las donaciones. Todo cambio de cantidades ocurre dentro
// de una transacción con la necesidad bloqueada, para que dos personas no
// puedan comprometer al mismo tiempo más de lo que falta.
const db = require('../db');
const { HttpError, noEncontrado } = require('../errors');

// Quién puede mover una donación de un estado a otro.
//  - Quien dona avisa que va en camino, o cancela.
//  - La institución que la recibe confirma la entrega (esto es lo que hace la
//    entrega verificable: no basta con que el donante diga que la llevó), o la
//    cancela si nunca llegó.
const TRANSICIONES = {
  donante: {
    comprometida: ['en_camino', 'cancelada'],
    en_camino: ['cancelada'],
  },
  institucion: {
    comprometida: ['entregada', 'cancelada'],
    en_camino: ['entregada', 'cancelada'],
  },
};

async function crearDonacion(donante, { necesidadId, cantidad, nota }) {
  return db.repo().transaccion(async (tx) => {
    const necesidad = await tx.necesidadPorId(necesidadId, { bloquear: true });
    if (!necesidad || necesidad.estado !== 'abierta') {
      throw new HttpError(409, 'Esta necesidad no está recibiendo donaciones');
    }
    const centro = await tx.centroPorId(necesidad.centroId);
    if (centro.estado !== 'activo') {
      throw new HttpError(409, 'El centro de acopio no está recibiendo donaciones por ahora');
    }
    const restante = necesidad.cantidadRequerida - necesidad.cantidadComprometida;
    if (restante <= 0) throw new HttpError(409, 'Esta necesidad ya tiene suficientes compromisos');
    if (cantidad > restante) {
      throw new HttpError(409, `Solo faltan ${restante} ${necesidad.unidad}; ajusta la cantidad`);
    }
    const donacion = await tx.crearDonacion({
      necesidadId,
      donanteId: donante.id,
      cantidad,
      estado: 'comprometida',
      nota: nota || null,
    });
    await tx.actualizarNecesidad(necesidadId, {
      cantidadComprometida: necesidad.cantidadComprometida + cantidad,
    });
    return { donacion, necesidad, centro };
  });
}

async function cambiarEstado(usuario, donacionId, nuevoEstado) {
  return db.repo().transaccion(async (tx) => {
    const donacion = await tx.donacionPorId(donacionId, { bloquear: true });
    if (!donacion) throw noEncontrado('Donación');
    const necesidad = await tx.necesidadPorId(donacion.necesidadId, { bloquear: true });
    const centro = await tx.centroPorId(necesidad.centroId);

    let papel = null;
    if (usuario.rol === 'donante' && donacion.donanteId === usuario.id) papel = 'donante';
    if (usuario.rol === 'institucion' && centro.institucionId === usuario.id) papel = 'institucion';
    // A quien no participa se le responde 404 para no revelar que existe.
    if (!papel) throw noEncontrado('Donación');

    const permitidos = (TRANSICIONES[papel][donacion.estado]) || [];
    if (!permitidos.includes(nuevoEstado)) {
      throw new HttpError(409, `No se puede pasar de "${donacion.estado}" a "${nuevoEstado}"`);
    }

    const cambios = {};
    if (nuevoEstado === 'cancelada') {
      cambios.cantidadComprometida = necesidad.cantidadComprometida - donacion.cantidad;
    }
    if (nuevoEstado === 'entregada') {
      cambios.cantidadEntregada = necesidad.cantidadEntregada + donacion.cantidad;
      if (necesidad.estado === 'abierta' && cambios.cantidadEntregada >= necesidad.cantidadRequerida) {
        cambios.estado = 'cubierta';
      }
    }
    const actualizada = await tx.actualizarDonacion(donacionId, { estado: nuevoEstado });
    const necesidadFinal = Object.keys(cambios).length
      ? await tx.actualizarNecesidad(necesidad.id, cambios)
      : necesidad;
    return { donacion: actualizada, necesidad: necesidadFinal };
  });
}

module.exports = { crearDonacion, cambiarEstado, TRANSICIONES };
