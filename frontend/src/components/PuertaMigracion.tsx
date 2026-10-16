/**
 * Puerta de migración del esquema.
 *
 * Cuando la base del navegador es de una versión anterior a la de la app, la
 * app NO la abre sin más: enseña en grande qué va a cambiar, hace una copia
 * de seguridad cifrada de la base tal como está (la misma `.miclase` que
 * restaura «Importar») y solo entonces deja que Dexie aplique la migración.
 *
 * Decisión de Luis para la v7 (unidades estancas): un aparato sin actualizar
 * que sincronice con uno ya migrado puede retirar notas, así que hace falta
 * el aviso, la copia y poder volcar esa copia después si algo falla.
 *
 * La copia se hace con una instancia de Dexie limitada a la versión
 * instalada (`new MiClaseDB(instalada)`): declarar menos versiones de las que
 * hay no dispara ningún upgrade. Comprobar la versión tampoco: se mira con
 * `indexedDB.databases()` y, donde no existe, abriendo sin versión y
 * abortando si la base no existía (abrir crearía una vacía).
 *
 * Una base nueva (sin nada) pasa de largo: no hay nada que copiar.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { MiClaseDB, VERSION_ESQUEMA } from '@/db/localDb'
import { exportarDatos } from '@/db/queries'
import { cifrarExport, descargarBlob } from '@/auth/crypto'

const NOMBRE_BASE = 'miclase_db'

/** Versión cruda de IndexedDB de la base (Dexie multiplica por 10). 0 si no existe. */
export async function versionInstalada(nombre = NOMBRE_BASE): Promise<number> {
  try {
    const lista = await (indexedDB as unknown as { databases?: () => Promise<{ name?: string; version?: number }[]> }).databases?.()
    if (lista) return lista.find(d => d.name === nombre)?.version ?? 0
  } catch { /* sin databases(): se abre con cuidado */ }
  return new Promise(res => {
    let creandola = false
    const r = indexedDB.open(nombre)
    r.onupgradeneeded = e => {
      // Solo salta si la base no existía: abortar para no dejar una vacía.
      if (e.oldVersion === 0) { creandola = true; r.transaction?.abort() }
    }
    r.onsuccess = () => { const v = r.result.version; r.result.close(); res(creandola ? 0 : v) }
    r.onerror = () => res(0)
    r.onblocked = () => res(0)
  })
}

type Fase =
  | { nombre: 'comprobando' }
  | { nombre: 'lista' }
  | { nombre: 'puerta'; instalada: number }

export default function PuertaMigracion({ children, alAbrir }: { children: ReactNode; alAbrir?: () => void }) {
  const [fase, setFase] = useState<Fase>({ nombre: 'comprobando' })

  useEffect(() => {
    let vigente = true
    versionInstalada().then(v => {
      if (!vigente) return
      const necesita = v > 0 && v < VERSION_ESQUEMA * 10
      setFase(necesita ? { nombre: 'puerta', instalada: v } : { nombre: 'lista' })
    }).catch(() => { if (vigente) setFase({ nombre: 'lista' }) })
    return () => { vigente = false }
  }, [])

  useEffect(() => { if (fase.nombre === 'lista') alAbrir?.() }, [fase.nombre, alAbrir])

  if (fase.nombre === 'comprobando') return null
  if (fase.nombre === 'lista') return <>{children}</>
  return <Puerta instalada={fase.instalada} alTerminar={() => setFase({ nombre: 'lista' })} />
}

function Puerta({ instalada, alTerminar }: { instalada: number; alTerminar: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fichero, setFichero] = useState<string | null>(null)

  const copiarYSeguir = async () => {
    if (password.length < 6) return setError('La contraseña de la copia debe tener al menos 6 caracteres.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    setTrabajando(true)
    setError(null)
    const antigua = new MiClaseDB(Math.floor(instalada / 10))
    try {
      const datos = JSON.parse(await exportarDatos(antigua))
      const cifrado = await cifrarExport(datos, password)
      const nombre = `miclase-antes-de-unidades-${new Date().toISOString().slice(0, 10)}.miclase`
      await descargarBlob(JSON.stringify(cifrado, null, 2), nombre)
      setFichero(nombre)
      try { localStorage.setItem('miclase.migracion.copia', nombre) } catch { /* sin aviso del nombre */ }
      antigua.close()
      alTerminar()
    } catch (e) {
      antigua.close()
      setError((e as Error).message || 'No se ha podido hacer la copia.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div data-puerta-migracion style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--gris-100, #f4f4f5)' }}>
      <div className="card" style={{ maxWidth: 640, borderTop: '6px solid var(--ambar-500, #d97706)' }}>
        <h1 style={{ fontSize: 26, marginBottom: 8 }}>Antes de actualizar MiClase</h1>
        <p style={{ fontSize: 16, lineHeight: 1.5 }}>
          Esta versión cambia cómo se guardan las notas: <strong>cada unidad didáctica pasa a ser estanca</strong>.
          Un mismo criterio evaluado con el mismo instrumento en dos unidades del trimestre
          serán dos notas distintas, y «Todo el curso» hará la media de las unidades.
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.5 }}>
          Las notas que no sabían de qué unidad eran se colocarán en la unidad que programa ese
          criterio con ese instrumento. Antes de tocar nada se guarda una <strong>copia de seguridad
          cifrada</strong> de todos tus datos, tal y como están ahora: si algo saliera mal, se restaura
          desde «Exportar / Importar copia de seguridad», en el menú lateral.
        </p>
        <div style={{ background: 'var(--ambar-50, #fffbeb)', border: '1px solid var(--ambar-500, #d97706)', borderRadius: 8, padding: '10px 14px', margin: '14px 0', fontSize: 15 }}>
          <strong>Importante:</strong> actualiza <em>todos</em> tus aparatos (iPad, ordenador, móvil) antes
          de volver a calificar. Un aparato con la versión anterior que sincronice con este podría
          retirar notas que aquí ya están separadas por unidad.
        </div>
        <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>
          Contraseña para la copia (la pedirá al restaurar)
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
            data-migracion-password style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, fontSize: 16 }} />
        </label>
        <label style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>
          Repite la contraseña
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password"
            data-migracion-confirmar style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, fontSize: 16 }} />
        </label>
        {error && <p role="alert" style={{ color: 'var(--rojo-600, #b91c1c)', fontSize: 14 }}>{error}</p>}
        {fichero && <p style={{ fontSize: 14 }}>Copia guardada: <code>{fichero}</code></p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn-primary" onClick={copiarYSeguir} disabled={trabajando} data-migracion-copiar style={{ fontSize: 16, padding: '10px 18px' }}>
            {trabajando ? 'Haciendo la copia…' : 'Hacer copia y actualizar'}
          </button>
          {error && (
            <button type="button" className="btn-secondary" onClick={alTerminar} data-migracion-sin-copia style={{ fontSize: 14 }}>
              Actualizar sin copia (no recomendado)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
