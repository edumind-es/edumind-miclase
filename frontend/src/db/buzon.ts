/**
 * ¿Ofrece el servidor el buzón de sincronización?
 *
 * El buzón es opcional y quien aloja el servidor puede cerrarlo
 * (`MICLASE_BUZON=cerrado`, ver backend/src/config.js). Sin buzón la cuenta
 * EDUmind no sirve para nada en MiClase, así que tampoco se ofrece.
 *
 * La respuesta se recuerda en el aparato porque la lee también quien no
 * puede esperar a la red: el aviso de copia de Inicio (`copia.ts`) contaba el
 * buzón como copia con la sincronización automática activa, y con el buzón
 * cerrado esa copia ya no existe.
 */
import { api } from '../api'

const K_CERRADO = 'miclase.buzon.cerrado'

/** Lo último que dijo el servidor. Sin respuesta todavía, abierto: lo de siempre. */
export function buzonCerrado(): boolean {
  try { return localStorage.getItem(K_CERRADO) === '1' } catch { return false }
}

/**
 * Pregunta al servidor. `null` si no se sabe: sin red, o un servidor anterior
 * que no tiene la ruta (404) y que por tanto sigue ofreciendo el buzón.
 */
export async function consultarBuzon(): Promise<boolean | null> {
  try {
    const r = await fetch(api('/api/sync/disponible'))
    if (r.status === 404) return true
    if (!r.ok) return null
    const abierto = (await r.json())?.abierto !== false
    try { localStorage.setItem(K_CERRADO, abierto ? '0' : '1') } catch { /* sin almacenamiento */ }
    return abierto
  } catch {
    return null
  }
}
