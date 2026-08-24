/**
 * Panel de evaluación rápida táctil: se abre tras escanear el QR de la mesa
 * de un alumno (o al tocarlo en el plano de clase). Pensado para tablet:
 * botones grandes, guardado inmediato, evidencia fotográfica en un toque.
 *
 * Al igual que el calificador, obedece a la programación: al elegir un
 * criterio se ofrece el instrumento que la programación le ha asignado,
 * no una lista suelta de instrumentos del área.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getGruposDeAlumno, getAsignaturas, getInstrumentos, getUnidades,
  getRubrica, getCalificacionUnica, saveCalificaciones,
  crearEvidencia, contarEvidenciasAlumno,
  getMapaCriterioInstrumento, getMapaCriterioInstrumentoAsignatura,
  type UnidadConCriterios,
} from '@/db/queries'
import { nivelANota, calificativo } from '@/db/calculo'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import { api } from '@/api'
import type { Alumno, Grupo, Asignatura, Instrumento } from '@/db/localDb'
import InstrumentosManager from './InstrumentosManager'
import CapturaEvidencia, { type EvidenciaCapturada } from './CapturaEvidencia'
import { trimestreActual, aplicaEnTrimestre } from '@/db/calculo'

type Criterio = { id: string; descripcion: string }
type NivelRubrica = { nombre: string; valor: number; descripcion?: string }

const CFG_KEY = 'miclase_evalrapida_cfg'

function leerCfg(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') } catch { return {} }
}

interface Props {
  alumno: Alumno
  onCerrar: () => void
  onSiguiente?: () => void
}

export default function EvaluacionRapida({ alumno, onCerrar, onSiguiente }: Props) {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupo, setGrupo] = useState<Grupo | null>(null)
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([])
  const [asignaturaId, setAsignaturaId] = useState<number | null>(null)
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  const [unidades, setUnidades] = useState<UnidadConCriterios[]>([])
  const [unidadId, setUnidadId] = useState<number | null>(null)
  const [trimestre, setTrimestre] = useState<number>(() => leerCfg().trimestre || trimestreActual())
  const [criterios, setCriterios] = useState<Criterio[]>([])
  const [criterioId, setCriterioId] = useState<string>('')
  const [mapaInstr, setMapaInstr] = useState<Map<string, { instrumento_id: number; peso: number }[]>>(new Map())
  const [instrumentoId, setInstrumentoId] = useState<number | null>(null)
  const [niveles, setNiveles] = useState<NivelRubrica[]>([])
  const [valorActual, setValorActual] = useState<number | null>(null)
  const [observacion, setObservacion] = useState('')
  const [nEvidencias, setNEvidencias] = useState(0)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [managerAbierto, setManagerAbierto] = useState(false)
  const [refrescoInstr, setRefrescoInstr] = useState(0)

  const asig = asignaturas.find(a => a.id === asignaturaId) || null
  const instrById = useMemo(() => new Map(instrumentos.map(i => [i.id!, i])), [instrumentos])

  // Instrumentos que la programación asigna al criterio elegido, filtrados por
  // el trimestre en curso igual que en el calificador: si los dos sitios no
  // aplican la misma regla, la misma casilla ofrece instrumentos distintos
  // según por dónde se entre.
  // Sin programación, se ofrecen todos los del área para no bloquear.
  const instrumentosDelCriterio = useMemo(() => {
    const asignados = (mapaInstr.get(criterioId) || [])
      .map(x => instrById.get(x.instrumento_id))
      .filter((i): i is Instrumento => !!i)
      .filter(i => aplicaEnTrimestre(i.trimestres, trimestre))
    const sueltos = instrumentos.filter(i => aplicaEnTrimestre(i.trimestres, trimestre))
    return { lista: asignados.length ? asignados : sueltos, segunProgramacion: asignados.length > 0 }
  }, [mapaInstr, criterioId, instrById, instrumentos, trimestre])

  const instrumentoSel = instrumentosDelCriterio.lista.find(i => i.id === instrumentoId) || null

  // 1) Grupos del alumno → grupo activo (preferir el de la última configuración)
  useEffect(() => {
    getGruposDeAlumno(alumno.id!).then(gs => {
      setGrupos(gs)
      const cfg = leerCfg()
      setGrupo(gs.find(g => g.id === cfg.grupo_id) || gs[0] || null)
    })
    contarEvidenciasAlumno(alumno.id!).then(setNEvidencias)
  }, [alumno.id])

  // 2) Áreas del grupo
  useEffect(() => {
    if (!grupo?.id) { setAsignaturas([]); setAsignaturaId(null); return }
    getAsignaturas(grupo.id).then(d => {
      setAsignaturas(d)
      const cfg = leerCfg()
      setAsignaturaId((d.find(a => a.id === cfg.asignatura_id) || d[0])?.id ?? null)
    })
  }, [grupo?.id])

  // 3) Instrumentos y unidades del área
  useEffect(() => {
    if (!asignaturaId) { setInstrumentos([]); setUnidades([]); return }
    const cfg = leerCfg()
    getInstrumentos(asignaturaId).then(setInstrumentos)
    getUnidades(asignaturaId).then(us => {
      setUnidades(us)
      setUnidadId(us.some(u => u.id === cfg.unidad_id) ? cfg.unidad_id : null)
    })
  }, [asignaturaId, refrescoInstr])

  // 4) Mapa criterio → instrumento, según la unidad activa
  useEffect(() => {
    if (!asignaturaId) { setMapaInstr(new Map()); return }
    const p = unidadId
      ? getMapaCriterioInstrumento(unidadId)
      : getMapaCriterioInstrumentoAsignatura(asignaturaId)
    p.then(m => setMapaInstr(m as Map<string, { instrumento_id: number; peso: number }[]>))
  }, [asignaturaId, unidadId, refrescoInstr])

  // 5) Criterios del currículo, filtrados por la unidad activa
  useEffect(() => {
    if (!asig || !grupo) { setCriterios([]); return }
    const cursoNorm = String(grupo.curso).replace('º', '').replace('ª', '') + 'º'
    const url = `/api/curriculum/criterios?asignatura=${encodeURIComponent(asig.nombre)}&curso=${cursoNorm}&etapa=${grupo.etapa}&comunidad=${encodeURIComponent(asig.comunidad || grupo.comunidad)}`
    fetch(api(url))
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((all: Criterio[]) => {
        const lista = Array.isArray(all) ? all : []
        if (unidadId) {
          const u = unidades.find(u => u.id === unidadId)
          const ids = new Set((u?.criterios || []).map(c => c.criterio_id))
          const filtrados = lista.filter(c => ids.has(c.id))
          setCriterios(filtrados.length ? filtrados : lista)
        } else {
          setCriterios(lista)
        }
      })
      .catch(() => setCriterios([]))
  }, [asig?.id, unidadId, unidades])

  // Criterio por defecto al cambiar la lista
  useEffect(() => {
    setCriterioId(prev => criterios.some(c => c.id === prev) ? prev : (criterios[0]?.id || ''))
  }, [criterios])

  // Instrumento por defecto al cambiar de criterio
  useEffect(() => {
    const lista = instrumentosDelCriterio.lista
    setInstrumentoId(prev => (prev && lista.some(i => i.id === prev)) ? prev : (lista[0]?.id ?? null))
  }, [criterioId, instrumentosDelCriterio.lista])

  // Rúbrica del instrumento elegido
  useEffect(() => {
    if (!instrumentoId) { setNiveles([]); return }
    getRubrica(instrumentoId).then(r => {
      if (!r) { setNiveles([]); return }
      try {
        const nvs = JSON.parse(r.niveles_json) as NivelRubrica[]
        setNiveles(nvs.filter(n => typeof n.valor === 'number'))
      } catch { setNiveles([]) }
    })
  }, [instrumentoId])

  // Nota ya registrada
  useEffect(() => {
    if (!instrumentoId || !criterioId) { setValorActual(null); return }
    getCalificacionUnica(alumno.id!, instrumentoId, criterioId, trimestre)
      .then(c => { setValorActual(c?.valor ?? null); setObservacion(c?.observacion ?? '') })
  }, [alumno.id, instrumentoId, criterioId, trimestre])

  // Recordar la configuración para el siguiente escaneo
  useEffect(() => {
    if (!grupo || !asignaturaId) return
    localStorage.setItem(CFG_KEY, JSON.stringify({
      grupo_id: grupo.id, asignatura_id: asignaturaId, unidad_id: unidadId, trimestre,
    }))
  }, [grupo?.id, asignaturaId, unidadId, trimestre])

  const guardarNota = async (valor: number) => {
    if (!asig || !grupo || !instrumentoId || !criterioId) return
    setGuardando(true)
    try {
      await saveCalificaciones([{
        alumno_id: alumno.id!, instrumento_id: instrumentoId, criterio_id: criterioId,
        asignatura: asig.nombre, curso: grupo.curso, etapa: grupo.etapa,
        comunidad: asig.comunidad || grupo.comunidad, trimestre,
        valor, observacion: observacion.trim() || null, unidad_id: unidadId,
      }])
      setValorActual(valor)
      setMsg({ tipo: 'ok', texto: `${valor} guardado en ${criterioId}` })
      setTimeout(() => setMsg(null), 2200)
    } catch {
      setMsg({ tipo: 'error', texto: 'No se pudo guardar la nota' })
    } finally { setGuardando(false) }
  }

  const guardarEvidencia = async (ev: EvidenciaCapturada) => {
    setGuardando(true)
    try {
      await crearEvidencia({
        alumno_id: alumno.id!, asignatura_id: asignaturaId, criterio_id: criterioId || null,
        instrumento_id: instrumentoId, unidad_id: unidadId, trimestre,
        tipo: ev.tipo, mime: ev.mime, blob: ev.blob, duracion_ms: ev.duracion_ms ?? null,
        descripcion: observacion.trim() || undefined,
      })
      setNEvidencias(n => n + 1)
      const nombre = ev.tipo === 'foto' ? 'Foto' : ev.tipo === 'audio' ? 'Audio' : 'Vídeo'
      setMsg({ tipo: 'ok', texto: `${nombre} guardado como evidencia` })
      setTimeout(() => setMsg(null), 2200)
    } catch {
      setMsg({ tipo: 'error', texto: 'No se pudo guardar la evidencia' })
    } finally { setGuardando(false) }
  }

  const criterioSel = criterios.find(c => c.id === criterioId)
  const cal = calificativo(valorActual)

  return (
    <div className="card" style={{ maxWidth: 760 }}>
      {/* Cabecera con el alumno */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--azul-900)' }}>
            {alumno.apellidos}, {alumno.nombre}
            {alumno.neae ? <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
          </div>
          <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>
            {grupo ? `${grupo.nombre} · ${grupo.curso_escolar}` : 'Sin clase activa'}
            {nEvidencias > 0 && ` · ${nEvidencias} evidencia${nEvidencias !== 1 ? 's' : ''}`}
          </div>
        </div>
        <button onClick={onCerrar} className="modal-close" aria-label="Cerrar panel">✕</button>
      </div>

      {grupos.length === 0 && (
        <div style={{ padding: 16, background: 'var(--ambar-100)', borderRadius: 8, fontSize: 13, color: 'var(--ambar-500)' }}>
          Este alumno no pertenece a ninguna clase activa.
        </div>
      )}

      {grupo && (
        <>
          {/* Configuración — se recuerda entre escaneos */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {grupos.length > 1 && (
              <select value={grupo.id} onChange={e => setGrupo(grupos.find(g => g.id === Number(e.target.value)) || null)}>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            )}
            <select value={asignaturaId ?? ''} onChange={e => setAsignaturaId(Number(e.target.value) || null)}>
              {asignaturas.length === 0 && <option value="">Sin áreas</option>}
              {asignaturas.map(a => <option key={a.id} value={a.id}>{a.nombre_display}</option>)}
            </select>
            {unidades.length > 0 && (
              <select value={unidadId ?? ''} onChange={e => setUnidadId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Todos los criterios</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            )}
            <select value={trimestre} onChange={e => setTrimestre(Number(e.target.value))}>
              <option value={1}>1er trim.</option>
              <option value={2}>2º trim.</option>
              <option value={3}>3er trim.</option>
            </select>
            <button onClick={() => setManagerAbierto(true)} className="btn-secondary"
              title="Gestionar instrumentos de esta área" aria-label="Gestionar instrumentos"
              style={{ fontSize: 13, padding: '6px 10px' }}>⚙</button>
          </div>

          {/* Criterios */}
          {criterios.length > 0 ? (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {criterios.map(c => {
                  const conInstr = (mapaInstr.get(c.id) || []).length > 0
                  const activo = criterioId === c.id
                  return (
                    <button key={c.id} onClick={() => setCriterioId(c.id)} title={c.descripcion}
                      style={{
                        padding: '8px 12px', borderRadius: 18, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        border: '2px solid', minHeight: 42,
                        borderColor: activo ? 'var(--azul-700)' : conInstr ? 'var(--gris-300)' : '#fed7aa',
                        background: activo ? 'var(--azul-700)' : 'white',
                        color: activo ? 'white' : conInstr ? 'var(--gris-600)' : '#b45309',
                      }}>
                      {c.id}
                      {!conInstr && <span style={{ marginLeft: 4, fontSize: 10 }}>⚠</span>}
                    </button>
                  )
                })}
              </div>
              {criterioSel && (
                <div style={{ fontSize: 12.5, color: 'var(--gris-600)', marginBottom: 12, lineHeight: 1.5 }}>
                  {criterioSel.descripcion}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 12 }}>
              No hay criterios disponibles (¿sin conexión con el servidor de currículo?).
              Puedes guardar evidencias igualmente.
            </div>
          )}

          {/* Instrumento que la programación asigna a este criterio */}
          {criterioId && (
            instrumentosDelCriterio.lista.length > 0 ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                  {instrumentosDelCriterio.segunProgramacion
                    ? 'Se evalúa con'
                    : 'Sin instrumento en la programación — elige uno'}
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {instrumentosDelCriterio.lista.map(ins => {
                    const c = getInstrConfig(ins.tipo)
                    const activo = ins.id === instrumentoId
                    return (
                      <button key={ins.id} onClick={() => setInstrumentoId(ins.id!)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px',
                          borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, minHeight: 46,
                          background: activo ? c.color : c.bg,
                          color: activo ? 'white' : c.color,
                          border: `2px solid ${activo ? c.color : 'transparent'}`,
                        }}>
                        <span style={{ fontSize: 17 }}>{c.icon}</span>{ins.nombre}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 12.5, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                Esta área no tiene instrumentos de evaluación todavía.{' '}
                <button onClick={() => setManagerAbierto(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--azul-500)', fontWeight: 700, cursor: 'pointer', fontSize: 12.5, padding: 0, textDecoration: 'underline' }}>
                  Crear uno ahora →
                </button>
              </div>
            )
          )}

          {/* Nota actual */}
          {instrumentoId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 12.5, color: 'var(--gris-600)' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 40, height: 30, borderRadius: 7, fontWeight: 800, fontSize: 15,
                background: valorActual == null ? 'var(--gris-100)' : cal.color,
                color: valorActual == null ? 'var(--gris-500)' : 'white',
              }}>
                {valorActual == null ? '—' : valorActual}
              </span>
              {valorActual == null
                ? <>Sin calificar con <strong>{instrumentoSel?.nombre}</strong></>
                : <>{cal.etiqueta} con <strong>{instrumentoSel?.nombre}</strong></>}
            </div>
          )}

          {/* Niveles de rúbrica repartidos de 0 a 10 de extremo a extremo */}
          {niveles.length > 0 && criterioId && (() => {
            const valores = niveles.map(n => n.valor)
            const maxNivel = Math.max(...valores)
            const minNivel = Math.min(...valores)
            return (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {niveles.map(n => {
                  const nota = nivelANota(n.valor, maxNivel, minNivel)
                  const activo = valorActual === nota
                  return (
                    <button key={n.nombre} onClick={() => guardarNota(nota)} disabled={guardando}
                      title={n.descripcion}
                      style={{
                        flex: '1 1 120px', minHeight: 54, borderRadius: 10, fontSize: 14, fontWeight: 700,
                        cursor: 'pointer',
                        border: `2px solid ${activo ? 'var(--azul-900)' : 'var(--azul-300)'}`,
                        background: activo ? 'var(--azul-700)' : 'var(--azul-100)',
                        color: activo ? 'white' : 'var(--azul-900)',
                      }}>
                      {n.nombre}<br /><span style={{ fontSize: 12, fontWeight: 500 }}>→ {nota}</span>
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* Teclado de notas 0-10 */}
          {criterioId && instrumentoId && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 6, marginBottom: 12 }}>
              {Array.from({ length: 11 }, (_, v) => (
                <button key={v} onClick={() => guardarNota(v)} disabled={guardando}
                  className={`cal-${v}`}
                  style={{
                    minHeight: 52, borderRadius: 10, fontSize: 17, fontWeight: 800, cursor: 'pointer',
                    border: valorActual === v ? '3px solid var(--gris-900)' : '2px solid transparent',
                  }}>
                  {v}
                </button>
              ))}
            </div>
          )}

          {/* Observación + evidencia */}
          <div style={{ marginBottom: 12 }}>
            <input value={observacion} onChange={e => setObservacion(e.target.value)}
              placeholder="Observación (se adjunta a la próxima nota o evidencia)…"
              style={{ width: '100%', minHeight: 44, marginBottom: 8 }} />
            <CapturaEvidencia onCapturada={guardarEvidencia} deshabilitado={guardando} />
          </div>

          {msg && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600, marginBottom: 12,
              background: msg.tipo === 'ok' ? 'var(--verde-100)' : 'var(--rojo-100)',
              color: msg.tipo === 'ok' ? 'var(--verde-500)' : 'var(--rojo-500)',
            }}>
              {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
            </div>
          )}

          {asignaturas.length === 0 && (
            <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 12.5, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 12 }}>
              Esta clase no tiene áreas configuradas.{' '}
              <Link to={`/grupos/${grupo.id}`} style={{ color: 'var(--azul-500)', fontWeight: 700 }}>Configurarla →</Link>
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {onSiguiente && (
          <button className="btn-primary" onClick={onSiguiente} style={{ minHeight: 48, fontSize: 15, flex: 1 }}>
            📷 Escanear siguiente
          </button>
        )}
        <button className="btn-secondary" onClick={onCerrar} style={{ minHeight: 48 }}>Cerrar</button>
      </div>

      {managerAbierto && asig && grupo && (
        <InstrumentosManager
          asignaturaId={asig.id!}
          asignaturaNombre={asig.nombre_display}
          nivel={`${grupo.curso}º ${grupo.etapa}`}
          onClose={() => { setManagerAbierto(false); setRefrescoInstr(k => k + 1) }}
        />
      )}
    </div>
  )
}
