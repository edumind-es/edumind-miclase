/**
 * Grabar un vídeo dentro de la app, a una calidad que se pueda sincronizar.
 *
 * La cámara del sistema da unos 60 MB por minuto, según sus ajustes: pasaba del
 * tope de sincronización en pocos segundos y el vídeo se quedaba en ese aparato.
 * Aquí se pide 720p a 1 Mbps, unos 7,5 MB por minuto, que basta para ver una
 * exposición oral. A cambio, la app tiene que seguir abierta mientras se graba;
 * por eso la cámara del sistema se queda como alternativa, aquí mismo.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LIMITE_EVIDENCIA, LIMITE_EVIDENCIA_SINC, enMB } from '@/db/limites'

const BITS_VIDEO = 1_000_000
const BITS_AUDIO = 64_000
/** Se corta antes del tope: el último trozo aún tiene que caber. */
const CORTE = LIMITE_EVIDENCIA * 0.95

export function formatoVideo(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  // MP4 primero: es lo único que graba Safari y se reproduce en todos los aparatos.
  return ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((m) => MediaRecorder.isTypeSupported(m))
}

export function puedeGrabarVideo(): boolean {
  return !!formatoVideo() && !!navigator.mediaDevices?.getUserMedia
}

function reloj(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

interface Props {
  onGuardar: (blob: Blob, duracion_ms: number) => void | Promise<void>
  onCerrar: () => void
  /** Abre la cámara del sistema, para vídeo con más calidad o si esta falla. */
  onCamaraDelSistema: () => void
}

export default function GrabadorVideo({ onGuardar, onCerrar, onCamaraDelSistema }: Props) {
  const [listo, setListo] = useState(false)
  const [grabando, setGrabando] = useState(false)
  const [transcurrido, setTranscurrido] = useState(0)
  const [bytes, setBytes] = useState(0)
  const [error, setError] = useState('')
  const [frontal, setFrontal] = useState(false)

  const pantalla = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const grabador = useRef<MediaRecorder | null>(null)
  const trozos = useRef<Blob[]>([])
  const inicio = useRef(0)
  const tick = useRef<number | null>(null)

  const apagar = () => {
    if (tick.current) { clearInterval(tick.current); tick.current = null }
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  useEffect(() => {
    let vivo = true
    setListo(false); setError('')
    apagar()
    navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 }, facingMode: frontal ? 'user' : 'environment' },
    }).then((s) => {
      if (!vivo) { s.getTracks().forEach((t) => t.stop()); return }
      stream.current = s
      if (pantalla.current) pantalla.current.srcObject = s
      setListo(true)
    }).catch(() => {
      if (vivo) setError('No se pudo abrir la cámara desde la app. Revisa los permisos o usa la cámara del sistema.')
    })
    return () => { vivo = false; apagar() }
  }, [frontal])

  const parar = () => {
    if (tick.current) { clearInterval(tick.current); tick.current = null }
    if (grabador.current?.state === 'recording') grabador.current.stop()
    setGrabando(false)
  }

  const empezar = () => {
    const mimeType = formatoVideo()
    if (!stream.current || !mimeType) return
    trozos.current = []
    setBytes(0); setTranscurrido(0)
    let acumulado = 0
    const rec = new MediaRecorder(stream.current, { mimeType, videoBitsPerSecond: BITS_VIDEO, audioBitsPerSecond: BITS_AUDIO })
    rec.ondataavailable = (ev) => {
      if (!ev.data.size) return
      trozos.current.push(ev.data)
      acumulado += ev.data.size
      setBytes(acumulado)
      if (acumulado >= CORTE) parar()
    }
    rec.onstop = async () => {
      const duracion = Date.now() - inicio.current
      const blob = new Blob(trozos.current, { type: mimeType.split(';')[0] })
      apagar()
      await onGuardar(blob, duracion)
      onCerrar()
    }
    grabador.current = rec
    inicio.current = Date.now()
    rec.start(1000)
    setGrabando(true)
    tick.current = window.setInterval(() => setTranscurrido(Date.now() - inicio.current), 250)
  }

  const descartar = () => {
    const rec = grabador.current
    if (rec?.state === 'recording') { rec.onstop = null; rec.stop() }
    apagar()
    onCerrar()
  }

  const yaNoViaja = bytes > LIMITE_EVIDENCIA_SINC

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Grabar vídeo" data-grabador-video
      style={{ flexDirection: 'column', gap: 12, padding: 'max(16px, env(safe-area-inset-top)) 16px 16px' }}>
      <video ref={pantalla} autoPlay muted playsInline
        style={{ width: '100%', maxWidth: 720, maxHeight: '65vh', borderRadius: 10, background: '#000' }} />

      <div className="card" style={{ width: '100%', maxWidth: 720, padding: 14 }}>
        {error && <p role="alert" style={{ fontSize: 13, color: 'var(--rojo-500)', marginBottom: 10 }}>❌ {error}</p>}

        {grabando && (
          <p data-grabador-estado style={{ fontSize: 14, fontWeight: 700, color: 'var(--rojo-500)', marginBottom: 8 }}>
            ● Grabando {reloj(transcurrido)} · {enMB(bytes)} MB
          </p>
        )}
        {yaNoViaja && (
          <p style={{ fontSize: 12.5, color: '#92400e', marginBottom: 8 }}>
            ⚠️ Ya pasa de {enMB(LIMITE_EVIDENCIA_SINC)} MB: se guardará en este aparato, pero no llegará a los demás.
          </p>
        )}
        {!grabando && !error && (
          <p style={{ fontSize: 12.5, color: 'var(--gris-600)', marginBottom: 10 }}>
            Calidad reducida (unos 7,5 MB por minuto). Hasta unos 40 segundos llegan también a tus otros aparatos. Deja la app abierta mientras grabas.
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {grabando
            ? <button className="btn-primary" data-grabador-parar onClick={parar}>⏹ Guardar</button>
            : <button className="btn-primary" data-grabador-empezar onClick={empezar} disabled={!listo}>● Grabar</button>}
          {!grabando && (
            <button className="btn-secondary" onClick={() => setFrontal((f) => !f)} disabled={!!error}>🔄 Cambiar de cámara</button>
          )}
          <button className="btn-secondary" data-grabador-descartar onClick={descartar}>{grabando ? 'Descartar' : 'Cancelar'}</button>
          {!grabando && (
            <button className="btn-secondary" data-grabador-sistema onClick={() => { apagar(); onCerrar(); onCamaraDelSistema() }}>
              Usar la cámara del sistema
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
