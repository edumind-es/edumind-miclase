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
import { idDispositivo } from './ids'

const K_CLAVE     = 'sync_clave'
const K_PULL_SEQ  = 'sync_pull_seq'
const K_PUSH_DESDE = 'sync_push_desde'
const K_ULTIMA    = 'sync_ultima'

const ITERACIONES = 210_000          // OWASP 2023 para PBKDF2-SHA256
const VERIFICADOR = 'EDUmind MiClase · verificador de contraseña v1'
const LOTE = 200

/**
 * Tamaño máximo de un envío, en bytes de payload cifrado.
 *
 * nginx corta las peticiones a miclase.edumind.es en 20 MB
 * (`client_max_body_size 20m`). Una tanda de evidencias con foto se pasa de
 * ahí enseguida, así que el lote se cierra por tamaño además de por número:
 * más vale mandar cinco peticiones que comerse un 413 y perder la tanda.
 */
const LIMITE_ENVIO = 12 * 1024 * 1024

export type ResultadoSync = {
  enviados: number
  recibidos: number
  aplicados: number
  descartados: number
  conflictos: number
  errores: string[]
}

export type EstadoSync = {
  iniciado: boolean
  salt: string | null
  verificador: string | null
  seq: number
  registros: number
  actualizado: string | null
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

// ─── API del servidor ────────────────────────────────────────────────────

type Cabeceras = () => Record<string, string>

async function pedir(ruta: string, headers: Cabeceras, init: RequestInit = {}) {
  const res = await fetch(`/api/sync${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers(), ...(init.headers || {}) },
  })
  const cuerpo = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err: any = new Error(cuerpo.error || `Error ${res.status}`)
    err.codigo = cuerpo.codigo
    err.status = res.status
    throw err
  }
  return cuerpo
}

export async function consultarEstado(headers: Cabeceras): Promise<EstadoSync> {
  return pedir('/config', headers)
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

  await pedir('/config', headers, {
    method: 'POST',
    body: JSON.stringify({ salt: b64(salt), verificador: `${iv}.${payload}`, reiniciar }),
  })

  await guardarMeta(K_CLAVE, clave)
  await guardarMeta(K_PULL_SEQ, 0)
  await guardarMeta(K_PUSH_DESDE, '')
}

/** Dispositivo nuevo: descarga la sal, deriva y comprueba el verificador. */
export async function desbloquear(password: string, headers: Cabeceras): Promise<void> {
  const estado = await consultarEstado(headers)
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

async function empujar(clave: CryptoKey, headers: Cabeceras, res: ResultadoSync) {
  const desde: string = await leerMeta(K_PUSH_DESDE, '')
  const device_id = idDispositivo()
  let maxSello = desde

  for (const tabla of TABLAS_SINC) {
    const t = db.table(tabla)
    // `updated_at` está indexado: solo se leen los registros tocados
    const pendientes = desde
      ? await t.where('updated_at').aboveOrEqual(desde).toArray()
      : await t.toArray()

    let registros: any[] = []
    let bytes = 0

    const enviar = async () => {
      if (!registros.length) return
      const r = await pedir('/push', headers, {
        method: 'POST',
        body: JSON.stringify({ device_id, registros }),
      })
      res.enviados += r.escritos ?? 0
      res.conflictos += r.descartados ?? 0
      registros = []
      bytes = 0
    }

    for (const reg of pendientes) {
      if (reg.id == null || !reg.updated_at) continue
      try {
        const sobre = await aSobre(tabla, reg)
        const { iv, payload } = await cifrar(clave, sobre)

        // Un solo registro que no cabe nunca: avisar y seguir con los demás,
        // en vez de bloquear la sincronización entera en cada intento
        if (payload.length > LIMITE_ENVIO) {
          res.errores.push(`${tabla}#${reg.id}: demasiado grande para sincronizar (${Math.round(payload.length / 1024 / 1024)} MB)`)
          continue
        }
        if (bytes + payload.length > LIMITE_ENVIO || registros.length >= LOTE) await enviar()

        registros.push({ tabla, registro_id: String(reg.id), updated_at: reg.updated_at, iv, payload })
        bytes += payload.length
        if (reg.updated_at > maxSello) maxSello = reg.updated_at
      } catch (e: any) {
        res.errores.push(`${tabla}#${reg.id}: ${e.message}`)
      }
    }
    await enviar()
  }

  if (maxSello) await guardarMeta(K_PUSH_DESDE, maxSello)
}

// ─── Descarga y fusión ───────────────────────────────────────────────────

async function traer(clave: CryptoKey, headers: Cabeceras, res: ResultadoSync) {
  const device_id = idDispositivo()
  let cursor: number = await leerMeta(K_PULL_SEQ, 0)
  let hayMas = true

  while (hayMas) {
    const r = await pedir(
      `/pull?desde=${cursor}&limite=${LOTE}&excluir_device=${encodeURIComponent(device_id)}`,
      headers)

    res.recibidos += r.registros.length

    for (const fila of r.registros) {
      try {
        const json = await descifrar(clave, fila.iv, fila.payload)
        const remoto = deSobre(fila.tabla as TablaSinc, json)
        const aplicado = await fusionar(fila.tabla as TablaSinc, remoto)
        aplicado ? res.aplicados++ : res.descartados++
      } catch (e: any) {
        res.errores.push(`${fila.tabla}#${fila.registro_id}: ${e.message || 'no se pudo descifrar'}`)
      }
    }

    cursor = r.seq
    hayMas = r.hay_mas
    await guardarMeta(K_PULL_SEQ, cursor)
  }
}

/**
 * Last-write-wins por registro. Devuelve true si el remoto ha ganado.
 * Se compara `updated_at` como cadena ISO: el orden lexicográfico y el
 * cronológico coinciden, así que no hace falta parsear fechas.
 */
async function fusionar(tabla: TablaSinc, remoto: any): Promise<boolean> {
  const t = db.table(tabla)
  const local = await t.get(remoto.id)
  if (local && (local.updated_at ?? '') >= (remoto.updated_at ?? '')) return false
  await t.put(remoto)
  return true
}

// ─── Ciclo completo ──────────────────────────────────────────────────────

export async function sincronizar(headers: Cabeceras): Promise<ResultadoSync> {
  const clave = await claveGuardada()
  if (!clave) throw new Error('Este dispositivo no tiene desbloqueada la sincronización')

  const res: ResultadoSync = {
    enviados: 0, recibidos: 0, aplicados: 0, descartados: 0, conflictos: 0, errores: [],
  }

  // Primero enviar y después recibir: así lo local nunca se pierde por una
  // fusión que llegue antes de haber publicado los propios cambios.
  await empujar(clave, headers, res)
  await traer(clave, headers, res)

  await guardarMeta(K_ULTIMA, new Date().toISOString())
  return res
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
    n += await db.table(tabla).where('updated_at').above(desde).count()
  }
  return n
}

/** Olvida los cursores para forzar un envío completo desde cero. */
export async function reenviarTodo(): Promise<void> {
  await guardarMeta(K_PUSH_DESDE, '')
}
