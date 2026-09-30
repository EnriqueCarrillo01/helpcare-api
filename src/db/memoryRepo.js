// Repositorio en memoria: misma interfaz que pgRepo. Sirve para desarrollo
// local y para las pruebas; los datos se pierden al reiniciar el proceso.
const { ORDEN_URGENCIA, EmailDuplicadoError } = require('./comun');
const { TIPOS_NECESIDAD } = require('../constantes');

const copia = (o) => (o ? structuredClone(o) : null);
const ahora = () => new Date().toISOString();

function paginar(lista, { limit, offset } = {}) {
  const total = lista.length;
  const inicio = offset || 0;
  const items = limit ? lista.slice(inicio, inicio + limit) : lista.slice(inicio);
  return { items: items.map(copia), total };
}

class MemoryRepo {
  constructor() {
    this.tipo = 'memoria';
    this.cola = Promise.resolve();
    this.reset();
  }

  async migrar() {}
  async ping() {
    return true;
  }
  async cerrar() {}

  async reset() {
    this.usuarios = [];
    this.centros = [];
    this.necesidades = [];
    this.donaciones = [];
    this.ids = { usuarios: 1, centros: 1, necesidades: 1, donaciones: 1 };
  }

  // Aunque Node usa un solo hilo, cada await cede el turno a otras peticiones.
  // Esta cola ejecuta las transacciones una por una, igual que el bloqueo de
  // filas (FOR UPDATE) en PostgreSQL, para que dos compromisos simultáneos no
  // lean la misma cantidad disponible.
  async transaccion(fn) {
    const anterior = this.cola;
    let liberar;
    this.cola = new Promise((resolve) => {
      liberar = resolve;
    });
    await anterior;
    try {
      return await fn(this);
    } finally {
      liberar();
    }
  }

  // ---------- Usuarios ----------
  async crearUsuario({ nombre, email, organizacion = null, passwordHash, rol, estado }) {
    if (this.usuarios.some((u) => u.email === email)) throw new EmailDuplicadoError();
    const u = {
      id: this.ids.usuarios++,
      nombre,
      email,
      organizacion,
      passwordHash,
      rol,
      estado,
      creadoEn: ahora(),
    };
    this.usuarios.push(u);
    return copia(u);
  }

  async usuarioPorEmail(email) {
    return copia(this.usuarios.find((u) => u.email === email));
  }

  async usuarioPorId(id) {
    return copia(this.usuarios.find((u) => u.id === id));
  }

  async listarUsuarios({ ids, rol, estado, limit, offset } = {}) {
    const lista = this.usuarios.filter(
      (u) =>
        (!ids || ids.includes(u.id)) &&
        (!rol || u.rol === rol) &&
        (!estado || u.estado === estado)
    );
    return paginar(lista, { limit, offset });
  }

