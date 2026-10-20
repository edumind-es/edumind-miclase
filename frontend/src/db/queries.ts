import { db, TABLAS_SINC, INSTRUMENTO_BANCO, VERSION_ESQUEMA, type MiClaseDB } from './localDb'
import { asignarUnidades, prepararContexto, unidadParaFila, anotar, resumenVacio, criteriosDeRegistro, type ResumenMigracion } from './migracionUnidades'
import { nuevoId, sello } from './ids'
import { LIMITE_EVIDENCIA, LIMITE_EVIDENCIA_SINC, enMB } from './limites'
import {
  aplicaEnTrimestre, trimestreDeFecha, fundirHijosEnFamilias, fundirUnidades, porcentajesEnFamilia,
  calcularNotaArea, normalizarReglaFinal, pesosCriterioDeUnidades, pesosVinculoDeUnidades, type NotaArea,
} from './calculo'
import { colorDeInstrumento } from '../ia/instrumentosConfig'
import { reiniciarEstadoDeSincronizacion, alAplicarCambios } from './sync'
import { criteriosVinculados } from './vinculos'
import { criteriosDe, derivarNotas, ordenarRegistros, type NotaDerivada, nivelDeNota } from './diario'
import { normalizarPrueba, notaDePrueba, type PruebaDef, type ResultadoPrueba, tieneClave } from './prueba'
import type {
  Grupo, Alumno, Asignatura, Instrumento,
  Calificacion, Sesion, AsistenciaRec, Unidad, Rubrica,
  Evidencia, Plano, Asiento, CriterioInstrumento, Sincronizable, RegistroDiario, Agregacion,
  GrupoAlumno, UnidadCriterio,
} from './localDb'
import { agruparEnBloques, enBloque, diaDeNota, diaDeRegistro, diaDeRubrica, type BloqueDirecto, type FiltroBloque } from './bloquesFamilia'

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export type GrupoConCount = Grupo & { num_alumnos: number }

export type GrupoDetalle = Grupo & { alumnos: Alumno[] }

export type AsignaturaDetalle = Asignatura & { instrumentos: Instrumento[] }

export type UnidadConCriterios = Unidad & {
  criterios: {
    criterio_id: string
    peso: number
    /** Mínimo de consecución declarado en la programación, si lo hay. */
    minimo: string | null
    descripcion: string | null
    instrumentos: VinculoInstrumento[]
  }[]
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
  /** Parte de la clave de la casilla: sin ella no se guarda nada. */
  unidad_id: number
  /**
   * Nivel marcado en cada indicador de la rúbrica. `undefined` significa «no
   * lo toques»: guardar una observación o borrar la nota no debe llevarse por
   * delante la justificación. Para vaciarla se manda `{}` o `null`.
   */
  niveles_rubrica?: Record<string, number> | null
  /** Nota fantasma (ver `Calificacion.valor_anterior`). `undefined` = no tocarla. */
  valor_anterior?: number | null
  anterior_motivo?: string | null
  /**
   * 'diario' si la nota la deriva el diario de evaluación. `undefined` =
   * decidir por la regla de `saveCalificaciones`: otra nota a mano sobre una
   * casilla derivada la vuelve manual; la misma nota la deja como está.
   */
  origen?: 'diario' | null
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString()
}

/** Descarta los registros con borrado lógico. */
function vivos<T extends Sincronizable>(arr: T[]): T[] {
  return arr.filter(r => !r.deleted_at)
}

/**
 * De varias filas con la misma clave (alumno, instrumento, criterio,
 * trimestre), la que cuenta: la de `updated_at` más reciente y, a igualdad,
 * la de menor id. Dos aparatos que califican la misma casilla antes de
 * sincronizar crean dos filas, y cada una llega al otro con su propio id. Si
 * cada lectura eligiera a su manera, el panel editaría una y la matriz
 * pintaría la otra: la nota se guardaba y no se veía. Es la misma regla en
 * los dos aparatos, para que al reconciliar borren la misma.
 */
function masReciente<T extends Sincronizable & { id?: number }>(filas: T[]): T | undefined {
  let mejor: T | undefined
  for (const f of filas) {
    if (!mejor) { mejor = f; continue }
    const a = f.updated_at ?? '', b = mejor.updated_at ?? ''
    if (a > b || (a === b && (f.id ?? Infinity) < (mejor.id ?? Infinity))) mejor = f
  }
  return mejor
}

const claveCelda = (c: Pick<Calificacion, 'alumno_id' | 'instrumento_id' | 'criterio_id' | 'trimestre' | 'unidad_id'>) =>
  `${c.alumno_id}:${c.instrumento_id}:${c.criterio_id}:${c.trimestre}:${c.unidad_id}`

