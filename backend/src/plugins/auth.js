/**
 * Plugin de autenticación opcional.
 * - Sin token: modo local, docente_id = 1
 * - Con token: JWT emitido por este backend tras login Authentik
 */
import fp from 'fastify-plugin'
import { jwtVerify } from 'jose'
import { JWT_SECRET } from '../config.js'

export async function verifySessionToken(token) {
  const key = new TextEncoder().encode(JWT_SECRET)
  const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
  return payload
}

async function authPlugin(app) {
  // Decorador: intenta extraer docente del token, si no hay → docente_id = 1
  app.decorate('getDocente', async function (request) {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) return 1

    const token = header.slice(7)
    try {
      const payload = await verifySessionToken(token)
      return payload.docente_id
    } catch {
      return null // token inválido → rechazar en rutas protegidas
    }
  })
}

export default fp(authPlugin)
