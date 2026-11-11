/**
 * Estadísticos de un grupo de notas: los que un docente usa para situar a un
 * alumno frente a su clase. Puro (`pruebas/analisis-alumno.test.ts`).
 *
 * La **moda** no se calcula sobre la nota: con decimales casi nunca se
 * repite ninguna. Se calcula sobre el calificativo (IN · SU · BI · NT · SB),
 * que es como se lee una clase: «lo más frecuente es Notable». Decisión de
 * Luis (auditoría de nov 2026).
 */
import { calificativo } from './calculo'

export type Moda = { siglas: string[]; etiquetas: string[]; veces: number }

export type ResumenEstadistico = {
  /** Cuántas notas entran. */
  n: number
  media: number
  mediana: number
  /** El calificativo más frecuente (o los empatados); null si ninguno destaca. */
  moda: Moda | null
  min: number
  max: number
}

const redondo = (n: number) => Math.round(n * 100) / 100

/** La mediana: el valor central, o la media de los dos centrales. */
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null
  const o = [...valores].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * El calificativo más repetido. Con empate salen los empatados, en el orden
 * IN → SB; si todos los que hay se repiten lo mismo y son más de uno, no hay
 * moda (ninguno destaca).
 */
export function modaDeCalificativos(valores: number[]): Moda | null {
  const cuenta = new Map<string, { etiqueta: string; veces: number; orden: number }>()
  for (const v of valores) {
    const c = calificativo(v)
    const e = cuenta.get(c.sigla) ?? { etiqueta: c.etiqueta, veces: 0, orden: ['IN', 'SU', 'BI', 'NT', 'SB'].indexOf(c.sigla) }
    e.veces++
    cuenta.set(c.sigla, e)
  }
  if (!cuenta.size) return null
  const veces = Math.max(...[...cuenta.values()].map(e => e.veces))
  const ganadores = [...cuenta.entries()].filter(([, e]) => e.veces === veces).sort((a, b) => a[1].orden - b[1].orden)
  if (cuenta.size > 1 && ganadores.length === cuenta.size) return null
  return { siglas: ganadores.map(([s]) => s), etiquetas: ganadores.map(([, e]) => e.etiqueta), veces }
}

/** El resumen de unas notas; las que no existen (null) no cuentan. Sin ninguna, null. */
export function resumenEstadistico(valores: (number | null | undefined)[]): ResumenEstadistico | null {
  const v = valores.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  if (!v.length) return null
  return {
    n: v.length,
    media: redondo(v.reduce((s, x) => s + x, 0) / v.length),
    mediana: redondo(mediana(v)!),
    moda: modaDeCalificativos(v),
    min: Math.min(...v),
    max: Math.max(...v),
  }
}

/** «Notable (9 de 24)», «Bien y Notable (5 cada uno)», «sin moda». */
export function textoDeModa(m: Moda | null | undefined, n?: number): string {
  if (!m) return 'sin moda'
  if (m.etiquetas.length === 1) return `${m.etiquetas[0]}${n ? ` (${m.veces} de ${n})` : ''}`
  return `${m.etiquetas.join(' y ')} (${m.veces} cada uno)`
}
