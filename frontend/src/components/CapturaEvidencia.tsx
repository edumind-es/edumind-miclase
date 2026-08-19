/**
 * Captura de evidencias de aprendizaje: foto, audio o vídeo.
 *
 * La foto se comprime a JPEG; el audio se graba con MediaRecorder (lo que
 * permite grabar sin salir de la app, con el cronómetro a la vista); el vídeo
 * se delega en la cámara del sistema, que comprime mucho mejor que el
 * navegador y no obliga a mantener la pestaña activa.
 *
 * Todo se queda en IndexedDB. Lo único que sale del dispositivo es lo que
 * viaje cifrado por la sincronización, y solo si cabe en un sobre.
 */
import { useEffect, useRef, useState } from 'react'
import { comprimirImagen, revisarTamano, LIMITE_EVIDENCIA, type AvisoEvidencia } from '@/db/queries'
import type { TipoEvidencia } from '@/db/localDb'

export type EvidenciaCapturada = {
  tipo: TipoEvidencia
  mime: string
  blob: Blob
  duracion_ms?: number
}

interface Props {
  onCapturada: (ev: EvidenciaCapturada) => void | Promise<void>
  /** Estilo compacto para la barra del panel de celda */
  compacto?: boolean
  deshabilitado?: boolean
}

function reloj(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Duración real del medio, leída del propio fichero. */
function medirDuracion(blob: Blob, etiqueta: 'audio' | 'video'): Promise<number | undefined> {
  return new Promise(resolve => {
    const el = document.createElement(etiqueta)
    const url = URL.createObjectURL(blob)
    const limpiar = (v?: number) => { URL.revokeObjectURL(url); resolve(v) }
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      // Chrome devuelve Infinity en algunos WebM grabados en directo
      const d = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined
      limpiar(d)
    }
    el.onerror = () => limpiar(undefined)
    el.src = url
    setTimeout(() => limpiar(undefined), 4000)
  })
}

/** Primer formato de grabación que soporte este navegador. */
function formatoAudio(): string | undefined {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidatos.find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m))
}

