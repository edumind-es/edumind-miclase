/**
 * Pegar una columna de notas desde una hoja de cálculo sobre un instrumento.
 *
 * Quien lleva años con su Excel tiene ahí las notas del examen. Copia la
 * columna (sola, o con el nombre al lado), la pega aquí, ve a quién va cada
 * nota y confirma. Cada nota se guarda en todos los criterios que el
 * instrumento cubre en lo que se está viendo —el mismo reparto que «Evaluar
 * hoy»— y pasa por `saveCalificaciones` como cualquier otra.
 */
import { useMemo, useState } from 'react'
import { saveCalificaciones, type CeldaInstrumento, type DatosDeArea } from '@/db/queries'
import { interpretarPegado } from '@/utils/pegarNotas'
import { calificativo } from '@/db/calculo'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import type { Alumno } from '@/db/localDb'

interface Props {
  instrumento: CeldaInstrumento
  criterios: { id: string; descripcion: string }[]
  alumnos: Alumno[]
  trimestre: number
  unidadId: number | null
  area: DatosDeArea
  onGuardado: (n: number) => void
  onCerrar: () => void
}

export default function PegarColumna({ instrumento, criterios, alumnos, trimestre, unidadId, area, onGuardado, onCerrar }: Props) {
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cfg = getInstrConfig(instrumento.tipo)

  const r = useMemo(() => interpretarPegado(texto, alumnos.map(a => ({ id: a.id!, nombre: a.nombre, apellidos: a.apellidos }))), [texto, alumnos])
  const listas = r.filas.filter(f => f.alumno && f.valor != null)
  const dudosas = r.filas.filter(f => !f.alumno && (f.valor != null || f.nombre))

  const guardar = async () => {
    if (!listas.length) return
    setGuardando(true); setError(null)
    try {
      const items = listas.flatMap(f => criterios.map(c => ({
        alumno_id: f.alumno!.id, instrumento_id: instrumento.instrumento_id, criterio_id: c.id,
        ...area, trimestre, valor: f.valor!, observacion: null, unidad_id: unidadId,
      })))
      // Sin vínculos: el reparto a los criterios del instrumento ya está hecho aquí.
      await saveCalificaciones(items, { sinVinculos: true })
      onGuardado(listas.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar las notas')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !guardando) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Pegar notas en ${instrumento.nombre}`}
        style={{ width: 'min(760px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)', borderTop: `4px solid ${instrumento.color}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--azul-900)' }}>
              📋 Pegar una columna de notas en <span aria-hidden="true">{cfg.icon}</span> {instrumento.nombre}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)', lineHeight: 1.5 }}>
              Copia la columna de tu hoja de cálculo —solo las notas, o con el nombre al lado— y pégala aquí. Cada nota se anota en {criterios.length} criterio{criterios.length !== 1 ? 's' : ''}: {criterios.map(c => c.id).join(', ')}.
            </div>
          </div>
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar" disabled={guardando}>✕</button>
        </div>

        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(260px, 1.4fr)', gap: 16 }}>
          <div>
            <textarea data-pegar-texto value={texto} onChange={e => setTexto(e.target.value)} autoFocus
              placeholder={'7,5\n8\n5\n…\n\no bien\n\nAbad Ríos, Ana\t7,5\nBello Souto, Bruno\t8'}
              style={{ width: '100%', minHeight: 260, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.5, padding: 10 }} />
            <div style={{ fontSize: 11.5, color: 'var(--gris-600)', marginTop: 6, lineHeight: 1.5 }}>
              {r.filas.length === 0
                ? 'Sin nombres, las notas van por el orden de la lista (por apellidos, como la matriz).'
                : r.porNombre
                  ? 'Hay nombres: cada nota va a su alumno, en el orden que sea. Lo que no casa se señala y no se asigna.'
                  : 'Sin nombres: las notas van por el orden de la lista. Comprueba la vista previa.'}
              {r.escala100 && <div style={{ color: '#92400e', marginTop: 4 }}><strong>Hay valores por encima de 10:</strong> se toman como escala 0-100 y se dividen entre 10.</div>}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              Vista previa · {listas.length} nota{listas.length !== 1 ? 's' : ''} lista{listas.length !== 1 ? 's' : ''}{dudosas.length ? ` · ${dudosas.length} sin asignar` : ''}
            </div>
            {r.filas.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--gris-500)', padding: 12, border: '1px dashed var(--gris-300)', borderRadius: 8 }}>
                Aquí verás a quién va cada nota antes de guardar nada.
              </div>
            ) : (
              <div data-pegar-previa style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 300, overflowY: 'auto' }}>
                {r.filas.map((f, i) => {
                  const c = calificativo(f.valor)
                  const bien = f.alumno && f.valor != null
                  return (
                    <div key={i} data-pegar-fila data-ok={bien || undefined} style={{
                      display: 'grid', gridTemplateColumns: '1fr 44px', gap: 8, alignItems: 'center', fontSize: 12.5,
                      padding: '4px 8px', borderRadius: 6, background: bien ? 'var(--verde-100)' : f.aviso ? '#fffbeb' : 'white',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--gris-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.alumno ? `${f.alumno.apellidos}, ${f.alumno.nombre}` : <span style={{ color: '#92400e' }}>{f.nombre ?? f.texto}</span>}
                        </div>
                        {f.aviso && <div style={{ fontSize: 11, color: '#92400e' }}>{f.aviso}</div>}
                      </div>
                      <span style={{ textAlign: 'center', fontWeight: 800, borderRadius: 6, padding: '3px 0', color: f.valor == null ? 'var(--gris-500)' : 'white', background: f.valor == null ? 'var(--gris-100)' : c.color }}>
                        {f.valor ?? '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            {r.filas.length > 0 && r.sinNota.length > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--gris-600)', marginTop: 8 }}>
                Sin nota: {r.sinNota.map(a => a.apellidos).join(', ')}. Se quedan como están.
              </div>
            )}
          </div>
        </div>

        {error && <div style={{ color: 'var(--rojo-500)', fontSize: 12.5, padding: '0 18px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 18px 18px' }}>
          <button data-pegar-guardar className="btn-primary" onClick={guardar} disabled={guardando || listas.length === 0} style={{ fontSize: 13 }}>
            {guardando ? 'Guardando…' : `Guardar ${listas.length} nota${listas.length !== 1 ? 's' : ''}`}
          </button>
          <button className="btn-secondary" onClick={onCerrar} disabled={guardando} style={{ fontSize: 13 }}>Cancelar</button>
          <span style={{ fontSize: 11.5, color: 'var(--gris-600)' }}>Las casillas que ya tengan nota se sobrescriben con la pegada.</span>
        </div>
      </div>
    </div>
  )
}
