/**
 * Lo que las pantallas del calificador necesitan saber de una medida: cómo
 * quedan los pesos de las columnas para un alumno y qué casillas no cuentan.
 *
 * Vive aparte de `medidas.ts` porque usa `porcentajesEnFamilia` de
 * `calculo.ts`, y `calculo.ts` ya importa `medidas.ts`.
 */
import type { Instrumento, Medida } from './localDb'
import { porcentajesEnFamilia } from './calculo'
import { instrumentosParaAlumno, criteriosExcluidos, criterioAdaptado, medidasVigentes, medidaDe } from './medidas'

type CeldaConPesos = {
  instrumento_id: number
  peso: number
  familia_id: number | null
  familia_peso: number
  pct_familia: number | null
}

/**
 * Las celdas de instrumento (`CeldaInstrumento`) con los pesos que valen
 * para este alumno en este trimestre: `peso`, `familia_peso` y
 * `pct_familia` recalculados con `instrumentosParaAlumno`. Sin medida que
 * ajuste nada, devuelve las mismas celdas.
 */
export function celdasParaAlumno<T extends CeldaConPesos>(
  celdas: T[], instrumentos: Instrumento[], medidas: Medida[] | undefined, trimestre: number
): T[] {
  const ajustados = instrumentosParaAlumno(instrumentos, medidas, trimestre)
  if (ajustados === instrumentos) return celdas
  const porId = new Map(ajustados.map(i => [i.id!, i]))
  const pctPorId = new Map<number, number>()
  for (const familiaId of new Set(ajustados.filter(i => i.familia_id != null).map(i => i.familia_id!))) {
    const hermanos = ajustados.filter(i => i.familia_id === familiaId)
    porcentajesEnFamilia(hermanos.map(h => h.peso)).forEach((v, k) => pctPorId.set(hermanos[k].id!, v))
  }
  return celdas.map(c => {
    const ins = porId.get(c.instrumento_id)
    if (!ins) return c
    const familia = c.familia_id != null ? porId.get(c.familia_id) : undefined
    return {
      ...c,
      peso: ins.peso,
      familia_peso: familia ? familia.peso : ins.peso,
      pct_familia: c.familia_id != null ? pctPorId.get(c.instrumento_id) ?? c.pct_familia : null,
    }
  })
}

export type EstadoCasilla = {
  /** La casilla no cuenta para este alumno en este trimestre, y por qué. */
  noCuenta: string | null
  /** El criterio está sustituido por otro texto (adaptación). */
  adaptado: { codigo: string; descripcion: string; curso?: string | null } | null
}

/**
 * Qué le pasa a una casilla (alumno × criterio × instrumentos) con las
 * medidas del alumno: si no cuenta —criterio excluido por la adaptación, o
 * ninguno de sus instrumentos pesa por el refuerzo— y si el criterio está
 * sustituido.
 */
export function estadoCasilla(
  instrumentos: Instrumento[], medidas: Medida[] | undefined,
  criterio_id: string, instrumentoIds: number[], trimestre: number
): EstadoCasilla {
  const sin: EstadoCasilla = { noCuenta: null, adaptado: null }
  if (!medidas?.length && !instrumentos.some(i => i.solo_medidas)) return sin
  const adaptado = criterioAdaptado(medidas, criterio_id, trimestre)
  if (criteriosExcluidos(medidas, trimestre).has(criterio_id)) {
    return { noCuenta: 'El criterio no cuenta para este alumno (adaptación curricular).', adaptado }
  }
  const ajustados = instrumentosParaAlumno(instrumentos, medidas, trimestre)
  const porId = new Map(ajustados.map(i => [i.id!, i]))
  const cuentaAlguno = instrumentoIds.some(id => {
    const ins = porId.get(id)
    if (!ins) return true
    if (ins.peso <= 0) return false
    const fam = ins.familia_id != null ? porId.get(ins.familia_id) : undefined
    return !fam || fam.peso > 0
  })
  if (instrumentoIds.length && !cuentaAlguno) {
    const hayRefuerzo = !!medidaDe(medidasVigentes(medidas, trimestre, 'refuerzo'), 'refuerzo')
    return {
      noCuenta: hayRefuerzo
        ? 'Este instrumento no cuenta para este alumno (refuerzo educativo).'
        : 'Instrumento solo para alumnado con medida: no cuenta para este alumno.',
      adaptado,
    }
  }
  return { noCuenta: null, adaptado }
}
