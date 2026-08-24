/**
 * Sincronización multi-dispositivo cifrada de extremo a extremo.
 *
 * Modelo: cada registro viaja como un sobre independiente cifrado con
 * AES-256-GCM. El servidor almacena y reparte esos sobres sin poder
 * abrirlos; solo ve tabla, id, fecha de modificación y dispositivo, que
 * es lo mínimo para servir sincronizaciones incrementales.
 *
 * Convergencia: last-write-wins por registro comparando `updated_at`.
 * Los borrados viajan como registros con `deleted_at`, nunca como
 * ausencias — un borrado silencioso reaparecería en el siguiente sync.
 *
 * Colisión de identificadores: resuelta aguas arriba en `ids.ts`, donde
 * cada dispositivo genera ids en su propio rango.
 */
import { db, TABLAS_SINC, type TablaSinc } from './localDb'
import { idDispositivo, sello } from './ids'
import { LIMITE_ENVIO, LIMITE_SOBRE, LOTE, enMB } from './limites'
import {
  transporteServidor,
  type Cabeceras, type EstadoSync, type RespuestaPush, type Transporte,
} from './transporte'
import { transporteDirecto } from './transporteDirecto'
import type { Enlace } from './enlaceDirecto'

export type { EstadoSync } from './transporte'

/**
 * De dónde salen y a dónde van los sobres.
 *
 * Por ahora siempre el buzón de EDUmind, que es lo que había. Cuando existan
 * los otros transportes —una carpeta del docente, o el otro dispositivo
 * directamente— este es el único sitio donde hay que elegir.
 */
function transporte(headers: Cabeceras): Transporte {
  return transporteServidor(headers)
}

const K_CLAVE       = 'sync_clave'
const K_PULL_SEQ    = 'sync_pull_seq'
const K_PUSH_DESDE  = 'sync_push_desde'
const K_ULTIMA      = 'sync_ultima'
const K_CUARENTENA  = 'sync_cuarentena'
const K_SALT        = 'sync_salt'
const K_VERIFICADOR = 'sync_verificador'

/**
 * Cada transporte lleva sus propios cursores: lo que ya se ha subido al buzón
 * no es lo que ya se le ha pasado a la tablet por enlace directo. Compartirlos
 * haría que un envío por un camino diese por enviado lo del otro.
 *
 * El buzón se queda con los nombres de siempre para no obligar a migrar nada.
 */
function cursor(base: string, canal: Transporte): string {
  return canal.id === 'servidor' ? base : `${base}:${canal.id}`
}

const ITERACIONES = 210_000          // OWASP 2023 para PBKDF2-SHA256
const VERIFICADOR = 'EDUmind MiClase · verificador de contraseña v1'

/**
 * Registros que no se pueden enviar y no se van a poder enviar nunca tal como
 * están: una evidencia que no cabe en un sobre, casi siempre.
 *
 * Sin esto, el cursor de envío avanzaba igualmente y el registro no se
 * reintentaba jamás: se perdía para los demás dispositivos y el docente solo
 * veía «conflictos: 1». Y capar el cursor para reintentarlo habría hecho que
 * cada sincronización volviera a cifrar y reenviar todo lo posterior.
 *
 * Se anota con el `updated_at` que tenía al fallar: si el docente lo edita o
 * sustituye la evidencia, el sello cambia y se vuelve a intentar solo.
 */
type Cuarentena = Record<string, { updated_at: string; motivo: string }>

const MOTIVOS: Record<string, string> = {
  demasiado_grande:  'no cabe en un sobre de sincronización',
  campos_incompletos:'el registro llegó incompleto al servidor',
  tabla_desconocida: 'el servidor no reconoce esa tabla',
  fecha_invalida:    'su fecha de modificación no es válida',
  cuota_registros:   'el buzón del servidor ha llegado a su número máximo de registros',
  cuota_espacio:     'el buzón del servidor no tiene espacio libre',
}

