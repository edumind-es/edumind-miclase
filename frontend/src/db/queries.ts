import { db } from './localDb'
import { nuevoId, sello } from './ids'
import { LIMITE_EVIDENCIA, LIMITE_EVIDENCIA_SINC, enMB } from './limites'
import { aplicaEnTrimestre, trimestreDeFecha } from './calculo'
import { reiniciarEstadoDeSincronizacion } from './sync'
import type {
  Grupo, Alumno, Asignatura, Instrumento,
  Calificacion, Sesion, AsistenciaRec, Unidad, Rubrica,
  Evidencia, Plano, Asiento, CriterioInstrumento, Sincronizable,
} from './localDb'

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export type GrupoConCount = Grupo & { num_alumnos: number }

export type GrupoDetalle = Grupo & { alumnos: Alumno[] }

export type AsignaturaDetalle = Asignatura & { instrumentos: Instrumento[] }

export type UnidadConCriterios = Unidad & {
  criterios: {
    criterio_id: string
    peso: number
    descripcion: string | null
    instrumentos: { instrumento_id: number; peso: number }[]
  }[]
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
  unidad_id?: number | null
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString()
}

/** Descarta los registros con borrado lógico. */
function vivos<T extends Sincronizable>(arr: T[]): T[] {
  return arr.filter(r => !r.deleted_at)
}

/** Campos que lleva todo registro nuevo: id propio del dispositivo + sello. */
function nuevo<T extends object>(data: T): T & { id: number; updated_at: string; deleted_at: null } {
  return { ...data, id: nuevoId(), updated_at: sello(), deleted_at: null }
}

/** Campos que lleva toda modificación. */
function tocado<T extends object>(data: T): T & { updated_at: string } {
  return { ...data, updated_at: sello() }
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
  const grupos = vivos(await db.grupos.toArray())
  return Promise.all(
    grupos.map(async g => {
      const asocs = vivos(await db.grupo_alumnos.where('grupo_id').equals(g.id!).toArray())
      return { ...g, num_alumnos: asocs.filter(a => a.activo).length }
    })
  )
}

export async function getGrupo(id: number): Promise<Grupo | undefined> {
  const g = await db.grupos.get(id)
  return g && !g.deleted_at ? g : undefined
}

export async function getGrupoDetalle(id: number): Promise<GrupoDetalle | undefined> {
  const grupo = await getGrupo(id)
  if (!grupo) return undefined

  const alumnos = await getAlumnosByGrupo(id)
  return { ...grupo, alumnos }
}

export async function crearGrupo(data: Omit<Grupo, 'id' | 'created_at'>): Promise<number> {
  const reg = nuevo({ ...data, created_at: now() })
  await db.grupos.add(reg)
  return reg.id
}

export async function actualizarGrupo(id: number, data: Partial<Grupo>): Promise<void> {
  await db.grupos.update(id, tocado(data))
}

/**
 * Borrado lógico en cascada. Marcamos `deleted_at` en lugar de borrar
 * físicamente: un borrado invisible no se puede propagar a los demás
 * dispositivos, y reaparecería en el siguiente sync.
 */
export async function eliminarGrupo(id: number): Promise<void> {
  const t = sello()
  await db.transaction('rw',
    [db.grupos, db.grupo_alumnos, db.asignaturas, db.instrumentos,
     db.calificaciones, db.sesiones, db.asistencia, db.unidades, db.unidad_criterios,
     db.criterio_instrumentos, db.rubricas, db.evidencias, db.planos, db.asientos],
    async () => {
      const marcar = { deleted_at: t, updated_at: t }

      const asigs = await db.asignaturas.where('grupo_id').equals(id).toArray()
      for (const a of asigs) {
        const instrs = await db.instrumentos.where('asignatura_id').equals(a.id!).toArray()
        for (const i of instrs) {
          await db.calificaciones.where('instrumento_id').equals(i.id!).modify(marcar)
          await db.rubricas.where('instrumento_id').equals(i.id!).modify(marcar)
        }
        await db.instrumentos.where('asignatura_id').equals(a.id!).modify(marcar)

        const unis = await db.unidades.where('asignatura_id').equals(a.id!).toArray()
        for (const u of unis) {
          await db.unidad_criterios.where('unidad_id').equals(u.id!).modify(marcar)
          await db.criterio_instrumentos.where('unidad_id').equals(u.id!).modify(marcar)
        }
        await db.unidades.where('asignatura_id').equals(a.id!).modify(marcar)
      }
      await db.asignaturas.where('grupo_id').equals(id).modify(marcar)

      const sesions = await db.sesiones.where('grupo_id').equals(id).toArray()
      for (const s of sesions) {
        await db.asistencia.where('sesion_id').equals(s.id!).modify(marcar)
      }
      await db.sesiones.where('grupo_id').equals(id).modify(marcar)

      // Evidencias del alumnado de este grupo (solo si no está en otro grupo)
      const asocs = await db.grupo_alumnos.where('grupo_id').equals(id).toArray()
      for (const ga of asocs) {
        const otros = await db.grupo_alumnos.where('alumno_id').equals(ga.alumno_id).toArray()
        const enOtroGrupo = otros.some(o => o.grupo_id !== id && o.activo && !o.deleted_at)
        if (!enOtroGrupo) {
          await db.evidencias.where('alumno_id').equals(ga.alumno_id).modify(marcar)
        }
      }

      await db.planos.where('grupo_id').equals(id).modify(marcar)
      await db.asientos.where('grupo_id').equals(id).modify(marcar)
      await db.grupo_alumnos.where('grupo_id').equals(id).modify(marcar)
      await db.grupos.update(id, marcar)
    }
  )
}

// ─── ALUMNOS ──────────────────────────────────────────────────────────────────

export async function getAlumnosByGrupo(grupo_id: number): Promise<Alumno[]> {
  const gasoc = vivos(await db.grupo_alumnos.where('grupo_id').equals(grupo_id).toArray())
  const activoIds = gasoc.filter(ga => ga.activo).map(ga => ga.alumno_id)
  if (!activoIds.length) return []
  const alumnos = vivos(await db.alumnos.where('id').anyOf(activoIds).toArray())
  alumnos.sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  return alumnos
}

