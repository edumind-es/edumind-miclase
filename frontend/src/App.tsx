import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard/Dashboard'
import GruposPage from '@/pages/Grupos/GruposPage'
import AlumnosPage from '@/pages/Alumnos/AlumnosPage'
import EvaluacionPage from '@/pages/Evaluacion/EvaluacionPage'
import SeguimientoPage from '@/pages/Seguimiento/SeguimientoPage'
import InformesPage from '@/pages/Informes/InformesPage'

const NAV = [
  { to: '/',            label: 'Dashboard',    icon: '⊞' },
  { to: '/grupos',      label: 'Mis grupos',   icon: '👥' },
  { to: '/alumnos',     label: 'Alumnado',     icon: '🎒' },
  { to: '/evaluacion',  label: 'Evaluación',   icon: '📋' },
  { to: '/seguimiento', label: 'Seguimiento',  icon: '📈' },
  { to: '/informes',    label: 'Informes',     icon: '📄' },
]

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">EDUmind <span>MiClase</span></div>
        <nav>
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              <span>{icon}</span> {label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', fontSize: '11px', color: 'rgba(255,255,255,0.35)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          EDUmind MiClase v0.1
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/"            element={<Dashboard />} />
          <Route path="/grupos/*"    element={<GruposPage />} />
          <Route path="/alumnos/*"   element={<AlumnosPage />} />
          <Route path="/evaluacion/*" element={<EvaluacionPage />} />
          <Route path="/seguimiento" element={<SeguimientoPage />} />
          <Route path="/informes"    element={<InformesPage />} />
        </Routes>
      </main>
    </div>
  )
}
