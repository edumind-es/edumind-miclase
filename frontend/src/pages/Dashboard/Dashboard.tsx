import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'

export default function Dashboard() {
  const { grupos, cargarGrupos, cargando } = useAppStore()

  useEffect(() => { cargarGrupos() }, [cargarGrupos])

  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <h1 className="page-title">Buenos días 👋</h1>
      <p style={{ color: 'var(--gris-600)', marginBottom: 28, textTransform: 'capitalize' }}>{hoy}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Grupos activos" value={grupos.length} icon="👥" color="var(--azul-700)" />
        <StatCard label="Alumnado total" value={grupos.reduce((s, g) => s + (g.num_alumnos || 0), 0)} icon="🎒" color="var(--verde-500)" />
        <StatCard label="Trimestre actual" value="2º" icon="📅" color="var(--ambar-500)" />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: 'var(--azul-700)' }}>Mis grupos</h2>

      {cargando && <p style={{ color: 'var(--gris-600)' }}>Cargando…</p>}

      {grupos.length === 0 && !cargando && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--gris-600)', marginBottom: 16 }}>Aún no tienes grupos. ¡Crea el primero!</p>
          <Link to="/grupos" className="btn-primary" style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 8, background: 'var(--azul-700)', color: 'white' }}>
            Crear grupo
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {grupos.map(g => (
          <Link key={g.id} to={`/grupos/${g.id}`} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ borderLeft: `4px solid ${g.color || 'var(--azul-500)'}`, transition: 'box-shadow .2s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--sombra-md)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--sombra)')}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{g.nombre}</div>
              <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 8 }}>
                {g.etapa === 'primaria' ? 'Primaria' : 'Secundaria'} · {g.curso_escolar}
              </div>
              <div style={{ fontSize: 13, color: 'var(--azul-500)', fontWeight: 600 }}>
                {g.num_alumnos || 0} alumnos
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: string; color: string }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>{label}</div>
      </div>
    </div>
  )
}
