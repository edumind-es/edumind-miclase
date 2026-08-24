/**
 * Configuración del backend, validada una sola vez al arrancar.
 *
 * Existe por dos motivos concretos:
 *
 *  1. El secreto de sesión estaba duplicado como literal en `plugins/auth.js`
 *     y en `routes/auth.js`, con un valor por defecto que vive en un
 *     repositorio AGPL público. Ese literal mide 34 caracteres, así que
 *     superaba el propio control de longitud del arranque. Quien lo
 *     conociera podía firmarse un JWT con cualquier `docente_id` y abrir el
 *     buzón de sincronización de cualquier docente.
 *
 *  2. El control solo actuaba con NODE_ENV=production. Arrancar el backend a
 *     mano usaba el valor publicado sin un solo aviso.
 *
 * Ahora no hay valor por defecto y la comprobación es incondicional.
 */
import 'dotenv/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Ojo: __dirname es backend/src/, así que esto es backend/, no la raíz del
// proyecto. El valor por defecto anterior resolvía a
// <proyecto>/data/miclase.db, un directorio que no existe, y better-sqlite3
// creaba una base vacía en silencio.
export const BACKEND_ROOT = resolve(__dirname, '..')

export const DB_PATH = process.env.DB_PATH || resolve(BACKEND_ROOT, 'data/miclase.db')

// Valor que estuvo como fallback en el repositorio hasta 2026-08-24.
// Se rechaza de forma explícita: la longitud por sí sola no basta.
const SECRETO_PUBLICADO = 'cambiar_en_produccion_min32chars!!'

const LONGITUD_MINIMA = 32

function exigirJwtSecret() {
  const secreto = process.env.JWT_SECRET || ''

  if (!secreto) {
    abortar('falta JWT_SECRET. Defínelo en el entorno del servicio (o en backend/.env para desarrollo).')
  }
  if (secreto === SECRETO_PUBLICADO) {
    abortar('JWT_SECRET es el valor de ejemplo que está publicado en el repositorio. Genera uno propio: openssl rand -hex 32')
  }
  if (secreto.length < LONGITUD_MINIMA) {
    abortar(`JWT_SECRET es demasiado corto (${secreto.length} caracteres, mínimo ${LONGITUD_MINIMA}). Genera uno propio: openssl rand -hex 32`)
  }

  return secreto
}

function abortar(motivo) {
  console.error(`ERROR de configuración: ${motivo}`)
  console.error('El backend no arranca sin un secreto de sesión válido.')
  process.exit(1)
}

export const JWT_SECRET = exigirJwtSecret()
