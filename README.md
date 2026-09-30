# HelpCare — API (backend)

Backend de **HelpCare**, plataforma sin fines de lucro de donaciones directas:
conecta a personas donantes con centros de acopio e instituciones verificadas,
muestra en un mapa qué hace falta y dónde, y da seguimiento a cada entrega
hasta que la institución confirma que la recibió.

Equipo: Monica Larissa Solano Garcia, Gustavo Antonio Gutiérrez Bravo,
Emilio Enrique Carrillo Calderón, Ixchel García Palomec.

## 1. Qué hace

| Funcionalidad | Cómo se implementa |
|---|---|
| Registro de donantes o instituciones | `POST /api/auth/registro` con `rol: donante \| institucion`. Las instituciones quedan **en revisión** hasta que un administrador las aprueba. |
| Autenticación | JWT **firmado** (HS256, con emisor y audiencia) y contraseñas con **hash** bcrypt. El usuario se vuelve a leer de la base en cada petición, así que un cambio de rol o una cuenta eliminada surten efecto de inmediato. |
| Catálogo de necesidades | Las instituciones publican necesidades (tipo, cantidad, unidad, urgencia). Un administrador **aprueba cada causa** antes de que sea pública. |
| Mapa de centros de acopio | `GET /api/centros?lat=&lng=&radioKm=` devuelve los centros cercanos, ordenados por distancia (Haversine), con sus necesidades abiertas y su urgencia máxima. |
| Donación directa con seguimiento | La persona donante se compromete con una cantidad → avisa "en camino" → la **institución confirma la entrega**. Nadie puede comprometer más de lo que falta (bloqueo de fila en la transacción). |
| Tiempo real | `GET /api/eventos` (Server-Sent Events) avisa a los navegadores cuando cambia un centro, una necesidad o una donación. |
| Transparencia | `GET /api/impacto` publica cifras agregadas y las últimas entregas confirmadas; el detalle de cada necesidad muestra su seguimiento sin revelar quién donó. |

## 2. Arquitectura

```
src/
  server.js          arranque, administrador inicial, datos demo y apagado ordenado
  app.js             Express 5: helmet, CORS, límites, rutas y manejo central de errores
  config.js          variables de entorno (exige JWT_SECRET en producción)
  db/
    index.js         elige PostgreSQL (DATABASE_URL) o memoria
    schema.sql       tablas usuarios, centros, necesidades, donaciones (migración idempotente)
    pgRepo.js        acceso a PostgreSQL (transacciones, FOR UPDATE)
    memoryRepo.js    misma interfaz en memoria, para desarrollo y pruebas
  middleware/        autenticación/autorización y rate limiting
  routes/            auth, usuarios, admin, centros, necesidades, donaciones, impacto, eventos
  services/          reglas de negocio (donaciones, catálogo geográfico, formato de salida)
  utils/             jwt, bcrypt, validación de entrada, distancia geográfica
scripts/seed.js      crea el administrador y, opcionalmente, datos de ejemplo
```

## 3. Endpoints

Todas las respuestas son JSON. Los errores tienen la forma
`{ "error": "mensaje", "errores": ["detalle", ...] }`. Los listados paginados
aceptan `?pagina=&porPagina=` (máximo 100) y responden
`{ items, total, pagina, porPagina }`.

**Autenticación y cuenta**

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/auth/registro` | Público | `{ nombre, email, password, rol?, organizacion? }`. Con token de administrador puede crear administradores. |
| POST | `/api/auth/login` | Público | `{ email, password }` → `{ usuario, token }` |
| GET | `/api/usuarios/perfil` (alias `/api/donantes/perfil`) | Con sesión | Perfil propio |
| GET | `/api/donantes` | Administrador | Todas las cuentas, paginado, filtros `rol` y `estado` |

**Mapa, catálogo e impacto (públicos)**

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/centros?lat&lng&radioKm&tipo&urgencia` | Centros activos para el mapa (radio por defecto 50 km) |
| GET | `/api/centros/:id` | Detalle con necesidades abiertas |
| GET | `/api/necesidades?tipo&urgencia&estado&centroId` | Catálogo (abiertas por defecto), crítico primero |
| GET | `/api/necesidades/:id` | Detalle con seguimiento anónimo de donaciones |
| GET | `/api/impacto` | Cifras de impacto y últimas entregas |
| GET | `/api/eventos` | Flujo de eventos en tiempo real (SSE) |

**Institución** (cuenta aprobada)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/centros/mios` | Sus centros, incluidos los inactivos |
| POST / PATCH | `/api/centros`, `/api/centros/:id` | Registrar o editar un centro (`estado: activo \| inactivo`) |
| GET | `/api/necesidades/mias` | Sus necesidades en cualquier estado |
| POST / PATCH | `/api/necesidades`, `/api/necesidades/:id` | Publicar (queda en revisión), editar o cerrar (`estado: "cerrada"`) |
| GET | `/api/donaciones/recibidas?estado` | Donaciones hacia sus centros, con contacto del donante |
| PATCH | `/api/donaciones/:id` | `{ estado: "entregada" \| "cancelada" }` |

**Donante**

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/donaciones` | `{ necesidadId, cantidad, nota? }` → 409 si excede lo que falta |
| GET | `/api/donaciones/mias` | Sus donaciones con el centro de entrega |
| PATCH | `/api/donaciones/:id` | `{ estado: "en_camino" \| "cancelada" }` |

**Administración**

| Método | Ruta | Descripción |
|---|---|---|
| GET / PATCH | `/api/admin/instituciones[/:id]` | Pendientes; `{ estado: "activo" \| "rechazado" }` |
| GET / PATCH | `/api/admin/necesidades[/:id]` | Pendientes; `{ estado: "abierta" \| "rechazada" }` |