export async function crearAlumno(
  alumno: Omit<Alumno, 'id' | 'created_at'>,
  grupo_id: number
): Promise<number> {
  const codigo_cifrado = alumno.codigo_cifrado || await generarCodigo()
  const reg = nuevo({ ...alumno, codigo_cifrado, created_at: now() })
  await db.alumnos.add(reg)
  await db.grupo_alumnos.add(nuevo({
    grupo_id, alumno_id: reg.id, activo: 1, fecha_alta: now(),
  }))
  return reg.id
}

export async function actualizarAlumno(id: number, data: Partial<Alumno>): Promise<void> {
  await db.alumnos.update(id, tocado(data))
}

// Búsqueda por código de anonimización (lo que contiene el QR de la mesa)
export async function getAlumnoPorCodigo(codigo: string): Promise<Alumno | undefined> {
  const a = await db.alumnos.where('codigo_cifrado').equals(codigo.toUpperCase().trim()).first()
  return a && !a.deleted_at ? a : undefined
}

// Grupos activos a los que pertenece un alumno
export async function getGruposDeAlumno(alumno_id: number): Promise<Grupo[]> {
  const gasoc = vivos(await db.grupo_alumnos.where('alumno_id').equals(alumno_id).toArray())
  const ids = gasoc.filter(ga => ga.activo).map(ga => ga.grupo_id)
  if (!ids.length) return []
  return vivos(await db.grupos.where('id').anyOf(ids).toArray())
}

/** Saca al alumno del grupo (baja), no borra su ficha ni su historial. */
export async function eliminarAlumno(alumno_id: number, grupo_id: number): Promise<void> {
  await db.grupo_alumnos
    .where('[grupo_id+alumno_id]').equals([grupo_id, alumno_id])
    .modify({ activo: 0, updated_at: sello() })
}

// ─── ASIGNATURAS ─────────────────────────────────────────────────────────────

export async function getAsignaturas(grupo_id: number): Promise<Asignatura[]> {
  const asigs = vivos(await db.asignaturas.where('grupo_id').equals(grupo_id).toArray())
  asigs.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) ||
    a.nombre_display.localeCompare(b.nombre_display, 'es'))
  return asigs
}

export async function getAsignatura(id: number): Promise<Asignatura | undefined> {
  const a = await db.asignaturas.get(id)
  return a && !a.deleted_at ? a : undefined
}

export async function getAsignaturaDetalle(id: number): Promise<AsignaturaDetalle | undefined> {
  const asig = await getAsignatura(id)
  if (!asig) return undefined
  const instrumentos = await getInstrumentos(id)
  return { ...asig, instrumentos }
}

export async function crearAsignatura(
  data: Omit<Asignatura, 'id' | 'created_at'>
): Promise<number> {
  const orden = data.orden ?? await db.asignaturas.where('grupo_id').equals(data.grupo_id).count()
  const reg = nuevo({ ...data, orden, created_at: now() })
  await db.asignaturas.add(reg)
  return reg.id
}

/** Alta de varias áreas de una vez — el flujo real de principio de curso. */
export async function crearAsignaturasEnLote(
  grupo_id: number,
  comunidad: string,
  areas: { nombre: string; nombre_display: string }[]
): Promise<number[]> {
  const existentes = await getAsignaturas(grupo_id)
  const yaEstan = new Set(existentes.map(a => a.nombre))
  let orden = existentes.length
  const ids: number[] = []

  for (const area of areas) {
    if (yaEstan.has(area.nombre)) continue
    const reg = nuevo({
      grupo_id,
      nombre: area.nombre,
      nombre_display: area.nombre_display,
      comunidad,
      pesos_trimestres: '{"1":33,"2":33,"3":34}',
      orden: orden++,
      created_at: now(),
    })
    await db.asignaturas.add(reg)
    ids.push(reg.id)
  }
  return ids
}

export async function actualizarAsignatura(id: number, data: Partial<Asignatura>): Promise<void> {
  await db.asignaturas.update(id, tocado(data))
}

export async function eliminarAsignatura(id: number): Promise<void> {
  const t = sello()
  const marcar = { deleted_at: t, updated_at: t }
  await db.transaction('rw',
    [db.asignaturas, db.instrumentos, db.calificaciones, db.rubricas,
     db.unidades, db.unidad_criterios, db.criterio_instrumentos],
    async () => {
      const instrs = await db.instrumentos.where('asignatura_id').equals(id).toArray()
      for (const i of instrs) {
        await db.calificaciones.where('instrumento_id').equals(i.id!).modify(marcar)
        await db.rubricas.where('instrumento_id').equals(i.id!).modify(marcar)
      }
      await db.instrumentos.where('asignatura_id').equals(id).modify(marcar)
      const unis = await db.unidades.where('asignatura_id').equals(id).toArray()
      for (const u of unis) {
        await db.unidad_criterios.where('unidad_id').equals(u.id!).modify(marcar)
        await db.criterio_instrumentos.where('unidad_id').equals(u.id!).modify(marcar)
      }
      await db.unidades.where('asignatura_id').equals(id).modify(marcar)
      await db.asignaturas.update(id, marcar)
    }
  )
}

// ─── INSTRUMENTOS ────────────────────────────────────────────────────────────

export async function getInstrumentos(asignatura_id: number): Promise<Instrumento[]> {
  const instrumentos = vivos(await db.instrumentos.where('asignatura_id').equals(asignatura_id).toArray())
  instrumentos.sort((a, b) => a.orden - b.orden || a.id! - b.id!)
  return instrumentos
}

export async function crearInstrumento(
  asignatura_id: number,
  data: Omit<Instrumento, 'id' | 'asignatura_id' | 'created_at'>
): Promise<number> {
  const orden = data.orden ?? (await getInstrumentos(asignatura_id)).length
  const reg = nuevo({ ...data, asignatura_id, orden, created_at: now() })
  await db.instrumentos.add(reg)
  return reg.id
}

export async function actualizarInstrumento(
  id: number,
  fields: Partial<Pick<Instrumento, 'nombre' | 'tipo' | 'peso' | 'orden' | 'trimestres'>>
): Promise<void> {
  await db.instrumentos.update(id, tocado(fields))
}

