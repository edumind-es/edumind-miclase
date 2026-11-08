/**
 * Tutorías de la clase activa: la lista con sus filtros (alumno, tipo,
 * fechas, con acuerdos pendientes), los acuerdos pendientes de toda la clase
 * con los vencidos primero, las próximas citas y la entrada a los modelos.
 *
 * `?alumno=<id>` (desde la ficha del alumno) entra ya filtrado por él, y
 * `?abrir=<id>` abre esa tutoría.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useClaseActiva } from '@/contexto/ClaseActiva'
import { useParametrosClase } from '@/contexto/useParametrosClase'
import { getAlumnosByGrupo, getTutorias, getModelosTutoria, revisarAcuerdo } from '@/db/queries'
import {
  TIPOS_TUTORIA, filtrarTutorias, acuerdosPendientes, proximasCitas, modelosElegibles,
  tutoriaDesdeModelo, fechaLegible, nombreTipo, diaLocal,
  type Tutoria, type TipoTutoria, type ModeloElegible,
} from '@/db/tutorias'
import type { Alumno } from '@/db/localDb'
import TutoriaEditor, { type BorradorTutoria } from '@/components/TutoriaEditor'
import ModelosTutoria from '@/components/ModelosTutoria'

const nombreCorto = (a?: Alumno) => a ? `${a.nombre} ${a.apellidos}` : '¿?'

export default function TutoriasPage() {
  useParametrosClase()
  const { grupo, grupoId, grupos } = useClaseActiva()
  const [params, setParams] = useSearchParams()
  const [alumnos, setAlumnos] = useState<Alumno[]>([])
  const [tutorias, setTutorias] = useState<Tutoria[]>([])
  const [modelos, setModelos] = useState<ModeloElegible[]>([])
  const [editando, setEditando] = useState<BorradorTutoria | null>(null)
  const [eligiendo, setEligiendo] = useState(false)
  const [verModelos, setVerModelos] = useState(false)
  const [msg, setMsg] = useState('')

  const alumnoFiltro = Number(params.get('alumno')) || null
  const [tipo, setTipo] = useState<TipoTutoria | ''>('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [conPendientes, setConPendientes] = useState(false)

  const cargar = useCallback(async () => {
    if (!grupoId) { setAlumnos([]); setTutorias([]); return }
    const [al, tu, mo] = await Promise.all([getAlumnosByGrupo(grupoId), getTutorias(grupoId), getModelosTutoria()])
    setAlumnos(al); setTutorias(tu); setModelos(modelosElegibles(mo))
  }, [grupoId])
  useEffect(() => { cargar() }, [cargar])

  // ?abrir=<id>: abrir esa tutoría en cuanto esté cargada
  useEffect(() => {
    const abrir = Number(params.get('abrir'))
    if (!abrir) return
    const t = tutorias.find(x => x.id === abrir)
    if (!t) return
    setEditando(t)
    const resto = new URLSearchParams(params); resto.delete('abrir'); setParams(resto, { replace: true })
  }, [params, tutorias, setParams])

  const porId = useMemo(() => new Map(alumnos.map(a => [a.id!, a])), [alumnos])
  const lista = useMemo(() => filtrarTutorias(tutorias, {
    alumno_id: alumnoFiltro, tipo: tipo || null, desde: desde || null, hasta: hasta || null, conPendientes,
  }), [tutorias, alumnoFiltro, tipo, desde, hasta, conPendientes])
  const pendientes = useMemo(() => acuerdosPendientes(tutorias, diaLocal(), alumnoFiltro ? [alumnoFiltro] : undefined), [tutorias, alumnoFiltro])
  const citas = useMemo(() => proximasCitas(filtrarTutorias(tutorias, { alumno_id: alumnoFiltro })).slice(0, 5), [tutorias, alumnoFiltro])

  const ponerAlumno = (id: number | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('alumno', String(id)); else p.delete('alumno')
    setParams(p, { replace: true })
  }

  const empezar = (m: ModeloElegible) => {
    if (!grupoId) return
    setEligiendo(false)
    setEditando(tutoriaDesdeModelo(m, { grupo_id: grupoId, alumnos: alumnoFiltro ? [alumnoFiltro] : [] }))
  }

  const marcar = async (tutoria_id: number, clave: string, estado: 'cumplido' | 'no_cumplido') => {
    await revisarAcuerdo(tutoria_id, clave, { estado })
    setMsg(estado === 'cumplido' ? 'Acuerdo marcado como cumplido.' : 'Acuerdo marcado como no cumplido.')
    cargar()
  }

  if (!grupoId) {
    return (
      <>
        <h1 className="page-title">Tutorías</h1>
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--gris-600)' }}>
          {grupos.length === 0
            ? <>Primero crea una clase. <Link to="/grupos/nuevo" style={{ color: 'var(--azul-500)', fontWeight: 600 }}>Crear clase →</Link></>
            : 'Elige una clase arriba para ver sus tutorías.'}
        </div>
      </>
    )
  }

  const nombresAlumnos = (t: Tutoria) => t.tipo === 'grupo' && !t.alumnos.length
    ? 'Toda la clase'
    : t.alumnos.map(id => nombreCorto(porId.get(id))).join(', ') || 'Sin alumnado'

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Tutorías</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={() => setVerModelos(true)} data-modelos-abrir>Modelos</button>
          <button className="btn-primary" onClick={() => setEligiendo(true)} data-tutoria-nueva>+ Nueva tutoría</button>
        </div>
      </div>

      {msg && <div role="status" style={{ fontSize: 13, color: 'var(--azul-700)', marginBottom: 10 }}>{msg}</div>}

      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }} data-tutorias-filtros>
        <label style={{ fontSize: 12.5, display: 'grid', gap: 3 }}>Alumno
          <select value={alumnoFiltro ?? ''} onChange={e => ponerAlumno(Number(e.target.value) || null)} data-filtro-alumno>
            <option value="">Todos</option>
            {[...alumnos].sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es')).map(a =>
              <option key={a.id} value={a.id}>{a.apellidos}, {a.nombre}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12.5, display: 'grid', gap: 3 }}>Tipo
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoTutoria | '')} data-filtro-tipo>
            <option value="">Todos</option>
            {TIPOS_TUTORIA.map(x => <option key={x.valor} value={x.valor}>{x.corto}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12.5, display: 'grid', gap: 3 }}>Desde
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} data-filtro-desde />
        </label>
        <label style={{ fontSize: 12.5, display: 'grid', gap: 3 }}>Hasta
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} data-filtro-hasta />
        </label>
        <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 4 }}>
          <input type="checkbox" checked={conPendientes} onChange={e => setConPendientes(e.target.checked)} data-filtro-pendientes />
          Con acuerdos pendientes
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
        <section className="card" style={{ padding: 16 }} data-tutorias-lista>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>{lista.length} {lista.length === 1 ? 'tutoría' : 'tutorías'}</h2>
          {lista.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>
              {tutorias.length ? 'Ninguna tutoría con estos filtros.' : 'Todavía no hay tutorías en esta clase. Empieza con «Nueva tutoría».'}
            </div>
          )}
          {lista.map(t => {
            const pend = t.acuerdos.filter(a => a.estado === 'pendiente').length
            return (
              <button key={t.id} onClick={() => setEditando(t)} data-tutoria-fila={t.id}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--gris-200)', padding: '10px 0', cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--lm-mono, monospace)', fontSize: 12.5 }}>{fechaLegible(t.fecha)}</span>
                  <span className="badge" style={{ background: 'var(--azul-100)', color: 'var(--azul-700)', fontSize: 11 }}>{nombreTipo(t.tipo)}</span>
                  {pend > 0 && <span className="badge" style={{ background: 'var(--ambar-100)', color: 'var(--ambar-500)', fontSize: 11 }} data-pendientes={pend}>{pend} pendiente{pend === 1 ? '' : 's'}</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 3 }}>{nombresAlumnos(t)}</div>
                <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>
                  {[t.modelo_nombre, t.asistentes.map(a => a.rol || a.nombre).filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                </div>
              </button>
            )
          })}
        </section>

        <div style={{ display: 'grid', gap: 16 }}>
          <section className="card" style={{ padding: 16 }} data-acuerdos-pendientes>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Acuerdos pendientes ({pendientes.length})</h2>
            {pendientes.length === 0 && <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>No hay acuerdos pendientes.</div>}
            {pendientes.map(p => (
              <div key={`${p.tutoria_id}:${p.acuerdo.clave}`} data-acuerdo-pendiente data-vencido={p.vencido ? '1' : undefined}
                style={{ padding: '8px 0', borderBottom: '1px solid var(--gris-200)', fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>{p.acuerdo.texto}</div>
                <div style={{ fontSize: 12, color: p.vencido ? 'var(--rojo-500, #b91c1c)' : 'var(--gris-600)' }}>
                  {p.alumnos.map(id => nombreCorto(porId.get(id))).join(', ') || 'Grupo'}
                  {p.acuerdo.responsable ? ` · ${p.acuerdo.responsable}` : ''}
                  {p.acuerdo.fecha_prevista ? ` · ${p.vencido ? 'vencido el' : 'para el'} ${fechaLegible(p.acuerdo.fecha_prevista)}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 10px' }} data-acuerdo-cumplido
                    onClick={() => marcar(p.tutoria_id, p.acuerdo.clave, 'cumplido')}>Cumplido</button>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 10px' }} data-acuerdo-no-cumplido
                    onClick={() => marcar(p.tutoria_id, p.acuerdo.clave, 'no_cumplido')}>No cumplido</button>
                  <button style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--azul-500)', cursor: 'pointer' }}
                    onClick={() => { const t = tutorias.find(x => x.id === p.tutoria_id); if (t) setEditando(t) }}>Ver tutoría</button>
                </div>
              </div>
            ))}
          </section>

          {citas.length > 0 && (
            <section className="card" style={{ padding: 16 }} data-proximas-citas>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Próximas citas</h2>
              {citas.map(t => (
                <div key={t.id} style={{ fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--gris-200)' }}>
                  <span style={{ fontFamily: 'var(--lm-mono, monospace)', fontSize: 12.5 }}>{fechaLegible(t.proxima_cita)}</span>
                  {' · '}{nombresAlumnos(t)}{t.proxima_cita_nota ? ` · ${t.proxima_cita_nota}` : ''}
                </div>
              ))}
            </section>
          )}
        </div>
      </div>

      {eligiendo && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEligiendo(false) }}>
          <div className="card" role="dialog" aria-modal="true" aria-label="Elegir modelo" data-elegir-modelo
            style={{ width: 'min(520px, 94vw)', maxHeight: '90vh', overflowY: 'auto', padding: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>¿Con qué modelo?</h2>
            <p style={{ fontSize: 13, color: 'var(--gris-600)', margin: '0 0 12px' }}>
              El modelo pone los apartados y el orden del día; luego puedes cambiar lo que quieras.
            </p>
            {modelos.map(m => (
              <button key={m.clave} onClick={() => empezar(m)} data-modelo={m.clave}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--gris-50, #f8fafc)', border: '1px solid var(--gris-200)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>{nombreTipo(m.tipo)} · {m.apartados.map(a => a.titulo).join(' · ')}</div>
              </button>
            ))}
            <button className="btn-secondary" onClick={() => setEligiendo(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {editando && grupo && (
        <TutoriaEditor
          key={editando.id ?? 'nueva'}
          inicial={editando}
          alumnos={alumnos}
          grupo={grupo}
          onCerrar={() => { setEditando(null); cargar() }}
          onGuardado={() => cargar()}
        />
      )}

      {verModelos && <ModelosTutoria onCerrar={() => { setVerModelos(false); cargar() }} />}
    </>
  )
}
