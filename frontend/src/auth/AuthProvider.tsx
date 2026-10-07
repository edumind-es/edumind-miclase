import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as AppNativa } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { generarPKCE, valorOpaco } from './crypto'
import { api, esNativo } from '@/api'
import { useAppStore } from '@/store/useAppStore'

interface AuthConfig {
  enabled: boolean
  authentik_url: string
  client_id: string
  redirect_uri: string
  /** Vuelta a la app nativa (esquema propio); en la web no se usa. */
  redirect_uri_nativo?: string
  authorize_url: string
  scopes: string
  slug: string
}

interface AuthState {
  modo: 'local' | 'authentik' | 'cargando'
  token: string | null
  nombre: string | null
  authConfig: AuthConfig | null
  iniciarLogin: () => Promise<void>
  cerrarSesion: () => void
  headers: () => Record<string, string>
}

const AuthContext = createContext<AuthState | null>(null)

const TOKEN_KEY = 'miclase_session_token'
const NOMBRE_KEY = 'miclase_nombre'
/** Con qué redirect_uri se pidió el código: el canje tiene que repetirlo. */
export const REDIRECT_KEY = 'oidc_redirect_uri'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState<'local' | 'authentik' | 'cargando'>('cargando')
  const [token, setToken] = useState<string | null>(null)
  const [nombre, setNombre] = useState<string | null>(null)
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)
  const navigate = useNavigate()

  // En la app nativa el login de Authentik se abre en el navegador del
  // sistema (no en la vista web embebida, donde el diálogo de llaves de
  // acceso del sistema sale recortado) y vuelve por el esquema propio
  // `es.edumind.miclase://auth/callback?code=…&state=…`. Aquí se recoge esa
  // vuelta y se entrega a la misma página de callback que usa la web.
  useEffect(() => {
    if (!esNativo()) return
    const esperado = authConfig?.redirect_uri_nativo
    if (!esperado) return
    const escucha = AppNativa.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith(esperado)) return
      Browser.close().catch(() => {})
      const search = url.slice(url.indexOf('?'))
      navigate(`/auth/callback${search.startsWith('?') ? search : ''}`, { replace: true })
    })
    return () => { escucha.then(h => h.remove()).catch(() => {}) }
  }, [authConfig, navigate])

  useEffect(() => {
    // Cargar config de Authentik desde el backend
    fetch(api('/api/auth/config'))
      .then(r => r.json())
      .then((cfg: AuthConfig) => {
        setAuthConfig(cfg)

        // Recuperar sesión guardada
        const savedToken = sessionStorage.getItem(TOKEN_KEY)
        const savedNombre = sessionStorage.getItem(NOMBRE_KEY)

        if (savedToken && savedNombre) {
          // Verificar que el token sigue siendo válido
          fetch(api('/api/auth/me'), {
            headers: { Authorization: `Bearer ${savedToken}` }
          }).then(r => {
            if (r.ok) {
              setToken(savedToken)
              setNombre(savedNombre)
              setModo('authentik')
            } else {
              sessionStorage.removeItem(TOKEN_KEY)
              sessionStorage.removeItem(NOMBRE_KEY)
              setModo('local')
            }
          }).catch(() => setModo('local'))
        } else {
          setModo('local')
        }
      })
      .catch(() => setModo('local'))
  }, [])

  const iniciarLogin = async () => {
    if (!authConfig?.enabled) {
      alert('El login con Authentik no está configurado en este servidor. Consulta la documentación.')
      return
    }
    const { verifier, challenge } = await generarPKCE()
    sessionStorage.setItem('pkce_verifier', verifier)

    // PKCE cubre el robo del código, pero no que alguien nos empuje un
    // callback ajeno (`state`) ni que reutilice un id_token viejo (`nonce`).
    const state = valorOpaco()
    const nonce = valorOpaco()
    sessionStorage.setItem('oidc_state', state)
    sessionStorage.setItem('oidc_nonce', nonce)

    const nativo = esNativo() && !!authConfig.redirect_uri_nativo
    const redirectUri = nativo ? authConfig.redirect_uri_nativo! : authConfig.redirect_uri
    sessionStorage.setItem(REDIRECT_KEY, redirectUri)

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             authConfig.client_id,
      redirect_uri:          redirectUri,
      scope:                 authConfig.scopes,
      code_challenge:        challenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    })
    const url = `${authConfig.authorize_url}?${params}`
    if (nativo) {
      // Navegador del sistema: la hoja de llaves de acceso se ve entera y
      // las llaves guardadas en el dispositivo están disponibles.
      await Browser.open({ url })
      return
    }
    window.location.href = url
  }

  // Sincronizar token con el store global (para que useAppStore pueda usarlo en fetch)
  const setStoreToken = useAppStore(s => s._setToken)
  useEffect(() => { setStoreToken(token) }, [token, setStoreToken])

  const guardarSesion = (t: string, n: string) => {
    sessionStorage.setItem(TOKEN_KEY, t)
    sessionStorage.setItem(NOMBRE_KEY, n)
    setToken(t)
    setNombre(n)
    setModo('authentik')
  }

  const cerrarSesion = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(NOMBRE_KEY)
    setToken(null)
    setNombre(null)
    setModo('local')
    fetch(api('/api/auth/logout'), { method: 'POST' }).catch(() => {})
  }

  const headers = (): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {}

  return (
    <AuthContext.Provider value={{ modo, token, nombre, authConfig, iniciarLogin, cerrarSesion, headers }}>
      {/* Exponemos guardarSesion para el callback */}
      <GuardarSesionContext.Provider value={guardarSesion}>
        {children}
      </GuardarSesionContext.Provider>
    </AuthContext.Provider>
  )
}

export const GuardarSesionContext = createContext<((t: string, n: string) => void) | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

export function useGuardarSesion() {
  return useContext(GuardarSesionContext)
}
