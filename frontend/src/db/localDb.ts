import Dexie, { type Table } from 'dexie'
import {
  prepararContexto, unidadParaFila, anotar, resumenVacio, criteriosDeRegistro, CLAVE_RESUMEN_MIGRACION,
} from './migracionUnidades'

/** Versión actual del esquema Dexie. La copia de seguridad la lleva también. */
export const VERSION_ESQUEMA = 10

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

/**
 * Cómo se obtiene la nota final del curso a partir de las de los tres
 * trimestres. 'ponderada' es lo de siempre (media por `pesos_trimestres`);
 * las demás las pidió Luis porque no todos los docentes la calculan así.
 */
export type ReglaFinal = 'ponderada' | 'continua' | 'maxima' | 'mediana'

/**
 * Cómo pasa la nota de los criterios a la del área en cada trimestre.
 * 'instrumento' (por defecto): cada instrumento vale la media de sus
 * criterios y el área pondera los instrumentos por su peso (el 80/20 de la
 * programación). 'criterio': media de los criterios por su peso, con el
 * instrumento pesando solo dentro de cada criterio. Ver `REGLAS_AREA`.
 */
export type ReglaArea = 'instrumento' | 'criterio'

/**
 * Cómo cuentan las unidades de un trimestre al fundir sus notas. 'iguales':
 * cada unidad cuenta lo mismo (lo de siempre). 'peso': cada una por el peso
 * que le da la programación (`Unidad.peso`, el «% Peso» de PROENS). Ver
 * `REGLAS_UNIDADES` en `calculo.ts`.
 */
export type ReglaUnidades = 'iguales' | 'peso'

export interface Asignatura extends Sincronizable {
  id?: number
  grupo_id: number
  nombre: string
  nombre_display: string
  comunidad: string
  pesos_trimestres: string
  /**
   * Regla de la nota final (ver `ReglaFinal`). Sin declarar vale 'ponderada'.
   * Sin índice: no exige versión de esquema. Se aplica igual a la final de
   * cada criterio y a la del área (`notaFinal` en `calculo.ts`).
   */
  regla_final?: ReglaFinal | null
  /** Regla de la nota del área (ver `ReglaArea`). Sin declarar vale 'instrumento'. Sin índice. */
  regla_area?: ReglaArea | null
  /**
   * Cómo cuentan las unidades de un trimestre (ver `ReglaUnidades`). Sin
   * declarar vale 'iguales'. Sin índice.
   */
  regla_unidades?: ReglaUnidades | null
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
  /**
   * Familia de la que cuelga este instrumento, si es un hijo.
   *
   * Lo que trae una programación oficial («Proba escrita» 80 %, «Táboa de
   * indicadores» 20 %) no son instrumentos sino FAMILIAS: dentro de cada una
   * el docente mete lo que de verdad hace —el examen de cada unidad, el
   * billete de salida, speaking, listening—. Un hijo tiene nombre, tipo y
   * criterios propios (un subconjunto de los de su familia en cada unidad) y
   * su `peso` es relativo DENTRO de la familia (1 por defecto: todos los hijos
   * cuentan igual). La familia entra en la nota del área con su peso de
   * siempre. Sin índice: no exige versión de esquema. Null o ausente = es
   * una familia (o un instrumento suelto, que es lo mismo).
   */
  familia_id?: number | null
  /** Color propio (#rrggbb). Sin él, el que le toca por orden (`colorDeInstrumento`). Sin índice. */
  color?: string | null
  /**
   * Instrumento propio del alumnado con medida (refuerzo educativo): solo
   * cuenta para quien lo incluya en su medida (`Medida.pesos_json`); para el
   * resto pesa 0 y su casilla sale apagada. Por lo demás es un instrumento
   * normal (familia o hijo, rúbrica, examen, programación por unidad). Sin
   * índice: no exige versión de esquema.
   */
  solo_medidas?: number | null
}

export type TipoMedida = 'adaptacion' | 'refuerzo'

/**
 * Medida de atención a la diversidad de un alumno en un área (esquema v8).
 *
 * La programación manda para toda la clase; la medida ajusta el CÁLCULO de
 * ese alumno, no la programación. Una fila viva por alumno, área y tipo
 * (si llegan dos por sync, cuenta la de `updated_at` más reciente).
 * Es dato de NEAE: se ofrece y se enseña solo con el interruptor encendido
 * (`db/datosSensibles.ts`), pero la nota se calcula siempre con ella.
 */
