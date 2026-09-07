/**
 * Invitación a instalar MiClase en el dispositivo.
 *
 * La app era instalable desde el primer día —manifiesto y service worker
 * están puestos— pero nadie lo decía, así que en la práctica todo el mundo la
 * usaba como una página web más. En Android y escritorio el navegador ofrece
 * un diálogo nativo; en iPad y iPhone, Safari no ofrece ninguno y hay que
 * explicar el camino de «Compartir → Añadir a pantalla de inicio», que es
 * justo donde vive el caso de uso de evaluar en el aula.
 */
import { useEffect, useState } from 'react'

const K_OCULTO = 'miclase_instalar_oculto'

/** Evento no estándar de Chromium: solo existe donde hay diálogo nativo. */
type EventoInstalacion = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function yaInstalada(): boolean {
  if (typeof window === 'undefined') return true
  // Contenedor nativo (Capacitor): ya es una app, no hay nada que instalar
  if ((window as any).Capacitor?.isNativePlatform?.()) return true
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS marca las apps de pantalla de inicio con esta bandera propia
  return (window.navigator as any).standalone === true
}

function esIOS(): boolean {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  // El iPad con iPadOS 13+ se anuncia como un Mac; se distingue por el táctil
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null)
  const [oculto, setOculto] = useState(() => localStorage.getItem(K_OCULTO) === '1')
  const [instalada] = useState(yaInstalada)
  const [instrucciones, setInstrucciones] = useState(false)

  useEffect(() => {
    const alPoder = (e: Event) => {
      // Sin esto el navegador enseña su propia barra, que aparece y desaparece
      // sin control; guardándolo, el botón de abajo la lanza cuando toca.
      e.preventDefault()
      setEvento(e as EventoInstalacion)
    }
    window.addEventListener('beforeinstallprompt', alPoder)
    return () => window.removeEventListener('beforeinstallprompt', alPoder)
  }, [])

  const ios = esIOS()
  if (instalada || oculto) return null
  // Fuera de iOS, sin evento del navegador no hay forma de instalar: callarse
  // es mejor que prometer un botón que no hará nada.
  if (!evento && !ios) return null

  const ocultar = () => { localStorage.setItem(K_OCULTO, '1'); setOculto(true) }

  const instalar = async () => {
    if (!evento) return
    await evento.prompt()
    const { outcome } = await evento.userChoice
    setEvento(null)
    if (outcome === 'accepted') ocultar()
  }

  return (
    <div className="card instalar-app">
      <div className="instalar-app-cuerpo">
        <span className="instalar-app-icono" aria-hidden="true">📲</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="instalar-app-titulo">Instala MiClase en este dispositivo</div>
          <p className="instalar-app-texto">
            Se abre desde el icono, a pantalla completa y sin barra del navegador, y
            funciona sin conexión: podrás pasar lista y calificar en el gimnasio, en el
            patio o en una salida.
          </p>
        </div>
        <div className="instalar-app-botones">
          {evento && (
            <button className="btn-primary" onClick={instalar}>Instalar</button>
          )}
          {!evento && ios && (
            <button className="btn-primary" onClick={() => setInstrucciones(v => !v)}>
              Cómo se hace
            </button>
          )}
          <button className="btn-secondary" onClick={ocultar}>Ahora no</button>
        </div>
      </div>

      {instrucciones && ios && (
        <ol className="instalar-app-pasos">
          <li>Abre esta página en <strong>Safari</strong> (desde otro navegador iOS no deja).</li>
          <li>Pulsa el botón <strong>Compartir</strong> — el cuadrado con la flecha hacia arriba.</li>
          <li>Baja y elige <strong>Añadir a pantalla de inicio</strong>.</li>
          <li>Confirma con <strong>Añadir</strong>. El icono de MiClase aparece junto al resto de tus apps.</li>
        </ol>
      )}
    </div>
  )
}
