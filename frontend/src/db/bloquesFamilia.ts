/**
 * Lo que una familia guarda a su nombre, agrupado en bloques de unidad y día.
 *
 * Con hijos dentro, la familia solo resume: lo que se calificó directamente
 * con ella sigue contando pero no tiene columna, y hay que moverlo al hijo
 * que lo hizo de verdad. Un total («1 examen, 24 notas») no deja decidir:
 * el examen del express de la UD2 y las notas de la UD3 puestas otro día
 * van a hijos distintos. Aquí se agrupan por unidad y día de anotación,
 * para que el gestor enseñe cada bloque y deje elegirle destino.
 *
 * La fecha de cada dato:
 *  - nota (`calificaciones`): `fecha`, que `saveCalificaciones` sella al
 *    poner la nota (y al cambiarla); si falta, `updated_at`;
 *  - registro del diario: `fecha` de la observación;
 *  - examen o rúbrica: `created_at`, cuando se definió; si falta, `updated_at`.
 * El día es el local del aparato, no el UTC: una nota puesta a las 00:30
 * es de esa noche, no de la víspera.
 *
 * Puro: no toca la base. Lo prueba `pruebas/bloques-familia.test.ts`.
 */
/** Identifica un bloque: unidad y día (AAAA-MM-DD local). `null` = sin dato. */
export type FiltroBloque = { unidad_id: number | null; dia: string | null }

export type BloqueDirecto = FiltroBloque & {
  calificaciones: number
  diario: number
  examenes: number
  rubricas: number
  /** Criterios que nombran las notas y registros del bloque, ordenados. */
  criterios: string[]
  /** Sello más reciente del bloque (ISO), para enseñar la hora. */
  ultima: string | null
}

type Fila = { deleted_at?: string | null; unidad_id?: number | null; updated_at?: string }
type FilaNota = Fila & { valor?: number | null; fecha?: string | null; criterio_id: string }
type FilaDiario = Fila & { fecha?: string | null; criterios_json?: string | null }
type FilaRubrica = Fila & { tipo?: string | null; created_at?: string | null }

const dos = (n: number) => String(n).padStart(2, '0')

/** Día local AAAA-MM-DD de un sello ISO; `null` si no hay o no se entiende. */
export function diaDe(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

export const diaDeNota = (c: Pick<FilaNota, 'fecha' | 'updated_at'>) => diaDe(c.fecha ?? c.updated_at)
export const diaDeRegistro = (r: Pick<FilaDiario, 'fecha' | 'updated_at'>) => diaDe(r.fecha ?? r.updated_at)
export const diaDeRubrica = (r: Pick<FilaRubrica, 'created_at' | 'updated_at'>) => diaDe(r.created_at ?? r.updated_at)

/** Si una fila cae en el bloque pedido. Sin filtro, todas caen. */
export function enBloque(filtro: FiltroBloque | undefined, unidad_id: number | null | undefined, dia: string | null): boolean {
  if (!filtro) return true
  return (unidad_id ?? null) === filtro.unidad_id && dia === filtro.dia
}

const clave = (unidad_id: number | null | undefined, dia: string | null) => `${unidad_id ?? 'x'}|${dia ?? 'x'}`

function criteriosDeRegistro(r: FilaDiario): string[] {
  if (!r.criterios_json) return []
  try {
    const v = JSON.parse(r.criterios_json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

/**
 * Es la rúbrica del instrumento, no un examen. El banco no entra aquí: las
 * filas llegan ya filtradas por el id de la familia, que nunca es el banco.
 */
const esRubricaPropia = (r: FilaRubrica) => r.tipo !== 'prueba'

/**
 * Agrupa lo vivo de una familia en bloques ordenados por unidad (las sin
 * unidad al final) y día (el más antiguo primero). Las notas sin valor no
 * cuentan, igual que en `datosDirectosDeFamilia`.
 */
export function agruparEnBloques(cals: FilaNota[], regs: FilaDiario[], rubs: FilaRubrica[]): BloqueDirecto[] {
  const bloques = new Map<string, BloqueDirecto & { _criterios: Set<string> }>()
  const toma = (unidad_id: number | null | undefined, dia: string | null, sello?: string | null) => {
    const k = clave(unidad_id, dia)
    let b = bloques.get(k)
    if (!b) {
      b = { unidad_id: unidad_id ?? null, dia, calificaciones: 0, diario: 0, examenes: 0, rubricas: 0, criterios: [], ultima: null, _criterios: new Set() }
      bloques.set(k, b)
    }
    if (sello && (!b.ultima || sello > b.ultima)) b.ultima = sello
    return b
  }
  for (const c of cals) {
    if (c.deleted_at || c.valor == null) continue
    const b = toma(c.unidad_id, diaDeNota(c), c.fecha ?? c.updated_at)
    b.calificaciones++
    b._criterios.add(c.criterio_id)
  }
  for (const r of regs) {
    if (r.deleted_at) continue
    const b = toma(r.unidad_id, diaDeRegistro(r), r.fecha ?? r.updated_at)
    b.diario++
    for (const c of criteriosDeRegistro(r)) b._criterios.add(c)
  }
  for (const r of rubs) {
    if (r.deleted_at) continue
    if (r.tipo === 'prueba') toma(r.unidad_id, diaDeRubrica(r), r.created_at ?? r.updated_at).examenes++
    else if (esRubricaPropia(r)) toma(r.unidad_id, diaDeRubrica(r), r.created_at ?? r.updated_at).rubricas++
  }
  return [...bloques.values()]
    .map(({ _criterios, ...b }) => ({ ...b, criterios: [..._criterios].sort((a, z) => a.localeCompare(z, 'es', { numeric: true })) }))
    .sort((a, b) => {
      if ((a.unidad_id ?? null) !== (b.unidad_id ?? null)) {
        if (a.unidad_id == null) return 1
        if (b.unidad_id == null) return -1
        return a.unidad_id - b.unidad_id
      }
      return (a.dia ?? '').localeCompare(b.dia ?? '')
    })
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «15 oct» o «15 oct 2025» si no es de este año; `sin fecha` si no hay. */
export function etiquetaDia(dia: string | null, hoy = new Date()): string {
  if (!dia) return 'sin fecha'
  const [a, m, d] = dia.split('-').map(Number)
  if (!a || !m || !d) return dia
  const base = `${d} ${MESES[m - 1] ?? m}`
  return a === hoy.getFullYear() ? base : `${base} ${a}`
}

/** «17:32» del sello, en hora local; vacío si no hay. */
export function etiquetaHora(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`
}

/** «1 examen, 3 notas, su rúbrica», como lo dice el gestor. */
export function describeBloque(b: Pick<BloqueDirecto, 'calificaciones' | 'diario' | 'examenes' | 'rubricas'>): string {
  return [
    b.examenes ? `${b.examenes} examen${b.examenes !== 1 ? 'es' : ''}` : '',
    b.calificaciones ? `${b.calificaciones} nota${b.calificaciones !== 1 ? 's' : ''}` : '',
    b.diario ? `${b.diario} registro${b.diario !== 1 ? 's' : ''} del diario` : '',
    b.rubricas ? 'su rúbrica' : '',
  ].filter(Boolean).join(', ')
}