export interface Medida extends Sincronizable {
  id?: number
  alumno_id: number
  asignatura_id: number
  tipo: TipoMedida
  /** JSON '[1,2,3]': trimestres en los que aplica (misma forma que `Instrumento.trimestres`). */
  trimestres: string
  /** Texto libre del docente (motivo, referencia al informe). */
  descripcion?: string | null
  /** refuerzo: JSON `{ [instrumento_id]: peso }`. 0 = no cuenta. Familias e hijos. */
  pesos_json?: string | null
  /**
   * adaptación: JSON `{ [criterio_id]: null | { codigo, descripcion, curso } }`.
   * null = el criterio no cuenta; objeto = sustituido por ese texto (la nota
   * se guarda en la casilla del criterio de la clase). Lo que no aparece se
   * evalúa igual que al resto.
   */
  criterios_json?: string | null
  /** adaptación: '4º' si los sustitutos vienen de otro curso del currículo. */
  curso_referencia?: string | null
  created_at?: string
}

/** Con quién es la tutoría. 'grupo' es la de toda la clase y puede ir sin alumno. */
export type TipoTutoria = 'familia' | 'alumno' | 'equipo' | 'grupo'
export type ModalidadTutoria = 'presencial' | 'telefono' | 'videollamada'
/** Estado de un acuerdo: se revisa en las tutorías siguientes. */
export type EstadoAcuerdo = 'pendiente' | 'cumplido' | 'no_cumplido'

/** Quién estuvo: texto libre y su papel (madre, padre, orientadora…). */
export interface AsistenteTutoria { nombre: string; rol: string }
/** Un apartado de texto del acta (temas tratados, situación, observaciones…). */
export interface ApartadoTutoria { clave: string; titulo: string; texto: string }
/** Un punto del orden del día y si se llegó a tratar. */
export interface PuntoOrdenDia { texto: string; tratado: boolean }
export interface AcuerdoTutoria {
  /** Clave estable dentro de la tutoría, para marcarlo desde otra. */
  clave: string
  texto: string
  responsable?: string
  /** 'AAAA-MM-DD' o vacío. */
  fecha_prevista?: string | null
  estado: EstadoAcuerdo
  /** Día en que se revisó (cumplido o no). */
  fecha_revision?: string | null
  nota_revision?: string | null
}

/**
 * Una tutoría (esquema v9). Es de la clase (`grupo_id`) y nombra a sus
 * alumnos en `alumnos`, un array con índice multiEntry: así la ficha de un
 * alumno encuentra su historial sin recorrer la tabla. Los apartados son una
 * COPIA del modelo al crearla: cambiar el modelo después no reescribe actas.
 * Las listas van como arrays de verdad (la fusión los compara como JSON).
 */
export interface Tutoria extends Sincronizable {
  id?: number
  grupo_id: number
  /** Fecha y hora local, 'AAAA-MM-DDTHH:mm' (ordena como texto). */
  fecha: string
  tipo: TipoTutoria
  modalidad: ModalidadTutoria
  alumnos: number[]
  asistentes: AsistenteTutoria[]
  /** 'serie:familia' o 'propio:<id>'; solo informativo. */
  modelo_clave?: string | null
  modelo_nombre?: string | null
  orden_dia: PuntoOrdenDia[]
  apartados: ApartadoTutoria[]
  acuerdos: AcuerdoTutoria[]
  /** Próxima cita prevista, 'AAAA-MM-DDTHH:mm' o vacío. */
  proxima_cita?: string | null
  proxima_cita_nota?: string | null
  /** Copiado del modelo: el editor abre a la vista los acuerdos pendientes de antes. */
  con_seguimiento?: boolean
  /** Acuerdos de tutorías anteriores revisados en esta, para el acta. */
  revisados?: { tutoria_id: number; clave: string }[]
  created_at?: string
}

/**
 * Un modelo de tutoría propio del docente (esquema v9). No cuelga de ninguna
 * clase: sirve para todas y sobrevive al borrado de una. Los modelos de serie
 * viven en el código (`MODELOS_DE_SERIE`, `db/tutorias.ts`), no en la tabla:
 * sembrarlos en cada aparato los duplicaría al sincronizar.
 */
