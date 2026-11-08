/**
 * Seguimiento de tutorías: tipos, modelos de serie y reglas puras.
 *
 * Aquí no se toca la base: crear y guardar va por `queries.ts` (que asigna
 * id y sello con `nuevo()`), y lo que se pinta o se imprime sale de estas
 * funciones para que la pantalla, la ficha del alumno y el acta digan lo
 * mismo. Se prueba en `pruebas/tutorias.test.ts`.
 */
import type {
  Tutoria, ModeloTutoria, TipoTutoria, ModalidadTutoria, EstadoAcuerdo,
  ApartadoTutoria, AcuerdoTutoria, AsistenteTutoria, PuntoOrdenDia,
} from './localDb'

export type {
  Tutoria, ModeloTutoria, TipoTutoria, ModalidadTutoria, EstadoAcuerdo,
  ApartadoTutoria, AcuerdoTutoria, AsistenteTutoria, PuntoOrdenDia,
}

export const TIPOS_TUTORIA: { valor: TipoTutoria; nombre: string; corto: string }[] = [
  { valor: 'familia', nombre: 'Con la familia', corto: 'Familia' },
  { valor: 'alumno', nombre: 'Con el alumno o la alumna', corto: 'Alumno' },
  { valor: 'equipo', nombre: 'Con el equipo docente u orientación', corto: 'Equipo' },
  { valor: 'grupo', nombre: 'De grupo (toda la clase)', corto: 'Grupo' },
]

export const MODALIDADES: { valor: ModalidadTutoria; nombre: string }[] = [
  { valor: 'presencial', nombre: 'Presencial' },
  { valor: 'telefono', nombre: 'Por teléfono' },
  { valor: 'videollamada', nombre: 'Por videollamada' },
]

/** Sugerencias para el rol del asistente; se puede escribir cualquier otro. */
export const ROLES_ASISTENTE = [
  'Madre', 'Padre', 'Tutor/a legal', 'Alumno/a', 'Tutor/a', 'Orientador/a',
  'Profesor/a', 'PT', 'AL', 'Jefatura de estudios', 'Dirección', 'Otro familiar',
]

export const ESTADOS_ACUERDO: { valor: EstadoAcuerdo; nombre: string }[] = [
  { valor: 'pendiente', nombre: 'Pendiente' },
  { valor: 'cumplido', nombre: 'Cumplido' },
  { valor: 'no_cumplido', nombre: 'No cumplido' },
]

export const nombreTipo = (t: TipoTutoria) => TIPOS_TUTORIA.find(x => x.valor === t)?.nombre ?? t
export const nombreModalidad = (m: ModalidadTutoria) => MODALIDADES.find(x => x.valor === m)?.nombre ?? m
export const nombreEstado = (e: EstadoAcuerdo) => ESTADOS_ACUERDO.find(x => x.valor === e)?.nombre ?? e

/** Un modelo listo para elegir: de serie (en el código) o propio (en la tabla). */
export type ModeloElegible = Omit<ModeloTutoria, 'id' | 'updated_at' | 'deleted_at' | 'created_at'> & {
  /** 'serie:<nombre>' o 'propio:<id>'. */
  clave: string
  serie: boolean
  id?: number
}

const ap = (clave: string, titulo: string, texto = ''): ApartadoTutoria => ({ clave, titulo, texto })

/**
 * Los tres modelos que trae la app. Viven aquí y no en la tabla: si cada
 * aparato los sembrara, al sincronizar habría tres copias de cada uno. Para
 * cambiarlos, el docente los duplica y edita su copia.
 */
