/**
 * Galería de evidencias de un alumno: fotos, audios y vídeos capturados
 * desde los paneles de evaluación. Los blobs viven en IndexedDB; aquí se
 * convierten en object URLs solo mientras la galería está abierta.
 */
import { useEffect, useMemo, useState } from 'react'
import { getEvidenciasAlumno, eliminarEvidencia } from '@/db/queries'
import { duracionLegible } from './MiniaturaEvidencia'
import type { Alumno, Evidencia, TipoEvidencia } from '@/db/localDb'

const ICONO: Record<string, string> = { foto: '📸', audio: '🎙', video: '🎬' }
const ETIQUETA: Record<string, string> = { foto: 'Fotos', audio: 'Audios', video: 'Vídeos' }
const EXTENSION: Record<string, string> = { foto: 'jpg', audio: 'webm', video: 'mp4' }

interface Props {
  alumno: Alumno
  onClose: () => void
}

type EvConUrl = Evidencia & { url: string }

export default function EvidenciasGaleria({ alumno, onClose }: Props) {
  const [evidencias, setEvidencias] = useState<EvConUrl[]>([])
  const [ampliada, setAmpliada] = useState<EvConUrl | null>(null)
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<TipoEvidencia | 'todas'>('todas')

  const porTipo = useMemo(() => {
    const r: Record<string, number> = { foto: 0, audio: 0, video: 0 }
    for (const ev of evidencias) r[ev.tipo] = (r[ev.tipo] ?? 0) + 1
    return r
  }, [evidencias])

  const visibles = filtro === 'todas' ? evidencias : evidencias.filter(e => e.tipo === filtro)

  useEffect(() => {
    let urls: string[] = []
    getEvidenciasAlumno(alumno.id!).then(evs => {
      const conUrl = evs.map(ev => ({ ...ev, url: URL.createObjectURL(ev.blob) }))
      urls = conUrl.map(e => e.url)
      setEvidencias(conUrl)
      setCargando(false)
    })
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [alumno.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ampliada ? setAmpliada(null) : onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, ampliada])

  const borrar = async (ev: EvConUrl) => {
    if (!confirm('¿Eliminar esta evidencia? No se puede deshacer.')) return
    await eliminarEvidencia(ev.id!)
    URL.revokeObjectURL(ev.url)
    setEvidencias(prev => prev.filter(e => e.id !== ev.id))
    setAmpliada(null)
  }

  const descargar = (ev: EvConUrl) => {
    const a = document.createElement('a')
    a.href = ev.url
    const ext = ev.mime?.split('/')[1]?.split(';')[0] || EXTENSION[ev.tipo] || 'bin'
    a.download = `evidencia-${alumno.apellidos}-${ev.fecha.slice(0, 10)}.${ext}`
    a.click()
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label="Evidencias del alumno"
        style={{ width: 'min(760px, 94vw)', maxHeight: '88vh', overflowY: 'auto', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-700)' }}>
              🗂 Evidencias — {alumno.apellidos}, {alumno.nombre}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>
              {evidencias.length} evidencia{evidencias.length !== 1 ? 's' : ''} · guardadas solo en este dispositivo
            </div>
          </div>
          <button onClick={onClose} className="modal-close" aria-label="Cerrar">✕</button>
        </div>

        {cargando && <p style={{ color: 'var(--gris-600)' }}>Cargando…</p>}

        {!cargando && evidencias.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--gris-600)' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗂</div>
            Sin evidencias todavía. Se capturan al evaluar: en el calificador, pulsando una casilla,
            o desde <strong>Evaluar QR</strong> con la tablet. Puedes guardar foto, audio o vídeo.
          </div>
        )}

        {!cargando && evidencias.length > 0 && !ampliada && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className={`tab-unidad${filtro === 'todas' ? ' activa' : ''}`} onClick={() => setFiltro('todas')}>
              Todas <span className="trim">{evidencias.length}</span>
            </button>
            {(['foto', 'audio', 'video'] as TipoEvidencia[]).filter(t => porTipo[t] > 0).map(t => (
              <button key={t} className={`tab-unidad${filtro === t ? ' activa' : ''}`} onClick={() => setFiltro(t)}>
                {ICONO[t]} {ETIQUETA[t]} <span className="trim">{porTipo[t]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Vista ampliada */}
        {ampliada ? (
          <div>
            {ampliada.tipo === 'foto' && (
              <img src={ampliada.url} alt="Evidencia"
                style={{ width: '100%', borderRadius: 10, marginBottom: 10 }} />
            )}
            {ampliada.tipo === 'audio' && (
              <div style={{ background: 'var(--gris-100)', borderRadius: 10, padding: 20, marginBottom: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎙</div>
                <audio src={ampliada.url} controls style={{ width: '100%' }} />
              </div>
            )}
            {ampliada.tipo === 'video' && (
              <video src={ampliada.url} controls playsInline
                style={{ width: '100%', borderRadius: 10, marginBottom: 10, maxHeight: '55vh', background: '#000' }} />
            )}
            <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 12 }}>
              {new Date(ampliada.fecha).toLocaleString('es-ES')}
              {ampliada.criterio_id && ` · Criterio ${ampliada.criterio_id}`}
              {ampliada.trimestre && ` · T${ampliada.trimestre}`}
              {duracionLegible(ampliada.duracion_ms) && ` · ${duracionLegible(ampliada.duracion_ms)}`}
              {` · ${(ampliada.blob.size / 1024 / 1024).toFixed(1)} MB`}
              {ampliada.descripcion && <div style={{ marginTop: 4, fontStyle: 'italic' }}>{ampliada.descripcion}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" onClick={() => setAmpliada(null)}>← Volver a la galería</button>
              <button className="btn-secondary" onClick={() => descargar(ampliada)}>⬇ Descargar</button>
              <button className="btn-danger" onClick={() => borrar(ampliada)}>🗑 Eliminar</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {visibles.map(ev => (
              <button key={ev.id} onClick={() => setAmpliada(ev)}
                style={{ border: '1px solid var(--gris-300)', borderRadius: 10, padding: 0, cursor: 'pointer', overflow: 'hidden', background: 'white', textAlign: 'left' }}>
                {ev.tipo === 'foto' ? (
                  <img src={ev.url} alt="Evidencia" loading="lazy"
                    style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                ) : ev.tipo === 'video' ? (
                  <video src={ev.url} preload="metadata" muted
                    style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block', background: '#000' }} />
                ) : (
                  <div style={{ width: '100%', height: 110, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', background: 'var(--azul-100)' }}>
                    <span style={{ fontSize: 30 }}>🎙</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--azul-700)', marginTop: 4 }}>
                      {duracionLegible(ev.duracion_ms) || 'audio'}
                    </span>
                  </div>
                )}
                <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--gris-600)' }}>
                  <span style={{ marginRight: 4 }}>{ICONO[ev.tipo]}</span>
                  {new Date(ev.fecha).toLocaleDateString('es-ES')}
                  {ev.criterio_id && <span style={{ fontWeight: 700, color: 'var(--azul-700)' }}> · {ev.criterio_id}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
