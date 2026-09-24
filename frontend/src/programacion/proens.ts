/**
 * Lector de programaciones didácticas de PROENS (Xunta de Galicia).
 *
 * Entra el texto plano de un PDF de PROENS extraído con `pdftotext -layout`
 * (lo devuelve el servidor en `/api/programacion/texto`) y sale la
 * programación estructurada: unidades con su trimestre, sesiones y peso,
 * criterios con su mínimo de consecución e instrumento, y los instrumentos
 * con su peso. El resto de la app no sabe nada de PROENS: recibe esto.
 *
 * Por qué se trabaja con `-layout` y por columnas: en la tabla de cada
 * unidad el criterio y su mínimo van en dos columnas y ambos se parten en
 * varias líneas, y el instrumento con su % es una celda combinada que abarca
 * varios criterios. Sin las posiciones de columna es imposible saber qué
 * línea es criterio y cuál es mínimo, ni a qué criterios cubre cada
 * instrumento. Las cabeceras de cada tabla dan las posiciones.
 *
 * Trampas conocidas del texto de PROENS:
 *  - La marca de agua «Borrador» va girada y sale troceada en líneas sueltas
 *    («Bo», «rra», «do», «r») que caen en medio de cualquier tabla.
 *  - Cada página repite cabecera (Xunta) y pie (fecha, «Páxina n de m»).
 *  - Las cabeceras de columna estrechas se parten («Duraci» / «ón»).
 *  - Un instrumento que abarca varios criterios se imprime UNA vez, centrado
 *    verticalmente en su bloque, y si el bloque salta de página no se repite.
 */

export interface ProensCriterio {
  /** Código tal como lo escribe PROENS (CA2.1). */
  codigo: string
  /** Código con el que lo conoce el currículo de MiClase (CE2.1). */
  codigoCurriculo: string
  descripcion: string
  minimo: string
  /** Abreviatura del instrumento en la leyenda (PE, TI…), o null si va «Baleiro». */
  instrumento: string | null
  porcentaje: number | null
}

export interface ProensUnidad {
  numero: number
  titulo: string
  /** Lo que la tabla 3.1 llama «Descrición»: los objetivos de la unidad. */
  descripcion: string
  peso: number | null
  sesiones: number | null
  trimestre: 1 | 2 | 3 | null
  criterios: ProensCriterio[]
  contenidos: string[]
}

export interface ProensInstrumento {
  abrev: string
  nombre: string
  /** Tipo de MiClase (`ia/instrumentosConfig.ts`), deducido del nombre. */
  tipo: string
  /** Peso en el área, en tanto por ciento, si la tabla 5.2 lo da. */
  peso: number | null
}

export interface ProgramacionProens {
  centro: string | null
  cursoEscolar: string | null
  etapa: string | null
  area: string | null
  /** Número de curso sin ordinal: «6». */
  curso: string | null
  sesionesSemanales: number | null
  sesionesAnuales: number | null
  unidades: ProensUnidad[]
  instrumentos: ProensInstrumento[]
  /** Lo que no se ha podido leer con seguridad; se enseña antes de importar. */
  avisos: string[]
}

// ─── Limpieza ──────────────────────────────────────────────────────────────

const RE_CABECERA_PAGINA = /^\s*XUNTA DE GALICIA/i
const RE_PIE_PAGINA = /Páxina\s+\d+\s+de\s+\d+\s*$/i
const RE_FECHA = /^\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s*$/

/** ¿Es un trozo de la marca de agua «Borrador» girada? */
function esMarcaDeAgua(linea: string): boolean {
  const t = linea.replace(/\s+/g, '')
  if (!t) return false
  if (/^borrador$/i.test(t)) return true
  return t.length <= 3 && 'Borrador'.toLowerCase().includes(t.toLowerCase())
}

/** Quita cabeceras, pies y marca de agua. Conserva los espacios iniciales: son las columnas. */
export function limpiarTexto(texto: string): string[] {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => !RE_CABECERA_PAGINA.test(l) && !RE_PIE_PAGINA.test(l) && !RE_FECHA.test(l) && !esMarcaDeAgua(l))
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const clave = (s: string) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9]/g, '')

