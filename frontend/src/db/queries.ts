import { db } from './localDb'
import type {
  Grupo, Alumno, GrupoAlumno, Asignatura, Instrumento,
  Calificacion, Sesion, AsistenciaRec, Unidad, UnidadCriterio, Rubrica,
  Evidencia, Plano, Asiento,
} from './localDb'

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export type GrupoConCount = Grupo & { num_alumnos: number }

export type GrupoDetalle = Grupo & { alumnos: Alumno[] }

export type AsignaturaDetalle = Asignatura & { instrumentos: Instrumento[] }

export type UnidadConCriterios = Unidad & {
  criterios: { criterio_id: string; peso: number; descripcion: string | null }[]
}

export type CalificadorBase = {
  alumnos: Alumno[]
  instrumentos: Instrumento[]
  calificaciones: Record<string, Calificacion>
  asig: Asignatura
  grupo: Grupo
}

export type CalItem = {
  alumno_id: number
  instrumento_id: number
  criterio_id: string
  asignatura: string
  curso: string
  etapa: string
  comunidad: string
  trimestre: number
  valor: number | null
  observacion?: string | null
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString()
}

// Caracteres sin ambigüedad visual (sin 0/O ni 1/I/L)
const CODIGO_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

async function generarCodigo(): Promise<string> {
  for (let intento = 0; intento < 20; intento++) {
    let codigo = ''
    for (let i = 0; i < 5; i++) codigo += CODIGO_CHARS[Math.floor(Math.random() * CODIGO_CHARS.length)]
    const existe = await db.alumnos.where('codigo_cifrado').equals(codigo).count()
    if (!existe) return codigo
  }
  // Salida de emergencia si hubiera 20 colisiones seguidas (prácticamente imposible)
  return Date.now().toString(36).toUpperCase().slice(-5)
}

// ─── GRUPOS ───────────────────────────────────────────────────────────────────

export async function getGrupos(): Promise<GrupoConCount[]> {
  const grupos = await db.grupos.toArray()
  return Promise.all(
    grupos.map(async g => {
      const num_alumnos = await db.grupo_alumnos
        .where({ grupo_id: g.id!, activo: 1 }).count()
      return { ...g, num_alumnos }
    })
  )
}

export async function getGrupoDetalle(id: number): Promise<GrupoDetalle | undefined> {
  const grupo = await db.grupos.get(id)
  if (!grupo) return undefined

  const gasoc = await db.grupo_alumnos.where('grupo_id').equals(id).toArray()
  const activoIds = gasoc.filter(ga => ga.activo).map(ga => ga.alumno_id)
  const alumnos = activoIds.length
    ? await db.alumnos.where('id').anyOf(activoIds).toArray()
    : []

  alumnos.sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`))
  return { ...grupo, alumnos }
}

export async function crearGrupo(data: Omit<Grupo, 'id' | 'created_at'>): Promise<number> {
  return db.grupos.add({ ...data, created_at: now() }) as Promise<number>
}

export async function eliminarGrupo(id: number): Promise<void> {
  await db.transaction('rw',
    [db.grupos, db.grupo_alumnos, db.asignaturas, db.instrumentos,
     db.calificaciones, db.sesiones, db.asistencia, db.unidades, db.unidad_criterios],
    async () => {
      // asignaturas → instrumentos → calificaciones → unidades → unidad_criterios
      const asigs = await db.asignaturas.where('grupo_id').equals(id).toArray()
      for (const a of asigs) {
        const instrs = await db.instrumentos.where('asignatura_id').equals(a.id!).toArray()
        for (const i of instrs) {
          await db.calificaciones.where('instrumento_id').equals(i.id!).delete()
        }
        await db.instrumentos.where('asignatura_id').equals(a.id!).delete()
        const unis = await db.unidades.where('asignatura_id').equals(a.id!).toArray()
        for (const u of unis) {
          await db.unidad_criterios.where('unidad_id').equals(u.id!).delete()
        }
        await db.unidades.where('asignatura_id').equals(a.id!).delete()
      }
      await db.asignaturas.where('grupo_id').equals(id).delete()

      const sesions = await db.sesiones.where('grupo_id').equals(id).toArray()
      for (const s of sesions) {
        await db.asistencia.where('sesion_id').equals(s.id!).delete()
      }
      await db.sesiones.where('grupo_id').equals(id).delete()
      await db.grupo_alumnos.where('grupo_id').equals(id).delete()
      await db.grupos.delete(id)
    }
  )
}

// ─── ALUMNOS ──────────────────────────────────────────────────────────────────

export async function getAlumnosByGrupo(grupo_id: number): Promise<Alumno[]> {
  const gasoc = await db.grupo_alumnos.where('grupo_id').equals(grupo_id).toArray()
  const activoIds = gasoc.filter(ga => ga.activo).map(ga => ga.alumno_id)
  if (!activoIds.length) return []
  const alumnos = await db.alumnos.where('id').anyOf(activoIds).toArray()
  alumnos.sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`))
  return alumnos
}