export type ResultadoSync = {
  enviados: number
  recibidos: number
  aplicados: number
  descartados: number
  conflictos: number
  /** Registros que ambos dispositivos habían tocado y se han combinado */
  fusionados: number
  detalleFusion: string[]
  errores: string[]
}

// ─── Utilidades binarias ─────────────────────────────────────────────────

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  const CHUNK = 0x8000  // btoa se atraganta con arrays enormes de golpe
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

function desb64(str: string): Uint8Array {
  const bin = atob(str)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function base64ABlob(s: string, mime: string): Blob {
  const bytes = desb64(s)
  return new Blob([bytes.buffer as ArrayBuffer], { type: mime })
}

// ─── Clave ───────────────────────────────────────────────────────────────

async function derivar(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITERACIONES, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,                       // no extraíble: ni siquiera el propio JS puede exportarla
    ['encrypt', 'decrypt']
  )
}

async function guardarMeta(clave: string, valor: any) {
  await db.meta.put({ clave, valor })
}

async function leerMeta<T>(clave: string, porDefecto: T): Promise<T> {
  const m = await db.meta.get(clave)
  return (m?.valor ?? porDefecto) as T
}

/** La clave derivada se guarda como CryptoKey no extraíble en IndexedDB. */
export async function claveGuardada(): Promise<CryptoKey | null> {
  const m = await db.meta.get(K_CLAVE)
  return (m?.valor as CryptoKey) ?? null
}

export async function olvidarClave(): Promise<void> {
  await db.meta.delete(K_CLAVE)
}

async function cifrar(clave: CryptoKey, texto: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const datos = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    clave,
    new TextEncoder().encode(texto)
  )
  return { iv: b64(iv), payload: b64(datos) }
}

async function descifrar(clave: CryptoKey, iv: string, payload: string): Promise<string> {
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: desb64(iv) as unknown as BufferSource },
    clave,
    desb64(payload) as unknown as BufferSource
  )
  return new TextDecoder().decode(claro)
}

// ─── Diálogo con el transporte ───────────────────────────────────────────

export async function consultarEstado(headers: Cabeceras): Promise<EstadoSync> {
  return transporte(headers).estado()
}

/**
 * Primera vez en esta cuenta: genera sal, deriva la clave y publica el
 * verificador para que los demás dispositivos puedan comprobar que han
 * escrito la contraseña correcta.
 */
export async function iniciarSincronizacion(
  password: string, headers: Cabeceras, reiniciar = false
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const clave = await derivar(password, salt)
  const { iv, payload } = await cifrar(clave, VERIFICADOR)

  const verificador = `${iv}.${payload}`
  await transporte(headers).configurar(b64(salt), verificador, reiniciar)

  await guardarMeta(K_CLAVE, clave)
  await guardarConfig(b64(salt), verificador)
  await guardarMeta(K_PULL_SEQ, 0)
  await guardarMeta(K_PUSH_DESDE, '')
}

/**
 * Estrenar la sincronización sin buzón y sin sesión.
 *
 * Hasta ahora la contraseña solo se podía crear publicándola en el servidor,
 * así que quien quisiera sincronizar dos aparatos entre ellos tenía que pasar
 * por el servidor al menos una vez. Con esto no hace falta nunca: la sal se
 * genera aquí y el otro dispositivo se la pide al emparejarse.
 */
export async function estrenarSincronizacionLocal(password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const clave = await derivar(password, salt)
  const { iv, payload } = await cifrar(clave, VERIFICADOR)

  await guardarMeta(K_CLAVE, clave)
  await guardarConfig(b64(salt), `${iv}.${payload}`)
}

/**
 * La sal y el verificador se guardan también aquí, no solo en el buzón.
 *
 * Hacían falta para que un dispositivo nuevo pudiera comprobar la contraseña,
 * y hasta ahora solo vivían en el servidor: sin él no había forma de
 * desbloquear. Guardándolos en cada aparato, dos que se emparejan
 * directamente se los pueden pedir entre ellos y el servidor deja de ser
 * imprescindible. No son secretos: la sal es pública por diseño y el
 * verificador es un texto conocido cifrado con la clave.
 */
