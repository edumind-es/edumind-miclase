/**
 * El aspecto de la interfaz: el de siempre («clasico») o EDUmind-Lámina.
 *
 * Lámina se construye por fases y no se enseña a nadie hasta que esté entera
 * (versión 2.0.0): mientras tanto va apagada, y se enciende aparato a aparato
 * para probarla. Es una preferencia del aparato, como la vista del Calificador:
 * vive en `localStorage` y no se sincroniza.
 *
 * Todo lo que cambia con el aspecto cuelga de `<html data-aspecto="lamina">`
 * (lamina.css). Con el atributo ausente, la app es exactamente la de antes.
 *
 * Hasta que exista «Acerca de» (fase 1), se elige por la dirección:
 * `?aspecto=lamina` lo enciende y `?aspecto=clasico` lo apaga. Queda recordado.
 */
export type Aspecto = 'clasico' | 'lamina'

export const CLAVE_ASPECTO = 'miclase.aspecto'
/** El color de la barra del sistema con cada aspecto (`<meta name="theme-color">`). */
export const COLOR_SISTEMA: Record<Aspecto, string> = { clasico: '#0f2d4a', lamina: '#f4f2ec' }

/** Cualquier cosa que no sea «lamina» es el aspecto de siempre. */
export const normalizarAspecto = (v: unknown): Aspecto => (v === 'lamina' ? 'lamina' : 'clasico')

/** El aspecto que pide la dirección, o null si no pide ninguno (o pide uno que no existe). */
export function aspectoDeUrl(busqueda: string): Aspecto | null {
  const v = new URLSearchParams(busqueda).get('aspecto')
  return v === 'lamina' || v === 'clasico' ? v : null
}

/** La misma búsqueda sin el parámetro del aspecto, para limpiar la dirección. */
export function sinAspecto(busqueda: string): string {
  const p = new URLSearchParams(busqueda)
  p.delete('aspecto')
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function aspectoAhora(): Aspecto {
  try { return normalizarAspecto(localStorage.getItem(CLAVE_ASPECTO)) } catch { return 'clasico' }
}

function marcarDocumento(a: Aspecto) {
  const raiz = document.documentElement
  if (a === 'lamina') raiz.dataset.aspecto = 'lamina'
  else delete raiz.dataset.aspecto
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_SISTEMA[a])
}

/** Cambia el aspecto de este aparato y lo recuerda. */
export function fijarAspecto(a: Aspecto) {
  try { localStorage.setItem(CLAVE_ASPECTO, a) } catch { /* sin almacenamiento, vale para esta sesión */ }
  marcarDocumento(a)
}

/**
 * Antes de pintar nada: aplica lo que pida la dirección (y la limpia, para que
 * el parámetro no se quede en los enlaces ni en el historial) o, si no pide
 * nada, lo que el aparato recuerde.
 */
export function prepararAspecto() {
  const pedido = aspectoDeUrl(location.search)
  if (pedido) {
    fijarAspecto(pedido)
    history.replaceState(history.state, '', location.pathname + sinAspecto(location.search) + location.hash)
  } else marcarDocumento(aspectoAhora())
}
