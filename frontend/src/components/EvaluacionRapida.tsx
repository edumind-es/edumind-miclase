/**
 * Panel de evaluación rápida táctil: se abre tras escanear el QR de la mesa
 * de un alumno (o al tocarlo en el plano de clase). Pensado para tablet:
 * botones grandes, guardado inmediato, evidencia fotográfica en un toque.
 */
import { useEffect, useRef, useState } from 'react'
import {
  getGruposDeAlumno, getAsignaturas, getAsignaturaDetalle, getUnidades,
  getRubrica, getCalificacionUnica, saveCalificaciones,
  crearEvidencia, comprimirImagen, contarEvidenciasAlumno,
} from '@/db/queries'
import type { Alumno, Grupo, Asignatura, Instrumento } from '@/db/localDb'

type Criterio = { id: string; descripcion: string }
type NivelRubrica = { nombre: string; valor: number }

const CFG_KEY = 'miclase_evalrapida_cfg'

function trimestreActual(): number {
  const mes = new Date().getMonth() + 1
  return mes >= 9 ? 1 : mes <= 3 ? 2 : 3
}

function leerCfg(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') } catch { return {} }
}

interface Props {
  alumno: Alumno
  onCerrar: () => void
  onSiguiente?: () => void   // "escanear al siguiente alumno"
}

