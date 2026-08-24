/**
 * Sincronización automática, viva en toda la app.
 *
 * Estaba dentro de la pantalla de sincronización: el intervalo de cinco
 * minutos solo corría mientras ese componente estaba montado, así que en
 * cuanto el docente navegaba a Evaluación —que es donde pasa el día— dejaba
 * de sincronizar, pese a tener el interruptor puesto.
 *
 * Aquí no hay interfaz: solo el temporizador. La pantalla de sincronización
 * sigue mandando (es donde se activa y donde se ve el resultado); esto se
 * limita a que el reloj no dependa de qué pantalla esté abierta.
 */
import { useEffect, useRef } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { claveGuardada, sincronizar } from '@/db/sync'

const K_AUTO = 'miclase_sync_auto'
const CADA = 5 * 60_000

export default function SyncAutomatica() {
  const { modo, headers } = useAuth()
  // Evita solapar dos ciclos si uno tarda más que el intervalo
  const enCurso = useRef(false)

  useEffect(() => {
    if (modo !== 'authentik') return

    const tic = async () => {
      if (enCurso.current) return
      if (localStorage.getItem(K_AUTO) !== '1') return
      if (!navigator.onLine) return
      if (!(await claveGuardada())) return

      enCurso.current = true
      try {
        await sincronizar(headers)
      } catch {
        // Sin ruido: el detalle del fallo se ve en la pantalla de
        // sincronización, que es donde el docente puede hacer algo.
      } finally {
        enCurso.current = false
      }
    }

    const id = window.setInterval(tic, CADA)
    // Y también al volver a la app tras dejarla en segundo plano
    const alVolver = () => { if (document.visibilityState === 'visible') tic() }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [modo, headers])

  return null
}
