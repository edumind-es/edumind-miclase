/**
 * Abre un PDF con pdf.js en el navegador y lo devuelve como texto con columnas
 * (`pdfTexto.ts`). Se carga a demanda: la biblioteca y su worker (~1,7 MB)
 * solo se descargan al importar una programación, no al abrir la app.
 *
 * Build `legacy`: el moderno exige funciones que el Safari de iPads con unos
 * años no tiene. El worker se sirve desde la propia app (`?url`), así que
 * cabe en la CSP (`worker-src 'self'`) y funciona sin conexión.
 */
import { textoDeDocumento } from './pdfTexto'

export async function textoDePdf(datos: ArrayBuffer): Promise<string> {
  const [pdfjs, { default: urlWorker }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = urlWorker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(datos), isEvalSupported: false }).promise
  try {
    return await textoDeDocumento(doc)
  } finally {
    doc.destroy()
  }
}
