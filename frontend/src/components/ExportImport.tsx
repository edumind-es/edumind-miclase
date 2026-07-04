import { useEffect, useRef, useState } from 'react'
import { cifrarExport, descifrarExport, descargarBlob, type ExportCifrado } from '@/auth/crypto'
import { exportarDatos, importarDatos } from '@/db/queries'

interface Props { onClose: () => void }

type Paso = 'menu' | 'exportar' | 'importar' | 'importar_preview'

export default function ExportImport({ onClose }: Props) {
  const [paso, setPaso] = useState<Paso>('menu')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [datosImport, setDatosImport] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── EXPORTAR ──────────────────────────────────────────────────────

  const exportar = async () => {
    if (password.length < 6) return setMsg({ tipo: 'error', texto: 'La contraseña debe tener al menos 6 caracteres.' })
    if (password !== confirm) return setMsg({ tipo: 'error', texto: 'Las contraseñas no coinciden.' })

    setTrabajando(true)
    setMsg(null)
    try {
      // Los datos viven en IndexedDB (local-first): se exportan directamente del navegador
      const datos = JSON.parse(await exportarDatos())

      const cifrado = await cifrarExport(datos, password)
      const fecha = new Date().toISOString().slice(0, 10)
      descargarBlob(JSON.stringify(cifrado, null, 2), `miclase-backup-${fecha}.miclase`)

      setMsg({ tipo: 'ok', texto: `Backup exportado con ${datos.grupos?.length || 0} grupos y ${datos.alumnos?.length || 0} alumnos. Guárdalo en un lugar seguro.` })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'Error al exportar.' })
    } finally {
      setTrabajando(false)
    }
  }

  // ── IMPORTAR ──────────────────────────────────────────────────────

  const leerArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const cifrado: ExportCifrado = JSON.parse(ev.target?.result as string)
        if (!cifrado.version || !cifrado.datos) throw new Error('Formato de archivo no válido.')
        setDatosImport(cifrado)
        setPaso('importar_preview')
        setMsg(null)
      } catch {
        setMsg({ tipo: 'error', texto: 'El archivo no es un backup válido de EDUmind MiClase.' })
      }
    }
    reader.readAsText(file)
  }

  const confirmarImport = async () => {
    if (password.length < 1) return setMsg({ tipo: 'error', texto: 'Introduce la contraseña del backup.' })
    setTrabajando(true)
    setMsg(null)
    try {
      const datos: any = await descifrarExport(datosImport, password)
      await importarDatos(JSON.stringify(datos))

      setMsg({
        tipo: 'ok',
        texto: `Importación completada: ${datos.grupos?.length || 0} grupos, ${datos.alumnos?.length || 0} alumnos, ${datos.calificaciones?.length || 0} calificaciones.`,
      })
    } catch (e: any) {
      if (e.name === 'OperationError') {
        setMsg({ tipo: 'error', texto: 'Contraseña incorrecta o archivo dañado.' })
      } else {
        setMsg({ tipo: 'error', texto: e.message || 'Error al importar.' })
      }
    } finally {
      setTrabajando(false)
    }
  }

  // ── UI ────────────────────────────────────────────────────────────

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" role="dialog" aria-modal="true" aria-label="Exportar o importar datos" style={{ width: 460, padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-700)' }}>
            {paso === 'menu' && '📦 Exportar / Importar datos'}
            {paso === 'exportar' && '⬇️ Exportar backup cifrado'}
            {(paso === 'importar' || paso === 'importar_preview') && '⬆️ Importar backup'}
          </h2>
          <button onClick={onClose} className="modal-close" aria-label="Cerrar">✕</button>
        </div>

        {/* MENÚ PRINCIPAL */}
        {paso === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 4, lineHeight: 1.6 }}>
              Tus datos viven solo en este navegador. Exporta un backup cifrado con contraseña
              e impórtalo en cualquier otro dispositivo.
              <br /><strong>Nadie puede leer el backup sin la contraseña — los datos nunca pasan por el servidor.</strong>
            </div>
            <button className="btn-primary" onClick={() => { setPaso('exportar'); setMsg(null); setPassword(''); setConfirm('') }}>
              ⬇️ Exportar mis datos (cifrado con contraseña)
            </button>
            <button className="btn-secondary" onClick={() => { setPaso('importar'); setMsg(null); setPassword('') }}>
              ⬆️ Importar backup existente
            </button>
            <div style={{ fontSize: 11, color: 'var(--gris-600)', marginTop: 8, padding: '8px 12px', background: 'var(--gris-100)', borderRadius: 6 }}>
              <strong>Cifrado:</strong> AES-256-GCM · PBKDF2 100.000 iteraciones · Web Crypto API nativo
            </div>
          </div>
        )}

        {/* EXPORTAR */}
        {paso === 'exportar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña de cifrado (mín. 6 caracteres)" style={{ width: '100%' }} />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Confirmar contraseña" style={{ width: '100%' }} />
            {msg && <Aviso {...msg} />}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={exportar} disabled={trabajando}>
                {trabajando ? 'Cifrando…' : 'Exportar y descargar'}
              </button>
              <button className="btn-secondary" onClick={() => setPaso('menu')}>Cancelar</button>
            </div>
          </div>
        )}

        {/* IMPORTAR — seleccionar archivo */}
        {paso === 'importar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>
              Selecciona un archivo <code>.miclase</code> generado por EDUmind MiClase.
            </div>
            <input ref={fileRef} type="file" accept=".miclase,.json" onChange={leerArchivo}
              style={{ padding: '8px 0' }} />
            {msg && <Aviso {...msg} />}
            <button className="btn-secondary" onClick={() => setPaso('menu')}>Cancelar</button>
          </div>
        )}

        {/* IMPORTAR — introducir contraseña y confirmar */}
        {paso === 'importar_preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>
              Archivo cargado correctamente. Introduce la contraseña para descifrar.
            </div>
            <div style={{ fontSize: 12, background: 'var(--ambar-100)', color: 'var(--ambar-500)', padding: '8px 12px', borderRadius: 6 }}>
              ⚠️ La importación <strong>reemplaza</strong> todos los datos actuales de este navegador
              por los del backup. Si tienes datos aquí que quieras conservar, expórtalos antes.
            </div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña del backup" style={{ width: '100%' }} autoFocus />
            {msg && <Aviso {...msg} />}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={confirmarImport} disabled={trabajando}>
                {trabajando ? 'Importando…' : 'Descifrar e importar'}
              </button>
              <button className="btn-secondary" onClick={() => setPaso('menu')}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Aviso({ tipo, texto }: { tipo: 'ok' | 'error'; texto: string }) {
  const esOk = tipo === 'ok'
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6, fontSize: 13,
      background: esOk ? 'var(--verde-100)' : 'var(--rojo-100)',
      color: esOk ? 'var(--verde-500)' : 'var(--rojo-500)',
    }}>
      {esOk ? '✅ ' : '❌ '}{texto}
    </div>
  )
}
