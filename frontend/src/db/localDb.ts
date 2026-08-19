import Dexie, { type Table } from 'dexie'

/**
 * Campos comunes de sincronización.
 * `updated_at` marca la última modificación (ISO-8601) y es la base del
 * merge last-write-wins entre dispositivos. `deleted_at` implementa el
 * borrado lógico: un registro borrado en un dispositivo debe poder
 * propagarse al resto (un borrado físico sería invisible para el merge).
 */
export interface Sincronizable {
  updated_at?: string
  deleted_at?: string | null
}

export interface Grupo extends Sincronizable {
  id?: number
  nombre: string
  etapa: string
  curso: string
  comunidad: string
  curso_escolar: string
  docente_id: number
  color: string
  created_at?: string
}

export interface Alumno extends Sincronizable {
  id?: number
  nombre: string
  apellidos: string
  foto_path?: string
  fecha_nacimiento?: string
  neae: number
  etiquetas: string   // JSON array string
  observaciones?: string
  codigo_cifrado?: string
  created_at?: string
}

export interface GrupoAlumno extends Sincronizable {
  id?: number
  grupo_id: number
  alumno_id: number
  activo: number
  fecha_alta?: string
}

export interface Asignatura extends Sincronizable {
  id?: number
  grupo_id: number
  nombre: string
  nombre_display: string
  comunidad: string
  pesos_trimestres: string
  orden?: number
  created_at?: string
}

export interface Instrumento extends Sincronizable {
  id?: number
  asignatura_id: number
  nombre: string
  tipo: string
  peso: number
  trimestres: string
  orden: number
  created_at?: string
}

export interface Calificacion extends Sincronizable {
  id?: number
  alumno_id: number
  instrumento_id: number
  criterio_id: string
  asignatura: string
  curso: string
  etapa: string
  comunidad: string
  trimestre: number
  valor?: number | null
  fecha?: string
  observacion?: string | null
  unidad_id?: number | null   // unidad en la que se registró (trazabilidad)
}

export interface Sesion extends Sincronizable {
  id?: number
  grupo_id: number
  fecha: string
  tipo: string
  notas?: string
  created_at?: string
}

export interface AsistenciaRec extends Sincronizable {
  id?: number
  sesion_id: number
  alumno_id: number
  estado: string
}

export interface Unidad extends Sincronizable {
  id?: number
  asignatura_id: number
  nombre: string
  tipo: string
  descripcion?: string
  orden: number
  trimestre?: number | null
  fecha_inicio?: string
  fecha_fin?: string
  activa: number
  created_at?: string
}

export interface UnidadCriterio extends Sincronizable {
  id?: number
  unidad_id: number
  criterio_id: string
  peso: number
}

/**
 * Vínculo criterio ↔ instrumento dentro de una unidad de programación.
 * Es la pieza que faltaba: la programación decide con QUÉ se evalúa cada
 * criterio, y el calificador solo lo obedece. Un mismo criterio puede
 * evaluarse con instrumentos distintos en unidades distintas.
 */
export interface CriterioInstrumento extends Sincronizable {
  id?: number
  unidad_id: number
  criterio_id: string
  instrumento_id: number
  peso: number
}

export interface Rubrica extends Sincronizable {
  id?: number
  instrumento_id: number
  titulo: string
  contexto?: string      // descripción SA/UD usada para generar
  criterio_id?: string   // criterio LOMLOE vinculado (opcional)
  niveles_json: string   // JSON: RubricaNivel[]
  indicadores_json: string // JSON: RubricaIndicador[]
  generada_ia: number    // 0 | 1
  created_at?: string
}

// Evidencia de aprendizaje (foto de una producción, etc.) — el blob vive en IndexedDB
export interface Evidencia extends Sincronizable {
  id?: number
  alumno_id: number
  asignatura_id?: number | null
  criterio_id?: string | null
  instrumento_id?: number | null
  unidad_id?: number | null
  trimestre?: number | null
  tipo: string           // 'foto' (futuro: 'audio', 'video')
  mime: string
  blob: Blob
  descripcion?: string
  fecha: string
}

// Plano de clase: dimensiones de la cuadrícula por grupo
export interface Plano extends Sincronizable {
  id?: number
  grupo_id: number
  filas: number
  cols: number
}

// Asiento de un alumno dentro del plano de su grupo
export interface Asiento extends Sincronizable {
  id?: number
  grupo_id: number
  alumno_id: number
  fila: number
  col: number
}

/** Clave-valor local: base de IDs del dispositivo, cursor de sync, ajustes. */
export interface Meta {
  clave: string
  valor: any
}

