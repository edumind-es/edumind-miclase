/**
 * Panel de una celda de la matriz: alumno × criterio.
 *
 * Es la respuesta a «al pulsar la casilla quiero saber con qué se evalúa».
 * No pide una nota en abstracto: muestra el criterio completo, el instrumento
 * (o instrumentos) que la programación le ha asignado, su rúbrica si la tiene,
 * y solo entonces la nota. Además deja adjuntar la evidencia en el momento.
 */
import { useEffect, useRef, useState } from 'react'
import {
  getRubrica, getCalificacionUnica, saveCalificaciones,
  crearEvidencia, comprimirImagen, getEvidenciasAlumno, eliminarEvidencia,
  type CeldaInstrumento,
} from '@/db/queries'
import { nivelANota, calificativo } from '@/db/calculo'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import type { Alumno, Asignatura, Grupo, Evidencia } from '@/db/localDb'

type NivelRubrica = { nombre: string; valor: number; descripcion?: string }

interface Props {
  alumno: Alumno
  criterio: { id: string; descripcion: string }
  instrumentos: CeldaInstrumento[]
  grupo: Grupo
  asig: Asignatura
  trimestre: number
  unidadId: number | null
  unidadNombre?: string
  onGuardado: () => void
  onCerrar: () => void
  /** Navegación entre alumnos sin cerrar el panel */
  onAnterior?: () => void
  onSiguiente?: () => void
  posicion?: string
}

