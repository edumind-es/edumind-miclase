/**
 * Copia automática en una carpeta: hacerla, saber cuándo fue la última y
 * restaurarla.
 *
 * Es una copia **incremental y cifrada**: cada vez se escribe un paquete con
 * lo que ha cambiado desde la anterior (mismo formato que el de AirDrop, misma
 * contraseña de sincronización) y se actualiza el manifiesto. El cursor es
 * propio (`'copia'`): lo que ya está en la carpeta no tiene que ver con lo
 * que ya se subió al buzón o se pasó a otro aparato.
 *
 * Restaurar es lo contrario: leer el manifiesto, desbloquear con la
 * contraseña si este aparato no la tiene aún, y aplicar los paquetes en
 * orden con la fusión de siempre. Funciona en un aparato nuevo y en el mismo
 * aparato después de que el navegador haya vaciado el almacén.
 */
import { idDispositivo } from './ids'
import {
  aplicarPaquete, claveGuardada, configLocal, desbloquearPorPaquete, empaquetarParaOtroDispositivo,
  leerPaquete, metaSync, sellarCursorDeCopia, ultimaSincronizacion, type ResultadoSync,
} from './sync'
import type { DestinoCopia } from './destinoCopia'
import {
  FICHERO_MANIFIESTO, diagnosticoCopia, leerManifiesto, nombreFicheroCopia, nuevoManifiesto,
  ordenarFicherosCopia, type Diagnostico, type Manifiesto,
} from './copiaFormato'

const K_ULTIMA = 'copia_ultima'
const K_ERROR = 'copia_error'
const K_PRIMER_USO = 'copia_primer_uso'
const K_AUTO_SYNC = 'miclase_sync_auto'
/**
 * Lo último que se escribió: el sello más alto y qué registros lo llevaban.
 * El cursor de envío es «desde este sello incluido» —el buzón descarta el
 * repetido como versión ya conocida—, pero en una carpeta eso escribía un
 * fichero con el mismo sobre en cada pasada. Aquí se descarta antes.
 */
const K_YA = 'copia_ultimo_sello'
type UltimoSello = { sello: string; claves: string[] }

export type ResultadoCopia = {
  /** Sobres escritos en el paquete nuevo; 0 si no había nada que copiar. */
  sobres: number
  fichero: string | null
  manifiesto: Manifiesto
  resultado: ResultadoSync
}

async function manifiestoDe(destino: DestinoCopia): Promise<Manifiesto | null> {
  const texto = await destino.leer(FICHERO_MANIFIESTO)
  return texto ? leerManifiesto(texto) : null
}

/**
 * Hace la copia. Si no hay nada nuevo, solo sella `ultima` en el manifiesto
 * (así «última copia: hoy» es verdad: se ha comprobado). Si escribir falla,
 * el cursor vuelve atrás y lo pendiente saldrá en la siguiente.
 */
export async function hacerCopia(destino: DestinoCopia): Promise<ResultadoCopia> {
  if (!(await claveGuardada())) throw new Error('Este dispositivo no tiene contraseña de sincronización: créala en Sincronizar')
  const ahora = new Date().toISOString()
  const { salt, verificador } = await configLocal()
  const manifiesto = (await manifiestoDe(destino)) ?? nuevoManifiesto(idDispositivo(), salt, verificador, ahora)
  // El manifiesto lleva la sal y el verificador de quien escribe: si otro
  // aparato (misma contraseña) empieza a copiar aquí, no cambian.
  manifiesto.salt ??= salt
  manifiesto.verificador ??= verificador

  const { paquete, resultado, deshacer } = await empaquetarParaOtroDispositivo({ canal: 'copia' })
  const ya = await metaSync.leer<UltimoSello | null>(K_YA, null)
  if (ya) {
    const repetidos = new Set(ya.claves)
    paquete.sobres = paquete.sobres.filter(s => !(s.updated_at === ya.sello && repetidos.has(`${s.tabla}:${s.registro_id}`)))
  }
  let fichero: string | null = null
  try {
    if (paquete.sobres.length) {
      fichero = nombreFicheroCopia(ahora, idDispositivo())
      await destino.escribir(fichero, JSON.stringify(paquete))
      manifiesto.ficheros += 1
      const sello = paquete.sobres.reduce((m, s) => (s.updated_at > m ? s.updated_at : m), '')
      await metaSync.guardar(K_YA, { sello, claves: paquete.sobres.filter(s => s.updated_at === sello).map(s => `${s.tabla}:${s.registro_id}`) } satisfies UltimoSello)
    }
    manifiesto.ultima = ahora
    await destino.escribir(FICHERO_MANIFIESTO, JSON.stringify(manifiesto, null, 2))
  } catch (e) {
    await deshacer()
    await metaSync.guardar(K_ERROR, e instanceof Error ? e.message : String(e))
    throw e
  }
  await metaSync.guardar(K_ULTIMA, ahora)
  await metaSync.guardar(K_ERROR, null)
  return { sobres: paquete.sobres.length, fichero, manifiesto, resultado }
}

