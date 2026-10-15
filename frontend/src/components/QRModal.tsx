import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { descargarFichero } from '@/utils/compartir'

/** El dataURL que genera la librería, como Blob, para sacarlo por la puerta de siempre. */
function dataUrlABlob(dataUrl: string): Blob {
  const [cabecera, datos] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(cabecera)?.[1] ?? 'application/octet-stream'
  const bin = atob(datos)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

interface Props {
  url: string
  titulo?: string
  onClose: () => void
}

export default function QRModal({ url, titulo, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#0f2d4a', light: '#ffffff' } })
      .then(setDataUrl)
  }, [url])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // En el iPad un `<a download>` no hace nada: todo fichero sale por
  // `descargarFichero`, que ahí abre la hoja de compartir del sistema.
  const descargar = () => {
    descargarFichero('miclase-qr.png', dataUrlABlob(dataUrl), 'image/png', titulo || 'Código QR de MiClase')
      .catch(() => {})
  }

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" role="dialog" aria-modal="true" aria-label={titulo || 'Acceso desde móvil'} style={{ width: 340, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--azul-700)', marginBottom: 4 }}>
          {titulo || 'Acceso desde móvil'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--gris-600)', marginBottom: 20 }}>
          Escanea con la cámara para abrir directamente
        </div>

        {dataUrl ? (
          <img src={dataUrl} alt="QR" style={{ width: 240, height: 240, display: 'block', margin: '0 auto', borderRadius: 8 }} />
        ) : (
          <div style={{ width: 240, height: 240, background: 'var(--gris-100)', borderRadius: 8, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gris-600)', fontSize: 13 }}>
            Generando…
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--gris-600)', margin: '12px 0 20px', wordBreak: 'break-all' }}>
          {url}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn-primary" onClick={descargar} disabled={!dataUrl}>
            Descargar QR
          </button>
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
