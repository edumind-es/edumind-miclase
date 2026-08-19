/**
 * Identificadores seguros entre dispositivos.
 *
 * El esquema original usa enteros autoincrementales (1, 2, 3…). Con dos
 * dispositivos sincronizando eso es una bomba: ambos crean el grupo id=1 y
 * al fusionar las notas de uno acaban colgando del grupo del otro.
 *
 * Solución sin reescribir todas las claves foráneas: cada dispositivo se
 * reserva un rango propio.
 *
 *     id = base_dispositivo · 2^26 + contador
 *
 * `base` es un entero aleatorio de 20 bits (1…1.048.575) que se fija una
 * sola vez por navegador; `contador` da 67 millones de registros por
 * dispositivo. El id máximo queda en ~2^46, muy por debajo del entero
 * seguro de JavaScript (2^53).
 *
 * La base 0 queda reservada para los registros heredados de antes de este
 * esquema (ids 1…N), que por construcción no chocan con ninguna base ≥ 1.
 *
 * Se apoya en localStorage porque debe ser SÍNCRONO: se llama desde dentro
 * de transacciones Dexie, donde no se puede esperar a otra lectura async.
 */

const K_BASE = 'miclase_device_base'
const K_SEQ  = 'miclase_id_seq'
const K_DEV  = 'miclase_device_id'

const BITS_CONTADOR = 26
const FACTOR = 2 ** BITS_CONTADOR

function leerEntero(clave: string): number {
  const v = Number(localStorage.getItem(clave))
  return Number.isSafeInteger(v) && v > 0 ? v : 0
}

/** Base de rango de este dispositivo. Se crea en el primer uso. */
export function baseDispositivo(): number {
  let base = leerEntero(K_BASE)
  if (!base) {
    // 20 bits aleatorios criptográficos, nunca 0
    base = (crypto.getRandomValues(new Uint32Array(1))[0] % 0xfffff) + 1
    localStorage.setItem(K_BASE, String(base))
  }
  return base
}

/** Identificador legible del dispositivo (para la pantalla de sincronización). */
export function idDispositivo(): string {
  let id = localStorage.getItem(K_DEV)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(K_DEV, id)
  }
  return id
}

/**
 * Siguiente id libre de este dispositivo. Síncrono y monótono.
 * El contador se persiste en cada llamada para que sobreviva a un cierre
 * abrupto del navegador (nunca se reutiliza un id ya entregado).
 */
export function nuevoId(): number {
  const base = baseDispositivo()
  const seq = leerEntero(K_SEQ) + 1
  localStorage.setItem(K_SEQ, String(seq))
  if (seq >= FACTOR) {
    throw new Error('Rango de identificadores del dispositivo agotado')
  }
  return base * FACTOR + seq
}

/** ¿Este id procede del esquema antiguo (anterior al reparto por rangos)? */
export function esIdHeredado(id: number): boolean {
  return id < FACTOR
}

/** Marca temporal de modificación — base del merge last-write-wins. */
export function sello(): string {
  return new Date().toISOString()
}