export interface ModeloTutoria extends Sincronizable {
  id?: number
  nombre: string
  tipo: TipoTutoria
  modalidad: ModalidadTutoria
  /** Apartados de texto en su orden, con el texto de partida. */
  apartados: ApartadoTutoria[]
  /** Puntos del orden del día. */
  orden_dia: string[]
  /** Si el acta trae la revisión de los acuerdos pendientes del alumnado. */
  con_seguimiento: boolean
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
  /**
   * Unidad en la que se anotó. Desde la v7 forma parte de la clave de la
   * casilla: el mismo criterio con el mismo instrumento en dos unidades del
   * trimestre son dos notas distintas. `SIN_UNIDAD` (0) solo en filas
   * antiguas que ninguna unidad pudo acoger (`db/migracionUnidades.ts`).
   */
  unidad_id: number
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
  /**
   * Solo en memoria, nunca en la base: la nota de una familia fundida a
   * partir de las de sus hijos (`fundirHijosEnFamilias`). No tiene `id`.
   */
  virtual?: boolean
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
 * sus instrumentos. Los exámenes del banco de pruebas (`tipo: 'prueba'`)
 * llevan el mismo valor, por las mismas razones.
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
   * unidades y cada una tiene su examen. Desde nov 2026 también una
   * rúbrica puede ser de una unidad: se usa en ella en vez de la general
   * (`getRubrica`). Un aparato sin actualizar no las distingue.
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
  /** Parte de la clave desde la v7, como en `Calificacion`. */
  unidad_id: number
  trimestre: number
  /** ISO-8601 con hora: es lo que ordena los registros. */
  fecha: string
  /** Nivel 1-4. Si el registro trae `nota`, es su equivalente redondeado. */
  valor: number
  /**
   * Nota 0-10 cuando el registro es una observación con rúbrica, no un nivel
   * del diario. Es lo que cuenta en la agregación (`notaDeRegistro`); `valor`
   * queda para que un aparato con la app anterior derive algo parecido hasta
   * actualizarse. Sin índice: no exige versión de esquema.
   */
  nota?: number | null
  /** Nivel marcado en cada indicador de la rúbrica en esa observación. Sin índice. */
  niveles_rubrica?: Record<string, number> | null
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

/**
 * Sesión planificada de una clase (esquema v9): lo que el docente prevé hacer
 * en una franja de un día. Llega por volcado de un .md
 * (`planificacion/semanal.ts`) o se escribe a mano. Es una previsión, no un
 * registro de aula: no toca notas ni asistencia. El área y la unidad se
 * enlazan si casan (`asignatura_id`, `unidad_id`), pero el texto tal cual se
 * conserva siempre (`area`, `unidad_texto`) para que lo que no casa no se
 * pierda. Sin índice salvo grupo y fecha.
 */
export type TipoSesionPlan = 'clase' | 'especialista' | 'centro'

export interface FaseSecuencia {
  fase: string
  minutos: number | null
  texto: string
}

/** Criterio anclado: el código tal como venía y, si casó, el del currículo. */
export interface CriterioAnclado {
  codigo: string
  criterio_id: string | null
}

export interface SesionPlan extends Sincronizable {
  id?: number
  grupo_id: number
  /** YYYY-MM-DD, día local. */
  fecha: string
  /** «1ª», «2ª»… si venía; null en una sesión suelta. */
  franja?: string | null
  /** «9:00». */
  hora_inicio: string
  hora_fin: string
  /** El área tal como venía escrita. */
  area: string
  asignatura_id?: number | null
  unidad_id?: number | null
  /** «UD3 · El poder de las palabras». */
  unidad_texto?: string | null
  titulo: string
  tipo: TipoSesionPlan
  /** 1 si lleva ■: hay algo que calificar. */
  evaluable: number
  objetivo?: string | null
  /** JSON: FaseSecuencia[]. */
  secuencia_json?: string | null
  recursos?: string | null
  evaluacion?: string | null
  /** JSON: CriterioAnclado[]. */
  criterios_json?: string | null
  /** «9:00-10:40» cuando la sesión es parte de un bloque de varias franjas. */
  bloque?: string | null
  origen?: 'volcado' | 'manual' | null
  /**
   * La sesión salió de una IA (una propuesta volcada), aunque el docente la
   * haya retocado. Marca legible por máquina del AI Act (art. 50.2), como en
   * rúbricas y exámenes: se conserva al editar y viaja en el .md exportado
   * (`MARCA_IA` en `planificacion/semanal.ts`). Sin índice.
   */
  generada_ia?: boolean
  created_at?: string
}

/** Grupo de un evento que vale para todas las clases del docente. */
export const TODAS_LAS_CLASES = 0

export type TipoEvento = 'festivo' | 'centro' | 'evaluacion' | 'reunion' | 'nota' | 'otro'

/** Evento del calendario (esquema v9): festivos, actividades, evaluaciones, reuniones. */
export interface EventoCalendario extends Sincronizable {
  id?: number
  /** Clase a la que pertenece, o `TODAS_LAS_CLASES` (0). */
  grupo_id: number
  fecha: string
  /** Último día, incluido, si dura varios. */
  fecha_fin?: string | null
  hora?: string | null
  tipo: TipoEvento
  titulo: string
  notas?: string | null
  origen?: 'volcado' | 'manual' | null
  created_at?: string
}

// Plano de clase: dimensiones de la cuadrícula por grupo
export interface Plano extends Sincronizable {
  id?: number
  grupo_id: number
  filas: number
  cols: number
  // Plano dibujado con AulaMap (db/planoAulaMap.ts): JSON de la clase de
  // AulaMap sin nombres de alumnado. Sin índice: no cambia el esquema.
  aulamap?: string | null
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

export class MiClaseDB extends Dexie {
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
  medidas!: Table<Medida>
  tutorias!: Table<Tutoria>
  modelos_tutoria!: Table<ModeloTutoria>
  planificacion!: Table<SesionPlan>
  eventos!: Table<EventoCalendario>

