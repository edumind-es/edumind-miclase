/**
 * Dirección del servidor de EDUmind.
 *
 * En la web la app y el API comparten origen: nginx hace de proxy de `/api/`,
 * así que basta la ruta relativa. Dentro del contenedor nativo (Capacitor) la
 * app se sirve desde `https://localhost`, y una ruta relativa iría al propio
 * contenedor en vez de al servidor: ahí hace falta la URL absoluta.
 *
 * El servidor es configurable para que un centro pueda apuntar la app a su
 * propia instalación sin recompilar.
 */

const SERVIDOR_POR_DEFECTO = 'https://miclase.edumind.es'
const K_SERVIDOR = 'miclase_servidor'

/** ¿Estamos dentro del contenedor nativo de iOS o Android? */
export function esNativo(): boolean {
  const cap = (globalThis as any).Capacitor
  return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false
}

export function plataforma(): 'ios' | 'android' | 'web' {
  const cap = (globalThis as any).Capacitor
  const p = typeof cap?.getPlatform === 'function' ? cap.getPlatform() : 'web'
  return p === 'ios' || p === 'android' ? p : 'web'
}

/** Servidor configurado. Cadena vacía en web = mismo origen. */
export function servidor(): string {
  if (!esNativo()) return ''
  return (localStorage.getItem(K_SERVIDOR) || SERVIDOR_POR_DEFECTO).replace(/\/+$/, '')
}

export function fijarServidor(url: string): void {
  const limpia = url.trim().replace(/\/+$/, '')
  if (limpia) localStorage.setItem(K_SERVIDOR, limpia)
  else localStorage.removeItem(K_SERVIDOR)
}

/** Construye la URL de una ruta del API. Úsese en TODA llamada a `/api/…`. */
export function api(ruta: string): string {
  return servidor() + ruta
}