export async function crearAlumno(
  alumno: Omit<Alumno, 'id' | 'created_at'>,
  grupo_id: number
): Promise<number> {
  const codigo_cifrado = alumno.codigo_cifrado || await generarCodigo()
  const id = await db.alumnos.add({
    ...alumno, codigo_cifrado, created_at: now(),
  }) as number
  await db.grupo_alumnos.add({ grupo_id, alumno_id: id, activo: 1, fecha_alta: now() })
  return id
}

export async function actualizarAlumno(id: number, data: Partial<Alumno>): Promise<void> {
  await db.alumnos.update(id, data)
}

// Búsqueda por código de anonimización (lo que contiene el QR de la mesa)
export async function getAlumnoPorCodigo(codigo: string): Promise<Alumno | undefined> {
  return db.alumnos.where('codigo_cifrado').equals(codigo.toUpperCase().trim()).first()
}

// Grupos activos a los que pertenece un alumno
export async function getGruposDeAlumno(alumno_id: number): Promise<Grupo[]> {
  const gasoc = await db.grupo_alumnos.where('alumno_id').equals(alumno_id).toArray()
  const ids = gasoc.filter(ga => ga.activo).map(ga => ga.grupo_id)
  if (!ids.length) return []
  return db.grupos.where('id').anyOf(ids).toArray()
}

export async function eliminarAlumno(alumno_id: number, grupo_id: number): Promise<void> {
  await db.grupo_alumnos
    .where('[grupo_id+alumno_id]').equals([grupo_id, alumno_id])
    .modify({ activo: 0 })
}

// ─── ASIGNATURAS ─────────────────────────────────────────────────────────────

export async function getAsignaturas(grupo_id: number): Promise<Asignatura[]> {
  return db.asignaturas.where('grupo_id').equals(grupo_id).toArray()
}

export async function getAsignaturaDetalle(id: number): Promise<AsignaturaDetalle | undefined> {
  const asig = await db.asignaturas.get(id)
  if (!asig) return undefined
  const instrumentos = await db.instrumentos.where('asignatura_id').equals(id).toArray()
  instrumentos.sort((a, b) => a.orden - b.orden)
  return { ...asig, instrumentos }
}

export async function crearAsignatura(
  data: Omit<Asignatura, 'id' | 'created_at'>
): Promise<number> {
  return db.asignaturas.add({ ...data, created_at: now() }) as Promise<number>
}

export async function crearInstrumento(
  asignatura_id: number,
  data: Omit<Instrumento, 'id' | 'asignatura_id' | 'created_at'>
): Promise<number> {
  const max = await db.instrumentos.where('asignatura_id').equals(asignatura_id).toArray()
    .then(arr => arr.length)
  return db.instrumentos.add({
    ...data, asignatura_id, orden: data.orden ?? max, created_at: now(),
  }) as Promise<number>
}

