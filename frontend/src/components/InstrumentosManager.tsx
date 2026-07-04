/**
 * Gestor completo de instrumentos de evaluación de una asignatura.
 * Accesible desde el Calificador y la evaluación rápida (no hace falta
 * ir a la ficha del grupo). Cada cambio se guarda al momento en IndexedDB.
 *
 * Configurable por instrumento: nombre, tipo, peso (%), trimestres en los
 * que aplica, orden (▲▼) y rúbrica asociada.
 */
import { useEffect, useState } from 'react'
import {
  getAsignaturaDetalle, crearInstrumento, eliminarInstrumento,
  actualizarInstrumento, moverInstrumento,
} from '@/db/queries'
import type { Instrumento } from '@/db/localDb'
import { TIPOS_INSTRUMENTO, getInstrConfig } from '@/ia/instrumentosConfig'
import RubricaEditor from './RubricaEditor'

interface Props {
  asignaturaId: number
  asignaturaNombre: string
  nivel: string            // p.ej. "5º primaria" (para el editor de rúbricas)
  onClose: () => void      // el llamante recarga sus datos al cerrar
}

function parseTrimestres(json: string | undefined): number[] {
  try {
    const t = JSON.parse(json || '[1,2,3]')
    return Array.isArray(t) && t.length ? t : [1, 2, 3]
  } catch { return [1, 2, 3] }
}

