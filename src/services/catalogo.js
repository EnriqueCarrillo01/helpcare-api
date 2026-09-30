// Consultas que combinan varias entidades (centros + necesidades + instituciones).
const db = require('../db');
const { distanciaKm } = require('../utils/geo');
const { ORDEN_URGENCIA } = require('../db/comun');
const { centroPublico, necesidadPublica } = require('./formato');

const unicos = (lista) => [...new Set(lista)];

async function mapaPorId(listar, ids) {
  if (ids.length === 0) return new Map();
  const r = await listar({ ids });
  const items = Array.isArray(r) ? r : r.items;
  return new Map(items.map((x) => [x.id, x]));
}

// Añade a cada necesidad los datos de su centro.
async function necesidadesConCentro(necesidades) {
  const repo = db.repo();
  const centros = await mapaPorId((f) => repo.listarCentros(f), unicos(necesidades.map((n) => n.centroId)));
  return necesidades.map((n) => necesidadPublica(n, centros.get(n.centroId)));
}

// Centros activos para el mapa, cada uno con sus necesidades abiertas.
// Con coordenadas se filtra por radio y se ordena por distancia; sin ellas se
// ordena por la urgencia más alta. A la escala de este proyecto basta con
// calcular la distancia en memoria; con miles de centros convendría PostGIS.
async function centrosParaMapa({ lat, lng, radioKm, tipo, urgencia }) {
  const repo = db.repo();
  const centros = await repo.listarCentros({ estado: 'activo' });
  const { items: abiertas } = await repo.listarNecesidades({
    estados: ['abierta'],
    centroIds: centros.map((c) => c.id),
    tipo,
    urgencia,
  });
  const instituciones = await mapaPorId(
    (f) => repo.listarUsuarios(f),
    unicos(centros.map((c) => c.institucionId))
  );

  const porCentro = new Map();
  for (const n of abiertas) {
    if (!porCentro.has(n.centroId)) porCentro.set(n.centroId, []);
    porCentro.get(n.centroId).push(n);
  }

  const hayOrigen = lat !== undefined && lng !== undefined;
  const filtraNecesidades = Boolean(tipo || urgencia);

  const resultado = [];
  for (const c of centros) {
    const necesidades = porCentro.get(c.id) || [];
    if (filtraNecesidades && necesidades.length === 0) continue;
    const distancia = hayOrigen ? distanciaKm({ lat, lng }, c) : null;
    if (hayOrigen && distancia > radioKm) continue;
    const urgenciaMaxima = necesidades.reduce(
      (max, n) => (max === null || ORDEN_URGENCIA[n.urgencia] < ORDEN_URGENCIA[max] ? n.urgencia : max),
      null
    );
    resultado.push({
      ...centroPublico(c, instituciones.get(c.institucionId)),
      distanciaKm: distancia === null ? null : Math.round(distancia * 10) / 10,
      urgenciaMaxima,
      necesidades: necesidades.map((n) => {
        const { centro: _c, ...resto } = necesidadPublica(n);
        return resto;
      }),
    });
  }

  const rangoUrgencia = (c) => (c.urgenciaMaxima === null ? 3 : ORDEN_URGENCIA[c.urgenciaMaxima]);
  resultado.sort((a, b) =>
    hayOrigen ? a.distanciaKm - b.distanciaKm : rangoUrgencia(a) - rangoUrgencia(b) || a.id - b.id
  );
  return resultado;
}

module.exports = { necesidadesConCentro, centrosParaMapa, mapaPorId, unicos };
