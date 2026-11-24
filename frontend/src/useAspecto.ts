import { useEffect, useState } from 'react'
import { EVENTO_ASPECTO, aspectoAhora, type Aspecto } from './aspecto'

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
