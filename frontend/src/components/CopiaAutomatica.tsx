/**
 * Copia automática, viva en toda la app (igual que `SyncAutomatica`).
 *
 * Si hay un destino recordado y la contraseña de sincronización está
 * desbloqueada, escribe la copia incremental a los 20 s de abrir la app,
 * cada cinco minutos y al volver del segundo plano. Sin interfaz: la tarjeta
 * de Sincronizar es donde se activa, se ve y se restaura.
 *
 * Una carpeta cuyo permiso ha caducado no se puede pedir desde un
 * temporizador (el navegador exige un clic): se deja estar y la tarjeta lo
 * dice.
 */
import { useEffect, useRef } from 'react'
import { claveGuardada } from '@/db/sync'
import { destinoGuardado } from '@/db/destinoCopia'
import { hacerCopia } from '@/db/copia'

const CADA = 5 * 60_000
const AL_ABRIR = 20_000

export default function CopiaAutomatica() {
  const enCurso = useRef(false)

  useEffect(() => {
    const tic = async () => {
      if (enCurso.current) return
      enCurso.current = true
      try {
        if (!(await claveGuardada())) return
        const d = await destinoGuardado()
        if (!d || d.permiso !== 'granted') return
        await hacerCopia(d.destino)
      } catch {
        // El motivo queda en `copia_error` y lo enseña la tarjeta de Sincronizar.
      } finally {
        enCurso.current = false
      }
    }
    const primero = window.setTimeout(tic, AL_ABRIR)
    const id = window.setInterval(tic, CADA)
    const alVolver = () => { if (document.visibilityState === 'visible') tic() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.clearTimeout(primero)
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])

  return null
}
