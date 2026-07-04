import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getGrupos, getAsignaturas, getUnidades, getCalificadorBase, saveCalificaciones } from '@/db/queries'
import { useAppStore } from '@/store/useAppStore'

type Alumno = { id: number; nombre: string; apellidos: string; neae: number }
type Criterio = { id: string; descripcion: string; objetivo_id: string; peso: number }
type Instrumento = { id: number; nombre: string; tipo: string; peso: number }
type CalIndex = Record<string, number | null>

function calColor(v: number | null | undefined) {
  if (v == null) return 'cal-vacio'
  return `cal-${Math.round(v)}`
}

// Trimestre del curso escolar según la fecha: sep-dic → 1º, ene-mar → 2º, abr-ago → 3º
function trimestreActual(): number {
  const mes = new Date().getMonth() + 1
  return mes >= 9 ? 1 : mes <= 3 ? 2 : 3
}

export default function EvaluacionPage() {
  const [params] = useSearchParams()
  const grupoId = params.get('grupo_id')
  const asignaturaIdParam = params.get('asignatura_id')
  const unidadIdParam = params.get('unidad_id')
  const headers = useAppStore(s => s._headers)

  const [trimestre, setTrimestre] = useState(trimestreActual)
  const [grupos, setGrupos] = useState<any[]>([])
  const [grupoSelId, setGrupoSelId] = useState<string>('')
  const [asignaturas, setAsignaturas] = useState<any[]>([])
  const [asignaturaId, setAsignaturaId] = useState<string>('')
  const [unidades, setUnidades] = useState<any[]>([])
  const [unidadId, setUnidadId] = useState<string>(unidadIdParam || '')
  const [instrumentoId, setInstrumentoId] = useState<number | null>(null)
  const [calBase, setCalBase] = useState<any>(null)
  const [criterios, setCriterios] = useState<Criterio[]>([])
  const [cargando, setCargando] = useState(false)
  const [errorCurriculo, setErrorCurriculo] = useState(false)
  const [cambiosPendientes, setCambiosPendientes] = useState<CalIndex>({})

  const nPendientes = Object.keys(cambiosPendientes).length

  // Al cambiar de grupo o asignatura los cambios pendientes dejan de ser válidos:
  // pedir confirmación antes de descartarlos
  const confirmarDescarte = () =>
    nPendientes === 0 ||
    confirm(`Tienes ${nPendientes} calificación(es) sin guardar. ¿Descartarlas?`)

  // Aviso del navegador si se cierra o recarga con cambios sin guardar
  useEffect(() => {
    if (nPendientes === 0) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [nPendientes])

  useEffect(() => {
    getGrupos().then(data => {
      setGrupos(data)
      const gid = grupoId || (data[0]?.id ? String(data[0].id) : '')
      setGrupoSelId(gid)
    })
  }, [])

  useEffect(() => {
    if (grupoId) setGrupoSelId(grupoId)
  }, [grupoId])

  useEffect(() => {
    if (!grupoSelId) return
    getAsignaturas(Number(grupoSelId)).then(d => {
      setAsignaturas(d)
      const preferred = asignaturaIdParam ? asignaturaIdParam : (d[0]?.id ? String(d[0].id) : '')
      setAsignaturaId(preferred)
    })
  }, [grupoSelId])

  // Los cambios pendientes solo son válidos dentro de la misma asignatura
  useEffect(() => { setCambiosPendientes({}) }, [asignaturaId])

  useEffect(() => {
    if (!asignaturaId) { setUnidades([]); return }
    getUnidades(Number(asignaturaId)).then(d => {
      setUnidades(Array.isArray(d) ? d : [])
      if (unidadIdParam && !unidadId) setUnidadId(unidadIdParam)
    })
  }, [asignaturaId])

  useEffect(() => {
    if (!asignaturaId) return
    setCargando(true)

    getCalificadorBase(Number(asignaturaId), trimestre).then(async base => {
      if (!base) { setCargando(false); return }
      setCalBase(base)
      if (base.instrumentos.length > 0) setInstrumentoId(base.instrumentos[0].id!)
      else setInstrumentoId(null)

      // Criterios vienen del servidor (currículo público — no son datos personales)
      const cursoNorm = base.grupo.curso.replace('º', '').replace('ª', '') + 'º'
      const critsUrl = `/api/curriculum/criterios?asignatura=${encodeURIComponent(base.asig.nombre)}&curso=${cursoNorm}&etapa=${base.grupo.etapa}&comunidad=${encodeURIComponent(base.asig.comunidad)}`
      const allCrits: Criterio[] | null = await fetch(critsUrl, { headers: headers() })
        .then(r => { if (!r.ok) throw new Error(); return r.json() })
        .catch(() => null)

      if (allCrits === null) {
        // Distinguir "sin criterios" de "no se pudo cargar el currículo"
        setErrorCurriculo(true)
        setCriterios([])
        setCargando(false)
        return
      }
      setErrorCurriculo(false)

      if (unidadId) {
        // Filtrar criterios de esta unidad
        const ucs = await getUnidades(Number(asignaturaId))
        const u = ucs.find(u => String(u.id) === unidadId)
        const ucSet = new Set(u?.criterios.map(c => c.criterio_id) || [])
        setCriterios(allCrits.filter(c => ucSet.has(c.id)))
      } else {
        setCriterios(allCrits)
      }

      setCargando(false)
    }).catch(() => setCargando(false))
  }, [asignaturaId, trimestre, unidadId])

  const getCal = (alumnoId: number, criterioId: string) => {
    if (!instrumentoId) return null
    const key = `${alumnoId}:${criterioId}:${instrumentoId}:${trimestre}`
    if (key in cambiosPendientes) return cambiosPendientes[key]
    return calBase?.calificaciones?.[key]?.valor ?? null
  }

  const setCal = (alumnoId: number, criterioId: string, val: string) => {
    if (!instrumentoId) return
    const key = `${alumnoId}:${criterioId}:${instrumentoId}:${trimestre}`
    const v = val === '' ? null : Math.min(10, Math.max(0, parseFloat(val)))
    setCambiosPendientes(p => ({ ...p, [key]: isNaN(v as number) ? null : v }))
  }

  const guardar = async () => {
    if (!calBase || Object.keys(cambiosPendientes).length === 0) return
    const items = Object.entries(cambiosPendientes).map(([key, valor]) => {
      const [alumno_id, criterio_id, instrumento_id, trim] = key.split(':')
      return {
        alumno_id: Number(alumno_id), criterio_id,
        instrumento_id: Number(instrumento_id), trimestre: Number(trim),
        valor: valor as number | null,
        asignatura: calBase.asig.nombre, curso: calBase.grupo.curso,
        etapa: calBase.grupo.etapa, comunidad: calBase.asig.comunidad || 'Galicia',
      }
    })
    await saveCalificaciones(items)
    setCambiosPendientes({})
    // Recargar solo las calificaciones
    const base = await getCalificadorBase(Number(asignaturaId), trimestre)
    if (base) setCalBase(base)
  }

  const instrumentos: Instrumento[] = calBase?.instrumentos || []

  if (grupos.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <p style={{ color: 'var(--gris-600)', marginBottom: 16 }}>Crea un grupo primero para poder evaluar.</p>
        <Link to="/grupos/nuevo" style={{ color: 'var(--azul-500)', fontWeight: 600 }}>Crear grupo →</Link>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Calificador</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={grupoSelId} onChange={e => { if (confirmarDescarte()) setGrupoSelId(e.target.value) }} style={{ minWidth: 120 }}>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
          <select value={asignaturaId} onChange={e => { if (confirmarDescarte()) setAsignaturaId(e.target.value) }} disabled={asignaturas.length === 0} style={{ minWidth: 160 }}>
            {asignaturas.length === 0
              ? <option value="">Sin asignaturas</option>
              : asignaturas.map(a => <option key={a.id} value={a.id}>{a.nombre_display}</option>)
            }
          </select>
          {/* Los pendientes sobreviven al cambio de unidad/instrumento: la clave incluye instrumento y trimestre */}
          {unidades.length > 0 && (
            <select value={unidadId} onChange={e => setUnidadId(e.target.value)} style={{ minWidth: 140 }}>
              <option value="">Todos los criterios</option>
              {unidades.map((u: any) => (
                <option key={u.id} value={u.id}>{u.nombre}{u.trimestre ? ` (T${u.trimestre})` : ''}</option>
              ))}
            </select>
          )}
          <select value={trimestre} onChange={e => setTrimestre(Number(e.target.value))}>
            <option value={1}>1er trimestre</option>
            <option value={2}>2º trimestre</option>
            <option value={3}>3er trimestre</option>
          </select>
          <button className="btn-primary" onClick={guardar} disabled={nPendientes === 0}>
            {nPendientes > 0 ? `Guardar (${nPendientes})` : 'Guardado'}
          </button>
        </div>
      </div>

      {asignaturas.length === 0 && (
        <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
          No hay asignaturas configuradas para este grupo.{' '}
          <Link to={`/grupos/${grupoSelId}`} style={{ color: 'var(--azul-500)', fontWeight: 600 }}>Ir al grupo →</Link>
        </div>
      )}

      {instrumentos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {instrumentos.map(ins => (
            <button key={ins.id}
              onClick={() => setInstrumentoId(ins.id)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontWeight: 600,
                border: '2px solid',
                borderColor: instrumentoId === ins.id ? 'var(--azul-700)' : 'var(--gris-300)',
                background: instrumentoId === ins.id ? 'var(--azul-700)' : 'white',
                color: instrumentoId === ins.id ? 'white' : 'var(--gris-600)',
              }}>
              {ins.nombre}
              <span style={{ marginLeft: 6, fontWeight: 400, opacity: .8, fontSize: 11 }}>{ins.peso}%</span>
            </button>
          ))}
        </div>
      )}

      {instrumentos.length === 0 && asignaturas.length > 0 && !cargando && (
        <div className="card" style={{ padding: 24, color: 'var(--gris-600)' }}>
          Esta asignatura no tiene instrumentos de evaluación.{' '}
          <Link to={`/grupos/${grupoSelId}`} style={{ color: 'var(--azul-500)', fontWeight: 600 }}>Añadir instrumentos →</Link>
        </div>
      )}

      {cargando && <p style={{ color: 'var(--gris-600)' }}>Cargando calificador…</p>}

      {errorCurriculo && !cargando && (
        <div className="card" style={{ padding: 24, background: 'var(--ambar-100)', color: 'var(--ambar-500)' }}>
          ⚠️ No se pudo cargar el currículo del servidor. Comprueba que el backend está
          arrancado y vuelve a intentarlo — tus calificaciones no se han perdido.
        </div>
      )}

      {calBase && !cargando && instrumentoId && (
        <CalificadorGrid alumnos={calBase.alumnos} criterios={criterios} getCal={getCal} setCal={setCal} />
      )}
    </>
  )
}