export async function eliminarInstrumento(instrumento_id: number): Promise<void> {
  await db.calificaciones.where('instrumento_id').equals(instrumento_id).delete()
  await db.instrumentos.delete(instrumento_id)
}

// ─── CALIFICACIONES ───────────────────────────────────────────────────────────

/**
 * Devuelve alumnos, instrumentos y calificaciones indexadas para el calificador.
 * Los criterios los obtiene el componente del servidor (currículo público).
 */
export async function getCalificadorBase(
  asignatura_id: number,
  trimestre: number
): Promise<CalificadorBase | null> {
  const asig = await db.asignaturas.get(asignatura_id)
  if (!asig) return null
  const grupo = await db.grupos.get(asig.grupo_id)
  if (!grupo) return null

  const gasoc = await db.grupo_alumnos.where('grupo_id').equals(asig.grupo_id).toArray()
  const activoIds = gasoc.filter(ga => ga.activo).map(ga => ga.alumno_id)
  const alumnos = activoIds.length
    ? await db.alumnos.where('id').anyOf(activoIds).sortBy('apellidos')
    : []

  const instrumentos = await db.instrumentos.where('asignatura_id').equals(asignatura_id).toArray()
  instrumentos.sort((a, b) => a.orden - b.orden)

  const instrIds = instrumentos.map(i => i.id!)
  const cals = instrIds.length
    ? await db.calificaciones.where('instrumento_id').anyOf(instrIds)
        .filter(c => c.trimestre === trimestre).toArray()
    : []

  const calificaciones: Record<string, Calificacion> = {}
  for (const c of cals) {
    const key = `${c.alumno_id}:${c.criterio_id}:${c.instrumento_id}:${c.trimestre}`
    calificaciones[key] = c
  }

  return { alumnos, instrumentos, calificaciones, asig, grupo }
}

// Nota actual de un alumno en un criterio/instrumento/trimestre concretos
export async function getCalificacionUnica(
  alumno_id: number, instrumento_id: number, criterio_id: string, trimestre: number
): Promise<Calificacion | undefined> {
  return db.calificaciones
    .where('[alumno_id+instrumento_id+criterio_id+trimestre]')
    .equals([alumno_id, instrumento_id, criterio_id, trimestre])
    .first()
}

export async function saveCalificaciones(items: CalItem[]): Promise<void> {
  await db.transaction('rw', db.calificaciones, async () => {
    for (const item of items) {
      const existing = await db.calificaciones
        .where('[alumno_id+instrumento_id+criterio_id+trimestre]')
        .equals([item.alumno_id, item.instrumento_id, item.criterio_id, item.trimestre])
        .first()
      if (existing?.id != null) {
        await db.calificaciones.update(existing.id, {
          valor: item.valor, observacion: item.observacion ?? null, fecha: now(),
        })
      } else {
        await db.calificaciones.add({ ...item, fecha: now() })
      }
    }
  })
}

// Media por criterio y trimestre de una asignatura (para las gráficas de seguimiento)
export async function getResumenPorCriterio(asignatura_id: number): Promise<
  { criterio_id: string; trimestre: number; media: number }[]
> {
  const instrumentos = await db.instrumentos.where('asignatura_id').equals(asignatura_id).toArray()
  const instrIds = instrumentos.map(i => i.id!)
  if (!instrIds.length) return []

  const cals = await db.calificaciones.where('instrumento_id').anyOf(instrIds)
    .filter(c => c.valor != null).toArray()

  const acc = new Map<string, { suma: number; n: number }>()
  for (const c of cals) {
    const key = `${c.criterio_id}::${c.trimestre}`
    const e = acc.get(key) || { suma: 0, n: 0 }
    e.suma += c.valor!
    e.n++
    acc.set(key, e)
  }
  return [...acc.entries()].map(([key, { suma, n }]) => {
    const [criterio_id, trimestre] = key.split('::')
    return { criterio_id, trimestre: Number(trimestre), media: suma / n }
  })
}

