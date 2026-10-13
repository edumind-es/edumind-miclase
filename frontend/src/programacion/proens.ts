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
/** Entrada del índice: «3.1. Relación de unidades didácticas        4». */
const RE_INDICE = /\s{2,}\d+\s*$/

/**
 * ¿Es un trozo de la marca de agua «Borrador» girada? Salen «Bo», «rra»,
 * «do», «ra», «r»… Una vocal sola no cuenta: «a» y «o» son palabras.
 */
function esTrozoMarca(t: string): boolean {
  if (/^borrador$/i.test(t)) return true
  return t.length <= 3 && !/^[ao]$/i.test(t) && 'borrador'.includes(t.toLowerCase())
}

function esMarcaDeAgua(linea: string): boolean {
  const t = linea.replace(/\s+/g, '')
  return !!t && esTrozoMarca(t)
}

/**
 * Borra los trozos de marca de agua que caen DENTRO de una línea con texto
 * («   do   Mínimos de consecución   IA   %»). Se sustituyen por espacios,
 * no se quitan: las columnas no deben moverse. Solo cuenta como trozo lo que
 * va aislado por dos o más espacios; dentro de una frase «do» es una palabra.
 */
function borrarMarcaEnLinea(l: string): string {
  return l.replace(/(^|\s{2})(\S{1,3})(?=\s{2}|$)/g, (m, pre: string, tok: string) =>
    esTrozoMarca(tok) ? pre + ' '.repeat(tok.length) : m)
}

/** Quita cabeceras, pies y marca de agua. Conserva los espacios iniciales: son las columnas. */
export function limpiarTexto(texto: string): string[] {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .split('\n')
    .map(l => borrarMarcaEnLinea(l).replace(/\s+$/, ''))
    .filter(l => !RE_CABECERA_PAGINA.test(l) && !RE_PIE_PAGINA.test(l) && !RE_FECHA.test(l) && !esMarcaDeAgua(l))
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const clave = (s: string) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9]/g, '')

/** Empieza la sección numerada `n` («3.1. Relación…», «6. Medidas…»)? Las entradas del índice no valen. */
function esSeccion(linea: string, n: string): boolean {
  return new RegExp(`^\\s*${n.replace('.', '\\.')}\\.?\\s+\\S`).test(linea) && !RE_INDICE.test(linea)
}

function indiceSeccion(lineas: string[], n: string, desde = 0): number {
  for (let i = desde; i < lineas.length; i++) if (esSeccion(lineas[i], n)) return i
  return -1
}

/** Columna en la que empieza `texto` dentro de la línea, o -1. */
const col = (linea: string, texto: string) => sinAcentos(linea).indexOf(sinAcentos(texto))

/** Trozos de texto de una línea (palabras separadas por UN espacio) con la columna en la que empiezan. */
function segmentos(l: string): { col: number; texto: string }[] {
  const out: { col: number; texto: string }[] = []
  for (const m of l.matchAll(/\S+(?: \S+)*/g)) out.push({ col: m.index ?? 0, texto: m[0] })
  return out
}

/** El valor más repetido, o null si no hay ninguno. */
function moda(valores: number[]): number | null {
  if (!valores.length) return null
  const cuenta = new Map<number, number>()
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
}

/**
 * Corte de una línea por una columna, sin partir una palabra: si la columna
 * cae en medio de una, el corte retrocede hasta el espacio anterior. Pasa
 * cuando el texto de una celda es tan largo que pdftotext lo pega a la
 * siguiente con un solo espacio.
 */
function cortar(l: string, c: number): [string, string] {
  if (c <= 0 || c >= l.length) return [l, '']
  let k = c
  if (l[k] !== ' ' && l[k - 1] !== ' ') {
    while (k > 0 && l[k - 1] !== ' ') k--
  }
  return [l.slice(0, k), ' '.repeat(k) + l.slice(k)]
}

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

/**
 * Límites entre bloques consecutivos cuando de cada bloque solo se conoce su
 * centro (una celda combinada imprime su contenido UNA vez, centrado). Si el
 * marcador k está en el centro de su bloque, el bloque acaba en
 * 2·m_k − inicio_k. Se encadena hacia delante y hacia atrás y se toma la
 * media, que absorbe el redondeo.
 */
