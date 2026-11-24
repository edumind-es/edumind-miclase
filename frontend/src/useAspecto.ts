import { useEffect, useState } from 'react'
import { EVENTO_ASPECTO, aspectoAhora, type Aspecto } from './aspecto'
import { EVENTO_NOTAS, modoNotasAhora, type ModoNotas } from './notas'

/** El aspecto de este aparato; repinta al cambiarlo (desde «Acerca de»). */
export function useAspecto(): Aspecto {
  const [aspecto, setAspecto] = useState<Aspecto>(aspectoAhora)
  useEffect(() => {
    const alCambiar = () => setAspecto(aspectoAhora())
    window.addEventListener(EVENTO_ASPECTO, alCambiar)
    return () => window.removeEventListener(EVENTO_ASPECTO, alCambiar)
  }, [])
  return aspecto
}

/** Filete o relleno para las notas; repinta al cambiarlo. */
export function useModoNotas(): ModoNotas {
  const [modo, setModo] = useState<ModoNotas>(modoNotasAhora)
  useEffect(() => {
    const alCambiar = () => setModo(modoNotasAhora())
    window.addEventListener(EVENTO_NOTAS, alCambiar)
    return () => window.removeEventListener(EVENTO_NOTAS, alCambiar)
  }, [])
  return modo
}
