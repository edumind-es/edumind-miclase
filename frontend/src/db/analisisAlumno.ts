/**
 * Análisis de un alumno frente a su grupo, en un área: dónde está respecto a
 * la media, la mediana y la moda de la clase —por área, por instrumento y
 * por criterio—, cuáles son sus puntos débiles y, en cada examen, qué
 * preguntas falló que la mayoría acertó.
 *
 * Puro (`pruebas/analisis-alumno.test.ts`): no calcula ninguna nota. Parte
 * de las `NotaArea` que ya da `calcularNotaArea` para toda la clase
 * (`getResumenCurso`) y de las respuestas que ya guarda cada examen, así que
 * lo que enseña coincide con «Todo el curso» y con el boletín.
 *
 * Reglas decididas por Luis (auditoría de nov 2026):
 * - La moda va sobre el calificativo (`db/estadistica.ts`).
 * - La nota de un criterio ADAPTADO (ACI) es la de otro criterio: no entra
 *   en la estadística del grupo de ese criterio, y a ese alumno no se le
 *   compara ahí. Se aplica siempre, con NEAE a la vista o no, para que los
 *   números no cambien al apagarlo; lo que se esconde es el motivo.
 * - En el documento impreso, con menos de `MINIMO_GRUPO` notas no se dan las
 *   cifras del grupo: de tres notas se deducen las de los demás.
 */
import type { NotaArea } from './calculo'
import type { Medida } from './localDb'
import { criterioAdaptado } from './medidas'
import { resumenEstadistico, type ResumenEstadistico } from './estadistica'
import { notaDePrueba, pruebaDeUnidad, puntosDePregunta, type PruebaDef } from './prueba'
import { informeDePrueba, type RespuestasAlumno } from './informePrueba'

/** Con menos notas que estas, el documento impreso no da cifras del grupo. */
export const MINIMO_GRUPO = 5

export const PERIODOS = ['1', '2', '3', 'final'] as const
export type Periodo = typeof PERIODOS[number]
export const ETIQUETA_PERIODO: Record<Periodo, string> = { 1: '1T', 2: '2T', 3: '3T', final: 'Final' }

/** La nota del alumno junto a lo que saca el grupo en lo mismo. */
export type Comparacion = {
  valor: number | null
  grupo: ResumenEstadistico | null
  /** Nota del alumno menos la mediana del grupo. */
  diferencia: number | null
}

export type FilaAnalisis = {
  id: string
  nombre: string
  periodos: Record<Periodo, Comparacion>
  /** Criterio adaptado para este alumno en algún trimestre: no se compara. */
  adaptado?: boolean
}

export type PuntoDebil = { criterio_id: string; valor: number; mediana: number | null; diferencia: number | null }

export type AnalisisAlumno = {
  alumno_id: number
  area: FilaAnalisis
  /** Las familias de instrumentos (lo que pondera el área). Sin final: se comparan por trimestre. */
  instrumentos: FilaAnalisis[]
  criterios: FilaAnalisis[]
  /** Criterios suspensos o claramente por debajo del grupo, del peor al menos malo. */
  debiles: PuntoDebil[]
  /** Criterios en los que más destaca sobre el grupo. */
  fuertes: PuntoDebil[]
}

const redondo = (n: number) => Math.round(n * 100) / 100
const comparar = (valor: number | null | undefined, delGrupo: (number | null | undefined)[]): Comparacion => {
  const grupo = resumenEstadistico(delGrupo)
  const v = valor ?? null
  return { valor: v, grupo, diferencia: v != null && grupo ? redondo(v - grupo.mediana) : null }
}
const SIN_COMPARAR: Comparacion = { valor: null, grupo: null, diferencia: null }

/** ¿Tiene el alumno este criterio adaptado en el periodo? (En la final: en algún trimestre.) */
function adaptadoEn(medidas: Medida[] | undefined, criterio_id: string, periodo: Periodo): boolean {
  if (!medidas?.length) return false
  const trimestres = periodo === 'final' ? [1, 2, 3] : [Number(periodo)]
  return trimestres.some(t => criterioAdaptado(medidas, criterio_id, t) != null)
}

/**
 * El análisis de un alumno con las notas de toda la clase en el área.
 *
 * @param notas   alumno_id → sus notas del área (`getResumenCurso().notas`)
 * @param medidas alumno_id → sus medidas en el área
 */