/** Al borrar un instrumento caen sus notas, su rúbrica y sus vínculos con criterios. */
export async function eliminarInstrumento(instrumento_id: number): Promise<void> {
  const t = sello()
  const marcar = { deleted_at: t, updated_at: t }
  await db.transaction('rw',
    [db.instrumentos, db.calificaciones, db.rubricas, db.criterio_instrumentos],
    async () => {
      await db.calificaciones.where('instrumento_id').equals(instrumento_id).modify(marcar)
      await db.rubricas.where('instrumento_id').equals(instrumento_id).modify(marcar)
      await db.criterio_instrumentos.where('instrumento_id').equals(instrumento_id).modify(marcar)
      await db.instrumentos.update(instrumento_id, marcar)
    }
  )
}

// Subir/bajar un instrumento en el orden de su asignatura
export async function moverInstrumento(asignatura_id: number, instrumento_id: number, dir: -1 | 1): Promise<void> {
  const instrs = await getInstrumentos(asignatura_id)
  const idx = instrs.findIndex(i => i.id === instrumento_id)
  const destino = idx + dir
  if (idx < 0 || destino < 0 || destino >= instrs.length) return
  await db.transaction('rw', db.instrumentos, async () => {
    ;[instrs[idx], instrs[destino]] = [instrs[destino], instrs[idx]]
    for (let i = 0; i < instrs.length; i++) {
      if (instrs[i].orden !== i) await db.instrumentos.update(instrs[i].id!, tocado({ orden: i }))
    }
  })
}

// ─── CRITERIO ↔ INSTRUMENTO (el vínculo de la programación) ──────────────────

export async function getCriterioInstrumentos(unidad_id: number): Promise<CriterioInstrumento[]> {
  return vivos(await db.criterio_instrumentos.where('unidad_id').equals(unidad_id).toArray())
}

/** Mapa criterio → instrumentos asignados, para una unidad. */
export async function getMapaCriterioInstrumento(
  unidad_id: number
): Promise<Map<string, { instrumento_id: number; peso: number }[]>> {
  const filas = await getCriterioInstrumentos(unidad_id)
  const mapa = new Map<string, { instrumento_id: number; peso: number }[]>()
  for (const f of filas) {
    const lista = mapa.get(f.criterio_id) || []
    lista.push({ instrumento_id: f.instrumento_id, peso: f.peso })
    mapa.set(f.criterio_id, lista)
  }
  return mapa
}

/**
 * Mapa criterio → instrumentos de TODA la asignatura (unión de sus unidades).
 * Lo usa el calificador cuando se muestran todos los criterios sin filtrar
 * por unidad.
 */
export async function getMapaCriterioInstrumentoAsignatura(
  asignatura_id: number
): Promise<Map<string, { instrumento_id: number; peso: number; unidad_id: number }[]>> {
  const unidades = await db.unidades.where('asignatura_id').equals(asignatura_id).toArray()
  const ids = vivos(unidades).map(u => u.id!)
  const mapa = new Map<string, { instrumento_id: number; peso: number; unidad_id: number }[]>()
  if (!ids.length) return mapa

  const filas = vivos(await db.criterio_instrumentos.where('unidad_id').anyOf(ids).toArray())
  for (const f of filas) {
    const lista = mapa.get(f.criterio_id) || []
    // Evitar duplicar el mismo instrumento si aparece en varias unidades
    if (!lista.some(x => x.instrumento_id === f.instrumento_id)) {
      lista.push({ instrumento_id: f.instrumento_id, peso: f.peso, unidad_id: f.unidad_id })
    }
    mapa.set(f.criterio_id, lista)
  }
  return mapa
}

export async function asignarInstrumentoACriterio(
  unidad_id: number, criterio_id: string, instrumento_id: number, peso = 1.0
): Promise<void> {
  const existente = await db.criterio_instrumentos
    .where('[unidad_id+criterio_id+instrumento_id]')
    .equals([unidad_id, criterio_id, instrumento_id]).first()

  if (existente?.id != null) {
    // Puede estar borrado lógicamente de una asignación anterior: revivirlo
    await db.criterio_instrumentos.update(existente.id, tocado({ peso, deleted_at: null }))
  } else {
    await db.criterio_instrumentos.add(nuevo({ unidad_id, criterio_id, instrumento_id, peso }))
  }
}

export async function quitarInstrumentoDeCriterio(
  unidad_id: number, criterio_id: string, instrumento_id: number
): Promise<void> {
  await db.criterio_instrumentos
    .where('[unidad_id+criterio_id+instrumento_id]')
    .equals([unidad_id, criterio_id, instrumento_id])
    .modify({ deleted_at: sello(), updated_at: sello() })
}

/**
 * Deja EXACTAMENTE estos instrumentos asignados al criterio.
 * No borra las calificaciones ya registradas con un instrumento que se
 * retira: la nota sigue en la base y se muestra como «histórica». Es la
 * garantía de «modificar la programación sin perder datos».
 */
export async function fijarInstrumentosDeCriterio(
  unidad_id: number, criterio_id: string, instrumento_ids: number[]
): Promise<void> {
  const actuales = await db.criterio_instrumentos
    .where('[unidad_id+criterio_id]').equals([unidad_id, criterio_id]).toArray()

  for (const fila of actuales) {
    const debeEstar = instrumento_ids.includes(fila.instrumento_id)
    const esta = !fila.deleted_at
    if (debeEstar && !esta) await db.criterio_instrumentos.update(fila.id!, tocado({ deleted_at: null }))
    if (!debeEstar && esta) await db.criterio_instrumentos.update(fila.id!, tocado({ deleted_at: sello() }))
  }

  const conocidos = new Set(actuales.map(f => f.instrumento_id))
  for (const iid of instrumento_ids) {
    if (!conocidos.has(iid)) {
      await db.criterio_instrumentos.add(nuevo({ unidad_id, criterio_id, instrumento_id: iid, peso: 1.0 }))
    }
  }
}

