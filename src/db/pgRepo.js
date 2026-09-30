// Repositorio PostgreSQL. Misma interfaz que memoryRepo.
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { EmailDuplicadoError } = require('./comun');
const { TIPOS_NECESIDAD } = require('../constantes');

const iso = (f) => (f instanceof Date ? f.toISOString() : f);

const aUsuario = (r) =>
  r && {
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    organizacion: r.organizacion,
    passwordHash: r.password_hash,
    rol: r.rol,
    estado: r.estado,
    creadoEn: iso(r.creado_en),
  };

const aCentro = (r) =>
  r && {
    id: r.id,
    institucionId: r.institucion_id,
    nombre: r.nombre,
    direccion: r.direccion,
    lat: r.lat,
    lng: r.lng,
    horario: r.horario,
    estado: r.estado,
    creadoEn: iso(r.creado_en),
  };

const aNecesidad = (r) =>
  r && {
    id: r.id,
    centroId: r.centro_id,
    titulo: r.titulo,
    descripcion: r.descripcion,
    tipo: r.tipo,
    unidad: r.unidad,
    cantidadRequerida: r.cantidad_requerida,
    cantidadComprometida: r.cantidad_comprometida,
    cantidadEntregada: r.cantidad_entregada,
    urgencia: r.urgencia,
    estado: r.estado,
    creadoEn: iso(r.creado_en),
    actualizadoEn: iso(r.actualizado_en),
  };

const aDonacion = (r) =>
  r && {
    id: r.id,
    necesidadId: r.necesidad_id,
    donanteId: r.donante_id,
    cantidad: r.cantidad,
    estado: r.estado,
    nota: r.nota,
    creadoEn: iso(r.creado_en),
    actualizadoEn: iso(r.actualizado_en),
  };

// Columnas que se pueden actualizar, por tabla (camelCase → snake_case).
const COLUMNAS = {
  usuarios: { nombre: 'nombre', organizacion: 'organizacion', rol: 'rol', estado: 'estado' },
  centros: {
    nombre: 'nombre',
    direccion: 'direccion',
    lat: 'lat',
    lng: 'lng',
    horario: 'horario',
    estado: 'estado',
  },
  necesidades: {
    titulo: 'titulo',
    descripcion: 'descripcion',
    urgencia: 'urgencia',
    estado: 'estado',
    cantidadRequerida: 'cantidad_requerida',
    cantidadComprometida: 'cantidad_comprometida',
    cantidadEntregada: 'cantidad_entregada',
  },
  donaciones: { estado: 'estado', nota: 'nota' },
};

const ORDEN_URGENCIA_SQL = "CASE n.urgencia WHEN 'critica' THEN 0 WHEN 'media' THEN 1 ELSE 2 END";

// Arma un WHERE a partir de pares [condición con ?, valor]; omite los valores undefined.
function donde(condiciones) {
  const partes = [];
  const valores = [];
  for (const [sql, valor] of condiciones) {
    if (valor === undefined || valor === null) continue;
    valores.push(valor);
    partes.push(sql.replace('?', `$${valores.length}`));
  }
  return { where: partes.length ? `WHERE ${partes.join(' AND ')}` : '', valores };
}

function paginado(valores, limit, offset) {
  if (!limit) return '';
  valores.push(limit, offset || 0);
  return ` LIMIT $${valores.length - 1} OFFSET $${valores.length}`;
}

class PgRepo {
  constructor(ejecutor, pool) {
    this.tipo = 'postgres';
    this.db = ejecutor;
    this.pool = pool;
  }

