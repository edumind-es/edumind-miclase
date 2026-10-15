/**
 * Una hoja de respuestas de muestra, con QR real, para las pruebas del
 * escáner. Se empaqueta a CommonJS (qrcode usa `require` dentro).
 */
// qrcode vive en el node_modules del frontend; desde aquí esbuild no lo encuentra solo.
import QRCode from '../../frontend/node_modules/qrcode/lib/index.js'
import { documentoHojasRespuestas } from '../../frontend/src/informes/hojasTest'
import { payloadHoja } from '../../frontend/src/db/hojaOMR'
import { normalizarPrueba } from '../../frontend/src/db/prueba'

export async function hojaDeMuestra(nPreguntas: number, nOpciones: number, pruebaId = 4242, alumnoId = 99): Promise<string> {
  const def = normalizarPrueba({ titulo: 'Examen de muestra', tipo: 'test', reparto: 'unica', preguntas: Array.from({ length: nPreguntas }, (_, i) => ({
    id: `p${i + 1}`, enunciado: `Pregunta ${i + 1}`, max: 1, opciones: Array.from({ length: nOpciones }, (_, j) => `Opción ${j + 1}`), correcta: i % nOpciones,
  })) })
  const qr = await QRCode.toDataURL(payloadHoja({ prueba_id: pruebaId, alumno_id: alumnoId, nPreguntas, nOpciones }), { errorCorrectionLevel: 'M', margin: 0, width: 400 })
  return documentoHojasRespuestas(def, [{ id: alumnoId, nombre: 'Ana', apellidos: 'Abad Ríos' }], new Map([[alumnoId, qr]]), { grupo: '6ºA', area: 'Ciencias Sociais' })
}