export function analizarAlumno(
  alumno_id: number, notas: Map<number, NotaArea>, medidas: Map<number, Medida[]> = new Map(),
): AnalisisAlumno {
  const propia = notas.get(alumno_id)
  const todas = [...notas.entries()]
  const deArea = (n: NotaArea | undefined, p: Periodo) => !n ? null : p === 'final' ? n.final : n.trimestres[Number(p)]

  const area: FilaAnalisis = {
    id: 'area', nombre: 'Nota del área',
    periodos: Object.fromEntries(PERIODOS.map(p => [p, comparar(deArea(propia, p), todas.map(([, n]) => deArea(n, p)))])) as Record<Periodo, Comparacion>,
  }

  // Familias de instrumentos: la media de sus criterios en cada trimestre.
  const idsInstrumento = [...new Set(todas.flatMap(([, n]) => n.instrumentos.map(i => i.instrumento_id)))]
  const instrumentos: FilaAnalisis[] = idsInstrumento.map(id => {
    const de = (n: NotaArea | undefined, t: number) => n?.instrumentos.find(i => i.instrumento_id === id)?.trimestres[t] ?? null
    const nombre = todas.map(([, n]) => n.instrumentos.find(i => i.instrumento_id === id)?.nombre).find(Boolean) ?? `Instrumento ${id}`
    return {
      id: String(id), nombre,
      periodos: {
        1: comparar(de(propia, 1), todas.map(([, n]) => de(n, 1))),
        2: comparar(de(propia, 2), todas.map(([, n]) => de(n, 2))),
        3: comparar(de(propia, 3), todas.map(([, n]) => de(n, 3))),
        final: SIN_COMPARAR,
      },
    }
  }).filter(f => PERIODOS.some(p => f.periodos[p].valor != null || f.periodos[p].grupo))

  // Criterios: la nota adaptada de un alumno no entra en el grupo del criterio.
  const idsCriterio = [...new Set(todas.flatMap(([, n]) => n.criterios.map(c => c.criterio_id)))]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  const deCriterio = (n: NotaArea | undefined, id: string, p: Periodo) => {
    const c = n?.criterios.find(x => x.criterio_id === id)
    return !c ? null : p === 'final' ? c.final : c.trimestres[Number(p)]
  }
  const criterios: FilaAnalisis[] = idsCriterio.map(id => {
    const periodos = Object.fromEntries(PERIODOS.map(p => {
      if (adaptadoEn(medidas.get(alumno_id), id, p)) return [p, { valor: deCriterio(propia, id, p), grupo: null, diferencia: null }]
      const delGrupo = todas.filter(([a]) => !adaptadoEn(medidas.get(a), id, p)).map(([, n]) => deCriterio(n, id, p))
      return [p, comparar(deCriterio(propia, id, p), delGrupo)]
    })) as Record<Periodo, Comparacion>
    return { id, nombre: id, periodos, ...(adaptadoEn(medidas.get(alumno_id), id, 'final') ? { adaptado: true } : {}) }
  })

  // Puntos débiles y fuertes, con la nota final de cada criterio.
  const conNota = criterios.filter(c => c.periodos.final.valor != null && !c.adaptado).map(c => ({
    criterio_id: c.id, valor: c.periodos.final.valor!, mediana: c.periodos.final.grupo?.mediana ?? null, diferencia: c.periodos.final.diferencia,
  }))
  const debiles = conNota
    .filter(c => c.valor < 5 || (c.diferencia != null && c.diferencia <= -1))
    .sort((a, b) => a.valor - b.valor || (a.diferencia ?? 0) - (b.diferencia ?? 0))
  const fuertes = conNota
    .filter(c => c.valor >= 5 && c.diferencia != null && c.diferencia >= 1)
    .sort((a, b) => (b.diferencia ?? 0) - (a.diferencia ?? 0) || b.valor - a.valor)

  return { alumno_id, area, instrumentos, criterios, debiles, fuertes }
}

// ── Exámenes ──────────────────────────────────────────────────────────────

/** Un examen corregido del área, con lo que respondió cada alumno. */
export type ExamenDeArea = {
  /** El instrumento del examen, para abrir su informe. */
  instrumento_id?: number
  instrumento: string
  unidad_id: number | null
  unidad: string | null
  def: PruebaDef
  /** Criterios en los que el examen pone nota. */
  destinos: string[]
  respuestas: RespuestasAlumno[]
}

export type PreguntaAnalizada = {
  numero: number
  enunciado: string
  criterio_id: string | null
  aspecto: string | null
  max: number
  /** Puntos del alumno en la pregunta (en un test con penalización, puede ser negativo). */
  obtenido: number
  /** Parte de la pregunta que consigue el alumno, 0-100. */
  pctAlumno: number
  /** Índice de acierto del grupo en la pregunta, 0-100. */
  pctGrupo: number
  /** La falló (menos de la mitad) y la mayoría del grupo la acertó (60 % o más). */
  falloDestacado: boolean
}

