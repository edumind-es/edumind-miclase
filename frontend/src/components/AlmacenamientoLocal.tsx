/**
 * Salud del almacenamiento del dispositivo.
 *
 * Todo el cuaderno vive en IndexedDB, así que conviene que el docente vea dos
 * cosas: cuánto ocupa y —más importante— si el navegador se ha comprometido a
 * NO borrarlo. Sin permiso de almacenamiento persistente, un navegador puede
 * liberar espacio y llevarse por delante el trimestre; Safari, además, purga
 * los datos de sitios que no se visitan en unos días. De ahí el aviso y la
 * recomendación de instalar la app.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { esNativo } from '@/api'

type Estado = {
  persistente: boolean
  usadoMB: number | null
  cuotaMB: number | null
}

export default function AlmacenamientoLocal() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [pidiendo, setPidiendo] = useState(false)

  const medir = async () => {
    const persistente = (await navigator.storage?.persisted?.()) ?? false
    let usadoMB: number | null = null
    let cuotaMB: number | null = null
    try {
      const e = await navigator.storage?.estimate?.()
      if (e?.usage != null) usadoMB = Math.round((e.usage / 1024 / 1024) * 10) / 10
      if (e?.quota != null) cuotaMB = Math.round(e.quota / 1024 / 1024)
    } catch { /* algunos navegadores no lo exponen */ }
    setEstado({ persistente, usadoMB, cuotaMB })
  }

  useEffect(() => { medir() }, [])

  const pedirPersistencia = async () => {
    setPidiendo(true)
    try {
      await navigator.storage?.persist?.()
      await medir()
    } finally { setPidiendo(false) }
  }

  if (!estado) return null

  // En el contenedor nativo el almacenamiento es de la app: no hay purga
  const seguro = estado.persistente || esNativo()

  return (
    <div className="card" style={{
      marginBottom: 18,
      borderLeft: `4px solid ${seguro ? 'var(--verde-500)' : 'var(--ambar-500)'}`,
    }}>
      <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>
        {seguro ? '🛡️ Tus datos están protegidos en este dispositivo' : '⚠️ El navegador podría borrar tus datos'}
      </h2>

      <p style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.65, marginBottom: 10 }}>
        {esNativo()
          ? 'Estás en la app instalada: el almacenamiento pertenece a la aplicación y el sistema no lo limpia por inactividad.'
          : seguro
            ? 'El navegador se ha comprometido a no liberar este espacio automáticamente. Aun así, descarga una copia de seguridad de vez en cuando.'
            : 'Este navegador todavía no garantiza conservar tus datos y podría liberarlos si le falta espacio. Concede el permiso y, si usas iPad, instala la app.'}
        {estado.usadoMB != null && (
          <> Ocupas <strong>{estado.usadoMB} MB</strong>
            {estado.cuotaMB ? ` de unos ${(estado.cuotaMB / 1024).toFixed(1)} GB disponibles` : ''}.</>
        )}
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {!seguro && (
          <button className="btn-primary" onClick={pedirPersistencia} disabled={pidiendo} style={{ fontSize: 13 }}>
            {pidiendo ? 'Solicitando…' : 'Proteger mis datos'}
          </button>
        )}
        <Link to="/informes" style={{ fontSize: 12.5, color: 'var(--azul-500)', fontWeight: 600 }}>
          Descargar copia de seguridad →
        </Link>
      </div>
    </div>
  )
}
