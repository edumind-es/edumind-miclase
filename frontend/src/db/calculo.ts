/**
 * Motor de cálculo de calificaciones.
 *
 * Hasta ahora los boletines hacían media aritmética simple: el peso de cada
 * instrumento y el reparto por trimestres de la asignatura se configuraban
 * pero no se usaban. Aquí vive la única definición de «qué nota saca».
 *
 * Jerarquía:
 *   nota de criterio (trimestre) = Σ(nota · peso_instrumento) / Σ(peso_instrumento)
 *   nota de área (trimestre)     = Σ(nota_criterio · peso_criterio) / Σ(peso_criterio)
 *   nota de área (final)         = Σ(nota_trimestre · peso_trimestre) / Σ(peso_trimestre)
 *
 * Solo cuentan los trimestres con datos: si un área aún no tiene nada en el
 * 3er trimestre, la nota final es la de lo que sí hay, no un 0 encubierto.
 */
import type { Calificacion, Instrumento } from './localDb'

export type NotaCriterio = {
  criterio_id: string
  trimestres: Record<number, number | null>
  final: number | null
  /** Detalle de qué instrumentos han intervenido, para el informe */
  aportaciones: { instrumento_id: number; nombre: string; valor: number; peso: number; trimestre: number }[]
}

export type NotaArea = {
  asignatura_id: number
  trimestres: Record<number, number | null>
  final: number | null
  criterios: NotaCriterio[]
}

const TRIMESTRES = [1, 2, 3]

/**
 * Redondeo de presentación: dos decimales.
 *
 * Se aplica UNA vez, al construir el resultado. Antes se redondeaba en cada
 * escalón —instrumento → criterio → área → final— y cada uno partía de
 * valores ya recortados, así que la desviación se iba acumulando con el
 * número de criterios.
 */
function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

function redondearOpcional(n: number | null): number | null {
  return n == null ? null : redondear(n)
}

/**
 * Media ponderada sin redondear; devuelve null si no hay ningún dato con
 * peso > 0. El redondeo es cosa de quien presenta el número.
 */
function ponderada(items: { valor: number; peso: number }[]): number | null {
  let suma = 0, pesos = 0
  for (const it of items) {
    const p = it.peso > 0 ? it.peso : 0
    if (p === 0) continue
    suma += it.valor * p
    pesos += p
  }
  return pesos > 0 ? suma / pesos : null
}

/**
 * Trimestre del curso escolar al que pertenece una fecha.
 *
 * sep-dic → 1º · ene-mar → 2º · abr-ago → 3º
 *
 * La regla estaba copiada en tres pantallas y no la usaba nadie más; el
 * resumen de asistencia la necesita para no meter en un boletín trimestral
 * las faltas del curso entero.
 */
export function trimestreDeMes(mes: number): number {
  return mes >= 9 ? 1 : mes <= 3 ? 2 : 3
}

/** @param fecha ISO (`2026-11-04` o `2026-11-04T…`) */
export function trimestreDeFecha(fecha: string): number {
  return trimestreDeMes(Number(fecha.slice(5, 7)))
}

export function trimestreActual(): number {
  return trimestreDeMes(new Date().getMonth() + 1)
}

/**
 * Trimestres en los que se usa un instrumento (`Instrumento.trimestres`).
 *
 * Un JSON vacío o roto se interpreta como «los tres»: es lo que el docente
 * espera de un instrumento recién creado, y nunca hace desaparecer una
 * columna del calificador por un dato mal guardado.
 */
export function parsearTrimestresInstrumento(json: string | undefined): number[] {
  try {
    const a = JSON.parse(json || '[1,2,3]')
    const nums = Array.isArray(a) ? a.map(Number).filter(n => TRIMESTRES.includes(n)) : []
    return nums.length ? nums : [...TRIMESTRES]
  } catch {
    return [...TRIMESTRES]
  }
}

/** ¿Este instrumento se usa en este trimestre? */
export function aplicaEnTrimestre(trimestresJson: string | undefined, trimestre: number): boolean {
  return parsearTrimestresInstrumento(trimestresJson).includes(trimestre)
}

export function parsearPesosTrimestres(json: string | undefined): Record<number, number> {
  try {
    const o = JSON.parse(json || '{"1":33,"2":33,"3":34}')
    return { 1: Number(o['1']) || 0, 2: Number(o['2']) || 0, 3: Number(o['3']) || 0 }
  } catch {
    return { 1: 33, 2: 33, 3: 34 }
  }
}

