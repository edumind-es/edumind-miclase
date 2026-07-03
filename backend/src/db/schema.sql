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
-- DATOS DEL DOCENTE Y ORGANIZACIÓN
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS docentes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  email       TEXT UNIQUE,
  password_hash TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grupos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,       -- '3ºA', '5ºB'
  etapa         TEXT NOT NULL,       -- 'primaria', 'secundaria'
  curso         TEXT NOT NULL,       -- '3', '5'
  comunidad     TEXT NOT NULL DEFAULT 'Galicia',
  curso_escolar TEXT NOT NULL,       -- '2025-2026'
  docente_id    INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  color         TEXT DEFAULT '#4A90D9',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alumnos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre          TEXT NOT NULL,
  apellidos       TEXT NOT NULL,
  foto_path       TEXT,
  fecha_nacimiento TEXT,
  neae            INTEGER DEFAULT 0,  -- 1 si tiene necesidades específicas
  etiquetas       TEXT DEFAULT '[]',  -- JSON array
  observaciones   TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grupo_alumnos (
  grupo_id    INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  alumno_id   INTEGER NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  activo      INTEGER DEFAULT 1,
  fecha_alta  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (grupo_id, alumno_id)
);

-- ------------------------------------------------------------
-- ASIGNATURAS IMPARTIDAS Y EVALUACIÓN
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS asignaturas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo_id        INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,       -- 'educacion-fisica'
  nombre_display  TEXT NOT NULL,       -- 'Educación Física'
  comunidad       TEXT NOT NULL DEFAULT 'Galicia',
  -- pesos por trimestre en JSON: {"1": 33, "2": 33, "3": 34}
  pesos_trimestres TEXT DEFAULT '{"1":33,"2":33,"3":34}',
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS instrumentos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asignatura_id INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK(tipo IN (
                'observacion','prueba','rubrica','trabajo','autoevaluacion','exposicion'
              )),
  peso        REAL NOT NULL DEFAULT 100,
  trimestres  TEXT NOT NULL DEFAULT '[1,2,3]',  -- JSON array
  orden       INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calificaciones (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  alumno_id       INTEGER NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  instrumento_id  INTEGER NOT NULL REFERENCES instrumentos(id) ON DELETE CASCADE,
  criterio_id     TEXT NOT NULL,
  asignatura      TEXT NOT NULL,
  curso           TEXT NOT NULL,
  etapa           TEXT NOT NULL,
  comunidad       TEXT NOT NULL DEFAULT 'Galicia',
  trimestre       INTEGER NOT NULL CHECK(trimestre IN (1,2,3)),
  valor           REAL CHECK(valor IS NULL OR (valor >= 0 AND valor <= 10)),
  fecha           TEXT DEFAULT (datetime('now')),
  observacion     TEXT,
  UNIQUE(alumno_id, instrumento_id, criterio_id, trimestre)
);

-- Rúbricas generadas (pueden ser por IA o manuales)
CREATE TABLE IF NOT EXISTS rubricas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  asignatura_id   INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
  criterio_id     TEXT NOT NULL,
  generada_por_ia INTEGER DEFAULT 0,
  niveles         TEXT NOT NULL,  -- JSON: [{nivel, descripcion, valor}]
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- ASISTENCIA
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sesiones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo_id    INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  fecha       TEXT NOT NULL,
  tipo        TEXT DEFAULT 'clase',
  notas       TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asistencia (
  sesion_id   INTEGER NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
  alumno_id   INTEGER NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  estado      TEXT NOT NULL CHECK(estado IN ('presente','ausente','justificado','tarde')),
  PRIMARY KEY (sesion_id, alumno_id)
);

-- ------------------------------------------------------------
-- PROGRAMACIÓN DIDÁCTICA
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS unidades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  asignatura_id   INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'unidad',  -- 'unidad' | 'situacion' | 'proyecto' | 'secuencia' | 'bloque'
  descripcion     TEXT,
  orden           INTEGER NOT NULL DEFAULT 0,
  trimestre       INTEGER CHECK(trimestre IS NULL OR trimestre IN (1,2,3)),
  fecha_inicio    TEXT,
  fecha_fin       TEXT,
  activa          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS unidad_criterios (
  unidad_id   INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  criterio_id TEXT NOT NULL,
  peso        REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (unidad_id, criterio_id)
);

-- ------------------------------------------------------------
-- ÍNDICES
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_grupo_alumnos_grupo ON grupo_alumnos(grupo_id);
CREATE INDEX IF NOT EXISTS idx_calificaciones_alumno ON calificaciones(alumno_id);
CREATE INDEX IF NOT EXISTS idx_calificaciones_instrumento ON calificaciones(instrumento_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_sesion ON asistencia(sesion_id);
CREATE INDEX IF NOT EXISTS idx_c_criterios_asig ON c_criterios(asignatura, curso, etapa, comunidad);