export default function InstrumentosManager({ asignaturaId, asignaturaNombre, nivel, onClose }: Props) {
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: string; peso: number } | null>(null)
  const [rubricaDe, setRubricaDe] = useState<Instrumento | null>(null)

  const cargar = async () => {
    const det = await getAsignaturaDetalle(asignaturaId)
    setInstrumentos(det?.instrumentos || [])
  }
  useEffect(() => { cargar() }, [asignaturaId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !rubricaDe) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, rubricaDe])

  // Guardado inmediato campo a campo
  const cambiar = async (id: number, fields: Parameters<typeof actualizarInstrumento>[1]) => {
    await actualizarInstrumento(id, fields)
    await cargar()
  }

  const toggleTrimestre = async (ins: Instrumento, t: number) => {
    const actuales = parseTrimestres(ins.trimestres)
    const nuevos = actuales.includes(t) ? actuales.filter(x => x !== t) : [...actuales, t].sort()
    if (nuevos.length === 0) return // al menos un trimestre
    await cambiar(ins.id!, { trimestres: JSON.stringify(nuevos) })
  }

  const mover = async (ins: Instrumento, dir: -1 | 1) => {
    await moverInstrumento(asignaturaId, ins.id!, dir)
    await cargar()
  }

  const borrar = async (ins: Instrumento) => {
    if (!confirm(`¿Eliminar «${ins.nombre}» y TODAS sus calificaciones? No se puede deshacer.`)) return
    await eliminarInstrumento(ins.id!)
    await cargar()
  }

  const crearNuevo = async () => {
    if (!nuevo?.nombre.trim()) return
    await crearInstrumento(asignaturaId, {
      nombre: nuevo.nombre.trim(), tipo: nuevo.tipo, peso: nuevo.peso,
      trimestres: '[1,2,3]', orden: instrumentos.length,
    })
    setNuevo(null)
    await cargar()
  }

  const total = instrumentos.reduce((s, i) => s + (i.peso || 0), 0)
  const totalOk = total === 100

  return (
    <>
      {rubricaDe && (
        <RubricaEditor
          instrumentoId={rubricaDe.id!}
          instrumentoNombre={rubricaDe.nombre}
          asignaturaNombre={asignaturaNombre}
          nivel={nivel}
          onCerrar={() => setRubricaDe(null)}
        />
      )}

      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="card" role="dialog" aria-modal="true" aria-label="Gestionar instrumentos de evaluación"
          style={{ width: 'min(720px, 94vw)', maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-700)' }}>
              🎯 Instrumentos — {asignaturaNombre}
            </h2>
            <button onClick={onClose} className="modal-close" aria-label="Cerrar">✕</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gris-600)', marginBottom: 14 }}>
            Los cambios se guardan al instante. Peso total:{' '}
            <strong style={{ color: totalOk ? 'var(--verde-500)' : 'var(--ambar-500)' }}>
              {total}%{totalOk ? ' ✓' : total > 100 ? ' (excede 100)' : ` (falta ${100 - total})`}
            </strong>
          </div>

          {instrumentos.length === 0 && !nuevo && (
            <p style={{ color: 'var(--gris-600)', fontSize: 13, marginBottom: 12 }}>
              Sin instrumentos todavía. Crea el primero para poder calificar.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {instrumentos.map((ins, idx) => {
              const cfg = getInstrConfig(ins.tipo)
              const trims = parseTrimestres(ins.trimestres)
              return (
                <div key={ins.id} style={{
                  border: `1px solid ${cfg.color}30`, background: cfg.bg,
                  borderRadius: 10, padding: '10px 12px',
                }}>
                  {/* Fila 1: orden, nombre, tipo, peso, acciones */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      <button onClick={() => mover(ins, -1)} disabled={idx === 0} aria-label="Subir"
                        style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 11, padding: 0, opacity: idx === 0 ? 0.3 : 1, lineHeight: 1.1 }}>▲</button>
                      <button onClick={() => mover(ins, 1)} disabled={idx === instrumentos.length - 1} aria-label="Bajar"
                        style={{ background: 'none', border: 'none', cursor: idx === instrumentos.length - 1 ? 'default' : 'pointer', fontSize: 11, padding: 0, opacity: idx === instrumentos.length - 1 ? 0.3 : 1, lineHeight: 1.1 }}>▼</button>
                    </div>
                    <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                    <input
                      defaultValue={ins.nombre}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== ins.nombre) cambiar(ins.id!, { nombre: v }) }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      style={{ flex: '1 1 140px', fontSize: 13, fontWeight: 600, padding: '5px 8px', minWidth: 120 }}
                    />
                    <select value={ins.tipo} onChange={e => cambiar(ins.id!, { tipo: e.target.value })}
                      style={{ fontSize: 12, padding: '5px 6px' }}>
                      {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <input type="number" min={1} max={100} defaultValue={ins.peso}
                        onBlur={e => { const v = Number(e.target.value); if (v >= 1 && v <= 100 && v !== ins.peso) cambiar(ins.id!, { peso: v }) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        style={{ width: 58, fontSize: 13, fontWeight: 700, textAlign: 'center', padding: '5px 2px' }} />
                      <span style={{ fontSize: 12, color: 'var(--gris-600)' }}>%</span>
                    </div>
                    <button onClick={() => borrar(ins)} title="Eliminar instrumento" aria-label="Eliminar"
                      style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>
                      ×
                    </button>
                  </div>

                  {/* Fila 2: trimestres en los que aplica + rúbrica */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--gris-600)', fontWeight: 600 }}>Aplica en:</span>
                    {[1, 2, 3].map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600, color: trims.includes(t) ? 'var(--azul-700)' : 'var(--gris-500)' }}>
                        <input type="checkbox" checked={trims.includes(t)} onChange={() => toggleTrimestre(ins, t)} />
                        {t}º trim.
                      </label>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setRubricaDe(ins)}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                        background: ins.tipo === 'rubrica' ? '#166534' : 'white',
                        color: ins.tipo === 'rubrica' ? 'white' : 'var(--gris-600)',
                        border: ins.tipo === 'rubrica' ? 'none' : '1px solid var(--gris-300)',
                      }}>
                      📊 Rúbrica
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Crear nuevo */}
          {nuevo ? (
            <div style={{ background: 'var(--gris-100)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <input value={nuevo.nombre} autoFocus placeholder="Nombre del instrumento *"
                  onChange={e => setNuevo(n => n && ({ ...n, nombre: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') crearNuevo() }}
                  style={{ flex: '1 1 160px', fontSize: 13 }} />
                <select value={nuevo.tipo} onChange={e => setNuevo(n => n && ({ ...n, tipo: e.target.value }))}
                  style={{ fontSize: 12 }}>
                  {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <input type="number" min={1} max={100} value={nuevo.peso}
                    onChange={e => setNuevo(n => n && ({ ...n, peso: Number(e.target.value) }))}
                    style={{ width: 58, fontSize: 13, textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: 'var(--gris-600)' }}>%</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={crearNuevo} disabled={!nuevo.nombre.trim()}>
                  Crear
                </button>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setNuevo(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary" style={{ fontSize: 13 }}
              onClick={() => setNuevo({ nombre: '', tipo: 'prueba-escrita', peso: Math.max(1, 100 - total) })}>
              + Nuevo instrumento
            </button>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-primary" onClick={onClose}>Hecho</button>
          </div>
        </div>
      </div>
    </>
  )
}
