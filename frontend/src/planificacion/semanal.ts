/**
 * Lector de la programación semanal en Markdown → sesiones planificadas.
 *
 * Puro: ni base de datos ni pantalla. Lo que casa con la clase (área,
 * unidad, criterios) lo decide `casar.ts`; aquí solo se lee el texto.
 *
 * El formato es el de Luis (`pruebas/fixtures/planificacion_semanal_6A.md`):
 *
 * - Cabecera «# Programación semanal · 6º A de Primaria» y la línea
 *   «Semana del 9 al 13 de noviembre de 2026».
 * - «Vista rápida»: una tabla con una fila por franja («1ª 9:00-9:50») y una
 *   columna por día («Lunes 9»). Cada celda: «**Área** · UD3 · título», a
 *   veces «Especialista» o «Actividad de centro», y ■ si hay algo evaluable.
 * - «Detalle por sesión»: «### Lunes, 9 de noviembre», y por bloque
 *   «**9:00-10:40 · LENGUA CASTELLANA (dos sesiones)**», la línea de unidad,
 *   OBJETIVO, SECUENCIA (viñetas «**Inicio (15 min):**»), RECURSOS y
 *   EVALUACIÓN FORMATIVA con «Anclaje: LCL CA6.5…».
 * - Notas de día en cursiva («*Magosto: …*»).
 *
 * Mezcla castellano y gallego: los rótulos se reconocen en las dos lenguas.
 * Un bloque de detalle que cubre varias franjas de la tabla se copia en cada
 * una (cada franja conserva su título y su ■); un bloque sin franja en la
 * tabla, o un fichero sin tabla, da sesiones con la hora del bloque.
 */
import type { FaseSecuencia, TipoSesionPlan } from '../db/localDb'

export interface SesionLeida {
  fecha: string
  franja: string | null
  hora_inicio: string
  hora_fin: string
  area: string
  /** «UD3», o null si la sesión no es de una unidad numerada. */
  unidad: string | null
  /** «El poder de las palabras» (o «Reto: un parque inclusivo»). */
  unidad_titulo: string | null
  titulo: string
  tipo: TipoSesionPlan
  evaluable: boolean
  objetivo: string
  secuencia: FaseSecuencia[]
  recursos: string
  evaluacion: string
  /** Lo que sigue a «Anclaje:», tal cual. */
  anclaje: string
  /** Códigos de criterio tal como vienen: «CA6.5». */
  criterios: string[]
  /** Sigla de área delante de los códigos («LCL»), si la hay. */
  sigla_criterios: string | null
  /** «9:00-10:40» si la sesión es parte de un bloque de varias franjas. */
  bloque: string | null
}

export interface NotaDia {
  fecha: string
  texto: string
}

export interface SemanaLeida {
  /** «6º A de Primaria». */
  clase: string | null
  /** «Semana del 9 al 13 de noviembre de 2026». */
  titulo_semana: string | null
  /** Primer y último día de la semana (YYYY-MM-DD). */
  desde: string | null
  hasta: string | null
  sesiones: SesionLeida[]
  notas: NotaDia[]
  /** Lo que no se ha podido leer, dicho en castellano llano. */
  avisos: string[]
  /** El fichero lleva la marca de que lo escribió una IA (`MARCA_IA`). */
  generada_ia: boolean
}

/**
 * La línea con la que un .md dice que su contenido salió de una IA. Es un
 * comentario: no se ve al renderizar y no estorba al lector. La escribe la
 * exportación y la pide el prompt (`ia/planificacionPrompt.ts`).
 */
export const MARCA_IA = '<!-- generada-ia -->'
const ES_MARCA_IA = /<!--\s*generada[-_ ]ia\s*-->/i

// ─── Utilidades ──────────────────────────────────────────────────────────

export const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const normal = (s: string) => sinAcentos(s).toLowerCase().trim()

