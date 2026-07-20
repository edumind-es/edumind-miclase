/**
 * Cifrado/descifrado para exportación de datos.
 * Usa Web Crypto API (nativo del navegador, sin dependencias).
 * Algoritmo: PBKDF2 (100k iteraciones SHA-256) → AES-256-GCM
 */

const ITERACIONES = 100_000

export interface ExportCifrado {
  version: number
  salt: string    // base64
  iv: string      // base64
  datos: string   // base64 (AES-GCM encrypted JSON)
}

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function desb64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}

async function derivarClave(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITERACIONES, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function cifrarExport(datos: object, password: string): Promise<ExportCifrado> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv   = crypto.getRandomValues(new Uint8Array(12))
  const key  = await derivarClave(password, salt)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(datos))
  )

  return {
    version: 1,
    salt:  b64(salt.buffer),
    iv:    b64(iv.buffer),
    datos: b64(encrypted),
  }
}

export async function descifrarExport(cifrado: ExportCifrado, password: string): Promise<object> {
  if (cifrado.version !== 1) throw new Error('Versión de backup no soportada')
  const salt = desb64(cifrado.salt)
  const iv   = desb64(cifrado.iv)
  const key  = await derivarClave(password, salt)

  const datosCifrados = desb64(cifrado.datos)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    datosCifrados as unknown as BufferSource
  )
  return JSON.parse(new TextDecoder().decode(decrypted))
}

export function descargarBlob(contenido: string, nombreArchivo: string, tipo = 'application/json') {
  const blob = new Blob([contenido], { type: tipo })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombreArchivo
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

// Generar code_verifier y code_challenge para PKCE
export async function generarPKCE() {
  const verifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return { verifier, challenge }
}
