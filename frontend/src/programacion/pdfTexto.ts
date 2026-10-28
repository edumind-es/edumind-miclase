/**
 * Texto con columnas de un PDF, en el propio aparato.
 *
 * El lector de PROENS (`proens.ts`) trabaja por columnas sobre la salida de
 * `pdftotext -layout`. Esto da un texto equivalente desde los trozos que
 * entrega pdf.js, cada uno con su posición, para que el PDF no tenga que
 * salir del dispositivo. Puro: recibe un documento ya abierto por pdf.js
 * (en el navegador, `pdfNavegador.ts`; en las pruebas, el build de Node).
 *
 * Tres cosas que hubo que imitar de `-layout`, medidas con los dos PDF de
 * `pruebas/fixtures/` (iguales campo a campo tras `parsearProens`):
 *  - El texto girado es la marca de agua «Borrador»: se descarta. Si no, se
 *    colaba entre los mínimos.
 *  - Las columnas se cuentan desde el margen izquierdo del documento: el
 *    lector espera el número de unidad al principio de la línea.
 *  - El ancho de carácter es la mediana de la página reducida (`FACTOR_PASO`).
 *    Con el ancho real las columnas se tocaban («sesiónstrim.»). Da lo mismo
 *    entre 0,6 y 0,9: no es una cifra afinada al milímetro.
 */

/** Lo que interesa de un trozo de `getTextContent()` de pdf.js. */
export interface TrozoPdf {
  str: string
  /** Matriz de transformación [a, b, c, d, x, y]. */
  transform: number[]
  width: number
  height: number
}

/** Lo mínimo de un documento de pdf.js que hace falta. */
export interface DocumentoPdf {
  numPages: number
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
}

export const FACTOR_PASO = 0.8

interface Trozo { x: number; y: number; alto: number; ancho: number; str: string }

const esTrozo = (it: any): it is TrozoPdf =>
  it && typeof it.str === 'string' && Array.isArray(it.transform)

/** Páginas de trozos → texto con columnas, páginas separadas por salto de página. */
export function textoDeTrozos(paginas: TrozoPdf[][]): string {
  const preparadas = paginas.map(items => {
    const trozos: Trozo[] = items
      .filter(it => it.str.trim())
      // La marca de agua va girada; el texto de las tablas, no.
      .filter(it => Math.abs(it.transform[1]) <= 0.01 && Math.abs(it.transform[2]) <= 0.01)
      .map(it => ({
        x: it.transform[4], y: it.transform[5],
        alto: Math.abs(it.transform[3]) || it.height || 10,
        ancho: it.width, str: it.str,
      }))
    const pasos = trozos.filter(t => t.str.length >= 3).map(t => t.ancho / t.str.length).sort((a, b) => a - b)
    const paso = (pasos.length ? pasos[Math.floor(pasos.length / 2)] : 5) * FACTOR_PASO
    return { trozos, paso }
  })
  const xs = preparadas.flatMap(p => p.trozos.map(t => t.x))
  const margen = xs.length ? Math.min(...xs) : 0

  return preparadas.map(({ trozos, paso }) => {
    // Líneas de arriba abajo, juntando lo que está a menos de medio alto.
    trozos.sort((a, b) => b.y - a.y || a.x - b.x)
    const lineas: { y: number; alto: number; trozos: Trozo[] }[] = []
    for (const t of trozos) {
      const l = lineas.find(l => Math.abs(l.y - t.y) < Math.min(l.alto, t.alto) * 0.5)
      if (l) l.trozos.push(t)
      else lineas.push({ y: t.y, alto: t.alto, trozos: [t] })
    }
    lineas.sort((a, b) => b.y - a.y)

    const salida: string[] = []
    let yAnterior: number | null = null
    let altoAnterior = 10
    for (const l of lineas) {
      // Líneas en blanco por el hueco vertical, como hace -layout (hasta cuatro).
      if (yAnterior !== null) {
        const huecos = Math.round((yAnterior - l.y) / (altoAnterior * 1.25)) - 1
        for (let i = 0; i < Math.min(huecos, 4); i++) salida.push('')
      }
      yAnterior = l.y
      altoAnterior = l.alto
      l.trozos.sort((a, b) => a.x - b.x)
      let s = ''
      let finAnterior = -Infinity
      for (const t of l.trozos) {
        const col = Math.max(0, Math.round((t.x - margen) / paso))
        if (col > s.length) s += ' '.repeat(col - s.length)
        else if (s && t.x - finAnterior > paso * 0.3 && !s.endsWith(' ')) s += ' '
        s += t.str
        finAnterior = t.x + t.ancho
      }
      salida.push(s.replace(/\s+$/, ''))
    }
    return salida.join('\n')
  }).join('\n\f')
}

/** Documento de pdf.js ya abierto → texto con columnas. */
export async function textoDeDocumento(doc: DocumentoPdf): Promise<string> {
  const paginas: TrozoPdf[][] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const { items } = await (await doc.getPage(n)).getTextContent()
    paginas.push(items.filter(esTrozo))
  }
  return textoDeTrozos(paginas)
}
