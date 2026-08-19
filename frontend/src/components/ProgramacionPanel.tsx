import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getUnidades, crearUnidad as dbCrearUnidad, eliminarUnidad as dbEliminarUnidad,
  actualizarUnidad, vincularCriterio, desvincularCriterio, generarPlantillaUnidades,
  fijarInstrumentosDeCriterio, asignarInstrumentoAUnidad, borrarProgramacion,
  type UnidadConCriterios,
} from '@/db/queries'
import { useAppStore } from '@/store/useAppStore'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import { api } from '@/api'

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

interface InstrumentoLite { id: number; nombre: string; tipo: string; peso: number }
interface CurrCriterio { id: string; descripcion: string; peso: number }

interface Props {
  asignaturaId: number
  asignaturaNombre: string
  grupoEtapa: string
  grupoCurso: string
  grupoComunidad: string
  grupoId: number
  instrumentos: InstrumentoLite[]
  onIrAInstrumentos?: () => void
  onCambio?: () => void
}

export default function ProgramacionPanel({
  asignaturaId, asignaturaNombre, grupoEtapa, grupoCurso, grupoComunidad, grupoId,
  instrumentos, onIrAInstrumentos, onCambio,
}: Props) {
  const navigate = useNavigate()
  const headers = useAppStore(s => s._headers)

  const [unidades, setUnidades] = useState<UnidadConCriterios[]>([])
  const [criteriosCurr, setCriteriosCurr] = useState<CurrCriterio[]>([])
  const [guardando, setGuardando] = useState(false)

  const [formPlantilla, setFormPlantilla] = useState(false)
  const [plantillaCfg, setPlantillaCfg] = useState({ n: 9, tipo: 'situacion' })
  const [mensaje, setMensaje] = useState('')
  const [formNueva, setFormNueva] = useState<number | null>(null)
  const [nuevaData, setNuevaData] = useState({ nombre: '', tipo: 'situacion' })

  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ nombre: '', tipo: '', trimestre: '', descripcion: '' })
  const [criteriosAbiertos, setCriteriosAbiertos] = useState<number | null>(null)

  const cargar = async () => {
    const crits = await fetch(
      api(`/api/curriculum/criterios?asignatura=${encodeURIComponent(asignaturaNombre)}&curso=${grupoCurso}&etapa=${grupoEtapa}&comunidad=${encodeURIComponent(grupoComunidad)}`),
      { headers: headers() }
    ).then(r => r.json()).catch(() => [])

    const currArr: CurrCriterio[] = Array.isArray(crits) ? crits : []
    setCriteriosCurr(currArr)
    setUnidades(await getUnidades(asignaturaId, currArr))
    onCambio?.()
  }

  useEffect(() => { cargar() }, [asignaturaId])

  // ── CRUD de unidades ────────────────────────────────────────────────────

  const handleCrearUnidad = async (trimestre: number) => {
    if (!nuevaData.nombre.trim()) return
    setGuardando(true)
    await dbCrearUnidad({
      asignatura_id: asignaturaId, nombre: nuevaData.nombre.trim(),
      tipo: nuevaData.tipo, trimestre, orden: 0, activa: 1,
    })
    setFormNueva(null)
    setNuevaData({ nombre: '', tipo: 'situacion' })
    setGuardando(false)
    cargar()
  }

  const handleEliminar = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar «${nombre}»?\n\nSe desvincularán sus criterios e instrumentos. Las calificaciones ya registradas NO se borran.`)) return
    await dbEliminarUnidad(id)
    if (editId === id) setEditId(null)
    if (criteriosAbiertos === id) setCriteriosAbiertos(null)
    cargar()
  }

  const startEdit = (u: UnidadConCriterios) => {
    setEditId(u.id!)
    setEditForm({
      nombre: u.nombre, tipo: u.tipo,
      trimestre: u.trimestre ? String(u.trimestre) : '',
      descripcion: u.descripcion || '',
    })
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

  // ── Instrumento por criterio ────────────────────────────────────────────

  const cambiarInstrumentos = async (unidadId: number, criterioId: string, ids: number[]) => {
    await fijarInstrumentosDeCriterio(unidadId, criterioId, ids)
    cargar()
  }

  const aplicarATodos = async (unidadId: number, instrumentoId: number) => {
    const n = await asignarInstrumentoAUnidad(unidadId, instrumentoId)
    setMensaje(`✅ Instrumento asignado a los ${n} criterios de la unidad`)
    setTimeout(() => setMensaje(''), 3500)
    cargar()
  }

  const handleGenerarPlantilla = async () => {
    if (criteriosCurr.length === 0) {
      setMensaje(`❌ No hay criterios curriculares para esta área en ${grupoComunidad}`)
      return
    }
    setGuardando(true); setMensaje('')
    try {
      const r = await generarPlantillaUnidades(asignaturaId, plantillaCfg.n, plantillaCfg.tipo, criteriosCurr)
      const partes = []
      if (r.creadas) partes.push(`${r.creadas} unidades nuevas`)
      if (r.conservadas) partes.push(`${r.conservadas} conservadas`)
      if (r.criteriosRepartidos) partes.push(`${r.criteriosRepartidos} criterios repartidos`)
      setMensaje(`✅ ${partes.join(' · ') || 'Nada que añadir: la programación ya estaba completa'}`)
      setFormPlantilla(false)
    } catch (e: any) { setMensaje(`❌ ${e.message}`) }
    setGuardando(false)
    cargar()
  }

  const handleBorrarTodo = async () => {
    if (!confirm('¿Borrar TODA la programación de esta área?\n\nSe eliminarán las unidades, sus criterios y las asignaciones de instrumento.\nLas calificaciones ya registradas NO se borran.')) return
    await borrarProgramacion(asignaturaId)
    setMensaje('Programación borrada. Las calificaciones siguen intactas.')
    cargar()
  }

  // ── Agrupación por trimestre ────────────────────────────────────────────

  const porTrimestre: Record<number, UnidadConCriterios[]> = { 1: [], 2: [], 3: [] }
  const sinTrimestre: UnidadConCriterios[] = []
  for (const u of unidades) {
    if (u.trimestre && porTrimestre[u.trimestre]) porTrimestre[u.trimestre].push(u)
    else sinTrimestre.push(u)
  }

  const criteriosAsignados = new Set(unidades.flatMap(u => u.criterios.map(c => c.criterio_id)))
  const critSinAsignar = criteriosCurr.filter(c => !criteriosAsignados.has(c.id))
  const totalCriterios = unidades.reduce((s, u) => s + u.criterios.length, 0)
  const sinInstrumento = unidades.reduce(
    (s, u) => s + u.criterios.filter(c => c.instrumentos.length === 0).length, 0)

  const sinInstrumentosCreados = instrumentos.length === 0

  // ── Render de una unidad ────────────────────────────────────────────────

  const renderUnidad = (u: UnidadConCriterios, trim: typeof TRIM_CFG[number] | null) => {
    const color = trim?.color ?? 'var(--gris-500)'
    const bg = trim?.bg ?? 'var(--gris-100)'
    const border = trim?.border ?? 'var(--gris-300)'
    const isEditing = editId === u.id
    const abierta = criteriosAbiertos === u.id
    const faltan = u.criterios.filter(c => c.instrumentos.length === 0).length

    return (
      <div key={u.id} style={{
        border: `1px solid ${isEditing ? color + '60' : border}`,
        borderRadius: 8, overflow: 'hidden', background: isEditing ? bg : 'white',
      }}>
        {isEditing ? (
          <div style={{ padding: '10px 12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, marginBottom: 8 }}>
              <input value={editForm.nombre} autoFocus
                onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                style={{ fontSize: 13, fontWeight: 600 }} placeholder="Nombre *" />
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
              style={{ width: '100%', fontSize: 12, resize: 'vertical', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn-primary" style={{ fontSize: 12, padding: '4px 14px' }} onClick={guardarEdit} disabled={guardando || !editForm.nombre.trim()}>
                {guardando ? '…' : '✓ Guardar'}
              </button>
              <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditId(null)}>Cancelar</button>
              <div style={{ flex: 1 }} />
              <button onClick={() => handleEliminar(u.id!, u.nombre)}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                Eliminar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: color, color: 'white', flexShrink: 0 }}>
                {tipoShort(u.tipo)}
              </span>
              <span style={{ fontWeight: 600, fontSize: 13, flex: '1 1 140px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.nombre}
              </span>

              <button onClick={() => setCriteriosAbiertos(abierta ? null : u.id!)}
                style={{
                  fontSize: 11.5, padding: '3px 10px', borderRadius: 12, cursor: 'pointer', fontWeight: 600,
                  background: abierta ? color : 'white', color: abierta ? 'white' : color,
                  border: `1px solid ${border}`, whiteSpace: 'nowrap',
                }}>
                {abierta ? '▼' : '▶'} {u.criterios.length} criterio{u.criterios.length !== 1 ? 's' : ''}
                {faltan > 0 && <span style={{ marginLeft: 5, color: abierta ? '#fed7aa' : '#b45309' }}>· {faltan} sin instrumento</span>}
              </button>

              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => navigate(`/evaluacion?grupo_id=${grupoId}&asignatura_id=${asignaturaId}&unidad_id=${u.id}`)}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', background: 'var(--azul-700)', color: 'white', border: 'none', fontWeight: 600 }}>
                  Evaluar
                </button>
                <button onClick={() => startEdit(u)} title="Editar"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--gris-500)', padding: '0 2px', lineHeight: 1 }}>✏</button>
                <button onClick={() => handleEliminar(u.id!, u.nombre)} title="Eliminar"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--rojo-500)', padding: '0 2px', lineHeight: 1 }}>×</button>
              </div>
            </div>

            {/* ── Criterios de la unidad con su instrumento ────────────── */}
            {abierta && (
              <div style={{ borderTop: `1px solid ${border}`, background: '#fbfcfe', padding: '10px 12px' }}>
                {sinInstrumentosCreados ? (
                  <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '10px 12px' }}>
                    Esta área todavía no tiene instrumentos de evaluación.{' '}
                    <button onClick={onIrAInstrumentos}
                      style={{ background: 'none', border: 'none', color: 'var(--azul-500)', fontWeight: 700, cursor: 'pointer', fontSize: 12.5, padding: 0, textDecoration: 'underline' }}>
                      Crea el primero →
                    </button>{' '}
                    Después podrás decir con cuál se evalúa cada criterio.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--gris-600)', fontWeight: 600 }}>
                        Aplicar un instrumento a todos los criterios:
                      </span>
                      <select defaultValue="" style={{ fontSize: 12, padding: '4px 8px' }}
                        onChange={e => {
                          const v = Number(e.target.value)
                          e.target.value = ''
                          if (v) aplicarATodos(u.id!, v)
                        }}>
                        <option value="">— Elegir —</option>
                        {instrumentos.map(i => (
                          <option key={i.id} value={i.id}>{getInstrConfig(i.tipo).icon} {i.nombre}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {criteriosCurr.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>
                          No se han podido cargar los criterios del currículo. Comprueba la conexión con el servidor.
                        </div>
                      )}
                      {criteriosCurr.map(cr => {
                        const enUnidad = u.criterios.find(c => c.criterio_id === cr.id)
                        const asignados = enUnidad?.instrumentos.map(i => i.instrumento_id) ?? []
                        return (
                          <div key={cr.id} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px',
                            borderRadius: 6, background: enUnidad ? 'white' : 'transparent',
                            border: `1px solid ${enUnidad ? (asignados.length ? '#e5e7eb' : '#fed7aa') : 'transparent'}`,
                            opacity: enUnidad ? 1 : .6,
                          }}>
                            <input type="checkbox" checked={!!enUnidad}
                              onChange={() => toggleCriterio(u.id!, cr.id, !!enUnidad)}
                              title={enUnidad ? 'Quitar este criterio de la unidad' : 'Incluir este criterio en la unidad'}
                              style={{ marginTop: 3, accentColor: color, flexShrink: 0, width: 15, height: 15 }} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div>
                                <span style={{ fontWeight: 700, fontSize: 11.5, color, marginRight: 6 }}>{cr.id}</span>
                                <span style={{ fontSize: 11.5, color: 'var(--gris-600)', lineHeight: 1.45 }}>{cr.descripcion}</span>
                              </div>

                              {enUnidad && (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5, alignItems: 'center' }}>
                                  {instrumentos.map(ins => {
                                    const cfg = getInstrConfig(ins.tipo)
                                    const puesto = asignados.includes(ins.id)
                                    return (
                                      <button key={ins.id}
                                        onClick={() => cambiarInstrumentos(
                                          u.id!, cr.id,
                                          puesto ? asignados.filter(x => x !== ins.id) : [...asignados, ins.id]
                                        )}
                                        title={puesto ? `Quitar «${ins.nombre}» de este criterio` : `Evaluar este criterio con «${ins.nombre}»`}
                                        style={{
                                          fontSize: 10.5, padding: '3px 8px', borderRadius: 11, cursor: 'pointer',
                                          fontWeight: 600, whiteSpace: 'nowrap',
                                          background: puesto ? cfg.color : 'white',
                                          color: puesto ? 'white' : 'var(--gris-500)',
                                          border: `1px solid ${puesto ? cfg.color : 'var(--gris-300)'}`,
                                        }}>
                                        {cfg.icon} {ins.nombre}
                                      </button>
                                    )
                                  })}
                                  {asignados.length === 0 && (
                                    <span style={{ fontSize: 10.5, color: '#b45309', fontWeight: 600, marginLeft: 2 }}>
                                      ← elige con qué se evalúa
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 8 }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>
          <span style={{ fontWeight: 600, color: 'var(--azul-700)' }}>Programación didáctica</span>
          {' · '}{unidades.length} unidades · {totalCriterios}/{criteriosCurr.length} criterios
          {critSinAsignar.length > 0 && (
            <span style={{ color: '#b45309', marginLeft: 6 }}>({critSinAsignar.length} sin unidad)</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className={unidades.length === 0 ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => { setFormPlantilla(true); setMensaje('') }}>
            {unidades.length === 0 ? '✨ Generar estructura' : '✨ Completar estructura'}
          </button>
          {unidades.length > 0 && (
            <button style={{ fontSize: 12, padding: '5px 12px', background: 'none', border: '1px solid var(--gris-300)', color: 'var(--gris-500)', borderRadius: 6, cursor: 'pointer' }}
              onClick={handleBorrarTodo}>
              Borrar programación
            </button>
          )}
        </div>
      </div>

      {/* Aviso global de criterios sin instrumento */}
      {totalCriterios > 0 && sinInstrumento > 0 && (
        <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 7, fontSize: 12.5, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <strong>{sinInstrumento} criterio{sinInstrumento !== 1 ? 's' : ''} sin instrumento asignado.</strong>{' '}
          En el calificador aparecerán rayados: podrás verlos, pero no evaluarlos hasta decir con qué se evalúan.
        </div>
      )}

      {mensaje && (
        <div style={{
          marginBottom: 12, padding: '8px 14px', borderRadius: 6, fontSize: 13,
          background: mensaje.startsWith('❌') ? '#fee2e2' : '#dcfce7',
          color: mensaje.startsWith('❌') ? '#991b1b' : '#166534',
        }}>
          {mensaje}
        </div>
      )}

      {formPlantilla && (
        <div style={{ background: 'linear-gradient(135deg,#dbeafe,#f0fdf4)', border: '1px solid #93c5fd', borderRadius: 10, padding: 18, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--azul-700)', marginBottom: 10 }}>✨ Generar estructura automática</div>
          <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 12, lineHeight: 1.55 }}>
            Reparte los <strong>{criteriosCurr.length} criterios</strong> del currículo entre las unidades, equilibrando por trimestres.
            {unidades.length > 0 && (
              <>
                {' '}<strong>No borra nada</strong>: conserva tus {unidades.length} unidades actuales y sus criterios,
                y solo reparte los que aún no tengan unidad.
              </>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Denominación</label>
              <select value={plantillaCfg.tipo} onChange={e => setPlantillaCfg(c => ({ ...c, tipo: e.target.value }))} style={{ width: '100%' }}>
                {TIPOS_UNIDAD.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Número total de unidades</label>
              <select value={plantillaCfg.n} onChange={e => setPlantillaCfg(c => ({ ...c, n: Number(e.target.value) }))} style={{ width: '100%' }}>
                {[3, 6, 9, 12].map(n => <option key={n} value={n}>{n} ({n / 3} por trimestre)</option>)}
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
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>
              ⚠ No se encontraron criterios para «{asignaturaNombre}» en {grupoComunidad} · {grupoCurso}º {grupoEtapa}.
            </div>
          )}
        </div>
      )}

      {unidades.length === 0 && !formPlantilla && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gris-600)', fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <strong>Generar estructura</strong> reparte los criterios automáticamente.<br />
          O añade unidades a mano con el botón de cada trimestre.
        </div>
      )}

      {TRIM_CFG.map(trim => {
        const lista = porTrimestre[trim.n]
        const isAddingHere = formNueva === trim.n
        if (lista.length === 0 && !isAddingHere && unidades.length === 0) return null

        return (
          <div key={trim.n} style={{ marginBottom: 16 }}>
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

            {isAddingHere && (
              <div style={{ background: trim.bg, border: `1px solid ${trim.border}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
                  <input value={nuevaData.nombre} autoFocus
                    onChange={e => setNuevaData(d => ({ ...d, nombre: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleCrearUnidad(trim.n); if (e.key === 'Escape') setFormNueva(null) }}
                    placeholder="Nombre de la unidad *" style={{ fontSize: 13 }} />
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {lista.map(u => renderUnidad(u, trim))}
            </div>
          </div>
        )
      })}

      {sinTrimestre.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gris-600)', marginBottom: 6 }}>Sin trimestre asignado</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {sinTrimestre.map(u => renderUnidad(u, null))}
          </div>
        </div>
      )}

      {critSinAsignar.length > 0 && unidades.length > 0 && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
          <strong>{critSinAsignar.length} criterio{critSinAsignar.length !== 1 ? 's' : ''} sin unidad:</strong>{' '}
          {critSinAsignar.map(c => c.id).join(' · ')}
        </div>
      )}
    </div>
  )
}