**Operación:** `GET /health` (vivo, con el commit desplegado) y `GET /ready`
(la base de datos responde).

## 4. Seguridad

- Validación estricta de tipos y longitudes en cada entrada: un número donde se
  esperaba texto, o un objeto como contraseña, responden 400 en vez de tumbar
  el servidor. Express 5 envía cualquier error async al manejador central.
- `JWT_SECRET` obligatorio en producción (mínimo 32 caracteres): sin él la app
  no arranca.
- Correos normalizados a minúsculas (sin cuentas duplicadas por mayúsculas);
  contraseñas de 8 a 72 bytes (límite real de bcrypt).
- Login con tiempo de respuesta constante aunque el correo no exista.
- Rate limiting: 10 intentos de login por IP cada 15 min, 20 registros por
  hora, 300 peticiones generales cada 15 min (configurable).
- `helmet`: CSP, HSTS, `X-Content-Type-Options`, sin `X-Powered-By`; además
  `Cache-Control: no-store` en la API. Esto corrige las alertas del escaneo
  OWASP ZAP anterior (vuelvan a escanear y actualicen la captura).
- CORS limitado a `CORS_ORIGIN`; cuerpos de más de 20 kB se rechazan (413).
- La imagen Docker corre con un usuario sin privilegios.

## 5. Ejecutar en local

```bash
npm install
cp .env.example .env        # edita los valores
npm start                   # http://localhost:3000
```

Sin `DATABASE_URL` se usa el almacén en memoria. Para PostgreSQL local:

```bash
docker run -d --name helpcare-db -p 5432:5432 \
  -e POSTGRES_USER=helpcare -e POSTGRES_PASSWORD=helpcare -e POSTGRES_DB=helpcare postgres:17-alpine
# en .env: DATABASE_URL=postgres://helpcare:helpcare@localhost:5432/helpcare
```

Las tablas se crean solas al arrancar. `SEED_DEMO=true` carga cuatro centros
de ejemplo en Villahermosa. `npm run seed -- --demo` hace lo mismo sin
levantar el servidor.

```bash
npm test          # pruebas + cobertura con el almacén en memoria
npm run test:pg   # las mismas pruebas contra PostgreSQL (requiere DATABASE_URL)
npm run lint
```

86 pruebas; cobertura ≈ 98 % de líneas en ambas modalidades.

## 6. Pipeline CI/CD (GitHub Actions)

`.github/workflows/ci-cd.yml`:

1. **test** — lint, `npm audit` (falla con vulnerabilidades altas),
   pruebas con cobertura (mínimo 80 %), reporte como artefacto y análisis en
   **SonarCloud** (si existe el secreto `SONAR_TOKEN`).
2. **test-postgres** — las mismas pruebas contra un servicio PostgreSQL 17.
3. **build** — construye la imagen Docker, comprueba que se niega a arrancar
   sin `JWT_SECRET` y hace prueba de humo en `/health` y `/ready`.
4. **deploy** — solo en `main`: dispara el Deploy Hook de Render, espera a que
   `/health` reporte el commit nuevo y verifica `/ready`.

### Configuración en GitHub

*Settings → Secrets and variables → Actions*:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `RENDER_DEPLOY_HOOK` | URL del Deploy Hook de Render |
| Secret | `SONAR_TOKEN` | Token de SonarCloud (opcional; sin él se omite el análisis) |
| Variable | `RENDER_SERVICE_URL` | `https://helpcare-auth-module.onrender.com` |

**SonarCloud:** entra a sonarcloud.io con GitHub, importa el repositorio,
desactiva *Automatic Analysis* (el pipeline hace el análisis), genera un token
y guárdalo como `SONAR_TOKEN`. Revisa que `sonar.organization` y
`sonar.projectKey` de `sonar-project.properties` coincidan con los de tu
proyecto.

### Entorno de prueba en Render

1. **Base de datos:** *New → PostgreSQL* (misma región que el servicio). Copia
   la *Internal Database URL*. Revisen los límites vigentes del plan gratuito
   de Postgres en Render (históricamente expira tras un periodo).
2. **Web Service** existente (runtime Node, Auto-Deploy en *Off*):
   *Build Command* `npm ci`, *Start Command* `npm start`.
3. **Variables de entorno:**

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Internal Database URL del paso 1 |
| `JWT_SECRET` | 48+ caracteres aleatorios (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `CORS_ORIGIN` | URL del frontend publicado, p. ej. `https://helpcare-web.onrender.com` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Primer administrador (contraseña de 12+ caracteres) |
| `SEED_DEMO` | `true` si quieren el mapa de ejemplo para la presentación |

Render define `RENDER=true`, `PORT` y `RENDER_GIT_COMMIT` automáticamente; con
`RENDER=true` la app se comporta como producción (exige `JWT_SECRET` y confía
en el proxy de Render para identificar la IP real en el rate limiting).

La evidencia de la ejecución del pipeline original está en
[`docs/evidencias/punto-1.2-cicd.md`](docs/evidencias/punto-1.2-cicd.md).

## 7. Limitaciones conocidas y siguientes pasos

- Los eventos en tiempo real viven en memoria del proceso: con varias
  instancias haría falta un bus compartido (p. ej. `LISTEN/NOTIFY` de
  PostgreSQL o Redis).
- La búsqueda por distancia se calcula en la aplicación; con miles de centros
  convendría PostGIS.
- Sin recuperación de contraseña ni verificación de correo todavía.
- El token se guarda en `localStorage` del navegador; una alternativa más
  robusta es una cookie `HttpOnly` con protección CSRF.
