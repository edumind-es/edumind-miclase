import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'

type Alumno = { id: number; nombre: string; apellidos: string; neae: number }
type Criterio = { id: string; descripcion: string; objetivo_id: string; peso: number }
type Instrumento = { id: number; nombre: string; tipo: string; peso: number }
type CalIndex = Record<string, number | null>

function calColor(v: number | null | undefined) {
  if (v == null) return 'cal-vacio'
  const n = Math.round(v)
  return `cal-${n}`
}

export default function EvaluacionPage() {
  const [params] = useSearchParams()
  const grupoId = params.get('grupo_id')
  const [trimestre, setTrimestre] = useState(2)
  const [grupos, setGrupos] = useState<any[]>([])
  const [asignaturas, setAsignaturas] = useState<any[]>([])
  const [asignaturaId, setAsignaturaId] = useState<string>('')
  const [calificador, setCalificador] = useState<any>(null)
  const [cargando, setCargando] = useState(false)
  const [cambiosPendientes, setCambiosPendientes] = useState<CalIndex>({})

  useEffect(() => {
    fetch('/api/grupos').then(r => r.json()).then(setGrupos)
  }, [])

  useEffect(() => {
    const gid = grupoId || (grupos[0]?.id)
    if (!gid) return
    fetch(`/api/asignaturas?grupo_id=${gid}`).then(r => r.json()).then(d => {
      setAsignaturas(d)
      if (d.length > 0) setAsignaturaId(String(d[0].id))
    })
  }, [grupoId, grupos])

  useEffect(() => {
    if (!asignaturaId) return
    setCargando(true)
    fetch(`/api/calificaciones/calificador?asignatura_id=${asignaturaId}&trimestre=${trimestre}`)
      .then(r => r.json())
      .then(d => { setCalificador(d); setCargando(false) })
      .catch(() => setCargando(false))
  }, [asignaturaId, trimestre])

  const getCal = (alumnoId: number, criterioId: string, instrumentoId: number) => {
    const key = `${alumnoId}:${criterioId}:${instrumentoId}:${trimestre}`
    if (key in cambiosPendientes) return cambiosPendientes[key]
    const cal = calificador?.calificaciones?.[key]
    return cal?.valor ?? null
  }

  const setCal = (alumnoId: number, criterioId: string, instrumentoId: number, val: string) => {
    const key = `${alumnoId}:${criterioId}:${instrumentoId}:${trimestre}`
    const v = val === '' ? null : Math.min(10, Math.max(0, parseFloat(val)))
    setCambiosPendientes(p => ({ ...p, [key]: isNaN(v as number) ? null : v }))
  }

  const guardar = async () => {
    if (Object.keys(cambiosPendientes).length === 0) return
    const asig = asignaturas.find(a => String(a.id) === asignaturaId)
    const grupo = grupos.find(g => String(g.id) === (grupoId || String(grupos[0]?.id)))
    const items = Object.entries(cambiosPendientes).map(([key, valor]) => {
      const [alumno_id, criterio_id, instrumento_id, trim] = key.split(':')
      return {
        alumno_id: Number(alumno_id), criterio_id, instrumento_id: Number(instrumento_id),
        trimestre: Number(trim), valor,
        asignatura: asig?.nombre, curso: grupo?.curso,
        etapa: grupo?.etapa, comunidad: asig?.comunidad || 'Galicia',
      }
    })
    await fetch('/api/calificaciones/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    setCambiosPendientes({})
    // Recargar calificador
    const d = await fetch(`/api/calificaciones/calificador?asignatura_id=${asignaturaId}&trimestre=${trimestre}`).then(r => r.json())
    setCalificador(d)
  }

  if (!grupoId && grupos.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <p style={{ color: 'var(--gris-600)', marginBottom: 16 }}>Crea un grupo primero para poder evaluar.</p>
        <Link to="/grupos/nuevo" style={{ color: 'var(--azul-500)', fontWeight: 600 }}>Crear grupo →</Link>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Calificador</h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={asignaturaId} onChange={e => setAsignaturaId(e.target.value)}>
            {asignaturas.map(a => <option key={a.id} value={a.id}>{a.nombre_display}</option>)}
          </select>
          <select value={trimestre} onChange={e => setTrimestre(Number(e.target.value))}>
            <option value={1}>1er trimestre</option>
            <option value={2}>2º trimestre</option>
            <option value={3}>3er trimestre</option>
          </select>
          <button className="btn-primary" onClick={guardar} disabled={Object.keys(cambiosPendientes).length === 0}>
            {Object.keys(cambiosPendientes).length > 0 ? `Guardar (${Object.keys(cambiosPendientes).length})` : 'Guardado'}
          </button>
        </div>
      </div>

      {asignaturas.length === 0 && (
        <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
          No hay asignaturas configuradas para este grupo. Configúralas desde Ajustes del grupo.
        </div>
      )}

      {cargando && <p>Cargando calificador…</p>}

      {calificador && !cargando && (
        <CalificadorGrid
          alumnos={calificador.alumnos}
          criterios={calificador.criterios}
          instrumentos={calificador.instrumentos}
          getCal={getCal}
          setCal={setCal}
        />
      )}
    </>
  )
}

function CalificadorGrid({ alumnos, criterios, instrumentos, getCal, setCal }: {
  alumnos: Alumno[]; criterios: Criterio[]; instrumentos: Instrumento[];
  getCal: (a: number, c: string, i: number) => number | null
  setCal: (a: number, c: string, i: number, v: string) => void
}) {
  if (!alumnos?.length || !criterios?.length) {
    return <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>Configura instrumentos y añade alumnos para usar el calificador.</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
        <thead>
          <tr>
            <th style={{ background: 'var(--azul-900)', color: 'white', padding: '10px 14px', textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, minWidth: 160 }}>
              Alumno
            </th>
            {criterios.map(cr => (
              <th key={cr.id} title={cr.descripcion}
                style={{ background: 'var(--azul-700)', color: 'white', padding: '8px 10px', textAlign: 'center', minWidth: 90, maxWidth: 120, fontWeight: 600 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{cr.id}</div>
                <div style={{ fontSize: 10, opacity: .75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                  {cr.descripcion.substring(0, 30)}…
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alumnos.map((al, i) => (
            <tr key={al.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--gris-100)' }}>
              <td style={{ padding: '8px 14px', fontWeight: 500, position: 'sticky', left: 0, background: 'inherit', borderRight: '2px solid var(--gris-300)' }}>
                {al.apellidos}, {al.nombre}
                {al.neae ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
              </td>
              {criterios.map(cr => {
                const instrId = instrumentos[0]?.id
                const val = getCal(al.id, cr.id, instrId)
                const cls = calColor(val)
                return (
                  <td key={cr.id} style={{ textAlign: 'center', padding: 2 }}>
                    <input
                      type="number" min={0} max={10} step={0.1}
                      value={val === null ? '' : val}
                      onChange={e => setCal(al.id, cr.id, instrId, e.target.value)}
                      className={cls}
                      style={{
                        width: 58, textAlign: 'center', border: 'none', borderRadius: 4,
                        padding: '5px 4px', fontSize: 13, fontWeight: 600,
                        cursor: 'text',
                      }}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
