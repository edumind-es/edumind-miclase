/**
 * Aviso de trabajo sin conexión.
 *
 * La app es local-first: sin red se puede seguir calificando, pasando lista y
 * consultando la programación, porque todo eso vive en el dispositivo. Lo
 * único que necesita red es el currículo la primera vez y la sincronización.
 * El docente tiene que saber en cuál de los dos estados está, sobre todo en el
 * gimnasio o en una salida.
 */
import { useEffect, useState } from 'react'

export default function EstadoConexion() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const subir = () => { setEnLinea(true); setVisible(true); setTimeout(() => setVisible(false), 4000) }
    const bajar = () => { setEnLinea(false); setVisible(true) }
    window.addEventListener('online', subir)
    window.addEventListener('offline', bajar)
    if (!navigator.onLine) setVisible(true)
    return () => {
      window.removeEventListener('online', subir)
      window.removeEventListener('offline', bajar)
    }
  }, [])

  if (!visible) return null

  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)',
      zIndex: 1200, borderRadius: 22, padding: '9px 18px',
      fontSize: 13, fontWeight: 600, boxShadow: 'var(--sombra-md)',
      display: 'flex', alignItems: 'center', gap: 9, maxWidth: 'calc(100vw - 32px)',
      background: enLinea ? 'var(--verde-500)' : 'var(--gris-900)',
      color: 'white',
    }}>
      <span style={{
        width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
        background: enLinea ? '#bbf7d0' : 'var(--ambar-500)',
      }} />
      {enLinea
        ? 'Conexión recuperada'
        : 'Sin conexión — puedes seguir evaluando: todo se guarda en el dispositivo'}
    </div>
  )
}