/** Asigna un instrumento a todos los criterios de una unidad de un golpe. */
export async function asignarInstrumentoAUnidad(
  unidad_id: number, instrumento_id: number
): Promise<number> {
  const criterios = vivos(await db.unidad_criterios.where('unidad_id').equals(unidad_id).toArray())
  for (const c of criterios) {
    await asignarInstrumentoACriterio(unidad_id, c.criterio_id, instrumento_id)
  }
  return criterios.length
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
  const asig = await getAsignatura(asignatura_id)
  if (!asig) return null
  const grupo = await getGrupo(asig.grupo_id)
  if (!grupo) return null

  const alumnos = await getAlumnosByGrupo(asig.grupo_id)
  const instrumentos = await getInstrumentos(asignatura_id)

  const instrIds = instrumentos.map(i => i.id!)
  const cals = instrIds.length
    ? vivos(await db.calificaciones.where('instrumento_id').anyOf(instrIds)
        .filter(c => c.trimestre === trimestre).toArray())
    : []

  const calificaciones: Record<string, Calificacion> = {}
  for (const c of cals) {
    calificaciones[`${c.alumno_id}:${c.criterio_id}:${c.instrumento_id}:${c.trimestre}`] = c
  }

  return { alumnos, instrumentos, calificaciones, asig, grupo }
}

// Nota actual de un alumno en un criterio/instrumento/trimestre concretos
export async function getCalificacionUnica(
  alumno_id: number, instrumento_id: number, criterio_id: string, trimestre: number
): Promise<Calificacion | undefined> {
  const c = await db.calificaciones
    .where('[alumno_id+instrumento_id+criterio_id+trimestre]')
    .equals([alumno_id, instrumento_id, criterio_id, trimestre])
    .first()
  return c && !c.deleted_at ? c : undefined
}

export async function saveCalificaciones(items: CalItem[]): Promise<void> {
  await db.transaction('rw', db.calificaciones, async () => {
    for (const item of items) {
      const existing = await db.calificaciones
        .where('[alumno_id+instrumento_id+criterio_id+trimestre]')
        .equals([item.alumno_id, item.instrumento_id, item.criterio_id, item.trimestre])
        .first()
      if (existing?.id != null) {
        await db.calificaciones.update(existing.id, tocado({
          valor: item.valor,
          observacion: item.observacion ?? existing.observacion ?? null,
          unidad_id: item.unidad_id ?? existing.unidad_id ?? null,
          fecha: now(),
          deleted_at: null,
        }))
      } else {
        await db.calificaciones.add(nuevo({ ...item, fecha: now() }))
      }
    }
  })
}

/** Todas las notas de un alumno en una asignatura (para su ficha y los informes). */
export async function getCalificacionesAlumnoAsignatura(
  alumno_id: number, asignatura_id: number
): Promise<Calificacion[]> {
  const instrIds = (await getInstrumentos(asignatura_id)).map(i => i.id!)
  if (!instrIds.length) return []
  return vivos(await db.calificaciones.where('instrumento_id').anyOf(instrIds)
    .filter(c => c.alumno_id === alumno_id).toArray())
}

// Media por criterio y trimestre de una asignatura (para las gráficas de seguimiento)
export async function getResumenPorCriterio(asignatura_id: number): Promise<
  { criterio_id: string; trimestre: number; media: number }[]
> {
  const instrIds = (await getInstrumentos(asignatura_id)).map(i => i.id!)
  if (!instrIds.length) return []

  const cals = vivos(await db.calificaciones.where('instrumento_id').anyOf(instrIds)
    .filter(c => c.valor != null).toArray())

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
  const asigs = await getAsignaturas(grupo_id)
  const instrIds: number[] = []
  const asigDetalle: AsignaturaDetalle[] = []

  for (const a of asigs) {
    const instrumentos = await getInstrumentos(a.id!)
    instrIds.push(...instrumentos.map(i => i.id!))
    asigDetalle.push({ ...a, instrumentos })
  }

  const calificaciones = instrIds.length
    ? vivos(await db.calificaciones.where('instrumento_id').anyOf(instrIds).toArray())
    : []

  const alumnos = await getAlumnosByGrupo(grupo_id)
  return { asignaturas: asigDetalle, alumnos, calificaciones }
}

// ─── SESIONES Y ASISTENCIA ────────────────────────────────────────────────────

export async function getSesiones(grupo_id: number): Promise<Sesion[]> {
  const sesiones = vivos(await db.sesiones.where('grupo_id').equals(grupo_id).toArray())
  sesiones.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return sesiones
}

export async function crearSesion(data: Omit<Sesion, 'id' | 'created_at'>): Promise<number> {
  const reg = nuevo({ ...data, created_at: now() })
  await db.sesiones.add(reg)
  return reg.id
}

// Edición del diario de sesión (notas, tipo, fecha)
export async function actualizarSesion(id: number, data: Partial<Sesion>): Promise<void> {
  await db.sesiones.update(id, tocado(data))
}

export async function eliminarSesion(id: number): Promise<void> {
  const t = sello()
  await db.asistencia.where('sesion_id').equals(id).modify({ deleted_at: t, updated_at: t })
  await db.sesiones.update(id, { deleted_at: t, updated_at: t })
}

export async function getAsistencia(sesion_id: number): Promise<AsistenciaRec[]> {
  return vivos(await db.asistencia.where('sesion_id').equals(sesion_id).toArray())
}

/**
 * Guarda el pase de lista.
 *
 * `estado: null` significa «sin registrar», que no es lo mismo que presente:
 * antes, al guardar, todo alumno que el docente no hubiera tocado se
 * persistía como `presente` aunque en pantalla figurase con `?`. Un parte de
 * faltas no puede inventarse asistencias.
 */
export async function saveAsistencia(
  sesion_id: number,
  registros: { alumno_id: number; estado: string | null }[]
): Promise<void> {
  await db.transaction('rw', db.asistencia, async () => {
    for (const r of registros) {
      const existing = await db.asistencia
        .where('[sesion_id+alumno_id]').equals([sesion_id, r.alumno_id]).first()

      if (r.estado == null) {
        // Sin registrar: si había algo anotado, se retira con borrado lógico
        // para que la retirada también viaje en la sincronización.
        if (existing?.id != null && !existing.deleted_at) {
          await db.asistencia.update(existing.id, tocado({ deleted_at: sello() }))
        }
        continue
      }

      if (existing?.id != null) {
        await db.asistencia.update(existing.id, tocado({ estado: r.estado, deleted_at: null }))
      } else {
        await db.asistencia.add(nuevo({ sesion_id, alumno_id: r.alumno_id, estado: r.estado }))
      }
    }
  })
}