class MiClaseDB extends Dexie {
  grupos!: Table<Grupo>
  alumnos!: Table<Alumno>
  grupo_alumnos!: Table<GrupoAlumno>
  asignaturas!: Table<Asignatura>
  instrumentos!: Table<Instrumento>
  calificaciones!: Table<Calificacion>
  sesiones!: Table<Sesion>
  asistencia!: Table<AsistenciaRec>
  unidades!: Table<Unidad>
  unidad_criterios!: Table<UnidadCriterio>
  criterio_instrumentos!: Table<CriterioInstrumento>
  rubricas!: Table<Rubrica>
  evidencias!: Table<Evidencia>
  planos!: Table<Plano>
  asientos!: Table<Asiento>
  meta!: Table<Meta>

  constructor() {
    super('miclase_db')
    this.version(1).stores({
      grupos:           '++id',
      alumnos:          '++id, codigo_cifrado',
      grupo_alumnos:    '++id, grupo_id, alumno_id, [grupo_id+alumno_id]',
      asignaturas:      '++id, grupo_id',
      instrumentos:     '++id, asignatura_id',
      calificaciones:   '++id, instrumento_id, alumno_id, [alumno_id+instrumento_id+criterio_id+trimestre]',
      sesiones:         '++id, grupo_id, fecha',
      asistencia:       '++id, sesion_id, alumno_id, [sesion_id+alumno_id]',
      unidades:         '++id, asignatura_id',
      unidad_criterios: '++id, unidad_id, [unidad_id+criterio_id]',
    })
    this.version(2).stores({
      rubricas: '++id, instrumento_id',
    })
    this.version(3).stores({
      evidencias: '++id, alumno_id, criterio_id, [alumno_id+criterio_id]',
      planos:     '++id, grupo_id',
      asientos:   '++id, grupo_id, [grupo_id+alumno_id], [grupo_id+fila+col]',
    })
    // v4 — vínculo criterio↔instrumento + metadatos de sincronización.
    // `updated_at` se indexa en todas las tablas: es la consulta que hace
    // el sync para saber qué ha cambiado desde el último envío.
    this.version(4).stores({
      grupos:                '++id, updated_at',
      alumnos:               '++id, codigo_cifrado, updated_at',
      grupo_alumnos:         '++id, grupo_id, alumno_id, [grupo_id+alumno_id], updated_at',
      asignaturas:           '++id, grupo_id, updated_at',
      instrumentos:          '++id, asignatura_id, updated_at',
      calificaciones:        '++id, instrumento_id, alumno_id, [alumno_id+instrumento_id+criterio_id+trimestre], updated_at',
      sesiones:              '++id, grupo_id, fecha, updated_at',
      asistencia:            '++id, sesion_id, alumno_id, [sesion_id+alumno_id], updated_at',
      unidades:              '++id, asignatura_id, updated_at',
      unidad_criterios:      '++id, unidad_id, [unidad_id+criterio_id], updated_at',
      criterio_instrumentos: '++id, unidad_id, instrumento_id, [unidad_id+criterio_id], [unidad_id+criterio_id+instrumento_id], updated_at',
      rubricas:              '++id, instrumento_id, updated_at',
      evidencias:            '++id, alumno_id, criterio_id, [alumno_id+criterio_id], updated_at',
      planos:                '++id, grupo_id, updated_at',
      asientos:              '++id, grupo_id, [grupo_id+alumno_id], [grupo_id+fila+col], updated_at',
      meta:                  'clave',
    }).upgrade(async tx => {
      // Sellar los registros existentes para que el primer sync los envíe
      const sello = new Date().toISOString()
      const tablas = [
        'grupos', 'alumnos', 'grupo_alumnos', 'asignaturas', 'instrumentos',
        'calificaciones', 'sesiones', 'asistencia', 'unidades', 'unidad_criterios',
        'rubricas', 'evidencias', 'planos', 'asientos',
      ]
      for (const t of tablas) {
        await tx.table(t).toCollection().modify(r => {
          if (!r.updated_at) r.updated_at = r.created_at || sello
          if (r.deleted_at === undefined) r.deleted_at = null
        })
      }
    })
  }
}

export const db = new MiClaseDB()

/** Tablas que participan en backup y sincronización, en orden de dependencia. */
export const TABLAS_SINC = [
  'grupos', 'alumnos', 'grupo_alumnos', 'asignaturas', 'instrumentos',
  'unidades', 'unidad_criterios', 'criterio_instrumentos', 'calificaciones',
  'sesiones', 'asistencia', 'rubricas', 'evidencias', 'planos', 'asientos',
] as const

export type TablaSinc = typeof TABLAS_SINC[number]