export const MODELOS_DE_SERIE: ModeloElegible[] = [
  {
    clave: 'serie:familia', serie: true,
    nombre: 'Tutoría con la familia', tipo: 'familia', modalidad: 'presencial',
    orden_dia: [
      'Evolución académica',
      'Convivencia y relación con los compañeros',
      'Hábitos de estudio y trabajo en casa',
      'Ruegos y preguntas de la familia',
    ],
    apartados: [
      ap('motivo', 'Motivo de la tutoría'),
      ap('temas', 'Temas tratados'),
      ap('familia', 'Aportaciones de la familia'),
      ap('observaciones', 'Observaciones'),
    ],
    con_seguimiento: true,
  },
  {
    clave: 'serie:inicial', serie: true,
    nombre: 'Entrevista inicial', tipo: 'familia', modalidad: 'presencial',
    orden_dia: [
      'Presentación del tutor o tutora y del curso',
      'Datos de contacto y horario de tutorías',
      'Salud, alergias o necesidades que el centro deba conocer',
      'Intereses, fortalezas y dificultades del alumno o alumna',
      'Expectativas de la familia',
    ],
    apartados: [
      ap('contexto', 'Contexto familiar relevante para el aula',
        'Solo lo necesario para atender al alumno o alumna en clase.'),
      ap('trayectoria', 'Trayectoria escolar anterior'),
      ap('temas', 'Temas tratados'),
      ap('expectativas', 'Expectativas y compromisos'),
    ],
    con_seguimiento: false,
  },
  {
    clave: 'serie:seguimiento', serie: true,
    nombre: 'Seguimiento de acuerdos', tipo: 'familia', modalidad: 'presencial',
    orden_dia: [
      'Revisión de los acuerdos de la tutoría anterior',
      'Evolución desde la última reunión',
      'Nuevos acuerdos',
    ],
    apartados: [
      ap('evolucion', 'Evolución desde la última tutoría'),
      ap('temas', 'Temas tratados'),
    ],
    con_seguimiento: true,
  },
]

/** Sin modelo: lo mínimo que pide toda tutoría. */
export const MODELO_EN_BLANCO: ModeloElegible = {
  clave: 'serie:blanco', serie: true,
  nombre: 'En blanco', tipo: 'familia', modalidad: 'presencial',
  orden_dia: [], apartados: [ap('temas', 'Temas tratados')], con_seguimiento: false,
}

