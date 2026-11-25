/**
 * El aspecto de la interfaz: EDUmind-Lámina (el de la 2.0.0, por defecto) o el
 * de siempre («clasico»), que se conserva para quien lo prefiera.
 *
 * Es una preferencia del aparato, como la vista del Calificador: vive en
 * `localStorage` y no se sincroniza.
 *
 * Todo lo que cambia con el aspecto cuelga de `<html data-aspecto="lamina">`
 * (lamina.css). Con el atributo ausente, la app es la de antes de la 2.0.0.
 *
 * Se cambia en «Acerca de» (con Lámina) o en el pie del menú (con el de
 * siempre), y también por la dirección: `?aspecto=lamina` y `?aspecto=clasico`.
 * Queda recordado.
 */
export type Aspecto = 'clasico' | 'lamina'

export const CLAVE_ASPECTO = 'miclase.aspecto'
/** Se lanza en `window` al cambiar el aspecto, para que el marco se repinte. */
export const EVENTO_ASPECTO = 'miclase:aspecto'
/** El color de la barra del sistema con cada aspecto (`<meta name="theme-color">`). */
export const COLOR_SISTEMA: Record<Aspecto, string> = { clasico: '#0f2d4a', lamina: '#f4f2ec' }

/**
 * El aspecto de un aparato que no ha elegido ninguno: Lámina desde la 2.0.0
 * (25/11/2026, tras probarla Luis en el iPad). `VITE_ASPECTO=clasico` al
 * compilar lo deja en el de siempre, que es como se pasa la tanda de pruebas
 * entera con el aspecto antiguo mientras se conserve.
 */
const entorno = (import.meta as { env?: Record<string, string | undefined> }).env
export const ASPECTO_POR_DEFECTO: Aspecto = entorno?.VITE_ASPECTO === 'clasico' ? 'clasico' : 'lamina'

/** Lo que el aparato guardó, o el aspecto por defecto si no guardó nada (o guardó otra cosa). */
export const normalizarAspecto = (v: unknown, defecto: Aspecto = ASPECTO_POR_DEFECTO): Aspecto =>
  (v === 'lamina' || v === 'clasico' ? v : defecto)

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
  try { return normalizarAspecto(localStorage.getItem(CLAVE_ASPECTO)) } catch { return ASPECTO_POR_DEFECTO }
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
  window.dispatchEvent(new Event(EVENTO_ASPECTO))
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
