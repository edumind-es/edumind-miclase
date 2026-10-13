/**
 * Enviar un fichero por donde el sistema quiera: AirDrop, Quick Share, correo,
 * el gestor de archivos…
 *
 * No hay —ni va a haber— una API de AirDrop en la web, pero sí una que abre la
 * hoja de compartir del sistema, y AirDrop es una de sus opciones en iPadOS y
 * macOS, igual que Quick Share lo es en Android. Es la única vía de pasar algo
 * entre dispositivos sin red común y sin servidor por medio, que es justo lo
 * que le falta al enlace directo por QR: muchas wifis de centro aíslan a los
 * clientes entre sí y no dejan que los aparatos se vean.
 *
 * Donde no exista, se descarga y ya lo mueve el docente como quiera.
 *
 * Dentro de la app nativa (Capacitor) la descarga no existe: un `<a download>`
 * en WKWebView no hace nada, y el docente creía haber guardado la copia de
 * seguridad cuando no había salido nada. Ahí TODO pasa por la hoja de
 * compartir del sistema, que es donde están «Guardar en Archivos», AirDrop,
 * Mail y la impresora: el fichero se escribe en la caché de la app y se
 * entrega al sistema. Por eso `descargarFichero` es la única puerta de salida
 * de ficheros de toda la app: cualquier `a.download` suelto vuelve a fallar
 * en silencio en el iPad.
 */
import { esNativo } from '@/api'

export type ResultadoCompartir = 'compartido' | 'descargado' | 'cancelado'

/** ¿Puede este dispositivo abrir la hoja de compartir con un fichero dentro? */
export function puedeCompartirFicheros(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false
  try {
    // `canShare` con un fichero de mentira: es la única forma de saberlo sin
    // preguntar. Hay navegadores con `share` que no admiten adjuntos.
    return navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })
  } catch {
    return false
  }
}

function descargarEnNavegador(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  // Revocar demasiado pronto cancela la descarga en algunos navegadores
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '')
    lector.onerror = () => reject(lector.error ?? new Error('No se pudo leer el fichero'))
    lector.readAsDataURL(blob)
  })
}

/**
 * Hoja de compartir del sistema desde la app nativa.
 *
 * El plugin de compartir solo acepta ficheros que ya existan en disco, así
 * que el blob se escribe primero en la caché de la app (que el sistema puede
 * vaciar cuando quiera: no es un almacén) y se le pasa la ruta. Los plugins
 * se cargan bajo demanda para que la web no arrastre código que nunca usa.
 */
async function compartirNativo(nombre: string, blob: Blob, titulo: string): Promise<ResultadoCompartir> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const path = `compartir/${nombre}`
  const { uri } = await Filesystem.writeFile({
    path,
    data: await blobABase64(blob),
    directory: Directory.Cache,
    recursive: true,
  })
  try {
    await Share.share({ title: titulo, files: [uri], dialogTitle: titulo })
    return 'compartido'
  } catch (e: any) {
    // El plugin rechaza con «Share canceled» cuando el docente cierra la hoja:
    // no es un fallo del que haya que informar.
    if (/cancel/i.test(String(e?.message ?? e))) return 'cancelado'
    throw e
  } finally {
    // Algunos destinos leen el fichero después de cerrarse la hoja; se deja
    // un margen antes de retirarlo de la caché.
    setTimeout(() => {
      Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {})
    }, 60_000)
  }
}

/**
 * Entrega un fichero al docente: descarga en el navegador, hoja de compartir
 * del sistema en la app nativa. Es la ÚNICA función que debe usarse para
 * sacar un fichero de la app.
 */
export async function descargarFichero(
  nombre: string,
  contenido: Blob | string,
  mime = 'application/octet-stream',
  titulo = nombre,
): Promise<ResultadoCompartir> {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: mime })
  if (esNativo()) return compartirNativo(nombre, blob, titulo)
  descargarEnNavegador(nombre, blob)
  return 'descargado'
}

export async function compartirFichero(
  nombre: string, contenido: string, mime: string, titulo: string
): Promise<ResultadoCompartir> {
  const blob = new Blob([contenido], { type: mime })

  if (esNativo()) return compartirNativo(nombre, blob, titulo)

  if (puedeCompartirFicheros()) {
    try {
      await navigator.share({ files: [new File([blob], nombre, { type: mime })], title: titulo })
      return 'compartido'
    } catch (e: any) {
      // Que el docente cierre la hoja no es un fallo del que haya que informar
      if (e?.name === 'AbortError') return 'cancelado'
      // Cualquier otro problema: al menos que se lleve el fichero
      descargarEnNavegador(nombre, blob)
      return 'descargado'
    }
  }

  descargarEnNavegador(nombre, blob)
  return 'descargado'
}
