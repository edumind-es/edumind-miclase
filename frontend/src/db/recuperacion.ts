/**
 * Recuperación: una actividad que mejora lo que el alumno sacó con su
 * instrumento en un criterio de una unidad. Puro.
 *
 * Decisiones de Luis (23/11/2026):
 *  - La recuperación es una ACTIVIDAD propia (`Instrumento.recuperacion`, la
 *    regla; sin índice ni esquema), dentro de un instrumento —«Proba
 *    escrita»— y con su columna en la unidad que se recupera.
 *  - Recupera SOLO lo de su instrumento: un 6 en la recuperación del examen
 *    no toca el 8 de la tabla de indicadores.
 *  - La regla se elige en cada recuperación: la mejor de las dos, la de la
 *    recuperación, o la mejor con tope de 5.
 *  - Entra quien tiene nota en la recuperación, criterio a criterio: la
 *    pantalla propone los suspensos y el docente retoca.
 *
 * No se escribe encima de nada. La nota original sigue en su casilla y en su
 * columna; aquí solo se decide con qué número entra en el cálculo. Por eso
 * esto va ANTES de `fundirUnidades` y `fundirHijosEnFamilias`: la casilla
 * todavía lleva su unidad, y una recuperación de la UD1 no toca la UD2.
 *
 * Cómo: por alumno, criterio, instrumento (familia), trimestre y unidad, la
 * nota que el alumno tenía con las demás actividades (su media ponderada,
 * como la fundiría la familia) se compara con la de la recuperación. Si la
 * regla la cambia, todas esas actividades entran con la nota recuperada —así
 * la fusión posterior da exactamente ese número— y la recuperación no entra
 * como una actividad más. Si no había nada que recuperar en esa casilla, la
 * nota de la recuperación cuenta como la de cualquier actividad.
 */
import type { Calificacion, Instrumento } from './localDb'

export type ReglaRecuperacion = 'mejor' | 'sustituir' | 'tope'

export const REGLAS_RECUPERACION: { id: ReglaRecuperacion; nombre: string; descripcion: string }[] = [
  { id: 'mejor', nombre: 'La mejor de las dos', descripcion: 'Si en la recuperación saca más, sube; si saca menos, se queda con la que tenía.' },
  { id: 'sustituir', nombre: 'La de la recuperación', descripcion: 'La nota nueva sustituye a la anterior siempre, también si es más baja.' },
  { id: 'tope', nombre: 'La mejor, con tope de 5', descripcion: 'Recuperar aprueba el criterio, pero la recuperación no sube la nota por encima de 5.' },
]

/** El tope de la regla 'tope': recuperar llega al aprobado, no más. */
export const TOPE_RECUPERACION = 5

/** La regla de una actividad, o null si no es una recuperación. */
export function reglaDeRecuperacion(ins: Pick<Instrumento, 'recuperacion'> | undefined | null): ReglaRecuperacion | null {
  const r = ins?.recuperacion
  return r === 'mejor' || r === 'sustituir' || r === 'tope' ? r : null
}

export const esRecuperacion = (ins: Pick<Instrumento, 'recuperacion'> | undefined | null): boolean =>
  reglaDeRecuperacion(ins) != null

/** La nota que queda al aplicar la regla a la que había y la de la recuperación. */
export function notaRecuperada(antes: number, recuperacion: number, regla: ReglaRecuperacion): number {
  if (regla === 'sustituir') return recuperacion
  if (regla === 'tope') return Math.max(antes, Math.min(recuperacion, TOPE_RECUPERACION))
  return Math.max(antes, recuperacion)
}

/** Una recuperación que ha contado: qué había, qué sacó y qué queda. */
export type RecuperacionAplicada = {
  alumno_id: number
  criterio_id: string
  /** El instrumento (familia) cuya nota se recupera. */
  familia_id: number
  /** La actividad de recuperación. */
  instrumento_id: number
  trimestre: number
  unidad_id: number
  regla: ReglaRecuperacion
  antes: number
  recuperacion: number
  despues: number
}

const pesoEnFamilia = (ins: Instrumento | undefined): number => (ins && ins.peso > 0 ? ins.peso : 1)