async function guardarConfig(salt: string | null, verificador: string | null) {
  await guardarMeta(K_SALT, salt)
  await guardarMeta(K_VERIFICADOR, verificador)
}

/** Lo que este dispositivo le puede contar a otro al emparejarse. */
export async function configLocal(): Promise<{ salt: string | null; verificador: string | null }> {
  return {
    salt: await leerMeta<string | null>(K_SALT, null),
    verificador: await leerMeta<string | null>(K_VERIFICADOR, null),
  }
}

/** Dispositivo nuevo: descarga la sal, deriva y comprueba el verificador. */
export async function desbloquear(password: string, headers: Cabeceras): Promise<void> {
  await desbloquearCon(password, await consultarEstado(headers))
}

/** El mismo desbloqueo, con la configuración venga de donde venga. */
async function desbloquearCon(password: string, estado: EstadoSync): Promise<void> {
  if (!estado.iniciado || !estado.salt || !estado.verificador) {
    throw new Error('Esta cuenta todavía no tiene sincronización configurada')
  }
  const clave = await derivar(password, desb64(estado.salt))
  const [iv, payload] = estado.verificador.split('.')
  try {
    const claro = await descifrar(clave, iv, payload)
    if (claro !== VERIFICADOR) throw new Error()
  } catch {
    throw new Error('Contraseña de sincronización incorrecta')
  }
  await guardarMeta(K_CLAVE, clave)
  await guardarConfig(estado.salt, estado.verificador)
}

// ─── Base de la fusión a tres bandas ─────────────────────────────────────

/** Los blobs no participan en la fusión: son inmutables y pesan. */
function sinBlob(reg: any): any {
  if (!reg || typeof reg !== 'object') return reg
  const { blob, ...resto } = reg
  return resto
}

function claveBase(tabla: TablaSinc, id: number | string): string {
  return `${tabla}:${id}`
}

async function guardarBase(tabla: TablaSinc, reg: any): Promise<void> {
  await db.sync_base.put({ clave: claveBase(tabla, reg.id), datos: sinBlob(reg) })
}

async function leerBase(tabla: TablaSinc, id: number | string): Promise<any | null> {
  const b = await db.sync_base.get(claveBase(tabla, id))
  return b?.datos ?? null
}

/** Campos que nunca se fusionan campo a campo: los gestiona el propio sync. */
const CAMPOS_DE_CONTROL = new Set(['id', 'updated_at', 'blob'])

function iguales(a: any, b: any): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  // Los campos JSON (trimestres, etiquetas, niveles…) se comparan como texto
  if (typeof a === 'object' || typeof b === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
  }
  return false
}

export type ResultadoFusion = {
  registro: any
  huboFusion: boolean
  campos: string[]
  /**
   * El resultado queda borrado y el otro dispositivo había editado campos.
   * La política es que el borrado manda —resucitar registros por una edición
   * concurrente sorprende más—, pero callarse que se ha descartado un cambio
   * es lo que hacía que un apellido corregido desapareciera sin explicación.
   */
  borradoConEdicion: boolean
}

/**
 * Fusión a tres bandas: base (lo último que ambos compartían), local y remoto.
 *
 * Para cada campo:
 *   · solo lo cambió el remoto  → se coge el remoto
 *   · solo lo cambió el local   → se conserva el local
 *   · lo cambiaron los dos      → gana el más reciente (last-write-wins)
 *
 * Así, si en el portátil se corrige el apellido de un alumno y en la tablet se
 * le marca NEAE, no se pierde ninguno de los dos cambios.
 */
