/**
 * Topes de tamaño de las evidencias, en un solo sitio.
 *
 * Estaban repartidos en seis cifras que no encajaban entre sí: 5 MB de aviso
 * al docente, 8 MB de rechazo del servidor, 12 MB de corte del cliente, 25 MB
 * de IndexedDB, 20 MB de nginx y 64 MB de Fastify. El resultado era que una
 * evidencia de entre 5 y 8 MB sincronizaba pese al aviso, y una de entre 8 y
 * 12 MB se enviaba, el servidor la descartaba y el docente solo veía
 * «conflictos: 1».
 *
 * La cadena real, de dentro afuera:
 *
 *   blob en bruto  →  base64 (+33%)  →  sobre cifrado  →  tanda  →  petición
 *
 * El eslabón que manda es el sobre: el servidor rechaza por registro. Todo lo
 * demás se deriva de ahí.
 */

/**
 * Lo máximo que acepta el servidor en un solo registro.
 * Debe coincidir con LIMITE_PAYLOAD de backend/src/routes/sync.js.
 */
export const LIMITE_SOBRE = 8 * 1024 * 1024

/**
 * A partir de aquí la evidencia ya no cabrá en un sobre.
 *
 * base64 infla un tercio (4/3), y el JSON del registro añade sus campos, así
 * que se deja medio mega de holgura. Por encima de este tamaño la evidencia se
 * guarda igual —es del docente y es local— pero no viaja, y hay que decírselo
 * en el momento de capturarla, no cuando falle el sync.
 */
export const LIMITE_EVIDENCIA_SINC = Math.floor(LIMITE_SOBRE * 3 / 4) - 512 * 1024

/** Tope duro: por encima de esto la cuota de IndexedDB sufre de verdad. */
export const LIMITE_EVIDENCIA = 25 * 1024 * 1024

/**
 * Tamaño máximo de una tanda de envío.
 *
 * nginx corta las peticiones a miclase.edumind.es en 20 MB
 * (`client_max_body_size 20m`). Se cierra la tanda antes de llegar ahí: más
 * vale mandar cinco peticiones que comerse un 413 y perder la tanda entera.
 */
export const LIMITE_ENVIO = 12 * 1024 * 1024

/** Registros por tanda. El servidor admite hasta 500 (LIMITE_LOTE). */
export const LOTE = 200

/** Formatea bytes en MB con un decimal, para los avisos al docente. */
export function enMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}
