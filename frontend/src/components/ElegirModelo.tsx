/**
 * Elegir un modelo para una actividad: los tres que trae la app de serie y
 * las rúbricas, listas y escalas del banco del docente. Elegir uno no guarda
 * nada: quien abre recibe una COPIA y la enseña en el editor de rúbricas.
 */
import { useEffect, useState } from 'react'
import { getBancoRubricas, type RubricaDeBanco } from '@/db/queries'
import { MODELOS_DE_SERIE } from '@/db/modelosDeSerie'
import type { RubricaParsed } from '@/ia/rubricaPrompt'

export type ModeloElegido = { rubrica: RubricaParsed; nombre: string; generadaIA?: boolean }

const aParsed = (r: RubricaDeBanco): RubricaParsed | null => {
  try { return { titulo: r.titulo, niveles: JSON.parse(r.niveles_json), indicadores: JSON.parse(r.indicadores_json) } }
  catch { return null }
}

const boton = { minHeight: 44, fontSize: 14, textAlign: 'left', width: '100%', padding: '8px 12px' } as const

export default function ElegirModelo({ onElegir }: { onElegir: (m: ModeloElegido) => void }) {
  const [banco, setBanco] = useState<RubricaDeBanco[] | null>(null)
  useEffect(() => {
    let vigente = true
    getBancoRubricas().then(l => { if (vigente) setBanco(l) }).catch(() => { if (vigente) setBanco([]) })
    return () => { vigente = false }
  }, [])

  return (
    <div data-elegir-modelo style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gris-600)' }}>De serie</div>
      {MODELOS_DE_SERIE.map(m => (
        <button key={m.id} type="button" className="btn-secondary" data-modelo-elegir={`serie:${m.id}`} style={boton}
          onClick={() => onElegir({ rubrica: structuredClone(m.rubrica), nombre: m.nombre })}>
          <strong>{m.nombre}</strong> <span style={{ color: 'var(--gris-600)' }}>· {m.rubrica.indicadores.length} filas</span>
        </button>
      ))}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gris-600)', marginTop: 4 }}>Mis modelos</div>
      {banco == null ? <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>Cargando…</div>
        : banco.length === 0 ? <div data-modelos-vacio style={{ fontSize: 13, color: 'var(--gris-600)' }}>Todavía no tienes rúbricas guardadas ni en uso.</div>
        : banco.map(r => {
          const parsed = aParsed(r)
          if (!parsed) return null
          return (
            <button key={r.id} type="button" className="btn-secondary" data-modelo-elegir={`banco:${r.id}`} style={boton}
              onClick={() => onElegir({ rubrica: parsed, nombre: r.titulo, generadaIA: !!r.generada_ia })}>
              <strong>{r.titulo}</strong>
              <span style={{ color: 'var(--gris-600)' }}> · {parsed.indicadores.length} filas{r.usos.length ? ` · en uso en ${r.usos[0]}${r.usos.length > 1 ? ` y ${r.usos.length - 1} más` : ''}` : ''}</span>
            </button>
          )
        })}
      <div style={{ fontSize: 12.5, color: 'var(--gris-600)' }}>Se copia: adaptarlo aquí no cambia el modelo ni las otras actividades.</div>
    </div>
  )
}