export function fusionarTresBandas(base: any, local: any, remoto: any): ResultadoFusion {
  const remotoEsMasNuevo = (remoto.updated_at ?? '') > (local.updated_at ?? '')
  const salida: any = { ...local }
  const campos: string[] = []

  const claves = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remoto)])
  for (const campo of claves) {
    if (CAMPOS_DE_CONTROL.has(campo)) continue

    const cambioLocal = !iguales(local[campo], base[campo])
    const cambioRemoto = !iguales(remoto[campo], base[campo])

    if (cambioRemoto && !cambioLocal) {
      salida[campo] = remoto[campo]
      campos.push(campo)
    } else if (cambioLocal && cambioRemoto && remotoEsMasNuevo) {
      salida[campo] = remoto[campo]
      campos.push(campo)
    }
    // resto de casos: se queda el valor local
  }

  // El blob solo puede venir del remoto si aquí no lo teníamos
  if (remoto.blob && !local.blob) salida.blob = remoto.blob

  // ¿El resultado difiere de lo que hay en el servidor? Entonces hay que
  // devolvérselo, y para eso necesita un sello más reciente.
  const difiereDelRemoto = [...claves].some(
    c => !CAMPOS_DE_CONTROL.has(c) && !iguales(salida[c], remoto[c]))

  salida.updated_at = difiereDelRemoto
    ? sello()
    : (remotoEsMasNuevo ? remoto.updated_at : local.updated_at)

  // El borrado gana, pero si el otro lado había tocado campos de contenido
  // hay que decirlo: esos cambios ya no se van a ver en ninguna parte.
  const quedaBorrado = !!salida.deleted_at
  const camposDeContenido = campos.filter(c => c !== 'deleted_at')
  const editoElOtroLado = [...claves].some(c =>
    c !== 'deleted_at' && !CAMPOS_DE_CONTROL.has(c) &&
    (!iguales(local[c], base[c]) || !iguales(remoto[c], base[c])))

  return {
    registro: salida,
    huboFusion: difiereDelRemoto,
    campos: camposDeContenido.length ? camposDeContenido : campos,
    borradoConEdicion: quedaBorrado && editoElOtroLado,
  }
}

// ─── Serialización de registros ──────────────────────────────────────────

async function aSobre(tabla: TablaSinc, reg: any): Promise<string> {
  if (tabla === 'evidencias' && reg.blob instanceof Blob) {
    const { blob, ...resto } = reg
    return JSON.stringify({ ...resto, blob_b64: await blobABase64(blob) })
  }
  return JSON.stringify(reg)
}

function deSobre(tabla: TablaSinc, json: string): any {
  const reg = JSON.parse(json)
  if (tabla === 'evidencias' && reg.blob_b64) {
    const { blob_b64, ...resto } = reg
    return { ...resto, blob: base64ABlob(blob_b64, reg.mime || 'image/jpeg') }
  }
  return reg
}

// ─── Empuje ──────────────────────────────────────────────────────────────

