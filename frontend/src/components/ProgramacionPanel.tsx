import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getUnidades, crearUnidad as dbCrearUnidad, eliminarUnidad as dbEliminarUnidad,
  actualizarUnidad, vincularCriterio, desvincularCriterio, generarPlantillaUnidades,
} from '@/db/queries'
import { useAppStore } from '@/store/useAppStore'

const TIPOS_UNIDAD = [
  { value: 'unidad',    label: 'Unidad Didáctica', short: 'UD'   },
  { value: 'situacion', label: 'Situación de Aprendizaje', short: 'SA' },
  { value: 'proyecto',  label: 'Proyecto', short: 'Proy.' },
  { value: 'secuencia', label: 'Secuencia Didáctica', short: 'Sec.' },
  { value: 'bloque',    label: 'Bloque', short: 'Bl.'  },
]

const TRIM_CFG = [
  { n: 1, label: '1er trimestre', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
  { n: 2, label: '2º trimestre',  color: '#166534', bg: '#dcfce7', border: '#86efac' },
  { n: 3, label: '3er trimestre', color: '#c2410c', bg: '#ffedd5', border: '#fed7aa' },
]

function tipoShort(tipo: string) {
  return TIPOS_UNIDAD.find(t => t.value === tipo)?.short ?? tipo
}

interface Criterio { criterio_id: string; peso: number; descripcion: string | null }
interface Unidad {
  id: number; nombre: string; tipo: string; descripcion?: string
  trimestre: number | null; orden: number; activa: number
  criterios: Criterio[]
}
interface CurrCriterio { id: string; descripcion: string; peso: number }

interface Props {
  asignaturaId: number
  asignaturaNombre: string
  grupoEtapa: string
  grupoCurso: string
  grupoComunidad: string
  grupoId: number
}

export default function ProgramacionPanel({
  asignaturaId, asignaturaNombre, grupoEtapa, grupoCurso, grupoComunidad, grupoId,
}: Props) {
  const navigate = useNavigate()
  const headers = useAppStore(s => s._headers)

  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [criteriosCurr, setCriteriosCurr] = useState<CurrCriterio[]>([])
  const [guardando, setGuardando] = useState(false)

  // modal formularios de plantilla/nueva
  const [formPlantilla, setFormPlantilla] = useState(false)
  const [plantillaCfg, setPlantillaCfg] = useState({ n: 9, tipo: 'situacion' })
  const [plantillaMsg, setPlantillaMsg] = useState('')
  const [formNueva, setFormNueva] = useState<number | null>(null) // trimestre donde añadir
  const [nuevaData, setNuevaData] = useState({ nombre: '', tipo: 'situacion' })

  // edición inline
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ nombre: '', tipo: '', trimestre: '', descripcion: '' })
  const [editCriterios, setEditCriterios] = useState(false)

  const cargar = async () => {
    const crits = await fetch(
      `/api/curriculum/criterios?asignatura=${encodeURIComponent(asignaturaNombre)}&curso=${grupoCurso}&etapa=${grupoEtapa}&comunidad=${encodeURIComponent(grupoComunidad)}`,
      { headers: headers() }
    ).then(r => r.json()).catch(() => [])

    const currArr: CurrCriterio[] = Array.isArray(crits) ? crits : []
    setCriteriosCurr(currArr)
    const unis = await getUnidades(asignaturaId, currArr)
    setUnidades(unis as unknown as Unidad[])
  }

  useEffect(() => { cargar() }, [asignaturaId])

  // ── CRUD ────────────────────────────────────────────────────────────────

  const handleCrearUnidad = async (trimestre: number) => {
    if (!nuevaData.nombre.trim()) return
    setGuardando(true)
    await dbCrearUnidad({
      asignatura_id: asignaturaId,
      nombre: nuevaData.nombre.trim(),
      tipo: nuevaData.tipo,
      trimestre,
      orden: 0,
      activa: 1,
    })
    setFormNueva(null)
    setNuevaData({ nombre: '', tipo: 'situacion' })
    setGuardando(false)
    cargar()
  }

  const handleEliminar = async (id: number) => {
    if (!confirm('¿Eliminar esta unidad y sus criterios vinculados?')) return
    await dbEliminarUnidad(id)
    if (editId === id) setEditId(null)
    cargar()
  }

  const startEdit = (u: Unidad) => {
    setEditId(u.id)
    setEditForm({
      nombre: u.nombre,
      tipo: u.tipo,
      trimestre: u.trimestre ? String(u.trimestre) : '',
      descripcion: u.descripcion || '',
    })
    setEditCriterios(false)
    setFormNueva(null)
  }

  const guardarEdit = async () => {
    if (!editId || !editForm.nombre.trim()) return
    setGuardando(true)
    await actualizarUnidad(editId, {
      nombre: editForm.nombre.trim(),
      tipo: editForm.tipo,
      trimestre: editForm.trimestre ? Number(editForm.trimestre) : null,
      descripcion: editForm.descripcion || undefined,
    })
    setEditId(null)
    setGuardando(false)
    cargar()
  }

  const toggleCriterio = async (unidadId: number, criterioId: string, activo: boolean) => {
    if (activo) await desvincularCriterio(unidadId, criterioId)
    else await vincularCriterio(unidadId, criterioId)
    cargar()
  }

  const handleGenerarPlantilla = async () => {
    if (criteriosCurr.length === 0) {
      setPlantillaMsg('❌ No hay criterios curriculares para esta asignatura en ' + grupoComunidad)
      return
    }
    setGuardando(true); setPlantillaMsg('')
    try {
      const resultado = await generarPlantillaUnidades(asignaturaId, plantillaCfg.n, plantillaCfg.tipo, criteriosCurr)
      setPlantillaMsg(`✅ ${resultado.length} unidades generadas`)
      setFormPlantilla(false)
    } catch (e: any) { setPlantillaMsg(`❌ ${e.message}`) }
    setGuardando(false)
    cargar()
  }

  // ── AGRUPACIÓN ──────────────────────────────────────────────────────────

  const porTrimestre: Record<number, Unidad[]> = { 1: [], 2: [], 3: [] }
  const sinTrimestre: Unidad[] = []
  for (const u of unidades) {
    if (u.trimestre && porTrimestre[u.trimestre]) porTrimestre[u.trimestre].push(u)
    else sinTrimestre.push(u)
  }

  const criteriosAsignados = new Set(unidades.flatMap(u => u.criterios.map(c => c.criterio_id)))
  const critSinAsignar = criteriosCurr.filter(c => !criteriosAsignados.has(c.id))

  // ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 8 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>
          <span style={{ fontWeight: 600, color: 'var(--azul-700)' }}>Programación didáctica</span>
          {' · '}{unidades.length} unidades · {criteriosCurr.length} criterios
          {critSinAsignar.length > 0 && (
            <span style={{ color: '#b45309', marginLeft: 6 }}>({critSinAsignar.length} sin asignar)</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {unidades.length === 0 && (
            <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => { setFormPlantilla(true); setPlantillaMsg('') }}>
              ✨ Generar estructura
            </button>
          )}
          {unidades.length > 0 && (
            <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => setFormPlantilla(true)}>
              ↺ Regenerar
            </button>
          )}
        </div>
      </div>

      {/* Mensaje plantilla */}
      {plantillaMsg && (
        <div style={{
          marginBottom: 12, padding: '8px 14px', borderRadius: 6, fontSize: 13,
          background: plantillaMsg.startsWith('✅') ? '#dcfce7' : '#fee2e2',
          color: plantillaMsg.startsWith('✅') ? '#166534' : '#991b1b',
        }}>
          {plantillaMsg}
        </div>
      )}

      {/* Form plantilla */}
      {formPlantilla && (
        <div style={{ background: 'linear-gradient(135deg,#dbeafe,#f0fdf4)', border: '1px solid #93c5fd', borderRadius: 10, padding: 18, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--azul-700)', marginBottom: 12 }}>✨ Generar estructura automática</div>
          <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 12 }}>
            Distribuye los <strong>{criteriosCurr.length} criterios</strong> curriculares entre las unidades de forma equilibrada por trimestres.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Denominación</label>
              <select value={plantillaCfg.tipo} onChange={e => setPlantillaCfg(c => ({ ...c, tipo: e.target.value }))} style={{ width: '100%' }}>
                {TIPOS_UNIDAD.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Número de unidades</label>
              <select value={plantillaCfg.n} onChange={e => setPlantillaCfg(c => ({ ...c, n: Number(e.target.value) }))} style={{ width: '100%' }}>
                {[3, 6, 9, 12].map(n => <option key={n} value={n}>{n} ({n/3} por trimestre)</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleGenerarPlantilla} disabled={guardando || criteriosCurr.length === 0}>
              {guardando ? 'Generando…' : '✨ Generar'}
            </button>
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setFormPlantilla(false)}>Cancelar</button>
          </div>
          {criteriosCurr.length === 0 && (
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>⚠ No se encontraron criterios. Verifica el nombre de la asignatura para {grupoComunidad}.</div>
          )}
        </div>
      )}

      {/* Estado vacío */}
      {unidades.length === 0 && !formPlantilla && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gris-600)', fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <strong>Generar estructura</strong> distribuye los criterios automáticamente.<br />
          O añade unidades manualmente con el botón de cada trimestre.
        </div>
      )}

      {/* Vista por trimestres */}
      {TRIM_CFG.map(trim => {
        const lista = porTrimestre[trim.n]
        const isAddingHere = formNueva === trim.n
        if (lista.length === 0 && !isAddingHere) return null

        return (
          <div key={trim.n} style={{ marginBottom: 16 }}>
            {/* Cabecera trimestre */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ height: 2, flex: 1, background: trim.border }} />
              <span style={{
                fontSize: 11, fontWeight: 700, color: trim.color,
                padding: '2px 10px', border: `1px solid ${trim.border}`,
                background: trim.bg, borderRadius: 10, whiteSpace: 'nowrap',
              }}>
                {trim.label} · {lista.length} unidad{lista.length !== 1 ? 'es' : ''}
              </span>
              <div style={{ height: 2, flex: 1, background: trim.border }} />
              <button onClick={() => { setFormNueva(trim.n); setNuevaData({ nombre: '', tipo: 'situacion' }); setEditId(null) }}
                style={{
                  fontSize: 11, padding: '2px 9px', borderRadius: 10, cursor: 'pointer',
                  background: trim.bg, color: trim.color, border: `1px solid ${trim.border}`, fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                + Añadir
              </button>
            </div>

            {/* Forma nueva unidad en este trimestre */}
            {isAddingHere && (
              <div style={{ background: trim.bg, border: `1px solid ${trim.border}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
                  <input value={nuevaData.nombre} autoFocus
                    onChange={e => setNuevaData(d => ({ ...d, nombre: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleCrearUnidad(trim.n); if (e.key === 'Escape') setFormNueva(null) }}
                    placeholder="Nombre de la unidad *"
                    style={{ fontSize: 13 }}
                  />
                  <select value={nuevaData.tipo} onChange={e => setNuevaData(d => ({ ...d, tipo: e.target.value }))} style={{ fontSize: 12 }}>
                    {TIPOS_UNIDAD.map(t => <option key={t.value} value={t.value}>{t.short} · {t.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => handleCrearUnidad(trim.n)} disabled={guardando || !nuevaData.nombre.trim()}>
                    {guardando ? 'Guardando…' : 'Crear'}
                  </button>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setFormNueva(null)}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Unidades de este trimestre */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {lista.map(u => {
                const isEditing = editId === u.id
                return (
                  <div key={u.id} style={{
                    border: `1px solid ${isEditing ? trim.color + '60' : trim.border}`,
                    borderRadius: 8, overflow: 'hidden',
                    background: isEditing ? trim.bg : 'white',
                  }}>
                    {isEditing ? (
                      /* ── MODO EDICIÓN ── */
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, marginBottom: 8 }}>
                          <input value={editForm.nombre} autoFocus
                            onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                            style={{ fontSize: 13, fontWeight: 600 }}
                            placeholder="Nombre *"
                          />
                          <select value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))} style={{ fontSize: 12 }}>
                            {TIPOS_UNIDAD.map(t => <option key={t.value} value={t.value}>{t.short} · {t.label}</option>)}
                          </select>
                          <select value={editForm.trimestre} onChange={e => setEditForm(f => ({ ...f, trimestre: e.target.value }))} style={{ fontSize: 12 }}>
                            <option value="">Sin trim.</option>
                            <option value="1">1T</option>
                            <option value="2">2T</option>
                            <option value="3">3T</option>
                          </select>
                        </div>
                        <textarea value={editForm.descripcion}
                          onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                          rows={2} placeholder="Descripción o contexto de la SA/UD (opcional)"
                          style={{ width: '100%', fontSize: 12, resize: 'vertical', marginBottom: 8 }}
                        />

                        {/* Criterios en modo edición */}
                        <div style={{ marginBottom: 8 }}>
                          <button onClick={() => setEditCriterios(!editCriterios)}
                            style={{
                              fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                              color: trim.color, fontWeight: 600, padding: 0,
                            }}>
                            {editCriterios ? '▼' : '▶'} Criterios vinculados ({u.criterios.length}/{criteriosCurr.length})
                          </button>
                          {editCriterios && (
                            <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', padding: '6px 0' }}>
                              {criteriosCurr.map(cr => {
                                const activo = u.criterios.some(c => c.criterio_id === cr.id)
                                return (
                                  <label key={cr.id} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                                    padding: '4px 6px', borderRadius: 5,
                                    background: activo ? '#eff6ff' : 'transparent',
                                  }}>
                                    <input type="checkbox" checked={activo}
                                      onChange={() => toggleCriterio(u.id, cr.id, activo)}
                                      style={{ marginTop: 2, accentColor: trim.color, flexShrink: 0 }}
                                    />
                                    <div>
                                      <span style={{ fontWeight: 700, fontSize: 11, color: trim.color, marginRight: 5 }}>{cr.id}</span>
                                      <span style={{ fontSize: 11, color: 'var(--gris-600)' }}>{cr.descripcion}</span>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button className="btn-primary" style={{ fontSize: 12, padding: '4px 14px' }} onClick={guardarEdit} disabled={guardando || !editForm.nombre.trim()}>
                            {guardando ? '…' : '✓ Guardar'}
                          </button>
                          <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditId(null)}>Cancelar</button>
                          <div style={{ flex: 1 }} />
                          <button onClick={() => handleEliminar(u.id)}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── MODO VISTA ── */
                      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: trim.color, color: 'white', flexShrink: 0,
                        }}>
                          {tipoShort(u.tipo)}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.nombre}
                        </span>
                        {/* Chips de criterios asignados */}
                        {u.criterios.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: 220 }}>
                            {u.criterios.map(c => (
                              <span key={c.criterio_id} style={{
                                fontSize: 10, padding: '1px 5px', background: trim.color,
                                color: 'white', borderRadius: 3, fontWeight: 600,
                              }}>
                                {c.criterio_id}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#b45309' }}>sin criterios</span>
                        )}
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={() => navigate(`/evaluacion?grupo_id=${grupoId}&asignatura_id=${asignaturaId}&unidad_id=${u.id}`)}
                            style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                              background: 'var(--azul-700)', color: 'white', border: 'none', fontWeight: 600,
                            }}>
                            Evaluar
                          </button>
                          <button onClick={() => startEdit(u)}
                            title="Editar"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--gris-500)', padding: '0 2px', lineHeight: 1 }}>
                            ✏
                          </button>
                          <button onClick={() => handleEliminar(u.id)}
                            title="Eliminar"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--rojo-500)', padding: '0 2px', lineHeight: 1 }}>
                            ×
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Unidades sin trimestre asignado */}
      {sinTrimestre.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gris-600)', marginBottom: 6 }}>Sin trimestre asignado</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sinTrimestre.map(u => (
              <div key={u.id} style={{ border: '1px solid var(--gris-300)', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '7px 12px', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--gris-500)', color: 'white', flexShrink: 0 }}>
                  {tipoShort(u.tipo)}
                </span>
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{u.nombre}</span>
                <button onClick={() => startEdit(u)}
                  title="Editar (asigna un trimestre)"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--gris-500)', padding: '0 2px' }}>
                  ✏
                </button>
                <button onClick={() => handleEliminar(u.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--rojo-500)', padding: 0 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aviso criterios sin asignar */}
      {critSinAsignar.length > 0 && unidades.length > 0 && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
          <strong>{critSinAsignar.length} criterio{critSinAsignar.length !== 1 ? 's' : ''} sin asignar:</strong>{' '}
          {critSinAsignar.map(c => c.id).join(' · ')}
        </div>
      )}
    </div>
  )
}
