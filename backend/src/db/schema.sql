-- ============================================================
-- EDUmind MiClase — Schema SQLite
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- CURRICULUM (seeded desde JSON, solo lectura en runtime)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS c_competencias (
  id          TEXT PRIMARY KEY,  -- CCL, STEM, CPSAA…
  titulo      TEXT NOT NULL,
  comunidad   TEXT NOT NULL,
  etapa       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS c_descriptores (
  id              TEXT NOT NULL,
  competencia_id  TEXT NOT NULL REFERENCES c_competencias(id),
  descripcion     TEXT NOT NULL,
  comunidad       TEXT NOT NULL,
  etapa           TEXT NOT NULL,
  PRIMARY KEY (id, comunidad, etapa)
);

CREATE TABLE IF NOT EXISTS c_criterios (
  id          TEXT NOT NULL,
  asignatura  TEXT NOT NULL,
  curso       TEXT NOT NULL,
  etapa       TEXT NOT NULL,
  comunidad   TEXT NOT NULL,
  objetivo_id TEXT,
  descripcion TEXT NOT NULL,
  peso        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (id, asignatura, curso, etapa, comunidad)
);

CREATE TABLE IF NOT EXISTS c_bloques (
  id          TEXT NOT NULL,
  asignatura  TEXT NOT NULL,
  curso       TEXT NOT NULL,
  etapa       TEXT NOT NULL,
  comunidad   TEXT NOT NULL,
  titulo      TEXT NOT NULL,
  PRIMARY KEY (id, asignatura, curso, etapa, comunidad)
);

CREATE TABLE IF NOT EXISTS c_saberes (
  id          TEXT NOT NULL,
  bloque_id   TEXT,          -- puede ser NULL si la comunidad no organiza por bloques
  asignatura  TEXT NOT NULL,
  curso       TEXT NOT NULL,
  etapa       TEXT NOT NULL,
  comunidad   TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  PRIMARY KEY (id, asignatura, curso, etapa, comunidad)
);

CREATE TABLE IF NOT EXISTS c_saberes_criterios (
  saber_id    TEXT NOT NULL,
  criterio_id TEXT NOT NULL,
  asignatura  TEXT NOT NULL,
  curso       TEXT NOT NULL,
  etapa       TEXT NOT NULL,
  comunidad   TEXT NOT NULL,
  PRIMARY KEY (saber_id, criterio_id, asignatura, curso, etapa, comunidad)
);

-- ------------------------------------------------------------
-- DOCENTES (solo para autenticación Authentik OIDC)
-- Local-first: los datos de aula (grupos, alumnado, calificaciones…)
-- viven en el navegador del docente (IndexedDB), nunca en el servidor.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS docentes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  email       TEXT UNIQUE,
  password_hash TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- ÍNDICES
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_c_criterios_asig ON c_criterios(asignatura, curso, etapa, comunidad);

-- ------------------------------------------------------------
-- SINCRONIZACIÓN MULTI-DISPOSITIVO (extremo a extremo)
--
-- El servidor NO puede leer nada de lo que guarda aquí: `payload` es
-- AES-256-GCM cifrado en el navegador con una clave derivada de la
-- contraseña de sincronización del docente, que nunca se envía.
--
-- Lo único legible por el servidor es el enrutado: de quién es la fila,
-- de qué tabla, qué id local y cuándo se modificó. Hace falta en claro
-- para poder servir sincronizaciones incrementales y resolver el
-- last-write-wins sin descifrar.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sync_registros (
  docente_id  INTEGER NOT NULL,
  tabla       TEXT    NOT NULL,
  registro_id TEXT    NOT NULL,
  seq         INTEGER NOT NULL,   -- cursor monótono por docente
  updated_at  TEXT    NOT NULL,   -- ISO-8601, para el last-write-wins
  device_id   TEXT    NOT NULL,
  iv          TEXT    NOT NULL,   -- base64
  payload     TEXT    NOT NULL,   -- base64 (AES-256-GCM)
  PRIMARY KEY (docente_id, tabla, registro_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_cursor ON sync_registros(docente_id, seq);

-- Contador monótono y sal de derivación de clave, por docente.
-- La sal no es secreta: se comparte entre dispositivos para que todos
-- deriven la misma clave a partir de la misma contraseña.
CREATE TABLE IF NOT EXISTS sync_estado (
  docente_id  INTEGER PRIMARY KEY,
  seq         INTEGER NOT NULL DEFAULT 0,
  salt        TEXT,
  verificador TEXT,               -- cifrado de una cadena conocida: valida la contraseña
  actualizado TEXT
);