async function empujar(clave: CryptoKey, canal: Transporte, res: ResultadoSync) {
  const kDesde = cursor(K_PUSH_DESDE, canal)
  const kAislados = cursor(K_CUARENTENA, canal)
  const desde: string = await leerMeta(kDesde, '')
  const cuarentena: Cuarentena = await leerMeta(kAislados, {})
  const device_id = idDispositivo()

  let maxSello = desde
  // Sellos de los registros que no llegaron a salir. El cursor no puede pasar
  // del más antiguo de ellos: si lo hiciera, no volverían a leerse nunca.
  const sinEnviar: string[] = []
  const noEnviado = (u: string) => { sinEnviar.push(u) }

  const aislar = (tabla: TablaSinc, reg: any, motivo: string) => {
    cuarentena[`${tabla}:${reg.id}`] = { updated_at: reg.updated_at, motivo }
    res.errores.push(`${tabla}#${reg.id}: ${MOTIVOS[motivo] ?? motivo}`)
  }

  for (const tabla of TABLAS_SINC) {
    const t = db.table(tabla)
    // `updated_at` está indexado: solo se leen los registros tocados
    const pendientes = desde
      ? await t.where('updated_at').aboveOrEqual(desde).toArray()
      : await t.toArray()

    let registros: any[] = []
    let originales: any[] = []
    let bytes = 0

    const enviar = async () => {
      if (!registros.length) return
      const tanda = originales
      let r: RespuestaPush
      try {
        r = await canal.empujar(device_id, registros)
      } catch (e: any) {
        // La tanda no llegó. Se vacía para no arrastrarla —antes seguía
        // acumulando encima de un lote ya fallido, que volvía a fallar— y se
        // frena el cursor para que estos registros se reintenten.
        for (const reg of tanda) noEnviado(reg.updated_at)
        res.errores.push(`${tabla}: no se pudo enviar una tanda de ${tanda.length} registros (${e.message})`)
        registros = []; originales = []; bytes = 0
        return
      }

      res.enviados += r.escritos
      res.conflictos += r.descartados

      // Terreno común es solo lo que el transporte confirma haber guardado.
      // Sellar la base de un registro que se descartó la deja mintiendo, y la
      // siguiente fusión concluye «esto solo lo cambió el remoto» sobre campos
      // que el remoto nunca recibió.
      const aceptados = new Set(r.aceptados.map(a => String(a.registro_id)))
      const motivos = new Map(r.rechazados.map(x => [String(x.registro_id), x.motivo]))

      for (const reg of tanda) {
        const id = String(reg.id)
        if (aceptados.has(id)) {
          await guardarBase(tabla, reg)
          continue
        }
        const motivo = motivos.get(id)
        // `version_anterior` no es un fallo: el servidor ya tiene algo más
        // nuevo y el pull lo traerá. Lo demás no se arregla reintentando.
        if (motivo && motivo !== 'version_anterior') aislar(tabla, reg, motivo)
      }

      registros = []; originales = []; bytes = 0
    }

    for (const reg of pendientes) {
      if (reg.id == null || !reg.updated_at) continue

      const aislado = cuarentena[`${tabla}:${reg.id}`]
      if (aislado && aislado.updated_at === reg.updated_at) {
        res.errores.push(`${tabla}#${reg.id}: ${MOTIVOS[aislado.motivo] ?? aislado.motivo} (sin cambios desde el último intento)`)
        continue
      }

      try {
        const sobre = await aSobre(tabla, reg)
        const { iv, payload } = await cifrar(clave, sobre)

        // Se corta con el tope del servidor, no con el de la tanda: enviar
        // algo que el servidor va a rechazar solo sirve para perderlo.
        if (payload.length > LIMITE_SOBRE) {
          aislar(tabla, reg, 'demasiado_grande')
          res.errores.push(`${tabla}#${reg.id}: ocupa ${enMB(payload.length)} MB cifrado y el máximo es ${enMB(LIMITE_SOBRE)} MB`)
          continue
        }
        if (bytes + payload.length > LIMITE_ENVIO || registros.length >= LOTE) await enviar()

        registros.push({ tabla, registro_id: String(reg.id), updated_at: reg.updated_at, iv, payload })
        originales.push(reg)
        bytes += payload.length
        if (reg.updated_at > maxSello) maxSello = reg.updated_at
      } catch (e: any) {
        // No se pudo ni cifrar: puede ser transitorio, así que se reintenta.
        noEnviado(reg.updated_at)
        res.errores.push(`${tabla}#${reg.id}: ${e.message}`)
      }
    }
    await enviar()
  }

  if (maxSello) {
    const frenado = sinEnviar.length ? sinEnviar.reduce((a, b) => (a < b ? a : b)) : null
    const hasta = frenado && frenado < maxSello ? frenado : maxSello
    await guardarMeta(kDesde, hasta)
  }
  await guardarMeta(kAislados, cuarentena)
}

// ─── Descarga y fusión ───────────────────────────────────────────────────

async function traer(clave: CryptoKey, canal: Transporte, res: ResultadoSync) {
  const device_id = idDispositivo()
  const kSeq = cursor(K_PULL_SEQ, canal)
  let desde: number = await leerMeta(kSeq, 0)
  let hayMas = true

  while (hayMas) {
    const r = await canal.traer(desde, LOTE, device_id)

    res.recibidos += r.registros.length

    for (const fila of r.registros) {
      try {
        const json = await descifrar(clave, fila.iv, fila.payload)
        const remoto = deSobre(fila.tabla as TablaSinc, json)
        const aplicado = await fusionar(fila.tabla as TablaSinc, remoto, res)
        aplicado ? res.aplicados++ : res.descartados++
      } catch (e: any) {
        res.errores.push(`${fila.tabla}#${fila.registro_id}: ${e.message || 'no se pudo descifrar'}`)
      }
    }

    desde = r.seq
    hayMas = r.hay_mas
    await guardarMeta(kSeq, desde)
  }
}

