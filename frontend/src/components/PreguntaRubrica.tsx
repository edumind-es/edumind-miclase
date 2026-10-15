/**
 * «¿Corregir o nueva observación?»: la pregunta que sale al cambiar una
 * rúbrica que ya tenía nota.
 *
 * Dos cosas distintas pueden querer decir «cambio la rúbrica»: que la
 * anterior estaba mal (se corrige y no queda rastro) o que el alumno ha
 * vuelto a hacer la tarea y esta es otra observación (las dos cuentan y la
 * nota es la agregación del instrumento, media por defecto). Decisión de
 * Luis: no se da por supuesta ninguna; se elige una vez por pantalla y
 * queda a la vista para cambiarla.
 */
import { useEffect } from 'react'

export type ModoRubrica = 'corregir' | 'evolucion'

export const ETIQUETA_MODO: Record<ModoRubrica, string> = {
  corregir: 'Corregir la nota',
  evolucion: 'Nueva observación',
}

interface Props {
  /** Nota que ya tenía (para decirla). */
  notaActual: number | null
  /** Regla con la que el instrumento agrega observaciones («media», «última»…). */
  regla: string
  onElegir: (modo: ModoRubrica) => void
  onCancelar: () => void
}

export default function PreguntaRubrica({ notaActual, regla, onElegir, onCancelar }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancelar])

  return (
    <div className="modal-overlay" style={{ zIndex: 60 }} onClick={e => { if (e.target === e.currentTarget) onCancelar() }}>
      <div role="dialog" aria-modal="true" aria-label="¿Corregir la nota o añadir una observación?" data-pregunta-rubrica
        className="card" style={{ width: 'min(480px, 94vw)', padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-900)', margin: '0 0 8px' }}>
          Ya tenía {notaActual != null ? <strong>{notaActual}</strong> : 'nota'} con esta rúbrica
        </h2>
        <p style={{ fontSize: 13, color: 'var(--gris-600)', lineHeight: 1.55, margin: '0 0 14px' }}>
          ¿Es una corrección de aquella nota o una observación nueva? La corrección la sustituye;
          la observación se suma a las anteriores y la nota pasa a ser su <strong>{regla.toLowerCase()}</strong>.
          Lo que elijas vale para el resto de esta pantalla y se puede cambiar arriba.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" data-modo-rubrica="evolucion" className="btn-primary" onClick={() => onElegir('evolucion')}
            style={{ textAlign: 'left', padding: '10px 14px', fontSize: 13.5 }}>
            {ETIQUETA_MODO.evolucion}
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, opacity: .9 }}>Ha vuelto a hacerlo: las dos cuentan y se ve la evolución.</span>
          </button>
          <button type="button" data-modo-rubrica="corregir" className="btn-secondary" onClick={() => onElegir('corregir')}
            style={{ textAlign: 'left', padding: '10px 14px', fontSize: 13.5 }}>
            {ETIQUETA_MODO.corregir}
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, opacity: .8 }}>La anterior estaba mal: se sustituye y no cuenta.</span>
          </button>
          <button type="button" onClick={onCancelar} style={{ background: 'none', border: 'none', color: 'var(--gris-500)', fontSize: 12.5, cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' }}>
            Cancelar, dejarla como estaba
          </button>
        </div>
      </div>
    </div>
  )
}

/** El conmutador «corregir / nueva observación» que queda a la vista en la pantalla. */
export function SelectorModoRubrica({ modo, onCambiar }: { modo: ModoRubrica | null; onCambiar: (m: ModoRubrica) => void }) {
  return (
    // Radios y no `aria-pressed`: los botones de nivel del panel se cuentan por
    // ese atributo (en las pruebas y en el lector de pantalla), y el conmutador
    // no es un nivel.
    <div data-selector-modo role="radiogroup" aria-label="Al cambiar una nota ya puesta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--gris-600)' }}>
      <span>Al cambiar una nota ya puesta:</span>
      {(['evolucion', 'corregir'] as ModoRubrica[]).map(m => (
        <button key={m} type="button" role="radio" data-modo-rubrica={m} aria-checked={modo === m} onClick={() => onCambiar(m)}
          style={{
            padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
            border: `1px solid ${modo === m ? 'var(--azul-700)' : 'var(--gris-300)'}`,
            background: modo === m ? 'var(--azul-700)' : 'white', color: modo === m ? 'white' : 'var(--gris-600)',
          }}>
          {ETIQUETA_MODO[m]}
        </button>
      ))}
      {modo === null && <span style={{ fontStyle: 'italic' }}>se pregunta la primera vez</span>}
    </div>
  )
}
