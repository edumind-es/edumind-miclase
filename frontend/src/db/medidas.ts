/**
 * Medidas de atención a la diversidad: qué le toca a ESTE alumno.
 *
 * La programación manda para toda la clase. Una medida (adaptación curricular
 * o refuerzo educativo) ajusta el cálculo de un alumno en un área y en los
 * trimestres que declare: otros pesos de instrumento, instrumentos que no
 * cuentan, instrumentos propios, criterios que no cuentan o sustituidos por
 * otro texto. Nada de esto toca `criterio_instrumentos` ni las claves de las
 * notas: la nota de un criterio adaptado vive en la casilla del criterio de
 * la clase al que sustituye.
 *
 * Módulo puro (sin Dexie): lo usan `calculo.ts`, la matriz y los informes, y
 * se prueba en `pruebas/medidas.test.ts`.
 */
import type { Instrumento, Medida, TipoMedida } from './localDb'

/** Criterio sustituto de una adaptación: lo que se evalúa en lugar del de la clase. */
export type Sustituto = { codigo: string; descripcion: string; curso?: string | null }

/** Lo que una adaptación dice de cada criterio de la clase: no cuenta (null) o sustituido. */
export type CriteriosAdaptados = Record<string, Sustituto | null>

const TRIMESTRES = [1, 2, 3]

/** Trimestres en los que aplica la medida (misma forma que `Instrumento.trimestres`). */
export function trimestresDeMedida(m: Pick<Medida, 'trimestres'>): number[] {
  try {
    const a = JSON.parse(m.trimestres || '[1,2,3]')
    const nums = Array.isArray(a) ? a.map(Number).filter(n => TRIMESTRES.includes(n)) : []
    return nums.length ? nums : [...TRIMESTRES]
  } catch {
    return [...TRIMESTRES]
  }
}

export function aplicaMedidaEnTrimestre(m: Pick<Medida, 'trimestres'>, trimestre: number): boolean {
  return trimestresDeMedida(m).includes(trimestre)
}

/** Pesos declarados por el refuerzo: instrumento → peso (0 = no cuenta). */
export function parsearPesos(m: Pick<Medida, 'pesos_json'> | null | undefined): Map<number, number> {
  const out = new Map<number, number>()
  if (!m?.pesos_json) return out
  try {
    const o = JSON.parse(m.pesos_json)
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        const id = Number(k), peso = Number(v)
        if (Number.isFinite(id) && Number.isFinite(peso) && peso >= 0) out.set(id, peso)
      }
    }
  } catch { /* un JSON roto no es una medida */ }
  return out
}

/** Criterios de la adaptación: criterio de la clase → null (no cuenta) o sustituto. */
export function parsearCriterios(m: Pick<Medida, 'criterios_json'> | null | undefined): CriteriosAdaptados {
  if (!m?.criterios_json) return {}
  try {
    const o = JSON.parse(m.criterios_json)
    if (!o || typeof o !== 'object') return {}
    const out: CriteriosAdaptados = {}
    for (const [k, v] of Object.entries(o)) {
      if (v == null) { out[k] = null; continue }
      if (typeof v === 'object') {
        const s = v as Partial<Sustituto>
        out[k] = {
          codigo: String(s.codigo ?? k),
          descripcion: String(s.descripcion ?? ''),
          curso: s.curso ?? null,
        }
      }
    }
    return out
  } catch {
    return {}
  }
}

/** Las medidas vivas de un tipo que aplican en el trimestre. */
export function medidasVigentes(medidas: Medida[] | undefined, trimestre: number, tipo?: TipoMedida): Medida[] {
  return (medidas ?? []).filter(m => !m.deleted_at && (!tipo || m.tipo === tipo) && aplicaMedidaEnTrimestre(m, trimestre))
}

/**
 * Si llegan dos filas del mismo tipo (dos aparatos que la crearon antes de
 * sincronizar), cuenta la de `updated_at` más reciente; a igualdad, menor id.
 */
