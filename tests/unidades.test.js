const { cargarConfig } = require('../src/config');
const { validar, texto, email, password, numero, opcion, paginacion } = require('../src/utils/validar');
const { distanciaKm } = require('../src/utils/geo');
const { generarToken, verificarToken } = require('../src/utils/jwt');
const { hashPassword, comparePassword } = require('../src/utils/password');

describe('config', () => {
  const secreto = 'x'.repeat(40);

  it('en producción exige JWT_SECRET de al menos 32 caracteres', () => {
    expect(() => cargarConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => cargarConfig({ NODE_ENV: 'production', JWT_SECRET: 'corto' })).toThrow(/32/);
    expect(() => cargarConfig({ RENDER: 'true' })).toThrow(/JWT_SECRET/);
    expect(cargarConfig({ NODE_ENV: 'production', JWT_SECRET: secreto }).jwt.secreto).toBe(secreto);
  });

  it('en desarrollo usa un secreto local y lo indica', () => {
    const c = cargarConfig({});
    expect(c.jwt.usaSecretoDesarrollo).toBe(true);
    expect(c.entorno).toBe('development');
  });

  it('interpreta listas, números y banderas', () => {
    const c = cargarConfig({
      JWT_SECRET: secreto,
      CORS_ORIGIN: 'https://a.com, https://b.com',
      PORT: '8080',
      BCRYPT_ROUNDS: '99',
      RENDER: 'true',
      SEED_DEMO: 'true',
      DATABASE_SSL: 'true',
      RATE_LIMIT_LOGIN: 'abc',
    });
    expect(c.corsOrigins).toEqual(['https://a.com', 'https://b.com']);
    expect(c.puerto).toBe(8080);
    expect(c.bcryptRounds).toBe(15);
    expect(c.trustProxy).toBe(1);
    expect(c.seedDemo).toBe(true);
    expect(c.databaseSsl).toBe(true);
    expect(c.limites.login).toBe(10);
  });
});

describe('validar', () => {
  it('acepta datos correctos y normaliza', () => {
    const v = validar(
      { nombre: '  Ana ', email: 'ANA@Mail.com', n: '5', tipo: 'a' },
      { nombre: texto('Nombre'), email: email(), n: numero('N', { entero: true }), tipo: opcion('Tipo', ['a']) }
    );
    expect(v).toEqual({ nombre: 'Ana', email: 'ana@mail.com', n: 5, tipo: 'a' });
  });

  it('junta todos los errores en un 400', () => {
    try {
      validar(null, { a: texto('A'), b: numero('B', { max: 3 }), c: opcion('C', ['x']) });
      throw new Error('no lanzó');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.errores).toHaveLength(3);
    }
  });

  it('cubre casos límite de cada regla', () => {
    expect(texto('T', { max: 2 })('abc').error).toMatch(/máximo/);
    expect(texto('T', { min: 3, opcional: true })('  ')).toEqual({});
    expect(texto('T', { opcional: true })(undefined)).toEqual({});
    expect(email()('sin-arroba').error).toBeDefined();
    expect(password()('').error).toMatch(/obligatoria/);
    expect(password({ nueva: false })('corta').valor).toBe('corta');
    expect(numero('N')(Infinity).error).toMatch(/número/);
    expect(numero('N', { opcional: true })(null)).toEqual({});
    expect(numero('N', { min: 1 })(0).error).toMatch(/entre/);
    expect(opcion('O', ['a'], { opcional: true })(undefined)).toEqual({});
    expect(opcion('O', ['a'])(['a']).error).toBeDefined();
  });

  it('paginación con valores por defecto', () => {
    expect(paginacion({})).toMatchObject({ pagina: 1, porPagina: 20, offset: 0 });
    expect(paginacion({ pagina: '3', porPagina: '10' })).toMatchObject({ limit: 10, offset: 20 });
  });
});

describe('geo', () => {
  it('calcula distancias con Haversine', () => {
    const villahermosa = { lat: 17.9892, lng: -92.9281 };
    const cdmx = { lat: 19.4326, lng: -99.1332 };
    expect(distanciaKm(villahermosa, villahermosa)).toBe(0);
    expect(distanciaKm(villahermosa, cdmx)).toBeGreaterThan(660);
    expect(distanciaKm(villahermosa, cdmx)).toBeLessThan(680);
  });
});

describe('jwt y contraseñas', () => {
  it('firma con id y rol, y verifica emisor y audiencia', () => {
    const token = generarToken({ id: 5, rol: 'donante', email: 'no@va.com' });
    const payload = verificarToken(token);
    expect(payload).toMatchObject({ sub: '5', rol: 'donante', iss: 'helpcare-api', aud: 'helpcare-app' });
    expect(payload.email).toBeUndefined();
    expect(() => verificarToken(`${token}x`)).toThrow();
  });

  it('bcrypt: el hash no es la contraseña y la verificación funciona', async () => {
    const hash = await hashPassword('secreta123');
    expect(hash).not.toContain('secreta123');
    expect(await comparePassword('secreta123', hash)).toBe(true);
    expect(await comparePassword('otra', hash)).toBe(false);
  });
});
