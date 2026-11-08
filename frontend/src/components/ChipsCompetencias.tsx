/**
 * Con qué conecta un criterio: sus descriptores operativos o, si la comunidad
 * solo nombra la competencia clave, esa competencia. Lo dice el currículo
 * empaquetado en la app (`@/curriculo`, campos `descriptores`,
 * `competencias_clave` y `conexion_origen`); sin ellos no se pinta nada.
 */
import type { ConexionDeCriterio } from '@/db/competenciasClave'

export default function ChipsCompetencias({ criterio }: { criterio?: ConexionDeCriterio }) {
  const codigos = criterio?.descriptores?.length ? criterio.descriptores : criterio?.competencias_clave
  if (!codigos?.length) return null
  const estatal = criterio?.conexion_origen === 'estatal'
  return (
    <div data-chips-competencias style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5, alignItems: 'center' }}
      title={estatal ? 'Conexión tomada del Real Decreto: la comunidad no la declara.' : undefined}>
      {codigos.map(c => (
        <span key={c} style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: 'var(--gris-100)', color: 'var(--azul-700)', border: '1px solid var(--gris-300)' }}>
          {c}
        </span>
      ))}
      {estatal && <span style={{ fontSize: 10.5, color: 'var(--gris-500)' }}>†</span>}
    </div>
  )
}