export default function CeldaEvaluacion({
  alumno, criterio, instrumentos, grupo, asig, trimestre, unidadId, unidadNombre,
  onGuardado, onCerrar, onAnterior, onSiguiente, posicion,
}: Props) {
  const [instrumentoId, setInstrumentoId] = useState<number | null>(instrumentos[0]?.instrumento_id ?? null)
  const [niveles, setNiveles] = useState<NivelRubrica[]>([])
  const [valorActual, setValorActual] = useState<number | null>(null)
  const [observacion, setObservacion] = useState('')
  const [evidencias, setEvidencias] = useState<Evidencia[]>([])
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)

  const instrumentoSel = instrumentos.find(i => i.instrumento_id === instrumentoId) ?? null
  const cfg = instrumentoSel ? getInstrConfig(instrumentoSel.tipo) : null

  // Al cambiar de alumno, reiniciar el instrumento al primero disponible
  useEffect(() => {
    setInstrumentoId(prev =>
      prev && instrumentos.some(i => i.instrumento_id === prev)
        ? prev
        : (instrumentos[0]?.instrumento_id ?? null))
    setObservacion('')
    setMsg(null)
  }, [alumno.id, criterio.id])

  // Rúbrica del instrumento seleccionado
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

  // Nota ya registrada + observación guardada
  useEffect(() => {
    if (!instrumentoId) { setValorActual(null); return }
    getCalificacionUnica(alumno.id!, instrumentoId, criterio.id, trimestre).then(c => {
      setValorActual(c?.valor ?? null)
      setObservacion(c?.observacion ?? '')
    })
  }, [alumno.id, instrumentoId, criterio.id, trimestre])

  // Evidencias de este alumno en este criterio
  const recargarEvidencias = () => {
    getEvidenciasAlumno(alumno.id!).then(evs =>
      setEvidencias(evs.filter(e => e.criterio_id === criterio.id)))
  }
  useEffect(recargarEvidencias, [alumno.id, criterio.id])

  // Escape cierra; flechas cambian de alumno
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCerrar(); return }
      const enCampo = (e.target as HTMLElement)?.tagName === 'INPUT' ||
                      (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      if (enCampo) return
      if (e.key === 'ArrowDown' && onSiguiente) { e.preventDefault(); onSiguiente() }
      if (e.key === 'ArrowUp' && onAnterior) { e.preventDefault(); onAnterior() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar, onSiguiente, onAnterior])

  const guardarNota = async (valor: number | null) => {
    if (!instrumentoId) return
    setGuardando(true)
    try {
      await saveCalificaciones([{
        alumno_id: alumno.id!, instrumento_id: instrumentoId, criterio_id: criterio.id,
        asignatura: asig.nombre, curso: grupo.curso, etapa: grupo.etapa,
        comunidad: asig.comunidad || grupo.comunidad, trimestre,
        valor, observacion: observacion.trim() || null, unidad_id: unidadId,
      }])
      setValorActual(valor)
      setMsg({ tipo: 'ok', texto: valor == null ? 'Nota borrada' : `${valor} guardado en ${criterio.id}` })
      setTimeout(() => setMsg(null), 2000)
      onGuardado()
    } catch {
      setMsg({ tipo: 'error', texto: 'No se pudo guardar la nota' })
    } finally { setGuardando(false) }
  }

  const capturarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setGuardando(true)
    try {
      const blob = await comprimirImagen(file)
      await crearEvidencia({
        alumno_id: alumno.id!, asignatura_id: asig.id, criterio_id: criterio.id,
        instrumento_id: instrumentoId, unidad_id: unidadId,
        trimestre, tipo: 'foto', mime: 'image/jpeg', blob,
        descripcion: observacion.trim() || undefined,
      })
      recargarEvidencias()
      setMsg({ tipo: 'ok', texto: 'Evidencia guardada 📸' })
      setTimeout(() => setMsg(null), 2000)
      onGuardado()
    } catch {
      setMsg({ tipo: 'error', texto: 'No se pudo guardar la foto' })
    } finally { setGuardando(false) }
  }

  const borrarEvidencia = async (id: number) => {
    if (!confirm('¿Eliminar esta evidencia?')) return
    await eliminarEvidencia(id)
    recargarEvidencias()
    onGuardado()
  }

  const cal = calificativo(valorActual)

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true"
        aria-label={`Evaluar ${criterio.id} de ${alumno.nombre}`}
        style={{ width: 'min(620px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}>

        {/* Cabecera: alumno + navegación */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--azul-900)' }}>
              {alumno.apellidos}, {alumno.nombre}
              {alumno.neae ? <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>
              {grupo.nombre} · {asig.nombre_display} · {trimestre}º trim.
              {unidadNombre && ` · ${unidadNombre}`}
            </div>
          </div>
          {(onAnterior || onSiguiente) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={onAnterior} disabled={!onAnterior} title="Alumno anterior (↑)"
                className="btn-secondary" style={{ padding: '4px 9px', fontSize: 13 }}>↑</button>
              {posicion && <span style={{ fontSize: 11, color: 'var(--gris-500)', minWidth: 40, textAlign: 'center' }}>{posicion}</span>}
              <button onClick={onSiguiente} disabled={!onSiguiente} title="Alumno siguiente (↓)"
                className="btn-secondary" style={{ padding: '4px 9px', fontSize: 13 }}>↓</button>
            </div>
          )}
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar">✕</button>
        </div>

        <div style={{ padding: 18 }}>
          {/* Criterio */}
          <div style={{ background: 'var(--azul-100)', borderRadius: 9, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--azul-700)', letterSpacing: '.03em', marginBottom: 3 }}>
              CRITERIO {criterio.id}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--gris-900)', lineHeight: 1.5 }}>
              {criterio.descripcion}
            </div>
          </div>

          {/* Instrumento(s) que evalúan este criterio */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 7 }}>
              Se evalúa con {instrumentos.length > 1 && `— ${instrumentos.length} instrumentos`}
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {instrumentos.map(ins => {
                const c = getInstrConfig(ins.tipo)
                const activo = ins.instrumento_id === instrumentoId
                return (
                  <button key={ins.instrumento_id} onClick={() => setInstrumentoId(ins.instrumento_id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px',
                      borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      background: activo ? c.color : c.bg,
                      color: activo ? 'white' : c.color,
                      border: `2px solid ${activo ? c.color : 'transparent'}`,
                    }}>
                    <span style={{ fontSize: 17 }}>{c.icon}</span>
                    <span>
                      {ins.nombre}
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 500, opacity: .85 }}>
                        {c.label} · {ins.peso}%{ins.tiene_rubrica ? ' · con rúbrica' : ''}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Nota actual */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: valorActual == null ? 'var(--gris-100)' : cal.color,
              color: valorActual == null ? 'var(--gris-500)' : 'white',
            }}>
              <span style={{ fontSize: 21, fontWeight: 800, lineHeight: 1 }}>
                {valorActual == null ? '—' : valorActual}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, opacity: .9 }}>{cal.sigla}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.5 }}>
              {valorActual == null
                ? <>Sin calificar con <strong>{instrumentoSel?.nombre ?? 'este instrumento'}</strong>.</>
                : <>{cal.etiqueta} con <strong>{instrumentoSel?.nombre}</strong>.</>}
              {valorActual != null && (
                <button onClick={() => guardarNota(null)} disabled={guardando}
                  style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--rojo-500)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  borrar nota
                </button>
              )}
            </div>
          </div>

          {/* Niveles de rúbrica — escala 1..max convertida a 0-10 */}
          {niveles.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Niveles de la rúbrica
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {(() => {
                  const maxNivel = Math.max(...niveles.map(n => n.valor))
                  return niveles.map(n => {
                    const nota = nivelANota(n.valor, maxNivel)
                    const activo = valorActual === nota
                    return (
                      <button key={n.nombre} onClick={() => guardarNota(nota)} disabled={guardando}
                        title={n.descripcion}
                        style={{
                          flex: '1 1 120px', minHeight: 54, borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                          cursor: 'pointer',
                          border: `2px solid ${activo ? 'var(--azul-900)' : 'var(--azul-300)'}`,
                          background: activo ? 'var(--azul-700)' : 'var(--azul-100)',
                          color: activo ? 'white' : 'var(--azul-900)',
                        }}>
                        {n.nombre}
                        <br /><span style={{ fontSize: 11, fontWeight: 500 }}>→ {nota}</span>
                      </button>
                    )
                  })
                })()}
              </div>
            </div>
          )}

          {/* Teclado 0-10 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 5, marginBottom: 14 }}>
            {Array.from({ length: 11 }, (_, v) => (
              <button key={v} onClick={() => guardarNota(v)} disabled={guardando || !instrumentoId}
                className={`cal-${v}`}
                style={{
                  minHeight: 46, borderRadius: 9, fontSize: 16, fontWeight: 800, cursor: 'pointer',
                  border: valorActual === v ? '3px solid var(--gris-900)' : '2px solid transparent',
                }}>
                {v}
              </button>
            ))}
          </div>

          {/* Observación + evidencia */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={observacion} onChange={e => setObservacion(e.target.value)}
              placeholder="Observación para este criterio…"
              onBlur={() => { if (valorActual != null) guardarNota(valorActual) }}
              style={{ flex: '1 1 220px', minHeight: 42 }} />
            <button className="btn-secondary" onClick={() => fotoRef.current?.click()} disabled={guardando}
              style={{ minHeight: 42, fontSize: 13.5, whiteSpace: 'nowrap' }}>
              📸 Evidencia
            </button>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }} onChange={capturarFoto} />
          </div>

          {evidencias.length > 0 && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
              {evidencias.map(ev => (
                <div key={ev.id} style={{ position: 'relative' }}>
                  <img src={URL.createObjectURL(ev.blob)} alt={ev.descripcion || 'Evidencia'}
                    style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--gris-300)' }} />
                  <button onClick={() => borrarEvidencia(ev.id!)} title="Eliminar evidencia"
                    style={{
                      position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                      background: 'var(--rojo-500)', color: 'white', border: '2px solid white',
                      fontSize: 11, lineHeight: 1, cursor: 'pointer', padding: 0,
                    }}>×</button>
                </div>
              ))}
            </div>
          )}

          {msg && (
            <div style={{
              padding: '9px 14px', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
              background: msg.tipo === 'ok' ? 'var(--verde-100)' : 'var(--rojo-100)',
              color: msg.tipo === 'ok' ? 'var(--verde-500)' : 'var(--rojo-500)',
            }}>
              {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--gris-500)', marginTop: 12, textAlign: 'center' }}>
            La nota se guarda al pulsarla · <kbd>↑</kbd> <kbd>↓</kbd> cambian de alumno · <kbd>Esc</kbd> cierra
          </div>
        </div>
      </div>
    </div>
  )
}
