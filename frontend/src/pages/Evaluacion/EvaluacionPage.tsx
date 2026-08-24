/**
 * Calificador — matriz alumno × criterio.
 *
 * Organización: pestañas por área, subpestañas por unidad de la programación.
 * Cada celda muestra la nota y el instrumento con el que la programación dice
 * que se evalúa ese criterio; al pulsarla se abre el panel de evaluación.
 * Un criterio sin instrumento asignado sale rayado y explica cómo arreglarlo.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  getGrupos, getAsignaturas, getUnidades, getMatrizEvaluacion,
  type MatrizEvaluacion, type UnidadConCriterios, type CeldaInstrumento,
} from '@/db/queries'
import { calificativo } from '@/db/calculo'
import { useAppStore } from '@/store/useAppStore'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import { api } from '@/api'
import InstrumentosManager from '@/components/InstrumentosManager'
import CeldaEvaluacion from '@/components/CeldaEvaluacion'
import type { Alumno } from '@/db/localDb'
import { trimestreActual } from '@/db/calculo'

type Criterio = { id: string; descripcion: string; objetivo_id?: string; peso?: number }

function claseNota(v: number | null | undefined) {
  if (v == null) return ''
  return `cal-${Math.round(v)}`
}

export default function EvaluacionPage() {
  const [params] = useSearchParams()
  const headers = useAppStore(s => s._headers)

  const [trimestre, setTrimestre] = useState(trimestreActual)
  const [grupos, setGrupos] = useState<any[]>([])
  const [grupoSelId, setGrupoSelId] = useState<string>('')
  const [asignaturas, setAsignaturas] = useState<any[]>([])
  const [asignaturaId, setAsignaturaId] = useState<number | null>(null)
  const [unidades, setUnidades] = useState<UnidadConCriterios[]>([])
  const [unidadId, setUnidadId] = useState<number | null>(null)
  const [matriz, setMatriz] = useState<MatrizEvaluacion | null>(null)
  const [criterios, setCriterios] = useState<Criterio[]>([])
  const [cargando, setCargando] = useState(false)
  const [errorCurriculo, setErrorCurriculo] = useState(false)
  const [managerAbierto, setManagerAbierto] = useState(false)
  const [refresco, setRefresco] = useState(0)
  const [celda, setCelda] = useState<{ alumnoIdx: number; criterio: Criterio } | null>(null)

  // Parámetros de entrada (llegan desde la programación o el detalle de clase)
  const grupoParam = params.get('grupo_id')
  const asigParam = params.get('asignatura_id')
  const unidadParam = params.get('unidad_id')

  // ── Carga en cascada ──────────────────────────────────────────────────

  useEffect(() => {
    getGrupos().then(data => {
      setGrupos(data)
      setGrupoSelId(grupoParam || (data[0]?.id ? String(data[0].id) : ''))
    })
  }, [])

  useEffect(() => { if (grupoParam) setGrupoSelId(grupoParam) }, [grupoParam])

  useEffect(() => {
    if (!grupoSelId) { setAsignaturas([]); return }
    getAsignaturas(Number(grupoSelId)).then(d => {
      setAsignaturas(d)
      const pedida = asigParam ? Number(asigParam) : null
      setAsignaturaId(prev =>
        (pedida && d.some(a => a.id === pedida)) ? pedida
        : (prev && d.some(a => a.id === prev)) ? prev
        : (d[0]?.id ?? null))
    })
  }, [grupoSelId, asigParam])

  // Al cambiar de área, la unidad activa deja de tener sentido:
  // conservarla dejaba la matriz vacía sin explicar por qué.
  useEffect(() => {
    if (!asignaturaId) { setUnidades([]); setUnidadId(null); return }
    getUnidades(asignaturaId).then(us => {
      setUnidades(us)
      const pedida = unidadParam ? Number(unidadParam) : null
      setUnidadId(pedida && us.some(u => u.id === pedida) ? pedida : null)
    })
  }, [asignaturaId, unidadParam])

  // Criterios del currículo (servidor) — cacheados por área/curso
  useEffect(() => {
    const asig = asignaturas.find(a => a.id === asignaturaId)
    const grupo = grupos.find(g => String(g.id) === grupoSelId)
    if (!asig || !grupo) { setCriterios([]); return }

    const cursoNorm = String(grupo.curso).replace('º', '').replace('ª', '') + 'º'
    const url = `/api/curriculum/criterios?asignatura=${encodeURIComponent(asig.nombre)}&curso=${cursoNorm}&etapa=${grupo.etapa}&comunidad=${encodeURIComponent(asig.comunidad || grupo.comunidad)}`

    fetch(api(url), { headers: headers() })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((all: Criterio[]) => { setCriterios(Array.isArray(all) ? all : []); setErrorCurriculo(false) })
      .catch(() => { setCriterios([]); setErrorCurriculo(true) })
  }, [asignaturaId, asignaturas, grupoSelId, grupos])

  // Matriz local
  useEffect(() => {
    if (!asignaturaId) { setMatriz(null); return }
    setCargando(true)
    getMatrizEvaluacion(asignaturaId, unidadId, trimestre)
      .then(m => { setMatriz(m); setCargando(false) })
      .catch(() => setCargando(false))
  }, [asignaturaId, unidadId, trimestre, refresco])

  // ── Derivados ─────────────────────────────────────────────────────────

  const columnas = useMemo(() => {
    if (!matriz) return []
    if (matriz.criteriosDeUnidad) {
      return criterios.filter(c => matriz.criteriosDeUnidad!.has(c.id))
    }
    return criterios
  }, [criterios, matriz])

  const alumnos: Alumno[] = matriz?.alumnos ?? []
  const asigActual = asignaturas.find(a => a.id === asignaturaId)
  const unidadActual = unidades.find(u => u.id === unidadId)

  // Dos motivos distintos para que una casilla salga rayada, y el docente
  // arregla cada uno en un sitio: uno en la programación, el otro cambiando
  // de pestaña de trimestre.
  const sinInstrumento = useMemo(() => {
    if (!matriz) return 0
    return columnas.filter(c =>
      !(matriz.porCriterio.get(c.id)?.length) && !matriz.criteriosFueraDeTrimestre.has(c.id)
    ).length
  }, [columnas, matriz])

  const fueraDeTrimestre = useMemo(() => {
    if (!matriz) return 0
    return columnas.filter(c => matriz.criteriosFueraDeTrimestre.has(c.id)).length
  }, [columnas, matriz])

  const notaCelda = (alumnoId: number, criterioId: string, instrs: CeldaInstrumento[]) => {
    if (!matriz || !instrs.length) return null
    // Con varios instrumentos, la celda muestra la media ponderada de los que tengan nota
    let suma = 0, pesos = 0
    for (const ins of instrs) {
      const c = matriz.calificaciones[`${alumnoId}:${criterioId}:${ins.instrumento_id}:${trimestre}`]
      if (c?.valor == null) continue
      const p = ins.peso > 0 ? ins.peso : 1
      suma += c.valor * p
      pesos += p
    }
    return pesos > 0 ? Math.round((suma / pesos) * 10) / 10 : null
  }

  // ── Estados vacíos ────────────────────────────────────────────────────

  if (grupos.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>👥</div>
        <p style={{ color: 'var(--gris-600)', marginBottom: 16 }}>
          Todavía no tienes ninguna clase. Créala y podrás evaluar.
        </p>
        <Link to="/grupos/nuevo" className="btn-primary" style={{ padding: '10px 20px', borderRadius: 8, background: 'var(--azul-700)', color: 'white', fontWeight: 600 }}>
          Crear mi primera clase →
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Calificador</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={grupoSelId} onChange={e => setGrupoSelId(e.target.value)} style={{ minWidth: 120 }}>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
          <select value={trimestre} onChange={e => setTrimestre(Number(e.target.value))}>
            <option value={1}>1er trimestre</option>
            <option value={2}>2º trimestre</option>
            <option value={3}>3er trimestre</option>
          </select>
          {asignaturaId && (
            <button className="btn-secondary" style={{ fontSize: 13 }}
              onClick={() => setManagerAbierto(true)}
              title="Gestionar instrumentos: nombre, tipo, peso, trimestres y rúbrica">
              ⚙ Instrumentos
            </button>
          )}
        </div>
      </div>

      {/* Sin áreas configuradas */}
      {asignaturas.length === 0 ? (
        <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>📚</div>
          <strong style={{ display: 'block', marginBottom: 6, color: 'var(--gris-900)' }}>
            Esta clase aún no tiene áreas
          </strong>
          Elige las áreas que impartes y aparecerán aquí como pestañas, cada una con sus criterios LOMLOE.{' '}
          <Link to={`/grupos/${grupoSelId}`} style={{ color: 'var(--azul-500)', fontWeight: 600 }}>
            Elegir áreas →
          </Link>
        </div>
      ) : (
        <>
          {/* Pestañas de área */}
          <div className="tabs-area" role="tablist" aria-label="Áreas">
            {asignaturas.map(a => (
              <button key={a.id} role="tab" aria-selected={a.id === asignaturaId}
                className={`tab-area${a.id === asignaturaId ? ' activa' : ''}`}
                onClick={() => setAsignaturaId(a.id)}>
                {a.nombre_display}
              </button>
            ))}
          </div>

          {/* Subpestañas de unidad */}
          {unidades.length > 0 ? (
            <div className="tabs-unidad" role="tablist" aria-label="Unidades de la programación">
              <button role="tab" aria-selected={unidadId === null}
                className={`tab-unidad${unidadId === null ? ' activa' : ''}`}
                onClick={() => setUnidadId(null)}>
                Todo el curso
                <span className="trim">{criterios.length} criterios</span>
              </button>
              {unidades.map(u => (
                <button key={u.id} role="tab" aria-selected={u.id === unidadId}
                  className={`tab-unidad${u.id === unidadId ? ' activa' : ''}`}
                  onClick={() => setUnidadId(u.id!)}
                  title={u.descripcion || u.nombre}>
                  {u.nombre}
                  <span className="trim">{u.trimestre ? `T${u.trimestre}` : ''} · {u.criterios.length}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="card" style={{ margin: '14px 0', padding: '14px 18px', fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', boxShadow: 'none' }}>
              <strong>Esta área no tiene programación todavía.</strong>{' '}
              Sin unidades puedes calificar sobre todos los criterios, pero no sabrás con qué instrumento evaluar cada uno.{' '}
              <Link to={`/grupos/${grupoSelId}`} style={{ color: 'var(--azul-500)', fontWeight: 600 }}>
                Montar la programación →
              </Link>
            </div>
          )}

          {/* Avisos */}
          {errorCurriculo && (
            <div className="card" style={{ padding: 18, background: 'var(--ambar-100)', color: 'var(--ambar-500)', marginBottom: 12, boxShadow: 'none' }}>
              ⚠️ No se ha podido cargar el currículo del servidor. Comprueba la conexión —
              tus calificaciones están a salvo en este dispositivo.
            </div>
          )}

          {sinInstrumento > 0 && (
            <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 7, fontSize: 12.5, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
              <strong>{sinInstrumento} criterio{sinInstrumento !== 1 ? 's' : ''} sin instrumento</strong> — salen rayados.
              Asígnales uno en la programación y podrás evaluarlos.{' '}
              <Link to={`/grupos/${grupoSelId}`} style={{ color: 'var(--azul-500)', fontWeight: 700 }}>
                Ir a la programación →
              </Link>
            </div>
          )}

          {fueraDeTrimestre > 0 && (
            <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 7, fontSize: 12.5, background: 'var(--azul-100)', border: '1px solid var(--azul-500)', color: 'var(--azul-700)' }}>
              <strong>{fueraDeTrimestre} criterio{fueraDeTrimestre !== 1 ? 's' : ''} no se evalúa{fueraDeTrimestre !== 1 ? 'n' : ''} en el {trimestre}º trimestre</strong> —
              su instrumento está configurado para otros. No hay nada que arreglar:
              cambia de trimestre o edita el instrumento en <strong>⚙ Instrumentos</strong>.
            </div>
          )}

          {cargando && <p style={{ color: 'var(--gris-600)' }}>Cargando calificador…</p>}

          {/* Matriz */}
          {!cargando && matriz && (
            alumnos.length === 0 ? (
              <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
                Esta clase todavía no tiene alumnado.{' '}
                <Link to={`/alumnos?grupo_id=${grupoSelId}`} style={{ color: 'var(--azul-500)', fontWeight: 600 }}>
                  Añadir alumnado →
                </Link>
              </div>
            ) : columnas.length === 0 ? (
              <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
                {unidadId
                  ? 'Esta unidad no tiene criterios vinculados. Añádeselos desde la programación.'
                  : 'No hay criterios disponibles para esta área en el currículo de tu comunidad.'}
              </div>
            ) : (
              <div className="matriz-wrap">
                <table className="matriz">
                  <thead>
                    <tr>
                      <th className="col-alumno" scope="col">
                        Alumno
                        <div style={{ fontSize: 10, fontWeight: 400, opacity: .7, marginTop: 2 }}>
                          {alumnos.length} · {columnas.length} criterios
                        </div>
                      </th>
                      {columnas.map(cr => {
                        const instrs = matriz.porCriterio.get(cr.id) ?? []
                        return (
                          <th key={cr.id} scope="col" title={cr.descripcion}>
                            <div className="criterio-th-id">{cr.id}</div>
                            <div className="criterio-th-desc">{cr.descripcion}</div>
                            <div className="criterio-th-instr">
                              {instrs.length === 0
                                ? <span className="aviso" title="Sin instrumento asignado en la programación">⚠</span>
                                : instrs.map(i => (
                                    <i key={i.instrumento_id}
                                      style={{ background: getInstrConfig(i.tipo).color }}
                                      title={`${i.nombre} · ${getInstrConfig(i.tipo).label} · ${i.peso}%`} />
                                  ))}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {alumnos.map((al, idx) => (
                      <tr key={al.id}>
                        <td className="col-alumno">
                          {al.apellidos}, {al.nombre}
                          {al.neae ? <span style={{ marginLeft: 6, fontSize: 9.5, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
                        </td>
                        {columnas.map(cr => {
                          const instrs = matriz.porCriterio.get(cr.id) ?? []
                          const valor = notaCelda(al.id!, cr.id, instrs)
                          const nEvid = matriz.evidencias.get(`${al.id}:${cr.id}`) ?? 0
                          const sinInstr = instrs.length === 0

                          return (
                            <td key={cr.id} className="celda">
                              <button
                                className={`celda-btn ${sinInstr ? 'sin-instrumento' : claseNota(valor)}`}
                                onClick={() => setCelda({ alumnoIdx: idx, criterio: cr })}
                                title={sinInstr
                                  ? `${cr.id} — sin instrumento asignado. Pulsa para saber cómo arreglarlo.`
                                  : `${al.apellidos}, ${al.nombre} · ${cr.id}\nSe evalúa con: ${instrs.map(i => i.nombre).join(', ')}${valor != null ? `\nNota: ${valor}` : '\nSin calificar'}`}
                              >
                                {sinInstr ? (
                                  <span>sin instr.</span>
                                ) : (
                                  <>
                                    <span>{valor == null ? '·' : valor}</span>
                                    <span className="celda-instr">
                                      {instrs.map(i => (
                                        <i key={i.instrumento_id}
                                          style={{ background: getInstrConfig(i.tipo).color }} />
                                      ))}
                                      {nEvid > 0 && <b title={`${nEvid} evidencia(s) adjunta(s)`}>{nEvid}</b>}
                                    </span>
                                  </>
                                )}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Leyenda */}
          {!cargando && matriz && columnas.length > 0 && alumnos.length > 0 && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, fontSize: 11.5, color: 'var(--gris-600)', alignItems: 'center' }}>
              <span>Pulsa una casilla para evaluar.</span>
              {[10, 8, 6, 5, 3].map(v => {
                const c = calificativo(v)
                return (
                  <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 13, height: 13, borderRadius: 3, background: c.color, display: 'inline-block' }} />
                    {c.etiqueta}
                  </span>
                )
              })}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'inline-flex', gap: 2 }}>
                  <i style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gris-500)', display: 'inline-block' }} />
                </span>
                cada punto es un instrumento
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <b style={{ fontSize: 11 }}>2</b> evidencias adjuntas
              </span>
            </div>
          )}
        </>
      )}

      {/* Panel de evaluación de una celda */}
      {celda && matriz && (() => {
        const al = alumnos[celda.alumnoIdx]
        if (!al) return null
        const instrs = matriz.porCriterio.get(celda.criterio.id) ?? []

        if (instrs.length === 0) {
          const soloOtroTrimestre = matriz.criteriosFueraDeTrimestre.has(celda.criterio.id)
          return (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setCelda(null) }}>
              <div className="card" style={{ width: 'min(460px, 94vw)', padding: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: soloOtroTrimestre ? 'var(--azul-700)' : 'var(--ambar-500)', marginBottom: 10 }}>
                  {soloOtroTrimestre
                    ? `${celda.criterio.id} no se evalúa en el ${trimestre}º trimestre`
                    : `⚠️ ${celda.criterio.id} no tiene instrumento`}
                </h2>
                <p style={{ fontSize: 13.5, color: 'var(--gris-600)', lineHeight: 1.6, marginBottom: 8 }}>
                  {celda.criterio.descripcion}
                </p>
                <p style={{ fontSize: 13.5, color: 'var(--gris-600)', lineHeight: 1.6, marginBottom: 18 }}>
                  {soloOtroTrimestre
                    ? 'Sí tiene instrumento asignado, pero está configurado para otros trimestres. Cambia de trimestre para calificarlo, o edita en qué trimestres se usa desde ⚙ Instrumentos.'
                    : 'Tu programación no dice todavía con qué se evalúa este criterio. Asígnale un instrumento (prueba, rúbrica, observación…) y la casilla quedará lista para calificar.'}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link to={`/grupos/${grupoSelId}`} className="btn-primary"
                    style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--azul-700)', color: 'white', fontWeight: 600, fontSize: 13.5 }}>
                    Ir a la programación →
                  </Link>
                  <button className="btn-secondary" onClick={() => setCelda(null)}>Cerrar</button>
                </div>
              </div>
            </div>
          )
        }

        return (
          <CeldaEvaluacion
            alumno={al}
            criterio={celda.criterio}
            instrumentos={instrs}
            grupo={matriz.grupo}
            asig={matriz.asig}
            trimestre={trimestre}
            unidadId={unidadId}
            unidadNombre={unidadActual?.nombre}
            posicion={`${celda.alumnoIdx + 1}/${alumnos.length}`}
            onGuardado={() => setRefresco(r => r + 1)}
            onCerrar={() => setCelda(null)}
            onAnterior={celda.alumnoIdx > 0
              ? () => setCelda(c => c && { ...c, alumnoIdx: c.alumnoIdx - 1 })
              : undefined}
            onSiguiente={celda.alumnoIdx < alumnos.length - 1
              ? () => setCelda(c => c && { ...c, alumnoIdx: c.alumnoIdx + 1 })
              : undefined}
          />
        )
      })()}

      {managerAbierto && asigActual && (
        <InstrumentosManager
          asignaturaId={asigActual.id}
          asignaturaNombre={asigActual.nombre_display}
          nivel={`${grupos.find(g => String(g.id) === grupoSelId)?.curso}º ${grupos.find(g => String(g.id) === grupoSelId)?.etapa}`}
          onClose={() => { setManagerAbierto(false); setRefresco(r => r + 1) }}
        />
      )}
    </>
  )
}