// Para informes: todas las calificaciones de un grupo (todas asignaturas, todos trimestres)
export async function getCalificacionesPorGrupo(grupo_id: number): Promise<{
  asignaturas: AsignaturaDetalle[]
  alumnos: Alumno[]
  calificaciones: Calificacion[]
}> {
  const asigs = await db.asignaturas.where('grupo_id').equals(grupo_id).toArray()
  const instrIds: number[] = []
  const asigDetalle: AsignaturaDetalle[] = []

  for (const a of asigs) {
    const instrumentos = await db.instrumentos.where('asignatura_id').equals(a.id!).toArray()
    instrIds.push(...instrumentos.map(i => i.id!))
    asigDetalle.push({ ...a, instrumentos })
  }

  const calificaciones = instrIds.length
    ? await db.calificaciones.where('instrumento_id').anyOf(instrIds).toArray()
    : []

  const gasoc = await db.grupo_alumnos.where('grupo_id').equals(grupo_id).toArray()
  const activoIds = gasoc.filter(ga => ga.activo).map(ga => ga.alumno_id)
  const alumnos = activoIds.length
    ? await db.alumnos.where('id').anyOf(activoIds).sortBy('apellidos')
    : []

  return { asignaturas: asigDetalle, alumnos, calificaciones }
}

// ─── SESIONES Y ASISTENCIA ────────────────────────────────────────────────────

export async function getSesiones(grupo_id: number): Promise<Sesion[]> {
  const sesiones = await db.sesiones.where('grupo_id').equals(grupo_id).toArray()
  sesiones.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return sesiones
}

export async function crearSesion(data: Omit<Sesion, 'id' | 'created_at'>): Promise<number> {
  return db.sesiones.add({ ...data, created_at: now() }) as Promise<number>
}

// Edición del diario de sesión (notas, tipo, fecha)
export async function actualizarSesion(id: number, data: Partial<Sesion>): Promise<void> {
  await db.sesiones.update(id, data)
}

export async function getAsistencia(sesion_id: number): Promise<AsistenciaRec[]> {
  return db.asistencia.where('sesion_id').equals(sesion_id).toArray()
}

export async function saveAsistencia(
  sesion_id: number,
  registros: { alumno_id: number; estado: string }[]
): Promise<void> {
  await db.transaction('rw', db.asistencia, async () => {
    for (const r of registros) {
      const existing = await db.asistencia
        .where('[sesion_id+alumno_id]').equals([sesion_id, r.alumno_id]).first()
      if (existing?.id != null) {
        await db.asistencia.update(existing.id, { estado: r.estado })
      } else {
        await db.asistencia.add({ sesion_id, alumno_id: r.alumno_id, estado: r.estado })
      }
    }
  })
}

// ─── UNIDADES (programación didáctica) ───────────────────────────────────────

export async function getUnidades(
  asignatura_id: number,
  criteriosCurr: { id: string; descripcion: string }[] = []
): Promise<UnidadConCriterios[]> {
  const unidades = await db.unidades.where('asignatura_id').equals(asignatura_id).toArray()
  unidades.sort((a, b) => a.orden - b.orden || a.id! - b.id!)

  const descMap = new Map(criteriosCurr.map(c => [c.id, c.descripcion]))

  return Promise.all(unidades.map(async u => {
    const ucs = await db.unidad_criterios.where('unidad_id').equals(u.id!).toArray()
    return {
      ...u,
      criterios: ucs.map(uc => ({
        criterio_id: uc.criterio_id,
        peso: uc.peso,
        descripcion: descMap.get(uc.criterio_id) ?? null,
      })),
    }
  }))
}

export async function crearUnidad(data: Omit<Unidad, 'id' | 'created_at'>): Promise<number> {
  const max = await db.unidades.where('asignatura_id').equals(data.asignatura_id).count()
  return db.unidades.add({
    ...data, orden: data.orden ?? max, created_at: now(),
  }) as Promise<number>
}

export async function actualizarUnidad(id: number, data: Partial<Unidad>): Promise<void> {
  await db.unidades.update(id, data)
}

