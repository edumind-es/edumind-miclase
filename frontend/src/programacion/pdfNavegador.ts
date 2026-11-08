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
  // Desde pdf.js 6 se libera la tarea de carga, no el documento (que ya no
  // tiene `destroy`): así se cierra también el worker. `isEvalSupported`
  // desapareció en la v6 porque pdf.js ya no genera código con eval.
  const tarea = pdfjs.getDocument({ data: new Uint8Array(datos) })
  try {
    return await textoDeDocumento(await tarea.promise)
  } finally {
    await tarea.destroy()
  }
}