export type AnalisisExamen = {
  titulo: string
  instrumento: string
  unidad: string | null
  nota: Comparacion
  preguntas: PreguntaAnalizada[]
  /** Las preguntas que él falló y la mayoría acertó, de la más acertada por el grupo a la menos. */
  fallosDestacados: PreguntaAnalizada[]
  /** Todas las que falló (menos de la mitad), de la más acertada por el grupo a la menos. */
  falladas: PreguntaAnalizada[]
  /** Por aspecto (o por criterio si no hay aspectos): % del alumno frente al del grupo. */
  ejes: { nombre: string; pctAlumno: number; pctGrupo: number }[]
  ejesPor: 'aspecto' | 'criterio'
}

/** Hasta cuánto se puede separar la nota del área de un compañero para ser «de media parecida». */
export const MARGEN_PARECIDOS = 1

/**
 * Los compañeros de media parecida a la de un alumno: los que tienen la nota
 * del área a `MARGEN_PARECIDOS` o menos de la suya. Si salen menos de
 * `MINIMO_GRUPO`, se toman los `MINIMO_GRUPO` más cercanos (o todos, si no
 * hay tantos). El alumno no va en la lista; sin nota del área, no hay grupo.
 *
 * @param notas      alumno_id → nota del área
 * @param candidatos los que se pueden comparar (los que tienen el examen corregido)
 */
export function alumnosDeMediaParecida(
  alumno_id: number, notas: Map<number, number | null | undefined>, candidatos: number[],
): number[] {
  const suya = notas.get(alumno_id)
  if (suya == null) return []
  const otros = [...new Set(candidatos)].filter(id => id !== alumno_id && notas.get(id) != null)
    .map(id => ({ id, distancia: Math.abs(notas.get(id)! - suya) }))
    .sort((a, b) => a.distancia - b.distancia || a.id - b.id)
  const cerca = otros.filter(o => o.distancia <= MARGEN_PARECIDOS + 1e-9)
  return (cerca.length >= MINIMO_GRUPO ? cerca : otros.slice(0, MINIMO_GRUPO)).map(o => o.id)
}

/**
 * El examen de un alumno frente al del grupo, o null si no lo tiene corregido.
 * Con `solo`, el grupo son esos compañeros (y él): los de media parecida.
 */
export function analizarExamen(examen: ExamenDeArea, alumno_id: number, opciones: { solo?: number[] } = {}): AnalisisExamen | null {
  if (opciones.solo) {
    const dentro = new Set([...opciones.solo, alumno_id])
    examen = { ...examen, respuestas: examen.respuestas.filter(r => dentro.has(r.alumno_id)) }
  }
  // Con preguntas por unidad, el examen cuenta en su unidad con las suyas.
  const def = pruebaDeUnidad(examen.def, examen.unidad_id)
  const suyas = examen.respuestas.find(r => r.alumno_id === alumno_id)
  if (!suyas || !Object.keys(suyas.respuestas).length || !def.preguntas.length) return null
  const grupo = informeDePrueba(def, examen.respuestas, examen.destinos)
  const propio = informeDePrueba(def, [suyas], examen.destinos)
  const notas = examen.respuestas.map(r => notaDePrueba(def, r.respuestas, examen.destinos).nota)
  const mia = notaDePrueba(def, suyas.respuestas, examen.destinos).nota

  const preguntas: PreguntaAnalizada[] = def.preguntas.map((p, i) => {
    const obtenido = redondo(puntosDePregunta(def, p, suyas.respuestas[p.id]))
    const pctAlumno = Math.round(Math.max(0, obtenido) / p.max * 100)
    const pctGrupo = Math.round(grupo.preguntas[i].pctAcierto)
    return {
      numero: i + 1, enunciado: p.enunciado, criterio_id: p.criterio_id ?? null, aspecto: p.aspecto ?? null, max: p.max,
      obtenido, pctAlumno, pctGrupo, falloDestacado: pctAlumno < 50 && pctGrupo >= 60,
    }
  })
  return {
    titulo: def.titulo, instrumento: examen.instrumento, unidad: examen.unidad,
    nota: comparar(mia, notas),
    preguntas,
    fallosDestacados: preguntas.filter(p => p.falloDestacado).sort((a, b) => b.pctGrupo - a.pctGrupo || a.numero - b.numero),
    falladas: preguntas.filter(p => p.pctAlumno < 50).sort((a, b) => b.pctGrupo - a.pctGrupo || a.numero - b.numero),
    ejes: grupo.ejes.map(e => ({
      nombre: e.nombre, pctGrupo: Math.round(e.pctAcierto),
      pctAlumno: Math.round(propio.ejes.find(x => x.clave === e.clave)?.pctAcierto ?? 0),
    })),
    ejesPor: grupo.ejesPor,
  }
}

/** ¿Se pueden dar las cifras del grupo en un documento? Con pocas notas, no. */
export const grupoPublicable = (c: Comparacion): boolean => (c.grupo?.n ?? 0) >= MINIMO_GRUPO
