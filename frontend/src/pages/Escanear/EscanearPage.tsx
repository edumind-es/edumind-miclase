/**
 * Escáner de QR de mesa: apunta la cámara de la tablet al código del alumno
 * y se abre su panel de evaluación rápida. Sin dependencias: usa la API
 * nativa BarcodeDetector (Chrome/Edge/Android); en navegadores sin soporte
 * se puede introducir el código a mano.
 *
 * Entradas alternativas por URL (sin cámara):
 *   /escanear?c=M7KP2      ← QR escaneado con la cámara nativa del dispositivo
 *   /escanear?alumno=12    ← toque en el plano de clase
 */
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAlumnoPorCodigo } from '@/db/queries'
import { db } from '@/db/localDb'
import type { Alumno } from '@/db/localDb'
import { extraerCodigo } from '@/utils/qrSheet'
import EvaluacionRapida from '@/components/EvaluacionRapida'

const tieneDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window

export default function EscanearPage() {
  const [params, setParams] = useSearchParams()
  const [alumno, setAlumno] = useState<Alumno | null>(null)
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [errorCamara, setErrorCamara] = useState('')
  const [codigoManual, setCodigoManual] = useState('')
  const [noEncontrado, setNoEncontrado] = useState('')
  const [historial, setHistorial] = useState<Alumno[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const ocupadoRef = useRef(false)

  // Entrada directa por URL (QR con cámara nativa, o toque en el plano)
  useEffect(() => {
    const c = params.get('c')
    const alumnoId = params.get('alumno')
    if (c) {
      abrirPorCodigo(c)
      setParams({}, { replace: true })
    } else if (alumnoId) {
      db.alumnos.get(Number(alumnoId)).then(a => { if (a) abrirAlumno(a) })
      setParams({}, { replace: true })
    }
  }, [])

  useEffect(() => () => pararCamara(), [])

  const abrirAlumno = (a: Alumno) => {
    setAlumno(a)
    setNoEncontrado('')
    setHistorial(h => [a, ...h.filter(x => x.id !== a.id)].slice(0, 8))
    pararCamara()
    if ('vibrate' in navigator) navigator.vibrate?.(80)
  }

  const abrirPorCodigo = async (raw: string) => {
    const codigo = extraerCodigo(raw)
    if (!codigo) { setNoEncontrado(raw); return }
    const a = await getAlumnoPorCodigo(codigo)
    if (a) abrirAlumno(a)
    else setNoEncontrado(codigo)
  }

  // ── Cámara + detección ────────────────────────────────────────────────

  const iniciarCamara = async () => {
    setErrorCamara('')
    setNoEncontrado('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false,
      })
      streamRef.current = stream
      setCamaraActiva(true)
      // El <video> se monta al cambiar el estado; conectar en el siguiente tick
      requestAnimationFrame(async () => {
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const Detector = (window as any).BarcodeDetector
        const detector = new Detector({ formats: ['qr_code'] })
        timerRef.current = window.setInterval(async () => {
          if (ocupadoRef.current || !videoRef.current || videoRef.current.readyState < 2) return
          ocupadoRef.current = true
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0 && codes[0].rawValue) {
              await abrirPorCodigo(codes[0].rawValue)
            }
          } catch { /* frame no legible, seguir intentando */ }
          ocupadoRef.current = false
        }, 250)
      })
    } catch (e: any) {
      setErrorCamara(e?.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Actívalo en los ajustes del navegador.'
        : 'No se pudo acceder a la cámara.')
      setCamaraActiva(false)
    }
  }

  const pararCamara = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCamaraActiva(false)
  }

  const buscarManual = (e: React.FormEvent) => {
    e.preventDefault()
    if (codigoManual.trim()) abrirPorCodigo(codigoManual)
    setCodigoManual('')
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (alumno) {
    return (
      <>
        <h1 className="page-title">Evaluación rápida</h1>
        <EvaluacionRapida
          alumno={alumno}
          onCerrar={() => setAlumno(null)}
          onSiguiente={() => { setAlumno(null); if (tieneDetector) iniciarCamara() }}
        />
      </>
    )
  }

  return (
    <>
      <h1 className="page-title">Evaluar con QR</h1>
      <p style={{ color: 'var(--gris-600)', fontSize: 14, marginBottom: 20, maxWidth: 620 }}>
        Apunta la cámara al código QR de la mesa del alumno para abrir su panel de
        evaluación al instante. Los QR se imprimen desde la ficha de cada grupo.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, maxWidth: 900 }}>
        {/* Cámara */}
        <div className="card" style={{ textAlign: 'center' }}>
          {tieneDetector ? (
            camaraActiva ? (
              <>
                <video ref={videoRef} playsInline muted
                  style={{ width: '100%', maxHeight: 380, borderRadius: 10, background: '#000', objectFit: 'cover' }} />
                <div style={{ fontSize: 13, color: 'var(--gris-600)', margin: '10px 0' }}>
                  Buscando código QR…
                </div>
                <button className="btn-secondary" onClick={pararCamara}>Detener cámara</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📷</div>
                <button className="btn-primary" onClick={iniciarCamara}
                  style={{ minHeight: 52, fontSize: 16, padding: '12px 28px' }}>
                  Activar cámara
                </button>
                {errorCamara && (
                  <div style={{ marginTop: 12, fontSize: 13, color: 'var(--rojo-500)' }}>{errorCamara}</div>
                )}
              </>
            )
          ) : (
            <div style={{ fontSize: 13, color: 'var(--gris-600)', padding: 12, lineHeight: 1.6 }}>
              Este navegador no soporta el escaneo de QR con cámara
              (necesita Chrome o Edge). Puedes usar la cámara nativa del
              dispositivo (el QR abre la app directamente) o escribir el
              código de la etiqueta aquí al lado.
            </div>
          )}
        </div>

        {/* Código manual + historial */}
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: 'var(--azul-700)' }}>
            Introducir código a mano
          </h2>
          <form onSubmit={buscarManual} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={codigoManual} onChange={e => setCodigoManual(e.target.value.toUpperCase())}
              placeholder="M7KP2" maxLength={8} autoCapitalize="characters"
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 18, letterSpacing: 3, textAlign: 'center', minHeight: 48 }} />
            <button type="submit" className="btn-primary" style={{ minHeight: 48 }}>Abrir</button>
          </form>
          {noEncontrado && (
            <div style={{ fontSize: 13, color: 'var(--rojo-500)', marginBottom: 8 }}>
              ❌ Ningún alumno con el código «{noEncontrado}»
            </div>
          )}

          {historial.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 8px', color: 'var(--gris-600)' }}>
                Evaluados en esta sesión
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {historial.map(a => (
                  <button key={a.id} onClick={() => abrirAlumno(a)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid var(--gris-300)', background: 'var(--gris-100)',
                      fontSize: 14, fontWeight: 600, color: 'var(--gris-900)', minHeight: 44,
                    }}>
                    {a.apellidos}, {a.nombre}
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gris-600)', marginLeft: 8 }}>
                      {a.codigo_cifrado}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
