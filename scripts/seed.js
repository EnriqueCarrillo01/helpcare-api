// Uso:
//   npm run seed            → crea el administrador de ADMIN_EMAIL/ADMIN_PASSWORD
//   npm run seed -- --demo  → además carga centros y necesidades de ejemplo
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables del entorno.
}

const db = require('../src/db');
const { asegurarAdmin, cargarDemo } = require('../src/seed');

async function main() {
  await db.init();
  if (db.repo().tipo === 'memoria') {
    console.warn('Sin DATABASE_URL: los datos se guardarían en memoria y se perderían al salir.');
  }
  const admin = await asegurarAdmin();
  console.log(admin ? `Administrador listo: ${admin.email}` : 'ADMIN_EMAIL/ADMIN_PASSWORD no definidos; no se creó administrador.');
  if (process.argv.includes('--demo')) {
    console.log((await cargarDemo()) ? 'Datos de ejemplo cargados.' : 'Ya había centros; no se cargó el ejemplo.');
  }
  await db.cerrar();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
