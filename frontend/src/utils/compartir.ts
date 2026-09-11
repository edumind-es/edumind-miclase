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
 */

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

function descargar(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  // Revocar demasiado pronto cancela la descarga en algunos navegadores
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function compartirFichero(
  nombre: string, contenido: string, mime: string, titulo: string
): Promise<ResultadoCompartir> {
  const blob = new Blob([contenido], { type: mime })

  if (puedeCompartirFicheros()) {
    try {
      await navigator.share({ files: [new File([blob], nombre, { type: mime })], title: titulo })
      return 'compartido'
    } catch (e: any) {
      // Que el docente cierre la hoja no es un fallo del que haya que informar
      if (e?.name === 'AbortError') return 'cancelado'
      // Cualquier otro problema: al menos que se lleve el fichero
      descargar(nombre, blob)
      return 'descargado'
    }
  }

  descargar(nombre, blob)
  return 'descargado'
}
