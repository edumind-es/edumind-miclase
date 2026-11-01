/**
 * Competencias clave: nivel de desarrollo por descriptor operativo y por
 * competencia clave, a partir de las notas de criterio.
 *
 * Puro (sin Dexie ni red): lo prueba pruebas/competencias-clave.test.ts.
 *
 * El rastro va así. El servidor dice, para cada criterio, con qué
 * descriptores conecta su competencia específica (`/api/curriculum/criterios`,
 * campos `descriptores`, `competencias_clave` y `conexion_origen`; ver
 * backend/src/db/conexiones.js). Las notas de criterio salen de
 * `calcularNotaArea` (calculo.ts), con su regla de nota final, y aquí no se
 * vuelve a ponderar nada de lo que ya se ponderó allí.
 *
 * Reglas, decididas por Luis (noviembre de 2026):
 *  - Descriptor: dentro de cada área, media de los criterios que conectan con
 *    él, ponderada con el peso del criterio en la programación; después,
 *    media simple de las áreas. Cada área cuenta igual: un área con cuarenta
 *    criterios no tapa a otra con quince.
 *  - Competencia clave: media simple de sus descriptores con datos. Un
 *    descriptor sin evidencias no cuenta como cero: no cuenta.
 *  - Si la comunidad solo nombra la competencia clave (Valencia en Primaria),
 *    el criterio no aporta a ningún descriptor, pero sí a la competencia: sus
 *    notas, con la misma regla por áreas, entran como UNA entrada más en la
 *    media de la competencia (`directa`).
 *  - La conexión tomada del Real Decreto ('estatal') cuenta igual que la
 *    autonómica, y queda marcada para que el informe lo diga.
 *  - Nivel de desarrollo: cuatro niveles sobre la nota 0-10 con los mismos
 *    cortes que IN / SU-BI / NT / SB (`NIVELES_DESARROLLO`).
 */
import type { NotaCriterio } from './calculo'

export const COMPETENCIAS_CLAVE = ['CCL', 'CP', 'STEM', 'CD', 'CPSAA', 'CC', 'CE', 'CCEC'] as const

export const NOMBRES_COMPETENCIA: Record<string, string> = {
  CCL: 'Competencia en comunicación lingüística',
  CP: 'Competencia plurilingüe',
  STEM: 'Competencia matemática y en ciencia, tecnología e ingeniería',
  CD: 'Competencia digital',
  CPSAA: 'Competencia personal, social y de aprender a aprender',
  CC: 'Competencia ciudadana',
  CE: 'Competencia emprendedora',
  CCEC: 'Competencia en conciencia y expresión culturales',
}

export type NivelDesarrollo = { nivel: 1 | 2 | 3 | 4; nombre: string; desde: number }

/** De menos a más. `desde` es la nota mínima (incluida) para alcanzar el nivel. */
export const NIVELES_DESARROLLO: NivelDesarrollo[] = [
  { nivel: 1, nombre: 'Inicial', desde: 0 },
  { nivel: 2, nombre: 'En desarrollo', desde: 5 },
  { nivel: 3, nombre: 'Adquirido', desde: 7 },
  { nivel: 4, nombre: 'Consolidado', desde: 9 },
]

export function nivelDesarrollo(nota: number | null | undefined): NivelDesarrollo | null {
  if (nota == null || !Number.isFinite(nota)) return null
  let n = NIVELES_DESARROLLO[0]
  for (const nivel of NIVELES_DESARROLLO) if (nota >= nivel.desde) n = nivel
  return n
}

export type OrigenConexion = 'comunidad' | 'competencia' | 'estatal' | 'ninguna'

export type ConexionCriterio = {
  descriptores: string[]
  competencias: string[]
  origen: OrigenConexion
}

export type Descriptor = { id: string; competencia_id: string; descripcion: string }

/** La competencia clave de un descriptor: CPSAA3 → CPSAA. */
export function competenciaDeDescriptor(id: string): string | null {
  const m = /^([A-Z]+)\d$/.exec(id)
  return m ? m[1] : null
}

/**
 * Lo que devuelve `/api/curriculum/criterios` → conexión por criterio. Un
 * servidor anterior a las competencias clave no trae los campos: sale vacío.
 */
export function conexionesDeCriterios(
  lista: { id: string; descriptores?: string[]; competencias_clave?: string[]; conexion_origen?: string }[]
): Map<string, ConexionCriterio> {
  const m = new Map<string, ConexionCriterio>()
  for (const c of lista) {
    const descriptores = Array.isArray(c.descriptores) ? c.descriptores : []
    const competencias = Array.isArray(c.competencias_clave) ? c.competencias_clave : []
    const origen = (['comunidad', 'competencia', 'estatal'].includes(c.conexion_origen ?? '')
      ? c.conexion_origen : 'ninguna') as OrigenConexion
    if (descriptores.length || competencias.length) m.set(c.id, { descriptores, competencias, origen })
  }
  return m
}