/**
 * Resumen de faltas por alumno de un grupo — alimenta informes y ficha.
 *
 * @param trimestre si se indica, solo cuenta las sesiones de ese trimestre.
 *   Sin esto el boletín del 1er trimestre imprimía las faltas de todo el
 *   curso junto a notas que sí eran trimestrales.
 */
export async function getResumenAsistencia(
  grupo_id: number,
  trimestre: number | null = null
): Promise<Map<number, Record<string, number>>> {
  const todas = await getSesiones(grupo_id)
  const sesiones = trimestre
    ? todas.filter(s => s.fecha && trimestreDeFecha(s.fecha) === trimestre)
    : todas
  const ids = sesiones.map(s => s.id!)
  const resumen = new Map<number, Record<string, number>>()
  if (!ids.length) return resumen

  const regs = vivos(await db.asistencia.where('sesion_id').anyOf(ids).toArray())
  for (const r of regs) {
    const fila = resumen.get(r.alumno_id) || {}
    fila[r.estado] = (fila[r.estado] || 0) + 1
    resumen.set(r.alumno_id, fila)
  }
  return resumen
}

// ─── UNIDADES (programación didáctica) ───────────────────────────────────────

export async function getUnidades(
  asignatura_id: number,
  criteriosCurr: { id: string; descripcion: string }[] = []
): Promise<UnidadConCriterios[]> {
  const unidades = vivos(await db.unidades.where('asignatura_id').equals(asignatura_id).toArray())
  unidades.sort((a, b) => (a.trimestre ?? 9) - (b.trimestre ?? 9) || a.orden - b.orden || a.id! - b.id!)

  const descMap = new Map(criteriosCurr.map(c => [c.id, c.descripcion]))

  return Promise.all(unidades.map(async u => {
    const ucs = vivos(await db.unidad_criterios.where('unidad_id').equals(u.id!).toArray())
    const mapaInstr = await getMapaCriterioInstrumento(u.id!)
    return {
      ...u,
      criterios: ucs.map(uc => ({
        criterio_id: uc.criterio_id,
        peso: uc.peso,
        descripcion: descMap.get(uc.criterio_id) ?? null,
        instrumentos: mapaInstr.get(uc.criterio_id) ?? [],
      })),
    }
  }))
}

export async function crearUnidad(data: Omit<Unidad, 'id' | 'created_at'>): Promise<number> {
  const orden = data.orden ?? vivos(await db.unidades.where('asignatura_id').equals(data.asignatura_id).toArray()).length
  const reg = nuevo({ ...data, orden, created_at: now() })
  await db.unidades.add(reg)
  return reg.id
}

export async function actualizarUnidad(id: number, data: Partial<Unidad>): Promise<void> {
  await db.unidades.update(id, tocado(data))
}

export async function eliminarUnidad(id: number): Promise<void> {
  const t = sello()
  const marcar = { deleted_at: t, updated_at: t }
  await db.unidad_criterios.where('unidad_id').equals(id).modify(marcar)
  await db.criterio_instrumentos.where('unidad_id').equals(id).modify(marcar)
  await db.unidades.update(id, marcar)
}

export async function vincularCriterio(
  unidad_id: number, criterio_id: string, peso = 1.0
): Promise<void> {
  const existing = await db.unidad_criterios
    .where('[unidad_id+criterio_id]').equals([unidad_id, criterio_id]).first()
  if (existing?.id != null) {
    await db.unidad_criterios.update(existing.id, tocado({ peso, deleted_at: null }))
  } else {
    await db.unidad_criterios.add(nuevo({ unidad_id, criterio_id, peso }))
  }
}

export async function desvincularCriterio(unidad_id: number, criterio_id: string): Promise<void> {
  const t = sello()
  await db.unidad_criterios
    .where('[unidad_id+criterio_id]').equals([unidad_id, criterio_id])
    .modify({ deleted_at: t, updated_at: t })
  // Sus vínculos con instrumentos dejan de tener sentido
  await db.criterio_instrumentos
    .where('[unidad_id+criterio_id]').equals([unidad_id, criterio_id])
    .modify({ deleted_at: t, updated_at: t })
}

/**
 * Genera la estructura de unidades repartiendo los criterios del currículo.
 *
 * NO destructiva: si ya hay unidades, las conserva y solo añade las que
 * falten hasta llegar a `n`, repartiendo entre ellas únicamente los
 * criterios que aún no estuvieran asignados a ninguna. Las calificaciones
 * y los vínculos criterio↔instrumento existentes quedan intactos.
 */
export async function generarPlantillaUnidades(
  asignatura_id: number,
  n: number,
  tipo: string,
  criteriosCurr: { id: string }[]
): Promise<{ creadas: number; conservadas: number; criteriosRepartidos: number }> {
  const existentes = vivos(await db.unidades.where('asignatura_id').equals(asignatura_id).toArray())
  existentes.sort((a, b) => a.orden - b.orden || a.id! - b.id!)

  // Criterios que ya cuelgan de alguna unidad: no se tocan
  const yaAsignados = new Set<string>()
  for (const u of existentes) {
    const ucs = vivos(await db.unidad_criterios.where('unidad_id').equals(u.id!).toArray())
    ucs.forEach(uc => yaAsignados.add(uc.criterio_id))
  }
  const pendientes = criteriosCurr.filter(c => !yaAsignados.has(c.id))

  const nReal = Math.max(existentes.length, Math.min(n, 12))
  const aCrear = nReal - existentes.length
  const trimestreSize = Math.ceil(nReal / 3)
  const tipoLabel: Record<string, string> = {
    unidad: 'UD', situacion: 'SA', proyecto: 'Proyecto', secuencia: 'Sec.', bloque: 'Bloque',
  }
  const label = tipoLabel[tipo] || 'UD'

  const todas = [...existentes]
  for (let i = existentes.length; i < nReal; i++) {
    const trimestre = Math.min(Math.floor(i / trimestreSize) + 1, 3)
    const reg = nuevo({
      asignatura_id, nombre: `${label} ${i + 1}`, tipo,
      trimestre, orden: i, activa: 1, created_at: now(),
    })
    await db.unidades.add(reg)
    todas.push(reg as unknown as Unidad)
  }

  // Repartir solo los criterios huérfanos entre las unidades que no tienen ninguno,
  // y si todas tienen, entre todas por igual
  const sinCriterios: Unidad[] = []
  for (const u of todas) {
    const cuantos = vivos(await db.unidad_criterios.where('unidad_id').equals(u.id!).toArray()).length
    if (cuantos === 0) sinCriterios.push(u)
  }
  const destino = sinCriterios.length ? sinCriterios : todas

  if (pendientes.length && destino.length) {
    const porUnidad = Math.ceil(pendientes.length / destino.length)
    for (let i = 0; i < destino.length; i++) {
      const bloque = pendientes.slice(i * porUnidad, (i + 1) * porUnidad)
      for (const c of bloque) {
        await db.unidad_criterios.add(nuevo({ unidad_id: destino[i].id!, criterio_id: c.id, peso: 1.0 }))
      }
    }
  }

  return { creadas: aCrear, conservadas: existentes.length, criteriosRepartidos: pendientes.length }
}

