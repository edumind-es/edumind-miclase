/**
 * El idioma de la app en este aparato: castellano o galego.
 *
 * Es una preferencia del aparato, como la vista del Calificador: vive en
 * `localStorage` (`miclase.idioma`) y no se sincroniza. Sin elección guardada,
 * `ElegirIdioma` pregunta al abrir la app; hasta entonces se pinta en el
 * idioma que propone el navegador.
 *
 * Los textos están en `textos.ts` (puro). Una pantalla los pide con
 * `const t = useT()` y `t('menu.inicio')`; fuera de React, con `t()`.
 * Al cambiar de idioma se avisa con el evento `miclase:idioma` y cada
 * componente que usa `useT` se vuelve a pintar.
 */
import { useEffect, useState } from 'react'
import { esIdioma, idiomaPropuesto, LOCALE, traducir, type Clave, type Idioma, type Variables } from './textos'

export { IDIOMAS, NOMBRE_IDIOMA, type Idioma, type Clave } from './textos'

const CLAVE = 'miclase.idioma'
const EVENTO = 'miclase:idioma'

/** El idioma elegido en este aparato, o null si aún no se ha elegido. */
export function idiomaElegido(): Idioma | null {
  try {
    const v = localStorage.getItem(CLAVE)
    return esIdioma(v) ? v : null
  } catch { return null }
}

function propuesto(): Idioma {
  if (typeof navigator === 'undefined') return 'es'
  return idiomaPropuesto(navigator.languages?.length ? navigator.languages : [navigator.language ?? 'es'])
}

/** El idioma con el que se pinta ahora: el elegido o, sin elegir, el propuesto. */
export function idiomaAhora(): Idioma {
  return idiomaElegido() ?? propuesto()
}

/** El que se ofrece marcado en la pregunta de la primera vez. */
export function idiomaInicial(): Idioma {
  return propuesto()
}

function marcarDocumento(i: Idioma) {
  if (typeof document !== 'undefined') document.documentElement.lang = i
}

export function fijarIdioma(i: Idioma) {
  try { localStorage.setItem(CLAVE, i) } catch { /* sin almacenamiento: dura lo que la sesión */ }
  marcarDocumento(i)
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: i }))
}

/** Para el arranque: deja `<html lang>` con el idioma que toca antes de pintar. */
export function prepararIdioma() {
  marcarDocumento(idiomaAhora())
}

/** Traducir fuera de React (mensajes de `confirmar`, documentos…). */
export function t(clave: Clave, vars?: Variables): string {
  return traducir(idiomaAhora(), clave, vars)
}

/** La configuración regional para fechas y números del idioma activo. */
export function localeAhora(): string {
  return LOCALE[idiomaAhora()]
}

/** El idioma activo; repinta al cambiarlo. */
export function useIdioma(): Idioma {
  const [idioma, setIdioma] = useState<Idioma>(idiomaAhora)
  useEffect(() => {
    const alCambiar = () => setIdioma(idiomaAhora())
    window.addEventListener(EVENTO, alCambiar)
    return () => window.removeEventListener(EVENTO, alCambiar)
  }, [])
  return idioma
}

/** `const t = useT()` en un componente: traduce y repinta al cambiar de idioma. */
export function useT(): (clave: Clave, vars?: Variables) => string {
  const idioma = useIdioma()
  return (clave, vars) => traducir(idioma, clave, vars)
}