/** Un área del alumno, con sus notas de criterio ya calculadas. */
export type AreaCompetencial = {
  area: string
  criterios: NotaCriterio[]
  /** criterio_id → peso en la programación (1 si no consta) */
  pesosCriterio?: Map<string, number>
  conexiones: Map<string, ConexionCriterio>
}

/** 1, 2, 3 o 'final' */
export type Periodo = 1 | 2 | 3 | 'final'
const PERIODOS: Periodo[] = [1, 2, 3, 'final']

type Valores = Record<number, number | null> & { final?: number | null }

/** Una nota por periodo. */
export type NotasPeriodo = { trimestres: Record<number, number | null>; final: number | null }

/** De dónde sale una nota: un criterio de un área. */
export type Aporte = {
  area: string
  criterio_id: string
  nota: NotasPeriodo
  peso: number
  origen: OrigenConexion
}

export type NotaDescriptor = NotasPeriodo & {
  id: string
  competencia_id: string
  /** Nota del descriptor en cada área, antes de la media entre áreas */
  areas: (NotasPeriodo & { area: string })[]
  aportes: Aporte[]
}

export type NotaCompetenciaClave = NotasPeriodo & {
  id: string
  /** Descriptores de la competencia que tienen alguna nota */
  descriptores: string[]
  /** Criterios conectados solo con la competencia, sin descriptor */
  directa: (NotasPeriodo & { aportes: Aporte[] }) | null
}

export type PerfilCompetenciasClave = {
  descriptores: NotaDescriptor[]
  competencias: NotaCompetenciaClave[]
  /** Criterios con nota cuya competencia específica no conecta con nada */
  sinConexion: { area: string; criterio_id: string }[]
  /** ¿Alguna nota llega por una conexión del Real Decreto? */
  usaEstatal: boolean
}

function redondear(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100
}