/**
 * Calcula las notas de un alumno en un área.
 *
 * @param calificaciones notas del alumno en esa área (todos los trimestres)
 * @param instrumentos   instrumentos del área (aportan el peso)
 * @param pesosCriterio  peso de cada criterio en la programación (por defecto 1)
 */
export function calcularNotaArea(
  asignatura_id: number,
  calificaciones: Calificacion[],
  instrumentos: Instrumento[],
  pesosTrimestresJson: string | undefined,
  pesosCriterio: Map<string, number> = new Map()
): NotaArea {
  const instrById = new Map(instrumentos.map(i => [i.id!, i]))
  const conValor = calificaciones.filter(c => c.valor != null)

  // criterio → trimestre → aportaciones
  const porCriterio = new Map<string, Map<number, { valor: number; peso: number }[]>>()
  const aportacionesPorCriterio = new Map<string, NotaCriterio['aportaciones']>()

  for (const c of conValor) {
    const ins = instrById.get(c.instrumento_id)
    // Una nota cuyo instrumento ya no existe conserva valor histórico con peso 1
    const peso = ins ? (ins.peso > 0 ? ins.peso : 0) : 1
    if (peso === 0) continue

    if (!porCriterio.has(c.criterio_id)) porCriterio.set(c.criterio_id, new Map())
    const porTrim = porCriterio.get(c.criterio_id)!
    if (!porTrim.has(c.trimestre)) porTrim.set(c.trimestre, [])
    porTrim.get(c.trimestre)!.push({ valor: c.valor!, peso })

    const aps = aportacionesPorCriterio.get(c.criterio_id) || []
    aps.push({
      instrumento_id: c.instrumento_id,
      nombre: ins?.nombre ?? '(instrumento retirado)',
      valor: c.valor!,
      peso,
      trimestre: c.trimestre,
    })
    aportacionesPorCriterio.set(c.criterio_id, aps)
  }

  const pesosTrim = parsearPesosTrimestres(pesosTrimestresJson)

  const criterios: NotaCriterio[] = [...porCriterio.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
    .map(([criterio_id, porTrim]) => {
      const trimestres: Record<number, number | null> = { 1: null, 2: null, 3: null }
      for (const t of TRIMESTRES) {
        trimestres[t] = ponderada(porTrim.get(t) || [])
      }
      const final = ponderada(
        TRIMESTRES
          .filter(t => trimestres[t] != null)
          .map(t => ({ valor: trimestres[t]!, peso: pesosTrim[t] }))
      )
      return {
        criterio_id,
        trimestres,
        final,
        aportaciones: aportacionesPorCriterio.get(criterio_id) || [],
      }
    })

  // Nota de área por trimestre: media de criterios ponderada por su peso.
  // Se calcula sobre los valores SIN redondear de los criterios.
  const trimestres: Record<number, number | null> = { 1: null, 2: null, 3: null }
  for (const t of TRIMESTRES) {
    trimestres[t] = ponderada(
      criterios
        .filter(c => c.trimestres[t] != null)
        .map(c => ({ valor: c.trimestres[t]!, peso: pesosCriterio.get(c.criterio_id) ?? 1 }))
    )
  }

  const final = ponderada(
    TRIMESTRES
      .filter(t => trimestres[t] != null)
      .map(t => ({ valor: trimestres[t]!, peso: pesosTrim[t] }))
  )

  // Redondeo, ya solo para enseñarlo
  for (const c of criterios) {
    for (const t of TRIMESTRES) c.trimestres[t] = redondearOpcional(c.trimestres[t])
    c.final = redondearOpcional(c.final)
  }
  const trimestresRedondeados: Record<number, number | null> = { 1: null, 2: null, 3: null }
  for (const t of TRIMESTRES) trimestresRedondeados[t] = redondearOpcional(trimestres[t])

  return {
    asignatura_id,
    trimestres: trimestresRedondeados,
    final: redondearOpcional(final),
    criterios,
  }
}

// ─── Competencias específicas ────────────────────────────────────────────────

export type NotaCompetencia = {
  /** Número de la competencia específica: el 2 de «CE2.3» */
  numero: string
  etiqueta: string
  trimestres: Record<number, number | null>
  final: number | null
  criterios: string[]
}

/**
 * Extrae la competencia específica de un código de criterio.
 *
 * El currículo LOMLOE numera los criterios colgando de su competencia
 * específica: CE2.3 es el tercer criterio de la competencia específica 2. Esa
 * convención se respeta en todas las comunidades, así que se puede derivar el
 * perfil competencial sin pedir nada más al servidor.
 */
export function competenciaDeCriterio(criterioId: string): string | null {
  const m = /^\s*(?:CE|CA)?\s*(\d+)\s*[.\-]/i.exec(criterioId)
  return m ? m[1] : null
}

/**
 * Agrupa las notas de criterio en el perfil por competencia específica.
 * Cada competencia pondera sus criterios por igual, salvo que la programación
 * les haya dado pesos distintos.
 */
export function perfilCompetencial(
  criterios: NotaCriterio[],
  pesosCriterio: Map<string, number> = new Map()
): NotaCompetencia[] {
  const grupos = new Map<string, NotaCriterio[]>()
  for (const c of criterios) {
    const comp = competenciaDeCriterio(c.criterio_id)
    if (!comp) continue
    const lista = grupos.get(comp) ?? []
    lista.push(c)
    grupos.set(comp, lista)
  }

  return [...grupos.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([numero, lista]) => {
      const trimestres: Record<number, number | null> = { 1: null, 2: null, 3: null }
      for (const t of TRIMESTRES) {
        trimestres[t] = ponderada(
          lista.filter(c => c.trimestres[t] != null)
               .map(c => ({ valor: c.trimestres[t]!, peso: pesosCriterio.get(c.criterio_id) ?? 1 })))
      }
      const final = ponderada(
        lista.filter(c => c.final != null)
             .map(c => ({ valor: c.final!, peso: pesosCriterio.get(c.criterio_id) ?? 1 })))
      for (const tt of TRIMESTRES) trimestres[tt] = redondearOpcional(trimestres[tt])
      return {
        numero,
        etiqueta: `Competencia específica ${numero}`,
        trimestres,
        final: redondearOpcional(final),
        criterios: lista.map(c => c.criterio_id),
      }
    })
}

// ─── Escalas LOMLOE ──────────────────────────────────────────────────────────

export type Calificativo = { sigla: string; etiqueta: string; color: string }

/** Escala cualitativa de Primaria/ESO a partir de la nota numérica. */
export function calificativo(nota: number | null | undefined): Calificativo {
  if (nota == null) return { sigla: '—', etiqueta: 'Sin datos', color: 'var(--gris-500)' }
  if (nota >= 9) return { sigla: 'SB', etiqueta: 'Sobresaliente', color: 'var(--cal-sobresaliente)' }
  if (nota >= 7) return { sigla: 'NT', etiqueta: 'Notable',       color: 'var(--cal-notable)' }
  if (nota >= 6) return { sigla: 'BI', etiqueta: 'Bien',          color: 'var(--cal-bien)' }
  if (nota >= 5) return { sigla: 'SU', etiqueta: 'Suficiente',    color: 'var(--cal-suficiente)' }
  return { sigla: 'IN', etiqueta: 'Insuficiente', color: 'var(--cal-insuficiente)' }
}

/**
 * Convierte el nivel de una rúbrica a la escala 0-10 usada en toda la app,
 * repartiendo los niveles de extremo a extremo: el más bajo es 0 y el más
 * alto 10, sin que el docente tenga que configurar nada.
 *
 * Con cuatro niveles: 0 · 3,3 · 6,7 · 10.
 *
 * Antes se dividía por el máximo (`valor / max * 10`), así que el nivel más
 * bajo de una rúbrica de cuatro daba 2,5: un alumno en el escalón inferior de
 * todos los criterios sacaba un 2,5 y era imposible poner un 0.
 *
 * La conversión ocurre al pulsar el nivel y lo que se guarda es la nota, así
 * que este cambio no altera ninguna calificación ya puesta.
 */
export function nivelANota(valor: number, maxNivel: number, minNivel = 1): number {
  const recorrido = maxNivel - minNivel
  // Rúbrica de un solo nivel: no hay escala que repartir
  if (!Number.isFinite(recorrido) || recorrido <= 0) return valor
  const nota = ((valor - minNivel) / recorrido) * 10
  return Math.round(Math.max(0, Math.min(10, nota)) * 10) / 10
}
