/**
 * Dónde NO vale imprimir desde un iframe oculto.
 *
 * En Safari —y en todo navegador del iPad, que es WebKit por obligación—
 * `iframe.contentWindow.print()` desde un iframe invisible no abre nada, y
 * en la app instalada en la pantalla de inicio (`standalone`) ni siquiera
 * existe la hoja de impresión: Luis pulsaba «Imprimir hojas», la app decía
 * «enviado a imprimir» y no salía nada, ni en el iPad ni en el Mac.
 */
export function esWebKit(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // El iPad con «sitio de escritorio» se presenta como Mac: lo delata el táctil.
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const safari = /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua)
  return ios || safari
}

/** Abierta desde el icono de la pantalla de inicio, sin barra del navegador. */
export function esAppInstalada(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
}
