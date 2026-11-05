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
import { calcularNotaArea, normalizarReglaArea, normalizarReglaFinal, pesosVinculoDeUnidades, type NotaArea, type PesosVinculo } from '@/db/calculo'
import {
  conexionesDeCriterios, perfilCompetenciasClave,
  type ConexionCriterio, type Descriptor, type PerfilCompetenciasClave,
} from '@/db/competenciasClave'
import type { Alumno, Grupo, Asignatura, Instrumento, Calificacion } from '@/db/localDb'
import { api } from '@/api'

export type AreaInforme = {
  asig: Asignatura
  instrumentos: Instrumento[]
  /** criterio_id → descripción del currículo */
  descripciones: Map<string, string>
  /** criterio_id → peso en la programación */
  pesosCriterio: Map<string, number>
  /** Reparto propio de cada criterio, cuando la programación lo declara. */
  pesosVinculo: PesosVinculo
  /** criterio_id → descriptores y competencias clave de su competencia específica */
  conexiones: Map<string, ConexionCriterio>
}

export type DatosGrupo = {
  grupo: Grupo
  alumnos: Alumno[]
  areas: AreaInforme[]
  calificaciones: Calificacion[]
  asistencia: Map<number, Record<string, number>>
  /** Periodo del que se ha recontado la asistencia (null = curso completo) */
  trimestreAsistencia: number | null
  /** Descriptores operativos de la etapa (vacío sin conexión) */
  descriptores: Descriptor[]
}

type Cabeceras = () => Record<string, string>

/**
 * Criterios del área en el currículo del servidor: su descripción y su
 * conexión con las competencias clave (vacío sin conexión).
 */
export async function curriculoDeArea(
  grupo: Grupo, asig: Asignatura, headers: Cabeceras
): Promise<{ descripciones: Map<string, string>; conexiones: Map<string, ConexionCriterio> }> {
  const cursoNorm = String(grupo.curso).replace('º', '').replace('ª', '') + 'º'
  const url = `/api/curriculum/criterios?asignatura=${encodeURIComponent(asig.nombre)}` +
              `&curso=${cursoNorm}&etapa=${grupo.etapa}` +
              `&comunidad=${encodeURIComponent(asig.comunidad || grupo.comunidad)}`
  try {
    const lista = await fetch(api(url), { headers: headers() }).then(r => r.ok ? r.json() : [])
    const descripciones = new Map<string, string>()
    if (!Array.isArray(lista)) return { descripciones, conexiones: new Map() }
    for (const c of lista) descripciones.set(c.id, c.descripcion)
    return { descripciones, conexiones: conexionesDeCriterios(lista) }
  } catch {
    return { descripciones: new Map(), conexiones: new Map() }
  }
}

/** Descripciones de los criterios del área, del currículo del servidor (vacío sin conexión). */
export async function criteriosDeArea(
  grupo: Grupo, asig: Asignatura, headers: Cabeceras
): Promise<Map<string, string>> {
  return (await curriculoDeArea(grupo, asig, headers)).descripciones
}

/** Descriptores operativos de la etapa de la clase (vacío sin conexión). */
export async function descriptoresDeEtapa(grupo: Grupo, headers: Cabeceras): Promise<Descriptor[]> {
  const url = `/api/curriculum/descriptores?etapa=${grupo.etapa}&comunidad=${encodeURIComponent(grupo.comunidad)}`
  try {
    const r = await fetch(api(url), { headers: headers() }).then(r => r.ok ? r.json() : null)
    return Array.isArray(r?.descriptores) ? r.descriptores : []
  } catch {
    return []
  }
}

/**
 * @param trimestre periodo del informe. La asistencia se recuenta solo de ese
 *   trimestre; a null, del curso completo.
 */
export async function reunirDatosGrupo(
  grupoId: number,
  headers: Cabeceras,
  trimestre: number | null = null
): Promise<DatosGrupo> {
  const grupo = await getGrupo(grupoId)
  if (!grupo) throw new Error('La clase ya no existe.')

  const [alumnos, asigs, { calificaciones }, asistencia, descriptores] = await Promise.all([
    getAlumnosByGrupo(grupoId),
    getAsignaturas(grupoId),
    getCalificacionesPorGrupo(grupoId),
    getResumenAsistencia(grupoId, trimestre),
    descriptoresDeEtapa(grupo, headers),
  ])

  const areas: AreaInforme[] = []
  for (const asig of asigs) {
    const [instrumentos, { descripciones, conexiones }, unidades] = await Promise.all([
      getInstrumentos(asig.id!),
      curriculoDeArea(grupo, asig, headers),
      getUnidades(asig.id!),
    ])
    const pesosCriterio = new Map<string, number>()
    for (const u of unidades) {
      for (const c of u.criterios) {
        pesosCriterio.set(c.criterio_id, Math.max(pesosCriterio.get(c.criterio_id) ?? 0, c.peso || 1))
      }
    }
    areas.push({
      asig, instrumentos, descripciones, pesosCriterio,
      pesosVinculo: pesosVinculoDeUnidades(unidades),
      conexiones,
    })
  }

  return { grupo, alumnos, areas, calificaciones, asistencia, trimestreAsistencia: trimestre, descriptores }
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
        area.asig.pesos_trimestres, area.pesosCriterio, area.pesosVinculo,
        normalizarReglaFinal(area.asig.regla_final), normalizarReglaArea(area.asig.regla_area)
      ),
    }
  })
}

/**
 * Perfil de competencias clave de un alumno: sus notas de criterio de todas
 * las áreas, con la conexión de cada criterio. El cálculo es de
 * `db/competenciasClave.ts`.
 */
export function competenciasDeAlumno(datos: DatosGrupo, alumnoId: number): PerfilCompetenciasClave {
  return perfilCompetenciasClave(
    notasDeAlumno(datos, alumnoId).map(({ area, nota }) => ({
      area: area.asig.nombre_display,
      criterios: nota.criterios,
      pesosCriterio: area.pesosCriterio,
      conexiones: area.conexiones,
    })),
    datos.descriptores,
  )
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

export type EvidenciaInforme = {
  tipo: 'foto' | 'audio' | 'video'
  /** Data-URL, solo para fotos: audio y vídeo no se pueden imprimir */
  src?: string
  criterio: string | null
  fecha: string
  descripcion?: string
  duracion_ms?: number | null
  bytes: number
}

/**
 * Evidencias del alumno preparadas para el informe.
 *
 * Las fotos se incrustan como data-URL. El audio y el vídeo no caben en papel,
 * pero tampoco pueden desaparecer del informe: se listan con su tipo, fecha,
 * criterio y duración, para que el documento deje constancia de que existen y
 * de dónde consultarlos.
 */
export async function evidenciasDeAlumno(alumnoId: number, maximoFotos = 9): Promise<EvidenciaInforme[]> {
  const evs = await getEvidenciasAlumno(alumnoId)
  const salida: EvidenciaInforme[] = []
  let fotas = 0

  for (const ev of evs) {
    const base = {
      tipo: ev.tipo,
      criterio: ev.criterio_id ?? null,
      fecha: ev.fecha,
      descripcion: ev.descripcion,
      duracion_ms: ev.duracion_ms ?? null,
      bytes: ev.blob.size,
    }
    if (ev.tipo === 'foto') {
      if (fotas >= maximoFotos) continue
      try {
        salida.push({ ...base, src: await blobADataURL(ev.blob) })
        fotas++
      } catch { /* una imagen ilegible no debe tumbar el informe */ }
    } else {
      salida.push(base)
    }
  }
  return salida
}