/**
 * Integra un registro remoto en la base local.
 *
 * Con base común disponible, se fusiona campo a campo (ver
 * `fusionarTresBandas`). Sin ella —primer encuentro con ese registro— no hay
 * forma de saber qué cambió cada uno, así que se cae al last-write-wins.
 *
 * `updated_at` se compara como cadena ISO: su orden lexicográfico coincide con
 * el cronológico, así que no hace falta parsear fechas.
 */
async function fusionar(
  tabla: TablaSinc, remoto: any, res: ResultadoSync
): Promise<boolean> {
  const t = db.table(tabla)
  const local: any = await t.get(remoto.id)

  // No lo teníamos: se acepta tal cual
  if (!local) {
    await t.put(remoto)
    await guardarBase(tabla, remoto)
    return true
  }

  const base = await leerBase(tabla, remoto.id)

  if (!base) {
    // Sin terreno común: solo cabe quedarse con el más reciente
    if ((local.updated_at ?? '') >= (remoto.updated_at ?? '')) return false
    await t.put(remoto)
    await guardarBase(tabla, remoto)
    return true
  }

  const { registro, huboFusion, campos, borradoConEdicion } = fusionarTresBandas(base, local, remoto)

  if (borradoConEdicion) {
    res.detalleFusion.push(
      `${tabla}#${remoto.id}: se borró en un dispositivo mientras se editaba en otro. ` +
      'Prevalece el borrado; los cambios de contenido no se aplican.')
  }

  // Nada que cambiar aquí
  if (iguales(sinBlob(registro), sinBlob(local))) {
    await guardarBase(tabla, remoto)
    return false
  }

  await t.put(registro)
  // La base pasa a ser lo que el servidor tiene; si hemos fusionado, nuestro
  // resultado se le devolverá en el siguiente envío
  await guardarBase(tabla, huboFusion ? remoto : registro)

  if (huboFusion) {
    res.fusionados++
    res.detalleFusion.push(
      `${tabla}#${remoto.id}: se combinaron cambios de los dos dispositivos` +
      (campos.length ? ` (${campos.join(', ')})` : ''))
  }
  return true
}

// ─── Ciclo completo ──────────────────────────────────────────────────────

async function ejecutar(canal: Transporte): Promise<ResultadoSync> {
  const clave = await claveGuardada()
  if (!clave) throw new Error('Este dispositivo no tiene desbloqueada la sincronización')

  const res: ResultadoSync = {
    enviados: 0, recibidos: 0, aplicados: 0, descartados: 0, conflictos: 0,
    fusionados: 0, detalleFusion: [], errores: [],
  }

  // Primero enviar y después recibir: así lo local nunca se pierde por una
  // fusión que llegue antes de haber publicado los propios cambios.
  await empujar(clave, canal, res)
  await traer(clave, canal, res)

  await guardarMeta(K_ULTIMA, new Date().toISOString())
  return res
}

/** Sincronización contra el buzón del servidor. */
export async function sincronizar(headers: Cabeceras): Promise<ResultadoSync> {
  return ejecutar(transporte(headers))
}

/**
 * Un transporte por enlace, y no uno por llamada.
 *
 * El enlace admite un solo receptor de mensajes, y sobre todo: el otro aparato
 * puede preguntar en cuanto se abre el canal, mucho antes de que aquí se pulse
 * nada. Si el transporte se creara al sincronizar, esas preguntas caerían en
 * el vacío y quien esperase se quedaría colgado hasta agotar el tiempo.
 */
const sesiones = new WeakMap<Enlace, Transporte>()

/**
 * Ponerse a la escucha del otro dispositivo. Hay que llamarla en los dos lados
 * en cuanto el canal se abre, antes de pedirle nada.
 */
