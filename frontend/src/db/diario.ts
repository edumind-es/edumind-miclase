/**
 * Diario de evaluación: varias observaciones fechadas de un alumno con un
 * instrumento que no se pisan entre sí. La nota del criterio se DERIVA de
 * todas ellas con una regla por instrumento (`Instrumento.agregacion`).
 *
 * Puro: aquí solo se decide cómo se funden los registros en una nota. Leer,
 * escribir y materializar en `calificaciones` es cosa de `queries.ts`
 * (`materializarDiario`).
 *
 * Todo lo que hay aquí es determinista: dos aparatos con los mismos registros
 * tienen que derivar exactamente la misma nota, porque cada uno la
 * materializa por su cuenta y el sync no debe verlas como un cambio.
 */
import type { Agregacion, RegistroDiario } from './localDb'
import { nivelANota } from './calculo'

/** Escala de los registros: cuatro niveles, como una rúbrica de aula. */
export const NIVELES_DIARIO = [1, 2, 3, 4] as const
export const NIVEL_MAXIMO = 4

/** Nombres cortos de los niveles, para los botones y la lista. */
export const ETIQUETAS_NIVEL: Record<number, string> = {
  1: 'No logrado',
  2: 'En proceso',
  3: 'Logrado',
  4: 'Destacado',
}

export const AGREGACIONES: { value: Agregacion; label: string; ayuda: string }[] = [
  { value: 'media',     label: 'Media',     ayuda: 'Media de todos los registros del trimestre' },
  { value: 'ultima',    label: 'Última',    ayuda: 'Solo cuenta el registro más reciente: dónde ha llegado' },
  { value: 'tendencia', label: 'Tendencia', ayuda: 'Media de los tres últimos registros' },
  { value: 'mediana',   label: 'Mediana',   ayuda: 'El valor central: un día raro no desplaza la nota' },
]

export const AGREGACION_POR_DEFECTO: Agregacion = 'media'

export function etiquetaAgregacion(regla: Agregacion | null | undefined): string {
  return AGREGACIONES.find(a => a.value === (regla ?? AGREGACION_POR_DEFECTO))?.label ?? 'Media'
}

/**
 * Nivel 1-4 → nota 0-10, lineal: 1→2,5 · 2→5 · 3→7,5 · 4→10. Es la misma
 * conversión que una rúbrica de cuatro niveles (`nivelANota`), así que un
 * «3» del diario vale lo mismo que un «nivel 3» de rúbrica. El nivel más bajo
 * describe algo observado, no una ausencia, y por eso no vale cero.
 */
export function nivelDiarioANota(nivel: number): number {
  const n = Math.max(1, Math.min(NIVEL_MAXIMO, Math.round(nivel)))
  return nivelANota(n, NIVEL_MAXIMO)
}

type Ordenable = { fecha: string; id?: number }

/** Copia ordenada por fecha y, a igual fecha, por id (único entre aparatos). */
export function ordenarRegistros<T extends Ordenable>(regs: T[]): T[] {
  return [...regs].sort((a, b) => {
    if (a.fecha < b.fecha) return -1
    if (a.fecha > b.fecha) return 1
    return (a.id ?? 0) - (b.id ?? 0)
  })
}

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/**
 * Funde una lista de niveles (ya en orden cronológico) en un solo nivel,
 * posiblemente fraccionario. Vacía → null.
 */
export function agregarNiveles(nivelesOrdenados: number[], regla: Agregacion | null | undefined): number | null {
  if (!nivelesOrdenados.length) return null
  switch (regla ?? AGREGACION_POR_DEFECTO) {
    case 'ultima':
      return nivelesOrdenados[nivelesOrdenados.length - 1]
    case 'tendencia':
      return media(nivelesOrdenados.slice(-3))
    case 'mediana': {
      const xs = [...nivelesOrdenados].sort((a, b) => a - b)
      const m = xs.length >> 1
      return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2
    }
    case 'media':
    default:
      return media(nivelesOrdenados)
  }
}

/** Nivel agregado → nota 0-10 con un decimal. */
export function nivelAgregadoANota(nivel: number): number {
  return nivelANota(Math.max(1, Math.min(NIVEL_MAXIMO, nivel)), NIVEL_MAXIMO)
}

/** Nota derivada de unos registros (en cualquier orden). Sin registros → null. */
export function notaDeDiario(regs: (Ordenable & { valor: number })[], regla?: Agregacion | null): number | null {
  const nivel = agregarNiveles(ordenarRegistros(regs).map(r => r.valor), regla)
  return nivel == null ? null : nivelAgregadoANota(nivel)
}

/** Criterios de un registro. Un JSON corrupto no revienta: cuenta como ninguno. */
export function criteriosDe(reg: { criterios_json: string }): string[] {
  try {
    const v = JSON.parse(reg.criterios_json)
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : []
  } catch {
    return []
  }
}

export type NotaDerivada = { valor: number; n: number; niveles: number[] }

/**
 * Nota derivada por criterio a partir de los registros de UN alumno con UN
 * instrumento en UN trimestre. Cada registro puntúa en los criterios que su
 * `criterios_json` nombra. Los borrados (`deleted_at`) se ignoran por defensa,
 * aunque el llamante ya debería haberlos filtrado.
 */
export function derivarNotas(
  regs: Pick<RegistroDiario, 'fecha' | 'id' | 'valor' | 'criterios_json' | 'deleted_at'>[],
  regla: Agregacion | null | undefined,
): Map<string, NotaDerivada> {
  const porCriterio = new Map<string, number[]>()
  for (const r of ordenarRegistros(regs)) {
    if (r.deleted_at) continue
    for (const c of criteriosDe(r)) {
      const lista = porCriterio.get(c) ?? []
      lista.push(r.valor)
      porCriterio.set(c, lista)
    }
  }
  const salida = new Map<string, NotaDerivada>()
  for (const [c, niveles] of porCriterio) {
    const nivel = agregarNiveles(niveles, regla)
    if (nivel == null) continue
    salida.set(c, { valor: nivelAgregadoANota(nivel), n: niveles.length, niveles })
  }
  return salida
}

/** «2·3·3·4»: los últimos `max` niveles, para la casilla de la matriz. */
export function miniTendencia(niveles: number[], max = 4): string {
  return niveles.slice(-max).join('·')
}
