import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { generarPKCE, valorOpaco } from './crypto'
import { api, esNativo, REDIRECT_NATIVO } from '@/api'
import { useAppStore } from '@/store/useAppStore'

interface AuthConfig {
  enabled: boolean
  authentik_url: string
  client_id: string
  redirect_uri: string
  /**
   * Adónde debe volver Authentik cuando el login lo inicia la app nativa.
   * Lo anuncia el servidor solo si lo admite (ver DESPLIEGUE.md, «Login desde
   * la app nativa»); un servidor que no lo mande sencillamente no ofrece el
   * botón en la app, y el docente sigue teniendo los dos caminos sin servidor.
   */
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
  /** Si se puede ofrecer «Conectar EDUmind» aquí y ahora. */
  loginDisponible: boolean
  /** Por qué no, para decírselo al docente en vez de esconder el botón sin más. */
  motivoSinLogin: string | null
  iniciarLogin: () => Promise<void>
  cerrarSesion: () => void
  headers: () => Record<string, string>
}

const AuthContext = createContext<AuthState | null>(null)

const TOKEN_KEY = 'miclase_session_token'
const NOMBRE_KEY = 'miclase_nombre'
/** Con qué redirect_uri se pidió el código: el canje tiene que repetirlo. */
export const REDIRECT_KEY = 'oidc_redirect_uri'

/**
 * Qué redirect_uri sirve para iniciar sesión desde donde estamos.
 *
 * En la web, el de siempre. En la app nativa el login no puede ir por el
 * WebView: Capacitor manda las direcciones externas a Safari, y Authentik
 * volvería a la web (miclase.edumind.es/auth/callback), donde no está el
 * verificador PKCE que se generó aquí; el docente se quedaba en una página de
 * error sin camino de vuelta. El camino es abrir Authentik en el navegador
 * del sistema y que vuelva por el esquema propio de la app
 * (`es.edumind.miclase://auth/callback`), que iOS entrega a la app abierta.
 * Para eso el servidor tiene que admitir ese redirect_uri y anunciarlo.
 */
function redirectParaAqui(cfg: AuthConfig | null): string | null {
  if (!cfg?.enabled) return null
  if (!esNativo()) return cfg.redirect_uri
  const nativo = cfg.redirect_uri_nativo
  return nativo && nativo.startsWith(REDIRECT_NATIVO) ? nativo : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState<'local' | 'authentik' | 'cargando'>('cargando')
  const [token, setToken] = useState<string | null>(null)
  const [nombre, setNombre] = useState<string | null>(null)
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)
  const navigate = useNavigate()

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

  // Vuelta del login en la app nativa: el sistema abre la app con la URL del
  // esquema propio y aquí se convierte en la ruta /auth/callback de siempre,
  // con el mismo `code` y `state`. El resto del flujo no cambia.
  useEffect(() => {
    if (!esNativo()) return
    let vivo = true
    let oyente: { remove: () => Promise<void> } | undefined

    const tratar = (url: string) => {
      if (!url.startsWith(REDIRECT_NATIVO)) return
      // El navegador del sistema sigue delante si no se cierra desde aquí
      import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => {})
      const i = url.indexOf('?')
      navigate(`/auth/callback${i >= 0 ? url.slice(i) : ''}`, { replace: true })
    }

    import('@capacitor/app').then(async ({ App }) => {
      // Si iOS arrancó la app con la URL (estaba cerrada), también cuenta
      const inicial = await App.getLaunchUrl().catch(() => undefined)
      if (inicial?.url) tratar(inicial.url)
      const h = await App.addListener('appUrlOpen', ev => tratar(ev.url))
      if (vivo) oyente = h
      else h.remove()
    }).catch(() => {})

    return () => { vivo = false; oyente?.remove() }
  }, [])

  const redirect = redirectParaAqui(authConfig)
  const loginDisponible = redirect !== null
  const motivoSinLogin = loginDisponible
    ? null
    : !authConfig?.enabled
      ? 'Este servidor no tiene configurado el acceso con EDUmind.'
      : 'Este servidor todavía no admite iniciar sesión desde la app instalada. ' +
        'Mientras tanto puedes sincronizar sin servidor —enlace directo por QR o paquete por AirDrop— ' +
        'o usar MiClase desde el navegador.'

  const iniciarLogin = async () => {
    if (!authConfig || !redirect) {
      alert(motivoSinLogin ?? 'El login con EDUmind no está disponible ahora mismo.')
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
    sessionStorage.setItem(REDIRECT_KEY, redirect)

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             authConfig.client_id,
      redirect_uri:          redirect,
      scope:                 authConfig.scopes,
      code_challenge:        challenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    })
    const url = `${authConfig.authorize_url}?${params}`

    if (esNativo()) {
      // Navegador del sistema dentro de la app (SFSafariViewController), no la
      // vista web embebida: la hoja de llaves de acceso se ve entera, las llaves
      // guardadas en el dispositivo están disponibles, y vuelve por el esquema
      // propio.
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
    } else {
      window.location.href = url
    }
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
    <AuthContext.Provider value={{
      modo, token, nombre, authConfig, loginDisponible, motivoSinLogin, iniciarLogin, cerrarSesion, headers,
    }}>
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
