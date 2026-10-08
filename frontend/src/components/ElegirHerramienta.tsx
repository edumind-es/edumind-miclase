/**
 * Elegir con qué se evalúa un instrumento que aún no tiene herramienta.
 *
 * Luis lo pidió por agilidad: si quiere evaluar hoy con rúbrica no puede
 * tener que bajar a una casilla, abrir «Más» y buscar un icono pequeño para
 * crearla. La elección se ofrece en los tres sitios por los que se entra a
 * calificar —la cabecera de la columna, «Evaluar hoy» y el panel de la
 * casilla— con los mismos botones (`BotonesHerramienta`), y la lista de
 * control y la escala de estimación son rúbricas con otra forma
 * (`herramientaInicial`), así que el calificador las aplica igual.
 */
import { useState } from 'react'
import RubricaEditor from './RubricaEditor'
import type { HerramientaSimple } from '@/ia/rubricaPlantillas'
import type { CeldaInstrumento } from '@/db/queries'

/** Tipos cuya herramienta natural es el diario de observación: ahí no falta nada. */
export const TIPOS_DE_OBSERVACION = ['observacion', 'diario', 'actitud']
export const esDeObservacion = (tipo: string) => TIPOS_DE_OBSERVACION.includes(tipo)

/** Lo que entra en la cabecera de la columna y en «Evaluar hoy»: sin examen, sin rúbrica y sin ser de observación. */
export const faltaHerramienta = (ins: { tipo: string; tiene_rubrica: boolean; tiene_prueba: boolean }) =>
  !ins.tiene_prueba && !ins.tiene_rubrica && !esDeObservacion(ins.tipo)

interface BotonesProps {
  tipo: string
  /** Abrir el editor de rúbrica; con `inicio`, ya con la forma de lista o escala. */
  onRubrica: (inicio?: HerramientaSimple) => void
  /** Definir el examen (solo tiene sentido en prueba escrita). */
  onExamen?: () => void
}

export function BotonesHerramienta({ tipo, onRubrica, onExamen }: BotonesProps) {
  const esPrueba = tipo === 'prueba-escrita'
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {esPrueba && onExamen && (
        <button type="button" data-elegir-herramienta="examen" onClick={onExamen} className="btn-primary" style={{ fontSize: 12 }}
          title="Preguntas y lo que vale cada una; se corrige pregunta a pregunta">📝 Definir examen</button>
      )}
      <button type="button" data-elegir-herramienta="rubrica" onClick={() => onRubrica()} className={esPrueba && onExamen ? 'btn-secondary' : 'btn-primary'} style={{ fontSize: 12 }}
        title="Indicadores con un descriptor por nivel; plantillas, banco o IA">📊 Rúbrica</button>
      <button type="button" data-elegir-herramienta="lista" onClick={() => onRubrica('lista')} className="btn-secondary" style={{ fontSize: 12 }}
        title="Ítems que se cumplen o no (Sí / No)">☑️ Lista de control</button>
      <button type="button" data-elegir-herramienta="escala" onClick={() => onRubrica('escala')} className="btn-secondary" style={{ fontSize: 12 }}
        title="Aspectos graduados en niveles, sin descriptores">📏 Escala de estimación</button>
    </div>
  )
}

interface Props {
  instrumento: CeldaInstrumento
  asignaturaNombre: string
  /** «6º Primaria», para el editor de rúbrica. */
  nivel: string
  /** Se ha guardado (o cerrado) el editor: la matriz tiene que releer `tiene_rubrica`. */
  onCambio: () => void
  onCerrar: () => void
  /** Definir el examen, si es prueba escrita: lo abre quien sepa dónde. */
  onExamen?: () => void
}

/**
 * Diálogo desde la cabecera de la columna: la pregunta y los botones. Elegir
 * rúbrica, lista o escala abre el editor encima; al cerrarlo se vuelve a la
 * matriz, que ya enseña «Calificar con la rúbrica».
 */
export default function ElegirHerramienta({ instrumento, asignaturaNombre, nivel, onCambio, onCerrar, onExamen }: Props) {
  const [editor, setEditor] = useState<{ inicio?: HerramientaSimple } | null>(null)
  if (editor) {
    return (
      <RubricaEditor
        inicio={editor.inicio}
        instrumentoId={instrumento.instrumento_id}
        instrumentoNombre={instrumento.nombre}
        asignaturaNombre={asignaturaNombre}
        nivel={nivel}
        capa="var(--z-modal)"
        onCerrar={() => { setEditor(null); onCambio(); onCerrar() }}
      />
    )
  }
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Herramienta de ${instrumento.nombre}`} data-elegir-herramienta-dialogo
        style={{ width: 'min(560px, 96vw)', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)', borderTop: `4px solid ${instrumento.color}` }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--azul-900)' }}>¿Con qué se evalúa «{instrumento.nombre}»?</div>
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar">✕</button>
        </div>
        <div style={{ padding: '14px 18px 18px', fontSize: 13, color: 'var(--gris-700)', lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 12px' }}>
            Aún no tiene herramienta. Elige una y el calificador la enseñará cada vez que
            evalúes con «{instrumento.nombre}»: en «Calificar con la rúbrica» (toda la clase de
            una pasada) y al pulsar cualquier casilla suya.
          </p>
          <BotonesHerramienta tipo={instrumento.tipo} onRubrica={inicio => setEditor({ inicio })} onExamen={onExamen} />
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--gris-500)' }}>
            Mientras tanto, «Evaluar hoy» anota con el diario de observación (cuatro niveles) y las casillas admiten una nota directa 0-10.
          </p>
        </div>
      </div>
    </div>
  )
}
