import { useEffect, useRef, useState } from 'react'
import { cifrarExport, descifrarExport, descargarBlob, type ExportCifrado } from '@/auth/crypto'
import { exportarDatos, importarDatos } from '@/db/queries'
import { registrarCopiaEnFichero } from '@/db/copia'
import { db } from '@/db/localDb'
import { notasRecuperablesDeCopia, recuperarNotasDeCopia, type CopiaLeida, type GrupoRecuperable } from '@/db/recuperarDeCopia'
import { confirmar } from '@/utils/confirmar'

interface Props { onClose: () => void }

type Paso = 'menu' | 'exportar' | 'importar' | 'importar_preview' | 'recuperar' | 'recuperar_preview' | 'recuperar_elegir'

export default function ExportImport({ onClose }: Props) {
  const [paso, setPaso] = useState<Paso>('menu')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [datosImport, setDatosImport] = useState<any>(null)
  const [conEvidencias, setConEvidencias] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Recuperar notas sueltas: la copia descifrada (solo en memoria), lo que
  // difiere de lo que hay en el aparato y lo que el docente marca.
  const [copia, setCopia] = useState<CopiaLeida | null>(null)
  const [grupos, setGrupos] = useState<GrupoRecuperable[]>([])
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [quitar, setQuitar] = useState<Set<string>>(new Set())

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
      const datos = JSON.parse(await exportarDatos(db, { sinEvidencias: !conEvidencias }))

      const cifrado = await cifrarExport(datos, password)
      const fecha = new Date().toISOString().slice(0, 10)
      const resultado = await descargarBlob(JSON.stringify(cifrado, null, 2), `miclase-backup-${fecha}.miclase`)
      if (resultado === 'cancelado') { setMsg({ tipo: 'error', texto: 'Copia cancelada: no se ha guardado nada.' }); return }
      await registrarCopiaEnFichero()

      setMsg({ tipo: 'ok', texto: `Backup exportado con ${datos.grupos?.length || 0} grupos y ${datos.alumnos?.length || 0} alumnos${conEvidencias ? '' : ', sin fotos, audios ni vídeos'}. Guárdalo en un lugar seguro.` })
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
        if (paso === 'recuperar') {
          const leido = cifrado as any
          // El índice de la copia automática en carpeta no lleva datos.
          if (leido?.formato === 'miclase-copia') {
            setMsg({ tipo: 'error', texto: 'Ese fichero es el índice de la copia automática en carpeta, no una copia con los datos. Usa una copia de seguridad descargada desde «Exportar / Importar» o desde Informes.' })
            return
          }
          // La copia de Informes va sin cifrar: se compara sin pedir contraseña.
          if (Array.isArray(leido?.calificaciones)) { void abrirCopia(leido as CopiaLeida); return }
        }
        if (!cifrado.version || !cifrado.datos) throw new Error('Formato de archivo no válido.')
        setDatosImport(cifrado)
        setPaso(p => p === 'recuperar' ? 'recuperar_preview' : 'importar_preview')
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

  // ── RECUPERAR NOTAS SUELTAS ───────────────────────────────────────

  /** Compara una copia ya leída con lo que hay y enseña la lista. No escribe nada. */
  const abrirCopia = async (datos: CopiaLeida) => {
    try {
      const lista = await notasRecuperablesDeCopia(datos)
      setCopia(datos); setGrupos(lista); setMarcados(new Set()); setQuitar(new Set())
      setMsg(null)
      setPaso('recuperar_elegir')
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'No se pudo leer la copia.' })
    }
  }

  /** Abre la copia cifrada y la compara con lo que hay. No escribe nada. */
  const compararCopia = async () => {
    if (password.length < 1) return setMsg({ tipo: 'error', texto: 'Introduce la contraseña del backup.' })
    setTrabajando(true)
    setMsg(null)
    try {
      await abrirCopia(await descifrarExport(datosImport, password) as CopiaLeida)
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.name === 'OperationError' ? 'Contraseña incorrecta o archivo dañado.' : (e.message || 'No se pudo leer la copia.') })
    } finally {
      setTrabajando(false)
    }
  }

  const alternar = (conjunto: Set<string>, poner: (s: Set<string>) => void, clave: string) => {
    const s = new Set(conjunto)
    if (s.has(clave)) s.delete(clave); else s.add(clave)
    poner(s)
  }

  const recuperar = async () => {
    if (!copia || !marcados.size) return
    const elegidos = grupos.filter(g => marcados.has(g.clave))
    const casillas = elegidos.reduce((n, g) => n + g.distintas, 0)
    const aQuitar = elegidos.filter(g => quitar.has(g.clave)).reduce((n, g) => n + g.nuevas, 0)
    const si = await confirmar({
      titulo: `¿Devolver ${casillas} ${casillas === 1 ? 'nota' : 'notas'} a como ${casillas === 1 ? 'estaba' : 'estaban'} en la copia?`,
      texto: `${elegidos.map(g => `· ${g.area} · ${g.unidad} · ${g.instrumento} (${g.trimestre}.º trimestre): ${g.distintas}`).join('\n')}`
        + (aQuitar ? `\n\nAdemás se ${aQuitar === 1 ? 'quita 1 nota' : `quitan ${aQuitar} notas`} que la copia no tenía.` : '')
        + '\n\nLa nota que hay ahora en cada casilla queda guardada como nota anterior, a la vista y recuperable. Lo demás no se toca.',
      aceptar: 'Recuperar',
    })
    if (!si) return
    setTrabajando(true)
    setMsg(null)
    try {
      const r = await recuperarNotasDeCopia(copia, elegidos.map(g => ({ clave: g.clave, quitarNuevas: quitar.has(g.clave) })))
      setGrupos(await notasRecuperablesDeCopia(copia))
      setMarcados(new Set()); setQuitar(new Set())
      setMsg({ tipo: 'ok', texto: `${r.recuperadas} ${r.recuperadas === 1 ? 'nota recuperada' : 'notas recuperadas'} de la copia${r.quitadas ? ` y ${r.quitadas} ${r.quitadas === 1 ? 'quitada' : 'quitadas'}` : ''}. Las que había quedan como nota anterior en su casilla.` })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'No se pudo recuperar.' })
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
      <div className="card" role="dialog" aria-modal="true" aria-label="Exportar o importar datos" style={{ width: 'min(520px, 94vw)', maxHeight: '90vh', overflowY: 'auto', padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-700)' }}>
            {paso === 'menu' && '📦 Exportar / Importar datos'}
            {paso === 'exportar' && '⬇️ Exportar backup cifrado'}
            {(paso === 'importar' || paso === 'importar_preview') && '⬆️ Importar backup'}
            {paso.startsWith('recuperar') && 'Recuperar notas de una copia'}
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
            <button className="btn-secondary" data-recuperar-abrir onClick={() => { setPaso('recuperar'); setMsg(null); setPassword('') }}>
              Recuperar notas de una copia, sin importarla
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
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--gris-600)', lineHeight: 1.5 }}>
              <input type="checkbox" data-backup-evidencias checked={conEvidencias} onChange={e => setConEvidencias(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Incluir fotos, audios y vídeos. Con muchos vídeos, la copia puede pesar demasiado y fallar en el iPad.</span>
            </label>
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

        {/* RECUPERAR — fichero, contraseña y elegir */}
        {paso === 'recuperar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--gris-600)', lineHeight: 1.6 }}>
              Para cuando unas notas se han pisado y una copia anterior las conserva. La copia solo se lee:
              verás qué notas son distintas ahora y elegirás cuáles vuelven. Lo demás se queda como está.
            </div>
            <input type="file" accept=".miclase,.json" data-recuperar-fichero onChange={leerArchivo} style={{ padding: '8px 0' }} />
            {msg && <Aviso {...msg} />}
            <button className="btn-secondary" onClick={() => setPaso('menu')}>Cancelar</button>
          </div>
        )}
        {paso === 'recuperar_preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>
              Introduce la contraseña de la copia. Todavía no se cambia nada.
            </div>
            <input type="password" data-recuperar-clave value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña del backup" style={{ width: '100%' }} autoFocus />
            {msg && <Aviso {...msg} />}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" data-recuperar-comparar onClick={compararCopia} disabled={trabajando}>
                {trabajando ? 'Comparando…' : 'Abrir y comparar'}
              </button>
              <button className="btn-secondary" onClick={() => setPaso('menu')}>Cancelar</button>
            </div>
          </div>
        )}
        {paso === 'recuperar_elegir' && (
          <div data-recuperar-lista style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {grupos.length === 0 ? (
              <div data-recuperar-nada style={{ fontSize: 13, color: 'var(--gris-600)', lineHeight: 1.6 }}>
                Todas las notas de la copia están igual en este aparato: no hay nada que recuperar.
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--gris-600)', lineHeight: 1.6 }}>
                Estas notas no están ahora como en la copia. Marca solo lo que se haya pisado:
                lo que hayas cambiado a propósito después de la copia también sale aquí.
              </div>
            )}
            {grupos.map(g => (
              <div key={g.clave} data-recuperar-grupo={g.clave} data-unidad={g.unidad} data-instrumento={g.instrumento}
                style={{ border: '1px solid var(--gris-200)', borderRadius: 8, padding: '10px 12px' }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, cursor: 'pointer' }}>
                  <input type="checkbox" data-recuperar-marcar checked={marcados.has(g.clave)}
                    onChange={() => alternar(marcados, setMarcados, g.clave)} style={{ marginTop: 4, width: 20, height: 20 }} />
                  <span style={{ fontSize: 14, lineHeight: 1.45 }}>
                    <strong>{g.unidad} · {g.instrumento}</strong>
                    <br />
                    <span style={{ color: 'var(--gris-600)', fontSize: 13 }}>
                      {g.clase} · {g.area} · {g.trimestre}.º trimestre — {g.distintas} {g.distintas === 1 ? 'nota distinta' : 'notas distintas'}, de {g.alumnos} {g.alumnos === 1 ? 'alumno' : 'alumnos'}
                    </span>
                  </span>
                </label>
                {g.nuevas > 0 && marcados.has(g.clave) && (
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, cursor: 'pointer', marginLeft: 30, fontSize: 13, color: 'var(--gris-600)', lineHeight: 1.45 }}>
                    <input type="checkbox" data-recuperar-quitar checked={quitar.has(g.clave)}
                      onChange={() => alternar(quitar, setQuitar, g.clave)} style={{ marginTop: 4, width: 20, height: 20 }} />
                    <span>Quitar también {g.nuevas === 1 ? 'la nota' : `las ${g.nuevas} notas`} que la copia no tenía aquí (en criterios que entonces estaban sin nota).</span>
                  </label>
                )}
              </div>
            ))}
            {msg && <Aviso {...msg} />}
            <div style={{ display: 'flex', gap: 10 }}>
              {grupos.length > 0 && (
                <button className="btn-primary" data-recuperar-aplicar onClick={recuperar} disabled={trabajando || !marcados.size}>
                  {trabajando ? 'Recuperando…' : 'Recuperar lo marcado'}
                </button>
              )}
              <button className="btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
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
              Una copia sin fotos ni vídeos conserva los que ya haya aquí.
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
