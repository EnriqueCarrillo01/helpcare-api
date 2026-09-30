-- Esquema de HelpCare. Idempotente: se ejecuta en cada arranque.

CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  organizacion  TEXT,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('donante', 'institucion', 'administrador')),
  estado        TEXT NOT NULL CHECK (estado IN ('activo', 'pendiente', 'rechazado')),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS centros (
  id             SERIAL PRIMARY KEY,
  institucion_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  direccion      TEXT NOT NULL,
  lat            DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng            DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  horario        TEXT,
  estado         TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS centros_estado_idx ON centros (estado);
CREATE INDEX IF NOT EXISTS centros_institucion_idx ON centros (institucion_id);

CREATE TABLE IF NOT EXISTS necesidades (
  id                    SERIAL PRIMARY KEY,
  centro_id             INTEGER NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  titulo                TEXT NOT NULL,
  descripcion           TEXT,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('alimentos', 'agua', 'ropa', 'higiene',
                          'medicinas', 'servicios_medicos', 'voluntariado', 'otro')),
  unidad                TEXT NOT NULL,
  cantidad_requerida    INTEGER NOT NULL CHECK (cantidad_requerida > 0),
  cantidad_comprometida INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_comprometida >= 0),
  cantidad_entregada    INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_entregada >= 0),
  urgencia              TEXT NOT NULL CHECK (urgencia IN ('baja', 'media', 'critica')),
  estado                TEXT NOT NULL CHECK (estado IN ('pendiente', 'abierta', 'cubierta',
                          'rechazada', 'cerrada')),
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS necesidades_estado_idx ON necesidades (estado, urgencia);
CREATE INDEX IF NOT EXISTS necesidades_centro_idx ON necesidades (centro_id);

CREATE TABLE IF NOT EXISTS donaciones (
  id             SERIAL PRIMARY KEY,
  necesidad_id   INTEGER NOT NULL REFERENCES necesidades(id) ON DELETE CASCADE,
  donante_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cantidad       INTEGER NOT NULL CHECK (cantidad > 0),
  estado         TEXT NOT NULL CHECK (estado IN ('comprometida', 'en_camino', 'entregada',
                   'cancelada')),
  nota           TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS donaciones_donante_idx ON donaciones (donante_id);
CREATE INDEX IF NOT EXISTS donaciones_necesidad_idx ON donaciones (necesidad_id);
