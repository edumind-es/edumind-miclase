/**
 * Cámara que lee un código QR y lo devuelve tal cual.
 *
 * A diferencia del escáner de la pantalla de evaluación, que busca códigos de
 * mesa y abre la ficha del alumno, este no interpreta nada: entrega el texto
 * y ya. Se usa para emparejar dos dispositivos, donde el QR lleva dentro el
 * saludo de la conexión.
 *
 * Ese código es mucho más denso que el de una mesa, así que se pide más
 * resolución a la cámara y se analiza el fotograma más grande.
 */
import { useEffect, useRef, useState } from 'react'
import { crearLector, sePuedeEscanear, type Lector } from '@/utils/lectorQR'

const LADO = 1080

type Props = {
  /** Qué se le pide al docente que enfoque. */
  titulo: string
  onCodigo: (codigo: string) => void
  onCancelar: () => void
}

export default function EscanerCodigo({ titulo, onCodigo, onCancelar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const relojRef = useRef<number | null>(null)
  const lectorRef = useRef<Lector | null>(null)
  const ocupadoRef = useRef(false)
  // Una vez leído el código no hay que seguir mirando ni volver a avisar
  const listoRef = useRef(false)

  const [error, setError] = useState('')
  const [motor, setMotor] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true

    const parar = () => {
      if (relojRef.current) { clearInterval(relojRef.current); relojRef.current = null }
      lectorRef.current?.liberar()
      lectorRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    const arrancar = async () => {
      if (!sePuedeEscanear()) {
        setError('Este dispositivo no tiene cámara disponible.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 } },
          audio: false,
        })
        if (!vivo) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        // Obligatorio en iOS: sin esto el vídeo se abre a pantalla completa
        video.setAttribute('playsinline', 'true')
        await video.play()

        const lector = await crearLector({ ladoMaximo: LADO })
        if (!vivo) { lector.liberar(); return }
        lectorRef.current = lector
        setMotor(lector.motor)

        relojRef.current = window.setInterval(async () => {
          if (listoRef.current || ocupadoRef.current) return
          const v = videoRef.current
          if (!v || v.readyState < 2) return
          ocupadoRef.current = true
          try {
            const valor = await lector.leer(v)
            if (valor && !listoRef.current) {
              listoRef.current = true
              if ('vibrate' in navigator) navigator.vibrate?.(80)
              parar()
              onCodigo(valor)
            }
          } catch { /* fotograma ilegible: seguir */ }
          ocupadoRef.current = false
        }, lector.motor === 'nativo' ? 250 : 400)
      } catch (e: any) {
        setError(e?.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Actívalo en los ajustes del navegador.'
          : 'No se pudo acceder a la cámara.')
      }
    }

    void arrancar()
    return () => { vivo = false; parar() }
    // Deliberadamente una sola vez: rearrancar la cámara en cada render
    // parpadearía y perdería fotogramas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{titulo}</div>

      {error ? (
        <p role="alert" style={{ color: 'var(--rojo-600, #b3261e)', fontSize: 14 }}>{error}</p>
      ) : (
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: '100%', borderRadius: 12, background: '#000', display: 'block' }}
          />
          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            Acerca la cámara hasta que el código llene el recuadro.
            {motor === 'javascript' && ' Puede tardar un par de segundos.'}
          </p>
        </div>
      )}

      <button type="button" className="btn" onClick={onCancelar} style={{ marginTop: 8 }}>
        Cancelar
      </button>
    </div>
  )
}