function limitesPorCentro(inicio: number, final: number, marcadores: number[]): number[] {
  const n = marcadores.length
  const adelante: number[] = []
  let ini = inicio
  for (let k = 0; k < n - 1; k++) { const b = 2 * marcadores[k] - ini; adelante.push(b); ini = b }
  const atras: number[] = new Array(n - 1)
  let fin = final
  for (let k = n - 1; k > 0; k--) { const b = 2 * marcadores[k] - fin; atras[k - 1] = b; fin = b }
  return adelante.map((a, k) => (a + atras[k]) / 2)
}

/** Índice del bloque al que pertenece la posición, según los límites. */
function bloqueDe(pos: number, limites: number[]): number {
  let k = 0
  while (k < limites.length && pos > limites[k]) k++
  return k
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

const RE_CAB_31 = /^\s*UD\s{2,}T[ií]tulo\s{2,}Descrici[oó]n/
const RE_CAB_31_PIE = /^\s*materia\s+sesi[oó]ns/i

/**
 * La tabla 3.1 sale así de PROENS: la cabecera va en tres líneas («% Peso Nº
 * 1º 2º 3º» arriba, «UD Título Descrición» en medio, «materia sesións trim.»
 * abajo), se repite en cada página y las columnas bailan de una página a
 * otra. Cada fila es alta (la descripción son varios objetivos) y el número,
 * el título y los valores van centrados verticalmente en su celda: el
 * título puede empezar una línea ANTES del número y la descripción varias
 * antes. Se lee página a página, se toma como ancla la línea del número y
 * se reparten las demás líneas entre anclas por el centro del bloque.
 */
function leerRelacion(lineas: string[], ini: number, fin: number, p: ProgramacionProens): FilaRelacion[] {
  const cabs: number[] = []
  for (let i = ini; i < fin; i++) if (RE_CAB_31.test(lineas[i])) cabs.push(i)
  if (!cabs.length) { p.avisos.push('No se ha encontrado la tabla 3.1 (relación de unidades).'); return [] }

  const porNumero = new Map<number, FilaRelacion>()
  const orden: FilaRelacion[] = []
  for (let k = 0; k < cabs.length; k++) {
    const cab = cabs[k]
    const finPag = k + 1 < cabs.length ? cabs[k + 1] : fin
    // Las columnas numéricas están en la misma línea (gemelo) o en la de arriba (PROENS)
    let hNum = lineas[cab]
    if (!hNum.includes('%')) {
      for (let j = cab - 1; j >= Math.max(ini, cab - 3); j--) if (lineas[j].includes('%')) { hNum = lineas[j]; break }
    }
    const cPeso = col(hNum, '%')
    if (cPeso < 0) { p.avisos.push('Tabla 3.1: no se reconoce la cabecera con el peso y las sesiones.'); continue }
    const cNum = cPeso - 2
    const numericas = [
      { nombre: 'peso', col: cPeso }, { nombre: 'sesiones', col: col(hNum, 'Nº') },
      { nombre: 't1', col: col(hNum, '1º') }, { nombre: 't2', col: col(hNum, '2º') }, { nombre: 't3', col: col(hNum, '3º') },
    ].filter(c => c.col >= 0)

    const filasPag: number[] = []
    for (let i = cab + 1; i < finPag; i++) {
      const l = lineas[i]
      if (!l.trim() || RE_CAB_31_PIE.test(l) || (l.includes('%') && /Peso/.test(l))) continue
      // Restos de la cabecera partida («Peso», «materi», «a»): solo texto en
      // la zona de los números, y no es ni un número ni una X
      if (!l.slice(0, cNum).trim() && !/^(\d+([.,]\d+)?|x)$/i.test(l.slice(cNum).trim().split(/\s+/)[0] ?? '')) continue
      filasPag.push(i)
    }
    // Columna de la descripción: donde más veces arranca un trozo de texto
    // entre el título (columnas 0-6) y los números
    const cDesc = moda(filasPag.flatMap(i => segmentos(lineas[i].slice(0, cNum)).map(sg => sg.col).filter(c => c > 6)))
    if (cDesc == null) continue
    const cTit = Math.max(0, cDesc - 3)

    const anclas: { pos: number; numero: number }[] = []
    filasPag.forEach((i, pos) => {
      const m = /^\s{0,5}(\d{1,2})(?=\s|$)/.exec(lineas[i].slice(0, cTit))
      if (m) anclas.push({ pos, numero: Number(m[1]) })
    })
    if (!anclas.length) continue
    // PROENS centra el número en su fila: hay descripción antes de él. Si la
    // página empieza por un número, la fila va alineada arriba y cada bloque
    // empieza justo en su número. En el caso centrado, el centro solo es una
    // estimación: el límite real está donde acaba una frase (cada objetivo
    // termina en punto), así que se encaja en el final de frase más cercano.
    let limites: number[]
    if (anclas[0].pos === 0) {
      limites = anclas.slice(1).map(a => a.pos - 0.5)
    } else {
      const finales = filasPag
        .map((i, pos) => (/[.;:!?…]$/.test(lineas[i].slice(cTit, cNum).trim()) ? pos + 0.5 : -1))
        .filter(v => v >= 0)
      limites = limitesPorCentro(0, filasPag.length - 1, anclas.map(a => a.pos))
        .map(lim => finales.length ? finales.reduce((m, f) => Math.abs(f - lim) < Math.abs(m - lim) ? f : m) : lim)
    }

    filasPag.forEach((i, pos) => {
      const numero = anclas[bloqueDe(pos, limites)].numero
      let fila = porNumero.get(numero)
      if (!fila) {
        fila = { numero, titulo: [], descripcion: [], peso: null, sesiones: null, trimestre: null }
        porNumero.set(numero, fila); orden.push(fila)
      }
      const l = lineas[i]
      const izq = l.slice(0, cTit).replace(/^\s{0,5}\d{1,2}(?=\s|$)/, '')
      if (izq.trim()) fila.titulo.push(izq)
      const desc = l.slice(cTit, cNum)
      if (desc.trim()) fila.descripcion.push(desc)
      const resto = l.slice(cNum)
      for (const m of resto.matchAll(/\S+/g)) {
        const donde = columnaMasCercana(cNum + (m.index ?? 0), numericas)
        const tok = m[0]
        if (/^\d+([.,]\d+)?$/.test(tok)) {
          const v = Number(tok.replace(',', '.'))
          if (donde === 'peso') fila.peso = v
          else if (donde === 'sesiones') fila.sesiones = v
        } else if (/^x$/i.test(tok)) {
          if (donde === 't1') fila.trimestre = 1
          else if (donde === 't2') fila.trimestre = 2
          else if (donde === 't3') fila.trimestre = 3
        }
      }
    })
  }
  return orden.sort((a, b) => a.numero - b.numero)
}

// ─── 3.2 Distribución: criterios, mínimos e instrumentos por unidad ────────

interface Marcador { abrev: string; pct: number | null; fila: number; pagina: number }
interface Pagina { ini: number; fin: number }
interface CritEnCurso { codigo: string; desc: string[]; min: string[]; ini: number; fin: number }

/**
 * Límites entre los bloques de instrumentos, en filas.
 *
 * Cada instrumento es una celda combinada que se imprime UNA vez, centrada.
 * Pero si la tabla salta de página, el centro es el del trozo de bloque que
 * cae en la página donde se imprime, y en la página siguiente no se repite.
 * Por eso se estima página a página: hacia atrás desde el final de la
 * página (que es seguro) y hacia delante desde donde empieza el primer
 * bloque, y se toma la media. Si al ir hacia atrás el primer bloque de una
 * página empieza después de la primera fila, las filas anteriores son la
 * cola del último bloque de la página anterior.
 */
function limitesInstrumentos(marcadores: Marcador[], paginas: Pagina[]): number[] {
  const limites: number[] = []
  let vistos = 0
  paginas.forEach((pag, pg) => {
    const ms = marcadores.filter(m => m.pagina === pg)
    if (!ms.length) return
    const sAtras: number[] = new Array(ms.length)
    let e = pag.fin
    for (let k = ms.length - 1; k >= 0; k--) { sAtras[k] = 2 * ms[k].fila - e; e = sAtras[k] }
    const empiezaAntes = vistos > 0 && sAtras[0] > pag.ini + 0.5
    if (vistos > 0) limites.push(empiezaAntes ? sAtras[0] - 0.5 : pag.ini - 0.5)
    let s = empiezaAntes ? sAtras[0] : pag.ini
    for (let k = 0; k < ms.length - 1; k++) {
      const eDelante = 2 * ms[k].fila - s
      limites.push((eDelante + sAtras[k + 1]) / 2)
      s = eDelante
    }
    vistos += ms.length
  })
  return limites
}

/**
 * Reparte los criterios entre los instrumentos leídos en la columna IA. Un
 * criterio que tiene el marcador dentro de sus líneas es de ese instrumento
 * sin discusión; para el resto valen los límites estimados.
 */
function asignarInstrumentos(crits: CritEnCurso[], marcadores: Marcador[], paginas: Pagina[]): Map<string, Marcador | null> {
  const res = new Map<string, Marcador | null>()
  if (!crits.length) return res
  if (!marcadores.length) { crits.forEach(c => res.set(c.codigo, null)); return res }
  const limites = limitesInstrumentos(marcadores, paginas)
  for (const c of crits) {
    const dentro = marcadores.find(m => m.fila >= c.ini && m.fila <= c.fin)
    if (dentro) { res.set(c.codigo, dentro); continue }
    res.set(c.codigo, marcadores[bloqueDe((c.ini + c.fin) / 2, limites)])
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

const RE_CAB_32_CRIT = /Criterios de avaliaci[oó]n/
const RE_CAB_32_MIN = /M[ií]nimos de consecuci[oó]n/
/** Fila de cabecera de una unidad en 3.2. A veces «UD» cae en la línea anterior, solo. */
const RE_UD_32 = /^\s*(?:UD\s{2,})?T[ií]tulo da UD/

/**
 * Columnas de una página de la tabla de criterios. La cabecera solo sirve
 * para la columna IA: sus rótulos van centrados y el texto de las celdas
 * empieza antes que ellos. La columna del mínimo se saca de las propias
 * líneas: donde más veces arranca el segundo trozo de texto.
 */
function columnasCriterios(h: string, filas: string[]): { cMin: number; cIA: number } | null {
  const cIA = col(h, 'IA')
  if (cIA < 0) return null
  const arranques = filas.flatMap(l => segmentos(l).map(sg => sg.col).filter(c => c > 20 && c < cIA - 8))
  const cMin = moda(arranques)
  return cMin == null ? null : { cMin, cIA }
}

function leerDistribucion(lineas: string[], ini: number, fin: number, p: ProgramacionProens): ProensUnidad[] {
  const unidades: ProensUnidad[] = []
  let i = ini
  while (i < fin) {
    if (!RE_UD_32.test(lineas[i])) { i++; continue }
    // ── Fila de la unidad (saltando los restos de «Duración» partido) ──
    i++
    let numero = 0
    const titulo: string[] = []
    let sesiones: number | null = null
    while (i < fin && !RE_CAB_32_CRIT.test(lineas[i])) {
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

    // ── Tabla de criterios: primero se recogen sus líneas por páginas ──
    // La cabecera puede ir en una línea o partida en dos («Criterios de
    // avaliación» arriba y «Mínimos de consecución  IA  %» debajo), y se
    // repite cuando la tabla salta de página, con otras columnas.
    const paginas: { h: string; filas: string[] }[] = []
    let leyenda = ''
    while (i < fin) {
      const l = lineas[i]
      if (/^\s*Lenda:/.test(l)) { leyenda = l; i++; break }
      if (/^\s*Contidos\s*$/.test(l) || RE_UD_32.test(l)) break
      i++
      if (!l.trim()) continue
      if (RE_CAB_32_MIN.test(l)) { paginas.push({ h: l, filas: [] }); continue }
      if (RE_CAB_32_CRIT.test(l) && !/CA\d/.test(l)) continue   // la mitad de arriba de la cabecera partida
      if (paginas.length) paginas[paginas.length - 1].filas.push(l)
    }
    if (leyenda) leerLeyenda(leyenda, p)
    if (!paginas.length) { p.avisos.push(`UD ${numero}: no se reconoce la cabecera de la tabla de criterios.`); continue }

    const crits: CritEnCurso[] = []
    const marcadores: Marcador[] = []
    const filasPorPagina: Pagina[] = []
    let fila = 0
    for (const pag of paginas) {
      if (!pag.filas.length) continue   // cabecera justo antes de un salto de página
      const cols = columnasCriterios(pag.h, pag.filas)
      if (!cols) { p.avisos.push(`UD ${numero}: no se reconoce la cabecera de la tabla de criterios.`); continue }
      const { cMin, cIA } = cols
      const pagina = filasPorPagina.length
      filasPorPagina.push({ ini: fila, fin: fila + pag.filas.length - 1 })
      for (const l of pag.filas) {
        // El instrumento y su % son los trozos cortos del final, a la altura de «IA»
        const segs = segmentos(l)
        let cCorteIA = l.length
        while (segs.length && segs[segs.length - 1].col >= cIA - 8 && /^\S{1,10}(?:\s+\d+)?$/.test(segs[segs.length - 1].texto)) {
          cCorteIA = segs.pop()!.col
        }
        const der = l.slice(cCorteIA)
        const [izq, med] = cortar(l.slice(0, cCorteIA), cMin)
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
          marcadores.push({ abrev: md[1], pct: md[2] != null ? Number(md[2]) : null, fila, pagina })
        } else if (md && marcadores.length && marcadores[marcadores.length - 1].pct == null) {
          // El % puede caer en otra línea que la abreviatura
          marcadores[marcadores.length - 1].pct = Number(md[1])
        }
        fila++
      }
    }
    const asignacion = asignarInstrumentos(crits, marcadores, filasPorPagina)
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
    while (i < fin && !/^\s*Contidos\s*$/.test(lineas[i]) && !RE_UD_32.test(lineas[i])) i++
    while (i < fin && !RE_UD_32.test(lineas[i])) {
      const t = lineas[i].trim(); i++
      if (!t || /^(Contidos|UD)$/.test(t)) continue
      if (/^[-–•]\s*/.test(t)) u.contenidos.push(t.replace(/^[-–•]\s*/, ''))
      else if (u.contenidos.length) u.contenidos[u.contenidos.length - 1] = unir([u.contenidos[u.contenidos.length - 1], t])
    }
  }
  return unidades
}

// ─── 5.2 Pesos de los instrumentos ─────────────────────────────────────────

/**
 * La tabla 5.2 lleva una fila por instrumento con su peso en cada unidad (y
 * a veces un «Total»). PROENS parte las etiquetas en varias líneas y pone
 * los valores en una línea aparte, entre las dos mitades de la etiqueta
 * («Proba» / «80 80 80…» / «escrita»), así que no se puede casar etiqueta y
 * valores por línea. Se juntan todas las etiquetas en un texto, se ordenan
 * los instrumentos de la leyenda por dónde aparece su nombre en ese texto y
 * se les dan, en ese orden, las filas de valores que no son la del peso de
 * la unidad.
 */
function leerPesos(lineas: string[], ini: number, fin: number, p: ProgramacionProens) {
  if (ini < 0 || !p.instrumentos.length) return
  const etiquetas: string[] = []
  const filas: { antes: string; valores: number[] }[] = []
  let desdeUltima: string[] = []
  let nUD = 0, conTotal = false
  for (let i = ini; i < fin; i++) {
    const l = lineas[i]
    if (/Criterios de cualificaci[oó]n:/.test(l)) break
    const t = l.trim()
    if (!t || /Pesos dos instrumentos/.test(t)) continue
    const uds = t.match(/\bUD\s*\d+\b/g)
    if (uds) { nUD = Math.max(nUD, uds.length); if (/Total/i.test(t)) conTotal = true; continue }
    if (/^Total$/i.test(t)) { conTotal = true; continue }
    const m = /^(.*?)(?:^|\s{2,})((?:\d+(?:[.,]\d+)?\s*)+)$/.exec(t)
    if (m) {
      if (m[1].trim()) { etiquetas.push(m[1].trim()); desdeUltima.push(m[1].trim()) }
      filas.push({ antes: desdeUltima.join(' '), valores: m[2].trim().split(/\s+/).map(v => Number(v.replace(',', '.'))) })
      desdeUltima = []
    } else if (!/\d/.test(t)) {
      etiquetas.push(t); desdeUltima.push(t)
    }
  }
  const texto = clave(etiquetas.join(' '))
  const orden = p.instrumentos
    .map(ins => ({ ins, idx: texto.indexOf(clave(ins.nombre)) }))
    .filter(x => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx)
  // Si la tabla no cabe a lo ancho, PROENS la parte en subtablas (UD 1-7 y
  // luego «Total») repitiendo las etiquetas: las filas de valores van en
  // ciclos, una por instrumento. Un valor único es el total y manda.
  const deInstrumento = filas.filter(f => !/pesoud/.test(clave(f.antes)))
  if (!orden.length || deInstrumento.length % orden.length !== 0) {
    if (filas.length) p.avisos.push('No se han podido leer los pesos de los instrumentos de la tabla 5.2.')
    return
  }
  deInstrumento.forEach((f, k) => {
    const ins = orden[k % orden.length].ins
    const v = f.valores
    if (v.length === 1) ins.peso = v[0]
    else if (conTotal && v.length === nUD + 1) ins.peso = v[v.length - 1]
    else if (ins.peso == null) ins.peso = moda(v)
  })
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