export default function CapturaEvidencia({ onCapturada, compacto, deshabilitado }: Props) {
  const [grabando, setGrabando] = useState(false)
  const [transcurrido, setTranscurrido] = useState(0)
  const [aviso, setAviso] = useState<AvisoEvidencia | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const fotoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const grabadorRef = useRef<MediaRecorder | null>(null)
  const trozosRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const inicioRef = useRef(0)
  const tickRef = useRef<number | null>(null)

  const puedeGrabarAudio = typeof MediaRecorder !== 'undefined' && !!formatoAudio()

  useEffect(() => () => { pararStream(); if (tickRef.current) clearInterval(tickRef.current) }, [])

  const pararStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const entregar = async (blob: Blob, tipo: TipoEvidencia, duracion_ms?: number) => {
    const revision = revisarTamano(blob)
    if (revision.nivel === 'error') { setAviso(revision); return }
    setAviso(revision.nivel === 'aviso' ? revision : null)
    setTrabajando(true)
    try {
      await onCapturada({ tipo, mime: blob.type || 'application/octet-stream', blob, duracion_ms })
    } finally { setTrabajando(false) }
  }

  // ── Foto ────────────────────────────────────────────────────────────────
  const tomarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setTrabajando(true)
    try {
      const blob = await comprimirImagen(file)
      await entregar(blob, 'foto')
    } catch {
      setAviso({ nivel: 'error', texto: 'No se pudo procesar la imagen.' })
    } finally { setTrabajando(false) }
  }

  // ── Vídeo (cámara del sistema) ──────────────────────────────────────────
  const tomarVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > LIMITE_EVIDENCIA) {
      setAviso({ nivel: 'error', texto: `El vídeo ocupa ${(file.size / 1024 / 1024).toFixed(1)} MB. Graba un fragmento más corto (máximo 25 MB).` })
      return
    }
    const duracion = await medirDuracion(file, 'video')
    await entregar(file, 'video', duracion)
  }

  // ── Audio (grabación in situ) ───────────────────────────────────────────
  const empezarAudio = async () => {
    setAviso(null)
    const mime = formatoAudio()
    if (!mime) { setAviso({ nivel: 'error', texto: 'Este navegador no permite grabar audio.' }); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      trozosRef.current = []
      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64_000 })
      rec.ondataavailable = ev => { if (ev.data.size) trozosRef.current.push(ev.data) }
      rec.onstop = async () => {
        pararStream()
        const blob = new Blob(trozosRef.current, { type: mime })
        const duracion = (await medirDuracion(blob, 'audio')) ?? (Date.now() - inicioRef.current)
        await entregar(blob, 'audio', duracion)
      }
      grabadorRef.current = rec
      inicioRef.current = Date.now()
      setTranscurrido(0)
      rec.start(1000)
      setGrabando(true)
      tickRef.current = window.setInterval(() => setTranscurrido(Date.now() - inicioRef.current), 250)
    } catch {
      setAviso({ nivel: 'error', texto: 'No se pudo acceder al micrófono. Revisa los permisos.' })
    }
  }

  const pararAudio = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    grabadorRef.current?.stop()
    grabadorRef.current = null
    setGrabando(false)
  }

  const cancelarAudio = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    const rec = grabadorRef.current
    if (rec) { rec.onstop = null; rec.stop() }
    grabadorRef.current = null
    trozosRef.current = []
    pararStream()
    setGrabando(false)
    setTranscurrido(0)
  }

  const alto = compacto ? 42 : 46
  const btn: React.CSSProperties = {
    minHeight: alto, fontSize: compacto ? 13 : 13.5, whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  }

  // ── Grabando: la interfaz se reduce al cronómetro y a parar ─────────────
  if (grabando) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: alto, padding: '0 14px',
          borderRadius: 8, background: 'var(--rojo-100)', color: 'var(--rojo-500)', fontWeight: 700,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--rojo-500)', animation: 'lat 1s infinite' }} />
          Grabando {reloj(transcurrido)}
        </span>
        <button className="btn-primary" style={btn} onClick={pararAudio}>⏹ Guardar</button>
        <button className="btn-secondary" style={btn} onClick={cancelarAudio}>Descartar</button>
        <style>{'@keyframes lat{0%,100%{opacity:1}50%{opacity:.25}}'}</style>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-secondary" style={btn} disabled={deshabilitado || trabajando}
          onClick={() => fotoRef.current?.click()} title="Fotografiar la producción">
          📸 {compacto ? 'Foto' : 'Foto'}
        </button>
        <button className="btn-secondary" style={btn}
          disabled={deshabilitado || trabajando || !puedeGrabarAudio}
          onClick={empezarAudio}
          title={puedeGrabarAudio ? 'Grabar audio (lectura en voz alta, exposición oral…)' : 'Este navegador no permite grabar audio'}>
          🎙 Audio
        </button>
        <button className="btn-secondary" style={btn} disabled={deshabilitado || trabajando}
          onClick={() => videoRef.current?.click()} title="Grabar un vídeo corto con la cámara">
          🎬 Vídeo
        </button>

        <input ref={fotoRef} type="file" accept="image/*" capture="environment"
          style={{ display: 'none' }} onChange={tomarFoto} />
        <input ref={videoRef} type="file" accept="video/*" capture="environment"
          style={{ display: 'none' }} onChange={tomarVideo} />
      </div>

      {aviso && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 7, fontSize: 12.5, lineHeight: 1.5,
          background: aviso.nivel === 'error' ? 'var(--rojo-100)' : '#fffbeb',
          color: aviso.nivel === 'error' ? 'var(--rojo-500)' : '#92400e',
          border: aviso.nivel === 'error' ? 'none' : '1px solid #fde68a',
        }}>
          {aviso.nivel === 'error' ? '❌ ' : '⚠️ '}{aviso.texto}
        </div>
      )}
    </>
  )
}