/** De serie primero, luego los del docente por nombre. */
export function modelosElegibles(propios: ModeloTutoria[]): ModeloElegible[] {
  const suyos = propios
    .filter(m => !m.deleted_at)
    .map(m => ({ ...normalizarModelo(m), clave: `propio:${m.id}`, serie: false, id: m.id }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return [...MODELOS_DE_SERIE, ...suyos, MODELO_EN_BLANCO]
}

/** Completa lo que falte a un modelo leído de la base (o de otro aparato más viejo). */
export function normalizarModelo<T extends Partial<ModeloTutoria>>(m: T): T & Pick<ModeloTutoria, 'nombre' | 'tipo' | 'modalidad' | 'apartados' | 'orden_dia' | 'con_seguimiento'> {
  return {
    ...m,
    nombre: (m.nombre ?? '').trim() || 'Modelo sin nombre',
    tipo: esTipo(m.tipo) ? m.tipo : 'familia',
    modalidad: esModalidad(m.modalidad) ? m.modalidad : 'presencial',
    apartados: (Array.isArray(m.apartados) ? m.apartados : [])
      .filter(a => a && typeof a.titulo === 'string' && a.titulo.trim())
      .map((a, i) => ({ clave: a.clave || `ap${i + 1}`, titulo: a.titulo, texto: a.texto ?? '' })),
    orden_dia: (Array.isArray(m.orden_dia) ? m.orden_dia : []).filter(x => typeof x === 'string' && x.trim()),
    con_seguimiento: m.con_seguimiento === true,
  }
}

/** Claves únicas para apartados nuevos dentro de un modelo. */
export function claveNueva(existentes: string[], base = 'ap'): string {
  let i = existentes.length + 1
  while (existentes.includes(`${base}${i}`)) i++
  return `${base}${i}`
}

const esTipo = (t: unknown): t is TipoTutoria => TIPOS_TUTORIA.some(x => x.valor === t)
const esModalidad = (m: unknown): m is ModalidadTutoria => MODALIDADES.some(x => x.valor === m)

/** 'AAAA-MM-DDTHH:mm' en hora local. */
export function fechaLocal(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 'AAAA-MM-DD' en hora local. */
export const diaLocal = (d: Date = new Date()) => fechaLocal(d).slice(0, 10)

/**
 * Borrador de tutoría a partir de un modelo. Los apartados se COPIAN: el
 * acta guarda lo que se escribió, aunque el modelo cambie mañana.
 */
export function tutoriaDesdeModelo(
  modelo: ModeloElegible,
  datos: { grupo_id: number; alumnos?: number[]; fecha?: string },
): Omit<Tutoria, 'id' | 'updated_at' | 'deleted_at' | 'created_at'> {
  const m = normalizarModelo(modelo)
  const tipo = m.tipo
  return {
    grupo_id: datos.grupo_id,
    fecha: datos.fecha ?? fechaLocal(),
    tipo,
    modalidad: m.modalidad,
    alumnos: tipo === 'grupo' ? [] : [...(datos.alumnos ?? [])],
    asistentes: [],
    modelo_clave: modelo.clave,
    modelo_nombre: modelo.nombre,
    orden_dia: m.orden_dia.map(texto => ({ texto, tratado: false })),
    apartados: m.apartados.map(a => ({ ...a })),
    acuerdos: [],
    proxima_cita: null,
    proxima_cita_nota: null,
    con_seguimiento: m.con_seguimiento,
    revisados: [],
  }
}

/** Convierte una tutoría ya escrita en modelo (sin alumnado ni textos propios del caso). */
export function modeloDesdeTutoria(t: Pick<Tutoria, 'tipo' | 'modalidad' | 'apartados' | 'orden_dia'>, nombre: string): Omit<ModeloTutoria, 'id'> {
  return {
    nombre, tipo: t.tipo, modalidad: t.modalidad,
    apartados: t.apartados.map(a => ({ clave: a.clave, titulo: a.titulo, texto: '' })),
    orden_dia: t.orden_dia.map(p => p.texto),
    con_seguimiento: true,
  }
}

/**
 * Deja una tutoría lista para guardar: sin asistentes ni acuerdos vacíos,
 * sin alumnos repetidos, con clave en cada acuerdo y sin alumnado en una de
 * grupo si así se marcó.
 */
export function normalizarTutoria<T extends Partial<Tutoria>>(t: T): T & Pick<Tutoria, 'tipo' | 'modalidad' | 'alumnos' | 'asistentes' | 'orden_dia' | 'apartados' | 'acuerdos'> & { revisados: NonNullable<Tutoria['revisados']> } {
  const acuerdos = (Array.isArray(t.acuerdos) ? t.acuerdos : []).filter(a => a && (a.texto ?? '').trim())
  const claves = new Set<string>()
  return {
    ...t,
    tipo: esTipo(t.tipo) ? t.tipo : 'familia',
    modalidad: esModalidad(t.modalidad) ? t.modalidad : 'presencial',
    alumnos: [...new Set((Array.isArray(t.alumnos) ? t.alumnos : []).filter(n => Number.isFinite(n)))],
    asistentes: (Array.isArray(t.asistentes) ? t.asistentes : [])
      .map(a => ({ nombre: (a?.nombre ?? '').trim(), rol: (a?.rol ?? '').trim() }))
      .filter(a => a.nombre || a.rol),
    orden_dia: (Array.isArray(t.orden_dia) ? t.orden_dia : [])
      .map(p => ({ texto: (p?.texto ?? '').trim(), tratado: p?.tratado === true }))
      .filter(p => p.texto),
    apartados: (Array.isArray(t.apartados) ? t.apartados : []).map((a, i) => ({
      clave: a.clave || `ap${i + 1}`, titulo: (a.titulo ?? '').trim() || 'Apartado', texto: a.texto ?? '',
    })),
    revisados: (Array.isArray(t.revisados) ? t.revisados : [])
      .filter((r, i, l) => r && Number.isFinite(r.tutoria_id) && r.clave
        && l.findIndex(o => o.tutoria_id === r.tutoria_id && o.clave === r.clave) === i),
    acuerdos: acuerdos.map((a, i) => {
      let clave = a.clave || `a${i + 1}`
      while (claves.has(clave)) clave += 'x'
      claves.add(clave)
      const estado: EstadoAcuerdo = ESTADOS_ACUERDO.some(e => e.valor === a.estado) ? a.estado : 'pendiente'
      return {
        clave, texto: a.texto.trim(), responsable: (a.responsable ?? '').trim(),
        fecha_prevista: a.fecha_prevista || null, estado,
        fecha_revision: estado === 'pendiente' ? null : (a.fecha_revision || null),
        nota_revision: (a.nota_revision ?? '').trim() || null,
      }
    }),
  }
}

/** Un acuerdo pendiente con la tutoría de la que sale, para listarlo fuera de ella. */
export type AcuerdoPendiente = {
  tutoria_id: number
  fecha_tutoria: string
  alumnos: number[]
  acuerdo: AcuerdoTutoria
  /** La fecha prevista ya pasó. */
  vencido: boolean
}

/**
 * Los acuerdos sin revisar de unas tutorías, los vencidos primero y después
 * por fecha prevista (los que no tienen fecha, al final). Con `alumnos`, solo
 * los de tutorías que nombran a alguno de ellos.
 */
export function acuerdosPendientes(
  tutorias: Tutoria[], hoy: string = diaLocal(), alumnos?: number[],
): AcuerdoPendiente[] {
  const filtro = alumnos?.length ? new Set(alumnos) : null
  const lista: AcuerdoPendiente[] = []
  for (const t of tutorias) {
    if (t.deleted_at || t.id == null) continue
    if (filtro && !(t.alumnos ?? []).some(a => filtro.has(a))) continue
    for (const a of t.acuerdos ?? []) {
      if (a.estado !== 'pendiente') continue
      const vencido = !!a.fecha_prevista && a.fecha_prevista < hoy
      lista.push({ tutoria_id: t.id, fecha_tutoria: t.fecha, alumnos: t.alumnos ?? [], acuerdo: a, vencido })
    }
  }
  return lista.sort((x, y) =>
    Number(y.vencido) - Number(x.vencido)
    || (x.acuerdo.fecha_prevista || '9999').localeCompare(y.acuerdo.fecha_prevista || '9999')
    || x.fecha_tutoria.localeCompare(y.fecha_tutoria))
}

export type FiltroTutorias = {
  alumno_id?: number | null
  tipo?: TipoTutoria | null
  /** 'AAAA-MM-DD', incluido. */
  desde?: string | null
  /** 'AAAA-MM-DD', incluido. */
  hasta?: string | null
  /** Solo las que tienen algún acuerdo pendiente. */
  conPendientes?: boolean
}

/** Las tutorías vivas que cumplen el filtro, de la más reciente a la más antigua. */
export function filtrarTutorias(tutorias: Tutoria[], f: FiltroTutorias = {}): Tutoria[] {
  return tutorias
    .filter(t => !t.deleted_at)
    .filter(t => f.alumno_id == null || (t.alumnos ?? []).includes(f.alumno_id))
    .filter(t => !f.tipo || t.tipo === f.tipo)
    .filter(t => !f.desde || t.fecha.slice(0, 10) >= f.desde)
    .filter(t => !f.hasta || t.fecha.slice(0, 10) <= f.hasta)
    .filter(t => !f.conPendientes || (t.acuerdos ?? []).some(a => a.estado === 'pendiente'))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.id ?? 0) - (a.id ?? 0))
}

/** Cambia un acuerdo dentro de la lista de su tutoría (copia; no muta). */
export function conAcuerdoCambiado(
  acuerdos: AcuerdoTutoria[], clave: string, cambio: Partial<AcuerdoTutoria>, hoy: string = diaLocal(),
): AcuerdoTutoria[] {
  return acuerdos.map(a => {
    if (a.clave !== clave) return a
    const nuevo = { ...a, ...cambio }
    if (cambio.estado && cambio.estado !== 'pendiente' && !nuevo.fecha_revision) nuevo.fecha_revision = hoy
    if (nuevo.estado === 'pendiente') nuevo.fecha_revision = null
    return nuevo
  })
}

/** Las próximas citas previstas a partir de hoy, la más cercana primero. */
export function proximasCitas(tutorias: Tutoria[], ahora: string = fechaLocal()): Tutoria[] {
  return tutorias
    .filter(t => !t.deleted_at && t.proxima_cita && t.proxima_cita >= ahora.slice(0, 10))
    .sort((a, b) => (a.proxima_cita ?? '').localeCompare(b.proxima_cita ?? ''))
}

/** «12/11/2026 · 16:30», o solo el día si no hay hora. */
export function fechaLegible(f: string | null | undefined): string {
  if (!f) return ''
  const [d, h] = f.split('T')
  const [a, m, dia] = d.split('-')
  if (!a || !m || !dia) return f
  return `${dia}/${m}/${a}${h ? ` · ${h.slice(0, 5)}` : ''}`
}
