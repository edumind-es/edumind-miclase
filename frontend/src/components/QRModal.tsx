import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

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

  const descargar = () => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = 'miclase-qr.png'
    a.click()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: 340, textAlign: 'center', padding: 32 }}>
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