  /**
   * `hasta` limita las versiones declaradas. La app usa la última; la puerta
   * de migración (`PuertaMigracion`) abre con la instalada para hacer la
   * copia de seguridad SIN disparar el upgrade.
   */
  constructor(hasta: number = VERSION_ESQUEMA) {
    super('miclase_db')
    if (hasta >= 1) this.version(1).stores({
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
    if (hasta >= 2) this.version(2).stores({
      rubricas: '++id, instrumento_id',
    })
    if (hasta >= 3) this.version(3).stores({
      evidencias: '++id, alumno_id, criterio_id, [alumno_id+criterio_id]',
      planos:     '++id, grupo_id',
      asientos:   '++id, grupo_id, [grupo_id+alumno_id], [grupo_id+fila+col]',
    })
    // v4 — vínculo criterio↔instrumento + metadatos de sincronización.
    // `updated_at` se indexa en todas las tablas: es la consulta que hace
    // el sync para saber qué ha cambiado desde el último envío.
    if (hasta >= 4) this.version(4).stores({
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
    if (hasta >= 5) this.version(5).stores({
      sync_base: 'clave',
    })

    // v6 — diario de evaluación. Tabla nueva y vacía. `updated_at` va
    // indexado porque es la consulta del sync. El sello del upgrade es el
    // mismo de la v4, por si algún registro llegara sin él (idempotente).
    if (hasta >= 6) this.version(6).stores({
      diario: '++id, alumno_id, instrumento_id, [alumno_id+instrumento_id+trimestre], updated_at',
    }).upgrade(async tx => {
      const sello = new Date().toISOString()
      await tx.table('diario').toCollection().modify(r => {
        if (!r.updated_at) r.updated_at = r.fecha || sello
        if (r.deleted_at === undefined) r.deleted_at = null
      })
    })

    // v7 — unidades estancas. La unidad entra en la clave de la casilla
    // (calificaciones) y del registro (diario). Las filas sin unidad reciben
    // una con la regla de `migracionUnidades.ts` y se vuelven a sellar para
    // que el siguiente sync las lleve con su unidad. Antes de llegar aquí la
    // app ha ofrecido una copia de seguridad (`PuertaMigracion`).
    if (hasta >= 7) this.version(7).stores({
      calificaciones: '++id, instrumento_id, alumno_id, [alumno_id+instrumento_id+criterio_id+trimestre+unidad_id], updated_at',
      diario:         '++id, alumno_id, instrumento_id, [alumno_id+instrumento_id+trimestre+unidad_id], updated_at',
    }).upgrade(async tx => {
      const sello = new Date().toISOString()
      const ctx = prepararContexto({
        unidades: await tx.table('unidades').toArray(),
        instrumentos: await tx.table('instrumentos').toArray(),
        criterio_instrumentos: await tx.table('criterio_instrumentos').toArray(),
      })
      const resumen = resumenVacio()
      await tx.table('calificaciones').toCollection().modify(c => {
        if (!c.updated_at) c.updated_at = c.fecha || sello
        if (c.deleted_at === undefined) c.deleted_at = null
        const r = unidadParaFila({ ...c, criterios: [c.criterio_id] }, ctx)
        if (anotar(resumen, r.motivo)) { c.unidad_id = r.unidad_id; c.updated_at = sello }
      })
      await tx.table('diario').toCollection().modify(d => {
        if (!d.updated_at) d.updated_at = d.fecha || sello
        if (d.deleted_at === undefined) d.deleted_at = null
        const r = unidadParaFila({ ...d, criterios: criteriosDeRegistro(d) }, ctx)
        if (anotar(resumen, r.motivo)) { d.unidad_id = r.unidad_id; d.updated_at = sello }
      })
      try {
        localStorage.setItem(CLAVE_RESUMEN_MIGRACION, JSON.stringify({ ...resumen, fecha: sello }))
      } catch { /* sin localStorage no hay aviso, pero la migración vale igual */ }
    })

    // v8 — medidas de atención a la diversidad (adaptación curricular y
    // refuerzo educativo) por alumno y área. Tabla nueva y vacía: no toca
    // ninguna fila, así que la puerta de migración no pide copia (ver
    // `VERSION_PUERTA`). `updated_at` indexado porque es la consulta del sync.
    if (hasta >= 8) this.version(8).stores({
      medidas: '++id, alumno_id, asignatura_id, [alumno_id+asignatura_id], updated_at',
    }).upgrade(async tx => {
      const sello = new Date().toISOString()
      await tx.table('medidas').toCollection().modify(r => {
        if (!r.updated_at) r.updated_at = r.created_at || sello
        if (r.deleted_at === undefined) r.deleted_at = null
      })
    })

    // v9 — seguimiento de tutorías y sus modelos. Dos tablas nuevas y
    // vacías: no tocan ninguna fila existente, así que no pasan por la
    // puerta de migración. `*alumnos` es multiEntry: el historial de un
    // alumno sale del índice. El sello es el de siempre (idempotente).
    if (hasta >= 9) this.version(9).stores({
      tutorias:        '++id, grupo_id, fecha, *alumnos, updated_at',
      modelos_tutoria: '++id, updated_at',
    }).upgrade(async tx => {
      const sello = new Date().toISOString()
      for (const t of ['tutorias', 'modelos_tutoria']) {
        await tx.table(t).toCollection().modify(r => {
          if (!r.updated_at) r.updated_at = r.created_at || sello
          if (r.deleted_at === undefined) r.deleted_at = null
        })
      }
    })

    // v10 — planificación semanal y calendario. Dos tablas nuevas y vacías:
    // tampoco tocan filas existentes, así que la puerta no pide copia.
    if (hasta >= 10) this.version(10).stores({
      planificacion: '++id, grupo_id, fecha, [grupo_id+fecha], updated_at',
      eventos:       '++id, grupo_id, fecha, updated_at',
    }).upgrade(async tx => {
      const sello = new Date().toISOString()
      for (const t of ['planificacion', 'eventos']) {
        await tx.table(t).toCollection().modify(r => {
          if (!r.updated_at) r.updated_at = r.created_at || sello
          if (r.deleted_at === undefined) r.deleted_at = null
        })
      }
    })
  }
}

/**
 * Última versión del esquema que modifica filas existentes. Una base por
 * debajo pasa por `PuertaMigracion` (copia cifrada antes de abrir); una base
 * entre esta y `VERSION_ESQUEMA` solo gana tablas vacías y abre directa.
 */
export const VERSION_PUERTA = 7

export const db = new MiClaseDB()

/** Tablas que participan en backup y sincronización, en orden de dependencia. */
export const TABLAS_SINC = [
  'grupos', 'alumnos', 'grupo_alumnos', 'asignaturas', 'instrumentos',
  'unidades', 'unidad_criterios', 'criterio_instrumentos', 'calificaciones', 'diario',
  'sesiones', 'asistencia', 'rubricas', 'evidencias', 'planos', 'asientos', 'medidas',
  'tutorias', 'modelos_tutoria', 'planificacion', 'eventos',
] as const

export type TablaSinc = typeof TABLAS_SINC[number]
