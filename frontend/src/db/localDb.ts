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
  /** Reservado: no hay interfaz que lo escriba todavía (falta foto de alumno). */
  foto_path?: string
  /** Reservado: no se pide en el alta. */
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

/** Cómo se funden varios registros del diario en la nota del criterio. */
export type Agregacion = 'media' | 'ultima' | 'tendencia' | 'mediana'

export interface Instrumento extends Sincronizable {
  id?: number
  asignatura_id: number
  nombre: string
  tipo: string
  peso: number
  trimestres: string
  orden: number
  created_at?: string
  /**
   * Regla con la que varios registros del diario de evaluación se convierten
   * en la nota del criterio. Sin declarar vale 'media'. No se indexa: no
   * exige versión de esquema.
   */
  agregacion?: Agregacion | null
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
  /**
   * 'diario' cuando `valor` se deriva de los registros del diario de
   * evaluación y no se puso a mano. El panel avisa antes de dejar editarla y
   * la reconciliación tras un sync solo reescribe las que llevan esta marca.
   * Sin índice.
   */
  origen?: 'diario' | null
  /**
   * Nivel marcado en cada indicador de la rúbrica: nombre del indicador →
   * valor del nivel. Es la justificación de la nota, no la nota: `valor`
   * sigue siendo lo que cuenta para las medias.
   *
   * Sin esto, al reabrir una casilla se veía el 7,5 pero no de dónde salía, y
   * corregir un solo indicador obligaba a volver a marcarlos todos.
   *
   * No se indexa, así que no hace falta subir la versión del esquema: en
   * Dexie `stores()` declara índices, no columnas. Las calificaciones puestas
   * antes simplemente no lo traen, que es justo lo correcto — se pusieron de
   * otra manera.
   */
  niveles_rubrica?: Record<string, number> | null
  /**
   * Nota «fantasma»: la que había en esta casilla antes de que un recálculo
   * (cambiar un examen ya corregido) la sustituyera o la dejara sin nota.
   *
   * Una nota puesta no se pierde nunca: se queda aquí, a la vista —en la
   * matriz sale en una columna duplicada y semitranslúcida— y **no cuenta**.
   * Todo el cálculo lee `valor`, así que no hay nada que excluir en
   * `calculo.ts`. El docente puede recuperarla o descartarla. Sin índice.
   */
  valor_anterior?: number | null
  /** De dónde viene la nota fantasma, para decírselo al docente. */
  anterior_motivo?: string | null
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
  /**
   * Reservados: la programación es por trimestre, no por fechas. Sin
   * interfaz que los escriba, y son la pieza que faltaría para tener
   * temporalización o agenda.
   */
  fecha_inicio?: string
  fecha_fin?: string
  activa: number
  created_at?: string
  /**
   * Lo que trae una programación oficial (PROENS) y la app no tenía dónde
   * guardar: sesiones previstas, % de peso de la unidad en el área y los
   * contenidos («contidos»). Informativos: el cálculo no pondera por unidad.
   * No van indexados, así que no exigen versión nueva del esquema.
   */
  sesiones?: number | null
  peso?: number | null
  contenidos?: string
}

export interface UnidadCriterio extends Sincronizable {
  id?: number
  unidad_id: number
  criterio_id: string
  peso: number
  /**
   * Mínimo de consecución: lo que el docente fija como umbral de superación
   * de este criterio en esta unidad. Es el nivel «suficiente» que la
   * programación oficial pide declarar por criterio y unidad. Sin índice.
   */
  minimo?: string
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
  /**
   * Campo histórico: se escribe siempre a 1.0 y nadie lo lee. Se conserva
   * para no romper lo ya sincronizado. El que manda es `peso_criterio`.
   */
  peso: number
  /**
   * Cuánto pesa ESTE instrumento dentro de ESTE criterio, en tanto por ciento.
   *
   * Sin declarar (`undefined`) el criterio se pondera como siempre: con el
   * peso global del instrumento en el área. Declarado, manda sobre él.
   *
   * Lo que resuelve: un criterio de investigación puede evaluarse con prueba
   * escrita, cuaderno y lista de control a la vez, y el docente querer que
   * cuenten por igual. Con el peso global eso era imposible sin mover el
   * reparto de toda el área, porque el peso del instrumento es uno solo para
   * todos los criterios.
   *
   * Es la misma regla que ya usan los indicadores dentro de una rúbrica (ver
   * `notaDeRubrica`): sin pesos declarados, a partes iguales.
   *
   * No va indexado a propósito: Dexie solo exige subir de versión cuando
   * cambian los índices, así que esto no necesita migración. Y el sync lo
   * arrastra solo, porque `aSobre` serializa el registro entero.
   */
  peso_criterio?: number | null
  /**
   * 1 si este criterio va **vinculado** con los demás criterios marcados del
   * mismo instrumento en esta unidad: calificar uno pone la misma nota en
   * todos. Es para el instrumento que se corrige una vez y cuenta para varios
   * criterios (un cuaderno, una exposición), que antes obligaba a repetir la
   * nota casilla por casilla.
   *
   * Lo declara el docente, nunca se activa solo. Quién va con quién se decide
   * en `vinculos.ts`; la réplica la hace `saveCalificaciones`. Sin índice.
   */
  vinculado?: number | null
}

/**
 * Las rúbricas del banco no cuelgan de ningún instrumento: llevan este valor
 * en `instrumento_id`. Así viven en la misma tabla —se sincronizan y entran en
 * la copia de seguridad sin tocar el esquema ni el servidor— y sobreviven al
 * borrado de la clase en la que nacieron, que arrastra solo las rúbricas de
 * sus instrumentos.
 */