/** Una calificación por casilla: de las duplicadas se queda la que cuenta. */
function sinDuplicados(cals: Calificacion[]): Calificacion[] {
  const porClave = new Map<string, Calificacion[]>()
  for (const c of cals) {
    const k = claveCelda(c)
    porClave.set(k, [...(porClave.get(k) ?? []), c])
  }
  return [...porClave.values()].map(l => l.length === 1 ? l[0] : masReciente(l)!)
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
  const suyas = vivos(await db.asignaturas.where('grupo_id').equals(id).toArray()).map(a => a.id!)
  if (suyas.length) {
    await conservarRubricasEnBanco(
      vivos(await db.instrumentos.where('asignatura_id').anyOf(suyas).toArray()).map(i => i.id!))
  }
  await db.transaction('rw',
    [db.grupos, db.grupo_alumnos, db.asignaturas, db.instrumentos,
     db.calificaciones, db.diario, db.sesiones, db.asistencia, db.unidades, db.unidad_criterios,
     db.criterio_instrumentos, db.rubricas, db.evidencias, db.planos, db.asientos],
    async () => {
      const marcar = { deleted_at: t, updated_at: t }

      const asigs = await db.asignaturas.where('grupo_id').equals(id).toArray()
      for (const a of asigs) {
        const instrs = await db.instrumentos.where('asignatura_id').equals(a.id!).toArray()
        for (const i of instrs) {
          await db.calificaciones.where('instrumento_id').equals(i.id!).modify(marcar)
          await db.diario.where('instrumento_id').equals(i.id!).modify(marcar)
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
  await conservarRubricasEnBanco(
    vivos(await db.instrumentos.where('asignatura_id').equals(id).toArray()).map(i => i.id!))
  const t = sello()
  const marcar = { deleted_at: t, updated_at: t }
  await db.transaction('rw',
    [db.asignaturas, db.instrumentos, db.calificaciones, db.diario, db.rubricas,
     db.unidades, db.unidad_criterios, db.criterio_instrumentos],
    async () => {
      const instrs = await db.instrumentos.where('asignatura_id').equals(id).toArray()
      for (const i of instrs) {
        await db.calificaciones.where('instrumento_id').equals(i.id!).modify(marcar)
        await db.diario.where('instrumento_id').equals(i.id!).modify(marcar)
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

/** Solo las familias (y los instrumentos sueltos): lo que pesa en el área. */
export async function getFamilias(asignatura_id: number): Promise<Instrumento[]> {
  return (await getInstrumentos(asignatura_id)).filter(i => i.familia_id == null)
}

/** Los hijos de una familia, en su orden. */
export async function getHijos(familia_id: number): Promise<Instrumento[]> {
  // `familia_id` no está indexado: se filtra en memoria dentro del área.
  const familia = await db.instrumentos.get(familia_id)
  if (!familia) return []
  const todos = vivos(await db.instrumentos.where('asignatura_id').equals(familia.asignatura_id).toArray())
    .filter(i => i.familia_id === familia_id)
  todos.sort((a, b) => a.orden - b.orden || a.id! - b.id!)
  return todos
}

/**
 * Da de alta un hijo dentro de una familia. Hereda área y trimestres; su
 * `peso` es relativo dentro de la familia (1 = igual que los demás).
 */
/** Peso medio (entero, mínimo 1) de unos hijos; 1 si no hay ninguno. */
function pesoMedio(hijos: Instrumento[]): number {
  if (hijos.length === 0) return 1
  const suma = hijos.reduce((s, h) => s + (h.peso > 0 ? h.peso : 1), 0)
  return Math.max(1, Math.round(suma / hijos.length))
}

export async function crearInstrumentoHijo(
  familia_id: number,
  data: { nombre: string; tipo: string; peso?: number; agregacion?: Agregacion | null }
): Promise<number> {
  const familia = await db.instrumentos.get(familia_id)
  if (!familia || familia.deleted_at) throw new Error('La familia no existe')
  if (familia.familia_id != null) throw new Error('Un hijo no puede tener hijos: cuélgalo de la familia')
  const hermanos = await getHijos(familia_id)
  const reg = nuevo({
    asignatura_id: familia.asignatura_id, familia_id,
    nombre: data.nombre.trim(), tipo: data.tipo,
    // Sin peso pedido, el medio de sus hermanos: así un cuarto examen entra
    // contando como los otros tres, estén en 1 · 1 · 1 o en 40 · 30 · 30.
    peso: data.peso != null && data.peso > 0 ? data.peso : pesoMedio(hermanos),
    trimestres: familia.trimestres, orden: hermanos.length,
    agregacion: data.agregacion ?? null, created_at: now(),
  })
  await db.instrumentos.add(reg)
  return reg.id
}

export type CriteriosDeFamiliaPorUnidad = {
  unidad_id: number
  nombre: string
  trimestre: number | null
  criterios: string[]
}

/**
 * Qué criterios cubre una familia en cada unidad: el techo de lo que puede
 * evaluar cualquiera de sus hijos. Solo unidades donde cubre alguno.
 */
export async function criteriosDeFamiliaPorUnidad(familia_id: number): Promise<CriteriosDeFamiliaPorUnidad[]> {
  const filas = vivos(await db.criterio_instrumentos.where('instrumento_id').equals(familia_id).toArray())
  if (!filas.length) return []
  const porUnidad = new Map<number, Set<string>>()
  for (const f of filas) (porUnidad.get(f.unidad_id) ?? porUnidad.set(f.unidad_id, new Set()).get(f.unidad_id)!).add(f.criterio_id)
  const unidades = vivos(await db.unidades.where('id').anyOf([...porUnidad.keys()]).toArray())
  unidades.sort((a, b) => (a.trimestre ?? 9) - (b.trimestre ?? 9) || a.orden - b.orden || a.id! - b.id!)
  return unidades.map(u => ({
    unidad_id: u.id!, nombre: u.nombre, trimestre: u.trimestre ?? null,
    criterios: [...porUnidad.get(u.id!)!].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
  }))
}

/** Criterios de un hijo en todas sus unidades: `unidad_id` → criterios. */
export async function criteriosDeHijoPorUnidad(hijo_id: number): Promise<Map<number, string[]>> {
  const filas = vivos(await db.criterio_instrumentos.where('instrumento_id').equals(hijo_id).toArray())
  const m = new Map<number, string[]>()
  for (const f of filas) (m.get(f.unidad_id) ?? m.set(f.unidad_id, []).get(f.unidad_id)!).push(f.criterio_id)
  for (const lista of m.values()) lista.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  return m
}

/** Criterios que un hijo evalúa en una unidad (según la programación). */
export async function criteriosDeHijo(unidad_id: number, hijo_id: number): Promise<string[]> {
  const filas = vivos(await db.criterio_instrumentos.where('instrumento_id').equals(hijo_id).toArray())
  return [...new Set(filas.filter(f => f.unidad_id === unidad_id).map(f => f.criterio_id))].sort()
}

/**
 * Fija qué criterios de la unidad evalúa un hijo. Tienen que ser un
 * subconjunto de los de su familia en esa unidad: la programación dice qué
 * cubre «Táboa de indicadores», y speaking no puede salirse de ahí. Si se
 * intenta, falla nombrando los criterios que sobran.
 */
export async function fijarCriteriosDeHijo(
  unidad_id: number, hijo_id: number, criterios: string[]
): Promise<void> {
  const hijo = await db.instrumentos.get(hijo_id)
  if (!hijo || hijo.deleted_at || hijo.familia_id == null) throw new Error('No es un instrumento hijo')
  const deFamilia = new Set(
    vivos(await db.criterio_instrumentos.where('instrumento_id').equals(hijo.familia_id).toArray())
      .filter(f => f.unidad_id === unidad_id).map(f => f.criterio_id))
  const fuera = criterios.filter(c => !deFamilia.has(c))
  if (fuera.length) {
    throw new Error(`${fuera.join(', ')} no ${fuera.length === 1 ? 'es' : 'son'} de la familia en esta unidad`)
  }
  const pedidos = new Set(criterios)
  const actuales = await db.criterio_instrumentos.where('instrumento_id').equals(hijo_id).toArray()
  const conocidos = new Set<string>()
  for (const fila of actuales) {
    if (fila.unidad_id !== unidad_id) continue
    conocidos.add(fila.criterio_id)
    const debeEstar = pedidos.has(fila.criterio_id)
    const esta = !fila.deleted_at
    if (debeEstar && !esta) await db.criterio_instrumentos.update(fila.id!, tocado({ deleted_at: null }))
    if (!debeEstar && esta) await db.criterio_instrumentos.update(fila.id!, tocado({ deleted_at: sello() }))
  }
  for (const c of pedidos) {
    if (!conocidos.has(c)) await db.criterio_instrumentos.add(nuevo({ unidad_id, criterio_id: c, instrumento_id: hijo_id, peso: 1.0 }))
  }
}

// ─── Convertir lo que ya hay en una familia en su primer hijo ───────────────

/** Lo que una familia tiene anotado directamente, con su propio id. */
export type DatosDirectosDeFamilia = {
  /** Calificaciones vivas con nota (con `valor`), puestas con la familia. */
  calificaciones: number
  /** Registros del diario de evaluación de la familia. */
  diario: number
  /** Exámenes definidos para la familia (general o por unidad). */
  examenes: number
  /** 1 si la familia tiene rúbrica propia. */
  rubricas: number
}

/**
 * Qué hay anotado directamente con una familia: notas, diario, exámenes y
 * rúbrica. Es lo que al meter el primer hijo dejaría de tener columna
 * —seguiría contando, fundido con peso 1— y lo que `convertirFamiliaEnHijo`
 * mueve. Cero en todo = no hay nada que convertir.
 */
export async function datosDirectosDeFamilia(familia_id: number): Promise<DatosDirectosDeFamilia> {
  const [cals, regs, rubs] = await Promise.all([
    db.calificaciones.where('instrumento_id').equals(familia_id).toArray(),
    db.diario.where('instrumento_id').equals(familia_id).toArray(),
    db.rubricas.where('instrumento_id').equals(familia_id).toArray(),
  ])
  const vivas = vivos(rubs)
  return {
    calificaciones: vivos(cals).filter(c => c.valor != null).length,
    diario: vivos(regs).length,
    examenes: vivas.filter(r => r.tipo === 'prueba').length,
    rubricas: vivas.filter(esRubrica).length,
  }
}

export const hayDatosDirectos = (d: DatosDirectosDeFamilia) =>
  d.calificaciones + d.diario + d.examenes + d.rubricas > 0

/** Un bloque con el nombre de su unidad, para enseñarlo. */
export type BloqueDirectoConUnidad = BloqueDirecto & { unidad_nombre: string | null }

/**
 * Lo mismo que `datosDirectosDeFamilia`, pero desglosado por unidad y día de
 * anotación (`db/bloquesFamilia.ts`), para que el gestor deje mover cada
 * bloque al hijo que lo hizo de verdad. Vacío si no hay nada.
 */
export async function bloquesDirectosDeFamilia(familia_id: number): Promise<BloqueDirectoConUnidad[]> {
  const [cals, regs, rubs] = await Promise.all([
    db.calificaciones.where('instrumento_id').equals(familia_id).toArray(),
    db.diario.where('instrumento_id').equals(familia_id).toArray(),
    db.rubricas.where('instrumento_id').equals(familia_id).toArray(),
  ])
  const bloques = agruparEnBloques(cals, regs, rubs)
  const ids = [...new Set(bloques.map(b => b.unidad_id).filter((u): u is number => u != null && u > 0))]
  const unidades = ids.length ? await db.unidades.where('id').anyOf(ids).toArray() : []
  const nombre = new Map(unidades.map(u => [u.id!, u.nombre]))
  return bloques.map(b => ({ ...b, unidad_nombre: b.unidad_id != null ? nombre.get(b.unidad_id) ?? null : null }))
}

/** Lo que se ha movido al hijo nuevo, para decírselo al docente. */
export type ResultadoConversion = {
  hijo_id: number
  calificaciones: number
  diario: number
  rubricas: number
  criterios: number
}

/**
 * Convierte lo que una familia tenía anotado directamente en un hijo propio.
 *
 * Luis calificaba «Proba escrita - express repaso» (80 %) directamente con la
 * familia. Al crear dentro «Prueba escrita - oficial» esperaba dos columnas,
 * pero en cuanto hay un hijo la familia solo resume: el express se quedó sin
 * columna aunque sus notas siguieran contando (fundidas con peso 1). Esto
 * crea un hijo con el nombre, tipo, agregación y color de la familia y le
 * pasa todo lo que apuntaba a ella:
 *
 *  - `calificaciones` y `diario`: cambian de `instrumento_id` en la misma
 *    fila, con `updated_at` nuevo para que viajen en el siguiente sync. No se
 *    duplican: la casilla del hijo es la misma casilla que tenía la familia.
 *  - `rubricas` (la rúbrica y los exámenes, nunca el banco): igual.
 *  - `criterio_instrumentos`: se COPIAN, no se mueven. La familia sigue
 *    siendo lo que la programación asigna a cada criterio y el techo de sus
 *    hijos (`fijarCriteriosDeHijo` lo exige), así que conserva sus filas y
 *    el hijo recibe las suyas, con el mismo reparto (`peso_criterio`) y
 *    vínculo.
 *
 * Opcionalmente renombra la familia (al nombre genérico de lo que trae
 * PROENS: «Proba escrita», «Táboa de indicadores»). Nunca se llama sola:
 * siempre tras la confirmación expresa del docente.
 */
export async function convertirFamiliaEnHijo(
  familia_id: number,
  opciones: { nombre_hijo?: string; nombre_familia?: string | null; bloque?: FiltroBloque } = {}
): Promise<ResultadoConversion> {
  const familia = await db.instrumentos.get(familia_id)
  if (!familia || familia.deleted_at) throw new Error('La familia no existe')
  if (familia.familia_id != null) throw new Error('Solo se convierte una familia, no un hijo')

  const nombreHijo = (opciones.nombre_hijo ?? familia.nombre).trim() || familia.nombre
  const nombreFamilia = opciones.nombre_familia?.trim() || null

  return db.transaction('rw',
    [db.instrumentos, db.calificaciones, db.diario, db.rubricas, db.criterio_instrumentos],
    async () => {
      const hijo_id = await crearInstrumentoHijo(familia_id, {
        nombre: nombreHijo, tipo: familia.tipo, agregacion: familia.agregacion ?? null,
      })
      if (familia.color) await db.instrumentos.update(hijo_id, tocado({ color: familia.color }))

      // Con `bloque` solo se lleva lo de esa unidad y ese día (el gestor, con
      // hijos ya dentro, mueve bloque a bloque); sin él, todo.
      const alHijo = tocado({ instrumento_id: hijo_id })
      const vivo = (r: { deleted_at?: string | null }) => !r.deleted_at
      const { bloque } = opciones
      const calificaciones = await db.calificaciones.where('instrumento_id').equals(familia_id)
        .filter(c => vivo(c) && enBloque(bloque, c.unidad_id, diaDeNota(c))).modify(alHijo)
      const diario = await db.diario.where('instrumento_id').equals(familia_id)
        .filter(r => vivo(r) && enBloque(bloque, r.unidad_id, diaDeRegistro(r))).modify(alHijo)
      const rubricas = await db.rubricas.where('instrumento_id').equals(familia_id)
        .filter(r => vivo(r) && enBloque(bloque, r.unidad_id, diaDeRubrica(r))).modify(alHijo)

      // Las filas de la programación se copian: la familia sigue siendo el
      // techo de lo que puede evaluar cualquiera de sus hijos.
      const filas = vivos(await db.criterio_instrumentos.where('instrumento_id').equals(familia_id).toArray())
      for (const f of filas) {
        await db.criterio_instrumentos.add(nuevo({
          unidad_id: f.unidad_id, criterio_id: f.criterio_id, instrumento_id: hijo_id, peso: 1.0,
          peso_criterio: f.peso_criterio ?? null, vinculado: f.vinculado ?? null,
        }))
      }

      if (nombreFamilia && nombreFamilia !== familia.nombre) {
        await db.instrumentos.update(familia_id, tocado({ nombre: nombreFamilia }))
      }
      return { hijo_id, calificaciones, diario, rubricas, criterios: filas.length }
    })
}

/** Lo que impediría mover sin pisar nada: el hijo ya tiene su propio examen o rúbrica. */
export type ConflictosMovimiento = {
  /** Exámenes de la familia para los que el hijo ya tiene uno de la misma unidad (o general). */
  examenes: number
  /** La familia y el hijo tienen rúbrica propia las dos. */
  rubrica: boolean
}

/** Mismo examen «para lo mismo»: la misma unidad, o los dos generales. */
const mismaUnidadDePrueba = (a: Rubrica, b: Rubrica) => (a.unidad_id ?? null) === (b.unidad_id ?? null)

/**
 * Qué chocaría al mover lo de la familia a ESE hijo. Se consulta antes para
 * preguntar al docente; nunca se decide por él.
 */
export async function conflictosAlMover(familia_id: number, hijo_id: number, bloque?: FiltroBloque): Promise<ConflictosMovimiento> {
  const [deFamilia, deHijo] = await Promise.all([
    db.rubricas.where('instrumento_id').equals(familia_id).toArray(),
    db.rubricas.where('instrumento_id').equals(hijo_id).toArray(),
  ])
  const f = vivos(deFamilia).filter(r => enBloque(bloque, r.unidad_id, diaDeRubrica(r))), h = vivos(deHijo)
  return {
    examenes: f.filter(r => r.tipo === 'prueba' && h.some(x => x.tipo === 'prueba' && mismaUnidadDePrueba(r, x))).length,
    rubrica: f.some(esRubrica) && h.some(esRubrica),
  }
}

/** Lo movido a un hijo que ya existía, y lo que se quedó en la familia por no pisar al hijo. */
export type ResultadoMovimiento = ResultadoConversion & {
  noMovidos: { calificaciones: number; examenes: number; rubricas: number }
}

/**
 * Mueve lo anotado directamente en una familia a un hijo QUE YA EXISTE.
 *
 * `convertirFamiliaEnHijo` solo se ofrece antes del primer hijo. A Luis no le
 * sirvió: «Examen · A nosa saúde» ya existía cuando definió el test y corrigió
 * por cámara, y todo eso se guardó con el id de la familia «Proba escrita».
 * La columna del hijo decía «Definir y corregir» y la familia, apartada por el
 * hijo, no tenía columna donde enseñarlo. Esto lo pasa al hijo elegido:
 *
 *  - `calificaciones` y `diario`: misma fila, `instrumento_id` del hijo y
 *    `updated_at` nuevo. Una nota de la familia cuya casilla el hijo YA tiene
 *    con nota no se mueve: lo que el docente puso en el hijo manda, y la de la
 *    familia se queda donde estaba (se cuenta en `noMovidos`).
 *  - `rubricas` (exámenes y rúbrica del instrumento): igual. Si el hijo ya
 *    tiene examen para la misma unidad, o rúbrica propia, solo se mueve con
 *    `sustituir`, que retira la del hijo (borrado lógico); si no, la de la
 *    familia no se mueve y se cuenta.
 *  - `criterio_instrumentos`: el hijo recibe, unidad a unidad, los criterios
 *    que nombran las notas y registros movidos y aún no cubría, siempre
 *    dentro de los de la familia. Sin esto la nota llegaría al hijo pero su
 *    columna no la enseñaría.
 *
 * Nunca se llama sola: siempre tras la elección expresa del docente.
 */
export async function moverDatosDeFamiliaAHijo(
  familia_id: number, hijo_id: number, opciones: { sustituir?: boolean; bloque?: FiltroBloque } = {}
): Promise<ResultadoMovimiento> {
  const [familia, hijo] = await Promise.all([db.instrumentos.get(familia_id), db.instrumentos.get(hijo_id)])
  if (!familia || familia.deleted_at) throw new Error('La familia no existe')
  if (!hijo || hijo.deleted_at || hijo.familia_id !== familia_id) throw new Error('Ese instrumento no está dentro de la familia')
  const vivo = (r: { deleted_at?: string | null }) => !r.deleted_at

  return db.transaction('rw',
    [db.instrumentos, db.calificaciones, db.diario, db.rubricas, db.criterio_instrumentos],
    async () => {
      const noMovidos = { calificaciones: 0, examenes: 0, rubricas: 0 }
      /** unidad → criterios que el hijo tiene que cubrir tras el movimiento */
      const aCubrir = new Map<number, Set<string>>()
      const apunta = (unidad_id: number | null | undefined, criterios: string[]) => {
        if (unidad_id == null) return
        const s = aCubrir.get(unidad_id) ?? new Set<string>()
        for (const c of criterios) s.add(c)
        aCubrir.set(unidad_id, s)
      }

      // Notas: no se pisa una casilla que el hijo ya tenga con nota.
      const delHijo = new Set(
        (await db.calificaciones.where('instrumento_id').equals(hijo_id).toArray())
          .filter(c => vivo(c) && c.valor != null).map(c => claveCelda({ ...c, instrumento_id: familia_id })))
      let calificaciones = 0
      // Con `bloque` (unidad y día, `db/bloquesFamilia.ts`) se mueve solo esa
      // parte: el gestor lo ofrece bloque a bloque para que cada uno vaya al
      // hijo que lo hizo de verdad.
      const { bloque } = opciones
      for (const c of (await db.calificaciones.where('instrumento_id').equals(familia_id).toArray()).filter(vivo)) {
        if (!enBloque(bloque, c.unidad_id, diaDeNota(c))) continue
        if (c.valor != null && delHijo.has(claveCelda(c))) { noMovidos.calificaciones++; continue }
        await db.calificaciones.update(c.id!, tocado({ instrumento_id: hijo_id }))
        calificaciones++
        apunta(c.unidad_id, [c.criterio_id])
      }

      // Diario: entero; los criterios van fijados en cada registro.
      const regs = (await db.diario.where('instrumento_id').equals(familia_id).toArray())
        .filter(r => vivo(r) && enBloque(bloque, r.unidad_id, diaDeRegistro(r)))
      for (const r of regs) {
        await db.diario.update(r.id!, tocado({ instrumento_id: hijo_id }))
        apunta(r.unidad_id, criteriosDe(r))
      }

      // Exámenes y rúbrica: solo se pisa lo del hijo con `sustituir`.
      const delHijoRub = (await db.rubricas.where('instrumento_id').equals(hijo_id).toArray()).filter(vivo)
      let rubricas = 0
      for (const r of (await db.rubricas.where('instrumento_id').equals(familia_id).toArray()).filter(vivo)) {
        if (!enBloque(bloque, r.unidad_id, diaDeRubrica(r))) continue
        const choca = r.tipo === 'prueba'
          ? delHijoRub.filter(x => x.tipo === 'prueba' && mismaUnidadDePrueba(r, x))
          : delHijoRub.filter(esRubrica)
        if (choca.length && !opciones.sustituir) {
          if (r.tipo === 'prueba') noMovidos.examenes++; else noMovidos.rubricas++
          continue
        }
        for (const x of choca) await db.rubricas.update(x.id!, tocado({ deleted_at: sello() }))
        await db.rubricas.update(r.id!, tocado({ instrumento_id: hijo_id }))
        rubricas++
      }

      // El hijo cubre lo que acaba de recibir, dentro de lo que la familia cubre.
      let criterios = 0
      for (const [unidad_id, pedidos] of aCubrir) {
        const deFamilia = new Set(
          vivos(await db.criterio_instrumentos.where('instrumento_id').equals(familia_id).toArray())
            .filter(f => f.unidad_id === unidad_id).map(f => f.criterio_id))
        const actuales = vivos(await db.criterio_instrumentos.where('instrumento_id').equals(hijo_id).toArray())
          .filter(f => f.unidad_id === unidad_id).map(f => f.criterio_id)
        const faltan = [...pedidos].filter(c => deFamilia.has(c) && !actuales.includes(c))
        if (!faltan.length) continue
        await fijarCriteriosDeHijo(unidad_id, hijo_id, [...actuales, ...faltan])
        criterios += faltan.length
      }

      return { hijo_id, calificaciones, diario: regs.length, rubricas, criterios, noMovidos }
    })
}

/**
 * El nombre genérico que se le propone a la familia al convertirla: lo que
 * va antes del separador («Proba escrita - express repaso» → «Proba
 * escrita») y, si no hay separador, la etiqueta de su tipo. Puro; el docente
 * siempre puede escribir otro.
 */
export function nombreGenericoDeFamilia(familia: Pick<Instrumento, 'nombre' | 'tipo'>, etiquetaTipo: string): string {
  const antes = familia.nombre.split(/\s+[-–—·:|]\s+|\s*[(:]/)[0].trim()
  if (antes && antes !== familia.nombre.trim()) return antes
  return etiquetaTipo
}

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
  fields: Partial<Pick<Instrumento, 'nombre' | 'tipo' | 'peso' | 'orden' | 'trimestres' | 'agregacion' | 'color'>>
): Promise<void> {
  const antes = 'agregacion' in fields ? (await db.instrumentos.get(id))?.agregacion ?? 'media' : null
  await db.instrumentos.update(id, tocado(fields))
  // Otra regla de agregación cambia la nota de todas las casillas con diario.
  if ('agregacion' in fields && (fields.agregacion ?? 'media') !== antes) await rematerializarInstrumento(id)
}

/** Al borrar un instrumento caen sus notas, su rúbrica y sus vínculos con criterios. */
export async function eliminarInstrumento(instrumento_id: number): Promise<void> {
  // Borrar una familia se lleva a sus hijos: sin ella no pesan en nada.
  for (const h of await getHijos(instrumento_id)) await eliminarInstrumento(h.id!)
  await conservarRubricasEnBanco([instrumento_id])
  const t = sello()
  const marcar = { deleted_at: t, updated_at: t }
  await db.transaction('rw',
    [db.instrumentos, db.calificaciones, db.diario, db.rubricas, db.criterio_instrumentos],
    async () => {
      await db.calificaciones.where('instrumento_id').equals(instrumento_id).modify(marcar)
      await db.diario.where('instrumento_id').equals(instrumento_id).modify(marcar)
      await db.rubricas.where('instrumento_id').equals(instrumento_id).modify(marcar)
      await db.criterio_instrumentos.where('instrumento_id').equals(instrumento_id).modify(marcar)
      await db.instrumentos.update(instrumento_id, marcar)
    }
  )
}

// Subir/bajar un instrumento en el orden de su asignatura
export async function moverInstrumento(asignatura_id: number, instrumento_id: number, dir: -1 | 1): Promise<void> {
  // Se reordena entre iguales: las familias entre sí, o los hijos de una misma familia.
  const propio = await db.instrumentos.get(instrumento_id)
  const instrs = (await getInstrumentos(asignatura_id))
    .filter(i => (i.familia_id ?? null) === (propio?.familia_id ?? null))
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

/** Un instrumento asignado a un criterio, con lo que pesa dentro de él. */
export type VinculoInstrumento = {
  instrumento_id: number
  /** Campo histórico, sin uso. Ver `CriterioInstrumento.peso`. */
  peso: number
  /** Peso declarado dentro del criterio, o null si se usa el global. */
  peso_criterio: number | null
}

export async function getCriterioInstrumentos(unidad_id: number): Promise<CriterioInstrumento[]> {
  return vivos(await db.criterio_instrumentos.where('unidad_id').equals(unidad_id).toArray())
}

/** Mapa criterio → instrumentos asignados, para una unidad. */
export async function getMapaCriterioInstrumento(
  unidad_id: number
): Promise<Map<string, VinculoInstrumento[]>> {
  const filas = await getCriterioInstrumentos(unidad_id)
  const mapa = new Map<string, VinculoInstrumento[]>()
  for (const f of filas) {
    const lista = mapa.get(f.criterio_id) || []
    lista.push({
      instrumento_id: f.instrumento_id,
      peso: f.peso,
      peso_criterio: f.peso_criterio ?? null,
    })
    mapa.set(f.criterio_id, lista)
  }
  return mapa
}

/**
 * Deja declarado cuánto pesa cada instrumento dentro de un criterio.
 *
 * Se escriben **todos** los instrumentos del criterio de una vez, no uno
 * suelto: mezclar pesos declarados con pesos globales dentro del mismo
 * criterio daría una nota que no sabría explicar ni quien la puso.
 *
 * Pasar `null` borra el reparto propio y devuelve el criterio al peso global
 * de cada instrumento, que es como se comportaba antes de que esto existiera.
 */
/**
 * Borra el reparto declarado de TODOS los criterios de una unidad.
 *
 * Hace falta cuando se toca la lista de instrumentos en bloque: un reparto
 * escrito para tres instrumentos deja de sumar 100 en cuanto entra un cuarto,
 * y el criterio quedaría mezclando pesos declarados con pesos globales.
 */
export async function limpiarPesosDeUnidad(unidad_id: number): Promise<void> {
  const filas = vivos(await db.criterio_instrumentos.where('unidad_id').equals(unidad_id).toArray())
  for (const fila of filas) {
    if (fila.peso_criterio == null) continue
    await db.criterio_instrumentos.update(fila.id!, tocado({ peso_criterio: null }))
  }
}

export async function fijarPesosDeCriterio(
  unidad_id: number, criterio_id: string, pesos: Map<number, number> | null
): Promise<void> {
  const filas = await db.criterio_instrumentos
    .where('[unidad_id+criterio_id]').equals([unidad_id, criterio_id]).toArray()

  for (const fila of filas) {
    if (fila.deleted_at) continue
    const valor = pesos ? pesos.get(fila.instrumento_id) ?? null : null
    if ((fila.peso_criterio ?? null) === valor) continue
    await db.criterio_instrumentos.update(fila.id!, tocado({ peso_criterio: valor }))
  }
}

/**
 * Mapa criterio → instrumentos de TODA la asignatura (unión de sus unidades).
 * Lo usa el calificador cuando se muestran todos los criterios sin filtrar
 * por unidad.
 */
export async function getMapaCriterioInstrumentoAsignatura(
  asignatura_id: number
): Promise<Map<string, (VinculoInstrumento & { unidad_id: number })[]>> {
  const unidades = await db.unidades.where('asignatura_id').equals(asignatura_id).toArray()
  const ids = vivos(unidades).map(u => u.id!)
  const mapa = new Map<string, (VinculoInstrumento & { unidad_id: number })[]>()
  if (!ids.length) return mapa

  const filas = vivos(await db.criterio_instrumentos.where('unidad_id').anyOf(ids).toArray())
  for (const f of filas) {
    const lista = mapa.get(f.criterio_id) || []
    // Evitar duplicar el mismo instrumento si aparece en varias unidades
    if (!lista.some(x => x.instrumento_id === f.instrumento_id)) {
      lista.push({
        instrumento_id: f.instrumento_id,
        peso: f.peso,
        peso_criterio: f.peso_criterio ?? null,
        unidad_id: f.unidad_id,
      })
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

// Nota actual de un alumno en un criterio/instrumento/trimestre/unidad concretos
export async function getCalificacionUnica(
  alumno_id: number, instrumento_id: number, criterio_id: string, trimestre: number, unidad_id: number
): Promise<Calificacion | undefined> {
  const filas = await db.calificaciones
    .where('[alumno_id+instrumento_id+criterio_id+trimestre+unidad_id]')
    .equals([alumno_id, instrumento_id, criterio_id, trimestre, unidad_id])
    .toArray()
  return masReciente(vivos(filas))
}

/**
 * Filas criterio ↔ instrumento de un instrumento en las unidades que cuentan
 * para un trimestre (las de ese trimestre y las que no tienen ninguno). Si se
 * da `unidad_id`, solo las de esa unidad.
 */
async function filasDeInstrumentoEnTrimestre(
  instrumento_id: number, trimestre: number, unidad_id?: number | null
): Promise<CriterioInstrumento[]> {
  const filas = vivos(await db.criterio_instrumentos.where('instrumento_id').equals(instrumento_id).toArray())
    .filter(f => unidad_id == null || f.unidad_id === unidad_id)
  if (!filas.length) return []
  const unidades = new Map(
    vivos(await db.unidades.where('id').anyOf([...new Set(filas.map(f => f.unidad_id))]).toArray())
      .map(u => [u.id!, u]))
  return filas.filter(f => {
    const u = unidades.get(f.unidad_id)
    return !!u && (u.trimestre == null || u.trimestre === trimestre)
  })
}

/**
 * Con qué criterios va vinculado este, para un instrumento en una unidad.
 * El vínculo no sale de la unidad: desde la v7 la casilla lleva la unidad en
 * la clave, así que lo que se replica en una no toca a las demás.
 */
export async function getCriteriosVinculados(
  instrumento_id: number, criterio_id: string, trimestre: number, unidad_id: number
): Promise<string[]> {
  return criteriosVinculados(await filasDeInstrumentoEnTrimestre(instrumento_id, trimestre, unidad_id), criterio_id)
}

/**
 * Deja vinculados EXACTAMENTE estos criterios para el instrumento (menos de
 * dos = sin vínculo). Con `unidad_id`, solo en esa unidad; sin él —la vista
 * «Todo el curso»—, en todas las del trimestre donde el instrumento los evalúa.
 *
 * No toca ninguna nota: el vínculo vale de aquí en adelante.
 */
export async function fijarVinculoDeInstrumento(
  instrumento_id: number, trimestre: number, unidad_id: number | null, criterios: string[]
): Promise<void> {
  const quedan = new Set(criterios.length >= 2 ? criterios : [])
  const filas = await filasDeInstrumentoEnTrimestre(instrumento_id, trimestre, unidad_id)
  for (const f of filas) {
    const debe = quedan.has(f.criterio_id) ? 1 : null
    if ((f.vinculado || null) !== debe) await db.criterio_instrumentos.update(f.id!, tocado({ vinculado: debe }))
  }
}

/**
 * Copia las notas de un criterio a otros, para el mismo instrumento y
 * trimestre. Es una copia puntual: después cada casilla va por su cuenta.
 *
 * Una casilla de destino que ya tiene nota se respeta salvo que se pida
 * `sobrescribir`: copiar una columna no puede llevarse por delante lo que el
 * docente ya había puesto a mano.
 */
export async function copiarNotasACriterios(p: {
  instrumento_id: number
  trimestre: number
  unidad_id: number
  origen: string
  destinos: string[]
  alumno_ids: number[]
  sobrescribir: boolean
  /**
   * Con esto, la nota que se copia es la de ESTE alumno en `origen`, y va a
   * todos los `alumno_ids` (también en `origen`, si está entre los destinos).
   * Sin ello, cada alumno reparte su propia nota a los otros criterios. Son
   * dos gestos distintos: «todos han hecho bien el billete de salida» frente
   * a «ya corregí la columna, rellena las hermanas».
   */
  desde_alumno_id?: number
}): Promise<{ copiadas: number; respetadas: number; sinNota: number }> {
  let copiadas = 0, respetadas = 0, sinNota = 0
  const items: CalItem[] = []
  const comun = p.desde_alumno_id != null
    ? await getCalificacionUnica(p.desde_alumno_id, p.instrumento_id, p.origen, p.trimestre, p.unidad_id)
    : null
  if (p.desde_alumno_id != null && (!comun || comun.valor == null)) return { copiadas, respetadas, sinNota: 1 }
  for (const alumno_id of p.alumno_ids) {
    const src = comun ?? await getCalificacionUnica(alumno_id, p.instrumento_id, p.origen, p.trimestre, p.unidad_id)
    if (!src || src.valor == null) { sinNota++; continue }
    for (const destino of p.destinos) {
      // La propia casilla de partida no se copia sobre sí misma.
      if (destino === p.origen && (comun ? alumno_id === p.desde_alumno_id : true)) continue
      const ya = await getCalificacionUnica(alumno_id, p.instrumento_id, destino, p.trimestre, p.unidad_id)
      if (ya?.valor != null && !p.sobrescribir) { respetadas++; continue }
      items.push({
        alumno_id, instrumento_id: p.instrumento_id, criterio_id: destino,
        asignatura: src.asignatura, curso: src.curso, etapa: src.etapa, comunidad: src.comunidad,
        trimestre: p.trimestre, valor: src.valor, observacion: src.observacion ?? null,
        unidad_id: p.unidad_id, niveles_rubrica: src.niveles_rubrica ?? null,
      })
      copiadas++
    }
  }
  // Sin réplica: se copia a donde se ha pedido, no a lo que cuelgue de ahí.
  await saveCalificaciones(items, { sinVinculos: true })
  return { copiadas, respetadas, sinNota }
}

/**
 * Guarda notas. Es el único sitio por el que pasan —panel de celda,
 * evaluación rápida, QR—, y por eso la réplica a los criterios vinculados se
 * hace aquí: un vínculo tiene que valer igual se califique por donde se
 * califique. Devuelve cuántas casillas vinculadas se han escrito además de
 * las pedidas.
 */
export async function saveCalificaciones(
  items: CalItem[], opciones: { sinVinculos?: boolean } = {}
): Promise<number> {
  let replicadas = 0
  // La unidad es parte de la clave: una fila sin ella no entraría en el
  // índice y la casilla la perdería de vista. Mejor fallar aquí, a la vista.
  for (const item of items) {
    if (typeof item.unidad_id !== 'number') throw new Error('Una calificación necesita su unidad')
  }
  if (!opciones.sinVinculos && items.length) {
    const clave = (i: Pick<CalItem, 'alumno_id' | 'instrumento_id' | 'criterio_id' | 'trimestre' | 'unidad_id'>) =>
      `${i.alumno_id}:${i.instrumento_id}:${i.criterio_id}:${i.trimestre}:${i.unidad_id}`
    // Lo que se pide explícitamente manda sobre lo que llegaría por réplica.
    const pedidas = new Set(items.map(clave))
    const cache = new Map<string, string[]>()
    const extra: CalItem[] = []
    for (const item of items) {
      const k = `${item.instrumento_id}:${item.criterio_id}:${item.trimestre}:${item.unidad_id}`
      let hermanos = cache.get(k)
      if (!hermanos) cache.set(k, hermanos = await getCriteriosVinculados(item.instrumento_id, item.criterio_id, item.trimestre, item.unidad_id))
      for (const criterio_id of hermanos) {
        const copia = { ...item, criterio_id }
        if (pedidas.has(clave(copia))) continue
        pedidas.add(clave(copia))
        extra.push(copia)
      }
    }
    replicadas = extra.length
    items = [...items, ...extra]
  }

  await db.transaction('rw', db.calificaciones, async () => {
    for (const item of items) {
      const filas = await db.calificaciones
        .where('[alumno_id+instrumento_id+criterio_id+trimestre+unidad_id]')
        .equals([item.alumno_id, item.instrumento_id, item.criterio_id, item.trimestre, item.unidad_id])
        .toArray()
      // Se escribe en la fila que leen la casilla y la matriz (`masReciente`).
      // Sin fila viva se reutiliza una borrada, si la hay. Las otras vivas
      // —duplicadas por sincronizar dos aparatos— se retiran aquí mismo: si
      // no, la nota nueva quedaba en una y la matriz seguía pintando la otra.
      const vivas = vivos(filas)
      const existing = masReciente(vivas) ?? masReciente(filas)
      for (const sobra of vivas) {
        if (sobra.id != null && sobra.id !== existing?.id) await db.calificaciones.update(sobra.id, tocado({ deleted_at: now() }))
      }
      if (existing?.id != null) {
        // Ojo: esta lista enumera los campos que se actualizan. Un campo
        // nuevo que no se añada aquí se guarda al crear y se pierde en cada
        // recalificación, en silencio.
        await db.calificaciones.update(existing.id, tocado({
          valor: item.valor,
          observacion: item.observacion ?? existing.observacion ?? null,
          niveles_rubrica: item.niveles_rubrica !== undefined
            ? item.niveles_rubrica
            : existing.niveles_rubrica ?? null,
          ...(item.valor_anterior !== undefined
            ? { valor_anterior: item.valor_anterior, anterior_motivo: item.anterior_motivo ?? null }
            : {}),
          origen: item.origen !== undefined
            ? item.origen
            // Una nota distinta puesta a mano sobre una casilla derivada del
            // diario la vuelve manual; guardar una observación con la misma
            // nota no la desmarca.
            : (existing.origen === 'diario' && item.valor !== existing.valor ? null : existing.origen ?? null),
          fecha: now(),
          deleted_at: null,
        }))
      } else {
        await db.calificaciones.add(nuevo({ ...item, fecha: now() }))
      }
    }
  })
  return replicadas
}

/** Todas las notas de un alumno en una asignatura (para su ficha y los informes). */
export async function getCalificacionesAlumnoAsignatura(
  alumno_id: number, asignatura_id: number
): Promise<Calificacion[]> {
  const instrIds = (await getInstrumentos(asignatura_id)).map(i => i.id!)
  if (!instrIds.length) return []
  return sinDuplicados(vivos(await db.calificaciones.where('instrumento_id').anyOf(instrIds)
    .filter(c => c.alumno_id === alumno_id).toArray()))
}

/**
 * Media por criterio y trimestre de una asignatura (gráficas de Seguimiento).
 *
 * Pondera por el peso del instrumento, igual que `calculo.ts`. Antes hacía
 * media aritmética pura, así que la misma asignatura daba un número en la
 * pantalla de Seguimiento y otro distinto en el informe: un examen al 70 % y
 * una observación al 30 % salían aquí al 50/50.
 */
export async function getResumenPorCriterio(asignatura_id: number): Promise<
  { criterio_id: string; trimestre: number; media: number }[]
> {
  const instrumentos = await getInstrumentos(asignatura_id)
  const instrIds = instrumentos.map(i => i.id!)
  if (!instrIds.length) return []
  const pesoDe = new Map(instrumentos.map(i => [i.id!, i.peso]))

  // Como en el motor: primero la media de unidades, después el peso.
  const cals = fundirUnidades(sinDuplicados(vivos(await db.calificaciones.where('instrumento_id').anyOf(instrIds)
    .filter(c => c.valor != null).toArray())))

  const acc = new Map<string, { suma: number; pesos: number }>()
  for (const c of cals) {
    // Mismo criterio que el motor: peso 0 descarta la nota; una nota cuyo
    // instrumento ya no existe conserva valor histórico con peso 1.
    const declarado = pesoDe.get(c.instrumento_id)
    const peso = declarado === undefined ? 1 : (declarado > 0 ? declarado : 0)
    if (peso === 0) continue

    const key = `${c.criterio_id}::${c.trimestre}`
    const e = acc.get(key) || { suma: 0, pesos: 0 }
    e.suma += c.valor! * peso
    e.pesos += peso
    acc.set(key, e)
  }
  return [...acc.entries()]
    .filter(([, { pesos }]) => pesos > 0)
    .map(([key, { suma, pesos }]) => {
      const [criterio_id, trimestre] = key.split('::')
      return { criterio_id, trimestre: Number(trimestre), media: suma / pesos }
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
    ? sinDuplicados(vivos(await db.calificaciones.where('instrumento_id').anyOf(instrIds).toArray()))
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
  // La programación habla de familias: los hijos no se asignan desde ahí.
  const hijos = new Set((await getInstrumentos(asignatura_id)).filter(i => i.familia_id != null).map(i => i.id!))

  return Promise.all(unidades.map(async u => {
    const ucs = vivos(await db.unidad_criterios.where('unidad_id').equals(u.id!).toArray())
    const mapaInstr = await getMapaCriterioInstrumento(u.id!)
    for (const [c, lista] of mapaInstr) mapaInstr.set(c, lista.filter(v => !hijos.has(v.instrumento_id)))
    return {
      ...u,
      criterios: ucs.map(uc => ({
        criterio_id: uc.criterio_id,
        peso: uc.peso,
        minimo: uc.minimo || null,
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
  unidad_id: number, criterio_id: string, peso = 1.0, minimo?: string
): Promise<void> {
  const existing = await db.unidad_criterios
    .where('[unidad_id+criterio_id]').equals([unidad_id, criterio_id]).first()
  // `minimo` sin declarar no toca el que hubiera: marcar la casilla en la
  // programación no debe borrar el mínimo importado de PROENS.
  const extra = minimo === undefined ? {} : { minimo }
  if (existing?.id != null) {
    await db.unidad_criterios.update(existing.id, tocado({ peso, deleted_at: null, ...extra }))
  } else {
    await db.unidad_criterios.add(nuevo({ unidad_id, criterio_id, peso, ...extra }))
  }
}

/** Cambia solo el mínimo de consecución de un criterio en una unidad. */
export async function fijarMinimoDeCriterio(
  unidad_id: number, criterio_id: string, minimo: string
): Promise<void> {
  await db.unidad_criterios
    .where('[unidad_id+criterio_id]').equals([unidad_id, criterio_id])
    .modify(tocado({ minimo }))
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

// ─── IMPORTAR UNA PROGRAMACIÓN OFICIAL (PROENS) ──────────────────────────────

const claveNombre = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

export interface ProgramacionImportable {
  instrumentos: { abrev: string; nombre: string; tipo: string; peso: number | null }[]
  unidades: {
    numero: number
    titulo: string
    descripcion: string
    peso: number | null
    sesiones: number | null
    trimestre: 1 | 2 | 3 | null
    contenidos: string[]
    criterios: { codigoCurriculo: string; minimo: string; instrumento: string | null }[]
  }[]
}

export interface ResultadoImportacion {
  instrumentosCreados: number
  instrumentosReutilizados: number
  unidadesCreadas: number
  unidadesActualizadas: number
  criteriosVinculados: number
  criteriosSinInstrumento: number
}

/**
 * Vuelca en un área la programación leída de PROENS.
 *
 * NO destructiva, como el resto de la programación: un instrumento con el
 * mismo nombre se reutiliza (y se le pone el peso de la programación), una
 * unidad con el mismo título se actualiza en vez de duplicarse, y los
 * criterios se vinculan con su mínimo y su instrumento sin tocar las
 * calificaciones que ya hubiera. Repetir la importación deja lo mismo.
 *
 * Los criterios llegan ya con el código del currículo (CE2.1); quien llama
 * ha debido filtrar antes los que el currículo cargado no conozca.
 */
export async function aplicarProgramacionImportada(
  asignatura_id: number, prog: ProgramacionImportable
): Promise<ResultadoImportacion> {
  const r: ResultadoImportacion = {
    instrumentosCreados: 0, instrumentosReutilizados: 0,
    unidadesCreadas: 0, unidadesActualizadas: 0,
    criteriosVinculados: 0, criteriosSinInstrumento: 0,
  }

  // Instrumentos: por nombre, sin acentos ni mayúsculas. Solo las familias:
  // un hijo que se llame igual que lo que trae PROENS no es lo mismo.
  const existentes = await getFamilias(asignatura_id)
  const idPorAbrev = new Map<string, number>()
  for (const ins of prog.instrumentos) {
    const ya = existentes.find(e => claveNombre(e.nombre) === claveNombre(ins.nombre))
    if (ya) {
      if (ins.peso != null && ins.peso !== ya.peso) await actualizarInstrumento(ya.id!, { peso: ins.peso })
      idPorAbrev.set(ins.abrev, ya.id!)
      r.instrumentosReutilizados++
    } else {
      const id = await crearInstrumento(asignatura_id, {
        nombre: ins.nombre, tipo: ins.tipo, peso: ins.peso ?? 1,
        trimestres: '[1,2,3]', orden: existentes.length + r.instrumentosCreados,
      })
      idPorAbrev.set(ins.abrev, id)
      r.instrumentosCreados++
    }
  }

  // Unidades: por título
  const unidadesPrevias = vivos(await db.unidades.where('asignatura_id').equals(asignatura_id).toArray())
  for (const u of prog.unidades) {
    const datos = {
      nombre: u.titulo, tipo: 'unidad', descripcion: u.descripcion || undefined,
      trimestre: u.trimestre, orden: u.numero - 1, activa: 1,
      sesiones: u.sesiones, peso: u.peso,
      contenidos: u.contenidos.length ? u.contenidos.map(c => '- ' + c).join('\n') : undefined,
    }
    const previa = unidadesPrevias.find(p => claveNombre(p.nombre) === claveNombre(u.titulo))
    let unidad_id: number
    if (previa) {
      unidad_id = previa.id!
      await actualizarUnidad(unidad_id, datos)
      r.unidadesActualizadas++
    } else {
      unidad_id = await crearUnidad({ ...datos, asignatura_id })
      r.unidadesCreadas++
    }
    for (const c of u.criterios) {
      await vincularCriterio(unidad_id, c.codigoCurriculo, 1.0, c.minimo)
      r.criteriosVinculados++
      const iid = c.instrumento ? idPorAbrev.get(c.instrumento) : undefined
      if (iid != null) await fijarInstrumentosDeCriterio(unidad_id, c.codigoCurriculo, [iid])
      else r.criteriosSinInstrumento++
    }
  }
  return r
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

// En la tabla conviven las rúbricas y las definiciones de prueba escrita
// (`tipo: 'prueba'`). Todo lo de este bloque es de rúbricas: las pruebas se
// apartan siempre, o un examen se abriría como una rúbrica vacía.
const esRubrica = (r: Rubrica) => r.tipo !== 'prueba'

export async function getRubrica(instrumento_id: number): Promise<Rubrica | null> {
  const filas = (await db.rubricas.where('instrumento_id').equals(instrumento_id).toArray()).filter(esRubrica)
  return vivos(filas)[0] ?? null
}

export async function guardarRubrica(data: Omit<Rubrica, 'id' | 'created_at'> & { id?: number }): Promise<number> {
  // Se reutiliza la fila aunque esté borrada: una rúbrica por instrumento.
  const existing = (await db.rubricas.where('instrumento_id').equals(data.instrumento_id).toArray()).find(esRubrica)
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
  await db.rubricas.where('instrumento_id').equals(instrumento_id).filter(esRubrica)
    .modify({ deleted_at: t, updated_at: t })
}

// ─── PRUEBAS ESCRITAS ─────────────────────────────────────────────────────────

export type PruebaGuardada = {
  id: number
  /** Unidad del examen, o null si es el general del instrumento. */
  unidad_id: number | null
  def: PruebaDef
}

function aPrueba(r: Rubrica): PruebaGuardada | null {
  try { return { id: r.id!, unidad_id: r.unidad_id ?? null, def: normalizarPrueba(JSON.parse(r.prueba_json || 'null')) } }
  catch { return null }
}

/**
 * Un examen con todo lo que lo sitúa: instrumento, área, clase y unidad. Es
 * lo que necesita la pantalla «Evaluar con QR y cámara» para abrir el
 * corrector de una hoja cuyo QR solo trae el id del examen, y para listar
 * los exámenes de todas las clases sin pasar por el Calificador.
 */
export type PruebaConContexto = {
  prueba: PruebaGuardada
  instrumento: Instrumento
  asig: Asignatura
  grupo: Grupo
  unidad: Unidad | null
  /** Test con opciones y correcta en todas las preguntas: se puede imprimir y corregir por cámara. */
  conClave: boolean
}

async function contextoDePrueba(r: Rubrica): Promise<PruebaConContexto | null> {
  const prueba = aPrueba(r)
  if (!prueba || !prueba.def.preguntas.length) return null
  const instrumento = await db.instrumentos.get(r.instrumento_id)
  if (!instrumento || instrumento.deleted_at) return null
  const asig = await db.asignaturas.get(instrumento.asignatura_id)
  if (!asig || asig.deleted_at) return null
  const grupo = await db.grupos.get(asig.grupo_id)
  if (!grupo || grupo.deleted_at) return null
  const unidad = prueba.unidad_id != null ? (await db.unidades.get(prueba.unidad_id)) ?? null : null
  return { prueba, instrumento, asig, grupo, unidad: unidad && !unidad.deleted_at ? unidad : null, conClave: tieneClave(prueba.def) }
}

export async function getPruebaConContexto(prueba_id: number): Promise<PruebaConContexto | null> {
  const r = await db.rubricas.get(prueba_id)
  if (!r || r.deleted_at || r.tipo !== 'prueba') return null
  return contextoDePrueba(r)
}

/** Todos los exámenes del docente, los más recientes primero. */
export async function listarPruebas(): Promise<PruebaConContexto[]> {
  const filas = vivos(await db.rubricas.toArray()).filter(r => r.tipo === 'prueba')
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
  const salida: PruebaConContexto[] = []
  for (const r of filas) { const c = await contextoDePrueba(r); if (c) salida.push(c) }
  return salida
}

/** Todos los exámenes de un instrumento: el general y los de cada unidad. */
export async function getPruebasDeInstrumento(instrumento_id: number): Promise<PruebaGuardada[]> {
  return vivos(await db.rubricas.where('instrumento_id').equals(instrumento_id).toArray())
    .filter(r => r.tipo === 'prueba')
    .map(aPrueba)
    .filter((p): p is PruebaGuardada => !!p && p.def.preguntas.length > 0)
}

/**
 * El examen con el que se corrige en una unidad: el suyo si lo tiene y, si no,
 * el general del instrumento. Sin unidad («Todo el curso»), solo el general:
 * no se puede adivinar de cuál de los exámenes por unidad se trata.
 */
export async function getPrueba(instrumento_id: number, unidad_id: number | null): Promise<PruebaGuardada | null> {
  const todas = await getPruebasDeInstrumento(instrumento_id)
  return (unidad_id != null ? todas.find(p => p.unidad_id === unidad_id) : undefined)
    ?? todas.find(p => p.unidad_id == null)
    ?? null
}

/** Guarda el examen de un instrumento para una unidad (o el general, con null). Uno por ámbito. */
export async function guardarPrueba(instrumento_id: number, unidad_id: number | null, def: PruebaDef): Promise<number> {
  const limpia = normalizarPrueba(def)
  const campos = { titulo: limpia.titulo, prueba_json: JSON.stringify(limpia), unidad_id }
  const existente = (await db.rubricas.where('instrumento_id').equals(instrumento_id).toArray())
    .find(r => r.tipo === 'prueba' && (r.unidad_id ?? null) === unidad_id)
  if (existente?.id != null) {
    await db.rubricas.update(existente.id, tocado({ ...campos, deleted_at: null }))
    return existente.id
  }
  const reg = nuevo({
    ...campos, instrumento_id, tipo: 'prueba' as const,
    niveles_json: '[]', indicadores_json: '[]', generada_ia: 0, created_at: now(),
  })
  await db.rubricas.add(reg)
  return reg.id
}

/** Los campos de una nota que no dependen del criterio ni del alumno. */
export type DatosDeArea = Pick<CalItem, 'asignatura' | 'curso' | 'etapa' | 'comunidad'>

/**
 * Guarda lo anotado en el examen de un alumno.
 *
 * Un examen se corrige una vez y pone nota en todos los criterios que evalúa
 * —la misma, o a cada uno la de sus preguntas—. En todos se guardan las
 * respuestas completas, para que el examen se vea entero se abra desde el
 * criterio que se abra.
 *
 * Vive aquí y no en una pantalla porque se corrige desde dos sitios, el panel
 * de la casilla y la evaluación rápida, y los dos tienen que repartir igual.
 * No pasa por los vínculos: el reparto ya lo decide el examen.
 */
export async function guardarExamenDeAlumno(p: {
  alumno_id: number
  instrumento_id: number
  trimestre: number
  unidad_id: number
  def: PruebaDef
  respuestas: Record<string, number>
  /** Criterios que el instrumento evalúa en lo que se está viendo. */
  destinos: string[]
  area: DatosDeArea
  /** La observación es de un criterio concreto; en los demás no se toca. */
  observacion?: { criterio_id: string; texto: string | null }
}): Promise<ResultadoPrueba & { criterios: string[] }> {
  const r = notaDePrueba(p.def, p.respuestas, p.destinos)
  const criterios = p.destinos.filter(c => c in r.porCriterio)
  await saveCalificaciones(criterios.map(c => ({
    alumno_id: p.alumno_id, instrumento_id: p.instrumento_id, criterio_id: c, ...p.area,
    trimestre: p.trimestre, valor: r.porCriterio[c], unidad_id: p.unidad_id, niveles_rubrica: p.respuestas,
    ...(p.observacion?.criterio_id === c ? { observacion: p.observacion.texto } : {}),
  })), { sinVinculos: true })
  return { ...r, criterios }
}

/**
 * Las respuestas de examen ya guardadas para un alumno, vengan del criterio
 * que vengan. Un examen repartido por criterios puede no tener ninguna
 * pregunta del que se está mirando: ahí no hay nota, pero el examen sí está
 * corregido, y enseñarlo en blanco haría que anotar una pregunta borrase las demás.
 */
export async function getRespuestasDeExamen(
  alumno_id: number, instrumento_id: number, trimestre: number, unidad_id: number, criterios: string[]
): Promise<Record<string, number>> {
  for (const c of criterios) {
    const cal = await getCalificacionUnica(alumno_id, instrumento_id, c, trimestre, unidad_id)
    if (cal?.niveles_rubrica && Object.keys(cal.niveles_rubrica).length) return cal.niveles_rubrica
  }
  return {}
}

/**
 * Correcciones ya hechas con el examen de un ámbito (una unidad, o el general),
 * agrupadas por alumno y trimestre.
 *
 * Son las notas del instrumento que guardan respuestas de examen. Las del
 * examen general son las de las unidades que no tienen examen propio.
 */
async function correccionesDeExamen(instrumento_id: number, unidad_id: number | null, def: PruebaDef) {
  const otras = new Set((await getPruebasDeInstrumento(instrumento_id))
    .map(p => p.unidad_id).filter((u): u is number => u != null))
  const esRespuesta = (clave: string) => /^p\d+$/.test(clave) || def.preguntas.some(q => q.id === clave)
  const cals = vivos(await db.calificaciones.where('instrumento_id').equals(instrumento_id).toArray())
    .filter(c => c.niveles_rubrica && Object.keys(c.niveles_rubrica).some(esRespuesta))
    .filter(c => unidad_id != null ? c.unidad_id === unidad_id : !otras.has(c.unidad_id))
  const grupos = new Map<string, Calificacion[]>()
  for (const c of cals) {
    const k = `${c.alumno_id}:${c.trimestre}:${c.unidad_id}`
    grupos.set(k, [...(grupos.get(k) ?? []), c])
  }
  return [...grupos.values()]
}

/** Cuántos alumnos tienen ya corregido el examen de este ámbito. */
export async function contarCorregidosDeExamen(instrumento_id: number, unidad_id: number | null, def: PruebaDef): Promise<number> {
  return new Set((await correccionesDeExamen(instrumento_id, unidad_id, def)).map(g => g[0].alumno_id)).size
}

/**
 * Vuelve a calcular las notas ya puestas con un examen después de cambiarlo
 * (otro tipo, otros puntos, otro reparto). Las respuestas anotadas no se
 * tocan: solo lo que valen.
 *
 * **Ninguna nota se pierde.** La que cambia —o la que se queda sin nota
 * porque con el examen nuevo ninguna pregunta nombra su criterio— deja su
 * valor anterior como fantasma (`valor_anterior`): a la vista, sin contar, y
 * recuperable. Se llegó a retirar sin más, y una nota que desaparece al tocar
 * la configuración de un examen no es algo que el docente espere.
 */
export async function recalcularNotasDeExamen(
  instrumento_id: number, unidad_id: number | null, def: PruebaDef, motivo: string
): Promise<{ alumnos: number; fantasmas: number }> {
  const grupos = await correccionesDeExamen(instrumento_id, unidad_id, def)
  const filas = vivos(await db.criterio_instrumentos.where('instrumento_id').equals(instrumento_id).toArray())
  const items: CalItem[] = []
  const alumnos = new Set<number>()
  let fantasmas = 0
  for (const cals of grupos) {
    const base = cals[0]
    const respuestas = cals.find(c => Object.keys(c.niveles_rubrica ?? {}).length)!.niveles_rubrica!
    const enUnidad = filas.filter(f => f.unidad_id === base.unidad_id)
    const destinos = [...new Set([...enUnidad.map(f => f.criterio_id), ...cals.map(c => c.criterio_id)])]
    const r = notaDePrueba(def, respuestas, destinos)
    const comun = {
      alumno_id: base.alumno_id, instrumento_id, trimestre: base.trimestre, unidad_id: base.unidad_id,
      asignatura: base.asignatura, curso: base.curso, etapa: base.etapa, comunidad: base.comunidad,
    }
    for (const c of destinos) {
      const previa = cals.find(x => x.criterio_id === c)
      const recibe = c in r.porCriterio
      if (!recibe && !previa) continue
      const valor = recibe ? r.porCriterio[c] : null
      // Solo hay fantasma si había nota y deja de ser la que era. Si la
      // casilla ya estaba sin nota, se conserva el fantasma que tuviera.
      const cambia = previa?.valor != null && previa.valor !== valor
      if (cambia) fantasmas++
      items.push({
        ...comun, criterio_id: c, valor, niveles_rubrica: respuestas,
        ...(cambia ? { valor_anterior: previa!.valor, anterior_motivo: motivo } : {}),
      })
    }
    alumnos.add(base.alumno_id)
  }
  await saveCalificaciones(items, { sinVinculos: true })
  return { alumnos: alumnos.size, fantasmas }
}

/**
 * La nota fantasma vuelve a ser la que cuenta. La que contaba hasta ahora
 * pasa a ser el fantasma: es un intercambio, así que se puede deshacer.
 */
export async function recuperarNotaAnterior(calificacion_id: number): Promise<void> {
  const c = await db.calificaciones.get(calificacion_id)
  if (!c || c.valor_anterior == null) return
  await db.calificaciones.update(calificacion_id, tocado({
    valor: c.valor_anterior,
    valor_anterior: c.valor ?? null,
    anterior_motivo: c.valor != null ? 'Nota sustituida al recuperar la anterior' : null,
    // Recuperar la nota manual es volver a mano.
    origen: null,
  }))
}

/** Quita la nota fantasma. La nota que cuenta no se toca. */
export async function descartarNotaAnterior(calificacion_id: number): Promise<void> {
  await db.calificaciones.update(calificacion_id, tocado({ valor_anterior: null, anterior_motivo: null }))
}

/** Quita la definición del examen. Las notas ya puestas con él se conservan. */
export async function eliminarPrueba(id: number): Promise<void> {
  const r = await db.rubricas.get(id)
  if (!r || r.tipo !== 'prueba') return
  await db.rubricas.update(id, tocado({ deleted_at: sello() }))
}

// ─── BANCO DE RÚBRICAS ────────────────────────────────────────────────────────

/** Una rúbrica del banco, con dónde se está usando. */
export type RubricaDeBanco = {
  /** Registro de `rubricas` que la representa. */
  id: number
  titulo: string
  niveles_json: string
  indicadores_json: string
  contexto?: string
  generada_ia: number
  /**
   * Tiene copia propia en el banco. Las que no, existen solo dentro de un
   * instrumento y desaparecen con él (o con su clase).
   */
  enBanco: boolean
  /** Id de la copia del banco, si la tiene: es lo que se quita con «Quitar del banco». */
  bancoId: number | null
  /** «6ºA · Ciencias Sociales · Juegos populares», uno por instrumento que la usa. */
  usos: string[]
  /** Instrumentos que la usan, para no ofrecerle a uno su propia rúbrica. */
  instrumentoIds: number[]
  area?: string
  nivel?: string
  nIndicadores: number
  nNiveles: number
  updated_at: string
}

/** Dos rúbricas son la misma si dicen lo mismo, estén donde estén. */
function firmaRubrica(r: Pick<Rubrica, 'titulo' | 'niveles_json' | 'indicadores_json'>): string {
  const canon = (json: string) => { try { return JSON.stringify(JSON.parse(json)) } catch { return json } }
  return `${r.titulo.trim()}\u0000${canon(r.niveles_json)}\u0000${canon(r.indicadores_json)}`
}

/**
 * El banco del docente: todas sus rúbricas, de cualquier clase y área.
 *
 * Son las copias guardadas aparte (`INSTRUMENTO_BANCO`) más las que están en
 * uso dentro de algún instrumento. La misma rúbrica en tres clases sale una
 * sola vez, con sus tres usos: si no, el banco sería una lista de repetidas.
 */
export async function getBancoRubricas(): Promise<RubricaDeBanco[]> {
  const todas = vivos(await db.rubricas.toArray()).filter(esRubrica)
  const instrumentos = new Map(vivos(await db.instrumentos.toArray()).map(i => [i.id!, i]))
  const asignaturas = new Map(vivos(await db.asignaturas.toArray()).map(a => [a.id!, a]))
  const grupos = new Map(vivos(await db.grupos.toArray()).map(g => [g.id!, g]))

  const porFirma = new Map<string, RubricaDeBanco>()
  // Primero las del banco: si una rúbrica tiene copia propia, esa es la que manda.
  const ordenadas = [...todas].sort((a, b) =>
    Number(b.instrumento_id === INSTRUMENTO_BANCO) - Number(a.instrumento_id === INSTRUMENTO_BANCO))
  for (const r of ordenadas) {
    const esDelBanco = r.instrumento_id === INSTRUMENTO_BANCO
    const ins = esDelBanco ? undefined : instrumentos.get(r.instrumento_id)
    // Rúbrica de un instrumento que ya no existe: no es de nadie.
    if (!esDelBanco && !ins) continue
    const asig = ins ? asignaturas.get(ins.asignatura_id) : undefined
    const grupo = asig ? grupos.get(asig.grupo_id) : undefined

    const firma = firmaRubrica(r)
    let entrada = porFirma.get(firma)
    if (!entrada) {
      let nIndicadores = 0, nNiveles = 0
      try {
        nIndicadores = JSON.parse(r.indicadores_json).length
        nNiveles = JSON.parse(r.niveles_json).length
      } catch { continue }   // una rúbrica ilegible no se puede ofrecer
      entrada = {
        id: r.id!, titulo: r.titulo, niveles_json: r.niveles_json, indicadores_json: r.indicadores_json,
        contexto: r.contexto, generada_ia: r.generada_ia,
        enBanco: esDelBanco, bancoId: esDelBanco ? r.id! : null,
        usos: [], instrumentoIds: [],
        area: r.area ?? asig?.nombre_display,
        nivel: r.nivel ?? (grupo ? `${grupo.curso}º ${grupo.etapa}` : undefined),
        nIndicadores, nNiveles,
        updated_at: r.updated_at || r.created_at || '',
      }
      porFirma.set(firma, entrada)
    }
    if (ins) {
      entrada.usos.push([grupo?.nombre, asig?.nombre_display, ins.nombre].filter(Boolean).join(' · '))
      entrada.instrumentoIds.push(ins.id!)
      if ((r.updated_at || '') > entrada.updated_at) entrada.updated_at = r.updated_at || ''
    }
  }
  return [...porFirma.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

/**
 * Guarda una copia en el banco. Si ya hay una idéntica no la duplica: el
 * resultado dice cuál de las dos cosas ha pasado.
 */
export async function guardarEnBanco(
  data: Pick<Rubrica, 'titulo' | 'niveles_json' | 'indicadores_json' | 'contexto' | 'generada_ia' | 'area' | 'nivel'>
): Promise<{ id: number; yaEstaba: boolean }> {
  const firma = firmaRubrica(data)
  const delBanco = vivos(await db.rubricas.where('instrumento_id').equals(INSTRUMENTO_BANCO).toArray()).filter(esRubrica)
  const igual = delBanco.find(r => firmaRubrica(r) === firma)
  if (igual) return { id: igual.id!, yaEstaba: true }
  const reg = nuevo({ ...data, instrumento_id: INSTRUMENTO_BANCO, created_at: now() })
  await db.rubricas.add(reg)
  return { id: reg.id, yaEstaba: false }
}

/**
 * Antes de borrar instrumentos —sueltos, o con su área o su clase—, deja en el
 * banco una copia de sus rúbricas.
 *
 * Una rúbrica es trabajo del docente, no un dato del grupo: al borrar en junio
 * las clases del curso pasado se iban con ellas todas las rúbricas que no se
 * hubieran guardado aparte a mano. No duplica las que ya están en el banco, y
 * no conserva las vacías. El botón «Eliminar rúbrica» del editor no pasa por
 * aquí: ese sí es borrar la rúbrica a propósito.
 */
async function conservarRubricasEnBanco(instrumento_ids: number[]): Promise<number> {
  if (!instrumento_ids.length) return 0
  const rubricas = vivos(await db.rubricas.where('instrumento_id').anyOf(instrumento_ids).toArray()).filter(esRubrica)
  let nuevas = 0
  for (const r of rubricas) {
    let indicadores = 0
    try { indicadores = JSON.parse(r.indicadores_json).length } catch { continue }
    if (!indicadores) continue
    const ins = await db.instrumentos.get(r.instrumento_id)
    const asig = ins ? await db.asignaturas.get(ins.asignatura_id) : undefined
    const grupo = asig ? await db.grupos.get(asig.grupo_id) : undefined
    const { yaEstaba } = await guardarEnBanco({
      titulo: r.titulo, niveles_json: r.niveles_json, indicadores_json: r.indicadores_json,
      contexto: r.contexto, generada_ia: r.generada_ia,
      area: asig?.nombre_display, nivel: grupo ? `${grupo.curso}º ${grupo.etapa}` : undefined,
    })
    if (!yaEstaba) nuevas++
  }
  return nuevas
}

/** Quita la copia del banco. Las rúbricas que los instrumentos ya tienen puestas no se tocan. */
export async function eliminarDelBanco(id: number): Promise<void> {
  const r = await db.rubricas.get(id)
  if (!r || r.instrumento_id !== INSTRUMENTO_BANCO) return
  await db.rubricas.update(id, tocado({ deleted_at: sello() }))
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

// ─── DIARIO DE EVALUACIÓN ─────────────────────────────────────────────────────
//
// Varias observaciones fechadas que no se pisan. La nota del criterio se
// deriva de ellas (`db/diario.ts`) y se MATERIALIZA en `calificaciones` con
// `origen: 'diario'`, para que informes, matriz, fantasma y sync sigan
// leyendo lo de siempre. La materialización es determinista y solo escribe
// si cambia algo: cada aparato la hace por su cuenta tras sincronizar y el
// sync no debe ver ahí un cambio (sería un ping-pong sin fin).

const MOTIVO_SUSTITUIDA_POR_DIARIO = 'Nota puesta a mano, sustituida por el diario de evaluación'

export type RegistroNuevo = {
  alumno_id: number
  instrumento_id: number
  trimestre: number
  unidad_id: number
  /** Nivel 1-4. */
  valor: number
  /** Nota 0-10 y marcas cuando la observación es con rúbrica (ver `RegistroDiario`). */
  nota?: number | null
  niveles_rubrica?: Record<string, number> | null
  observacion?: string | null
  /** Criterios a los que aplica. El llamante los resuelve (`criteriosDeInstrumento`). */
  criterios: string[]
  area: DatosDeArea
  /** Por defecto ahora; el modo «sesión de hoy» pasará la fecha de la sesión. */
  fecha?: string
}

/**
 * Criterios que el instrumento evalúa según la programación: los de la unidad
 * dada o, con `unidad_id` null («Todo el curso»), los de todas las unidades
 * del trimestre. Es lo que un registro del diario reparte por defecto.
 */
export async function criteriosDeInstrumento(
  instrumento_id: number, trimestre: number, unidad_id: number | null
): Promise<string[]> {
  const filas = await filasDeInstrumentoEnTrimestre(instrumento_id, trimestre, unidad_id)
  return [...new Set(filas.map(f => f.criterio_id))].sort()
}

/** Registros vivos de un alumno con un instrumento en un trimestre, en orden cronológico. */
export async function getRegistrosDeCelda(
  alumno_id: number, instrumento_id: number, trimestre: number, unidad_id: number, criterio_id?: string
): Promise<RegistroDiario[]> {
  const regs = vivos(await db.diario
    .where('[alumno_id+instrumento_id+trimestre+unidad_id]').equals([alumno_id, instrumento_id, trimestre, unidad_id]).toArray())
  return ordenarRegistros(criterio_id ? regs.filter(r => criteriosDe(r).includes(criterio_id)) : regs)
}

/**
 * Añade un registro y vuelve a derivar la nota. Reutilizable desde el panel
 * de la casilla y desde la futura «sesión de hoy». Devuelve las notas
 * derivadas por criterio tras el alta.
 */
export async function anadirRegistro(p: RegistroNuevo): Promise<{ id: number; notas: Record<string, number | null> }> {
  if (!Number.isInteger(p.valor) || p.valor < 1 || p.valor > 4) throw new Error('El nivel del registro va de 1 a 4')
  if (!p.criterios.length) throw new Error('Un registro del diario necesita al menos un criterio')
  if (typeof p.unidad_id !== 'number') throw new Error('Un registro del diario necesita su unidad')
  if (p.nota != null && (!Number.isFinite(p.nota) || p.nota < 0 || p.nota > 10)) throw new Error('La nota de la observación va de 0 a 10')
  const reg = nuevo({
    alumno_id: p.alumno_id, instrumento_id: p.instrumento_id, trimestre: p.trimestre,
    unidad_id: p.unidad_id, fecha: p.fecha ?? now(), valor: p.valor,
    nota: p.nota ?? null, niveles_rubrica: p.niveles_rubrica ?? null,
    observacion: p.observacion ?? null,
    criterios_json: JSON.stringify([...new Set(p.criterios)]),
    ...p.area,
  })
  await db.diario.add(reg)
  const notas = await materializarDiario(p.alumno_id, p.instrumento_id, p.trimestre, p.unidad_id, { forzarSobreManual: true })
  return { id: reg.id, notas }
}

export async function editarRegistro(
  id: number, cambios: Partial<Pick<RegistroDiario, 'valor' | 'nota' | 'niveles_rubrica' | 'observacion' | 'fecha'>>
): Promise<void> {
  const r = await db.diario.get(id)
  if (!r || r.deleted_at) return
  if (cambios.valor != null && (!Number.isInteger(cambios.valor) || cambios.valor < 1 || cambios.valor > 4)) {
    throw new Error('El nivel del registro va de 1 a 4')
  }
  await db.diario.update(id, tocado(cambios))
  await materializarDiario(r.alumno_id, r.instrumento_id, r.trimestre, r.unidad_id, { forzarSobreManual: true })
}

/**
 * Una observación más con la rúbrica: la nota de la casilla pasa a ser la
 * agregación de todas (la regla del instrumento), en vez de pisar la anterior.
 *
 * Si la nota de la casilla es manual (puesta con la rúbrica en el panel o en
 * la pasada de clase, no derivada del diario), se convierte primero en una
 * observación más, con su fecha y sus marcas: si no, «hacer media» con la
 * nota vieja la perdería, que es justo lo contrario de lo que se pide. Da
 * igual que la casilla tuviera ya registros de nivel: la nota manual los
 * tapaba y ahora cuenta con ellos. Devuelve el id del registro nuevo, para
 * que la misma pantalla lo edite en vez de crear otro a cada retoque.
 */
export async function evolucionarRubrica(p: {
  alumno_id: number; instrumento_id: number; trimestre: number; unidad_id: number
  criterios: string[]; area: DatosDeArea; nota: number; niveles_rubrica: Record<string, number>
}): Promise<{ id: number; notas: Record<string, number | null>; convertida: boolean }> {
  let convertida = false
  {
    const previas = sinDuplicados(vivos(await db.calificaciones.where('instrumento_id').equals(p.instrumento_id)
      .filter(c => c.alumno_id === p.alumno_id && c.trimestre === p.trimestre && c.unidad_id === p.unidad_id && c.valor != null && c.origen !== 'diario')
      .toArray()))
    const previa = previas.find(c => c.niveles_rubrica && Object.keys(c.niveles_rubrica).length) ?? previas[0]
    if (previa) {
      await anadirRegistro({
        alumno_id: p.alumno_id, instrumento_id: p.instrumento_id, trimestre: p.trimestre,
        unidad_id: p.unidad_id, criterios: p.criterios, area: p.area,
        valor: nivelDeNota(previa.valor!), nota: previa.valor, niveles_rubrica: previa.niveles_rubrica ?? null,
        fecha: previa.fecha ?? previa.updated_at,
      })
      convertida = true
    }
  }
  const { id, notas } = await anadirRegistro({
    alumno_id: p.alumno_id, instrumento_id: p.instrumento_id, trimestre: p.trimestre,
    unidad_id: p.unidad_id, criterios: p.criterios, area: p.area,
    valor: nivelDeNota(p.nota), nota: p.nota, niveles_rubrica: p.niveles_rubrica,
  })
  if (convertida) {
    // La nota manual no se ha perdido: es la primera observación. El fantasma
    // que deja la materialización («no cuenta») mentiría, así que se retira.
    const conFantasma = vivos(await db.calificaciones.where('instrumento_id').equals(p.instrumento_id)
      .filter(c => c.alumno_id === p.alumno_id && c.trimestre === p.trimestre && c.unidad_id === p.unidad_id && c.origen === 'diario' && c.valor_anterior != null)
      .toArray())
    for (const c of conFantasma) await db.calificaciones.update(c.id!, tocado({ valor_anterior: null, anterior_motivo: null }))
  }
  return { id, notas, convertida }
}

/** Borrado lógico del registro. Si era el último, la casilla se queda sin nota. */
export async function borrarRegistro(id: number): Promise<void> {
  const r = await db.diario.get(id)
  if (!r || r.deleted_at) return
  await db.diario.update(id, tocado({ deleted_at: now() }))
  await materializarDiario(r.alumno_id, r.instrumento_id, r.trimestre, r.unidad_id, { forzarSobreManual: true })
}

/**
 * Deriva y escribe las notas de un alumno con un instrumento en un trimestre.
 *
 * Solo escribe las casillas cuyo `valor` u `origen` cambian. Una casilla con
 * nota puesta a mano se respeta salvo `forzarSobreManual` (una acción expresa
 * del docente sobre el diario): entonces la manual pasa a fantasma. Escribe
 * con `sinVinculos`: el reparto ya está en los registros.
 */
export async function materializarDiario(
  alumno_id: number, instrumento_id: number, trimestre: number, unidad_id: number,
  opciones: { forzarSobreManual?: boolean } = {}
): Promise<Record<string, number | null>> {
  const regs = await getRegistrosDeCelda(alumno_id, instrumento_id, trimestre, unidad_id)
  const instrumento = await db.instrumentos.get(instrumento_id)
  const derivadas: Map<string, NotaDerivada> = derivarNotas(regs, instrumento?.agregacion ?? 'media')

  const existentes = vivos(await db.calificaciones.where('instrumento_id').equals(instrumento_id)
    .filter(c => c.alumno_id === alumno_id && c.trimestre === trimestre && c.unidad_id === unidad_id).toArray())
  const previaDe = new Map(existentes.map(c => [c.criterio_id, c]))

  // Destinos: los que derivan nota y los que la tenían derivada y ya no (se vacían).
  const destinos = new Set<string>(derivadas.keys())
  for (const c of existentes) if (c.origen === 'diario') destinos.add(c.criterio_id)

  const ultimo = regs[regs.length - 1]
  // Las marcas de la última observación con rúbrica se enseñan en la casilla
  // (es lo que el panel y la pasada leen). Determinista: el orden es el de
  // `ordenarRegistros`, el mismo en todos los aparatos.
  const marcasUltimas = [...regs].reverse().find(r => r.niveles_rubrica && Object.keys(r.niveles_rubrica).length)?.niveles_rubrica ?? null
  const mismasMarcas = (previa: Calificacion | undefined) =>
    marcasUltimas == null || JSON.stringify(previa?.niveles_rubrica ?? null) === JSON.stringify(marcasUltimas)
  const items: CalItem[] = []
  const notas: Record<string, number | null> = {}
  for (const criterio_id of destinos) {
    const valor = derivadas.get(criterio_id)?.valor ?? null
    const previa = previaDe.get(criterio_id)
    const origen: 'diario' | null = valor == null ? null : 'diario'
    notas[criterio_id] = valor

    const esManual = !!previa && previa.origen !== 'diario' && previa.valor != null
    if (esManual && !opciones.forzarSobreManual) { notas[criterio_id] = previa.valor ?? null; continue }
    if (previa && (previa.valor ?? null) === valor && (previa.origen ?? null) === origen && mismasMarcas(previa)) continue

    const area: DatosDeArea = previa
      ? { asignatura: previa.asignatura, curso: previa.curso, etapa: previa.etapa, comunidad: previa.comunidad }
      : { asignatura: ultimo.asignatura, curso: ultimo.curso, etapa: ultimo.etapa, comunidad: ultimo.comunidad }
    const fantasma = esManual && previa!.valor !== valor
      ? { valor_anterior: previa!.valor, anterior_motivo: MOTIVO_SUSTITUIDA_POR_DIARIO }
      : {}
    items.push({
      ...area, alumno_id, instrumento_id, trimestre, unidad_id, criterio_id, valor, origen,
      ...(marcasUltimas != null && valor != null ? { niveles_rubrica: marcasUltimas } : {}),
      ...fantasma,
    })
  }
  if (items.length) await saveCalificaciones(items, { sinVinculos: true })
  return notas
}

/** Vuelve a derivar todas las casillas con diario de un instrumento (cambio de regla). */
export async function rematerializarInstrumento(instrumento_id: number): Promise<void> {
  const regs = vivos(await db.diario.where('instrumento_id').equals(instrumento_id).toArray())
  const claves = new Set(regs.map(r => `${r.alumno_id}:${r.trimestre}:${r.unidad_id}`))
  for (const k of claves) {
    const [a, t, u] = k.split(':').map(Number)
    await materializarDiario(a, instrumento_id, t, u, { forzarSobreManual: true })
  }
}

/**
 * Tras un sync: si dos aparatos calificaron la misma casilla antes de
 * sincronizar hay dos filas vivas con la misma clave. Se conserva la que
 * cuenta (`masReciente`, la misma en los dos aparatos) y las demás se marcan
 * borradas. Vale para las notas a mano y para las derivadas del diario.
 * Devuelve cuántas filas ha retirado.
 */
export async function reconciliarDuplicados(): Promise<number> {
  const porClave = new Map<string, Calificacion[]>()
  for (const c of vivos(await db.calificaciones.toArray())) {
    const k = claveCelda(c)
    porClave.set(k, [...(porClave.get(k) ?? []), c])
  }
  let retiradas = 0
  for (const lista of porClave.values()) {
    if (lista.length < 2) continue
    const queda = masReciente(lista)!
    for (const sobra of lista) {
      if (sobra.id === queda.id) continue
      await db.calificaciones.update(sobra.id!, tocado({ deleted_at: now() }))
      retiradas++
    }
  }
  return retiradas
}

/**
 * Tras un sync: vuelve a derivar todas las celdas con registros o con nota
 * derivada. Las manuales no se tocan. Antes retira las casillas duplicadas
 * (`reconciliarDuplicados`). Devuelve cuántas celdas se han revisado.
 */
export async function reconciliarDiario(): Promise<number> {
  await reconciliarDuplicados()
  const regs = vivos(await db.diario.toArray())
  const derivadasVivas = vivos(await db.calificaciones.filter(c => c.origen === 'diario').toArray())

  const claves = new Set<string>()
  for (const r of regs) claves.add(`${r.alumno_id}:${r.instrumento_id}:${r.trimestre}:${r.unidad_id}`)
  for (const c of derivadasVivas) claves.add(`${c.alumno_id}:${c.instrumento_id}:${c.trimestre}:${c.unidad_id}`)
  for (const k of claves) {
    const [a, i, tr, u] = k.split(':').map(Number)
    await materializarDiario(a, i, tr, u)
  }
  return claves.size
}

/**
 * Tras un sync con un aparato que aún no lleva la unidad en la clave: sus
 * filas llegan sin unidad y el índice compuesto no las ve. Se les asigna con
 * la misma regla que en la migración y se vuelven a sellar para que el
 * siguiente envío las devuelva ya colocadas. Devuelve cuántas ha tocado.
 */
export async function asignarUnidadesPendientes(): Promise<ResumenMigracion> {
  const [cals, regs] = await Promise.all([
    db.calificaciones.filter(c => c.unidad_id == null).toArray(),
    db.diario.filter(r => r.unidad_id == null).toArray(),
  ])
  const resumen = resumenVacio()
  if (!cals.length && !regs.length) return resumen
  const ctx = prepararContexto({
    unidades: await db.unidades.toArray(),
    instrumentos: await db.instrumentos.toArray(),
    criterio_instrumentos: await db.criterio_instrumentos.toArray(),
  })
  for (const c of cals) {
    const r = unidadParaFila({ ...c, criterios: [c.criterio_id] }, ctx)
    if (anotar(resumen, r.motivo)) await db.calificaciones.update(c.id!, tocado({ unidad_id: r.unidad_id }))
  }
  for (const d of regs) {
    const r = unidadParaFila({ ...d, criterios: criteriosDeRegistro(d) }, ctx)
    if (anotar(resumen, r.motivo)) await db.diario.update(d.id!, tocado({ unidad_id: r.unidad_id }))
  }
  return resumen
}

// Lo que llega de otro aparato puede traer registros del diario o cambiar la
// regla de un instrumento: se vuelve a derivar aquí, no en ninguna pantalla.
// Antes, lo que venga sin unidad recibe la suya.
alAplicarCambios(async () => { await asignarUnidadesPendientes(); await reconciliarDiario() })

// ─── MATRIZ DE EVALUACIÓN ─────────────────────────────────────────────────────

export type CeldaInstrumento = {
  instrumento_id: number
  nombre: string
  tipo: string
  peso: number
  tiene_rubrica: boolean
  /** Tiene una prueba escrita definida (la de la unidad que se mira o la general). */
  tiene_prueba: boolean
  /** Criterios con los que este va vinculado para este instrumento (vacío = ninguno). */
  vinculados: string[]
  /** Regla con la que el diario funde varios registros (ver `db/diario.ts`). */
  agregacion: Agregacion
  /** Familia de la que cuelga, si es un hijo; null si es familia o instrumento suelto. */
  familia_id: number | null
  familia_nombre: string | null
  /** Peso de la familia en el área (el de la propia fila si es familia). */
  familia_peso: number
  /**
   * Porcentaje de este hijo dentro de su familia, contando a TODOS sus
   * hermanos (también los que no evalúan lo que se mira); null si no es hijo.
   * Resuelto aquí una vez, como el color, para que cabecera y panel digan lo mismo.
   */
  pct_familia: number | null
  /** Color de identidad, ya resuelto (propio o por orden). */
  color: string
}

export type FamiliaConDatosEscondidos = {
  id: number
  nombre: string
  /** Notas con valor en el trimestre que se mira. */
  calificaciones: number
  /** Registros del diario en el trimestre que se mira. */
  diario: number
  /** Exámenes definidos para la familia (general o de cualquier unidad). */
  examenes: number
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
  /** `alumno:criterio:instrumento` → registros del diario (en orden cronológico) */
  diario: Record<string, { n: number; niveles: number[] }>
  /**
   * Familias que ya tienen hijos pero conservan notas, diario o exámenes
   * anotados directamente con ellas: no tienen columna donde enseñarlo. El
   * gestor lo mueve a un hijo (`moverDatosDeFamiliaAHijo`); la matriz avisa.
   */
  familiasConDatosEscondidos: FamiliaConDatosEscondidos[]
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
  const delosInstrumentos = vivos(await db.rubricas.where('instrumento_id').anyOf(instrumentos.map(i => i.id!)).toArray())
  const conRubrica = new Set(delosInstrumentos.filter(esRubrica).map(r => r.instrumento_id))
  // Con examen definido para lo que se está viendo: el de la unidad o el general.
  const conPrueba = new Set(delosInstrumentos
    .filter(r => r.tipo === 'prueba' && (r.unidad_id == null || r.unidad_id === unidad_id))
    .map(r => r.instrumento_id))

  const crudo = unidad_id
    ? await getMapaCriterioInstrumento(unidad_id)
    : await getMapaCriterioInstrumentoAsignatura(asignatura_id)

  // Los vínculos se calculan como al guardar: dentro de la unidad que se
  // mira. En «Todo el curso» se enseñan los de todas las del trimestre.
  const filasVinculo = new Map<number, CriterioInstrumento[]>()
  for (const ins of instrumentos) {
    if (!aplicaEnTrimestre(ins.trimestres, trimestre)) continue
    const filas = await filasDeInstrumentoEnTrimestre(ins.id!, trimestre, unidad_id)
    if (filas.some(f => f.vinculado)) filasVinculo.set(ins.id!, filas)
  }

  // Color de cada instrumento: el suyo, o por orden entre sus iguales (las
  // familias entre sí; los hijos dentro de su familia).
  const colorPorId = new Map<number, string>()
  {
    const familias = instrumentos.filter(i => i.familia_id == null || !instrById.has(i.familia_id))
    familias.forEach((f, k) => colorPorId.set(f.id!, colorDeInstrumento(f, k)))
    for (const f of familias) {
      instrumentos.filter(i => i.familia_id === f.id).forEach((h, k) => colorPorId.set(h.id!, colorDeInstrumento(h, k)))
    }
  }

  // Porcentaje de cada hijo dentro de su familia, con todos los hermanos.
  const pctPorId = new Map<number, number>()
  for (const familiaId of new Set(instrumentos.filter(i => i.familia_id != null).map(i => i.familia_id!))) {
    const hermanos = instrumentos.filter(i => i.familia_id === familiaId)
    porcentajesEnFamilia(hermanos.map(h => h.peso)).forEach((v, k) => pctPorId.set(hermanos[k].id!, v))
  }

  const porCriterio = new Map<string, CeldaInstrumento[]>()
  const criteriosFueraDeTrimestre = new Set<string>()
  for (const [criterio, lista] of crudo) {
    const celdas: CeldaInstrumento[] = []
    let habiaAlguno = false
    for (const item of lista) {
      const ins = instrById.get(item.instrumento_id)
      if (!ins) continue   // instrumento borrado: se ignora, la nota histórica se conserva
      habiaAlguno = true
      // Un hijo entra con su familia a cuestas: las pantallas agrupan por ella.
      const familia = ins.familia_id != null ? instrById.get(ins.familia_id) ?? null : null
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
        tiene_prueba: conPrueba.has(ins.id!),
        vinculados: filasVinculo.has(ins.id!) ? criteriosVinculados(filasVinculo.get(ins.id!)!, criterio) : [],
        agregacion: ins.agregacion ?? 'media',
        familia_id: familia?.id ?? null,
        familia_nombre: familia?.nombre ?? null,
        familia_peso: familia ? familia.peso : ins.peso,
        pct_familia: familia ? pctPorId.get(ins.id!) ?? null : null,
        color: colorPorId.get(ins.id!) ?? colorDeInstrumento(ins, 0),
      })
    }
    // Si algún hijo evalúa este criterio, la familia deja de ser una opción
    // directa aquí: se califica con el hijo y la familia resume.
    const conHijo = new Set(celdas.map(c => c.familia_id).filter((f): f is number => f != null))
    const utiles = celdas.filter(c => !conHijo.has(c.instrumento_id))
    if (utiles.length) porCriterio.set(criterio, utiles)
    else if (habiaAlguno) criteriosFueraDeTrimestre.add(criterio)
  }

  const instrIds = instrumentos.map(i => i.id!)
  // En una unidad, solo sus notas. En «Todo el curso», las de todas las
  // unidades del trimestre, fundidas por casilla (`fundirUnidades`).
  const crudas = instrIds.length
    ? sinDuplicados(vivos(await db.calificaciones.where('instrumento_id').anyOf(instrIds)
        .filter(c => c.trimestre === trimestre && (unidad_id == null || c.unidad_id === unidad_id)).toArray()))
    : []
  const cals = unidad_id == null ? fundirUnidades(crudas) : crudas
  // Las notas de los hijos se funden en la de su familia, con la misma
  // función que el cálculo del área: la casilla enseña el mismo número que el
  // boletín. Las de los hijos siguen disponibles por su propia clave.
  const calificaciones: Record<string, Calificacion> = {}
  for (const c of cals) {
    calificaciones[`${c.alumno_id}:${c.criterio_id}:${c.instrumento_id}:${c.trimestre}`] = c
  }
  for (const c of fundirHijosEnFamilias(cals, instrumentos)) {
    if (c.virtual) calificaciones[`${c.alumno_id}:${c.criterio_id}:${c.instrumento_id}:${c.trimestre}`] = c
  }

  const evidencias = await getEvidenciasPorCriterio(alumnos.map(a => a.id!))

  const diario: MatrizEvaluacion['diario'] = {}
  const regs = instrIds.length
    ? ordenarRegistros(vivos(await db.diario.where('instrumento_id').anyOf(instrIds)
        .filter(r => r.trimestre === trimestre && (unidad_id == null || r.unidad_id === unidad_id)).toArray()))
    : []
  for (const r of regs) {
    for (const c of criteriosDe(r)) {
      const k = `${r.alumno_id}:${c}:${r.instrumento_id}`
      const d = diario[k] ?? (diario[k] = { n: 0, niveles: [] })
      d.n++
      d.niveles.push(r.valor)
    }
  }

  // Familias con hijos que aún guardan cosas a su nombre: nada de lo cargado
  // arriba las pinta, así que se cuentan aquí para que la pantalla avise.
  const familiasConDatosEscondidos: FamiliaConDatosEscondidos[] = []
  for (const fam of instrumentos.filter(i => i.familia_id == null)) {
    if (!instrumentos.some(i => i.familia_id === fam.id)) continue
    const fila = {
      id: fam.id!, nombre: fam.nombre,
      calificaciones: cals.filter(c => c.instrumento_id === fam.id && c.valor != null).length,
      diario: regs.filter(r => r.instrumento_id === fam.id).length,
      examenes: delosInstrumentos.filter(r => r.tipo === 'prueba' && r.instrumento_id === fam.id).length,
    }
    if (fila.calificaciones + fila.diario + fila.examenes > 0) familiasConDatosEscondidos.push(fila)
  }

  let criteriosDeUnidad: Set<string> | null = null
  if (unidad_id) {
    const ucs = vivos(await db.unidad_criterios.where('unidad_id').equals(unidad_id).toArray())
    criteriosDeUnidad = new Set(ucs.map(uc => uc.criterio_id))
  }

  return {
    grupo, asig, alumnos, instrumentos, porCriterio,
    criteriosFueraDeTrimestre, calificaciones, evidencias, diario, criteriosDeUnidad,
    familiasConDatosEscondidos,
  }
}

/**
 * Todo lo que enseña la pestaña «Todo el curso»: los tres trimestres a la vez.
 *
 * `porTrimestre` son las tres matrices del área (la de siempre, con las
 * notas de todas las unidades fundidas por casilla), para que la vista por
 * familia lea las mismas notas virtuales que las pestañas de unidad. `notas`
 * es el cálculo del boletín (`calcularNotaArea`) por alumno: la vista por
 * criterio enseña `criterios[].trimestres` y `criterios[].final` tal cual.
 */
export type ResumenCurso = {
  grupo: Grupo
  asig: Asignatura
  alumnos: Alumno[]
  instrumentos: Instrumento[]
  /** trimestre (1, 2, 3) → matriz de ese trimestre con `unidad_id` null */
  porTrimestre: Record<number, MatrizEvaluacion>
  /** alumno_id → notas del área, con los tres trimestres y la final */
  notas: Map<number, NotaArea>
  unidades: UnidadConCriterios[]
}

export async function getResumenCurso(asignatura_id: number): Promise<ResumenCurso | null> {
  const [m1, m2, m3] = await Promise.all([1, 2, 3].map(t => getMatrizEvaluacion(asignatura_id, null, t)))
  if (!m1 || !m2 || !m3) return null
  const unidades = await getUnidades(asignatura_id)
  const pesosCriterio = pesosCriterioDeUnidades(unidades)
  const pesosVinculo = pesosVinculoDeUnidades(unidades)

  // Las notas de toda el área, de todos los trimestres, repartidas por alumno.
  const instrIds = m1.instrumentos.map(i => i.id!)
  const todas = instrIds.length
    ? sinDuplicados(vivos(await db.calificaciones.where('instrumento_id').anyOf(instrIds).toArray()))
    : []
  const porAlumno = new Map<number, Calificacion[]>()
  for (const c of todas) porAlumno.set(c.alumno_id, [...(porAlumno.get(c.alumno_id) ?? []), c])

  const notas = new Map<number, NotaArea>()
  for (const al of m1.alumnos) {
    notas.set(al.id!, calcularNotaArea(asignatura_id, porAlumno.get(al.id!) ?? [], m1.instrumentos,
      m1.asig.pesos_trimestres, pesosCriterio, pesosVinculo, normalizarReglaFinal(m1.asig.regla_final)))
  }
  return {
    grupo: m1.grupo, asig: m1.asig, alumnos: m1.alumnos, instrumentos: m1.instrumentos,
    porTrimestre: { 1: m1, 2: m2, 3: m3 }, notas, unidades,
  }
}

/**
 * Id más alto que existe en este dispositivo, en cualquier tabla de aula.
 *
 * Lo usa `asegurarContador` al arrancar: `nuevoId()` guarda su contador en
 * localStorage, que se puede borrar sin que se borre IndexedDB, y entonces
 * volvería a repartir ids ya usados.
 */
export async function maxIdLocal(): Promise<number> {
  let max = 0
  for (const tabla of TABLAS_SINC) {
    const ultimo = await db.table(tabla).orderBy('id').last()
    if (ultimo?.id != null && ultimo.id > max) max = ultimo.id
  }
  return max
}

// ─── ESTADO DE CONFIGURACIÓN (asistente de primeros pasos) ────────────────────

export type PasoEstado = {
  grupos: number
  alumnos: number
  asignaturas: number
  unidades: number
  criteriosVinculados: number
  criteriosConInstrumento: number
  /** Criterios repartidos en la programación a los que aún no se les dijo con
   *  qué se evalúan: son los que saldrían rayados en el calificador. */
  criteriosSinInstrumento: number
  instrumentos: number
  calificaciones: number
  /** Clase a la que se refiere todo lo anterior */
  grupoPrincipalId: number | null
  asignaturaPrincipalId: number | null
}

/**
 * Cómo de configurada está una clase. Sin argumento mira la primera; con él,
 * la que se le pida — el Inicio pregunta siempre por la clase activa, que no
 * tiene por qué ser la primera de la lista.
 *
 * Todos los recuentos van acotados a esa clase. Antes las unidades, los
 * criterios y las calificaciones se contaban de todas a la vez, así que una
 * clase recién creada aparecía como ya configurada si otra lo estaba.
 */
export async function getEstadoConfiguracion(grupoPedido?: number | null): Promise<PasoEstado> {
  const grupos = vivos(await db.grupos.toArray())
  const grupoPrincipalId = (grupoPedido != null && grupos.some(g => g.id === grupoPedido))
    ? grupoPedido
    : grupos[0]?.id ?? null

  const asigDeGrupo = grupoPrincipalId
    ? vivos(await db.asignaturas.toArray()).filter(a => a.grupo_id === grupoPrincipalId)
    : []
  const idsAsig = new Set(asigDeGrupo.map(a => a.id!))

  const alumnos = grupoPrincipalId ? (await getAlumnosByGrupo(grupoPrincipalId)).length : 0

  const unidades = vivos(await db.unidades.toArray()).filter(u => idsAsig.has(u.asignatura_id))
  const idsUnidad = new Set(unidades.map(u => u.id!))

  const ucs = vivos(await db.unidad_criterios.toArray()).filter(uc => idsUnidad.has(uc.unidad_id))
  const cis = vivos(await db.criterio_instrumentos.toArray()).filter(ci => idsUnidad.has(ci.unidad_id))
  const instrumentos = vivos(await db.instrumentos.toArray()).filter(i => idsAsig.has(i.asignatura_id))
  const idsInstr = new Set(instrumentos.map(i => i.id!))
  const calificaciones = vivos(await db.calificaciones.toArray())
    .filter(c => c.valor != null && idsInstr.has(c.instrumento_id))

  const conInstrumento = new Set(cis.map(c => `${c.unidad_id}:${c.criterio_id}`))
  const repartidos = new Set(ucs.map(uc => `${uc.unidad_id}:${uc.criterio_id}`))

  return {
    grupos: grupos.length,
    alumnos,
    asignaturas: asigDeGrupo.length,
    unidades: unidades.length,
    criteriosVinculados: ucs.length,
    criteriosConInstrumento: conInstrumento.size,
    criteriosSinInstrumento: [...repartidos].filter(k => !conInstrumento.has(k)).length,
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

/**
 * Copia de seguridad completa. `base` es la de la app salvo en la puerta de
 * migración, que exporta desde la base ANTIGUA antes de dejar que se
 * actualice: por eso la versión del fichero es la del esquema que se abre.
 */
export async function exportarDatos(base: MiClaseDB = db): Promise<string> {
  // Una base antigua no tiene todas las tablas (rúbricas desde la v2,
  // evidencias desde la v3, criterio_instrumentos desde la v4, diario desde
  // la v6): las que no existen salen vacías en vez de reventar la copia.
  const leer = <T,>(nombre: string): Promise<T[]> =>
    base.tables.some(t => t.name === nombre) ? base.table(nombre).toArray() : Promise.resolve([])
  const [grupos, alumnos, grupo_alumnos, asignaturas, instrumentos,
         calificaciones, sesiones, asistencia, unidades, unidad_criterios,
         criterio_instrumentos, rubricas, evidencias, planos, asientos, diario] = await Promise.all([
    leer<Grupo>('grupos'),
    leer<Alumno>('alumnos'),
    leer<GrupoAlumno>('grupo_alumnos'),
    leer<Asignatura>('asignaturas'),
    leer<Instrumento>('instrumentos'),
    leer<Calificacion>('calificaciones'),
    leer<Sesion>('sesiones'),
    leer<AsistenciaRec>('asistencia'),
    leer<Unidad>('unidades'),
    leer<UnidadCriterio>('unidad_criterios'),
    leer<CriterioInstrumento>('criterio_instrumentos'),
    leer<Rubrica>('rubricas'),
    leer<Evidencia>('evidencias'),
    leer<Plano>('planos'),
    leer<Asiento>('asientos'),
    leer<RegistroDiario>('diario'),
  ])

  // Serializar los blobs de evidencias a base64
  const evidenciasSerial = await Promise.all(evidencias.map(async ev => {
    const { blob, ...rest } = ev
    return { ...rest, blob_b64: await blobABase64(blob) }
  }))

  return JSON.stringify({
    // La versión del backup sigue a la del esquema Dexie que se ha abierto.
    version: Math.round(base.verno),
    exported_at: now(),
    grupos, alumnos, grupo_alumnos, asignaturas, instrumentos,
    calificaciones, sesiones, asistencia, unidades, unidad_criterios,
    criterio_instrumentos, rubricas,
    evidencias: evidenciasSerial, planos, asientos, diario,
  }, null, 2)
}

export async function importarDatos(json: string): Promise<void> {
  const data = JSON.parse(json)
  if (!Number.isInteger(data.version) || data.version < 1 || data.version > VERSION_ESQUEMA) {
    throw new Error('Versión de backup no compatible')
  }

  // Las copias anteriores a la v7 (y las filas sueltas que vinieran sin
  // unidad) reciben la suya con la misma regla que la migración: si no, no
  // entrarían en el índice y ninguna pestaña de unidad las enseñaría.
  const colocadas = asignarUnidades(data.calificaciones || [], data.diario || [], {
    unidades: data.unidades || [], instrumentos: data.instrumentos || [],
    criterio_instrumentos: data.criterio_instrumentos || [],
  })
  data.calificaciones = colocadas.calificaciones
  data.diario = colocadas.diario

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
     db.criterio_instrumentos, db.rubricas, db.evidencias, db.planos, db.asientos, db.diario,
     // La restauración también toca el estado de sincronización: ver abajo.
     db.sync_base, db.meta],
    async () => {
      await Promise.all([
        db.grupos.clear(), db.alumnos.clear(), db.grupo_alumnos.clear(),
        db.asignaturas.clear(), db.instrumentos.clear(), db.calificaciones.clear(),
        db.sesiones.clear(), db.asistencia.clear(), db.unidades.clear(),
        db.unidad_criterios.clear(), db.criterio_instrumentos.clear(), db.rubricas.clear(),
        db.evidencias.clear(), db.planos.clear(), db.asientos.clear(), db.diario.clear(),
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
      await db.diario.bulkAdd(sellar(data.diario || []))

      // Los ids siguen existiendo pero su contenido es otro. Si no se
      // reinicia, la base de fusión apunta a versiones que ya no tienen nada
      // que ver y el merge a tres bandas calcula diferencias falsas; y el
      // cursor de envío se queda en el sello anterior, con lo que lo
      // restaurado —más antiguo— no se sube nunca.
      await reiniciarEstadoDeSincronizacion()
    }
  )
}
