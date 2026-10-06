/**
 * Dos lecturas de la matriz que no son notas: cómo se agrupan los criterios
 * por competencia específica (para plegar columnas) y qué queda sin evaluar
 * (el panel de cobertura). Puro: trabaja con ids y números, sin base de
 * datos ni pantalla.
 */
import { competenciaDeCriterio } from './calculo'

export type GrupoCompetencia<C extends { id: string }> = {
  /** «2» para CE2.x; «—» para lo que no sigue la numeración LOMLOE. */
  numero: string
  etiqueta: string
  criterios: C[]
}

/** Agrupa criterios consecutivos por su competencia, respetando el orden. */
export function agruparPorCompetencia<C extends { id: string }>(criterios: C[]): GrupoCompetencia<C>[] {
  const grupos: GrupoCompetencia<C>[] = []
  for (const c of criterios) {
    const numero = competenciaDeCriterio(c.id) ?? '—'
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.numero === numero) ultimo.criterios.push(c)
    else grupos.push({ numero, etiqueta: numero === '—' ? 'Otros' : `CE${numero}`, criterios: [c] })
  }
  return grupos
}

/** Media simple de las notas que haya; null sin ninguna. */
export function mediaDe(valores: (number | null | undefined)[]): { media: number | null; conNota: number } {
  const xs = valores.filter((v): v is number => v != null)
  if (!xs.length) return { media: null, conNota: 0 }
  return { media: Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10, conNota: xs.length }
}

export type Cobertura = {
  /** Criterios evaluables (con instrumento) en lo que se mira. */
  evaluables: number
  /** Con alguna nota, en algún alumno. */
  conAlgunaNota: number
  /** Sin ninguna nota en ningún alumno. */
  sinNota: string[]
  /** Con nota en algunos alumnos pero no en todos: id → alumnos con nota. */
  aMedias: { id: string; conNota: number }[]
  /** Alumnos sin ninguna nota en ningún criterio evaluable. */
  alumnosSinNota: number[]
  /** Casillas con nota / casillas posibles. */
  casillas: { conNota: number; total: number }
}

/**
 * Qué queda por evaluar. `nota(alumno, criterio)` es la misma función que
 * pinta la casilla, para que el panel y la matriz no discrepen.
 */
export function calcularCobertura(
  alumnoIds: number[], criteriosEvaluables: string[], nota: (alumnoId: number, criterioId: string) => number | null,
): Cobertura {
  const sinNota: string[] = []
  const aMedias: { id: string; conNota: number }[] = []
  const alumnosConAlgo = new Set<number>()
  let casillasConNota = 0
  for (const c of criteriosEvaluables) {
    let n = 0
    for (const a of alumnoIds) {
      if (nota(a, c) != null) { n++; alumnosConAlgo.add(a) }
    }
    casillasConNota += n
    if (n === 0) sinNota.push(c)
    else if (n < alumnoIds.length) aMedias.push({ id: c, conNota: n })
  }
  return {
    evaluables: criteriosEvaluables.length,
    conAlgunaNota: criteriosEvaluables.length - sinNota.length,
    sinNota, aMedias,
    alumnosSinNota: alumnoIds.filter(a => !alumnosConAlgo.has(a)),
    casillas: { conNota: casillasConNota, total: alumnoIds.length * criteriosEvaluables.length },
  }
}