/** Borra toda la programación de una asignatura (acción explícita del docente). */
export async function borrarProgramacion(asignatura_id: number): Promise<void> {
  const t = sello()
  const marcar = { deleted_at: t, updated_at: t }
  const unis = vivos(await db.unidades.where('asignatura_id').equals(asignatura_id).toArray())
  for (const u of unis) {
    await db.unidad_criterios.where('unidad_id').equals(u.id!).modify(marcar)
    await db.criterio_instrumentos.where('unidad_id').equals(u.id!).modify(marcar)
  }
  await db.unidades.where('asignatura_id').equals(asignatura_id).modify(marcar)
}

// ─── RÚBRICAS ─────────────────────────────────────────────────────────────────

export async function getRubrica(instrumento_id: number): Promise<Rubrica | null> {
  const r = await db.rubricas.where('instrumento_id').equals(instrumento_id).first()
  return r && !r.deleted_at ? r : null
}

export async function guardarRubrica(data: Omit<Rubrica, 'id' | 'created_at'> & { id?: number }): Promise<number> {
  const existing = await db.rubricas.where('instrumento_id').equals(data.instrumento_id).first()
  if (existing?.id != null) {
    await db.rubricas.update(existing.id, tocado({ ...data, deleted_at: null, created_at: now() }))
    return existing.id
  }
  const reg = nuevo({ ...data, created_at: now() })
  await db.rubricas.add(reg)
  return reg.id
}

export async function eliminarRubrica(instrumento_id: number): Promise<void> {
  const t = sello()
  await db.rubricas.where('instrumento_id').equals(instrumento_id)
    .modify({ deleted_at: t, updated_at: t })
}

// ─── EVIDENCIAS ───────────────────────────────────────────────────────────────

// Los topes viven en db/limites.ts, derivados del que manda de verdad: el
// que aplica el servidor por registro. Se reexportan porque las pantallas ya
// los importaban desde aquí.
export { LIMITE_EVIDENCIA_SINC, LIMITE_EVIDENCIA }

export type AvisoEvidencia = { nivel: 'ok' | 'aviso' | 'error'; texto: string }

export function revisarTamano(blob: Blob): AvisoEvidencia {
  const mb = enMB(blob.size)
  if (blob.size > LIMITE_EVIDENCIA) {
    return {
      nivel: 'error',
      texto: `Son ${mb} MB y el máximo son ${enMB(LIMITE_EVIDENCIA)} MB. Graba un fragmento más corto.`,
    }
  }
  if (blob.size > LIMITE_EVIDENCIA_SINC) {
    return {
      nivel: 'aviso',
      texto: `Son ${mb} MB: se guarda en este dispositivo, pero no se sincronizará con los demás (máximo ${enMB(LIMITE_EVIDENCIA_SINC)} MB).`,
    }
  }
  return { nivel: 'ok', texto: `${mb} MB` }
}

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
  const reg = nuevo({ ...data, fecha: now() })
  await db.evidencias.add(reg)
  return reg.id
}

export async function getEvidenciasAlumno(alumno_id: number): Promise<Evidencia[]> {
  const evs = vivos(await db.evidencias.where('alumno_id').equals(alumno_id).toArray())
  evs.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return evs
}

export async function contarEvidenciasAlumno(alumno_id: number): Promise<number> {
  return (await getEvidenciasAlumno(alumno_id)).length
}

/** Recuento por tipo, para las etiquetas de la galería. */
export async function contarEvidenciasPorTipo(alumno_id: number): Promise<Record<string, number>> {
  const evs = await getEvidenciasAlumno(alumno_id)
  const r: Record<string, number> = { foto: 0, audio: 0, video: 0 }
  for (const ev of evs) r[ev.tipo] = (r[ev.tipo] ?? 0) + 1
  return r
}

