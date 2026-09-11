/**
 * Barra de contexto: qué clase, qué área y qué trimestre se están mirando.
 *
 * Es el único selector de clase de la app. Antes había uno distinto en
 * Evaluación, Asistencia, Seguimiento, Informes y Alumnado, cada uno con su
 * propio estado, y cambiar de clase en una no cambiaba nada en las demás.
 */
import { Link } from 'react-router-dom'
import { useClaseActiva } from '@/contexto/ClaseActiva'

const TRIMESTRES = [
  { v: 1, label: '1er trimestre' },
  { v: 2, label: '2º trimestre' },
  { v: 3, label: '3er trimestre' },
]

export default function BarraClase({ conArea = true, conTrimestre = true }: {
  conArea?: boolean
  conTrimestre?: boolean
}) {
  const {
    grupos, grupo, grupoId, asignaturas, asignaturaId, trimestre,
    cargando, elegirGrupo, elegirAsignatura, elegirTrimestre,
  } = useClaseActiva()

  // Sin clases no hay contexto que enseñar: la invitación a crear la primera
  // la da el Inicio, que tiene sitio para explicarla.
  if (cargando || grupos.length === 0) return null

  return (
    <div className="barra-clase">
      <div className="barra-clase-grupo">
        <span className="barra-clase-punto" style={{ background: grupo?.color || 'var(--azul-500)' }} aria-hidden="true" />
        <select
          aria-label="Clase activa"
          value={grupoId ?? ''}
          onChange={e => elegirGrupo(Number(e.target.value))}
        >
          {grupos.map(g => (
            <option key={g.id} value={g.id}>{g.nombre} · {g.curso}º</option>
          ))}
        </select>
      </div>

      {conArea && asignaturas.length > 0 && (
        <select
          aria-label="Área"
          value={asignaturaId ?? ''}
          onChange={e => elegirAsignatura(Number(e.target.value))}
        >
          {asignaturas.map(a => (
            <option key={a.id} value={a.id}>{a.nombre_display}</option>
          ))}
        </select>
      )}

      {conTrimestre && (
        <select
          aria-label="Trimestre"
          value={trimestre}
          onChange={e => elegirTrimestre(Number(e.target.value))}
        >
          {TRIMESTRES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      )}

      <span className="barra-clase-relleno" />

      {grupoId != null && (
        <Link to={`/grupos/${grupoId}`} className="barra-clase-ajustes" title="Configurar esta clase">
          ⚙ <span>Configurar</span>
        </Link>
      )}
    </div>
  )
}
