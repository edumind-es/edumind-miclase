/**
 * Cómo se pinta una nota con el aspecto Lámina: en filete o en relleno.
 *
 *  · filete:  la cifra en tinta sobre el papel y una raya debajo del color del
 *             semáforo. Es lo que se ve por defecto.
 *  · relleno: la casilla entera del color del semáforo con la cifra en blanco,
 *             como ha sido siempre.
 *
 * Lo elige el docente en «Acerca de» (decisión de Luis, nov 2026: le gustó el
 * filete y pidió que cada uno pueda elegir). Es una preferencia del aparato
 * (`miclase.notas`), no se sincroniza, y solo cambia cómo se ve: la nota y su
 * color salen de `calculo.ts`, igual en los dos modos.
 */
export type ModoNotas = 'filete' | 'relleno'

export const CLAVE_NOTAS = 'miclase.notas'
export const EVENTO_NOTAS = 'miclase:notas'

export const normalizarModoNotas = (v: unknown): ModoNotas => (v === 'relleno' ? 'relleno' : 'filete')

export function modoNotasAhora(): ModoNotas {
  try { return normalizarModoNotas(localStorage.getItem(CLAVE_NOTAS)) } catch { return 'filete' }
}

export function fijarModoNotas(m: ModoNotas) {
  try { localStorage.setItem(CLAVE_NOTAS, m) } catch { /* sin almacenamiento, vale para esta sesión */ }
  document.documentElement.dataset.notas = m
  window.dispatchEvent(new Event(EVENTO_NOTAS))
}

/** Antes de pintar: `<html data-notas="…">`, que es de donde cuelga lamina.css. */
export function prepararNotas() {
  document.documentElement.dataset.notas = modoNotasAhora()
}
