import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  getGrupos, getAlumnosByGrupo, getSesiones, crearSesion as dbCrearSesion,
  actualizarSesion, eliminarSesion, getAsistencia, saveAsistencia,
} from '@/db/queries'

type Alumno  = { id: number; nombre: string; apellidos: string }
type Sesion  = { id: number; fecha: string; tipo: string; notas?: string | null }
type Estado  = 'presente' | 'ausente' | 'justificada' | 'retraso'

const ESTADOS: { value: Estado; label: string; color: string; bg: string }[] = [
  { value: 'presente',    label: 'P', color: '#166534', bg: '#dcfce7' },
  { value: 'ausente',     label: 'A', color: '#991b1b', bg: '#fee2e2' },
  { value: 'justificada', label: 'J', color: '#92400e', bg: '#fef3c7' },
  { value: 'retraso',     label: 'R', color: '#1e40af', bg: '#dbeafe' },
]

function estadoSiguiente(actual: Estado | null): Estado {
  const orden: Estado[] = ['presente', 'ausente', 'justificada', 'retraso']
  if (!actual) return 'presente'
  return orden[(orden.indexOf(actual) + 1) % orden.length]
}

function hoy() { return new Date().toISOString().slice(0, 10) }

export default function SesionesPage() {
  const [params] = useSearchParams()
  const grupoId = params.get('grupo_id')

  const [grupos, setGrupos] = useState<any[]>([])
  const [grupoSelId, setGrupoSelId] = useState(grupoId || '')
  const [alumnos, setAlumnos] = useState<Alumno[]>([])
  const [sesiones, setSesiones] = useState<Sesion[]>([])
  const [sesionActiva, setSesionActiva] = useState<number | null>(null)
  const [asistencia, setAsistencia] = useState<Record<number, Estado>>({})
  const [guardando, setGuardando] = useState(false)
  const [formNueva, setFormNueva] = useState(false)
  const [nuevaSesion, setNuevaSesion] = useState({ fecha: hoy(), tipo: 'clase', notas: '' })
  const [diario, setDiario] = useState('')
  const [diarioGuardado, setDiarioGuardado] = useState(false)

  useEffect(() => {
    getGrupos().then(data => {
      setGrupos(data)
      if (!grupoSelId && data[0]) setGrupoSelId(String(data[0].id))
    })
  }, [])

  useEffect(() => {
    if (!grupoSelId) return
    Promise.all([
      getAlumnosByGrupo(Number(grupoSelId)),
      getSesiones(Number(grupoSelId)),
    ]).then(([als, ses]) => {
      setAlumnos(als as Alumno[])
      setSesiones(ses as Sesion[])
      setSesionActiva(null)
      setAsistencia({})
    })
  }, [grupoSelId])

  const cargarAsistencia = async (sesionId: number) => {
    setSesionActiva(sesionId)
    const datos = await getAsistencia(sesionId)
    const mapa: Record<number, Estado> = {}
    for (const d of datos) mapa[d.alumno_id] = d.estado as Estado
    setAsistencia(mapa)
    setDiario(sesiones.find(s => s.id === sesionId)?.notas || '')
    setDiarioGuardado(false)
  }

  const guardarDiario = async () => {
    if (!sesionActiva) return
    await actualizarSesion(sesionActiva, { notas: diario.trim() || undefined })
    setSesiones(prev => prev.map(s => s.id === sesionActiva ? { ...s, notas: diario.trim() || undefined } : s))
    setDiarioGuardado(true)
    setTimeout(() => setDiarioGuardado(false), 2000)
  }

  const toggleEstado = (alumnoId: number) => {
    setAsistencia(prev => ({ ...prev, [alumnoId]: estadoSiguiente(prev[alumnoId] || null) }))
  }

  const marcarTodos = (estado: Estado) => {
    const nuevo: Record<number, Estado> = {}
    for (const a of alumnos) nuevo[a.id] = estado
    setAsistencia(nuevo)
  }

  const guardarAsistencia = async () => {
    if (!sesionActiva) return
    setGuardando(true)
    // Quien no se ha marcado se guarda como «sin registrar», no como presente:
    // un parte de faltas no puede inventarse asistencias que nadie comprobó.
    const registros = alumnos.map(a => ({ alumno_id: a.id, estado: asistencia[a.id] ?? null }))
    await saveAsistencia(sesionActiva, registros)
    setGuardando(false)
  }

  /** Devuelve a «sin registrar» al alumno que se marcó por error. */
  const limpiarEstado = (alumnoId: number) => {
    setAsistencia(prev => {
      const { [alumnoId]: _, ...resto } = prev
      return resto
    })
  }

  /**
   * Borra una sesión mal creada. `eliminarSesion` existía en db/queries.ts
   * desde el principio, pero ninguna pantalla la llamaba: una sesión con la
   * fecha equivocada se quedaba ahí para siempre, contando en los informes.
   */
  const borrarSesion = async (s: Sesion) => {
    const ok = window.confirm(
      `¿Borrar la sesión del ${s.fecha}?\n\n` +
      'Se borra también su pase de lista y su diario. Las calificaciones no se tocan.')
    if (!ok) return
    await eliminarSesion(s.id)
    if (sesionActiva === s.id) { setSesionActiva(null); setAsistencia({}); setDiario('') }
    setSesiones(prev => prev.filter(x => x.id !== s.id))
  }

  const handleCrearSesion = async () => {
    if (!nuevaSesion.fecha || !grupoSelId) return
    setGuardando(true)
    const id = await dbCrearSesion({
      grupo_id: Number(grupoSelId),
      fecha: nuevaSesion.fecha,
      tipo: nuevaSesion.tipo,
      notas: nuevaSesion.notas || undefined,
    })
    setFormNueva(false)
    setNuevaSesion({ fecha: hoy(), tipo: 'clase', notas: '' })
    const ses = await getSesiones(Number(grupoSelId))
    setSesiones(ses as Sesion[])
    cargarAsistencia(id)
    setGuardando(false)
  }

  if (!grupoSelId && grupos.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <p style={{ color: 'var(--gris-600)', marginBottom: 16 }}>Crea un grupo primero.</p>
        <Link to="/grupos/nuevo" style={{ color: 'var(--azul-500)', fontWeight: 600 }}>Crear grupo →</Link>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Sesiones y asistencia</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={grupoSelId} onChange={e => setGrupoSelId(e.target.value)}>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
          <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setFormNueva(true)}>
            + Nueva sesión
          </button>
        </div>
      </div>

      {formNueva && (
        <div className="card" style={{ marginBottom: 20, background: 'var(--azul-100)', border: '1px solid var(--azul-300)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: 'var(--azul-700)' }}>Nueva sesión</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 140px 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Fecha *</label>
              <input type="date" value={nuevaSesion.fecha}
                onChange={e => setNuevaSesion(s => ({ ...s, fecha: e.target.value }))}
                style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Tipo</label>
              <select value={nuevaSesion.tipo}
                onChange={e => setNuevaSesion(s => ({ ...s, tipo: e.target.value }))}
                style={{ width: '100%' }}>
                <option value="clase">Clase</option>
                <option value="excursion">Excursión</option>
                <option value="examen">Examen</option>
                <option value="taller">Taller</option>
                <option value="evento">Evento</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Notas (opcional)</label>
              <input value={nuevaSesion.notas}
                onChange={e => setNuevaSesion(s => ({ ...s, notas: e.target.value }))}
                placeholder="Tema, actividad…" style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleCrearSesion} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Crear y pasar lista'}
            </button>
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setFormNueva(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gris-200)', fontWeight: 600, fontSize: 14, color: 'var(--azul-700)' }}>
            Historial ({sesiones.length})
          </div>
          {sesiones.length === 0 && (
            <div style={{ padding: '20px 14px', color: 'var(--gris-600)', fontSize: 13 }}>Sin sesiones. Crea la primera.</div>
          )}
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {sesiones.map(s => (
              <div key={s.id}
                role="button"
                tabIndex={0}
                aria-current={sesionActiva === s.id}
                onClick={() => cargarAsistencia(s.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cargarAsistencia(s.id) }
                }}
                style={{
                  padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--gris-100)',
                  background: sesionActiva === s.id ? 'var(--azul-100)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: sesionActiva === s.id ? 700 : 500, fontSize: 14 }}>
                    {new Date(s.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gris-600)', display: 'flex', gap: 8, marginTop: 2 }}>
                    <span style={{ textTransform: 'capitalize' }}>{s.tipo}</span>
                    {s.notas && <span style={{ fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>· {s.notas}</span>}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); borrarSesion(s) }}
                  title="Borrar esta sesión"
                  aria-label={`Borrar la sesión del ${s.fecha}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--gris-600)', padding: 4 }}>
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>

        {sesionActiva ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>
                Pase de lista — {sesiones.find(s => s.id === sesionActiva)?.fecha}
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {ESTADOS.map(e => (
                  <button key={e.value} onClick={() => marcarTodos(e.value)}
                    style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700, background: e.bg, color: e.color, border: `1px solid ${e.color}30` }}>
                    Todos {e.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)', marginBottom: 12 }}>
              Toca el nombre para cambiar: P=Presente · A=Ausente · J=Justificada · R=Retraso.
              Los que quedan con <strong>?</strong> se guardan como <strong>sin registrar</strong>,
              no como presentes. Pulsación larga para volver a dejarlo sin registrar.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
              {alumnos.map(a => {
                const estado = asistencia[a.id] || null
                const info = ESTADOS.find(e => e.value === estado)
                return (
                  <div key={a.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${a.apellidos}, ${a.nombre}: ${estado ?? 'sin registrar'}`}
                    onClick={() => toggleEstado(a.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEstado(a.id) }
                      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); limpiarEstado(a.id) }
                    }}
                    onContextMenu={e => { e.preventDefault(); limpiarEstado(a.id) }}
                    style={{
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      border: `2px solid ${info ? info.color + '50' : 'var(--gris-200)'}`,
                      background: info ? info.bg : 'var(--gris-100)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{a.apellidos}</div>
                      <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>{a.nombre}</div>
                    </div>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontWeight: 800, fontSize: 15,
                      background: info ? info.color : 'var(--gris-400)', color: 'white',
                    }}>
                      {info ? info.label : '?'}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn-primary" onClick={guardarAsistencia} disabled={guardando}>
                {guardando ? 'Guardando…' : '✓ Guardar asistencia'}
              </button>
              <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>
                {(() => {
                  const cuenta = (v: Estado) => alumnos.filter(a => asistencia[a.id] === v).length
                  const sinRegistrar = alumnos.filter(a => !asistencia[a.id]).length
                  const partes = [
                    `${cuenta('presente')}/${alumnos.length} presentes`,
                    cuenta('ausente')     ? `${cuenta('ausente')} ausentes`         : '',
                    cuenta('justificada') ? `${cuenta('justificada')} justificadas` : '',
                    cuenta('retraso')     ? `${cuenta('retraso')} con retraso`      : '',
                  ].filter(Boolean)
                  return (
                    <>
                      {partes.join(' · ')}
                      {sinRegistrar > 0 && (
                        <span style={{ color: 'var(--ambar-500)', fontWeight: 600 }}>
                          {' · '}{sinRegistrar} sin registrar
                        </span>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>

            {/* Diario de la sesión */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--gris-100)' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--azul-700)', display: 'block', marginBottom: 6 }}>
                📓 Diario de la sesión
              </label>
              <textarea value={diario} onChange={e => setDiario(e.target.value)}
                placeholder="Qué se trabajó, incidencias, cosas a retomar la próxima sesión…"
                rows={3} style={{ width: '100%', resize: 'vertical', fontSize: 13, marginBottom: 8 }} />
              <button className="btn-secondary" style={{ fontSize: 13 }} onClick={guardarDiario}>
                {diarioGuardado ? '✅ Guardado' : 'Guardar diario'}
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--gris-600)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <p>Selecciona una sesión del historial para hacer el pase de lista.</p>
          </div>
        )}
      </div>
    </>
  )
}
