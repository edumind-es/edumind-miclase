import { useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import Dashboard from '@/pages/Dashboard/Dashboard'
import GruposPage from '@/pages/Grupos/GruposPage'
import AlumnosPage from '@/pages/Alumnos/AlumnosPage'
import EvaluacionPage from '@/pages/Evaluacion/EvaluacionPage'
import SeguimientoPage from '@/pages/Seguimiento/SeguimientoPage'
import InformesPage from '@/pages/Informes/InformesPage'
import SesionesPage from '@/pages/Sesiones/SesionesPage'
import CallbackPage from '@/pages/Auth/CallbackPage'
import ExportImport from '@/components/ExportImport'

const NAV = [
  { to: '/',            label: 'Dashboard',   icon: '⊞' },
  { to: '/grupos',      label: 'Mis grupos',  icon: '👥' },
  { to: '/alumnos',     label: 'Alumnado',    icon: '🎒' },
  { to: '/evaluacion',  label: 'Evaluación',  icon: '📋' },
  { to: '/sesiones',    label: 'Asistencia',  icon: '✅' },
  { to: '/seguimiento', label: 'Seguimiento', icon: '📈' },
  { to: '/informes',    label: 'Informes',    icon: '📄' },
]

function Layout() {
  const { modo, nombre, iniciarLogin, cerrarSesion, authConfig } = useAuth()
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">EDUmind <span>MiClase</span></div>

        <nav>
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => isActive ? 'active' : ''}>
              <span>{icon}</span> {label}
            </NavLink>
          ))}
        </nav>

        {/* Panel de auth / backup en la parte baja del sidebar */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px' }}>
          {modo === 'cargando' && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Cargando…</div>
          )}

          {modo === 'local' && (
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                Modo local — datos en este servidor
              </div>
              <button
                onClick={() => setExportOpen(true)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', marginBottom: 6, textAlign: 'left' }}
              >
                📦 Exportar / Importar
              </button>
              {authConfig?.enabled && (
                <button
                  onClick={iniciarLogin}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                >
                  🔑 Conectar EDUmind
                </button>
              )}
            </div>
          )}

          {modo === 'authentik' && (
            <div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600, marginBottom: 4 }}>
                🟢 {nombre}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                Conectado con EDUmind
              </div>
              <button
                onClick={() => setExportOpen(true)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', marginBottom: 6, textAlign: 'left' }}
              >
                📦 Exportar / Importar
              </button>
              <button
                onClick={cerrarSesion}
                style={{ width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: '8px 16px', fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
          EDUmind MiClase v0.1
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/grupos/*"      element={<GruposPage />} />
          <Route path="/alumnos/*"     element={<AlumnosPage />} />
          <Route path="/evaluacion/*"  element={<EvaluacionPage />} />
          <Route path="/sesiones/*"    element={<SesionesPage />} />
          <Route path="/seguimiento"   element={<SeguimientoPage />} />
          <Route path="/informes"      element={<InformesPage />} />
          <Route path="/auth/callback" element={<CallbackPage />} />
        </Routes>
      </main>

      {exportOpen && <ExportImport onClose={() => setExportOpen(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Layout />
    </AuthProvider>
  )
}
