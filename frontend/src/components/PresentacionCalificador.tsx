/**
 * Tarjeta de bienvenida al Calificador de un área, la primera vez.
 *
 * Para quien viene de una hoja de cálculo: qué es cada cosa, en cuatro
 * pasos, y cómo está organizada su evaluación (las familias de la
 * programación con lo que hay dentro, cada una con su color). Se cierra con
 * «Entendido» y no vuelve a salir en este aparato; «Ajustarlo a mi forma de
 * trabajar» abre ⚙ Instrumentos.
 */
import type { ColumnaInstrumento } from './MatrizInstrumentos'
import { gruposPorFamilia } from './MatrizInstrumentos'
import { abreviatura } from '@/ia/instrumentosConfig'

interface Props {
  area: string
  columnas: ColumnaInstrumento[]
  onAjustar: () => void
  onCerrar: () => void
}

const PASOS = [
  ['Arriba eliges la clase y el trimestre', 'Todo lo que hagas aquí es de esa clase y ese trimestre.'],
  ['Cada columna es algo que corriges', 'Un examen, el cuaderno, speaking… Lo que la programación trae son familias con su peso; lo que hay dentro lo decides tú.'],
  ['Pulsa una casilla para poner nota', 'Verás el criterio, con qué se evalúa y su rúbrica. La nota se guarda al pulsarla.'],
  ['«Evaluar hoy» pasa por toda la clase', 'Cuatro niveles por alumno, al diario. Y «Pegar columna» trae las notas de tu hoja de cálculo.'],
]

export default function PresentacionCalificador({ area, columnas, onAjustar, onCerrar }: Props) {
  const grupos = gruposPorFamilia(columnas)
  return (
    <div data-presentacion className="card" style={{ padding: '16px 18px', marginBottom: 14, border: '1px solid var(--azul-300)', background: 'linear-gradient(135deg, #f0f7ff, #ffffff)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-900)' }}>Así se organiza tu evaluación de {area}</div>
        <div style={{ flex: 1 }} />
        <button data-presentacion-cerrar onClick={onCerrar} className="modal-close" aria-label="Cerrar">✕</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
        {PASOS.map(([t, d], i) => (
          <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--azul-700)', color: 'white', fontWeight: 800, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
            <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--gris-900)' }}>{t}</strong>
              <div style={{ color: 'var(--gris-600)' }}>{d}</div>
            </div>
          </div>
        ))}
      </div>

      {grupos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {grupos.map(g => (
            <div key={g.id} data-presentacion-familia style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
              <strong style={{ color: 'var(--gris-900)', minWidth: 160 }}>{g.nombre} <span style={{ fontWeight: 500, color: 'var(--gris-600)' }}>{g.peso}%</span></strong>
              {g.sola ? (
                <span style={{ color: 'var(--gris-600)' }}>se califica directamente con ella</span>
              ) : g.columnas.map(c => (
                <span key={c.ins.instrumento_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px 2px 4px', borderRadius: 12, border: `1.5px solid ${c.ins.color}` }}>
                  <i style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 14, borderRadius: 3, background: c.ins.color, color: 'white', fontStyle: 'normal', fontSize: 9.5, fontWeight: 800 }}>{abreviatura(c.ins.nombre)}</i>
                  {c.ins.nombre}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button data-presentacion-ajustar className="btn-secondary" onClick={onAjustar} style={{ fontSize: 13 }}>⚙ Ajustarlo a mi forma de trabajar</button>
        <button data-presentacion-entendido className="btn-primary" onClick={onCerrar} style={{ fontSize: 13 }}>Entendido</button>
      </div>
    </div>
  )
}
