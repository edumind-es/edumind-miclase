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
 * Pesos declarados de un instrumento dentro de un criterio concreto.
 *
 * Dos mapas porque el vínculo vive por unidad y las notas se agrupan por
 * trimestre: si el mismo criterio se evalúa en dos unidades con repartos
 * distintos, se usa el de la unidad en la que se puso la nota —que la propia
 * nota guarda en `unidad_id`— y solo cuando no consta se recurre al general.
 */
export type PesosVinculo = {
  /** `criterio|instrumento|unidad` → peso declarado */
  porUnidad: Map<string, number>
  /** `criterio|instrumento` → peso declarado, cuando no se sabe la unidad */
  porCriterio: Map<string, number>
}

export const SIN_PESOS_VINCULO: PesosVinculo = {
  porUnidad: new Map(), porCriterio: new Map(),
}

/**
 * Arma los pesos declarados a partir de la programación ya cargada.
 *
 * Se le pasa lo que devuelve `getUnidades()`; se pide con una forma mínima
 * para que el cálculo no dependa de la capa de base de datos.
 */
export function pesosVinculoDeUnidades(
  unidades: {
    id?: number
    criterios: { criterio_id: string; instrumentos: { instrumento_id: number; peso_criterio?: number | null }[] }[]
  }[]
): PesosVinculo {
  const porUnidad = new Map<string, number>()
  const porCriterio = new Map<string, number>()
  for (const u of unidades) {
    for (const c of u.criterios) {
      for (const i of c.instrumentos) {
        if (i.peso_criterio == null) continue
        if (u.id != null) porUnidad.set(`${c.criterio_id}|${i.instrumento_id}|${u.id}`, i.peso_criterio)
        // El general solo se usa cuando la nota no dice de qué unidad salió.
        // Gana el primero declarado: si dos unidades reparten distinto, sin
        // `unidad_id` en la nota no hay forma de saber cuál le tocaba.
        const clave = `${c.criterio_id}|${i.instrumento_id}`
        if (!porCriterio.has(clave)) porCriterio.set(clave, i.peso_criterio)
      }
    }
  }
  return { porUnidad, porCriterio }
}

/** El peso declarado que le toca a esta nota, o null si no hay ninguno. */
function pesoDeclarado(
  pesos: PesosVinculo, criterio_id: string, instrumento_id: number, unidad_id?: number | null
): number | null {
  // Si se sabe de qué unidad salió la nota, manda esa unidad y punto: caer
  // al mapa general heredaría el reparto de OTRA unidad, que es peor que no
  // tener ninguno. Una unidad que no declara reparto usa el peso global.
  if (unidad_id != null) {
    return pesos.porUnidad.get(`${criterio_id}|${instrumento_id}|${unidad_id}`) ?? null
  }
  // Solo las notas antiguas, sin unidad anotada, recurren al general.
  return pesos.porCriterio.get(`${criterio_id}|${instrumento_id}`) ?? null
}

/**
 * Calcula las notas de un alumno en un área.
 *
 * @param calificaciones notas del alumno en esa área (todos los trimestres)
 * @param instrumentos   instrumentos del área (aportan el peso por defecto)
 * @param pesosCriterio  peso de cada criterio en la programación (por defecto 1)
 * @param pesosVinculo   reparto propio de cada criterio, si lo tiene declarado
 */
