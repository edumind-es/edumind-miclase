/**
 * Unidades estancas: qué unidad le toca a una nota o a un registro del
 * diario que no la trae.
 *
 * Desde la v7 del esquema la casilla se identifica por alumno, instrumento,
 * criterio, trimestre Y unidad. Antes la unidad era solo trazabilidad y podía
 * faltar. IndexedDB no indexa una fila con la unidad en blanco, así que toda
 * fila tiene que llevar un número antes de que la app vuelva a leerla.
 *
 * Puro: aquí no se toca la base. Lo usan la migración del esquema
 * (`localDb.ts`), la restauración de copias anteriores (`importarDatos`) y la
 * reconciliación tras un sync con un aparato sin actualizar.
 *
 * Regla, en orden:
 *   1. la unidad que la fila ya guarda («propia»);
 *   2. entre las unidades del trimestre de esa área, la que programa ese
 *      criterio con ese instrumento («programada»);
 *   3. si solo hay una unidad en el trimestre, esa («unica»);
 *   4. si hay varias y ninguna lo programa, la primera por orden («primera»);
 *   5. si el área no tiene unidades, `SIN_UNIDAD` («ninguna»): la fila sigue
 *      contando en «Todo el curso» pero ninguna pestaña de unidad la enseña.
 */

/** Unidad ficticia para filas que no se pueden colocar en ninguna. */
export const SIN_UNIDAD = 0

/**
 * La unidad que lleva la clave cuando la pantalla no tiene ninguna: un área
 * sin unidades califica en el cajón `SIN_UNIDAD`. Con unidades, la pantalla
 * siempre tiene una (en «Todo el curso» no se califica).
 */
export const claveUnidad = (unidadId: number | null | undefined): number => unidadId ?? SIN_UNIDAD

export type UnidadMin = {
  id?: number
  asignatura_id: number
  trimestre?: number | null
  orden?: number
  deleted_at?: string | null
}
export type InstrumentoMin = { id?: number; asignatura_id: number; deleted_at?: string | null }
export type CriterioInstrumentoMin = {
  unidad_id: number
  criterio_id: string
  instrumento_id: number
  deleted_at?: string | null
}

export type FilaSinUnidad = {
  instrumento_id: number
  trimestre: number
  unidad_id?: number | null
  /** Criterios que toca la fila: uno en una calificación, varios en un registro del diario. */
  criterios: string[]
}

export type MotivoUnidad = 'propia' | 'programada' | 'unica' | 'primera' | 'ninguna'

export type ContextoUnidades = {
  unidades: UnidadMin[]
  instrumentos: InstrumentoMin[]
  criterio_instrumentos: CriterioInstrumentoMin[]
}

const vivas = <T extends { deleted_at?: string | null }>(xs: T[]) => xs.filter(x => !x.deleted_at)

/** Índices que evitan recorrer las tablas una vez por fila. */
export function prepararContexto(ctx: ContextoUnidades) {
  const areaDeInstrumento = new Map<number, number>()
  for (const i of vivas(ctx.instrumentos)) if (i.id != null) areaDeInstrumento.set(i.id, i.asignatura_id)

  const unidadesDeArea = new Map<number, UnidadMin[]>()
  for (const u of vivas(ctx.unidades)) {
    if (u.id == null) continue
    unidadesDeArea.set(u.asignatura_id, [...(unidadesDeArea.get(u.asignatura_id) ?? []), u])
  }
  for (const lista of unidadesDeArea.values()) {
    lista.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || (a.id ?? 0) - (b.id ?? 0))
  }

  const programa = new Set<string>()
  for (const f of vivas(ctx.criterio_instrumentos)) programa.add(`${f.unidad_id}|${f.criterio_id}|${f.instrumento_id}`)

  return { areaDeInstrumento, unidadesDeArea, programa }
}

export type ContextoPreparado = ReturnType<typeof prepararContexto>

export function unidadParaFila(
  fila: FilaSinUnidad, ctx: ContextoPreparado
): { unidad_id: number; motivo: MotivoUnidad } {
  if (fila.unidad_id != null) return { unidad_id: fila.unidad_id, motivo: 'propia' }

  const area = ctx.areaDeInstrumento.get(fila.instrumento_id)
  const todas = area != null ? ctx.unidadesDeArea.get(area) ?? [] : []
  // Las del trimestre y las que no declaran ninguno; si no hay, cualquiera del área.
  let candidatas = todas.filter(u => u.trimestre == null || u.trimestre === fila.trimestre)
  if (!candidatas.length) candidatas = todas
  if (!candidatas.length) return { unidad_id: SIN_UNIDAD, motivo: 'ninguna' }

  const programada = candidatas.find(u =>
    fila.criterios.some(c => ctx.programa.has(`${u.id}|${c}|${fila.instrumento_id}`)))
  if (programada) return { unidad_id: programada.id!, motivo: 'programada' }
  if (candidatas.length === 1) return { unidad_id: candidatas[0].id!, motivo: 'unica' }
  return { unidad_id: candidatas[0].id!, motivo: 'primera' }
}

export type ResumenMigracion = {
  /** Filas que no traían unidad y han recibido una. */
  asignadas: number
  /** De ellas, las que han ido a la primera unidad por no programarlas ninguna. */
  primera: number
  /** Filas sin ninguna unidad posible (quedan en `SIN_UNIDAD`). */
  sinUnidad: number
}

export const resumenVacio = (): ResumenMigracion => ({ asignadas: 0, primera: 0, sinUnidad: 0 })

/** Suma un resultado al resumen (mutando) y devuelve si la fila cambió. */
export function anotar(resumen: ResumenMigracion, motivo: MotivoUnidad): boolean {
  if (motivo === 'propia') return false
  resumen.asignadas++
  if (motivo === 'primera') resumen.primera++
  if (motivo === 'ninguna') resumen.sinUnidad++
  return true
}

/** Criterios que toca un registro del diario (`criterios_json`), sin romper si viene mal. */
export function criteriosDeRegistro(r: { criterios_json?: string | null }): string[] {
  try {
    const v = JSON.parse(r.criterios_json || '[]')
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : []
  } catch { return [] }
}

/**
 * Asigna unidad a las filas que no la tienen, sobre listas ya leídas.
 * Devuelve las filas (las tocadas con `unidad_id` nuevo) y el resumen.
 * Sirve para una copia de seguridad anterior a la v7 antes de restaurarla.
 */
export function asignarUnidades<
  C extends { instrumento_id: number; trimestre: number; unidad_id?: number | null; criterio_id: string },
  R extends { instrumento_id: number; trimestre: number; unidad_id?: number | null; criterios_json?: string | null },
>(calificaciones: C[], diario: R[], ctx: ContextoUnidades): { calificaciones: C[]; diario: R[]; resumen: ResumenMigracion } {
  const prep = prepararContexto(ctx)
  const resumen = resumenVacio()
  const cals = calificaciones.map(c => {
    const r = unidadParaFila({ ...c, criterios: [c.criterio_id] }, prep)
    return anotar(resumen, r.motivo) ? { ...c, unidad_id: r.unidad_id } : c
  })
  const regs = diario.map(d => {
    const r = unidadParaFila({ ...d, criterios: criteriosDeRegistro(d) }, prep)
    return anotar(resumen, r.motivo) ? { ...d, unidad_id: r.unidad_id } : d
  })
  return { calificaciones: cals, diario: regs, resumen }
}

/** Dónde guarda la migración su resumen para que el Inicio lo enseñe una vez. */
export const CLAVE_RESUMEN_MIGRACION = 'miclase.migracion.unidades'