function media(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function ponderada(items: { valor: number; peso: number }[]): number | null {
  let suma = 0, pesos = 0
  for (const { valor, peso } of items) {
    if (!(peso > 0)) continue
    suma += valor * peso
    pesos += peso
  }
  return pesos > 0 ? suma / pesos : null
}

export function notaEnPeriodo(n: NotasPeriodo, periodo: Periodo | number | null): number | null {
  return periodo == null || periodo === 'final' ? n.final : n.trimestres[periodo] ?? null
}

function valorDe(c: NotaCriterio, p: Periodo): number | null {
  return p === 'final' ? c.final : c.trimestres[p] ?? null
}

/**
 * Nota por periodo de un conjunto de aportes: ponderada dentro de cada área,
 * media simple entre áreas.
 */
function porAreas(aportes: Aporte[]): { total: NotasPeriodo; areas: (NotasPeriodo & { area: string })[] } {
  const areas = [...new Set(aportes.map(a => a.area))]
  const porArea = areas.map(area => {
    const propios = aportes.filter(a => a.area === area)
    const v: Valores = { 1: null, 2: null, 3: null }
    for (const p of PERIODOS) {
      const r = ponderada(propios
        .map(a => ({ valor: notaEnPeriodo(a.nota, p), peso: a.peso }))
        .filter((x): x is { valor: number; peso: number } => x.valor != null))
      if (p === 'final') v.final = r
      else v[p] = r
    }
    return { area, trimestres: { 1: v[1], 2: v[2], 3: v[3] }, final: v.final ?? null }
  })
  const total: NotasPeriodo = {
    trimestres: {
      1: media(porArea.map(a => a.trimestres[1])),
      2: media(porArea.map(a => a.trimestres[2])),
      3: media(porArea.map(a => a.trimestres[3])),
    },
    final: media(porArea.map(a => a.final)),
  }
  return { total, areas: porArea }
}

function redondearNotas<T extends NotasPeriodo>(n: T): T {
  return {
    ...n,
    trimestres: { 1: redondear(n.trimestres[1]), 2: redondear(n.trimestres[2]), 3: redondear(n.trimestres[3]) },
    final: redondear(n.final),
  }
}

function tieneDatos(n: NotasPeriodo): boolean {
  return n.final != null || [1, 2, 3].some(t => n.trimestres[t] != null)
}

/**
 * Perfil de competencias clave de un alumno.
 *
 * @param areas sus áreas, cada una con las notas de criterio de `calcularNotaArea`
 * @param catalogo descriptores de la etapa, para ordenar y saber a qué competencia
 *   pertenece cada uno; sin catálogo se deduce de la sigla.
 */
export function perfilCompetenciasClave(
  areas: AreaCompetencial[],
  catalogo: Descriptor[] = []
): PerfilCompetenciasClave {
  const aportesDescriptor = new Map<string, Aporte[]>()
  const aportesDirectos = new Map<string, Aporte[]>()
  const sinConexion: { area: string; criterio_id: string }[] = []
  let usaEstatal = false

  for (const a of areas) {
    for (const c of a.criterios) {
      const nota: NotasPeriodo = {
        trimestres: { 1: valorDe(c, 1), 2: valorDe(c, 2), 3: valorDe(c, 3) },
        final: c.final,
      }
      if (!tieneDatos(nota)) continue
      const con = a.conexiones.get(c.criterio_id)
      if (!con || (!con.descriptores.length && !con.competencias.length)) {
        sinConexion.push({ area: a.area, criterio_id: c.criterio_id })
        continue
      }
      const aporte: Aporte = {
        area: a.area, criterio_id: c.criterio_id, nota,
        peso: a.pesosCriterio?.get(c.criterio_id) ?? 1,
        origen: con.origen,
      }
      if (con.origen === 'estatal') usaEstatal = true
      if (con.descriptores.length) {
        for (const d of con.descriptores) {
          const l = aportesDescriptor.get(d) ?? []
          l.push(aporte)
          aportesDescriptor.set(d, l)
        }
      } else {
        for (const comp of con.competencias) {
          const l = aportesDirectos.get(comp) ?? []
          l.push(aporte)
          aportesDirectos.set(comp, l)
        }
      }
    }
  }

  const compDe = new Map(catalogo.map(d => [d.id, d.competencia_id]))
  const ordenCatalogo = new Map(catalogo.map((d, i) => [d.id, i]))
  const competenciaDe = (id: string) => compDe.get(id) ?? competenciaDeDescriptor(id) ?? ''
  const orden = (a: string, b: string) =>
    COMPETENCIAS_CLAVE.indexOf(competenciaDe(a) as never) - COMPETENCIAS_CLAVE.indexOf(competenciaDe(b) as never) ||
    (ordenCatalogo.get(a) ?? 99) - (ordenCatalogo.get(b) ?? 99) ||
    a.localeCompare(b, 'es', { numeric: true })

  const descriptores: NotaDescriptor[] = [...aportesDescriptor.keys()].sort(orden).map(id => {
    const aportes = aportesDescriptor.get(id)!
    const { total, areas: porArea } = porAreas(aportes)
    return redondearNotas({
      id,
      competencia_id: competenciaDe(id),
      ...total,
      areas: porArea.map(redondearNotas),
      aportes,
    })
  })

  const competencias: NotaCompetenciaClave[] = []
  for (const id of COMPETENCIAS_CLAVE) {
    const propios = descriptores.filter(d => d.competencia_id === id)
    const directos = aportesDirectos.get(id)
    const directa = directos ? { ...porAreas(directos).total, aportes: directos } : null
    if (!propios.length && !directa) continue
    const entradas: NotasPeriodo[] = [...propios, ...(directa ? [directa] : [])]
    competencias.push(redondearNotas({
      id,
      trimestres: {
        1: media(entradas.map(e => e.trimestres[1])),
        2: media(entradas.map(e => e.trimestres[2])),
        3: media(entradas.map(e => e.trimestres[3])),
      },
      final: media(entradas.map(e => e.final)),
      descriptores: propios.map(d => d.id),
      directa: directa ? redondearNotas(directa) : null,
    }))
  }

  return { descriptores, competencias, sinConexion, usaEstatal }
}

/** Resumen de un descriptor o una competencia en todo el grupo. */
export type ResumenGrupo = {
  id: string
  media: number | null
  /** Alumnos con dato en el periodo */
  conDatos: number
  /** Alumnos por nivel de desarrollo: índice 0 = nivel 1 */
  porNivel: [number, number, number, number]
}

/**
 * Resumen del grupo en un periodo: media de las notas de los alumnos que
 * tienen dato y cuántos hay en cada nivel. Un alumno sin dato no cuenta.
 */
export function resumenDelGrupo(
  perfiles: PerfilCompetenciasClave[],
  periodo: Periodo | number | null
): { descriptores: ResumenGrupo[]; competencias: ResumenGrupo[] } {
  const juntar = (filas: { id: string; nota: number | null }[], orden: string[]) => {
    const ids = [...new Set(filas.map(f => f.id))]
      .sort((a, b) => orden.indexOf(a) - orden.indexOf(b))
    return ids.map(id => {
      const notas = filas.filter(f => f.id === id && f.nota != null).map(f => f.nota!)
      const porNivel: [number, number, number, number] = [0, 0, 0, 0]
      for (const n of notas) porNivel[nivelDesarrollo(n)!.nivel - 1]++
      return { id, media: redondear(media(notas)), conDatos: notas.length, porNivel }
    })
  }
  const descs = perfiles.flatMap(p => p.descriptores.map(d => ({ id: d.id, nota: notaEnPeriodo(d, periodo) })))
  const comps = perfiles.flatMap(p => p.competencias.map(c => ({ id: c.id, nota: notaEnPeriodo(c, periodo) })))
  const ordenDesc = [...new Set(perfiles.flatMap(p => p.descriptores.map(d => d.id)))]
    .sort((a, b) =>
      COMPETENCIAS_CLAVE.indexOf(competenciaDeDescriptor(a) as never) - COMPETENCIAS_CLAVE.indexOf(competenciaDeDescriptor(b) as never) ||
      a.localeCompare(b, 'es', { numeric: true }))
  return {
    descriptores: juntar(descs, ordenDesc),
    competencias: juntar(comps, [...COMPETENCIAS_CLAVE]),
  }
}