export default function EvaluacionRapida({ alumno, onCerrar, onSiguiente }: Props) {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupo, setGrupo] = useState<Grupo | null>(null)
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([])
  const [asignaturaId, setAsignaturaId] = useState<number | null>(null)
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  const [instrumentoId, setInstrumentoId] = useState<number | null>(null)
  const [unidades, setUnidades] = useState<any[]>([])
  const [unidadId, setUnidadId] = useState<string>('')
  const [trimestre, setTrimestre] = useState<number>(() => leerCfg().trimestre || trimestreActual())
  const [criterios, setCriterios] = useState<Criterio[]>([])
  const [criterioId, setCriterioId] = useState<string>('')
  const [niveles, setNiveles] = useState<NivelRubrica[]>([])
  const [valorActual, setValorActual] = useState<number | null>(null)
  const [observacion, setObservacion] = useState('')
  const [nEvidencias, setNEvidencias] = useState(0)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)

  const asig = asignaturas.find(a => a.id === asignaturaId) || null

  // 1) Grupos del alumno → grupo activo (preferir el de la última configuración)
  useEffect(() => {
    getGruposDeAlumno(alumno.id!).then(gs => {
      setGrupos(gs)
      const cfg = leerCfg()
      const preferido = gs.find(g => g.id === cfg.grupo_id) || gs[0] || null
      setGrupo(preferido)
    })
    contarEvidenciasAlumno(alumno.id!).then(setNEvidencias)
  }, [alumno.id])

  // 2) Asignaturas del grupo
  useEffect(() => {
    if (!grupo?.id) { setAsignaturas([]); setAsignaturaId(null); return }
    getAsignaturas(grupo.id).then(d => {
      setAsignaturas(d)
      const cfg = leerCfg()
      const pref = d.find(a => a.id === cfg.asignatura_id) || d[0]
      setAsignaturaId(pref?.id ?? null)
    })
  }, [grupo?.id])

  // 3) Instrumentos + unidades + criterios de la asignatura
  useEffect(() => {
    if (!asignaturaId || !grupo) { setInstrumentos([]); setCriterios([]); return }
    const cfg = leerCfg()

    getAsignaturaDetalle(asignaturaId).then(det => {
      const instrs = det?.instrumentos || []
      setInstrumentos(instrs)
      const pref = instrs.find(i => i.id === cfg.instrumento_id) || instrs[0]
      setInstrumentoId(pref?.id ?? null)
    })

    getUnidades(asignaturaId).then(us => {
      setUnidades(us)
      setUnidadId(cfg.unidad_id && us.some(u => String(u.id) === String(cfg.unidad_id)) ? String(cfg.unidad_id) : '')
    })
  }, [asignaturaId])

  // 4) Criterios del currículo (filtrados por unidad si hay una activa)
  useEffect(() => {
    if (!asig || !grupo) { setCriterios([]); return }
    const cursoNorm = grupo.curso.replace('º', '').replace('ª', '') + 'º'
    const url = `/api/curriculum/criterios?asignatura=${encodeURIComponent(asig.nombre)}&curso=${cursoNorm}&etapa=${grupo.etapa}&comunidad=${encodeURIComponent(asig.comunidad)}`
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((all: Criterio[]) => {
        if (unidadId) {
          const u = unidades.find(u => String(u.id) === unidadId)
          const ids = new Set((u?.criterios || []).map((c: any) => c.criterio_id))
          const filtrados = all.filter(c => ids.has(c.id))
          setCriterios(filtrados.length ? filtrados : all)
        } else {
          setCriterios(all)
        }
      })
      .catch(() => setCriterios([]))
  }, [asig?.id, unidadId, unidades])

  // 5) Rúbrica del instrumento → niveles como botones
  useEffect(() => {
    if (!instrumentoId) { setNiveles([]); return }
    getRubrica(instrumentoId).then(r => {
      if (!r) { setNiveles([]); return }
      try {
        const nvs = JSON.parse(r.niveles_json) as { nombre: string; valor: number }[]
        setNiveles(nvs.filter(n => typeof n.valor === 'number'))
      } catch { setNiveles([]) }
    })
  }, [instrumentoId])

  // Criterio por defecto: el primero cuando cambia la lista
  useEffect(() => {
    setCriterioId(prev => criterios.some(c => c.id === prev) ? prev : (criterios[0]?.id || ''))
  }, [criterios])

  // Nota ya registrada para la combinación seleccionada
  useEffect(() => {
    if (!instrumentoId || !criterioId) { setValorActual(null); return }
    getCalificacionUnica(alumno.id!, instrumentoId, criterioId, trimestre)
      .then(c => setValorActual(c?.valor ?? null))
  }, [alumno.id, instrumentoId, criterioId, trimestre])

  // Recordar la configuración para el siguiente escaneo
  useEffect(() => {
    if (!grupo || !asignaturaId) return
    localStorage.setItem(CFG_KEY, JSON.stringify({
      grupo_id: grupo.id, asignatura_id: asignaturaId,
      instrumento_id: instrumentoId, unidad_id: unidadId, trimestre,
    }))
  }, [grupo?.id, asignaturaId, instrumentoId, unidadId, trimestre])

  const guardarNota = async (valor: number) => {
    if (!asig || !grupo || !instrumentoId || !criterioId) return
    setGuardando(true)
    try {
      await saveCalificaciones([{
        alumno_id: alumno.id!, instrumento_id: instrumentoId, criterio_id: criterioId,
        asignatura: asig.nombre, curso: grupo.curso, etapa: grupo.etapa,
        comunidad: asig.comunidad || 'Galicia', trimestre,
        valor, observacion: observacion.trim() || null,
      }])
      setValorActual(valor)
      setObservacion('')
      setMsg({ tipo: 'ok', texto: `${valor} guardado en ${criterioId}` })
      setTimeout(() => setMsg(null), 2500)
    } catch {
      setMsg({ tipo: 'error', texto: 'No se pudo guardar la nota' })
    } finally {
      setGuardando(false)
    }
  }

  const capturarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setGuardando(true)
    try {
      const blob = await comprimirImagen(file)
      await crearEvidencia({
        alumno_id: alumno.id!, asignatura_id: asignaturaId, criterio_id: criterioId || null,
        trimestre, tipo: 'foto', mime: 'image/jpeg', blob,
        descripcion: observacion.trim() || undefined,
      })
      setNEvidencias(n => n + 1)
      setMsg({ tipo: 'ok', texto: 'Evidencia guardada 📸' })
      setTimeout(() => setMsg(null), 2500)
    } catch {
      setMsg({ tipo: 'error', texto: 'No se pudo guardar la foto' })
    } finally {
      setGuardando(false)
    }
  }

  const criterioSel = criterios.find(c => c.id === criterioId)

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      {/* Cabecera con el alumno */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--azul-900)' }}>
            {alumno.apellidos}, {alumno.nombre}
            {alumno.neae ? <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
          </div>
          <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>
            {grupo ? `${grupo.nombre} · ${grupo.curso_escolar}` : 'Sin grupo activo'}
            {nEvidencias > 0 && ` · ${nEvidencias} evidencia${nEvidencias !== 1 ? 's' : ''}`}
          </div>
        </div>
        <button onClick={onCerrar} className="modal-close" aria-label="Cerrar panel">✕</button>
      </div>

      {grupos.length === 0 && (
        <div style={{ padding: 16, background: 'var(--ambar-100)', borderRadius: 8, fontSize: 13, color: 'var(--ambar-500)' }}>
          Este alumno no pertenece a ningún grupo activo.
        </div>
      )}

      {grupo && (
        <>
          {/* Configuración: se recuerda entre escaneos */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {grupos.length > 1 && (
              <select value={grupo.id} onChange={e => setGrupo(grupos.find(g => g.id === Number(e.target.value)) || null)}>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            )}
            <select value={asignaturaId ?? ''} onChange={e => setAsignaturaId(Number(e.target.value) || null)}>
              {asignaturas.length === 0 && <option value="">Sin asignaturas</option>}
              {asignaturas.map(a => <option key={a.id} value={a.id}>{a.nombre_display}</option>)}
            </select>
            <select value={instrumentoId ?? ''} onChange={e => setInstrumentoId(Number(e.target.value) || null)}>
              {instrumentos.length === 0 && <option value="">Sin instrumentos</option>}
              {instrumentos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
            {unidades.length > 0 && (
              <select value={unidadId} onChange={e => setUnidadId(e.target.value)}>
                <option value="">Todos los criterios</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            )}
            <select value={trimestre} onChange={e => setTrimestre(Number(e.target.value))}>
              <option value={1}>1er trim.</option>
              <option value={2}>2º trim.</option>
              <option value={3}>3er trim.</option>
            </select>
          </div>

          {/* Selector de criterio */}
          {criterios.length > 0 ? (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {criterios.map(c => (
                  <button key={c.id} onClick={() => setCriterioId(c.id)} title={c.descripcion}
                    style={{
                      padding: '8px 12px', borderRadius: 18, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      border: '2px solid', minHeight: 40,
                      borderColor: criterioId === c.id ? 'var(--azul-700)' : 'var(--gris-300)',
                      background: criterioId === c.id ? 'var(--azul-700)' : 'white',
                      color: criterioId === c.id ? 'white' : 'var(--gris-600)',
                    }}>
                    {c.id}
                  </button>
                ))}
              </div>
              {criterioSel && (
                <div style={{ fontSize: 12, color: 'var(--gris-600)', marginBottom: 12, lineHeight: 1.5 }}>
                  {criterioSel.descripcion}
                  {valorActual != null && (
                    <strong style={{ color: 'var(--azul-700)' }}> — Nota actual: {valorActual}</strong>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 12 }}>
              No hay criterios disponibles (¿sin conexión con el servidor de currículo?).
              Puedes guardar evidencias igualmente.
            </div>
          )}

          {/* Niveles de rúbrica si el instrumento tiene una.
              La rúbrica usa escala 1-4; se convierte proporcionalmente a 0-10
              para que "Excelente (4/4)" se guarde como 10, no como un 4. */}
          {niveles.length > 0 && criterioId && (() => {
            const maxNivel = Math.max(...niveles.map(n => n.valor))
            return (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {niveles.map(n => {
                  const nota = Math.round((n.valor / maxNivel) * 100) / 10
                  return (
                    <button key={n.nombre} onClick={() => guardarNota(nota)} disabled={guardando}
                      style={{
                        flex: '1 1 120px', minHeight: 52, borderRadius: 10, fontSize: 14, fontWeight: 700,
                        cursor: 'pointer', border: '2px solid var(--azul-300)',
                        background: 'var(--azul-100)', color: 'var(--azul-900)',
                      }}>
                      {n.nombre}<br /><span style={{ fontSize: 12, fontWeight: 500 }}>→ {nota}</span>
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* Teclado de notas 0-10 — botones grandes para dedo */}
          {criterioId && (
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 12 }}>
            <input value={observacion} onChange={e => setObservacion(e.target.value)}
              placeholder="Observación (se adjunta a la próxima nota o foto)…"
              style={{ flex: 1, minHeight: 44 }} />
            <button className="btn-secondary" onClick={() => fotoRef.current?.click()} disabled={guardando}
              style={{ minHeight: 44, fontSize: 14, whiteSpace: 'nowrap' }}>
              📸 Evidencia
            </button>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }} onChange={capturarFoto} />
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
    </div>
  )
}