export async function eliminarUnidad(id: number): Promise<void> {
  await db.unidad_criterios.where('unidad_id').equals(id).delete()
  await db.unidades.delete(id)
}

export async function vincularCriterio(
  unidad_id: number, criterio_id: string, peso = 1.0
): Promise<void> {
  const existing = await db.unidad_criterios
    .where('[unidad_id+criterio_id]').equals([unidad_id, criterio_id]).first()
  if (existing?.id != null) {
    await db.unidad_criterios.update(existing.id, { peso })
  } else {
    await db.unidad_criterios.add({ unidad_id, criterio_id, peso })
  }
}

export async function desvincularCriterio(unidad_id: number, criterio_id: string): Promise<void> {
  await db.unidad_criterios
    .where('[unidad_id+criterio_id]').equals([unidad_id, criterio_id]).delete()
}

export async function generarPlantillaUnidades(
  asignatura_id: number,
  n: number,
  tipo: string,
  criteriosCurr: { id: string }[]
): Promise<UnidadConCriterios[]> {
  // Borrar unidades previas
  const previas = await db.unidades.where('asignatura_id').equals(asignatura_id).toArray()
  for (const u of previas) {
    await db.unidad_criterios.where('unidad_id').equals(u.id!).delete()
  }
  await db.unidades.where('asignatura_id').equals(asignatura_id).delete()

  const nReal = Math.min(n, 12)
  const trimestreSize = Math.ceil(nReal / 3)
  const critsPorUnidad = Math.ceil(criteriosCurr.length / nReal)
  const tipoLabel: Record<string, string> = {
    unidad: 'UD', situacion: 'SA', proyecto: 'Proyecto', secuencia: 'Sec.', bloque: 'Bloque',
  }
  const label = tipoLabel[tipo] || 'UD'

  const result: UnidadConCriterios[] = []
  for (let i = 0; i < nReal; i++) {
    const trimestre = Math.min(Math.floor(i / trimestreSize) + 1, 3)
    const uid = await db.unidades.add({
      asignatura_id, nombre: `${label} ${i + 1}`, tipo,
      trimestre, orden: i, activa: 1, created_at: now(),
    }) as number

    const inicio = i * critsPorUnidad
    const bloque = criteriosCurr.slice(inicio, inicio + critsPorUnidad)
    for (const c of bloque) {
      await db.unidad_criterios.add({ unidad_id: uid, criterio_id: c.id, peso: 1.0 })
    }
    result.push({
      id: uid, asignatura_id, nombre: `${label} ${i + 1}`, tipo,
      trimestre, orden: i, activa: 1,
      criterios: bloque.map(c => ({ criterio_id: c.id, peso: 1.0, descripcion: null })),
    })
  }
  return result
}

// ─── EDICIÓN ──────────────────────────────────────────────────────────────────

export async function actualizarInstrumento(
  id: number,
  fields: Partial<Pick<Instrumento, 'nombre' | 'tipo' | 'peso' | 'orden' | 'trimestres'>>
): Promise<void> {
  await db.instrumentos.update(id, fields)
}

// Subir/bajar un instrumento en el orden de su asignatura
export async function moverInstrumento(asignatura_id: number, instrumento_id: number, dir: -1 | 1): Promise<void> {
  const instrs = await db.instrumentos.where('asignatura_id').equals(asignatura_id).toArray()
  instrs.sort((a, b) => a.orden - b.orden || a.id! - b.id!)
  const idx = instrs.findIndex(i => i.id === instrumento_id)
  const destino = idx + dir
  if (idx < 0 || destino < 0 || destino >= instrs.length) return
  // Normalizar el orden a 0..n-1 e intercambiar las dos posiciones
  await db.transaction('rw', db.instrumentos, async () => {
    ;[instrs[idx], instrs[destino]] = [instrs[destino], instrs[idx]]
    for (let i = 0; i < instrs.length; i++) {
      if (instrs[i].orden !== i) await db.instrumentos.update(instrs[i].id!, { orden: i })
    }
  })
}

