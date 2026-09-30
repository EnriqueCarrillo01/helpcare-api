// Validación de entrada sin dependencias. Cada regla recibe el valor crudo y
// devuelve { valor } o { error }. validar() revisa TODOS los campos, junta los
// errores y lanza un 400 con la lista; así nunca llega a la lógica un tipo
// inesperado (un número donde se esperaba texto, un objeto como contraseña...).
const { HttpError } = require('../errors');

const vacio = (v) => v === undefined || v === null || v === '';

function texto(etiqueta, { min = 1, max = 200, opcional = false } = {}) {
  return (v) => {
    if (vacio(v)) return opcional ? {} : { error: `${etiqueta} es obligatorio` };
    if (typeof v !== 'string') return { error: `${etiqueta} debe ser texto` };
    const limpio = v.trim();
    if (limpio.length < min) {
      if (limpio.length === 0 && opcional) return {};
      return { error: `${etiqueta} debe tener al menos ${min} caracteres` };
    }
    if (limpio.length > max) return { error: `${etiqueta} admite máximo ${max} caracteres` };
    return { valor: limpio };
  };
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function email() {
  return (v) => {
    const r = texto('El correo electrónico', { max: 254 })(v);
    if (r.error) return r;
    if (!REGEX_EMAIL.test(r.valor)) return { error: 'El correo electrónico no es válido' };
    return { valor: r.valor.toLowerCase() };
  };
}

// bcrypt solo toma en cuenta los primeros 72 bytes, así que ese es el máximo.
function password({ nueva = true } = {}) {
  return (v) => {
    if (vacio(v)) return { error: 'La contraseña es obligatoria' };
    if (typeof v !== 'string') return { error: 'La contraseña debe ser texto' };
    if (Buffer.byteLength(v, 'utf8') > 72) {
      return { error: 'La contraseña admite máximo 72 caracteres' };
    }
    if (nueva && v.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' };
    return { valor: v };
  };
}

function numero(etiqueta, { min = -Infinity, max = Infinity, entero = false, opcional = false } = {}) {
  return (v) => {
    if (vacio(v)) return opcional ? {} : { error: `${etiqueta} es obligatorio` };
    let n = v;
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) n = Number(v);
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return { error: `${etiqueta} debe ser un número` };
    }
    if (entero && !Number.isInteger(n)) return { error: `${etiqueta} debe ser un número entero` };
    if (n < min || n > max) return { error: `${etiqueta} debe estar entre ${min} y ${max}` };
    return { valor: n };
  };
}

function opcion(etiqueta, valores, { opcional = false, porDefecto } = {}) {
  return (v) => {
    if (vacio(v)) {
      if (porDefecto !== undefined) return { valor: porDefecto };
      return opcional ? {} : { error: `${etiqueta} es obligatorio` };
    }
    if (typeof v !== 'string' || !valores.includes(v)) {
      return { error: `${etiqueta} debe ser uno de: ${valores.join(', ')}` };
    }
    return { valor: v };
  };
}

function validar(datos, esquema) {
  const fuente = datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {};
  const valores = {};
  const errores = [];
  for (const [campo, regla] of Object.entries(esquema)) {
    const r = regla(fuente[campo]);
    if (r.error) errores.push(r.error);
    else if (r.valor !== undefined) valores[campo] = r.valor;
  }
  if (errores.length > 0) throw new HttpError(400, 'Datos inválidos', errores);
  return valores;
}

// Parámetro :id de la ruta. Un id que no es entero positivo no puede existir → 404.
function idDeRuta(req, que) {
  const n = Number(req.params.id);
  if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(n) || n < 1) {
    throw new HttpError(404, `${que} no encontrado`);
  }
  return n;
}

function paginacion(query) {
  const v = validar(query, {
    pagina: numero('La página', { min: 1, max: 100000, entero: true, opcional: true }),
    porPagina: numero('El tamaño de página', { min: 1, max: 100, entero: true, opcional: true }),
  });
  const pagina = v.pagina || 1;
  const porPagina = v.porPagina || 20;
  return { pagina, porPagina, limit: porPagina, offset: (pagina - 1) * porPagina };
}

module.exports = { texto, email, password, numero, opcion, validar, idDeRuta, paginacion };
