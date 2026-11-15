/**
 * El informe de UN alumno en una actividad que no es un examen: la que se
 * evalúa con rúbrica (o lista de control, o escala, que son rúbricas con otra
 * forma) o con el diario de observación.
 *
 * Es el hermano de `analizarExamen` (`analisisAlumno.ts`): allí se mira
 * pregunta a pregunta; aquí, indicador a indicador y registro a registro.
 *
 * Puro (`pruebas/informe-actividad.test.ts`) y no calcula ninguna nota: la
 * del alumno y las de sus compañeros son las que ya están guardadas en la
 * casilla. Lo que añade es la lectura: en qué indicadores queda bajo, cómo
 * queda la clase en cada uno y cómo han ido sus registros.
 *
 * Las marcas de un indicador se guardan por su NOMBRE (`niveles_rubrica`):
 * si la rúbrica se editó después de calificar, un indicador renombrado sale
 * «sin marcar», que es la verdad.
 */
import type { Agregacion } from './localDb'
import { ETIQUETAS_NIVEL, notaDeRegistro, ordenarRegistros } from './diario'
import { resumenEstadistico } from './estadistica'
import type { Comparacion } from './analisisAlumno'

export type RegistroDeActividad = {
  id?: number
  fecha: string
  /** Nivel 1-4 del diario. */
  valor: number
  /** Nota 0-10 si el registro es una observación con rúbrica. */
  nota?: number | null
  observacion?: string | null
  niveles_rubrica?: Record<string, number> | null
}

export type AlumnoDeActividad = {
  alumno_id: number
  nombre: string
  /** La nota guardada en la casilla (media de sus criterios en la actividad). */
  nota: number | null
  /** Nivel marcado en cada indicador de la rúbrica, por nombre. */
  marcas: Record<string, number>
  registros: RegistroDeActividad[]
}

/** Una actividad en una unidad y un trimestre, con lo que tiene cada alumno. */
export type ActividadDeUnidad = {
  instrumento_id: number
  instrumento: string
  unidad_id: number
  unidad: string | null
  trimestre: number
  herramienta: 'rubrica' | 'diario'
  rubrica?: {
    titulo: string
    niveles: { nombre: string; valor: number }[]
    indicadores: { nombre: string; peso?: number; descriptores?: Record<string, string> }[]
  } | null
  /** Cómo se funden varios registros del diario. */
  agregacion?: Agregacion | null
  /** Criterios en los que la actividad pone nota en la unidad. */
  criterios: string[]
  alumnos: AlumnoDeActividad[]
}

export type IndicadorAnalizado = {
  nombre: string
  peso: number | null
  /** Nivel marcado al alumno, o null si no se le marcó. */
  valor: number | null
  nivel: string | null
  /** Lo que dice la rúbrica en ese nivel, si lo trae. */
  descriptor: string | null
  /** Parte del nivel máximo que alcanza, 0-100. */
  pctAlumno: number | null
  /** Media del grupo en el indicador, 0-100 (null si nadie lo tiene marcado). */
  pctGrupo: number | null
  /** Cuántos del grupo lo tienen marcado. */
  nGrupo: number
  /** Menos de la mitad del nivel máximo. */
  flojo: boolean
}

export type RegistroAnalizado = {
  fecha: string
  /** Nota 0-10 del registro (`notaDeRegistro`). */
  nota: number
  /** «Excelente», «Bien»… en un registro de nivel; null en una observación con rúbrica. */
  etiqueta: string | null
  conRubrica: boolean
  observacion: string | null
}

export type Tendencia = 'sube' | 'baja' | 'estable'

export type AnalisisActividad = {
  herramienta: 'rubrica' | 'diario'
  instrumento: string
  unidad: string | null
  titulo: string
  nota: Comparacion
  /** En el orden de la rúbrica. Vacío en el diario. */
  indicadores: IndicadorAnalizado[]
  /** Los flojos, del más bajo al menos; a igualdad, primero el que mejor lleva el grupo. */
  flojos: IndicadorAnalizado[]
  /** Los que tiene en el nivel máximo. */
  logrados: IndicadorAnalizado[]
  sinMarcar: number
  /** Del más antiguo al más reciente. */
  registros: RegistroAnalizado[]
  /** Con dos registros o más: del primero al último. */
  tendencia: Tendencia | null
  agregacion: Agregacion | null
}

