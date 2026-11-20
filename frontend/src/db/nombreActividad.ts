/**
 * El nombre de un instrumento o de una actividad, unidad a unidad.
 *
 * Luis renombró con el lápiz una actividad en una unidad y le cambió en
 * todas: «Lo que se edita en una ud, se queda en esa ud salvo que se indique
 * lo contrario». El nombre de siempre (`Instrumento.nombre`) es el general;
 * `Instrumento.nombres_unidad` guarda, por unidad, el nombre propio de quien
 * lo tenga distinto. Puro: no toca la base.
 */
import type { Instrumento } from './localDb'

type ConNombre = Pick<Instrumento, 'nombre' | 'nombres_unidad'>

/** El nombre propio de la unidad, si lo tiene y dice algo. */
function propio(ins: ConNombre, unidad_id: number | null | undefined): string | null {
  if (!unidad_id) return null
  const v = ins.nombres_unidad?.[String(unidad_id)]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Cómo se llama en la unidad que se mira; sin unidad («Todo el curso»), el general. */
export function nombreEnUnidad(ins: ConNombre, unidad_id: number | null | undefined): string {
  return propio(ins, unidad_id) ?? ins.nombre
}

/** En esa unidad se llama distinto que en las demás. */
export function tieneNombrePropio(ins: ConNombre, unidad_id: number | null | undefined): boolean {
  const p = propio(ins, unidad_id)
  return p != null && p !== ins.nombre
}

/**
 * Lo que hay que guardar al renombrar. Con unidad, solo cambia el nombre de
 * esa unidad (y si vuelve a ser el general, deja de tener nombre propio). Sin
 * unidad cambia el general y se quitan los propios: «en todas» es en todas.
 * Devuelve null si el nombre está vacío.
 */
export function alRenombrar(
  ins: ConNombre, nombre: string, unidad_id: number | null | undefined,
): { nombre: string; nombres_unidad: Record<string, string> | null } | null {
  const limpio = nombre.trim()
  if (!limpio) return null
  if (!unidad_id) return { nombre: limpio, nombres_unidad: null }
  const propios: Record<string, string> = {}
  for (const [k, v] of Object.entries(ins.nombres_unidad ?? {})) {
    if (typeof v === 'string' && v.trim() && v.trim() !== ins.nombre) propios[k] = v.trim()
  }
  if (limpio === ins.nombre) delete propios[String(unidad_id)]
  else propios[String(unidad_id)] = limpio
  return { nombre: ins.nombre, nombres_unidad: Object.keys(propios).length ? propios : null }
}