export function calcularNotaArea(
  asignatura_id: number,
  calificaciones: Calificacion[],
  instrumentos: Instrumento[],
  pesosTrimestresJson: string | undefined,
  pesosCriterio: Map<string, number> = new Map(),
  pesosVinculo: PesosVinculo = SIN_PESOS_VINCULO
): NotaArea {
  const instrById = new Map(instrumentos.map(i => [i.id!, i]))
  const conValor = calificaciones.filter(c => c.valor != null)

  // criterio → trimestre → aportaciones
  const porCriterio = new Map<string, Map<number, { valor: number; peso: number }[]>>()
  const aportacionesPorCriterio = new Map<string, NotaCriterio['aportaciones']>()

  for (const c of conValor) {
    const ins = instrById.get(c.instrumento_id)
    // El reparto propio del criterio manda sobre el peso global del
    // instrumento: un criterio de investigación puede evaluarse con prueba,
    // cuaderno y lista de control contando por igual, sin que eso obligue a
    // mover el peso de esos instrumentos en el resto del área.
    const declarado = pesoDeclarado(pesosVinculo, c.criterio_id, c.instrumento_id, c.unidad_id)
    // Una nota cuyo instrumento ya no existe conserva valor histórico con peso 1
    const peso = declarado ?? (ins ? (ins.peso > 0 ? ins.peso : 0) : 1)
    if (peso <= 0) continue

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
 * Convierte el valor de un nivel de rúbrica a la escala 0-10, anclando la
 * escala en 0: `valor / valorMáximo × 10`.
 *
 * Con niveles 4·3·2·1 → 10 · 7,5 · 5 · 2,5.
 * Con niveles 4·3·2·1·0 → 10 · 7,5 · 5 · 2,5 · 0.
 *
 * Esto revierte a conciencia una decisión anterior. Antes se repartía de
 * extremo a extremo (`(valor − mín) / (máx − mín)`), de modo que el nivel más
 * bajo *presente* valía 0. Se hizo así porque no había otra forma de llegar al
 * cero: los niveles de la rúbrica no se podían editar y siempre eran cuatro.
 *
 * Ahora sí se pueden, así que el cero es un nivel que el docente añade cuando
 * quiere decir algo concreto —«no ejecuta», «no interviene»— y deja de ser un
 * castigo automático al escalón inferior. Un «Insuficiente» describe algo que
 * el alumno SÍ hace, y conserva su parte proporcional.
 *
 * Lo que se guarda es la nota ya convertida, así que ninguna calificación
 * puesta hasta hoy cambia de valor.
 */
export function nivelANota(valor: number, maxNivel: number): number {
  // Una rúbrica cuyo nivel más alto vale 0 no reparte nada: no hay escala.
  if (!Number.isFinite(maxNivel) || maxNivel <= 0) return 0
  const nota = (valor / maxNivel) * 10
  return Math.round(Math.max(0, Math.min(10, nota)) * 10) / 10
}

export type NivelDeRubrica = { nombre: string; valor: number }
/** El peso es opcional: una rúbrica anterior a los pesos reparte a partes iguales. */
export type IndicadorDeRubrica = { nombre: string; peso?: number }

export type NotaDeRubrica = {
  /** Null mientras no se haya marcado ningún indicador. */
  nota: number | null
  evaluados: number
  total: number
}

/**
 * Nota 0-10 de una rúbrica calificada **indicador a indicador**.
 *
 *   nota = Σ(peso × valor) ÷ Σ(peso × valorMáximo) × 10
 *
 * Antes esto no existía: el calificador pedía un único nivel para todo el
 * criterio y los indicadores de la rúbrica —lo que el docente se molesta en
 * redactar— no se leían en ningún momento. Se diseñaba una rúbrica de cinco
 * filas y se calificaba con un clic.
 *
 * Los indicadores sin marcar **no cuentan como cero**: se promedia solo sobre
 * lo observado. Un criterio que se evalúa a medias, porque la sesión se quedó
 * corta, no debe hundir la nota; por eso se devuelve también cuántos van.
 */
export function notaDeRubrica(
  indicadores: IndicadorDeRubrica[],
  niveles: NivelDeRubrica[],
  /** nombre del indicador → valor del nivel marcado */
  elegido: Record<string, number>,
): NotaDeRubrica {
  const total = indicadores.length
  const valorMax = niveles.length ? Math.max(...niveles.map(n => n.valor)) : 0
  if (!Number.isFinite(valorMax) || valorMax <= 0) return { nota: null, evaluados: 0, total }

  // Sin pesos declarados se reparte a partes iguales. Da igual el número que
  // se use mientras sea el mismo para todos: la fórmula normaliza.
  const pesoPorDefecto = total > 0 ? 100 / total : 0

  let suma = 0
  let pesos = 0
  let evaluados = 0
  for (const ind of indicadores) {
    const valor = elegido[ind.nombre]
    if (typeof valor !== 'number') continue
    const peso = typeof ind.peso === 'number' && ind.peso > 0 ? ind.peso : pesoPorDefecto
    suma += peso * valor
    pesos += peso
    evaluados++
  }

  if (evaluados === 0 || pesos <= 0) return { nota: null, evaluados: 0, total }
  const nota = (suma / (pesos * valorMax)) * 10
  return {
    nota: Math.round(Math.max(0, Math.min(10, nota)) * 10) / 10,
    evaluados,
    total,
  }
}

/**
 * Reparte 100 entre los indicadores dejando la suma exacta.
 *
 * Con tres indicadores salen 33,3 y el total daría 99,9: el resto se le da al
 * primero, que es lo que hace que el aviso de «suma 100» no mienta por un
 * decimal de redondeo.
 */
export function pesosAPartesIguales(n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor((100 / n) * 10) / 10
  const pesos = Array(n).fill(base)
  const resto = Math.round((100 - base * n) * 10) / 10
  pesos[0] = Math.round((pesos[0] + resto) * 10) / 10
  return pesos
}
