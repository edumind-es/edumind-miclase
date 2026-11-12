/**
 * El foco se queda dentro del diálogo abierto.
 *
 * Con un diálogo delante, el tabulador recorría también lo de detrás: quien
 * usa teclado (o un lector de pantalla en el iPad) acababa pulsando botones
 * que no veía. Aquí se arregla para TODOS los diálogos a la vez, sin tocarlos
 * uno a uno: cualquier cosa con `.modal-overlay` cuenta, y manda el último
 * del documento, que es el que está encima.
 *
 * - Al abrirse uno, se recuerda dónde estaba el foco y se lleva al diálogo
 *   (a la tarjeta, no a un campo: en el iPad enfocar un campo abre el teclado
 *   sin que nadie lo haya pedido). Si el diálogo ya puso el foco dentro, se
 *   respeta.
 * - El tabulador da la vuelta dentro del diálogo.
 * - Al cerrarse, el foco vuelve a donde estaba.
 *
 * `instalarFoco()` se llama una vez, en `main.tsx`.
 */

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** El diálogo que está encima, o null. */
function dialogoDeArriba(): HTMLElement | null {
  const velos = document.getElementsByClassName('modal-overlay')
  // De atrás adelante, y solo los que se ven: uno montado pero oculto no retiene nada.
  for (let i = velos.length - 1; i >= 0; i--) {
    const v = velos[i] as HTMLElement
    if (v.getClientRects().length > 0) return v
  }
  return null
}

/** Lo que se puede enfocar y se ve dentro de un nodo. */
export function enfocablesDe(nodo: HTMLElement): HTMLElement[] {
  return Array.from(nodo.querySelectorAll<HTMLElement>(ENFOCABLES))
    .filter(e => e.getClientRects().length > 0)
}

let instalado = false

export function instalarFoco(): void {
  if (instalado || typeof document === 'undefined') return
  instalado = true

  /** Un diálogo abierto y adónde devolver el foco cuando se cierre. */
  const pila: { velo: HTMLElement; antes: HTMLElement | null }[] = []

  const repasar = () => {
    // Los que se han cerrado: el foco vuelve al sitio del último.
    let volver: HTMLElement | null = null
    while (pila.length && !pila[pila.length - 1].velo.isConnected) volver = pila.pop()!.antes
    for (let i = pila.length - 1; i >= 0; i--) if (!pila[i].velo.isConnected) pila.splice(i, 1)

    const arriba = dialogoDeArriba()
    if (arriba && !pila.some(x => x.velo === arriba)) {
      pila.push({ velo: arriba, antes: document.activeElement instanceof HTMLElement ? document.activeElement : null })
      if (!arriba.contains(document.activeElement)) {
        const tarjeta = (arriba.querySelector('[role="dialog"], [role="alertdialog"]') ?? arriba.firstElementChild ?? arriba) as HTMLElement
        if (!tarjeta.hasAttribute('tabindex')) tarjeta.setAttribute('tabindex', '-1')
        tarjeta.focus({ preventScroll: true })
      }
      return
    }
    if (volver && volver.isConnected && (document.activeElement === document.body || document.activeElement === null)) {
      volver.focus({ preventScroll: true })
    }
  }

  // Los velos entran y salen con React: se mira cuando cambia el documento.
  // La lista de velos es viva y consultarla no cuesta nada.
  let pendiente = false
  new MutationObserver(() => {
    if (pendiente) return
    pendiente = true
    queueMicrotask(() => { pendiente = false; repasar() })
  }).observe(document.body, { childList: true, subtree: true })

  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return
    const arriba = dialogoDeArriba()
    if (!arriba) return
    const lista = enfocablesDe(arriba)
    if (lista.length === 0) { e.preventDefault(); return }
    const primero = lista[0], ultimo = lista[lista.length - 1]
    const activo = document.activeElement as HTMLElement | null
    if (!activo || !arriba.contains(activo)) { e.preventDefault(); primero.focus(); return }
    if (e.shiftKey && (activo === primero || !lista.includes(activo))) { e.preventDefault(); ultimo.focus(); return }
    if (!e.shiftKey && activo === ultimo) { e.preventDefault(); primero.focus() }
  }, true)
}