  async actualizarUsuario(id, cambios) {
    const u = this.usuarios.find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, cambios);
    return copia(u);
  }

  async eliminarUsuario(id) {
    this.usuarios = this.usuarios.filter((u) => u.id !== id);
  }

  // ---------- Centros de acopio ----------
  async crearCentro(datos) {
    const c = { id: this.ids.centros++, horario: null, estado: 'activo', ...datos, creadoEn: ahora() };
    this.centros.push(c);
    return copia(c);
  }

  async centroPorId(id) {
    return copia(this.centros.find((c) => c.id === id));
  }

  async listarCentros({ ids, estado, institucionId } = {}) {
    return this.centros
      .filter(
        (c) =>
          (!ids || ids.includes(c.id)) &&
          (!estado || c.estado === estado) &&
          (!institucionId || c.institucionId === institucionId)
      )
      .map(copia);
  }

  async actualizarCentro(id, cambios) {
    const c = this.centros.find((x) => x.id === id);
    Object.assign(c, cambios);
    return copia(c);
  }

  // ---------- Necesidades ----------
  async crearNecesidad(datos) {
    const n = {
      id: this.ids.necesidades++,
      descripcion: null,
      cantidadComprometida: 0,
      cantidadEntregada: 0,
      ...datos,
      creadoEn: ahora(),
      actualizadoEn: ahora(),
    };
    this.necesidades.push(n);
    return copia(n);
  }

  async necesidadPorId(id) {
    return copia(this.necesidades.find((n) => n.id === id));
  }

  async listarNecesidades({ ids, estados, centroIds, tipo, urgencia, institucionId, limit, offset } = {}) {
    const centrosDeInstitucion = institucionId
      ? new Set(this.centros.filter((c) => c.institucionId === institucionId).map((c) => c.id))
      : null;
    const lista = this.necesidades
      .filter(
        (n) =>
          (!ids || ids.includes(n.id)) &&
          (!estados || estados.includes(n.estado)) &&
          (!centroIds || centroIds.includes(n.centroId)) &&
          (!tipo || n.tipo === tipo) &&
          (!urgencia || n.urgencia === urgencia) &&
          (!centrosDeInstitucion || centrosDeInstitucion.has(n.centroId))
      )
      .sort(
        (a, b) =>
          ORDEN_URGENCIA[a.urgencia] - ORDEN_URGENCIA[b.urgencia] ||
          b.creadoEn.localeCompare(a.creadoEn) ||
          b.id - a.id
      );
    return paginar(lista, { limit, offset });
  }

  async actualizarNecesidad(id, cambios) {
    const n = this.necesidades.find((x) => x.id === id);
    Object.assign(n, cambios, { actualizadoEn: ahora() });
    return copia(n);
  }

  // ---------- Donaciones ----------
  async crearDonacion(datos) {
    const d = { id: this.ids.donaciones++, nota: null, ...datos, creadoEn: ahora(), actualizadoEn: ahora() };
    this.donaciones.push(d);
    return copia(d);
  }

  async donacionPorId(id) {
    return copia(this.donaciones.find((d) => d.id === id));
  }

  async listarDonaciones({ donanteId, necesidadId, institucionId, estado, limit, offset } = {}) {
    let necesidadesDeInstitucion = null;
    if (institucionId) {
      const centros = new Set(
        this.centros.filter((c) => c.institucionId === institucionId).map((c) => c.id)
      );
      necesidadesDeInstitucion = new Set(
        this.necesidades.filter((n) => centros.has(n.centroId)).map((n) => n.id)
      );
    }
    const lista = this.donaciones
      .filter(
        (d) =>
          (!donanteId || d.donanteId === donanteId) &&
          (!necesidadId || d.necesidadId === necesidadId) &&
          (!estado || d.estado === estado) &&
          (!necesidadesDeInstitucion || necesidadesDeInstitucion.has(d.necesidadId))
      )
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn) || b.id - a.id);
    return paginar(lista, { limit, offset });
  }

  async actualizarDonacion(id, cambios) {
    const d = this.donaciones.find((x) => x.id === id);
    Object.assign(d, cambios, { actualizadoEn: ahora() });
    return copia(d);
  }

  // ---------- Impacto ----------
  async estadisticas() {
    const entregadas = this.donaciones.filter((d) => d.estado === 'entregada');
    const necesidadPorId = new Map(this.necesidades.map((n) => [n.id, n]));
    const centroPorId = new Map(this.centros.map((c) => [c.id, c]));
    const visibles = this.necesidades.filter((n) => ['abierta', 'cubierta', 'cerrada'].includes(n.estado));

    const porTipo = TIPOS_NECESIDAD.map((tipo) => ({
      tipo,
      necesidades: visibles.filter((n) => n.tipo === tipo).length,
      unidadesEntregadas: entregadas
        .filter((d) => necesidadPorId.get(d.necesidadId).tipo === tipo)
        .reduce((s, d) => s + d.cantidad, 0),
    })).filter((t) => t.necesidades > 0);

    const ultimasEntregas = [...entregadas]
      .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn) || b.id - a.id)
      .slice(0, 8)
      .map((d) => {
        const n = necesidadPorId.get(d.necesidadId);
        return {
          necesidadId: n.id,
          titulo: n.titulo,
          unidad: n.unidad,
          centro: centroPorId.get(n.centroId).nombre,
          cantidad: d.cantidad,
          fecha: d.actualizadoEn,
        };
      });

    return {
      centrosActivos: this.centros.filter((c) => c.estado === 'activo').length,
      institucionesActivas: this.usuarios.filter((u) => u.rol === 'institucion' && u.estado === 'activo').length,
      necesidadesAbiertas: this.necesidades.filter((n) => n.estado === 'abierta').length,
      necesidadesCriticas: this.necesidades.filter((n) => n.estado === 'abierta' && n.urgencia === 'critica').length,
      necesidadesCubiertas: this.necesidades.filter((n) => n.estado === 'cubierta').length,
      donacionesEntregadas: entregadas.length,
      unidadesEntregadas: entregadas.reduce((s, d) => s + d.cantidad, 0),
      donantesParticipantes: new Set(entregadas.map((d) => d.donanteId)).size,
      porTipo,
      ultimasEntregas,
    };
  }
}

module.exports = MemoryRepo;
