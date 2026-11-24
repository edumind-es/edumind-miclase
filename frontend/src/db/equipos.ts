/**
 * Equipos y agrupamientos de una clase. Puro: sin base de datos ni pantalla.
 *
 * Un agrupamiento («Equipos de proyecto») es de la clase y puede decir para
 * qué área o unidad vale; sin decirlo vale para todas. Dentro lleva sus
 * equipos, y un alumno va en uno solo de cada agrupamiento.
 */
import type { Agrupamiento, Equipo } from './localDb'

type Borrador = Omit<Agrupamiento, 'id' | 'updated_at' | 'deleted_at' | 'created_at'> & { id?: number }

/** Clave nueva para un equipo: no se repite dentro del agrupamiento. */
export function claveNueva(equipos: Equipo[]): string {
  let n = equipos.length + 1
  while (equipos.some(e => e.clave === `e${n}`)) n++
  return `e${n}`
}

/** Un equipo vacío con el nombre que le toca por orden («Equipo 3»). */
export function equipoNuevo(equipos: Equipo[], nombre?: string): Equipo {
  return { clave: claveNueva(equipos), nombre: nombre?.trim() || `Equipo ${equipos.length + 1}`, alumnos: [] }
}

/**
 * Lo que se guarda: nombres recortados, la unidad solo si hay área, y cada
 * alumno una sola vez (se queda en el primer equipo que lo nombre).
 */
export function normalizarAgrupamiento<T extends Borrador>(a: T): T {
  const vistos = new Set<number>()
  const equipos: Equipo[] = []
  for (const e of a.equipos ?? []) {
    const alumnos = (e.alumnos ?? []).filter(id => Number.isInteger(id) && !vistos.has(id) && (vistos.add(id), true))
    const sinClave = !e.clave || equipos.some(x => x.clave === e.clave)
    equipos.push({
      clave: sinClave ? claveNueva(equipos) : e.clave,
      nombre: e.nombre?.trim() || `Equipo ${equipos.length + 1}`,
      alumnos,
    })
  }
  const asignatura_id = a.asignatura_id ?? null
  return {
    ...a,
    nombre: a.nombre?.trim() || 'Equipos',
    asignatura_id,
    unidad_id: asignatura_id == null ? null : (a.unidad_id ?? null),
    equipos,
  }
}

/** El equipo de un alumno en un agrupamiento, o null si está sin equipo. */
export function equipoDeAlumno(a: Pick<Agrupamiento, 'equipos'>, alumno_id: number): Equipo | null {
  return a.equipos.find(e => e.alumnos.includes(alumno_id)) ?? null
}

/** Los alumnos de la lista que no están en ningún equipo, en el orden dado. */
export function sinEquipo(a: Pick<Agrupamiento, 'equipos'>, alumnos: number[]): number[] {
  const dentro = new Set(a.equipos.flatMap(e => e.alumnos))
  return alumnos.filter(id => !dentro.has(id))
}

/**
 * Pone a un alumno en un equipo (por su clave) o lo deja sin equipo (null).
 * Sale del que tuviera: nunca está en dos.
 */
export function moverAlumno(equipos: Equipo[], alumno_id: number, clave: string | null): Equipo[] {
  return equipos.map(e => {
    const sin = e.alumnos.filter(id => id !== alumno_id)
    return { ...e, alumnos: e.clave === clave ? [...sin, alumno_id] : sin }
  })
}

/** Quita de los equipos a quien ya no es de la clase. */
export function sinBajas(equipos: Equipo[], alumnosDeLaClase: number[]): Equipo[] {
  const vivos = new Set(alumnosDeLaClase)
  return equipos.map(e => ({ ...e, alumnos: e.alumnos.filter(id => vivos.has(id)) }))
}

/**
 * Reparte al alumnado al azar en `cuantos` equipos lo más parejos posible
 * (la diferencia entre dos equipos es de uno como mucho). Conserva la clave
 * y el nombre de los equipos que ya había; `azar` se puede fijar en pruebas.
 */
export function repartirAlAzar(
  alumnos: number[], cuantos: number, previos: Equipo[] = [], azar: () => number = Math.random,
): Equipo[] {
  const n = Math.max(1, Math.min(Math.floor(cuantos) || 1, Math.max(1, alumnos.length)))
  const barajados = [...alumnos]
  for (let i = barajados.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[barajados[i], barajados[j]] = [barajados[j], barajados[i]]
  }
  const equipos: Equipo[] = []
  for (let i = 0; i < n; i++) {
    const previo = previos[i]
    equipos.push(previo ? { ...previo, alumnos: [] } : equipoNuevo(equipos))
  }
  barajados.forEach((id, i) => equipos[i % n].alumnos.push(id))
  return equipos
}

/** Cuántos equipos hacen falta para que tengan `tamano` miembros (el último, los que queden). */
export function equiposPorTamano(alumnos: number, tamano: number): number {
  const t = Math.max(1, Math.floor(tamano) || 1)
  return Math.max(1, Math.ceil(alumnos / t))
}

/**
 * Los agrupamientos que valen para un área y una unidad, del más concreto al
 * más general: primero el de esa unidad, después el de esa área, después los
 * de toda la clase. Sin área, solo los de toda la clase.
 */
export function agrupamientosPara<T extends Pick<Agrupamiento, 'asignatura_id' | 'unidad_id'>>(
  lista: T[], asignatura_id?: number | null, unidad_id?: number | null,
): T[] {
  const peso = (a: T) => a.unidad_id != null ? 0 : a.asignatura_id != null ? 1 : 2
  return lista
    .filter(a => a.asignatura_id == null
      || (a.asignatura_id === asignatura_id && (a.unidad_id == null || a.unidad_id === unidad_id)))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => peso(x.a) - peso(y.a) || x.i - y.i)
    .map(x => x.a)
}

/** Para qué vale, dicho al docente. */
export function alcanceDeAgrupamiento(
  a: Pick<Agrupamiento, 'asignatura_id' | 'unidad_id'>,
  areas: { id?: number; nombre_display: string }[], unidades: { id?: number; nombre: string }[],
): string {
  if (a.asignatura_id == null) return 'Todas las áreas'
  const area = areas.find(x => x.id === a.asignatura_id)?.nombre_display ?? 'Un área que ya no existe'
  if (a.unidad_id == null) return area
  const unidad = unidades.find(u => u.id === a.unidad_id)?.nombre
  return unidad ? `${area} · ${unidad}` : area
}
