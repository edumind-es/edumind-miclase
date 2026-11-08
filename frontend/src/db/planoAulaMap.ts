/**
 * Plano de clase con AulaMap (https://aulamap.github.io), de Juan José de Haro.
 *
 * Puro: traduce entre el plano de un grupo de MiClase y una «clase» de
 * AulaMap, que es lo que el editor (frontend/public/aulamap/) lee y guarda.
 *
 * - Lo que se guarda en `Plano.aulamap` es la clase de AulaMap SIN nombres:
 *   cada alumno es `a<id de MiClase>` con su equipo y su tipología. Los
 *   nombres se ponen al abrir, desde el alumnado vivo del grupo, así que un
 *   cambio de nombre o el modo anónimo no dejan copias viejas en el plano.
 * - El alumnado lo manda MiClase: quien ya no está en el grupo se levanta de
 *   su mesa y quien es nuevo aparece en la lista, sin sentar.
 * - Un grupo sin plano de AulaMap estrena uno con la cuadrícula de siempre
 *   (`filas` × `cols` y `asientos`): una mesa individual por casilla y cada
 *   alumno en la suya, para que nadie pierda el plano que ya tenía.
 */

export const PREFIJO_ALUMNO = 'a'

export interface AlumnoPlano {
  id: number
  nombre: string // lo que AulaMap enseña: «Apellidos, Nombre» o el código anónimo
}

export interface AsientoCuadricula {
  alumno_id: number
  fila: number
  col: number
}

// Lo mínimo de la clase de AulaMap que MiClase toca. El resto (equipos,
// formato del nombre, incompatibles, mobiliario…) viaja tal cual.
export interface ObjetoAulaMap {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
  rot: number
  seats?: (string | null)[]
  [k: string]: unknown
}

export interface AlumnoAulaMap {
  id: string
  name?: string
  team?: number
  type?: string
  [k: string]: unknown
}

export interface ClaseAulaMap {
  id: string
  name: string
  room: { w: number; h: number }
  objects: ObjetoAulaMap[]
  students: AlumnoAulaMap[]
  nameFormat?: string
  incompatible?: string[][]
  [k: string]: unknown
}

export const idAulaMap = (alumnoId: number) => `${PREFIJO_ALUMNO}${alumnoId}`

/** El id de MiClase de un alumno de AulaMap, o null si no es de MiClase. */
export function alumnoDeIdAulaMap(id: unknown): number | null {
  if (typeof id !== 'string' || !id.startsWith(PREFIJO_ALUMNO)) return null
  const n = Number(id.slice(PREFIJO_ALUMNO.length))
  return Number.isInteger(n) && n > 0 ? n : null
}

// Medidas de serie de AulaMap (centímetros), las mismas que su catálogo.
const MESA = { w: 70, h: 50 }
const PASO_X = 110
const PASO_Y = 100
const MARGEN_X = 90
const MARGEN_FONDO = 200

/** Una clase de AulaMap nueva a partir de la cuadrícula de siempre. */
export function claseDesdeCuadricula(
  grupoId: number, nombre: string, filas: number, cols: number, asientos: AsientoCuadricula[],
): ClaseAulaMap {
  const room = {
    w: Math.max(600, MARGEN_X * 2 + (cols - 1) * PASO_X + MESA.w),
    h: Math.max(600, MARGEN_FONDO + (filas - 1) * PASO_Y + MESA.h + 120),
  }
  const objects: ObjetoAulaMap[] = [
    { id: 'pantalla', type: 'screen', x: room.w / 2, y: 5, w: 200, h: 10, rot: 0, labelKey: 'label_screen', label: 'Pantalla' },
    { id: 'docente', type: 'teacher', x: 150, y: 85, w: 140, h: 70, rot: 0, labelKey: 'label_teacher', label: 'Mesa del docente' },
    { id: 'puerta', type: 'door', x: room.w - 80, y: room.h - 5, w: 90, h: 10, rot: 0, labelKey: 'label_door', label: 'Puerta' },
  ]
  const x0 = (room.w - ((cols - 1) * PASO_X)) / 2
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < cols; c++) {
      const sentado = asientos.find(a => a.fila === f && a.col === c)
      objects.push({
        id: `mesa-${f}-${c}`, type: 'desk1',
        x: x0 + c * PASO_X, y: MARGEN_FONDO + f * PASO_Y,
        w: MESA.w, h: MESA.h, rot: 0, cols: 1, rows: 1,
        seats: [sentado ? idAulaMap(sentado.alumno_id) : null],
      })
    }
  }
  return { id: `grupo-${grupoId}`, name: nombre, room, objects, students: [], nameFormat: 'first1' }
}