// ─── RÚBRICAS ─────────────────────────────────────────────────────────────────

export async function getRubrica(instrumento_id: number): Promise<Rubrica | null> {
  const r = await db.rubricas.where('instrumento_id').equals(instrumento_id).first()
  return r ?? null
}

export async function guardarRubrica(data: Omit<Rubrica, 'id' | 'created_at'> & { id?: number }): Promise<number> {
  const existing = await db.rubricas.where('instrumento_id').equals(data.instrumento_id).first()
  if (existing?.id != null) {
    await db.rubricas.update(existing.id, { ...data, created_at: now() })
    return existing.id
  }
  return db.rubricas.add({ ...data, created_at: now() }) as Promise<number>
}

export async function eliminarRubrica(instrumento_id: number): Promise<void> {
  await db.rubricas.where('instrumento_id').equals(instrumento_id).delete()
}

// ─── EVIDENCIAS ───────────────────────────────────────────────────────────────

/**
 * Comprime una imagen a JPEG (máx. 1600px de lado) antes de guardarla,
 * para que las fotos de la cámara no llenen la cuota de IndexedDB.
 */
export async function comprimirImagen(file: Blob, maxLado = 1600, calidad = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * escala)
  const h = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen')), 'image/jpeg', calidad)
  })
}

export async function crearEvidencia(data: Omit<Evidencia, 'id' | 'fecha'>): Promise<number> {
  return db.evidencias.add({ ...data, fecha: now() }) as Promise<number>
}

export async function getEvidenciasAlumno(alumno_id: number): Promise<Evidencia[]> {
  const evs = await db.evidencias.where('alumno_id').equals(alumno_id).toArray()
  evs.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return evs
}

export async function contarEvidenciasAlumno(alumno_id: number): Promise<number> {
  return db.evidencias.where('alumno_id').equals(alumno_id).count()
}

export async function eliminarEvidencia(id: number): Promise<void> {
  await db.evidencias.delete(id)
}

export async function actualizarEvidencia(id: number, data: Partial<Pick<Evidencia, 'descripcion' | 'criterio_id' | 'trimestre'>>): Promise<void> {
  await db.evidencias.update(id, data)
}

// ─── PLANO DE CLASE ───────────────────────────────────────────────────────────

export type PlanoDetalle = {
  plano: Plano
  asientos: Asiento[]
}

const PLANO_DEFAULT = { filas: 5, cols: 6 }

export async function getPlano(grupo_id: number): Promise<PlanoDetalle> {
  let plano = await db.planos.where('grupo_id').equals(grupo_id).first()
  if (!plano) {
    const id = await db.planos.add({ grupo_id, ...PLANO_DEFAULT }) as number
    plano = { id, grupo_id, ...PLANO_DEFAULT }
  }
  const asientos = await db.asientos.where('grupo_id').equals(grupo_id).toArray()
  return { plano, asientos }
}

export async function redimensionarPlano(grupo_id: number, filas: number, cols: number): Promise<void> {
  const plano = await db.planos.where('grupo_id').equals(grupo_id).first()
  if (plano?.id != null) await db.planos.update(plano.id, { filas, cols })
  // Quitar asientos que queden fuera de la nueva cuadrícula
  await db.asientos.where('grupo_id').equals(grupo_id)
    .filter(a => a.fila >= filas || a.col >= cols).delete()
}

export async function asignarAsiento(grupo_id: number, alumno_id: number, fila: number, col: number): Promise<void> {
  await db.transaction('rw', db.asientos, async () => {
    // Un alumno solo puede ocupar un asiento, y un asiento un alumno
    await db.asientos.where('[grupo_id+alumno_id]').equals([grupo_id, alumno_id]).delete()
    await db.asientos.where('[grupo_id+fila+col]').equals([grupo_id, fila, col]).delete()
    await db.asientos.add({ grupo_id, alumno_id, fila, col })
  })
}