/** Nº de evidencias por criterio de un alumno — lo pinta la matriz del calificador. */
export async function getEvidenciasPorCriterio(alumno_ids: number[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (!alumno_ids.length) return mapa
  const evs = vivos(await db.evidencias.where('alumno_id').anyOf(alumno_ids).toArray())
  for (const ev of evs) {
    if (!ev.criterio_id) continue
    const k = `${ev.alumno_id}:${ev.criterio_id}`
    mapa.set(k, (mapa.get(k) || 0) + 1)
  }
  return mapa
}

export async function eliminarEvidencia(id: number): Promise<void> {
  const t = sello()
  await db.evidencias.update(id, { deleted_at: t, updated_at: t })
}

export async function actualizarEvidencia(
  id: number,
  data: Partial<Pick<Evidencia, 'descripcion' | 'criterio_id' | 'trimestre' | 'instrumento_id' | 'unidad_id'>>
): Promise<void> {
  await db.evidencias.update(id, tocado(data))
}

// ─── PLANO DE CLASE ───────────────────────────────────────────────────────────

export type PlanoDetalle = {
  plano: Plano
  asientos: Asiento[]
}

const PLANO_DEFAULT = { filas: 5, cols: 6 }

export async function getPlano(grupo_id: number): Promise<PlanoDetalle> {
  let plano = vivos(await db.planos.where('grupo_id').equals(grupo_id).toArray())[0]
  if (!plano) {
    const reg = nuevo({ grupo_id, ...PLANO_DEFAULT })
    await db.planos.add(reg)
    plano = reg as unknown as Plano
  }
  const asientos = vivos(await db.asientos.where('grupo_id').equals(grupo_id).toArray())
  return { plano, asientos }
}

export async function redimensionarPlano(grupo_id: number, filas: number, cols: number): Promise<void> {
  const plano = vivos(await db.planos.where('grupo_id').equals(grupo_id).toArray())[0]
  if (plano?.id != null) await db.planos.update(plano.id, tocado({ filas, cols }))
  // Quitar asientos que queden fuera de la nueva cuadrícula
  const t = sello()
  await db.asientos.where('grupo_id').equals(grupo_id)
    .filter(a => a.fila >= filas || a.col >= cols)
    .modify({ deleted_at: t, updated_at: t })
}

export async function asignarAsiento(grupo_id: number, alumno_id: number, fila: number, col: number): Promise<void> {
  const t = sello()
  await db.transaction('rw', db.asientos, async () => {
    // Un alumno solo puede ocupar un asiento, y un asiento un alumno
    await db.asientos.where('[grupo_id+alumno_id]').equals([grupo_id, alumno_id])
      .modify({ deleted_at: t, updated_at: t })
    await db.asientos.where('[grupo_id+fila+col]').equals([grupo_id, fila, col])
      .modify({ deleted_at: t, updated_at: t })
    await db.asientos.add(nuevo({ grupo_id, alumno_id, fila, col }))
  })
}

export async function quitarAsiento(grupo_id: number, alumno_id: number): Promise<void> {
  const t = sello()
  await db.asientos.where('[grupo_id+alumno_id]').equals([grupo_id, alumno_id])
    .modify({ deleted_at: t, updated_at: t })
}

// ─── MATRIZ DE EVALUACIÓN ─────────────────────────────────────────────────────

export type CeldaInstrumento = {
  instrumento_id: number
  nombre: string
  tipo: string
  peso: number
  tiene_rubrica: boolean
}

export type MatrizEvaluacion = {
  grupo: Grupo
  asig: Asignatura
  alumnos: Alumno[]
  instrumentos: Instrumento[]
  /** criterio_id → instrumentos que lo evalúan según la programación */
  porCriterio: Map<string, CeldaInstrumento[]>
  /**
   * Criterios que sí tienen instrumento asignado, pero ninguno de ellos se
   * usa en el trimestre que se está viendo. Se distinguen de los que no
   * tienen instrumento ninguno: el docente no tiene que arreglar la
   * programación, solo está en el trimestre equivocado.
   */
  criteriosFueraDeTrimestre: Set<string>
  /** `alumno:criterio:instrumento:trimestre` → calificación */
  calificaciones: Record<string, Calificacion>
  /** `alumno:criterio` → nº de evidencias */
  evidencias: Map<string, number>
  /** Criterios de la unidad activa (vacío = todos los de la asignatura) */
  criteriosDeUnidad: Set<string> | null
}

/**
 * Todo lo que el calificador necesita para pintar la matriz alumno × criterio
 * sabiendo, en cada celda, con qué instrumento toca evaluar.
 *
 * `unidad_id` a null significa «toda la asignatura»: entonces el mapa de
 * instrumentos es la unión de los de todas sus unidades.
 */
export async function getMatrizEvaluacion(
  asignatura_id: number,
  unidad_id: number | null,
  trimestre: number
): Promise<MatrizEvaluacion | null> {
  const asig = await getAsignatura(asignatura_id)
  if (!asig) return null
  const grupo = await getGrupo(asig.grupo_id)
  if (!grupo) return null

  const [alumnos, instrumentos] = await Promise.all([
    getAlumnosByGrupo(asig.grupo_id),
    getInstrumentos(asignatura_id),
  ])
  const instrById = new Map(instrumentos.map(i => [i.id!, i]))

  // Qué instrumentos tienen rúbrica (para pintar el icono en la celda)
  const conRubrica = new Set(
    vivos(await db.rubricas.where('instrumento_id').anyOf(instrumentos.map(i => i.id!)).toArray())
      .map(r => r.instrumento_id)
  )

  const crudo = unidad_id
    ? await getMapaCriterioInstrumento(unidad_id)
    : await getMapaCriterioInstrumentoAsignatura(asignatura_id)

  const porCriterio = new Map<string, CeldaInstrumento[]>()
  const criteriosFueraDeTrimestre = new Set<string>()
  for (const [criterio, lista] of crudo) {
    const celdas: CeldaInstrumento[] = []
    let habiaAlguno = false
    for (const item of lista) {
      const ins = instrById.get(item.instrumento_id)
      if (!ins) continue   // instrumento borrado: se ignora, la nota histórica se conserva
      habiaAlguno = true
      // El trimestre configurado en el instrumento por fin sirve para algo:
      // hasta ahora se podía marcar «solo 1er trimestre» y el instrumento
      // seguía apareciendo —y puntuando— en los tres.
      if (!aplicaEnTrimestre(ins.trimestres, trimestre)) continue
      celdas.push({
        instrumento_id: ins.id!,
        nombre: ins.nombre,
        tipo: ins.tipo,
        peso: ins.peso,
        tiene_rubrica: conRubrica.has(ins.id!),
      })
    }
    if (celdas.length) porCriterio.set(criterio, celdas)
    else if (habiaAlguno) criteriosFueraDeTrimestre.add(criterio)
  }

  const instrIds = instrumentos.map(i => i.id!)
  const cals = instrIds.length
    ? vivos(await db.calificaciones.where('instrumento_id').anyOf(instrIds)
        .filter(c => c.trimestre === trimestre).toArray())
    : []
  const calificaciones: Record<string, Calificacion> = {}
  for (const c of cals) {
    calificaciones[`${c.alumno_id}:${c.criterio_id}:${c.instrumento_id}:${c.trimestre}`] = c
  }

  const evidencias = await getEvidenciasPorCriterio(alumnos.map(a => a.id!))

  let criteriosDeUnidad: Set<string> | null = null
  if (unidad_id) {
    const ucs = vivos(await db.unidad_criterios.where('unidad_id').equals(unidad_id).toArray())
    criteriosDeUnidad = new Set(ucs.map(uc => uc.criterio_id))
  }

  return {
    grupo, asig, alumnos, instrumentos, porCriterio,
    criteriosFueraDeTrimestre, calificaciones, evidencias, criteriosDeUnidad,
  }
}

// ─── ESTADO DE CONFIGURACIÓN (asistente de primeros pasos) ────────────────────

export type PasoEstado = {
  grupos: number
  alumnos: number
  asignaturas: number
  unidades: number
  criteriosVinculados: number
  criteriosConInstrumento: number
  instrumentos: number
  calificaciones: number
  /** Primer grupo, para enlazar los botones del asistente */
  grupoPrincipalId: number | null
  asignaturaPrincipalId: number | null
}

export async function getEstadoConfiguracion(): Promise<PasoEstado> {
  const grupos = vivos(await db.grupos.toArray())
  const grupoPrincipalId = grupos[0]?.id ?? null

  const asignaturas = vivos(await db.asignaturas.toArray())
  const asigDeGrupo = grupoPrincipalId
    ? asignaturas.filter(a => a.grupo_id === grupoPrincipalId)
    : asignaturas

  const alumnos = grupoPrincipalId ? (await getAlumnosByGrupo(grupoPrincipalId)).length : 0
  const unidades = vivos(await db.unidades.toArray())
  const ucs = vivos(await db.unidad_criterios.toArray())
  const cis = vivos(await db.criterio_instrumentos.toArray())
  const instrumentos = vivos(await db.instrumentos.toArray())
  const calificaciones = vivos(await db.calificaciones.toArray()).filter(c => c.valor != null)

  return {
    grupos: grupos.length,
    alumnos,
    asignaturas: asigDeGrupo.length,
    unidades: unidades.length,
    criteriosVinculados: ucs.length,
    criteriosConInstrumento: new Set(cis.map(c => `${c.unidad_id}:${c.criterio_id}`)).size,
    instrumentos: instrumentos.length,
    calificaciones: calificaciones.length,
    grupoPrincipalId,
    asignaturaPrincipalId: asigDeGrupo[0]?.id ?? null,
  }
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
         calificaciones, sesiones, asistencia, unidades, unidad_criterios,
         criterio_instrumentos, rubricas, evidencias, planos, asientos] = await Promise.all([
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
    db.criterio_instrumentos.toArray(),
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
    version: 4,
    exported_at: now(),
    grupos, alumnos, grupo_alumnos, asignaturas, instrumentos,
    calificaciones, sesiones, asistencia, unidades, unidad_criterios,
    criterio_instrumentos, rubricas,
    evidencias: evidenciasSerial, planos, asientos,
  }, null, 2)
}