function leer(json: string | null | undefined): ClaseAulaMap | null {
  if (!json) return null
  try {
    const c = JSON.parse(json)
    return c && typeof c === 'object' && c.room && Array.isArray(c.objects) ? c : null
  } catch {
    return null
  }
}

/**
 * La clase que se le da a AulaMap al abrir: la guardada (o una nueva desde
 * la cuadrícula) con el alumnado vivo del grupo y sus nombres.
 */
export function claseParaAulaMap(opts: {
  grupoId: number
  nombreGrupo: string
  guardado: string | null | undefined
  alumnos: AlumnoPlano[]
  filas: number
  cols: number
  asientos: AsientoCuadricula[]
}): ClaseAulaMap {
  const { grupoId, nombreGrupo, alumnos } = opts
  const vivos = new Set(alumnos.map(a => a.id))
  const clase = leer(opts.guardado)
    ?? claseDesdeCuadricula(grupoId, nombreGrupo, opts.filas, opts.cols,
      opts.asientos.filter(a => vivos.has(a.alumno_id)))

  const previos = new Map<string, AlumnoAulaMap>()
  for (const s of clase.students || []) if (s && typeof s.id === 'string') previos.set(s.id, s)

  const students: AlumnoAulaMap[] = alumnos.map(a => {
    const id = idAulaMap(a.id)
    const antes = previos.get(id)
    const s: AlumnoAulaMap = { id, name: a.nombre }
    if (antes && Number.isInteger(antes.team) && (antes.team as number) > 0) s.team = antes.team
    if (antes && ['A', 'B', 'C'].includes(antes.type as string)) s.type = antes.type
    return s
  })
  const ids = new Set(students.map(s => s.id))

  // Un alumno solo puede ocupar un puesto; quien ya no está, se levanta.
  const yaSentado = new Set<string>()
  const objects = clase.objects.map(o => {
    if (!Array.isArray(o.seats)) return o
    const seats = o.seats.map(v => {
      if (typeof v !== 'string' || !ids.has(v) || yaSentado.has(v)) return null
      yaSentado.add(v)
      return v
    })
    return { ...o, seats }
  })

  const incompatible = (Array.isArray(clase.incompatible) ? clase.incompatible : [])
    .map(g => (Array.isArray(g) ? g.filter(id => ids.has(id)) : []))
    .filter(g => g.length >= 2)

  return { ...clase, id: `grupo-${grupoId}`, name: nombreGrupo, objects, students, incompatible }
}

/**
 * Lo que se guarda en `Plano.aulamap`: la clase sin nombres de alumnado, sin
 * alumnos ajenos a MiClase y en JSON estable (mismo plano → mismo texto, para
 * no reescribir el registro ni sincronizar si nada cambió).
 */
export function claseParaGuardar(clase: ClaseAulaMap): string {
  const students = (clase.students || [])
    .filter(s => alumnoDeIdAulaMap(s.id) != null)
    .map(s => {
      const { name: _nombre, ...resto } = s
      return resto
    })
  const ids = new Set(students.map(s => s.id))
  const objects = (clase.objects || []).map(o =>
    Array.isArray(o.seats) ? { ...o, seats: o.seats.map(v => (typeof v === 'string' && ids.has(v) ? v : null)) } : o)
  const incompatible = (Array.isArray(clase.incompatible) ? clase.incompatible : [])
    .map(g => (Array.isArray(g) ? g.filter(id => ids.has(id)) : []))
    .filter(g => g.length >= 2)
  const { name: _n, ...resto } = clase
  return JSON.stringify({ ...resto, objects, students, incompatible })
}

/** Cuántos puestos hay y quién está sentado (alumnos de MiClase). */
export function resumenPlano(clase: ClaseAulaMap | null): { puestos: number; sentados: number[] } {
  if (!clase) return { puestos: 0, sentados: [] }
  let puestos = 0
  const sentados: number[] = []
  for (const o of clase.objects || []) {
    if (!Array.isArray(o.seats)) continue
    puestos += o.seats.length
    for (const v of o.seats) {
      const id = alumnoDeIdAulaMap(v)
      if (id != null) sentados.push(id)
    }
  }
  return { puestos, sentados }
}

export function leerPlanoGuardado(json: string | null | undefined): ClaseAulaMap | null {
  return leer(json)
}
