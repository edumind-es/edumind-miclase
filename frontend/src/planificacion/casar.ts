/**
 * Casar una semana leída con la clase: qué área, qué unidad y qué criterios
 * del currículo son. Puro (sin base de datos): la pantalla le pasa las áreas,
 * las unidades y los ids de criterio de cada área, y enseña lo que no casa
 * ANTES de guardar. Lo que no casa se guarda igual, con su texto tal cual.
 */
import type { CriterioAnclado, FaseSecuencia, SesionPlan, TipoSesionPlan } from '../db/localDb'
import { claveArea, sinAcentos, type SemanaLeida, type SesionLeida } from './semanal'

export interface AreaRef { id: number; nombre: string; nombre_display?: string | null }
export interface UnidadRef { id: number; asignatura_id: number; nombre: string }

export interface ContextoCasado {
  asignaturas: AreaRef[]
  unidades: UnidadRef[]
  /** asignatura_id → ids de criterio del currículo («CE6.5»); null = no se pudo consultar. */
  criterios: Map<number, string[] | null>
}

/** La sesión lista para guardar (sin id ni sellos: eso lo pone `nuevo()`). */
export type SesionPreparada = Omit<SesionPlan, 'id' | 'updated_at' | 'deleted_at' | 'grupo_id' | 'created_at'>

export interface Volcado {
  sesiones: SesionPreparada[]
  /** Lo que no casa, para la vista previa. Áreas con el número de sesiones. */
  areasSinCasar: { area: string; sesiones: number; especialista: boolean }[]
  unidadesSinCasar: { area: string; unidad: string }[]
  criteriosSinCasar: { area: string; codigo: string }[]
  /** Áreas cuyos criterios no se pudieron comprobar (sin conexión con el currículo). */
  criteriosSinComprobar: string[]
}

const normal = (s: string) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim()

/** Área de la clase que corresponde a lo escrito, o null. */
export function casarArea(area: string, asignaturas: AreaRef[]): AreaRef | null {
  const k = claveArea(area)
  return asignaturas.find(a => claveArea(a.nombre) === k || (a.nombre_display && claveArea(a.nombre_display) === k))
    ?? asignaturas.find(a => normal(a.nombre_display || a.nombre) === normal(area))
    ?? null
}

/**
 * Unidad del área que corresponde a «UD3 · El poder de las palabras». Primero
 * por título (que no depende de cómo numere el docente); después por número
 * escrito en el nombre («UD3», «Unidad 3», «3. …»). Nunca por orden: la
 * tercera pestaña no tiene por qué ser la UD3.
 */
export function casarUnidad(unidad: string | null, titulo: string | null, unidades: UnidadRef[]): UnidadRef | null {
  if (titulo) {
    const t = normal(titulo)
    const porTitulo = unidades.find(u => {
      const n = normal(u.nombre)
      return t.length >= 4 && (n.includes(t) || (n.length >= 6 && t.includes(n.replace(/^(ud|unidad|unidade)\s*\d+\s*/, ''))))
    })
    if (porTitulo) return porTitulo
  }
  const num = unidad ? /\d+/.exec(unidad)?.[0] : null
  if (!num) return null
  const re = new RegExp(`(?:^|\\b)(?:ud|u d|unidad|unidade|tema|sa)\\s*0*${num}\\b|^0*${num}\\b`)
  return unidades.find(u => re.test(normal(u.nombre))) ?? null
}

/** «CA6.5» (criterio de avaliación gallego) → «CE6.5», el id del currículo. */
export const codigoCurriculo = (codigo: string) => codigo.replace(/^CA/, 'CE')

export function casarCriterios(codigos: string[], ids: string[] | null | undefined): CriterioAnclado[] {
  const conjunto = ids ? new Set(ids) : null
  return codigos.map(codigo => {
    const id = codigoCurriculo(codigo)
    return { codigo, criterio_id: conjunto?.has(id) ? id : null }
  })
}

const textoUnidad = (s: SesionLeida) =>
  [s.unidad, s.unidad_titulo].filter(Boolean).join(' · ') || null

export function prepararVolcado(semana: SemanaLeida, ctx: ContextoCasado): Volcado {
  const areas = new Map<string, { area: string; sesiones: number; especialista: boolean }>()
  const unidades = new Map<string, { area: string; unidad: string }>()
  const criterios = new Map<string, { area: string; codigo: string }>()
  const sinComprobar = new Set<string>()

  const sesiones = semana.sesiones.map((s): SesionPreparada => {
    const asig = s.tipo === 'centro' ? null : casarArea(s.area, ctx.asignaturas)
    if (!asig && s.tipo !== 'centro') {
      const k = claveArea(s.area)
      const a = areas.get(k) ?? { area: s.area, sesiones: 0, especialista: s.tipo === 'especialista' }
      a.sesiones++
      areas.set(k, a)
    }
    const deArea = asig ? ctx.unidades.filter(u => u.asignatura_id === asig.id) : []
    const uni = asig && (s.unidad || s.unidad_titulo) ? casarUnidad(s.unidad, s.unidad_titulo, deArea) : null
    const texto = textoUnidad(s)
    if (asig && s.unidad && !uni) unidades.set(`${asig.id}:${s.unidad}`, { area: s.area, unidad: texto! })

    const ids = asig ? ctx.criterios.get(asig.id) : undefined
    if (asig && s.criterios.length && ids === null) sinComprobar.add(s.area)
    const anclados = casarCriterios(s.criterios, ids)
    // Solo se acusa un criterio de un área que casa y cuyo currículo se ha
    // leído: el de un área que la clase no tiene ya va en «áreas sin casar».
    if (Array.isArray(ids)) {
      for (const c of anclados) if (!c.criterio_id) criterios.set(`${s.area}:${c.codigo}`, { area: s.area, codigo: c.codigo })
    }

    return {
      fecha: s.fecha,
      franja: s.franja,
      hora_inicio: s.hora_inicio,
      hora_fin: s.hora_fin,
      area: s.area,
      asignatura_id: asig?.id ?? null,
      unidad_id: uni?.id ?? null,
      unidad_texto: texto,
      titulo: s.titulo,
      tipo: s.tipo as TipoSesionPlan,
      evaluable: s.evaluable ? 1 : 0,
      objetivo: s.objetivo || null,
      secuencia_json: s.secuencia.length ? JSON.stringify(s.secuencia) : null,
      recursos: s.recursos || null,
      evaluacion: s.evaluacion || null,
      criterios_json: anclados.length ? JSON.stringify(anclados) : null,
      bloque: s.bloque,
      origen: 'volcado',
    }
  })

  return {
    sesiones,
    areasSinCasar: [...areas.values()],
    unidadesSinCasar: [...unidades.values()],
    criteriosSinCasar: [...criterios.values()],
    criteriosSinComprobar: [...sinComprobar],
  }
}

// ─── Lectura de los campos JSON ─────────────────────────────────────────

export function secuenciaDe(s: Pick<SesionPlan, 'secuencia_json'>): FaseSecuencia[] {
  try { const v = JSON.parse(s.secuencia_json || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

export function criteriosDe(s: Pick<SesionPlan, 'criterios_json'>): CriterioAnclado[] {
  try { const v = JSON.parse(s.criterios_json || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** ¿Lleva al Calificador? Con ■ y un área de la clase. */
export const vaAlCalificador = (s: Pick<SesionPlan, 'evaluable' | 'asignatura_id'>) => !!s.evaluable && !!s.asignatura_id