export function atenderEnlace(enlace: Enlace): Transporte {
  let canal = sesiones.get(enlace)
  if (!canal) {
    canal = transporteDirecto(enlace, configLocal)
    sesiones.set(enlace, canal)
  }
  return canal
}

/**
 * Sincronización directa con el otro dispositivo, sin servidor.
 *
 * Los dos aparatos corren esto a la vez: cada uno manda lo suyo y recoge lo
 * del otro por el mismo canal. Nada queda depositado en ninguna parte.
 */
export async function sincronizarPorEnlace(enlace: Enlace): Promise<ResultadoSync> {
  return ejecutar(atenderEnlace(enlace))
}

/**
 * Desbloqueo de un dispositivo nuevo sin pasar por el servidor: la sal y el
 * verificador se los pide al aparato con el que se acaba de emparejar.
 */
export async function desbloquearPorEnlace(password: string, enlace: Enlace): Promise<void> {
  await desbloquearCon(password, await atenderEnlace(enlace).estado())
}

export async function ultimaSincronizacion(): Promise<string | null> {
  return leerMeta<string | null>(K_ULTIMA, null)
}

/** Cuántos registros locales están pendientes de enviar. */
export async function pendientesDeEnvio(): Promise<number> {
  const desde: string = await leerMeta(K_PUSH_DESDE, '')
  if (!desde) {
    let n = 0
    for (const tabla of TABLAS_SINC) n += await db.table(tabla).count()
    return n
  }
  let n = 0
  for (const tabla of TABLAS_SINC) {
    // `aboveOrEqual`, igual que en empujar(): con `above` el contador decía
    // cero mientras aún quedaban registros justo en el límite por enviar.
    n += await db.table(tabla).where('updated_at').aboveOrEqual(desde).count()
  }
  return n
}

/** Olvida los cursores para forzar un envío completo desde cero. */
export async function reenviarTodo(): Promise<void> {
  await guardarMeta(K_PUSH_DESDE, '')
  // También los registros aislados: si el docente pide reenviar todo, quiere
  // que se reintenten hasta los que fallaron.
  await guardarMeta(K_CUARENTENA, {})
}

/**
 * Registros que no se están sincronizando y por qué.
 * La pantalla de sincronización los enseña para que el docente sepa que esa
 * evidencia se queda en este dispositivo.
 */
export async function registrosAislados(): Promise<Array<{ clave: string; motivo: string }>> {
  const c: Cuarentena = await leerMeta(K_CUARENTENA, {})
  return Object.entries(c).map(([clave, v]) => ({
    clave,
    motivo: MOTIVOS[v.motivo] ?? v.motivo,
  }))
}

/**
 * Olvida el terreno común. El siguiente ciclo volverá al last-write-wins en
 * los registros afectados, así que solo tiene sentido si la base se ha
 * corrompido o tras cambiar la contraseña y vaciar el buzón.
 */
export async function olvidarBaseDeFusion(): Promise<void> {
  await db.sync_base.clear()
}

/**
 * Deja la sincronización como recién estrenada, conservando la contraseña.
 *
 * Es lo que hay que hacer tras restaurar una copia de seguridad: los ids
 * siguen existiendo pero su contenido es otro, así que la base de fusión
 * apunta a versiones que ya no tienen nada que ver y el merge a tres bandas
 * calcula diferencias falsas. Además el cursor de envío se quedaba en el
 * sello anterior, con lo que lo restaurado —más antiguo— no se subía nunca.
 *
 * No borra `sync_clave`: la contraseña de sincronización sigue siendo la
 * misma y no tiene sentido pedirla otra vez.
 */
export async function reiniciarEstadoDeSincronizacion(): Promise<void> {
  await db.sync_base.clear()
  await guardarMeta(K_PUSH_DESDE, '')
  await guardarMeta(K_PULL_SEQ, 0)
  await guardarMeta(K_CUARENTENA, {})
  await guardarMeta(K_ULTIMA, null)
}
