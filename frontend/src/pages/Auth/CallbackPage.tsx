import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGuardarSesion } from '@/auth/AuthProvider'

export default function CallbackPage() {
  const navigate = useNavigate()
  const guardarSesion = useGuardarSesion()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const errorParam = params.get('error')

    if (errorParam) {
      setError(`Error de Authentik: ${errorParam}`)
      return
    }

    if (!code) {
      setError('No se recibió código de autorización.')
      return
    }

    const verifier = sessionStorage.getItem('pkce_verifier')
    if (!verifier) {
      setError('No se encontró el verificador PKCE. Intenta iniciar sesión de nuevo.')
      return
    }

    sessionStorage.removeItem('pkce_verifier')

    fetch('/api/auth/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
          return
        }
        guardarSesion?.(data.token, data.nombre)
        navigate('/', { replace: true })
      })
      .catch(() => setError('Error de red al completar el login.'))
  }, [])

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--gris-100)' }}>
        <div className="card" style={{ maxWidth: 400, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--rojo-500)' }}>Error de autenticación</div>
          <div style={{ fontSize: 14, color: 'var(--gris-600)', marginBottom: 20 }}>{error}</div>
          <button className="btn-primary" onClick={() => window.location.href = '/'}>Volver al inicio</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--gris-100)' }}>
      <div className="card" style={{ maxWidth: 320, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🔐</div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Verificando identidad…</div>
        <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>Completando el inicio de sesión con Authentik</div>
      </div>
    </div>
  )
}