const MESES: Record<string, number> = {
  enero: 1, xaneiro: 1, febrero: 2, febreiro: 2, marzo: 3, abril: 4, mayo: 5, maio: 5,
  junio: 6, xuno: 6, julio: 7, xullo: 7, agosto: 8, septiembre: 9, setiembre: 9, setembro: 9,
  octubre: 10, outubro: 10, noviembre: 11, novembro: 11, diciembre: 12, decembro: 12,
}

const DIAS: Record<string, number> = {
  lunes: 1, luns: 1, martes: 2, miercoles: 3, mercores: 3, jueves: 4, xoves: 4,
  viernes: 5, venres: 5, sabado: 6, domingo: 0,
}

const mesDe = (s: string | undefined): number | null => (s ? MESES[normal(s)] ?? null : null)

const pad = (n: number) => String(n).padStart(2, '0')
export const isoFecha = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fechaDe = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12)

/** «9.00» o «09:00» → «9:00». */
export function normalizarHora(h: string): string {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(h.trim())
  return m ? `${Number(m[1])}:${m[2]}` : h.trim()
}
export const minutosDe = (h: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

/** Quita negritas, cursivas y espacios sobrantes. */
const limpio = (s: string) => s.replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim()

const RE_HORAS = /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/

/** «LENGUA CASTELLANA (dos sesiones)» → «Lengua Castellana»: sin el recuento y con mayúscula inicial. */
export function nombreArea(s: string): string {
  const sin = limpio(s).replace(/\s*\((?:[^)]*\bsesi[oó]n(?:es|s)?\b[^)]*)\)\s*$/i, '').trim()
  if (sin !== sin.toUpperCase()) return sin
  const menores = new Set(['de', 'da', 'do', 'das', 'dos', 'del', 'la', 'las', 'los', 'e', 'y', 'a'])
  return sin.toLowerCase().split(' ').map((p, i) =>
    i > 0 && menores.has(sinAcentos(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

/** Códigos de criterio («CA6.5», «CE 2.1») de un texto. */
export function codigosCriterio(texto: string): string[] {
  const out: string[] = []
  for (const m of texto.matchAll(/\b(C[AE])\s?(\d+(?:\.\d+)+)\b/g)) {
    const c = `${m[1]}${m[2]}`
    if (!out.includes(c)) out.push(c)
  }
  return out
}

// ─── Fechas de la semana ────────────────────────────────────────────────

/** «Semana del 9 al 13 de noviembre de 2026» / «Semana do 30 de novembro ao 4 de decembro». */
function leerRango(linea: string, anioPorDefecto: number): { desde: Date; hasta: Date } | null {
  const m = /semana\s+(?:del?|do|da)\s+(\d{1,2})(?:\s+de\s+(\p{L}+))?(?:\s+de\s+(\d{4}))?\s+(?:al|ao|a)\s+(\d{1,2})\s+de\s+(\p{L}+)(?:\s+(?:de|do)\s+(\d{4}))?/iu.exec(sinAcentos(linea))
  if (!m) return null
  const mesFin = mesDe(m[5])
  if (!mesFin) return null
  const anioFin = m[6] ? Number(m[6]) : anioPorDefecto
  const mesIni = mesDe(m[2]) ?? mesFin
  const anioIni = m[3] ? Number(m[3]) : (mesIni > mesFin ? anioFin - 1 : anioFin)
  return { desde: fechaDe(anioIni, mesIni, Number(m[1])), hasta: fechaDe(anioFin, mesFin, Number(m[4])) }
}

/** Fecha del día del mes `dia` dentro del rango; si no hay rango, null. */
function fechaEnRango(dia: number, rango: { desde: Date; hasta: Date } | null): string | null {
  if (!rango) return null
  for (let d = new Date(rango.desde); d <= rango.hasta; d.setDate(d.getDate() + 1)) {
    if (d.getDate() === dia) return isoFecha(d)
  }
  return null
}

// ─── Celdas de la vista rápida ──────────────────────────────────────────

interface Celda {
  fecha: string
  franja: string | null
  hora_inicio: string
  hora_fin: string
  area: string
  unidad: string | null
  titulo: string
  tipo: TipoSesionPlan
  evaluable: boolean
}

const RE_UD = /^(?:UD|U\.D\.|Unidad|Unidade)\s*(\d+)$/i
const esEspecialista = (s: string) => /^especialista$/i.test(s.trim())
const esCentro = (s: string) => /^actividad(?:e)? de centro$/i.test(sinAcentos(s.trim()))

function celdasDeFila(cab: (string | null)[], fila: string[], avisos: string[]): Celda[] {
  const primera = limpio(fila[0] ?? '')
  const h = RE_HORAS.exec(primera)
  if (!h) { if (primera) avisos.push(`Fila de la tabla sin horas: «${primera}»`); return [] }
  const franja = primera.slice(0, h.index).trim() || null
  const out: Celda[] = []
  for (let i = 1; i < fila.length; i++) {
    const fecha = cab[i]
    const bruto = (fila[i] ?? '').trim()
    if (!fecha || !bruto || bruto === '—' || bruto === '-') continue
    const evaluable = bruto.includes('■')
    const partes = bruto.replace(/■/g, '').split(/\s+·\s+/).map(limpio).filter(Boolean)
    const area = nombreArea(partes.shift() ?? '')
    let unidad: string | null = null
    let tipo: TipoSesionPlan = 'clase'
    const resto: string[] = []
    for (const p of partes) {
      const ud = RE_UD.exec(p)
      if (ud && !unidad) unidad = `UD${ud[1]}`
      else if (esEspecialista(p)) tipo = 'especialista'
      else if (esCentro(p)) tipo = 'centro'
      else resto.push(p)
    }
    out.push({
      fecha, franja, hora_inicio: normalizarHora(h[1]), hora_fin: normalizarHora(h[2]),
      area, unidad, titulo: resto.join(' · ') || (tipo === 'clase' ? '' : partes.join(' · ')), tipo, evaluable,
    })
  }
  return out
}

const celdasDeTabla = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

// ─── Bloques del detalle ────────────────────────────────────────────────

interface Bloque {
  fecha: string
  hora_inicio: string
  hora_fin: string
  area: string
  unidad: string | null
  unidad_titulo: string | null
  titulo: string
  objetivo: string
  secuencia: FaseSecuencia[]
  recursos: string
  evaluacion: string
  evaluable: boolean
}

type Rotulo = 'objetivo' | 'secuencia' | 'recursos' | 'evaluacion'

function rotuloDe(s: string): Rotulo | null {
  const n = normal(s).replace(/[.:]+$/, '')
  if (/^(objetivo|obxectivo)s?\b/.test(n)) return 'objetivo'
  if (/^secuencia|^secuenci|^desenvolvemento da sesion|^desarrollo de la sesion/.test(n)) return 'secuencia'
  if (/^recursos?\b|^materiais|^materiales/.test(n)) return 'recursos'
  if (/^(evaluacion|avaliacion)\b/.test(n)) return 'evaluacion'
  return null
}

/** «- **Inicio (15 min):** texto» → fase. */
function faseDe(l: string): FaseSecuencia | null {
  const m = /^\s*[-*]\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/.exec(l)
  if (!m) return null
  let nombre = m[1].replace(/:\s*$/, '').trim()
  let minutos: number | null = null
  const mm = /\s*\((\d+)\s*min\.?\)\s*$/i.exec(nombre)
  if (mm) { minutos = Number(mm[1]); nombre = nombre.slice(0, mm.index).trim() }
  return { fase: nombre.replace(/:$/, ''), minutos, texto: limpio(m[2]) }
}

/** Lo que va tras «Anclaje:» / «Anclaxe:» / «Ancoraxe:». */
export function anclajeDe(evaluacion: string): { anclaje: string; criterios: string[]; sigla: string | null } {
  const m = /\b(?:Anclaje|Anclaxe|Ancoraxe|Criterios?)\s*:\s*(.+)$/i.exec(evaluacion)
  if (!m) return { anclaje: '', criterios: codigosCriterio(evaluacion), sigla: null }
  const anclaje = m[1].trim().replace(/\.$/, '')
  const sigla = /^([A-ZÁÉÍÓÚ]{2,5})\s+C[AE]\s?\d/.exec(anclaje)?.[1] ?? null
  return { anclaje, criterios: codigosCriterio(anclaje), sigla }
}

// ─── Lector ─────────────────────────────────────────────────────────────

export function leerSemana(md: string, hoy: Date = new Date()): SemanaLeida {
  // La marca de IA se anota y se quita: es un comentario, no contenido.
  const generada_ia = ES_MARCA_IA.test(md)
  const lineas = md.replace(new RegExp(ES_MARCA_IA.source, 'gi'), '').replace(/\r\n?/g, '\n').split('\n')
  const avisos: string[] = []
  let clase: string | null = null
  let tituloSemana: string | null = null
  let rango: { desde: Date; hasta: Date } | null = null

  // Cabecera y rango de la semana
  for (const l of lineas) {
    if (!clase && /^#\s+/.test(l)) {
      const t = limpio(l.replace(/^#\s+/, ''))
      const partes = t.split(/\s+·\s+/)
      clase = partes.length > 1 ? partes.slice(1).join(' · ') : t.replace(/^programaci[oó]n\s+semanal\s*/i, '') || null
    }
    if (!rango && /semana\s+(?:del?|do|da)\s+\d/i.test(sinAcentos(l))) {
      rango = leerRango(l, hoy.getFullYear())
      if (rango) tituloSemana = limpio(l.replace(/^#+\s*/, ''))
    }
  }

  // Vista rápida
  const celdas: Celda[] = []
  let cab: (string | null)[] | null = null
  for (const l of lineas) {
    if (!l.trim().startsWith('|')) { cab = null; continue }
    const cs = celdasDeTabla(l)
    if (cs.every(c => /^:?-{2,}:?$/.test(c) || c === '')) continue   // separador
    if (!cab) {
      cab = cs.map(c => {
        const m = /^(\p{L}+)\s+(\d{1,2})(?:\s+de\s+(\p{L}+))?/u.exec(sinAcentos(limpio(c)))
        if (!m || DIAS[normal(m[1])] === undefined) return null
        const mes = mesDe(m[3])
        if (mes && rango) return isoFecha(fechaDe(rango.desde.getFullYear() + (mes < rango.desde.getMonth() + 1 ? 1 : 0), mes, Number(m[2])))
        const f = fechaEnRango(Number(m[2]), rango)
        if (!f) avisos.push(`No sé a qué fecha corresponde la columna «${limpio(c)}»`)
        return f
      })
      continue
    }
    celdas.push(...celdasDeFila(cab, cs, avisos))
  }

  // Detalle por sesión
  const bloques: Bloque[] = []
  const notas: NotaDia[] = []
  let fechaDia: string | null = null
  let actual: Bloque | null = null
  let rotulo: Rotulo | null = null
  let lineaUnidadPendiente = false

  const anadir = (campo: Exclude<Rotulo, 'secuencia'>, texto: string) => {
    if (!actual || !texto) return
    actual[campo] = actual[campo] ? `${actual[campo]} ${texto}` : texto
  }

  for (const l of lineas) {
    const t = l.trim()
    if (t.startsWith('|')) continue
    if (/^#{1,2}\s/.test(t)) { actual = null; fechaDia = null; continue }
    if (/^---+$/.test(t)) { actual = null; continue }

    const dia = /^#{3,}\s+(\p{L}+),?\s+(\d{1,2})(?:\s+de\s+(\p{L}+))?/u.exec(sinAcentos(t))
    if (dia) {
      actual = null
      const mes = mesDe(dia[3])
      const anio = rango?.hasta.getFullYear() ?? hoy.getFullYear()
      fechaDia = mes ? isoFecha(fechaDe(rango && mes > rango.hasta.getMonth() + 1 ? anio - 1 : anio, mes, Number(dia[2])))
        : fechaEnRango(Number(dia[2]), rango)
      if (!fechaDia) avisos.push(`No sé qué fecha es «${limpio(t.replace(/^#+/, ''))}»`)
      continue
    }
    if (!fechaDia) continue

    // Cabecera de bloque: «**9:00-10:40 · LENGUA CASTELLANA (dos sesiones)**»
    const cabBloque = /^\*\*\s*(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})\s*·\s*(.+?)\s*\*\*$/.exec(t)
    if (cabBloque) {
      actual = {
        fecha: fechaDia, hora_inicio: normalizarHora(cabBloque[1]), hora_fin: normalizarHora(cabBloque[2]),
        area: nombreArea(cabBloque[3]), unidad: null, unidad_titulo: null, titulo: '',
        objetivo: '', secuencia: [], recursos: '', evaluacion: '', evaluable: false,
      }
      bloques.push(actual)
      rotulo = null
      lineaUnidadPendiente = true
      continue
    }

    // Nota del día en cursiva, fuera de un bloque
    const cursiva = /^[*_]([^*_].*[^*_])[*_]$/.exec(t)
    if (cursiva && !actual) { notas.push({ fecha: fechaDia, texto: limpio(cursiva[1]) }); continue }

    if (!actual || !t) continue
    if (t.includes('■')) actual.evaluable = true

    const conRotulo = /^\*\*([^*]+?)\*\*\s*(.*)$/.exec(t)
    const r = conRotulo ? rotuloDe(conRotulo[1]) : null
    if (r) {
      lineaUnidadPendiente = false
      rotulo = r
      if (r !== 'secuencia') anadir(r, limpio(conRotulo![2]))
      continue
    }

    if (lineaUnidadPendiente) {
      lineaUnidadPendiente = false
      const partes = t.split(/\s+·\s+/).map(limpio).filter(Boolean)
      const ud = RE_UD.exec(partes[0] ?? '')
      if (ud) { actual.unidad = `UD${ud[1]}`; partes.shift() }
      if (partes.length > 1) actual.unidad_titulo = partes.shift()!
      actual.titulo = partes.join(' · ')
      continue
    }

    if (rotulo === 'secuencia') {
      const f = faseDe(t)
      if (f) actual.secuencia.push(f)
      else if (actual.secuencia.length) {
        const u = actual.secuencia[actual.secuencia.length - 1]
        u.texto = `${u.texto} ${limpio(t)}`.trim()
      }
      continue
    }
    if (rotulo) anadir(rotulo, limpio(t))
  }

  // Unir: cada bloque se reparte entre las celdas que cubre
  const sesiones: SesionLeida[] = []
  const usadas = new Set<Celda>()
  const desdeBloque = (b: Bloque, c: Celda | null, varias: boolean): SesionLeida => {
    const anc = anclajeDe(b.evaluacion)
    return {
      fecha: b.fecha,
      franja: c?.franja ?? null,
      hora_inicio: c?.hora_inicio ?? b.hora_inicio,
      hora_fin: c?.hora_fin ?? b.hora_fin,
      area: c?.area || b.area,
      unidad: b.unidad ?? c?.unidad ?? null,
      unidad_titulo: b.unidad_titulo,
      titulo: c?.titulo || b.titulo,
      tipo: c?.tipo ?? 'clase',
      evaluable: c ? c.evaluable : b.evaluable,
      objetivo: b.objetivo,
      secuencia: b.secuencia.map(f => ({ ...f })),
      recursos: b.recursos,
      evaluacion: b.evaluacion,
      anclaje: anc.anclaje,
      criterios: anc.criterios,
      sigla_criterios: anc.sigla,
      bloque: varias ? `${b.hora_inicio}-${b.hora_fin}` : null,
    }
  }

  for (const b of bloques) {
    const ini = minutosDe(b.hora_inicio), fin = minutosDe(b.hora_fin)
    const cubre = celdas.filter(c => c.fecha === b.fecha && !usadas.has(c)
      && minutosDe(c.hora_inicio) >= ini && minutosDe(c.hora_fin) <= fin)
    const mismas = cubre.filter(c => claveArea(c.area) === claveArea(b.area))
    if (cubre.length && !mismas.length) {
      avisos.push(`${b.fecha} ${b.hora_inicio}: el detalle dice «${b.area}» y la tabla «${cubre.map(c => c.area).join(', ')}»`)
    }
    if (!mismas.length) { sesiones.push(desdeBloque(b, null, false)); continue }
    for (const c of mismas) { usadas.add(c); sesiones.push(desdeBloque(b, c, mismas.length > 1)) }
  }
  for (const c of celdas) {
    if (usadas.has(c)) continue
    sesiones.push({
      fecha: c.fecha, franja: c.franja, hora_inicio: c.hora_inicio, hora_fin: c.hora_fin,
      area: c.area, unidad: c.unidad, unidad_titulo: null, titulo: c.titulo, tipo: c.tipo,
      evaluable: c.evaluable, objetivo: '', secuencia: [], recursos: '', evaluacion: '',
      anclaje: '', criterios: [], sigla_criterios: null, bloque: null,
    })
  }
  sesiones.sort((a, b) => a.fecha.localeCompare(b.fecha) || minutosDe(a.hora_inicio) - minutosDe(b.hora_inicio))

  // Una unidad que la tabla no titula toma el título del detalle del mismo día y área
  for (const s of sesiones) {
    if (s.unidad && !s.unidad_titulo) {
      const otro = sesiones.find(o => o.unidad === s.unidad && o.unidad_titulo && claveArea(o.area) === claveArea(s.area))
      if (otro) s.unidad_titulo = otro.unidad_titulo
    }
  }

  if (!rango && sesiones.length) {
    const fechas = sesiones.map(s => s.fecha).sort()
    rango = { desde: new Date(fechas[0] + 'T12:00'), hasta: new Date(fechas[fechas.length - 1] + 'T12:00') }
  }
  if (!sesiones.length) avisos.push('No he encontrado ninguna sesión: ni tabla de franjas ni bloques «**9:00-9:50 · ÁREA**».')

  return {
    clase, titulo_semana: tituloSemana,
    desde: rango ? isoFecha(rango.desde) : null,
    hasta: rango ? isoFecha(rango.hasta) : null,
    sesiones, notas, avisos, generada_ia,
  }
}

// ─── Áreas ──────────────────────────────────────────────────────────────

/**
 * Clave de área común a castellano, gallego y los nombres del currículo
 * («lengua-castellana», «ciencias-naturales»…). Lo que no reconoce se queda
 * en su forma normalizada, para comparar tal cual.
 */
export function claveArea(s: string): string {
  const n = normal(s).replace(/[-_]/g, ' ')
  const reglas: [RegExp, string][] = [
    [/castellan/, 'lengua-castellana'],
    [/galeg|gallega/, 'lingua-galega'],
    [/natur/, 'ciencias-naturales'],
    [/social|sociais/, 'ciencias-sociales'],
    [/matem/, 'matematicas'],
    [/ingl|extranjer|estranxeir|english/, 'lengua-extranjera'],
    [/fisic/, 'educacion-fisica'],
    [/music/, 'musica'],
    [/plastic|visual/, 'plastica'],
    [/artistic/, 'educacion-artistica'],
    [/relig/, 'religion'],
    [/valores|civic/, 'valores'],
  ]
  for (const [re, k] of reglas) if (re.test(n)) return k
  return n.replace(/\s+/g, ' ')
}