function CalificadorGrid({ alumnos, criterios, getCal, setCal }: {
  alumnos: Alumno[]; criterios: Criterio[]
  getCal: (a: number, c: string) => number | null
  setCal: (a: number, c: string, v: string) => void
}) {
  if (!alumnos?.length || !criterios?.length) {
    return (
      <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
        Configura instrumentos y añade alumnos para usar el calificador.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
        <thead>
          <tr>
            <th style={{
              background: 'var(--azul-900)', color: 'white', padding: '10px 14px',
              textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, minWidth: 160,
            }}>Alumno</th>
            {criterios.map(cr => (
              <th key={cr.id} title={cr.descripcion} style={{
                background: 'var(--azul-700)', color: 'white', padding: '8px 10px',
                textAlign: 'center', minWidth: 80, maxWidth: 110, fontWeight: 600,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{cr.id}</div>
                <div style={{ fontSize: 10, opacity: .75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                  {cr.descripcion?.substring(0, 28)}…
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alumnos.map((al, i) => (
            <tr key={al.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--gris-100)' }}>
              <td style={{
                padding: '8px 14px', fontWeight: 500, position: 'sticky', left: 0,
                background: 'inherit', borderRight: '2px solid var(--gris-300)',
              }}>
                {al.apellidos}, {al.nombre}
                {al.neae ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
              </td>
              {criterios.map(cr => {
                const val = getCal(al.id, cr.id)
                return (
                  <td key={cr.id} style={{ textAlign: 'center', padding: 2 }}>
                    <input type="number" min={0} max={10} step={0.1}
                      value={val === null ? '' : val}
                      onChange={e => setCal(al.id, cr.id, e.target.value)}
                      className={calColor(val)}
                      style={{ width: 56, textAlign: 'center', border: 'none', borderRadius: 4, padding: '5px 4px', fontSize: 13, fontWeight: 600 }}
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
