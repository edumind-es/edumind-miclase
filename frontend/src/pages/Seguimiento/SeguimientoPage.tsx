/**
 * Seguimiento del grupo: cómo va cada criterio y cada alumno.
 *
 * Antes esta pantalla solo funcionaba si se llegaba con `?grupo_id=` en la
 * URL; entrando por el menú lateral se quedaba en blanco. Ahora elige la
 * clase por sí misma y explica qué falta cuando no hay datos.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { getGrupos, getAsignaturas, getResumenPorCriterio, getCalificacionesPorGrupo, getInstrumentos, getUnidades } from '@/db/queries'
import { calcularNotaArea, calificativo } from '@/db/calculo'
import type { Alumno, Asignatura, Instrumento, Calificacion } from '@/db/localDb'

type FilaAlumno = {
  alumno: Alumno
  trimestres: Record<number, number | null>
  final: number | null
  evaluados: number
}

export default function SeguimientoPage() {
  const [params, setParams] = useSearchParams()
  const [grupos, setGrupos] = useState<any[]>([])
  const [grupoId, setGrupoId] = useState(params.get('grupo_id') || '')
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([])
  const [asignaturaId, setAsignaturaId] = useState('')
  const [datosCriterios, setDatosCriterios] = useState<any[]>([])
  const [filas, setFilas] = useState<FilaAlumno[]>([])
  const [cargando, setCargando] = useState(false)
  const [vista, setVista] = useState<'criterios' | 'alumnado'>('criterios')

  useEffect(() => {
    getGrupos().then(gs => {
      setGrupos(gs)
      setGrupoId(prev => prev || (gs[0]?.id ? String(gs[0].id) : ''))
    })
  }, [])

  useEffect(() => {
    if (!grupoId) { setAsignaturas([]); return }
    setParams(grupoId ? { grupo_id: grupoId } : {}, { replace: true })
    getAsignaturas(Number(grupoId)).then(d => {
      setAsignaturas(d)
      setAsignaturaId(prev => (prev && d.some(a => String(a.id) === prev)) ? prev : (d[0]?.id ? String(d[0].id) : ''))
    })
  }, [grupoId])

  useEffect(() => {
    if (!asignaturaId || !grupoId) { setDatosCriterios([]); setFilas([]); return }
    setCargando(true)

    Promise.all([
      getResumenPorCriterio(Number(asignaturaId)),
      getCalificacionesPorGrupo(Number(grupoId)),
      getInstrumentos(Number(asignaturaId)),
      getUnidades(Number(asignaturaId)),
    ]).then(([rows, { alumnos, calificaciones, asignaturas: asigsDet }, instrumentos, unidades]) => {
      // Gráfica por criterio
      const mapa: Record<string, any> = {}
      for (const r of rows) {
        if (!mapa[r.criterio_id]) mapa[r.criterio_id] = { criterio: r.criterio_id }
        mapa[r.criterio_id][`${r.trimestre}T`] = Math.round(r.media * 10) / 10
      }
      setDatosCriterios(Object.values(mapa).sort((a: any, b: any) =>
        a.criterio.localeCompare(b.criterio, 'es', { numeric: true })))

      // Tabla por alumno con notas ponderadas de verdad
      const asig = asigsDet.find(a => String(a.id) === asignaturaId)
      const instrIds = new Set(instrumentos.map(i => i.id!))
      const pesosCriterio = new Map<string, number>()
      for (const u of unidades) {
        for (const c of u.criterios) {
          pesosCriterio.set(c.criterio_id, Math.max(pesosCriterio.get(c.criterio_id) ?? 0, c.peso || 1))
        }
      }

      setFilas(alumnos.map(al => {
        const propias: Calificacion[] = calificaciones.filter(
          c => c.alumno_id === al.id && instrIds.has(c.instrumento_id))
        const n = calcularNotaArea(
          Number(asignaturaId), propias, instrumentos as Instrumento[],
          asig?.pesos_trimestres, pesosCriterio)
        return {
          alumno: al,
          trimestres: n.trimestres,
          final: n.final,
          evaluados: n.criterios.length,
        }
      }))

      setCargando(false)
    }).catch(() => setCargando(false))
  }, [asignaturaId, grupoId])

  const mediaGrupo = useMemo(() => {
    const vals = filas.map(f => f.final).filter((v): v is number => v != null)
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
  }, [filas])

  const enRiesgo = filas.filter(f => f.final != null && f.final < 5).length

  if (grupos.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--gris-600)' }}>
        Crea una clase para poder hacerle seguimiento.{' '}
        <Link to="/grupos/nuevo" style={{ color: 'var(--azul-500)', fontWeight: 600 }}>Crear clase →</Link>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Seguimiento</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={grupoId} onChange={e => setGrupoId(e.target.value)} style={{ minWidth: 130 }}>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
          <select value={asignaturaId} onChange={e => setAsignaturaId(e.target.value)} style={{ minWidth: 180 }} disabled={asignaturas.length === 0}>
            {asignaturas.length === 0
              ? <option value="">Sin áreas</option>
              : asignaturas.map(a => <option key={a.id} value={a.id}>{a.nombre_display}</option>)}
          </select>
        </div>
      </div>

      {asignaturas.length === 0 ? (
        <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
          Esta clase no tiene áreas todavía.{' '}
          <Link to={`/grupos/${grupoId}`} style={{ color: 'var(--azul-500)', fontWeight: 600 }}>Elegir áreas →</Link>
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 18 }}>
            <Tarjeta titulo="Media del grupo" valor={mediaGrupo != null ? String(mediaGrupo) : '—'}
              color={mediaGrupo != null ? calificativo(mediaGrupo).color : 'var(--gris-500)'}
              pie={mediaGrupo != null ? calificativo(mediaGrupo).etiqueta : 'sin calificaciones'} />
            <Tarjeta titulo="Alumnado evaluado"
              valor={`${filas.filter(f => f.final != null).length}/${filas.length}`} color="var(--azul-700)" />
            <Tarjeta titulo="Por debajo de 5" valor={String(enRiesgo)}
              color={enRiesgo > 0 ? 'var(--rojo-500)' : 'var(--verde-500)'}
              pie={enRiesgo > 0 ? 'necesitan refuerzo' : 'nadie suspende'} />
            <Tarjeta titulo="Criterios con datos" valor={String(datosCriterios.length)} color="var(--gris-600)" />
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {(['criterios', 'alumnado'] as const).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={`tab-unidad${vista === v ? ' activa' : ''}`}
                style={{ fontSize: 13 }}>
                {v === 'criterios' ? '📊 Por criterio' : '👥 Por alumno'}
              </button>
            ))}
          </div>

          {cargando && <p style={{ color: 'var(--gris-600)' }}>Calculando…</p>}

          {!cargando && datosCriterios.length === 0 && (
            <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
              Todavía no hay calificaciones en esta área.{' '}
              <Link to={`/evaluacion?grupo_id=${grupoId}&asignatura_id=${asignaturaId}`} style={{ color: 'var(--azul-500)', fontWeight: 600 }}>
                Ir al calificador →
              </Link>
            </div>
          )}

          {!cargando && datosCriterios.length > 0 && vista === 'criterios' && (
            <div className="card">
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                Media por criterio — comparativa trimestral
              </h2>
              <p style={{ fontSize: 12.5, color: 'var(--gris-600)', marginBottom: 18 }}>
                Media del grupo en cada criterio de evaluación. La línea marca el aprobado.
              </p>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={datosCriterios} margin={{ top: 5, right: 20, left: 0, bottom: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--gris-300)" />
                  <XAxis dataKey="criterio" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <ReferenceLine y={5} stroke="var(--rojo-500)" strokeDasharray="4 4" />
                  <Bar dataKey="1T" name="1er trim." fill="#2e6db4" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="2T" name="2º trim."  fill="#27a35a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="3T" name="3er trim." fill="#e07b10" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {!cargando && datosCriterios.length > 0 && vista === 'alumnado' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: 'var(--azul-900)', color: 'white' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Alumno</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, width: 78 }}>1er tr.</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, width: 78 }}>2º tr.</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, width: 78 }}>3er tr.</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, width: 96 }}>Final</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, width: 90 }}>Criterios</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    const c = calificativo(f.final)
                    return (
                      <tr key={f.alumno.id} style={{ background: i % 2 ? 'var(--gris-100)' : 'white' }}>
                        <td style={{ padding: '9px 14px', fontWeight: 500 }}>
                          {f.alumno.apellidos}, {f.alumno.nombre}
                          {f.alumno.neae ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
                        </td>
                        {[1, 2, 3].map(t => (
                          <td key={t} style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--gris-600)' }}>
                            {f.trimestres[t] != null ? f.trimestres[t] : '—'}
                          </td>
                        ))}
                        <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block', minWidth: 46, padding: '3px 8px', borderRadius: 6,
                            background: f.final == null ? 'var(--gris-100)' : c.color,
                            color: f.final == null ? 'var(--gris-500)' : 'white',
                            fontWeight: 700, fontSize: 13,
                          }}>
                            {f.final != null ? f.final : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--gris-500)', fontSize: 12 }}>
                          {f.evaluados}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}

function Tarjeta({ titulo, valor, color, pie }: { titulo: string; valor: string; color: string; pie?: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gris-500)', marginBottom: 5 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{valor}</div>
      {pie && <div style={{ fontSize: 11.5, color: 'var(--gris-500)', marginTop: 2 }}>{pie}</div>}
    </div>
  )
}
