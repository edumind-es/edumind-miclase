/**
 * Formato de la copia automática en carpeta, y la regla de «copia vieja».
 *
 * Es la parte pura —sin IndexedDB ni ficheros— para poder probarla en Node.
 *
 * La carpeta contiene un manifiesto y una serie de paquetes incrementales.
 * Cada paquete es EXACTAMENTE el mismo fichero que sale por AirDrop
 * (`PaqueteSync`, sobres cifrados con la contraseña de sincronización): así
 * restaurar es aplicar los paquetes en orden con el código de siempre, y un
 * paquete suelto de la carpeta se puede importar también a mano. Quien no
 * tenga la contraseña ve lo mismo que ve el buzón —tabla, id y fecha— y nada
 * más, así que la carpeta puede vivir en iCloud Drive, Dropbox o OneDrive.
 */
import { EXTENSION } from './transporteFichero'

export const FICHERO_MANIFIESTO = 'MiClase.copia.json'
/** Días sin copia a partir de los que se avisa en Inicio. */
export const DIAS_AVISO = 7

export type Manifiesto = {
  formato: 'miclase-copia'
  version: 1
  /** Aparato que escribe en esta carpeta. */
  device_id: string
  /** Para que un aparato nuevo desbloquee con la contraseña sin servidor. */
  salt: string | null
  verificador: string | null
  creado: string
  ultima: string | null
  ficheros: number
}

/** `copia-20261008T161200000Z-ab12cd34.miclasesync.json`: ordena por nombre = ordena por fecha. */
export function nombreFicheroCopia(sello: string, deviceId: string): string {
  const compacto = sello.replace(/[-:.]/g, '')
  return `copia-${compacto}-${deviceId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}${EXTENSION}`
}

export function esFicheroCopia(nombre: string): boolean {
  return /^copia-\d{8}T\d{6,9}Z-[a-zA-Z0-9]+\.miclasesync\.json$/.test(nombre)
}

/** Los paquetes de la carpeta en el orden en que hay que aplicarlos. */
export function ordenarFicherosCopia(nombres: string[]): string[] {
  return nombres.filter(esFicheroCopia).sort()
}

export function nuevoManifiesto(deviceId: string, salt: string | null, verificador: string | null, ahora = new Date().toISOString()): Manifiesto {
  return { formato: 'miclase-copia', version: 1, device_id: deviceId, salt, verificador, creado: ahora, ultima: null, ficheros: 0 }
}

export function leerManifiesto(texto: string): Manifiesto {
  let m: any
  try { m = JSON.parse(texto) } catch { throw new Error('El manifiesto de la copia no se puede leer') }
  if (m?.formato !== 'miclase-copia') throw new Error('Esa carpeta no tiene una copia de MiClase')
  if (m.version !== 1) throw new Error('Esa copia es de una versión más nueva de la app')
  return m as Manifiesto
}

/** Días enteros desde `iso`; `null` si nunca. */
export function diasDesde(iso: string | null, ahora = Date.now()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((ahora - t) / 86_400_000))
}

export type Diagnostico = {
  nivel: 'ok' | 'aviso' | 'nunca' | 'reciente'
  /** Días desde la última copia válida, por el camino que sea. */
  dias: number | null
  via: 'carpeta' | 'buzon' | null
  texto: string
}

/**
 * ¿Hay una copia válida fuera del aparato? Cuenta la carpeta y, si la
 * sincronización automática está activa, también el buzón: una sincronización
 * reciente es una copia cifrada en el servidor aunque no se llame así.
 *
 * `primerUso` evita avisar el primer día: sin ninguna copia, se calla hasta
 * que pasan `DIAS_AVISO` días desde que se empezó a usar la app.
 */
export function diagnosticoCopia(p: {
  ultimaCopia: string | null
  ultimaSync: string | null
  autoSync: boolean
  primerUso: string | null
}, ahora = Date.now()): Diagnostico {
  const candidatos: Array<{ via: 'carpeta' | 'buzon'; iso: string }> = []
  if (p.ultimaCopia) candidatos.push({ via: 'carpeta', iso: p.ultimaCopia })
  if (p.autoSync && p.ultimaSync) candidatos.push({ via: 'buzon', iso: p.ultimaSync })
  const mejor = candidatos.sort((a, b) => b.iso.localeCompare(a.iso))[0]
  if (!mejor) {
    const desdeInicio = diasDesde(p.primerUso, ahora)
    if (desdeInicio == null || desdeInicio < DIAS_AVISO) {
      return { nivel: 'reciente', dias: null, via: null, texto: 'Todavía no hay ninguna copia fuera de este aparato.' }
    }
    return { nivel: 'nunca', dias: null, via: null, texto: `Llevas ${desdeInicio} días usando la app sin ninguna copia fuera de este aparato.` }
  }
  const dias = diasDesde(mejor.iso, ahora) ?? 0
  const donde = mejor.via === 'carpeta' ? 'en tu carpeta' : 'en el buzón cifrado'
  if (dias >= DIAS_AVISO) {
    return { nivel: 'aviso', dias, via: mejor.via, texto: `La última copia ${donde} es de hace ${dias} días.` }
  }
  return { nivel: 'ok', dias, via: mejor.via, texto: dias === 0 ? `Copia ${donde} de hoy.` : `Última copia ${donde}: hace ${dias} día${dias !== 1 ? 's' : ''}.` }
}
