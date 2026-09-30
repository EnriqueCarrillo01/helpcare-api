const RADIO_TIERRA_KM = 6371;
const aRad = (g) => (g * Math.PI) / 180;

// Distancia en km entre dos coordenadas (fórmula de Haversine).
function distanciaKm(a, b) {
  const dLat = aRad(b.lat - a.lat);
  const dLng = aRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRad(a.lat)) * Math.cos(aRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h));
}

module.exports = { distanciaKm };
