import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Extracción de texto de una programación didáctica en PDF (PROENS).
 *
 * El servidor NO interpreta la programación: solo pasa el PDF por
 * `pdftotext -layout` (poppler) y devuelve el texto con sus columnas. La
 * lectura de unidades, criterios e instrumentos ocurre en el navegador
 * (`frontend/src/programacion/proens.ts`), donde vive el resto de la
 * programación del docente. Una programación de PROENS es un documento del
 * centro sin datos de alumnado, así que puede pasar por aquí sin romper el
 * principio de que el servidor no ve datos personales. No se guarda nada: el
 * fichero temporal se borra en cuanto se ha leído.
 *
 * Por qué `-layout`: en las tablas de PROENS el criterio y su mínimo van en
 * columnas y el instrumento es una celda combinada que abarca varios
 * criterios. Sin las posiciones de columna no hay forma de separarlos.
 */
const LIMITE_PDF = 15 * 1024 * 1024

export default async function programacionRoutes(app) {
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer', bodyLimit: LIMITE_PDF },
    (req, cuerpo, hecho) => hecho(null, cuerpo))

  app.post('/texto', async (req, reply) => {
    // El navegador manda el PDF en base64 dentro de un JSON ({ pdf }): en
    // Safari y en el iPad, enviar el File directamente como cuerpo fallaba
    // con «Load failed» antes de llegar al servidor. El cuerpo binario
    // (Content-Type: application/pdf) se sigue aceptando para curl y pruebas.
    const pdf = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body?.pdf === 'string' ? Buffer.from(req.body.pdf, 'base64') : null
    if (!pdf || pdf.length === 0) {
      return reply.status(400).send({ error: 'Se esperaba un PDF (application/pdf, o JSON { pdf } en base64).' })
    }
    if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return reply.status(400).send({ error: 'El fichero no es un PDF.' })
    }
    const dir = await mkdtemp(join(tmpdir(), 'miclase-proens-'))
    const ruta = join(dir, 'programacion.pdf')
    try {
      await writeFile(ruta, pdf)
      const texto = await new Promise((resolver, rechazar) => {
        execFile('pdftotext', ['-layout', '-enc', 'UTF-8', ruta, '-'],
          { timeout: 30_000, maxBuffer: 20 * 1024 * 1024 },
          (err, stdout, stderr) => {
            if (err) {
              const e = new Error(err.code === 'ENOENT'
                ? 'El servidor no tiene pdftotext instalado.'
                : `No se ha podido leer el PDF${stderr ? ': ' + String(stderr).trim().slice(0, 200) : '.'}`)
              e.statusCode = err.code === 'ENOENT' ? 500 : 422
              return rechazar(e)
            }
            resolver(stdout)
          })
      })
      if (!texto.trim()) {
        return reply.status(422).send({ error: 'El PDF no tiene texto: parece escaneado. PROENS genera PDF con texto; usa el que descarga la aplicación.' })
      }
      return { texto }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
}
