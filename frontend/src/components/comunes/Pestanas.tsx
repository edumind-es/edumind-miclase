/**
 * Las pestañas de la app: una fila de botones de la que solo uno está
 * elegido. Se anuncian como pestañas (`tablist`/`tab`), miden 44 px y se
 * recorren con las flechas, Inicio y Fin; el tabulador entra en la elegida y
 * sale de la fila, como espera quien usa teclado.
 *
 * Dos aspectos, los que ya había: `area` (las grandes, subrayadas) y
 * `unidad` (las pastillas).
 *
 * Con Lámina encendida, las de `area` no se deslizan ni se cortan: las que no
 * caben pasan ENTERAS a «Más · N», y la elegida se queda siempre a la vista
 * (lo que Luis pidió cuidar: nada entrecortado). Las de `unidad` ya saltan de
 * línea, así que no lo necesitan.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { useAspecto } from '@/useAspecto'
import Lista from './Lista'
import Icono from './Icono'
import { pestanasQueNoCaben } from '@/utils/reparto'

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

const ANCHO_MAS = 104

export default function Pestanas<T extends string>({ pestanas, activa, alCambiar, etiqueta, aspecto = 'unidad', style }: Props<T>) {
  const fila = useRef<HTMLDivElement>(null)
  const sinCortes = useAspecto() === 'lamina' && aspecto === 'area'
  const [fuera, setFuera] = useState<number[]>([])
  const anchos = useRef<number[]>([])
  const elegida = pestanas.findIndex(p => p.id === activa)
  const firma = pestanas.map(p => p.id).join('|')

  // Se miden una vez con todas a la vista (su ancho no depende del hueco) y
  // se reparte cada vez que cambia el hueco o la elegida
  useLayoutEffect(() => {
    const el = fila.current
    if (!sinCortes || !el) { setFuera(f => (f.length ? [] : f)); return }
    const repartir = () => setFuera(antes => {
      const ahora = pestanasQueNoCaben(anchos.current, el.clientWidth, elegida, ANCHO_MAS)
      return ahora.join() === antes.join() ? antes : ahora
    })
    const medir = () => {
      const tabs = [...el.querySelectorAll<HTMLElement>('[role="tab"]')]
      const ocultas = tabs.map(b => b.hidden)
      tabs.forEach(b => { b.hidden = false })
      anchos.current = tabs.map(b => b.offsetWidth)
      tabs.forEach((b, i) => { b.hidden = ocultas[i] })
      repartir()
    }
    medir()
    const ro = new ResizeObserver(repartir)
    ro.observe(el)
    document.fonts?.ready.then(medir)
    return () => ro.disconnect()
  }, [sinCortes, firma, elegida])

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
    <div ref={fila} role="tablist" aria-label={etiqueta} className={`${aspecto === 'area' ? 'tabs-area' : 'tabs-unidad'}${sinCortes ? ' tabs-sin-cortes' : ''}`}
      style={style} onKeyDown={alTeclear}>
      {pestanas.map((p, i) => (
        <button key={p.id} type="button" role="tab" aria-selected={p.id === activa} tabIndex={p.id === activa ? 0 : -1}
          data-pestana={p.id} hidden={fuera.includes(i)}
          className={`${aspecto === 'area' ? 'tab-area' : 'tab-unidad'}${p.id === activa ? ' activa' : ''}`}
          onClick={() => alCambiar(p.id)}>
          {p.etiqueta}
        </button>
      ))}
      {sinCortes && fuera.length > 0 && (
        <Lista<number> etiqueta={`Más pestañas: ${etiqueta}`} className="tab-area tabs-mas" data-pestanas-mas
          opciones={fuera.map(i => ({ valor: i, texto: fila.current?.querySelectorAll('[role="tab"]')[i]?.textContent ?? String(pestanas[i].id) }))}
          alElegir={i => alCambiar(pestanas[i].id)}>
          Más · {fuera.length} <Icono nombre="mas" lado={18} />
        </Lista>
      )}
    </div>
  )
}
