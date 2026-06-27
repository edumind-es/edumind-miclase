import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { generarPKCE } from './crypto'

interface AuthConfig {
  enabled: boolean
  authentik_url: string
  client_id: string
  redirect_uri: string
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState<'local' | 'authentik' | 'cargando'>('cargando')
  const [token, setToken] = useState<string | null>(null)
  const [nombre, setNombre] = useState<string | null>(null)
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)

  useEffect(() => {
    // Cargar config de Authentik desde el backend
    fetch('/api/auth/config')
      .then(r => r.json())
      .then((cfg: AuthConfig) => {
        setAuthConfig(cfg)

        // Recuperar sesión guardada
        const savedToken = sessionStorage.getItem(TOKEN_KEY)
        const savedNombre = sessionStorage.getItem(NOMBRE_KEY)

        if (savedToken && savedNombre) {
          // Verificar que el token sigue siendo válido
          fetch('/api/auth/me', {
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

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             authConfig.client_id,
      redirect_uri:          authConfig.redirect_uri,
      scope:                 authConfig.scopes,
      code_challenge:        challenge,
      code_challenge_method: 'S256',
    })
    window.location.href = `${authConfig.authorize_url}?${params}`
  }

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
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
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
