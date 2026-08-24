/**
 * Rutas de autenticación via Authentik OIDC (Authorization Code + PKCE).
 *
 * Flujo:
 *   1. Frontend redirige al authorize URL de Authentik con PKCE
 *   2. Authentik redirige a /auth/callback?code=...
 *   3. El frontend envía code + code_verifier a POST /api/auth/callback
 *   4. Este backend intercambia con Authentik, crea/busca docente, emite JWT propio
 *   5. Frontend usa ese JWT en Authorization: Bearer <token> para el resto de API
 */
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose'
import { JWT_SECRET } from '../config.js'

const AUTHENTIK_URL    = process.env.AUTHENTIK_URL            || 'https://auth.edumind.es'
const AUTHENTIK_SLUG   = process.env.AUTHENTIK_SLUG           || 'miclase'
const CLIENT_ID        = process.env.AUTHENTIK_CLIENT_ID      || ''
const CLIENT_SECRET    = process.env.AUTHENTIK_CLIENT_SECRET  || ''
const REDIRECT_URI     = process.env.AUTHENTIK_REDIRECT_URI   || 'https://miclase.edumind.es/auth/callback'
const SESSION_TTL      = 60 * 60 * 24 * 7  // 7 días en segundos

const issuerBase = () => `${AUTHENTIK_URL}/application/o/${AUTHENTIK_SLUG}`

let _jwks = null
function getJWKS() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(`${issuerBase()}/jwks/`))
  return _jwks
}

async function emitirSessionJWT(docenteId, sub, nombre) {
  const key = new TextEncoder().encode(JWT_SECRET)
  return new SignJWT({ docente_id: docenteId, sub, nombre })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(key)
}

export default async function authRoutes(app) {
  const db = app.db

  // Config pública que el frontend necesita para iniciar el flujo PKCE
  app.get('/config', async () => ({
    enabled:       !!(CLIENT_ID),
    authentik_url: AUTHENTIK_URL,
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    slug:          AUTHENTIK_SLUG,
    authorize_url: `${AUTHENTIK_URL}/application/o/authorize/`,
    scopes:        'openid profile email',
  }))

  // Intercambio de código → session JWT propio
  app.post('/callback', async (req, reply) => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return reply.status(503).send({ error: 'Authentik no configurado en este servidor' })
    }
    const { code, code_verifier, nonce } = req.body || {}
    if (!code || !code_verifier) {
      return reply.status(400).send({ error: 'code y code_verifier son obligatorios' })
    }

    const tokenRes = await fetch(`${AUTHENTIK_URL}/application/o/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri:  REDIRECT_URI,
        code_verifier,
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      app.log.error({ err }, 'Authentik token exchange error')
      return reply.status(401).send({ error: 'Error de autenticación con Authentik' })
    }

    const tokens = await tokenRes.json()

    let claims
    try {
      const result = await jwtVerify(tokens.id_token, getJWKS(), {
        issuer:   `${issuerBase()}/`,
        audience: CLIENT_ID,
      })
      claims = result.payload
    } catch {
      return reply.status(401).send({ error: 'Token Authentik inválido' })
    }

    // El `nonce` ata este id_token a la petición de login que lo pidió.
    // Basta con que lo lleve uno de los dos lados para exigir que coincidan:
    // así una pestaña vieja que aún no lo enviaba sigue pudiendo entrar, pero
    // nadie puede saltarse la comprobación simplemente omitiéndolo cuando
    // Authentik sí lo ha emitido.
    if ((nonce || claims.nonce) && claims.nonce !== nonce) {
      return reply.status(401).send({
        error: 'La respuesta de Authentik no corresponde a esta petición de acceso',
      })
    }

    const sub    = claims.sub
    const nombre = claims.preferred_username || claims.email || sub

    // Buscar/crear docente. La columna `email` guarda el `sub` de Authentik,
    // que es el identificador estable; el correo real no se almacena porque
    // el servidor no lo necesita para nada.
    let docente = db.prepare('SELECT id, nombre FROM docentes WHERE email = ?').get(sub)
    if (!docente) {
      const r = db.prepare('INSERT INTO docentes (nombre, email) VALUES (?, ?)').run(nombre, sub)
      docente = { id: r.lastInsertRowid }
    } else if (docente.nombre !== nombre) {
      // El nombre solo se escribía al crear: quien se lo cambiara en
      // Authentik seguía viendo el viejo para siempre.
      db.prepare('UPDATE docentes SET nombre = ? WHERE id = ?').run(nombre, docente.id)
    }

    const token = await emitirSessionJWT(docente.id, sub, nombre)
    return { token, nombre, expires_in: SESSION_TTL }
  })

  /**
   * Cierre de sesión.
   *
   * El JWT es sin estado y no hay lista de revocación, así que el servidor no
   * puede invalidarlo: quien cierre sesión deja de enviarlo (el cliente lo
   * borra de sessionStorage), pero el token sigue siendo válido hasta que
   * caduca. Con SESSION_TTL de 7 días eso es lo que hay. Este endpoint existe
   * para que el cliente tenga a quién avisar el día que se añada revocación.
   */
  app.post('/logout', async () => ({ ok: true }))

  app.get('/me', async (req, reply) => {
    const docenteId = await app.getDocente(req)
    if (!docenteId) return reply.status(401).send({ error: 'No autenticado' })
    const docente = db.prepare('SELECT id, nombre FROM docentes WHERE id = ?').get(docenteId)
    return { ...docente, modo: docenteId === 1 ? 'local' : 'authentik' }
  })
}