export async function ultimaCopia(): Promise<string | null> {
  return metaSync.leer<string | null>(K_ULTIMA, null)
}

export async function ultimoErrorDeCopia(): Promise<string | null> {
  return metaSync.leer<string | null>(K_ERROR, null)
}

/** Lo que hay en una carpeta antes de restaurar: para decirlo y pedir la contraseña si hace falta. */
export async function inspeccionarCopia(destino: DestinoCopia): Promise<{ manifiesto: Manifiesto; ficheros: string[]; necesitaContrasena: boolean }> {
  const manifiesto = await manifiestoDe(destino)
  if (!manifiesto) throw new Error(`En «${destino.nombre}» no hay ninguna copia de MiClase (falta ${FICHERO_MANIFIESTO})`)
  const ficheros = ordenarFicherosCopia(await destino.listar())
  return { manifiesto, ficheros, necesitaContrasena: !(await claveGuardada()) }
}

/**
 * Aplica todos los paquetes de la carpeta, en orden. Con `password`, antes
 * desbloquea este aparato con la sal y el verificador del manifiesto.
 */
export async function restaurarDesdeCopia(destino: DestinoCopia, password?: string): Promise<{
  ficheros: number
  resultado: ResultadoSync
}> {
  const { manifiesto, ficheros } = await inspeccionarCopia(destino)
  if (!(await claveGuardada())) {
    if (!password) throw new Error('Hace falta la contraseña de sincronización con la que se hizo la copia')
    await desbloquearPorPaquete(password, {
      formato: 'miclase-sync', version: 1, device_id: manifiesto.device_id, creado: manifiesto.creado,
      salt: manifiesto.salt, verificador: manifiesto.verificador, sobres: [],
    })
  }
  const total: ResultadoSync = {
    enviados: 0, recibidos: 0, aplicados: 0, descartados: 0, conflictos: 0,
    fusionados: 0, detalleFusion: [], errores: [],
  }
  for (const nombre of ficheros) {
    const texto = await destino.leer(nombre)
    if (!texto) { total.errores.push(`${nombre}: no se pudo leer`); continue }
    let r: ResultadoSync
    try {
      r = await aplicarPaquete(leerPaquete(texto), { restaurar: true })
    } catch (e) {
      total.errores.push(`${nombre}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    total.recibidos += r.recibidos; total.aplicados += r.aplicados; total.descartados += r.descartados
    total.fusionados += r.fusionados; total.detalleFusion.push(...r.detalleFusion); total.errores.push(...r.errores)
    if (r.sinDescifrar) total.sinDescifrar = (total.sinDescifrar ?? 0) + r.sinDescifrar
  }
  // Lo restaurado ya está en la carpeta: no hay que volver a copiarlo, y la
  // última copia válida es la que dice el manifiesto.
  await sellarCursorDeCopia()
  if (manifiesto.ultima) await metaSync.guardar(K_ULTIMA, manifiesto.ultima)
  return { ficheros: ficheros.length, resultado: total }
}

/** ¿Hay copia válida fuera del aparato? Para la tarjeta de Inicio y la de Sincronizar. */
export async function diagnostico(): Promise<Diagnostico> {
  let primerUso = await metaSync.leer<string | null>(K_PRIMER_USO, null)
  if (!primerUso) {
    primerUso = new Date().toISOString()
    await metaSync.guardar(K_PRIMER_USO, primerUso)
  }
  let autoSync = false
  try { autoSync = localStorage.getItem(K_AUTO_SYNC) === '1' } catch { /* sin almacenamiento */ }
  return diagnosticoCopia({
    ultimaCopia: await ultimaCopia(),
    ultimaSync: await ultimaSincronizacion(),
    autoSync,
    primerUso,
  })
}
