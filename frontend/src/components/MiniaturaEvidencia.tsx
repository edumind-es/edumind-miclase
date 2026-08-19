/**
 * Miniatura de una evidencia, con reproducción en el sitio.
 *
 * Una foto se ve; un audio y un vídeo hay que poder oírlos o verlos sin salir
 * del panel, porque si no la evidencia se convierte en un fichero opaco que
 * nadie vuelve a abrir. El object URL se crea al montar y se libera al
 * desmontar: dejarlos colgando llena la memoria en una sesión larga.
 */
import { useEffect, useState } from 'react'
import type { Evidencia } from '@/db/localDb'

const ICONO: Record<string, string> = { foto: '📸', audio: '🎙', video: '🎬' }

export function duracionLegible(ms?: number | null): string {
  if (!ms || !Number.isFinite(ms)) return ''
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface Props {
  evidencia: Evidencia
  onBorrar?: () => void
  tamano?: number
}

export default function MiniaturaEvidencia({ evidencia: ev, onBorrar, tamano = 78 }: Props) {
  const [url, setUrl] = useState<string>('')
  const [abierta, setAbierta] = useState(false)

  useEffect(() => {
    const u = URL.createObjectURL(ev.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [ev.id])

  const dur = duracionLegible(ev.duracion_ms)

  const marco: React.CSSProperties = {
    width: tamano, height: Math.round(tamano * 0.72),
    borderRadius: 8, border: '1px solid var(--gris-300)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'var(--gris-100)', cursor: 'pointer', overflow: 'hidden', padding: 0,
  }

  return (
    <>
      <div style={{ position: 'relative' }}>
        <button style={marco} onClick={() => setAbierta(true)}
          title={`${ev.tipo}${dur ? ` · ${dur}` : ''}${ev.descripcion ? ` · ${ev.descripcion}` : ''}`}
          aria-label={`Abrir evidencia de tipo ${ev.tipo}`}>
          {ev.tipo === 'foto' && url
            ? <img src={url} alt={ev.descripcion || 'Evidencia'}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (
              <>
                <span style={{ fontSize: 20, lineHeight: 1 }}>{ICONO[ev.tipo] ?? '📎'}</span>
                {dur && <span style={{ fontSize: 10, color: 'var(--gris-600)', marginTop: 3, fontWeight: 600 }}>{dur}</span>}
              </>
            )}
        </button>
        {onBorrar && (
          <button onClick={onBorrar} title="Eliminar evidencia" aria-label="Eliminar evidencia"
            style={{
              position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
              background: 'var(--rojo-500)', color: 'white', border: '2px solid white',
              fontSize: 11, lineHeight: 1, cursor: 'pointer', padding: 0,
            }}>×</button>
        )}
      </div>

      {abierta && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}
          onClick={e => { if (e.target === e.currentTarget) setAbierta(false) }}>
          <div className="card" style={{ width: 'min(680px, 94vw)', maxHeight: '90vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--azul-700)' }}>
                {ICONO[ev.tipo] ?? '📎'} Evidencia · {new Date(ev.fecha).toLocaleString('es-ES')}
              </div>
              <button className="modal-close" onClick={() => setAbierta(false)} aria-label="Cerrar">✕</button>
            </div>

            {ev.tipo === 'foto' && <img src={url} alt="Evidencia" style={{ width: '100%', borderRadius: 8 }} />}
            {ev.tipo === 'audio' && <audio src={url} controls style={{ width: '100%' }} />}
            {ev.tipo === 'video' && <video src={url} controls playsInline style={{ width: '100%', borderRadius: 8, maxHeight: '60vh' }} />}

            <div style={{ fontSize: 12.5, color: 'var(--gris-600)', marginTop: 12, lineHeight: 1.6 }}>
              {ev.criterio_id && <>Criterio <strong>{ev.criterio_id}</strong> · </>}
              {ev.trimestre && <>{ev.trimestre}º trimestre · </>}
              {dur && <>{dur} · </>}
              {(ev.blob.size / 1024 / 1024).toFixed(1)} MB
              {ev.descripcion && <div style={{ marginTop: 6, fontStyle: 'italic' }}>{ev.descripcion}</div>}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <a href={url} download={`evidencia-${ev.fecha.slice(0, 10)}`}
                className="btn-secondary" style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13 }}>
                ⬇ Descargar
              </a>
              {onBorrar && (
                <button className="btn-danger" onClick={() => { onBorrar(); setAbierta(false) }}>
                  🗑 Eliminar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
