// Las pruebas corren contra el almacén en memoria por defecto y contra
// PostgreSQL cuando existe DATABASE_URL (así lo hace el job "test-postgres"
// del pipeline). Cada corrida mide la cobertura de la implementación que
// realmente ejercita, por eso se excluye la otra.
const usaPostgres = Boolean(process.env.DATABASE_URL);

module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    usaPostgres ? '!src/db/memoryRepo.js' : '!src/db/pgRepo.js',
  ],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