export function medidaDe(medidas: Medida[] | undefined, tipo: TipoMedida): Medida | null {
  const vivas = (medidas ?? []).filter(m => !m.deleted_at && m.tipo === tipo)
  if (!vivas.length) return null
  return vivas.reduce((a, b) => {
    const ua = a.updated_at ?? '', ub = b.updated_at ?? ''
    if (ub > ua) return b
    if (ub < ua) return a
    return (b.id ?? Infinity) < (a.id ?? Infinity) ? b : a
  })
}

/**
 * Los instrumentos del área tal y como pesan para este alumno en este
 * trimestre. Sin refuerzo vigente y sin instrumentos propios en juego,
 * devuelve la MISMA lista (así quien compare referencias sabe que no hay
 * ajuste). Con él, una copia con `peso` sustituido: lo que el refuerzo fija,
 * 0 para lo excluido, y 0 para los instrumentos `solo_medidas` que la medida
 * no incluya (también para quien no tiene medida).
 */
export function instrumentosParaAlumno(
  instrumentos: Instrumento[], medidas: Medida[] | undefined, trimestre: number
): Instrumento[] {
  const refuerzo = medidaDe(medidasVigentes(medidas, trimestre, 'refuerzo'), 'refuerzo')
  const pesos = parsearPesos(refuerzo)
  const hayPropios = instrumentos.some(i => i.solo_medidas)
  if (!pesos.size && !hayPropios) return instrumentos
  return instrumentos.map(i => {
    const fijado = pesos.get(i.id!)
    if (fijado != null) return fijado === i.peso ? i : { ...i, peso: fijado }
    if (i.solo_medidas) return i.peso === 0 ? i : { ...i, peso: 0 }
    return i
  })
}

/** ¿Cuenta este instrumento para el alumno en el trimestre? */
export function instrumentoCuenta(
  instrumentos: Instrumento[], medidas: Medida[] | undefined, instrumento_id: number, trimestre: number
): boolean {
  const ins = instrumentosParaAlumno(instrumentos, medidas, trimestre).find(i => i.id === instrumento_id)
  return !!ins && ins.peso > 0
}

/** Criterios de la clase que no cuentan para el alumno en el trimestre (adaptación). */
export function criteriosExcluidos(medidas: Medida[] | undefined, trimestre: number): Set<string> {
  const out = new Set<string>()
  const adaptacion = medidaDe(medidasVigentes(medidas, trimestre, 'adaptacion'), 'adaptacion')
  if (!adaptacion) return out
  for (const [k, v] of Object.entries(parsearCriterios(adaptacion))) if (v === null) out.add(k)
  return out
}

/** El sustituto de un criterio de la clase para el alumno en el trimestre, si lo hay. */
export function criterioAdaptado(
  medidas: Medida[] | undefined, criterio_id: string, trimestre: number
): Sustituto | null {
  const adaptacion = medidaDe(medidasVigentes(medidas, trimestre, 'adaptacion'), 'adaptacion')
  if (!adaptacion) return null
  const v = parsearCriterios(adaptacion)[criterio_id]
  return v && typeof v === 'object' ? v : null
}

export const ETIQUETAS_MEDIDA: Record<TipoMedida, { sigla: string; nombre: string }> = {
  adaptacion: { sigla: 'ACI', nombre: 'Adaptación curricular' },
  refuerzo: { sigla: 'RE', nombre: 'Refuerzo educativo' },
}

/** Siglas y texto corto para el sello de la fila y el informe («ACI · 1T 2T»). */
export function etiquetaMedida(m: Pick<Medida, 'tipo' | 'trimestres'>): { sigla: string; nombre: string; texto: string } {
  const e = ETIQUETAS_MEDIDA[m.tipo] ?? { sigla: '?', nombre: 'Medida' }
  const t = trimestresDeMedida(m)
  const cuando = t.length === 3 ? 'todo el curso' : t.map(n => `${n}T`).join(' ')
  return { ...e, texto: `${e.nombre} · ${cuando}` }
}

/** Las medidas vivas del alumno, una por tipo, en orden fijo (para los sellos). */
export function medidasDelAlumno(medidas: Medida[] | undefined): Medida[] {
  return (['adaptacion', 'refuerzo'] as TipoMedida[])
    .map(t => medidaDe(medidas, t))
    .filter((m): m is Medida => m != null)
}