export async function importarDatos(json: string): Promise<void> {
  const data = JSON.parse(json)
  if (![1, 2, 3, 4].includes(data.version)) throw new Error('Versión de backup no compatible')

  // Reconstruir blobs fuera de la transacción (FileReader no puede vivir dentro)
  const evidencias: Evidencia[] = (data.evidencias || []).map((ev: any) => {
    const { blob_b64, ...rest } = ev
    return { ...rest, blob: base64ABlob(blob_b64, ev.mime || 'image/jpeg') }
  })

  // Los backups anteriores a la v4 no traen sellos de sincronización
  const sellar = <T extends object>(arr: T[]): T[] => arr.map((r: any) => ({
    ...r,
    updated_at: r.updated_at || r.created_at || now(),
    deleted_at: r.deleted_at ?? null,
  }))

  await db.transaction('rw',
    [db.grupos, db.alumnos, db.grupo_alumnos, db.asignaturas, db.instrumentos,
     db.calificaciones, db.sesiones, db.asistencia, db.unidades, db.unidad_criterios,
     db.criterio_instrumentos, db.rubricas, db.evidencias, db.planos, db.asientos,
     // La restauración también toca el estado de sincronización: ver abajo.
     db.sync_base, db.meta],
    async () => {
      await Promise.all([
        db.grupos.clear(), db.alumnos.clear(), db.grupo_alumnos.clear(),
        db.asignaturas.clear(), db.instrumentos.clear(), db.calificaciones.clear(),
        db.sesiones.clear(), db.asistencia.clear(), db.unidades.clear(),
        db.unidad_criterios.clear(), db.criterio_instrumentos.clear(), db.rubricas.clear(),
        db.evidencias.clear(), db.planos.clear(), db.asientos.clear(),
      ])
      await db.grupos.bulkAdd(sellar(data.grupos || []))
      await db.alumnos.bulkAdd(sellar(data.alumnos || []))
      await db.grupo_alumnos.bulkAdd(sellar(data.grupo_alumnos || []))
      await db.asignaturas.bulkAdd(sellar(data.asignaturas || []))
      await db.instrumentos.bulkAdd(sellar(data.instrumentos || []))
      await db.calificaciones.bulkAdd(sellar(data.calificaciones || []))
      await db.sesiones.bulkAdd(sellar(data.sesiones || []))
      await db.asistencia.bulkAdd(sellar(data.asistencia || []))
      await db.unidades.bulkAdd(sellar(data.unidades || []))
      await db.unidad_criterios.bulkAdd(sellar(data.unidad_criterios || []))
      await db.criterio_instrumentos.bulkAdd(sellar(data.criterio_instrumentos || []))
      await db.rubricas.bulkAdd(sellar(data.rubricas || []))
      await db.evidencias.bulkAdd(sellar(evidencias))
      await db.planos.bulkAdd(sellar(data.planos || []))
      await db.asientos.bulkAdd(sellar(data.asientos || []))

      // Los ids siguen existiendo pero su contenido es otro. Si no se
      // reinicia, la base de fusión apunta a versiones que ya no tienen nada
      // que ver y el merge a tres bandas calcula diferencias falsas; y el
      // cursor de envío se queda en el sello anterior, con lo que lo
      // restaurado —más antiguo— no se sube nunca.
      await reiniciarEstadoDeSincronizacion()
    }
  )
}
