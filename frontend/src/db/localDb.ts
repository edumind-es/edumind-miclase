import Dexie, { type Table } from 'dexie'

export interface Grupo {
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

export interface Alumno {
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

export interface GrupoAlumno {
  id?: number
  grupo_id: number
  alumno_id: number
  activo: number
  fecha_alta?: string
}

export interface Asignatura {
  id?: number
  grupo_id: number
  nombre: string
  nombre_display: string
  comunidad: string
  pesos_trimestres: string
  created_at?: string
}

export interface Instrumento {
  id?: number
  asignatura_id: number
  nombre: string
  tipo: string
  peso: number
  trimestres: string
  orden: number
  created_at?: string
}

export interface Calificacion {
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
}

export interface Sesion {
  id?: number
  grupo_id: number
  fecha: string
  tipo: string
  notas?: string
  created_at?: string
}

export interface AsistenciaRec {
  id?: number
  sesion_id: number
  alumno_id: number
  estado: string
}

export interface Unidad {
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

export interface UnidadCriterio {
  id?: number
  unidad_id: number
  criterio_id: string
  peso: number
}

export interface Rubrica {
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
  rubricas!: Table<Rubrica>

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
  }
}

export const db = new MiClaseDB()