/** Empieza la sección numerada `n` («3.1. Relación…», «6. Medidas…»)? */
function esSeccion(linea: string, n: string): boolean {
  return new RegExp(`^\\s*${n.replace('.', '\\.')}\\.?\\s+\\S`).test(linea)
}

function indiceSeccion(lineas: string[], n: string, desde = 0): number {
  for (let i = desde; i < lineas.length; i++) if (esSeccion(lineas[i], n)) return i
  return -1
}

/** Columna en la que empieza `texto` dentro de la línea, o -1. */
const col = (linea: string, texto: string) => sinAcentos(linea).indexOf(sinAcentos(texto))

/** Une trozos de texto partidos en líneas, reparando guiones de corte. */
function unir(trozos: string[]): string {
  return trozos
    .map(t => t.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/-\s+(?=[a-záéíóúñ])/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Entre varias columnas de cabecera, la más cercana a la posición dada. */
function columnaMasCercana(pos: number, columnas: { nombre: string; col: number }[]): string {
  let mejor = columnas[0]
  for (const c of columnas) if (Math.abs(c.col - pos) < Math.abs(mejor.col - pos)) mejor = c
  return mejor.nombre
}

// ─── Cabecera del documento ────────────────────────────────────────────────

function leerCabecera(lineas: string[], p: ProgramacionProens) {
  for (let i = 0; i < Math.min(lineas.length, 80); i++) {
    const l = lineas[i]
    const m = /^\s*Educación\s+(\S+)\s{2,}(.+?)\s{2,}(\d+)º\s*(\S*)\s*(\d+)?\s*(\d+)?\s*$/.exec(l)
    if (m) {
      p.etapa = m[1].toLowerCase()
      p.area = m[2].trim()
      p.curso = m[3]
      p.sesionesSemanales = m[5] ? Number(m[5]) : null
      p.sesionesAnuales = m[6] ? Number(m[6]) : null
    }
    const c = /^\s*(\d{8})\s{2,}(.+?)\s{2,}(\S.*?)\s{2,}(\d{4}\/\d{4})\s*$/.exec(l)
    if (c) { p.centro = c[2].trim(); p.cursoEscolar = c[4] }
  }
  if (!p.area) p.avisos.push('No se ha encontrado la cabecera con el área y el curso.')
}

// ─── 3.1 Relación de unidades: peso, sesiones y trimestre ──────────────────

interface FilaRelacion { numero: number; titulo: string[]; descripcion: string[]; peso: number | null; sesiones: number | null; trimestre: 1 | 2 | 3 | null }

function leerRelacion(lineas: string[], ini: number, fin: number, p: ProgramacionProens): FilaRelacion[] {
  const filas: FilaRelacion[] = []
  let cab = -1
  for (let i = ini; i < fin; i++) {
    if (/^\s*UD\s{2,}T[ií]tulo\s{2,}Descrici[oó]n/.test(lineas[i])) { cab = i; break }
  }
  if (cab < 0) { p.avisos.push('No se ha encontrado la tabla 3.1 (relación de unidades).'); return filas }

  const h = lineas[cab]
  const cTit = col(h, 'Título'), cDesc = col(h, 'Descrición'), cPeso = col(h, '%')
  const cSes = col(h, 'Nº'), c1 = col(h, '1º'), c2 = col(h, '2º'), c3 = col(h, '3º')
  const numericas = [
    { nombre: 'peso', col: cPeso }, { nombre: 'sesiones', col: cSes },
    { nombre: 't1', col: c1 }, { nombre: 't2', col: c2 }, { nombre: 't3', col: c3 },
  ].filter(c => c.col >= 0)

  let actual: FilaRelacion | null = null
  for (let i = cab + 1; i < fin; i++) {
    const l = lineas[i]
    if (!l.trim()) continue
    const izq = l.slice(0, cTit).trim()
    if (/^\d+$/.test(izq)) {
      actual = { numero: Number(izq), titulo: [], descripcion: [], peso: null, sesiones: null, trimestre: null }
      filas.push(actual)
    }
    if (!actual) continue   // restos de la cabecera partida
    actual.titulo.push(l.slice(cTit, cDesc))
    actual.descripcion.push(l.slice(cDesc, cPeso))
    const resto = l.slice(cPeso)
    for (const m of resto.matchAll(/\S+/g)) {
      const pos = cPeso + (m.index ?? 0)
      const tok = m[0]
      const donde = columnaMasCercana(pos, numericas)
      if (/^\d+([.,]\d+)?$/.test(tok)) {
        const v = Number(tok.replace(',', '.'))
        if (donde === 'peso') actual.peso = v
        else if (donde === 'sesiones') actual.sesiones = v
      } else if (/^x$/i.test(tok)) {
        if (donde === 't1') actual.trimestre = 1
        else if (donde === 't2') actual.trimestre = 2
        else if (donde === 't3') actual.trimestre = 3
      }
    }
  }
  return filas
}

// ─── 3.2 Distribución: criterios, mínimos e instrumentos por unidad ────────

interface Marcador { abrev: string; pct: number | null; fila: number }
interface CritEnCurso { codigo: string; desc: string[]; min: string[]; ini: number; fin: number }

/**
 * Reparte los criterios entre los instrumentos leídos en la columna IA.
 *
 * Cada instrumento es una celda combinada centrada en su bloque de
 * criterios. Un criterio que tiene el marcador dentro de sus líneas es de
 * ese instrumento sin discusión. Para el resto se estima dónde acaba cada
 * bloque: si el marcador k está en el centro de su bloque, el bloque acaba
 * en 2·m_k − inicio_k. Se encadena hacia delante y hacia atrás y se toma
 * la media, que absorbe el redondeo.
 */
function asignarInstrumentos(crits: CritEnCurso[], marcadores: Marcador[]): Map<string, Marcador | null> {
  const res = new Map<string, Marcador | null>()
  if (!crits.length) return res
  if (!marcadores.length) { crits.forEach(c => res.set(c.codigo, null)); return res }

  const inicio = crits[0].ini
  const final = crits[crits.length - 1].fin
  const n = marcadores.length
  // Límite estimado entre el bloque k y el k+1 (índice de fila)
  const limites: number[] = []
  let ini = inicio
  const adelante: number[] = []
  for (let k = 0; k < n - 1; k++) { const b = 2 * marcadores[k].fila - ini; adelante.push(b); ini = b }
  let fin = final
  const atras: number[] = new Array(n - 1)
  for (let k = n - 1; k > 0; k--) { const b = 2 * marcadores[k].fila - fin; atras[k - 1] = b; fin = b }
  for (let k = 0; k < n - 1; k++) limites.push((adelante[k] + atras[k]) / 2)

  for (const c of crits) {
    const dentro = marcadores.find(m => m.fila >= c.ini && m.fila <= c.fin)
    if (dentro) { res.set(c.codigo, dentro); continue }
    const centro = (c.ini + c.fin) / 2
    let k = 0
    while (k < limites.length && centro > limites[k]) k++
    res.set(c.codigo, marcadores[k])
  }
  return res
}

function leerLeyenda(linea: string, p: ProgramacionProens) {
  // «Lenda: IA: Instrumento de Avaliación, %: Peso orientativo; PE: Proba escrita, TI: Táboa de indicadores»
  for (const m of linea.matchAll(/(?:^|[,;]\s*)([A-ZÁÉÍÓÚ]{1,6}):\s*([^,;]+)/g)) {
    const abrev = m[1], nombre = m[2].trim()
    if (abrev === 'IA' || abrev === 'Lenda') continue
    if (!p.instrumentos.some(i => i.abrev === abrev)) {
      p.instrumentos.push({ abrev, nombre, tipo: tipoDeInstrumento(nombre), peso: null })
    }
  }
}

/** Traduce el nombre gallego del instrumento al tipo de MiClase. */
export function tipoDeInstrumento(nombre: string): string {
  const k = clave(nombre)
  // «Lista de control» es observación aunque lleve «control»: se mira antes
  if (/taboa|tabla|indicador|listadecontrol|listaxedecontrol|observacion|rexistro|registro|escala/.test(k)) return 'observacion'
  if (/rubrica/.test(k)) return 'rubrica'
  if (/proba|prueba|exame|examen|control|test/.test(k)) return 'prueba-escrita'
  if (/traballo|trabajo|proxecto|proyecto|tarefa|tarea/.test(k)) return 'trabajo'
  if (/portfolio|portafolio|dossier|caderno|cuaderno/.test(k)) return 'portfolio'
  if (/oral|exposicion|exposición/.test(k)) return 'oral'
  if (/autoavaliacion|autoevaluacion|coavaliacion|coevaluacion/.test(k)) return 'autoevaluacion'
  if (/actitude|actitud|participacion/.test(k)) return 'actitud'
  if (/diario/.test(k)) return 'diario'
  return 'otro'
}

function leerDistribucion(lineas: string[], ini: number, fin: number, p: ProgramacionProens): ProensUnidad[] {
  const unidades: ProensUnidad[] = []
  let i = ini
  while (i < fin) {
    if (!/^\s*UD\s{2,}T[ií]tulo da UD/.test(lineas[i])) { i++; continue }
    // ── Fila de la unidad (saltando los restos de «Duración» partido) ──
    i++
    let numero = 0
    const titulo: string[] = []
    let sesiones: number | null = null
    while (i < fin && !/Criterios de avaliaci[oó]n/.test(lineas[i])) {
      const l = lineas[i]; i++
      const t = l.trim()
      if (!t || /^(ón|Duración|Duraci)$/i.test(t)) continue
      const m = /^\s*(\d+)\s{2,}(.+?)(?:\s{2,}(\d+))?\s*$/.exec(l)
      if (m && !numero) {
        numero = Number(m[1]); titulo.push(m[2]); if (m[3]) sesiones = Number(m[3])
      } else if (numero) {
        titulo.push(t)
      }
    }
    const u: ProensUnidad = {
      numero, titulo: unir(titulo), descripcion: '', peso: null, sesiones,
      trimestre: null, criterios: [], contenidos: [],
    }
    unidades.push(u)
    if (i >= fin) break

    // ── Tabla de criterios ──
    const h = lineas[i]
    const cMin = col(h, 'Mínimos'), cIA = col(h, 'IA'), cPct = h.lastIndexOf('%')
    if (cMin < 0 || cIA < 0) { p.avisos.push(`UD ${numero}: no se reconoce la cabecera de la tabla de criterios.`); continue }
    i++
    const crits: CritEnCurso[] = []
    const marcadores: Marcador[] = []
    let fila = 0
    let leyenda = ''
    while (i < fin) {
      const l = lineas[i]
      if (/^\s*Lenda:/.test(l)) { leyenda = l; i++; break }
      if (/^\s*Contidos\s*$/.test(l) || /^\s*UD\s{2,}T[ií]tulo da UD/.test(l)) break
      i++
      if (!l.trim()) continue
      // La cabecera se repite si la tabla salta de página
      if (/Criterios de avaliaci[oó]n\s{2,}M[ií]nimos/.test(l)) continue
      const izq = l.slice(0, cMin), med = l.slice(cMin, cIA), der = l.slice(cIA)
      const nuevo = /^\s*(CA\d+\.\d+)\s*[-–]\s*(.*)$/.exec(izq)
      let actual = crits[crits.length - 1]
      if (nuevo) {
        actual = { codigo: nuevo[1], desc: [nuevo[2]], min: [], ini: fila, fin: fila }
        crits.push(actual)
      } else if (actual && izq.trim()) {
        actual.desc.push(izq)
      }
      if (actual && med.trim()) actual.min.push(med)
      if (actual && (izq.trim() || med.trim())) actual.fin = fila
      const md = /^\s*(\S+)(?:\s+(\d+))?\s*$/.exec(der)
      if (md && !/^\d+$/.test(md[1])) {
        marcadores.push({ abrev: md[1], pct: md[2] != null ? Number(md[2]) : null, fila })
      } else if (md && cPct >= 0 && marcadores.length && marcadores[marcadores.length - 1].pct == null) {
        // El % puede caer en otra línea que la abreviatura
        marcadores[marcadores.length - 1].pct = Number(md[1])
      }
      fila++
    }
    if (leyenda) leerLeyenda(leyenda, p)
    const asignacion = asignarInstrumentos(crits, marcadores)
    for (const c of crits) {
      const m = asignacion.get(c.codigo) ?? null
      const vacio = !m || /^(baleiro|vac[ií]o|-)$/i.test(m.abrev)
      u.criterios.push({
        codigo: c.codigo,
        codigoCurriculo: c.codigo.replace(/^CA/, 'CE'),
        descripcion: unir(c.desc),
        minimo: unir(c.min),
        instrumento: vacio ? null : m!.abrev,
        porcentaje: vacio ? null : m!.pct,
      })
    }
    if (!crits.length) p.avisos.push(`UD ${numero} (${u.titulo}): sin criterios en la tabla.`)
    if (crits.length && !marcadores.length) p.avisos.push(`UD ${numero} (${u.titulo}): ningún criterio tiene instrumento en la columna IA.`)

    // ── Contidos ──
    while (i < fin && !/^\s*Contidos\s*$/.test(lineas[i]) && !/^\s*UD\s{2,}T[ií]tulo da UD/.test(lineas[i])) i++
    while (i < fin && !/^\s*UD\s{2,}T[ií]tulo da UD/.test(lineas[i])) {
      const t = lineas[i].trim(); i++
      if (!t || /^Contidos$/.test(t)) continue
      if (/^[-–•]\s*/.test(t)) u.contenidos.push(t.replace(/^[-–•]\s*/, ''))
      else if (u.contenidos.length) u.contenidos[u.contenidos.length - 1] = unir([u.contenidos[u.contenidos.length - 1], t])
    }
  }
  return unidades
}

// ─── 5.2 Pesos de los instrumentos ─────────────────────────────────────────

function leerPesos(lineas: string[], ini: number, fin: number, p: ProgramacionProens) {
  if (ini < 0) return
  const filas: { etiqueta: string[]; valores: number[] }[] = []
  let actual: { etiqueta: string[]; valores: number[] } | null = null
  for (let i = ini; i < fin; i++) {
    const l = lineas[i]
    if (/Criterios de cualificaci[oó]n:/.test(l)) break
    const t = l.trim()
    if (!t || /^Unidade did[aá]ctica/.test(t) || /Pesos dos instrumentos/.test(t)) { actual = null; continue }
    const m = /^(.*?)\s{2,}((?:\d+\s*)+)$/.exec(t)
    if (m) {
      actual = { etiqueta: [m[1]], valores: m[2].trim().split(/\s+/).map(Number) }
      filas.push(actual)
    } else if (actual && !/\d/.test(t)) {
      actual.etiqueta.push(t)
    }
  }
  for (const ins of p.instrumentos) {
    const k = clave(ins.nombre)
    // Con «Total» hay una sola cifra; si no, se toma la que más se repite por UD
    const propias = filas.filter(f => clave(unir(f.etiqueta)) === k)
    if (!propias.length) continue
    const total = propias.find(f => f.valores.length === 1)
    if (total) { ins.peso = total.valores[0]; continue }
    const cuenta = new Map<number, number>()
    for (const v of propias.flatMap(f => f.valores)) cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
    ins.peso = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
}

// ─── Entrada principal ─────────────────────────────────────────────────────

export function parsearProens(texto: string): ProgramacionProens {
  const p: ProgramacionProens = {
    centro: null, cursoEscolar: null, etapa: null, area: null, curso: null,
    sesionesSemanales: null, sesionesAnuales: null,
    unidades: [], instrumentos: [], avisos: [],
  }
  const lineas = limpiarTexto(texto)
  leerCabecera(lineas, p)

  const s31 = indiceSeccion(lineas, '3.1')
  const s32 = indiceSeccion(lineas, '3.2', Math.max(s31, 0))
  const s41 = indiceSeccion(lineas, '4.1', Math.max(s32, 0))
  const s52 = indiceSeccion(lineas, '5.2', Math.max(s41, 0))
  const s6 = indiceSeccion(lineas, '6', Math.max(s52, 0))

  if (s32 < 0) {
    p.avisos.push('No se ha encontrado la sección 3.2 (distribución del currículo). ¿Es un PDF de PROENS?')
    return p
  }

  const relacion = s31 >= 0 ? leerRelacion(lineas, s31, s32, p) : []
  p.unidades = leerDistribucion(lineas, s32, s41 >= 0 ? s41 : lineas.length, p)
  leerPesos(lineas, s52, s6 >= 0 ? s6 : lineas.length, p)

  // Casar 3.1 con 3.2 por número de unidad
  const porNumero = new Map(relacion.map(r => [r.numero, r]))
  for (const u of p.unidades) {
    const r = porNumero.get(u.numero)
    if (!r) { p.avisos.push(`UD ${u.numero}: no aparece en la tabla 3.1, sin trimestre ni peso.`); continue }
    u.descripcion = frases(r.descripcion)
    u.peso = r.peso
    u.sesiones = u.sesiones ?? r.sesiones
    u.trimestre = r.trimestre
    if (!u.titulo) u.titulo = unir(r.titulo)
    if (!u.trimestre) p.avisos.push(`UD ${u.numero} (${u.titulo}): sin trimestre en la tabla 3.1.`)
  }
  for (const r of relacion) {
    if (!p.unidades.some(u => u.numero === r.numero)) {
      p.avisos.push(`UD ${r.numero} (${unir(r.titulo)}) está en la tabla 3.1 pero no tiene tabla de criterios en 3.2.`)
    }
  }

  // Abreviaturas usadas sin leyenda
  const conocidas = new Set(p.instrumentos.map(i => i.abrev))
  for (const u of p.unidades) for (const c of u.criterios) {
    if (c.instrumento && !conocidas.has(c.instrumento)) {
      p.instrumentos.push({ abrev: c.instrumento, nombre: c.instrumento, tipo: 'otro', peso: null })
      conocidas.add(c.instrumento)
      p.avisos.push(`El instrumento «${c.instrumento}» no está en la leyenda; se importará con ese nombre.`)
    }
  }

  // Los títulos de PROENS van en mayúsculas; se dejan legibles
  for (const u of p.unidades) u.titulo = capitalizar(u.titulo)
  return p
}

/**
 * Une las líneas de una celda en frases: cada objetivo de la tabla 3.1 va en
 * su párrafo, pero el PDF lo parte por el ancho de la columna. Se cierra una
 * frase donde hay punto final y se sigue pegando mientras no lo haya.
 */
function frases(lineas: string[]): string {
  const salida: string[] = []
  let actual: string[] = []
  for (const l of lineas) {
    const t = l.trim()
    if (!t) continue
    actual.push(t)
    if (/[.;:!?…]$/.test(t)) { salida.push(unir(actual)); actual = [] }
  }
  if (actual.length) salida.push(unir(actual))
  return salida.join('\n')
}

/** «ºO CLIMA E A PAISAXE» → «O clima e a paisaxe» (quita también el ordinal colado). */
export function capitalizar(t: string): string {
  const limpio = t.replace(/^[º°ª\s]+/, '').trim()
  if (!limpio) return limpio
  if (limpio !== limpio.toUpperCase()) return limpio
  const bajo = limpio.toLowerCase()
  return bajo.charAt(0).toUpperCase() + bajo.slice(1)
}