const redondo = (n: number) => Math.round(n * 100) / 100
const comparar = (valor: number | null, delGrupo: (number | null)[]): Comparacion => {
  const grupo = resumenEstadistico(delGrupo)
  return { valor, grupo, diferencia: valor != null && grupo ? redondo(valor - grupo.mediana) : null }
}

/** ¿Tiene el alumno algo que contar en la actividad? */
export const tieneDatos = (a: AlumnoDeActividad, herramienta: 'rubrica' | 'diario'): boolean =>
  herramienta === 'rubrica' ? Object.keys(a.marcas).length > 0 || a.registros.length > 0 : a.registros.length > 0

/** Medio punto o más entre el primer registro y el último ya es moverse. */
const UMBRAL_TENDENCIA = 0.5

export function tendenciaDe(notas: number[]): Tendencia | null {
  if (notas.length < 2) return null
  const d = notas[notas.length - 1] - notas[0]
  return d >= UMBRAL_TENDENCIA ? 'sube' : d <= -UMBRAL_TENDENCIA ? 'baja' : 'estable'
}

/**
 * La actividad de un alumno frente a su grupo, o null si no tiene nada en
 * ella. Con `solo`, el grupo son esos compañeros (y él): los de media parecida.
 */
export function analizarActividad(act: ActividadDeUnidad, alumno_id: number, opciones: { solo?: number[] } = {}): AnalisisActividad | null {
  const dentro = opciones.solo ? new Set([...opciones.solo, alumno_id]) : null
  const grupo = dentro ? act.alumnos.filter(a => dentro.has(a.alumno_id)) : act.alumnos
  const el = act.alumnos.find(a => a.alumno_id === alumno_id)
  if (!el || !tieneDatos(el, act.herramienta)) return null

  const niveles = act.rubrica?.niveles ?? []
  const valorMax = niveles.length ? Math.max(...niveles.map(n => n.valor)) : 0
  const pct = (v: number) => valorMax > 0 ? Math.round(Math.max(0, Math.min(1, v / valorMax)) * 100) : 0

  const indicadores: IndicadorAnalizado[] = act.herramienta !== 'rubrica' || valorMax <= 0 ? [] : (act.rubrica?.indicadores ?? []).map(ind => {
    const suyo = el.marcas[ind.nombre]
    const valor = typeof suyo === 'number' ? suyo : null
    const delGrupo = grupo.map(a => a.marcas[ind.nombre]).filter((v): v is number => typeof v === 'number')
    const nivel = valor != null ? niveles.find(n => n.valor === valor)?.nombre ?? null : null
    const pctAlumno = valor != null ? pct(valor) : null
    return {
      nombre: ind.nombre,
      peso: typeof ind.peso === 'number' && ind.peso > 0 ? ind.peso : null,
      valor, nivel,
      descriptor: nivel ? ind.descriptores?.[nivel]?.trim() || null : null,
      pctAlumno,
      pctGrupo: delGrupo.length ? Math.round(delGrupo.reduce((s, v) => s + pct(v), 0) / delGrupo.length) : null,
      nGrupo: delGrupo.length,
      flojo: pctAlumno != null && pctAlumno < 50,
    }
  })

  const registros: RegistroAnalizado[] = ordenarRegistros(el.registros.map((r, i) => ({ ...r, id: r.id ?? i }))).map(r => {
    const conRubrica = r.nota != null
    return {
      fecha: r.fecha,
      nota: redondo(notaDeRegistro(r)),
      etiqueta: conRubrica ? null : ETIQUETAS_NIVEL[r.valor] ?? null,
      conRubrica,
      observacion: r.observacion?.trim() || null,
    }
  })

  return {
    herramienta: act.herramienta,
    instrumento: act.instrumento,
    unidad: act.unidad,
    titulo: act.herramienta === 'rubrica' ? act.rubrica?.titulo?.trim() || act.instrumento : act.instrumento,
    nota: comparar(el.nota, grupo.map(a => a.nota)),
    indicadores,
    flojos: indicadores.filter(i => i.flojo)
      .sort((a, b) => a.pctAlumno! - b.pctAlumno! || (b.pctGrupo ?? 0) - (a.pctGrupo ?? 0)),
    logrados: indicadores.filter(i => i.pctAlumno === 100),
    sinMarcar: indicadores.filter(i => i.valor == null).length,
    registros,
    tendencia: tendenciaDe(registros.map(r => r.nota)),
    agregacion: act.herramienta === 'diario' || registros.length ? act.agregacion ?? 'media' : null,
  }
}
