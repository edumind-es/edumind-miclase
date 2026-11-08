/**
 * Historial de tutorías de un alumno, para su ficha: de todas sus clases,
 * de la más reciente a la más antigua, con los acuerdos pendientes a la
 * vista. Cada fila lleva a la tutoría en la pantalla de Tutorías.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTutoriasDeAlumno } from '@/db/queries'
import { filtrarTutorias, acuerdosPendientes, fechaLegible, nombreTipo, diaLocal, type Tutoria } from '@/db/tutorias'

export default function HistorialTutorias({ alumnoId, grupoId }: { alumnoId: number; grupoId: number }) {
  const [tutorias, setTutorias] = useState<Tutoria[] | null>(null)

  useEffect(() => {
    let vivo = true
    getTutoriasDeAlumno(alumnoId).then(t => { if (vivo) setTutorias(filtrarTutorias(t)) })
    return () => { vivo = false }
  }, [alumnoId])

  if (!tutorias) return null
  const pendientes = acuerdosPendientes(tutorias, diaLocal(), [alumnoId])

  return (
    <div data-historial-tutorias style={{ marginBottom: 14, border: '1px solid var(--gris-200)', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Tutorías ({tutorias.length})</span>
        {pendientes.length > 0 && <span className="badge" style={{ background: 'var(--ambar-100)', color: 'var(--ambar-500)', fontSize: 11 }}>
          {pendientes.length} acuerdo{pendientes.length === 1 ? '' : 's'} pendiente{pendientes.length === 1 ? '' : 's'}
        </span>}
        <Link to={`/tutorias?alumno=${alumnoId}`} style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--azul-500)' }} data-historial-ver-todas>
          {tutorias.length ? 'Ver todas →' : 'Nueva tutoría →'}
        </Link>
      </div>
      {tutorias.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--gris-600)' }}>Sin tutorías registradas.</div>}
      <div style={{ maxHeight: 140, overflowY: 'auto' }}>
        {tutorias.map(t => (
          <Link key={t.id} to={`/tutorias?alumno=${alumnoId}&abrir=${t.id}${t.grupo_id !== grupoId ? `&grupo_id=${t.grupo_id}` : ''}`}
            data-historial-fila={t.id}
            style={{ display: 'block', fontSize: 12.5, padding: '3px 0', color: 'inherit', textDecoration: 'none', borderTop: '1px solid var(--gris-100)' }}>
            <span style={{ fontFamily: 'var(--lm-mono, monospace)' }}>{fechaLegible(t.fecha.slice(0, 10))}</span>
            {' · '}{nombreTipo(t.tipo)}
            {t.acuerdos.length ? ` · ${t.acuerdos.length} acuerdo${t.acuerdos.length === 1 ? '' : 's'}` : ''}
          </Link>
        ))}
      </div>
    </div>
  )
}
