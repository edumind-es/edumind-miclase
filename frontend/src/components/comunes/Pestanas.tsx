/**
 * Las pestañas de la app: una fila de botones de la que solo uno está
 * elegido. Se anuncian como pestañas (`tablist`/`tab`), miden 44 px y se
 * recorren con las flechas, Inicio y Fin; el tabulador entra en la elegida y
 * sale de la fila, como espera quien usa teclado.
 *
 * Dos aspectos, los que ya había: `area` (las grandes, subrayadas) y
 * `unidad` (las pastillas).
 */
import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'

export interface Pestana<T extends string> {
  id: T
  etiqueta: ReactNode
}

interface Props<T extends string> {
  pestanas: readonly Pestana<T>[]
  activa: T
  alCambiar: (id: T) => void
  /** Qué eligen estas pestañas, para quien no las ve. */
  etiqueta: string
  aspecto?: 'area' | 'unidad'
  style?: CSSProperties
}

export default function Pestanas<T extends string>({ pestanas, activa, alCambiar, etiqueta, aspecto = 'unidad', style }: Props<T>) {
  const fila = useRef<HTMLDivElement>(null)

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = pestanas.findIndex(p => p.id === activa)
    const n = pestanas.length
    const destino = e.key === 'ArrowRight' ? (i + 1) % n
      : e.key === 'ArrowLeft' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : -1
    if (destino < 0 || destino === i) return
    e.preventDefault()
    alCambiar(pestanas[destino].id)
    // El foco acompaña a la elegida: si no, la flecha siguiente no haría nada.
    fila.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[destino]?.focus()
  }

  return (
    <div ref={fila} role="tablist" aria-label={etiqueta} className={aspecto === 'area' ? 'tabs-area' : 'tabs-unidad'}
      style={style} onKeyDown={alTeclear}>
      {pestanas.map(p => (
        <button key={p.id} type="button" role="tab" aria-selected={p.id === activa} tabIndex={p.id === activa ? 0 : -1}
          data-pestana={p.id}
          className={`${aspecto === 'area' ? 'tab-area' : 'tab-unidad'}${p.id === activa ? ' activa' : ''}`}
          onClick={() => alCambiar(p.id)}>
          {p.etiqueta}
        </button>
      ))}
    </div>
  )
}
