/**
 * Puente entre los enlaces con `?grupo_id=` / `?asignatura_id=` y la clase
 * activa.
 *
 * Los QR de mesa ya impresos y los atajos internos llevan la clase en la URL.
 * Antes cada pantalla los leía en su propio estado, así que entrar por un QR
 * dejaba esa pantalla mirando una clase y el resto de la app mirando otra.
 * Ahora el parámetro fija la clase activa y se retira de la barra de
 * direcciones: manda el contexto, no la URL.
 */
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClaseActiva } from './ClaseActiva'

export function useParametrosClase() {
  const [params, setParams] = useSearchParams()
  const { elegirGrupo, elegirAsignatura } = useClaseActiva()

  useEffect(() => {
    const grupo = Number(params.get('grupo_id'))
    const asignatura = Number(params.get('asignatura_id'))
    if (!grupo && !asignatura) return

    if (grupo) elegirGrupo(grupo, asignatura || null)
    else if (asignatura) elegirAsignatura(asignatura)

    // Se conserva el resto (`unidad_id`, por ejemplo): son de la pantalla.
    const resto = new URLSearchParams(params)
    resto.delete('grupo_id')
    resto.delete('asignatura_id')
    setParams(resto, { replace: true })
  }, [params, elegirGrupo, elegirAsignatura, setParams])
}
