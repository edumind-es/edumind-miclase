/**
 * Reunión de datos para los informes.
 *
 * Junta lo local (IndexedDB) con las descripciones de criterios del
 * currículo público (servidor), y aplica el motor de cálculo para obtener
 * notas ponderadas de verdad, no medias aritméticas.
 */
import {
  getGrupo, getAsignaturas, getInstrumentos, getAlumnosByGrupo,
  getCalificacionesPorGrupo, getEvidenciasAlumno, getResumenAsistencia,
  getUnidades,
} from '@/db/queries'
import { calcularNotaArea, type NotaArea } from '@/db/calculo'
import type { Alumno, Grupo, Asignatura, Instrumento, Calificacion } from '@/db/localDb'

export type AreaInforme = {
  asig: Asignatura
  instrumentos: Instrumento[]
  /** criterio_id → descripción del currículo */
  descripciones: Map<string, string>
  /** criterio_id → peso en la programación */
  pesosCriterio: Map<string, number>
}

export type DatosGrupo = {
  grupo: Grupo
  alumnos: Alumno[]
  areas: AreaInforme[]
  calificaciones: Calificacion[]
  asistencia: Map<number, Record<string, number>>
}

type Cabeceras = () => Record<string, string>

async function criteriosDeArea(
  grupo: Grupo, asig: Asignatura, headers: Cabeceras
): Promise<Map<string, string>> {
  const cursoNorm = String(grupo.curso).replace('º', '').replace('ª', '') + 'º'
  const url = `/api/curriculum/criterios?asignatura=${encodeURIComponent(asig.nombre)}` +
              `&curso=${cursoNorm}&etapa=${grupo.etapa}` +
              `&comunidad=${encodeURIComponent(asig.comunidad || grupo.comunidad)}`
  try {
    const lista = await fetch(url, { headers: headers() }).then(r => r.ok ? r.json() : [])
    const m = new Map<string, string>()
    if (Array.isArray(lista)) for (const c of lista) m.set(c.id, c.descripcion)
    return m
  } catch {
    return new Map()
  }
}

export async function reunirDatosGrupo(grupoId: number, headers: Cabeceras): Promise<DatosGrupo> {
  const grupo = await getGrupo(grupoId)
  if (!grupo) throw new Error('La clase ya no existe.')

  const [alumnos, asigs, { calificaciones }, asistencia] = await Promise.all([
    getAlumnosByGrupo(grupoId),
    getAsignaturas(grupoId),
    getCalificacionesPorGrupo(grupoId),
    getResumenAsistencia(grupoId),
  ])

  const areas: AreaInforme[] = []
  for (const asig of asigs) {
    const [instrumentos, descripciones, unidades] = await Promise.all([
      getInstrumentos(asig.id!),
      criteriosDeArea(grupo, asig, headers),
      getUnidades(asig.id!),
    ])
    const pesosCriterio = new Map<string, number>()
    for (const u of unidades) {
      for (const c of u.criterios) {
        pesosCriterio.set(c.criterio_id, Math.max(pesosCriterio.get(c.criterio_id) ?? 0, c.peso || 1))
      }
    }
    areas.push({ asig, instrumentos, descripciones, pesosCriterio })
  }

  return { grupo, alumnos, areas, calificaciones, asistencia }
}

/** Notas de un alumno en todas sus áreas. */
export function notasDeAlumno(datos: DatosGrupo, alumnoId: number): { area: AreaInforme; nota: NotaArea }[] {
  return datos.areas.map(area => {
    const instrIds = new Set(area.instrumentos.map(i => i.id!))
    const propias = datos.calificaciones.filter(
      c => c.alumno_id === alumnoId && instrIds.has(c.instrumento_id))
    return {
      area,
      nota: calcularNotaArea(
        area.asig.id!, propias, area.instrumentos,
        area.asig.pesos_trimestres, area.pesosCriterio
      ),
    }
  })
}

/** Observaciones registradas por el docente, con su criterio y trimestre. */
export function observacionesDeAlumno(datos: DatosGrupo, alumnoId: number) {
  const instrAArea = new Map<number, string>()
  for (const a of datos.areas) {
    for (const i of a.instrumentos) instrAArea.set(i.id!, a.asig.nombre_display)
  }
  return datos.calificaciones
    .filter(c => c.alumno_id === alumnoId && c.observacion?.trim())
    .map(c => ({
      area: instrAArea.get(c.instrumento_id) ?? '',
      criterio: c.criterio_id,
      trimestre: c.trimestre,
      texto: c.observacion!.trim(),
      fecha: c.fecha,
    }))
    .sort((a, b) => a.trimestre - b.trimestre || a.criterio.localeCompare(b.criterio, 'es', { numeric: true }))
}

function blobADataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export type EvidenciaInforme = { src: string; criterio: string | null; fecha: string; descripcion?: string }

/** Evidencias del alumno ya convertidas a data-URL para incrustarlas. */
export async function evidenciasDeAlumno(alumnoId: number, maximo = 9): Promise<EvidenciaInforme[]> {
  const evs = await getEvidenciasAlumno(alumnoId)
  const salida: EvidenciaInforme[] = []
  for (const ev of evs.slice(0, maximo)) {
    try {
      salida.push({
        src: await blobADataURL(ev.blob),
        criterio: ev.criterio_id ?? null,
        fecha: ev.fecha,
        descripcion: ev.descripcion,
      })
    } catch { /* una evidencia ilegible no debe tumbar el informe */ }
  }
  return salida
}
