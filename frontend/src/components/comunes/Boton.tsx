/**
 * El botón de la app. Una sola pieza para que todos midan lo mismo (44 px,
 * lo que pide un dedo) y se llamen igual: primario para la acción de la
 * pantalla, secundario para lo demás, peligro para lo que borra y enlace
 * para lo que va dentro de un texto.
 *
 * Los estilos son los de siempre (`.btn-primary`, `.btn-secondary`,
 * `.btn-danger` en index.css): lo escrito antes con esas clases sigue
 * valiendo y se ve igual. Lo nuevo usa este componente.
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'

export type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'enlace'

const CLASE: Record<VarianteBoton, string> = {
  primario: 'btn-primary',
  secundario: 'btn-secondary',
  peligro: 'btn-danger',
  enlace: 'boton-enlace',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton
}

const Boton = forwardRef<HTMLButtonElement, Props>(function Boton(
  { variante = 'secundario', className, type = 'button', ...resto }, ref,
) {
  return <button ref={ref} type={type} className={`boton ${CLASE[variante]}${className ? ` ${className}` : ''}`} {...resto} />
})

export default Boton