function resolver(calificaciones: Calificacion[], instrumentos: Instrumento[]): {
  salida: Calificacion[]; aplicadas: RecuperacionAplicada[]
} {
  const porId = new Map(instrumentos.map(i => [i.id!, i]))
  const recuperaciones = instrumentos.filter(i => esRecuperacion(i) && i.familia_id != null && porId.has(i.familia_id))
  if (!recuperaciones.length) return { salida: calificaciones, aplicadas: [] }
  const reglaDe = new Map(recuperaciones.map(i => [i.id!, reglaDeRecuperacion(i)!]))
  const conRecuperacion = new Set(recuperaciones.map(i => i.familia_id!))
  const familiaDe = (iid: number): number | null => {
    if (conRecuperacion.has(iid)) return iid
    const f = porId.get(iid)?.familia_id ?? null
    return f != null && conRecuperacion.has(f) ? f : null
  }

  const salida: Calificacion[] = []
  const grupos = new Map<string, { familia: number; miembros: Calificacion[] }>()
  for (const c of calificaciones) {
    const f = familiaDe(c.instrumento_id)
    if (f == null) { salida.push(c); continue }
    const k = `${c.alumno_id}:${c.criterio_id}:${f}:${c.trimestre}:${c.unidad_id}`
    const g = grupos.get(k) ?? { familia: f, miembros: [] }
    g.miembros.push(c)
    grupos.set(k, g)
  }

  const aplicadas: RecuperacionAplicada[] = []
  const orden = (c: Calificacion) => porId.get(c.instrumento_id)?.orden ?? 999
  for (const g of grupos.values()) {
    const recs = g.miembros
      .filter(c => reglaDe.has(c.instrumento_id) && c.valor != null)
      .sort((a, b) => orden(a) - orden(b) || a.instrumento_id - b.instrumento_id)
    const resto = g.miembros.filter(c => !reglaDe.has(c.instrumento_id))
    const conNota = resto.filter(c => c.valor != null)
    // Sin recuperación, o sin nada que recuperar en esta casilla: todo como está
    // (la nota de la recuperación cuenta entonces como la de una actividad más).
    if (!recs.length || !conNota.length) { salida.push(...g.miembros); continue }

    const pesos = conNota.map(c => (c.instrumento_id === g.familia ? 1 : pesoEnFamilia(porId.get(c.instrumento_id))))
    const original = conNota.reduce((s, c, i) => s + c.valor! * pesos[i], 0) / pesos.reduce((s, p) => s + p, 0)
    let nota = original
    for (const r of recs) {
      const regla = reglaDe.get(r.instrumento_id)!
      const despues = notaRecuperada(nota, r.valor!, regla)
      aplicadas.push({
        alumno_id: r.alumno_id, criterio_id: r.criterio_id, familia_id: g.familia, instrumento_id: r.instrumento_id,
        trimestre: r.trimestre, unidad_id: r.unidad_id, regla, antes: nota, recuperacion: r.valor!, despues,
      })
      nota = despues
    }
    // Las casillas sin nota siguen sin contar; las que la tenían entran todas
    // con la recuperada, y la recuperación no entra como una actividad más.
    for (const c of resto) {
      salida.push(c.valor == null || nota === original ? c : { ...c, id: undefined, valor: nota, virtual: true })
    }
  }
  return { salida, aplicadas }
}

/**
 * Las notas tal como entran en el cálculo, con las recuperaciones ya
 * aplicadas. Recibe casillas CRUDAS (con su unidad), no fundidas.
 */
export function aplicarRecuperaciones(calificaciones: Calificacion[], instrumentos: Instrumento[]): Calificacion[] {
  return resolver(calificaciones, instrumentos).salida
}

/** Qué recuperaciones han contado en esas notas, para explicarlo. */
export function recuperacionesAplicadas(calificaciones: Calificacion[], instrumentos: Instrumento[]): RecuperacionAplicada[] {
  return resolver(calificaciones, instrumentos).aplicadas
}

/**
 * Lo que propone la pantalla al calificar una recuperación: de los criterios
 * de la columna, los que el alumno tiene suspensos con ese instrumento en esa
 * unidad (antes de recuperar). El docente añade o quita.
 *
 * @param calificaciones casillas crudas de la unidad y el trimestre
 * @returns por alumno, criterio → la nota que tenía (null = sin nota)
 */
export function notasARecuperar(
  calificaciones: Calificacion[], instrumentos: Instrumento[], recuperacion_id: number, criterios: string[]
): Map<number, Map<string, number | null>> {
  const porId = new Map(instrumentos.map(i => [i.id!, i]))
  const familia = porId.get(recuperacion_id)?.familia_id ?? null
  const salida = new Map<number, Map<string, number | null>>()
  if (familia == null) return salida
  const delInstrumento = (c: Calificacion) =>
    c.instrumento_id === familia || (porId.get(c.instrumento_id)?.familia_id === familia && !esRecuperacion(porId.get(c.instrumento_id)))
  const acc = new Map<string, { suma: number; pesos: number }>()
  for (const c of calificaciones) {
    if (c.valor == null || !delInstrumento(c) || !criterios.includes(c.criterio_id)) continue
    const peso = c.instrumento_id === familia ? 1 : pesoEnFamilia(porId.get(c.instrumento_id))
    const k = `${c.alumno_id}:${c.criterio_id}`
    const e = acc.get(k) ?? { suma: 0, pesos: 0 }
    e.suma += c.valor * peso; e.pesos += peso
    acc.set(k, e)
  }
  for (const [k, e] of acc) {
    const [alumno, criterio] = [Number(k.slice(0, k.indexOf(':'))), k.slice(k.indexOf(':') + 1)]
    if (!salida.has(alumno)) salida.set(alumno, new Map())
    salida.get(alumno)!.set(criterio, e.suma / e.pesos)
  }
  return salida
}

/** Suspenso: lo que la pantalla marca solo para recuperar. */
export const estaSuspenso = (nota: number | null | undefined): boolean => nota != null && nota < 5
