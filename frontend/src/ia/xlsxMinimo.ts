/**
 * Lector y escritor mínimos de hojas de cálculo `.xlsx`, sin dependencias.
 *
 * Un `.xlsx` es un ZIP con XML dentro. Para leer una rúbrica solo hace falta
 * la primera hoja como tabla de textos, y para eso no compensa cargar una
 * librería de medio mega: el navegador ya sabe descomprimir
 * (`DecompressionStream`) y el resto es recorrer el índice del ZIP.
 *
 * Todo ocurre en el dispositivo: el fichero no sale a ningún servidor.
 *
 * Lo que NO hace, a propósito: fórmulas (se lee el valor ya calculado que
 * guarda Excel), formatos, celdas combinadas, ZIP64 ni el `.xls` antiguo.
 */

const FIRMA_FIN = 0x06054b50       // fin del directorio central
const FIRMA_CENTRAL = 0x02014b50   // entrada del directorio central
const FIRMA_LOCAL = 0x04034b50     // cabecera local de un fichero

// ── Lectura ──────────────────────────────────────────────────────────────

type Entrada = { nombre: string; metodo: number; tamComprimido: number; posLocal: number }

/** Índice del ZIP: qué ficheros trae y dónde empieza cada uno. */
function entradasDelZip(datos: ArrayBuffer): Entrada[] {
  const v = new DataView(datos)
  // El fin del directorio está al final, antes de un comentario de largo variable.
  let fin = -1
  for (let i = datos.byteLength - 22; i >= 0 && i >= datos.byteLength - 22 - 65535; i--) {
    if (v.getUint32(i, true) === FIRMA_FIN) { fin = i; break }
  }
  if (fin < 0) throw new Error('El fichero no es una hoja de cálculo .xlsx válida.')

  const total = v.getUint16(fin + 10, true)
  let pos = v.getUint32(fin + 16, true)
  const texto = new TextDecoder()
  const entradas: Entrada[] = []
  for (let n = 0; n < total; n++) {
    if (pos + 46 > datos.byteLength || v.getUint32(pos, true) !== FIRMA_CENTRAL) break
    const largoNombre = v.getUint16(pos + 28, true)
    const largoExtra = v.getUint16(pos + 30, true)
    const largoComentario = v.getUint16(pos + 32, true)
    entradas.push({
      nombre: texto.decode(new Uint8Array(datos, pos + 46, largoNombre)),
      metodo: v.getUint16(pos + 10, true),
      tamComprimido: v.getUint32(pos + 20, true),
      posLocal: v.getUint32(pos + 42, true),
    })
    pos += 46 + largoNombre + largoExtra + largoComentario
  }
  return entradas
}

async function contenido(datos: ArrayBuffer, e: Entrada): Promise<string> {
  const v = new DataView(datos)
  if (v.getUint32(e.posLocal, true) !== FIRMA_LOCAL) throw new Error('La hoja de cálculo está dañada.')
  // La cabecera local repite nombre y extra, con largos que pueden no coincidir
  // con los del directorio: hay que leerlos de aquí.
  const inicio = e.posLocal + 30 + v.getUint16(e.posLocal + 26, true) + v.getUint16(e.posLocal + 28, true)
  const trozo = datos.slice(inicio, inicio + e.tamComprimido)
  if (e.metodo === 0) return new TextDecoder().decode(trozo)
  if (e.metodo !== 8) throw new Error('La hoja de cálculo usa una compresión que no se puede leer.')
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador no puede abrir ficheros .xlsx. Actualízalo, o guarda la rúbrica como Markdown (.md).')
  }
  const flujo = new Blob([trozo]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new TextDecoder().decode(await new Response(flujo).arrayBuffer())
}

