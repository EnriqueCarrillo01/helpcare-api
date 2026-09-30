const h = require('./helpers');
const db = require('../src/db');
const { asegurarAdmin, cargarDemo, CENTROS_DEMO } = require('../src/seed');

h.prepararBase();

describe('Datos iniciales', () => {
  it('crea el administrador inicial una sola vez', async () => {
    const datos = { email: ' Admin@HelpCare.org ', password: 'una-clave-larga', nombre: 'Admin' };
    const a = await asegurarAdmin(datos);
    const b = await asegurarAdmin(datos);
    expect(a.id).toBe(b.id);
    expect(a).toMatchObject({ email: 'admin@helpcare.org', rol: 'administrador' });
  });

  it('no hace nada sin variables y exige una contraseña larga', async () => {
    expect(await asegurarAdmin({})).toBeNull();
    await expect(asegurarAdmin({ email: 'a@b.com', password: 'corta' })).rejects.toThrow(/12/);
  });

  it('carga los datos de ejemplo solo si la base está vacía', async () => {
    expect(await cargarDemo()).toBe(true);
    expect(await cargarDemo()).toBe(false);
    const centros = await db.repo().listarCentros({ estado: 'activo' });
    expect(centros).toHaveLength(CENTROS_DEMO.length);
    const res = await h.request(h.app).get('/api/impacto');
    expect(res.body.donacionesEntregadas).toBe(8);
  });
});