  static crear(url, { ssl = false } = {}) {
    const pool = new Pool({
      connectionString: url,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
    return new PgRepo(pool, pool);
  }

  async migrar() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    // El candado evita que dos instancias creen tablas al mismo tiempo.
    await this.transaccion(async (tx) => {
      await tx.db.query('SELECT pg_advisory_xact_lock(424242)');
      await tx.db.query(sql);
    });
  }

  async ping() {
    await this.db.query('SELECT 1');
    return true;
  }

  async cerrar() {
    await this.pool.end();
  }

  async reset() {
    await this.db.query(
      'TRUNCATE donaciones, necesidades, centros, usuarios RESTART IDENTITY CASCADE'
    );
  }

  async transaccion(fn) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await fn(new PgRepo(cliente, this.pool));
      await cliente.query('COMMIT');
      return resultado;
    } catch (err) {
      await cliente.query('ROLLBACK');
      throw err;
    } finally {
      cliente.release();
    }
  }

  async actualizar(tabla, mapeo, id, cambios) {
    const sets = [];
    const valores = [];
    for (const [campo, valor] of Object.entries(cambios)) {
      const columna = COLUMNAS[tabla][campo];
      if (!columna) throw new Error(`Campo no actualizable: ${tabla}.${campo}`);
      valores.push(valor);
      sets.push(`${columna} = $${valores.length}`);
    }
    if (tabla === 'necesidades' || tabla === 'donaciones') sets.push('actualizado_en = now()');
    valores.push(id);
    const { rows } = await this.db.query(
      `UPDATE ${tabla} SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING *`,
      valores
    );
    return mapeo(rows[0]) || null;
  }

  // ---------- Usuarios ----------
  async crearUsuario({ nombre, email, organizacion = null, passwordHash, rol, estado }) {
    try {
      const { rows } = await this.db.query(
        `INSERT INTO usuarios (nombre, email, organizacion, password_hash, rol, estado)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [nombre, email, organizacion, passwordHash, rol, estado]
      );
      return aUsuario(rows[0]);
    } catch (err) {
      if (err.code === '23505') throw new EmailDuplicadoError();
      throw err;
    }
  }

  async usuarioPorEmail(email) {
    const { rows } = await this.db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    return aUsuario(rows[0]) || null;
  }

  async usuarioPorId(id) {
    const { rows } = await this.db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    return aUsuario(rows[0]) || null;
  }

  async listarUsuarios({ ids, rol, estado, limit, offset } = {}) {
    const { where, valores } = donde([
      ['id = ANY(?)', ids],
      ['rol = ?', rol],
      ['estado = ?', estado],
    ]);
    const total = await this.db.query(`SELECT count(*)::int AS n FROM usuarios ${where}`, valores);
    const { rows } = await this.db.query(
      `SELECT * FROM usuarios ${where} ORDER BY id${paginado(valores, limit, offset)}`,
      valores
    );
    return { items: rows.map(aUsuario), total: total.rows[0].n };
  }

  async actualizarUsuario(id, cambios) {
    return this.actualizar('usuarios', aUsuario, id, cambios);
  }

  async eliminarUsuario(id) {
    await this.db.query('DELETE FROM usuarios WHERE id = $1', [id]);
  }

  // ---------- Centros ----------
  async crearCentro({ institucionId, nombre, direccion, lat, lng, horario = null, estado = 'activo' }) {
    const { rows } = await this.db.query(
      `INSERT INTO centros (institucion_id, nombre, direccion, lat, lng, horario, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [institucionId, nombre, direccion, lat, lng, horario, estado]
    );
    return aCentro(rows[0]);
  }

  async centroPorId(id) {
    const { rows } = await this.db.query('SELECT * FROM centros WHERE id = $1', [id]);
    return aCentro(rows[0]) || null;
  }

  async listarCentros({ ids, estado, institucionId } = {}) {
    const { where, valores } = donde([
      ['id = ANY(?)', ids],
      ['estado = ?', estado],
      ['institucion_id = ?', institucionId],
    ]);
    const { rows } = await this.db.query(`SELECT * FROM centros ${where} ORDER BY id`, valores);
    return rows.map(aCentro);
  }

  async actualizarCentro(id, cambios) {
    return this.actualizar('centros', aCentro, id, cambios);
  }

  // ---------- Necesidades ----------
  async crearNecesidad(d) {
    const { rows } = await this.db.query(
      `INSERT INTO necesidades (centro_id, titulo, descripcion, tipo, unidad,
         cantidad_requerida, urgencia, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [d.centroId, d.titulo, d.descripcion || null, d.tipo, d.unidad, d.cantidadRequerida, d.urgencia, d.estado]
    );
    return aNecesidad(rows[0]);
  }

  async necesidadPorId(id, { bloquear = false } = {}) {
    const { rows } = await this.db.query(
      `SELECT * FROM necesidades WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`,
      [id]
    );
    return aNecesidad(rows[0]) || null;
  }

  async listarNecesidades({ ids, estados, centroIds, tipo, urgencia, institucionId, limit, offset } = {}) {
    const { where, valores } = donde([
      ['n.id = ANY(?)', ids],
      ['n.estado = ANY(?)', estados],
      ['n.centro_id = ANY(?)', centroIds],
      ['n.tipo = ?', tipo],
      ['n.urgencia = ?', urgencia],
      ['c.institucion_id = ?', institucionId],
    ]);
    const desde = 'FROM necesidades n JOIN centros c ON c.id = n.centro_id';
    const total = await this.db.query(`SELECT count(*)::int AS n ${desde} ${where}`, valores);
    const { rows } = await this.db.query(
      `SELECT n.* ${desde} ${where}
       ORDER BY ${ORDEN_URGENCIA_SQL}, n.creado_en DESC, n.id DESC${paginado(valores, limit, offset)}`,
      valores
    );
    return { items: rows.map(aNecesidad), total: total.rows[0].n };
  }

  async actualizarNecesidad(id, cambios) {
    return this.actualizar('necesidades', aNecesidad, id, cambios);
  }

  // ---------- Donaciones ----------
  async crearDonacion({ necesidadId, donanteId, cantidad, estado, nota = null }) {
    const { rows } = await this.db.query(
      `INSERT INTO donaciones (necesidad_id, donante_id, cantidad, estado, nota)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [necesidadId, donanteId, cantidad, estado, nota]
    );
    return aDonacion(rows[0]);
  }

  async donacionPorId(id, { bloquear = false } = {}) {
    const { rows } = await this.db.query(
      `SELECT * FROM donaciones WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`,
      [id]
    );
    return aDonacion(rows[0]) || null;
  }

  async listarDonaciones({ donanteId, necesidadId, institucionId, estado, limit, offset } = {}) {
    const { where, valores } = donde([
      ['d.donante_id = ?', donanteId],
      ['d.necesidad_id = ?', necesidadId],
      ['d.estado = ?', estado],
      ['c.institucion_id = ?', institucionId],
    ]);
    const desde = `FROM donaciones d
      JOIN necesidades n ON n.id = d.necesidad_id
      JOIN centros c ON c.id = n.centro_id`;
    const total = await this.db.query(`SELECT count(*)::int AS n ${desde} ${where}`, valores);
    const { rows } = await this.db.query(
      `SELECT d.* ${desde} ${where}
       ORDER BY d.creado_en DESC, d.id DESC${paginado(valores, limit, offset)}`,
      valores
    );
    return { items: rows.map(aDonacion), total: total.rows[0].n };
  }

  async actualizarDonacion(id, cambios) {
    return this.actualizar('donaciones', aDonacion, id, cambios);
  }

  // ---------- Impacto ----------
  async estadisticas() {
    const q = (sql) => this.db.query(sql).then((r) => r.rows);
    const [conteos] = await q(`
      SELECT
        (SELECT count(*)::int FROM centros WHERE estado = 'activo') AS centros_activos,
        (SELECT count(*)::int FROM usuarios WHERE rol = 'institucion' AND estado = 'activo') AS instituciones_activas,
        (SELECT count(*)::int FROM necesidades WHERE estado = 'abierta') AS necesidades_abiertas,
        (SELECT count(*)::int FROM necesidades WHERE estado = 'abierta' AND urgencia = 'critica') AS necesidades_criticas,
        (SELECT count(*)::int FROM necesidades WHERE estado = 'cubierta') AS necesidades_cubiertas,
        (SELECT count(*)::int FROM donaciones WHERE estado = 'entregada') AS donaciones_entregadas,
        (SELECT coalesce(sum(cantidad), 0)::int FROM donaciones WHERE estado = 'entregada') AS unidades_entregadas,
        (SELECT count(DISTINCT donante_id)::int FROM donaciones WHERE estado = 'entregada') AS donantes_participantes`);
    const porTipo = await q(`
      SELECT n.tipo,
             count(DISTINCT n.id)::int AS necesidades,
             coalesce(sum(d.cantidad) FILTER (WHERE d.estado = 'entregada'), 0)::int AS unidades
      FROM necesidades n
      LEFT JOIN donaciones d ON d.necesidad_id = n.id
      WHERE n.estado IN ('abierta', 'cubierta', 'cerrada')
      GROUP BY n.tipo`);
    const ultimas = await q(`
      SELECT n.id AS necesidad_id, n.titulo, n.unidad, c.nombre AS centro, d.cantidad, d.actualizado_en
      FROM donaciones d
      JOIN necesidades n ON n.id = d.necesidad_id
      JOIN centros c ON c.id = n.centro_id
      WHERE d.estado = 'entregada'
      ORDER BY d.actualizado_en DESC, d.id DESC
      LIMIT 8`);
    return {
      centrosActivos: conteos.centros_activos,
      institucionesActivas: conteos.instituciones_activas,
      necesidadesAbiertas: conteos.necesidades_abiertas,
      necesidadesCriticas: conteos.necesidades_criticas,
      necesidadesCubiertas: conteos.necesidades_cubiertas,
      donacionesEntregadas: conteos.donaciones_entregadas,
      unidadesEntregadas: conteos.unidades_entregadas,
      donantesParticipantes: conteos.donantes_participantes,
      porTipo: porTipo
        .map((r) => ({ tipo: r.tipo, necesidades: r.necesidades, unidadesEntregadas: r.unidades }))
        .sort((a, b) => TIPOS_NECESIDAD.indexOf(a.tipo) - TIPOS_NECESIDAD.indexOf(b.tipo)),
      ultimasEntregas: ultimas.map((r) => ({
        necesidadId: r.necesidad_id,
        titulo: r.titulo,
        unidad: r.unidad,
        centro: r.centro,
        cantidad: r.cantidad,
        fecha: iso(r.actualizado_en),
      })),
    };
  }
}

module.exports = PgRepo;