function desescapar(s: string): string {
  return s
    .replace(/_x000D_/g, '')   // retorno de carro tal como lo escribe Excel
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Junta todos los `<t>` de un fragmento: un texto con formato va partido en varios. */
function textoDe(xml: string): string {
  const sinFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let t = ''
  for (const m of sinFonetica.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) t += m[1] ?? ''
  return desescapar(t)
}

/** «B7» → 1. Las columnas van en letras: A, B… Z, AA, AB… */
function columnaDe(ref: string): number {
  let n = 0
  for (const c of ref.toUpperCase()) {
    if (c < 'A' || c > 'Z') break
    n = n * 26 + (c.charCodeAt(0) - 64)
  }
  return n - 1
}

const atributo = (attrs: string, nombre: string): string | undefined =>
  attrs.match(new RegExp(`\\b${nombre}="([^"]*)"`))?.[1]

/**
 * Primera hoja de un `.xlsx` como tabla de textos.
 *
 * Las filas y celdas vacías se conservan en su sitio: una celda en blanco en
 * medio es un dato (un descriptor sin escribir), y descartarla correría las
 * demás una columna —el mismo fallo que ya tuvo el lector de Markdown—.
 */
export async function leerXlsx(datos: ArrayBuffer): Promise<string[][]> {
  const entradas = entradasDelZip(datos)
  const hojas = entradas
    .filter(e => /^xl\/worksheets\/[^/]+\.xml$/.test(e.nombre))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }))
  if (!hojas.length) throw new Error('El fichero no es una hoja de cálculo .xlsx válida.')

  // Los textos no van en la hoja sino en una tabla aparte, y la celda guarda el índice.
  const eCadenas = entradas.find(e => e.nombre === 'xl/sharedStrings.xml')
  const cadenas: string[] = []
  if (eCadenas) {
    const xml = await contenido(datos, eCadenas)
    for (const m of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) cadenas.push(textoDe(m[1] ?? ''))
  }

  const xml = await contenido(datos, hojas[0])
  const filas: string[][] = []
  let siguienteFila = 0
  for (const mf of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(atributo(mf[1], 'r'))
    const nFila = r > 0 ? r - 1 : siguienteFila
    siguienteFila = nFila + 1
    const fila: string[] = []
    let siguienteCol = 0
    for (const mc of (mf[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = atributo(mc[1], 'r')
      const col = ref ? columnaDe(ref) : siguienteCol
      siguienteCol = col + 1
      const tipo = atributo(mc[1], 't')
      const cuerpo = mc[2] ?? ''
      const v = cuerpo.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? ''
      let valor: string
      if (tipo === 's') valor = cadenas[Number(v)] ?? ''
      else if (tipo === 'inlineStr') valor = textoDe(cuerpo)
      else valor = desescapar(v)
      while (fila.length < col) fila.push('')
      fila[col] = valor
    }
    while (filas.length < nFila) filas.push([])
    filas[nFila] = fila
  }
  return filas
}

// ── Escritura ────────────────────────────────────────────────────────────

let tablaCrc: Uint32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (!tablaCrc) {
    tablaCrc = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      tablaCrc[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const b of bytes) crc = tablaCrc[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** ZIP sin comprimir: una rúbrica son unos pocos KB y así no hace falta compresor. */
function zip(ficheros: { nombre: string; texto: string }[]): Uint8Array<ArrayBuffer> {
  const cod = new TextEncoder()
  const partes = ficheros.map(f => {
    const nombre = cod.encode(f.nombre)
    const cuerpo = cod.encode(f.texto)
    return { nombre, cuerpo, crc: crc32(cuerpo) }
  })
  const tamLocal = partes.reduce((t, p) => t + 30 + p.nombre.length + p.cuerpo.length, 0)
  const tamCentral = partes.reduce((t, p) => t + 46 + p.nombre.length, 0)
  const salida = new Uint8Array(new ArrayBuffer(tamLocal + tamCentral + 22))
  const v = new DataView(salida.buffer)
  const FECHA = 0x21         // 1-1-1980: la fecha no aporta nada y así el fichero es reproducible
  const UTF8 = 0x0800

  let pos = 0
  const posiciones: number[] = []
  for (const p of partes) {
    posiciones.push(pos)
    v.setUint32(pos, FIRMA_LOCAL, true)
    v.setUint16(pos + 4, 20, true)
    v.setUint16(pos + 6, UTF8, true)
    v.setUint16(pos + 8, 0, true)
    v.setUint16(pos + 10, 0, true)
    v.setUint16(pos + 12, FECHA, true)
    v.setUint32(pos + 14, p.crc, true)
    v.setUint32(pos + 18, p.cuerpo.length, true)
    v.setUint32(pos + 22, p.cuerpo.length, true)
    v.setUint16(pos + 26, p.nombre.length, true)
    v.setUint16(pos + 28, 0, true)
    salida.set(p.nombre, pos + 30)
    salida.set(p.cuerpo, pos + 30 + p.nombre.length)
    pos += 30 + p.nombre.length + p.cuerpo.length
  }
  const inicioCentral = pos
  partes.forEach((p, i) => {
    v.setUint32(pos, FIRMA_CENTRAL, true)
    v.setUint16(pos + 4, 20, true)
    v.setUint16(pos + 6, 20, true)
    v.setUint16(pos + 8, UTF8, true)
    v.setUint16(pos + 10, 0, true)
    v.setUint16(pos + 12, 0, true)
    v.setUint16(pos + 14, FECHA, true)
    v.setUint32(pos + 16, p.crc, true)
    v.setUint32(pos + 20, p.cuerpo.length, true)
    v.setUint32(pos + 24, p.cuerpo.length, true)
    v.setUint16(pos + 28, p.nombre.length, true)
    v.setUint32(pos + 42, posiciones[i], true)
    salida.set(p.nombre, pos + 46)
    pos += 46 + p.nombre.length
  })
  v.setUint32(pos, FIRMA_FIN, true)
  v.setUint16(pos + 8, partes.length, true)
  v.setUint16(pos + 10, partes.length, true)
  v.setUint32(pos + 12, tamCentral, true)
  v.setUint32(pos + 16, inicioCentral, true)
  return salida
}

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 0 → «A», 26 → «AA». */
function letraDe(col: number): string {
  let s = ''
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/**
 * Una tabla → `.xlsx` de una sola hoja, que abren Excel, LibreOffice y Numbers.
 * Los números se escriben como números, para que la hoja pueda sumarlos.
 */
export function escribirXlsx(filas: (string | number)[][], nombreHoja = 'Hoja1'): Uint8Array<ArrayBuffer> {
  const columnas = Math.max(1, ...filas.map(f => f.length))
  const cuerpo = filas.map((fila, i) => {
    const celdas = fila.map((valor, j) => {
      const ref = `${letraDe(j)}${i + 1}`
      if (typeof valor === 'number' && Number.isFinite(valor)) return `<c r="${ref}"><v>${valor}</v></c>`
      const texto = String(valor ?? '')
      if (!texto) return ''
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapar(texto)}</t></is></c>`
    }).join('')
    return `<row r="${i + 1}">${celdas}</row>`
  }).join('')

  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  return zip([
    { nombre: '[Content_Types].xml', texto: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { nombre: '_rels/.rels', texto: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: 'xl/workbook.xml', texto: `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapar(nombreHoja.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { nombre: 'xl/worksheets/sheet1.xml', texto: `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="${columnas}" width="30" customWidth="1"/></cols><sheetData>${cuerpo}</sheetData></worksheet>` },
  ])
}
