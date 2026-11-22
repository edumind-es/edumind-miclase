/**
 * Un diálogo solo se cierra «pulsando fuera» si la pulsación EMPEZÓ fuera.
 *
 * Todos los diálogos cierran con un clic en su velo (`.modal-overlay`). Pero
 * el navegador también da por clic en el velo un arrastre que empieza dentro
 * de la tarjeta y se suelta fuera: seleccionar texto deprisa en un campo, o
 * soltar una barra de scroll más allá del borde. A Luis se le cerraba el
 * diálogo a medio escribir y aparecía la pantalla de detrás.
 *
 * Se arregla aquí para TODOS los diálogos a la vez, como el foco en
 * `utils/foco.ts`, sin tocarlos uno a uno: se recuerda dónde empezó y
 * dónde se soltó la pulsación y, si el clic cae en un velo pero no empezó y
 * terminó en ese mismo velo, no llega a React. Un clic sin puntero (teclado, `.click()` de una prueba)
 * pasa siempre.
 *
 * El scroll que se sale del diálogo —la otra mitad del problema— se retiene
 * en `index.css` con `overscroll-behavior`.
 *
 * `instalarVelo()` se llama una vez, en `main.tsx`.
 */

let instalado = false

export function instalarVelo(): void {
  if (instalado || typeof document === 'undefined') return
  instalado = true

  /** Dónde empezó y dónde se soltó la pulsación en curso. */
  let inicio: EventTarget | null = null
  let fin: EventTarget | null = null

  document.addEventListener('pointerdown', e => { inicio = e.target; fin = null }, true)
  document.addEventListener('pointerup', e => { fin = e.target }, true)

  // En captura y en el documento: va antes que los manejadores de React.
  document.addEventListener('click', e => {
    const empezoEn = inicio, soltoEn = fin
    inicio = fin = null
    const destino = e.target
    if (!(destino instanceof HTMLElement) || !destino.classList.contains('modal-overlay')) return
    // `detail` 0: no viene de un puntero, nadie ha arrastrado nada.
    if (e.detail === 0 || empezoEn === null) return
    // Empezar en el velo y soltar en la tarjeta (o al revés) también llega
    // como clic en el velo, que es el antepasado común de los dos.
    if (empezoEn !== destino || (soltoEn !== null && soltoEn !== destino)) { e.stopPropagation(); e.preventDefault() }
  }, true)
}
