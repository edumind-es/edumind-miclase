/**
 * El diálogo de la app: velo, tarjeta con título, botón de cerrar de 44 px,
 * Esc y pulsar fuera para cerrar. El foco se queda dentro y vuelve a donde
 * estaba al cerrar: de eso se ocupa `utils/foco.ts` para todo lo que lleve
 * `.modal-overlay`, esté hecho con este componente o no.
 *
 * Los atributos que sobran (`data-…`) van a la tarjeta, que es lo que buscan
 * las pruebas.
 */
import { useEffect, useId, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Lo que se lee en grande arriba. */
  titulo: ReactNode
  /** Línea pequeña sobre el título: de qué clase de diálogo se trata. */
  antetitulo?: ReactNode
  /** Línea bajo el título. */
  subtitulo?: ReactNode
  onCerrar: () => void
  /** Ancho máximo de la tarjeta en px. */
  ancho?: number
  /** Va encima de otro diálogo. */
  anidado?: boolean
  /** Botones del pie, alineados a la derecha. */
  pie?: ReactNode
  children: ReactNode
}

export default function Dialogo({ titulo, antetitulo, subtitulo, onCerrar, ancho = 760, anidado, pie, children, style, ...resto }: Props) {
  const idTitulo = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const velo: CSSProperties | undefined = anidado ? { zIndex: 'var(--z-modal-anidado)' as unknown as number } : undefined

  return (
    <div className="modal-overlay" style={velo} onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card dialogo" role="dialog" aria-modal="true" aria-labelledby={idTitulo}
        style={{ width: `min(${ancho}px, 96vw)`, ...style }} {...resto}>
        <div className="dialogo-cabecera">
          <div>
            {antetitulo && <div className="dialogo-antetitulo">{antetitulo}</div>}
            <h2 id={idTitulo} className="dialogo-titulo">{titulo}</h2>
            {subtitulo && <div className="dialogo-subtitulo">{subtitulo}</div>}
          </div>
          <button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="dialogo-cuerpo">{children}</div>
        {pie && <div className="dialogo-pie">{pie}</div>}
      </div>
    </div>
  )
}
