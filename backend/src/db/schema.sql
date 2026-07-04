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
