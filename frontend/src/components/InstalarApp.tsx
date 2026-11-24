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
import { Link } from 'react-router-dom'
import { useT } from '@/i18n'

const K_OCULTO = 'miclase_instalar_oculto'

/** Evento no estándar de Chromium: solo existe donde hay diálogo nativo. */
type EventoInstalacion = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// El navegador avisa UNA vez, al cargar, de que se puede instalar. Se recoge
// aquí, al importar el módulo, y no dentro de un componente: la página
// «Instalar MiClase» se abre más tarde y se habría perdido el aviso.
let eventoGuardado: EventoInstalacion | null = null
const AVISO = 'miclase:instalable'
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    // Sin esto el navegador enseña su propia barra, que aparece y desaparece
    // sin control; guardándolo, el botón «Instalar» la lanza cuando toca.
    e.preventDefault()
    eventoGuardado = e as EventoInstalacion
    window.dispatchEvent(new Event(AVISO))
  })
}

/** El diálogo nativo de instalar, si este navegador lo ofrece ahora. */
export function useEventoInstalacion(): EventoInstalacion | null {
  const [evento, setEvento] = useState(eventoGuardado)
  useEffect(() => {
    const alCambiar = () => setEvento(eventoGuardado)
    window.addEventListener(AVISO, alCambiar)
    return () => window.removeEventListener(AVISO, alCambiar)
  }, [])
  return evento
}

/** Lanza el diálogo nativo. Devuelve si el docente aceptó. */
export async function lanzarInstalacion(): Promise<boolean> {
  const e = eventoGuardado
  if (!e) return false
  await e.prompt()
  const { outcome } = await e.userChoice
  // Un aviso solo sirve una vez
  eventoGuardado = null
  window.dispatchEvent(new Event(AVISO))
  return outcome === 'accepted'
}

export function yaInstalada(): boolean {
  if (typeof window === 'undefined') return true
  // Contenedor nativo (Capacitor): ya es una app, no hay nada que instalar
  if ((window as any).Capacitor?.isNativePlatform?.()) return true
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS marca las apps de pantalla de inicio con esta bandera propia
  return (window.navigator as any).standalone === true
}

export function esIOS(): boolean {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  // El iPad con iPadOS 13+ se anuncia como un Mac; se distingue por el táctil
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

export default function InstalarApp() {
  const evento = useEventoInstalacion()
  const [oculto, setOculto] = useState(() => localStorage.getItem(K_OCULTO) === '1')
  const [instalada] = useState(yaInstalada)
  const [instrucciones, setInstrucciones] = useState(false)
  const t = useT()

  const ios = esIOS()
  if (instalada || oculto) return null
  // Fuera de iOS, sin evento del navegador no hay forma de instalar: callarse
  // es mejor que prometer un botón que no hará nada.
  if (!evento && !ios) return null

  const ocultar = () => { localStorage.setItem(K_OCULTO, '1'); setOculto(true) }

  const instalar = async () => {
    if (await lanzarInstalacion()) ocultar()
  }

  return (
    <div className="card instalar-app">
      <div className="instalar-app-cuerpo">
        <span className="instalar-app-icono" aria-hidden="true">📲</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="instalar-app-titulo">{t('instalarApp.titulo')}</div>
          <p className="instalar-app-texto">
            {t('instalarApp.texto')}{' '}
            <Link to="/instalar" data-instalar-otras>{t('instalarApp.otrasFormas')}</Link>
          </p>
        </div>
        <div className="instalar-app-botones">
          {evento && (
            <button className="btn-primary" onClick={instalar}>{t('instalarApp.instalar')}</button>
          )}
          {!evento && ios && (
            <button className="btn-primary" onClick={() => setInstrucciones(v => !v)}>
              {t('instalarApp.comoSeHace')}
            </button>
          )}
          <button className="btn-secondary" onClick={ocultar}>{t('instalarApp.ahoraNo')}</button>
        </div>
      </div>

      {instrucciones && ios && (
        <ol className="instalar-app-pasos">
          <li>{t('instalarApp.ios1')}</li>
          <li>{t('instalarApp.ios2')}</li>
          <li>{t('instalarApp.ios3')}</li>
          <li>{t('instalarApp.ios4')}</li>
        </ol>
      )}
    </div>
  )
}