export const INSTRUMENTO_BANCO = 0

export interface Rubrica extends Sincronizable {
  id?: number
  /** Instrumento al que pertenece, o `INSTRUMENTO_BANCO` si es una copia del banco. */
  instrumento_id: number
  titulo: string
  contexto?: string      // descripción SA/UD usada para generar
  criterio_id?: string   // criterio LOMLOE vinculado (opcional)
  niveles_json: string   // JSON: RubricaNivel[]
  indicadores_json: string // JSON: RubricaIndicador[]
  generada_ia: number    // 0 | 1
  created_at?: string
  /**
   * Área y curso en los que se guardó, solo en las copias del banco: es lo que
   * queda para reconocerla cuando la clase de origen ya no existe. Sin índice.
   */
  area?: string
  nivel?: string
  /**
   * `'prueba'` si esta fila no es una rúbrica sino la definición de una prueba
   * escrita (ver `prueba.ts`). Comparte tabla a propósito: se sincroniza, entra
   * en la copia de seguridad y cae con su instrumento sin tocar el esquema ni
   * el servidor. Entonces `niveles_json` e `indicadores_json` van vacíos —una
   * versión anterior de la app la ve como una rúbrica sin nada— y lo que
   * cuenta es `prueba_json`. Sin índice.
   */
  tipo?: 'prueba'
  /** JSON: `PruebaDef`. Solo con `tipo: 'prueba'`. */
  prueba_json?: string
  /**
   * Unidad a la que pertenece el examen, o null si vale para todas las del
   * instrumento. Un mismo instrumento («Prueba escrita») se usa en varias
   * unidades y cada una tiene su examen. Solo con `tipo: 'prueba'`.
   */
  unidad_id?: number | null
}

/**
 * Evidencia de aprendizaje: la producción del alumno capturada en el momento.
 * El blob vive en IndexedDB; nunca sale del dispositivo salvo cifrado.
 */
export type TipoEvidencia = 'foto' | 'audio' | 'video'

export interface Evidencia extends Sincronizable {
  id?: number
  alumno_id: number
  asignatura_id?: number | null
  criterio_id?: string | null
  instrumento_id?: number | null
  unidad_id?: number | null
  trimestre?: number | null
  tipo: TipoEvidencia
  mime: string
  blob: Blob
  /** Duración en milisegundos — solo audio y vídeo */
  duracion_ms?: number | null
  descripcion?: string
  fecha: string
}

/**
 * Diario de evaluación: una observación fechada de un alumno con un
 * instrumento. Varias observaciones no se pisan; la nota del criterio se
 * deriva de todas según `Instrumento.agregacion` (ver `db/diario.ts`).
 */
export interface RegistroDiario extends Sincronizable {
  id?: number
  alumno_id: number
  instrumento_id: number
  unidad_id: number | null
  trimestre: number
  /** ISO-8601 con hora: es lo que ordena los registros. */
  fecha: string
  /** Nivel 1-4. */
  valor: number
  observacion?: string | null
  /**
   * JSON con los criterios (string[]) a los que aplica. Se fija al crear el
   * registro con lo que la programación asigna al instrumento en esa unidad,
   * y nunca está vacío: así la derivación no depende de que la programación
   * haya llegado ya al otro aparato, y retirar un criterio del instrumento
   * no vacía la nota derivada.
   */
  criterios_json: string
  asignatura: string
  curso: string
  etapa: string
  comunidad: string
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

/**
 * Copia de la última versión que este dispositivo y el servidor tenían en
 * común, por registro. Es la «base» de la fusión a tres bandas: sin ella solo
 * se puede saber cuál de las dos versiones es más nueva, no QUÉ cambió cada
 * uno. Con ella, si un dispositivo tocó el nombre y el otro el color, se
 * conservan los dos cambios en vez de perder uno.
 *
 * Los blobs se excluyen: son inmutables una vez creados y ocuparían el doble.
 */
export interface SyncBase {
  clave: string     // `${tabla}:${id}`
  datos: any
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
  diario!: Table<RegistroDiario>
  planos!: Table<Plano>
  asientos!: Table<Asiento>
  meta!: Table<Meta>
  sync_base!: Table<SyncBase>

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

    // v5 — base de la fusión a tres bandas. Tabla nueva y vacía: los
    // registros van entrando a medida que se sincronizan. Mientras un
    // registro no tenga base, el merge cae al last-write-wins de siempre.
    this.version(5).stores({
      sync_base: 'clave',
    })

    // v6 — diario de evaluación. Tabla nueva y vacía. `updated_at` va
    // indexado porque es la consulta del sync. El sello del upgrade es el
    // mismo de la v4, por si algún registro llegara sin él (idempotente).
    this.version(6).stores({
      diario: '++id, alumno_id, instrumento_id, [alumno_id+instrumento_id+trimestre], updated_at',
    }).upgrade(async tx => {
      const sello = new Date().toISOString()
      await tx.table('diario').toCollection().modify(r => {
        if (!r.updated_at) r.updated_at = r.fecha || sello
        if (r.deleted_at === undefined) r.deleted_at = null
      })
    })
  }
}

export const db = new MiClaseDB()

/** Tablas que participan en backup y sincronización, en orden de dependencia. */
export const TABLAS_SINC = [
  'grupos', 'alumnos', 'grupo_alumnos', 'asignaturas', 'instrumentos',
  'unidades', 'unidad_criterios', 'criterio_instrumentos', 'calificaciones', 'diario',
  'sesiones', 'asistencia', 'rubricas', 'evidencias', 'planos', 'asientos',
] as const

export type TablaSinc = typeof TABLAS_SINC[number]
