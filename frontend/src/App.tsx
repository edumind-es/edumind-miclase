import { useEffect, useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import Dashboard from '@/pages/Dashboard/Dashboard'
import GruposPage from '@/pages/Grupos/GruposPage'
import AlumnosPage from '@/pages/Alumnos/AlumnosPage'
import EvaluacionPage from '@/pages/Evaluacion/EvaluacionPage'
import SeguimientoPage from '@/pages/Seguimiento/SeguimientoPage'
import InformesPage from '@/pages/Informes/InformesPage'
import SesionesPage from '@/pages/Sesiones/SesionesPage'
import EscanearPage from '@/pages/Escanear/EscanearPage'
import SincronizarPage from '@/pages/Sincronizar/SincronizarPage'
import CallbackPage from '@/pages/Auth/CallbackPage'
import ExportImport from '@/components/ExportImport'
import EstadoConexion from '@/components/EstadoConexion'

const NAV = [
  { to: '/',            label: 'Inicio',      icon: '⊞' },
  { to: '/grupos',      label: 'Mis clases',  icon: '👥' },
  { to: '/alumnos',     label: 'Alumnado',    icon: '🎒' },
  { to: '/evaluacion',  label: 'Evaluación',  icon: '📋' },
  { to: '/escanear',    label: 'Evaluar QR',  icon: '📷' },
  { to: '/sesiones',    label: 'Asistencia',  icon: '✅' },
  { to: '/seguimiento', label: 'Seguimiento', icon: '📈' },
  { to: '/informes',    label: 'Informes',    icon: '📄' },
  { to: '/sincronizar', label: 'Sincronizar', icon: '🔄' },
]

const K_PLEGADO = 'miclase_sidebar_plegado'

function Layout() {
  const { modo, nombre, iniciarLogin, cerrarSesion, authConfig } = useAuth()
  const [exportOpen, setExportOpen] = useState(false)
  const [plegado, setPlegado] = useState(() => localStorage.getItem(K_PLEGADO) === '1')

  useEffect(() => {
    localStorage.setItem(K_PLEGADO, plegado ? '1' : '0')
  }, [plegado])

  // Atajo: Ctrl/Cmd + B pliega y despliega, como en cualquier editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setPlegado(p => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`layout${plegado ? ' plegado' : ''}`}>
      {/* Identidad Sistema Lámina (nivel 1): barra de mundos EDUmind */}
      <div className="lm-plate-top lm-plate-top--compact lm-plate-fixed" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </div>

      <aside className="sidebar">
        <div className="sidebar-cabecera">
          <div className="sidebar-logo">EDUmind <span>MiClase</span></div>
          <button
            className="sidebar-toggle"
            onClick={() => setPlegado(p => !p)}
            title={`${plegado ? 'Desplegar' : 'Plegar'} el menú (Ctrl+B)`}
            aria-label={plegado ? 'Desplegar el menú lateral' : 'Plegar el menú lateral'}
            aria-expanded={!plegado}
          >
            {plegado ? '»' : '«'}
          </button>
        </div>

        <nav>
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/'} title={label}
              className={({ isActive }) => isActive ? 'active' : ''}>
              <span className="nav-icono" aria-hidden="true">{icon}</span>
              <span className="nav-texto">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Panel de auth / backup en la parte baja del sidebar */}
        <div className="sidebar-panel">
          {modo === 'cargando' && (
            <div className="sidebar-panel-texto" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Cargando…</div>
          )}

          {modo === 'local' && (
            <div>
              <div className="sidebar-panel-texto" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                Modo local — datos solo en este dispositivo
              </div>
              <button className="sidebar-btn" onClick={() => setExportOpen(true)} title="Exportar / Importar copia de seguridad">
                📦 <span className="sidebar-panel-texto">Exportar / Importar</span>
              </button>
              {authConfig?.enabled && (
                <button className="sidebar-btn sidebar-btn--tenue" onClick={iniciarLogin} title="Conectar con EDUmind">
                  🔑 <span className="sidebar-panel-texto">Conectar EDUmind</span>
                </button>
              )}
            </div>
          )}

          {modo === 'authentik' && (
            <div>
              <div className="sidebar-panel-texto" style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600, marginBottom: 4 }}>
                🟢 {nombre}
              </div>
              <div className="sidebar-panel-texto" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                Conectado con EDUmind
              </div>
              <button className="sidebar-btn" onClick={() => setExportOpen(true)} title="Exportar / Importar copia de seguridad">
                📦 <span className="sidebar-panel-texto">Exportar / Importar</span>
              </button>
              <button
                onClick={cerrarSesion}
                className="sidebar-panel-texto"
                style={{ width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>

        <div className="sidebar-pie">
          EDUmind MiClase v1.0
          <br />
          © {new Date().getFullYear()} EDUmind® por Luis Vilela Acuña
          <br />
          Software libre:{' '}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">AGPL-3.0-or-later</a>
          {' / '}
          <a href="https://eupl.eu/1.2/es/" target="_blank" rel="noopener noreferrer">EUPL-1.2</a>
          <br />
          <a href="https://github.com/edumind-es/edumind-miclase/blob/main/PRIVACIDAD.md"
             target="_blank" rel="noopener noreferrer">Privacidad y datos</a>
          {' · '}
          <a href="https://github.com/edumind-es/edumind-miclase" target="_blank" rel="noopener noreferrer">
            Código fuente
          </a>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/grupos/*"      element={<GruposPage />} />
          <Route path="/alumnos/*"     element={<AlumnosPage />} />
          <Route path="/evaluacion/*"  element={<EvaluacionPage />} />
          <Route path="/escanear"      element={<EscanearPage />} />
          <Route path="/sesiones/*"    element={<SesionesPage />} />
          <Route path="/seguimiento"   element={<SeguimientoPage />} />
          <Route path="/informes"      element={<InformesPage />} />
          <Route path="/sincronizar"   element={<SincronizarPage />} />
          <Route path="/auth/callback" element={<CallbackPage />} />
        </Routes>
      </main>

      {exportOpen && <ExportImport onClose={() => setExportOpen(false)} />}
      <EstadoConexion />
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