export async function quitarAsiento(grupo_id: number, alumno_id: number): Promise<void> {
  await db.asientos.where('[grupo_id+alumno_id]').equals([grupo_id, alumno_id]).delete()
}

// ─── BACKUP / EXPORT / IMPORT ────────────────────────────────────────────────

// Los blobs de evidencias se serializan a base64 para el fichero de backup
function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function base64ABlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function exportarDatos(): Promise<string> {
  const [grupos, alumnos, grupo_alumnos, asignaturas, instrumentos,
         calificaciones, sesiones, asistencia, unidades, unidad_criterios, rubricas,
         evidencias, planos, asientos] = await Promise.all([
    db.grupos.toArray(),
    db.alumnos.toArray(),
    db.grupo_alumnos.toArray(),
    db.asignaturas.toArray(),
    db.instrumentos.toArray(),
    db.calificaciones.toArray(),
    db.sesiones.toArray(),
    db.asistencia.toArray(),
    db.unidades.toArray(),
    db.unidad_criterios.toArray(),
    db.rubricas.toArray(),
    db.evidencias.toArray(),
    db.planos.toArray(),
    db.asientos.toArray(),
  ])

  // Serializar los blobs de evidencias a base64
  const evidenciasSerial = await Promise.all(evidencias.map(async ev => {
    const { blob, ...rest } = ev
    return { ...rest, blob_b64: await blobABase64(blob) }
  }))

  return JSON.stringify({
    version: 3,
    exported_at: now(),
    grupos, alumnos, grupo_alumnos, asignaturas, instrumentos,
    calificaciones, sesiones, asistencia, unidades, unidad_criterios, rubricas,
    evidencias: evidenciasSerial, planos, asientos,
  }, null, 2)
}

export async function importarDatos(json: string): Promise<void> {
  const data = JSON.parse(json)
  if (![1, 2, 3].includes(data.version)) throw new Error('Versión de backup no compatible')

  // Reconstruir blobs fuera de la transacción (FileReader no puede vivir dentro)
  const evidencias: Evidencia[] = (data.evidencias || []).map((ev: any) => {
    const { blob_b64, ...rest } = ev
    return { ...rest, blob: base64ABlob(blob_b64, ev.mime || 'image/jpeg') }
  })

  await db.transaction('rw',
    [db.grupos, db.alumnos, db.grupo_alumnos, db.asignaturas, db.instrumentos,
     db.calificaciones, db.sesiones, db.asistencia, db.unidades, db.unidad_criterios,
     db.rubricas, db.evidencias, db.planos, db.asientos],
    async () => {
      await Promise.all([
        db.grupos.clear(), db.alumnos.clear(), db.grupo_alumnos.clear(),
        db.asignaturas.clear(), db.instrumentos.clear(), db.calificaciones.clear(),
        db.sesiones.clear(), db.asistencia.clear(), db.unidades.clear(),
        db.unidad_criterios.clear(), db.rubricas.clear(),
        db.evidencias.clear(), db.planos.clear(), db.asientos.clear(),
      ])
      await db.grupos.bulkAdd(data.grupos || [])
      await db.alumnos.bulkAdd(data.alumnos || [])
      await db.grupo_alumnos.bulkAdd(data.grupo_alumnos || [])
      await db.asignaturas.bulkAdd(data.asignaturas || [])
      await db.instrumentos.bulkAdd(data.instrumentos || [])
      await db.calificaciones.bulkAdd(data.calificaciones || [])
      await db.sesiones.bulkAdd(data.sesiones || [])
      await db.asistencia.bulkAdd(data.asistencia || [])
      await db.unidades.bulkAdd(data.unidades || [])
      await db.unidad_criterios.bulkAdd(data.unidad_criterios || [])
      await db.rubricas.bulkAdd(data.rubricas || [])
      await db.evidencias.bulkAdd(evidencias)
      await db.planos.bulkAdd(data.planos || [])
      await db.asientos.bulkAdd(data.asientos || [])
    }
  )
}
