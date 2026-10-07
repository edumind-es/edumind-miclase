/**
 * Actualización de la app instalada (PWA).
 *
 * El navegador solo comprueba el service worker al abrir la app o cada 24 h.
 * Una PWA que se deja abierta en el iPad no se entera de los despliegues, y
 * la recién abierta pinta la pantalla con la caché vieja antes de que el
 * service worker nuevo tome el control: la versión nueva se veía a la
 * segunda apertura. Aquí se pregunta al abrir, al volver a primer plano y
 * cada media hora, y la versión nueva entra sola en dos momentos en los que
 * no hay nada a medias que perder: si aparece en los primeros segundos tras
 * abrir (la «segunda apertura» deja de existir), y al volver a la app tras
 * haberla dejado en segundo plano. Entre medias se avisa con un botón, y no
 * se recarga a traición: perdería lo que el docente esté escribiendo.
 */
import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const CADA = 30 * 60 * 1000
/** Hasta aquí desde el arranque, aplicar sin preguntar: aún no se ha empezado a trabajar. */
const RECIEN_ABIERTA = 20 * 1000
const arranque = Date.now()

export default function ActualizacionApp() {
  const {
    needRefresh: [lista],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      if (!registro) return
      // Sin red la comprobación fallaría sin más; se ahorra el intento
      const comprobar = () => { if (navigator.onLine) registro.update().catch(() => {}) }
      const alVolver = () => { if (document.visibilityState === 'visible') comprobar() }
      // El registro dura toda la vida de la página: no hace falta desmontar
      setInterval(comprobar, CADA)
      document.addEventListener('visibilitychange', alVolver)
      window.addEventListener('online', comprobar)
    },
  })

  // Tras «Actualizar», el plugin manda SKIP_WAITING al service worker en
  // espera y recarga la página él mismo en cuanto ese toma el control.
  const aplicando = useRef(false)
  const aplicar = () => {
    if (aplicando.current) return
    aplicando.current = true
    updateServiceWorker(true)
  }

  // Automático cuando no hay nada que perder: recién abierta, o al volver
  // del segundo plano (el docente no estaba escribiendo en ella).
  useEffect(() => {
    if (!lista) return
    if (Date.now() - arranque < RECIEN_ABIERTA) { aplicar(); return }
    const alVolver = () => { if (document.visibilityState === 'visible') aplicar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [lista])

  if (!lista) return null

  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)',
      zIndex: 'var(--z-aviso)', borderRadius: 22, padding: '9px 10px 9px 18px',
      fontSize: 13, fontWeight: 600, boxShadow: 'var(--sombra-md)',
      display: 'flex', alignItems: 'center', gap: 12, maxWidth: 'calc(100vw - 32px)',
      background: 'var(--azul-700)', color: 'white',
    }}>
      <span>Hay una versión nueva de MiClase</span>
      <button
        onClick={aplicar}
        style={{
          border: 'none', borderRadius: 16, padding: '6px 14px', cursor: 'pointer',
          background: 'white', color: 'var(--azul-700)', fontWeight: 700, fontSize: 13,
        }}
      >
        Actualizar
      </button>
    </div>
  )
}
