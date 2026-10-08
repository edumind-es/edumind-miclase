/**
 * Aviso en Inicio cuando no hay copia reciente fuera del aparato.
 *
 * El riesgo real de una app local no es el espacio: es que el navegador vacíe
 * el almacén o que el aparato se pierda, y que nadie se haya dado cuenta de
 * que llevaba semanas sin copia. Cuenta como copia la carpeta automática y,
 * con la sincronización automática activa, el buzón cifrado.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { diagnostico } from '@/db/copia'
import type { Diagnostico } from '@/db/copiaFormato'

export default function AvisoCopia() {
  const [d, setD] = useState<Diagnostico | null>(null)
  useEffect(() => { diagnostico().then(setD).catch(() => setD(null)) }, [])
  if (!d || (d.nivel !== 'aviso' && d.nivel !== 'nunca')) return null
  return (
    <div data-aviso-copia className="card" style={{ marginBottom: 18, borderLeft: '4px solid var(--ambar-500)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span aria-hidden="true" style={{ fontSize: 22 }}>💾</span>
      <div style={{ flex: '1 1 260px', fontSize: 13.5, lineHeight: 1.5 }}>
        <strong>{d.texto}</strong>{' '}
        <span style={{ color: 'var(--gris-600)' }}>
          Si este aparato se pierde o el navegador vacía el almacén, lo que no esté copiado se pierde con él.
        </span>
      </div>
      <Link to="/sincronizar" className="btn-primary" style={{ fontSize: 12.5 }}>Activar copia automática</Link>
    </div>
  )
}
