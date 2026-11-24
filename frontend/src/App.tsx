import { useEffect, useState } from 'react'
import Marca from '@/components/Marca'
import { Routes, Route, NavLink, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { ClaseActivaProvider, useClaseActiva } from '@/contexto/ClaseActiva'
import Dashboard from '@/pages/Dashboard/Dashboard'
import GruposPage from '@/pages/Grupos/GruposPage'
import EvaluacionPage from '@/pages/Evaluacion/EvaluacionPage'
import SeguimientoPage from '@/pages/Seguimiento/SeguimientoPage'
import InformesPage from '@/pages/Informes/InformesPage'
import SesionesPage from '@/pages/Sesiones/SesionesPage'
import TutoriasPage from '@/pages/Tutorias/TutoriasPage'
import PlanificacionPage from '@/pages/Planificacion/PlanificacionPage'
import EscanearPage from '@/pages/Escanear/EscanearPage'
import SincronizarPage from '@/pages/Sincronizar/SincronizarPage'
import CallbackPage from '@/pages/Auth/CallbackPage'
import BarraClase from '@/components/BarraClase'
import ExportImport from '@/components/ExportImport'
import EstadoConexion from '@/components/EstadoConexion'
import ActualizacionApp from '@/components/ActualizacionApp'
import SyncAutomatica from '@/components/SyncAutomatica'
import CopiaAutomatica from '@/components/CopiaAutomatica'
import NoEncontrada from '@/pages/NoEncontrada'
import InstalarPage from '@/pages/Instalar/InstalarPage'
import HubAreas from '@/pages/Areas/HubAreas'
import ElegirIdioma, { SelectorIdioma } from '@/components/ElegirIdioma'
import { useT, type Clave } from '@/i18n'
import { VERSION } from '@/version'
import { useAspecto } from '@/useAspecto'
import MarcoLamina from '@/components/marco/MarcoLamina'
import { useDatosSensibles } from '@/db/datosSensibles'

// El menú iba plano: nueve entradas al mismo nivel mezclando lo que se usa
// cada día con lo que se toca una vez por trimestre. Separarlo en dos bloques
// dice de un vistazo dónde se trabaja y dónde se configura.
// Las etiquetas son claves de `i18n/textos.ts`: el menú sale en el idioma elegido.
const NAV: { bloque: Clave; entradas: { to: string; label: Clave; icon: string }[] }[] = [
  {
    bloque: 'menu.aula',
    entradas: [
      { to: '/',            label: 'menu.inicio',      icon: '⊞' },
      { to: '/planificacion', label: 'menu.planificacion', icon: '🗓️' },
      { to: '/evaluacion',  label: 'menu.calificador', icon: '📋' },
      { to: '/escanear',    label: 'menu.examenes',    icon: '📝' },
      { to: '/sesiones',    label: 'menu.asistencia',  icon: '✅' },
      { to: '/seguimiento', label: 'menu.seguimiento', icon: '📈' },
      { to: '/tutorias',    label: 'menu.tutorias',    icon: '🤝' },
      { to: '/informes',    label: 'menu.informes',    icon: '📄' },
    ],
  },
  {
    bloque: 'menu.configuracion',
    entradas: [
      { to: '/grupos',      label: 'menu.clases',      icon: '👥' },
      { to: '/sincronizar', label: 'menu.sincronizar', icon: '🔄' },
      { to: '/instalar',    label: 'menu.instalar',    icon: '📲' },
    ],
  },
]

const K_PLEGADO = 'miclase_sidebar_plegado'

// Pantallas que trabajan sobre una clase concreta y por tanto llevan la barra
// de contexto. El escáner y la sincronización no: el escáner deduce el alumno
// del propio código y la sincronización es de todo el dispositivo. La
// configuración de la clase tampoco, porque ya lleva su propia cabecera.
const CON_BARRA = ['/', '/areas', '/evaluacion', '/sesiones', '/seguimiento', '/tutorias', '/informes', '/planificacion']

// El trimestre solo manda donde hay notas de por medio; en Alumnado sobra.
// Informes lleva su propio «Periodo», que además ofrece el curso completo.
// En Planificación manda la fecha, no el trimestre.
const SIN_TRIMESTRE = ['/informes', '/tutorias', '/planificacion']
// El área no pinta nada donde se trabaja con la clase entera. En el
// calificador sí: desde el rediseño (fase 2 · A) el área se elige aquí y no
// en una fila de pestañas propia.
const SIN_AREA = ['/areas', '/sesiones', '/informes', '/tutorias', '/planificacion']

function usarBarra(pathname: string) {
  const raiz = '/' + (pathname.split('/')[1] ?? '')
  if (!CON_BARRA.includes(raiz)) return null
  return { conArea: !SIN_AREA.includes(raiz), conTrimestre: !SIN_TRIMESTRE.includes(raiz) }
}

/**
 * `/alumnos` ya no es una pantalla: el alumnado vive en la pestaña «Alumnado»
 * de su clase, dentro de «Mis clases». La dirección se conserva para los
 * enlaces y marcadores de antes y lleva a la clase que diga `?grupo_id=` o,
 * si no, a la activa; sin ninguna, a la lista de clases.
 */
function IrAlAlumnado() {
  const { grupoId, cargando } = useClaseActiva()
  const [params] = useSearchParams()
  if (cargando) return null
  const pedida = Number(params.get('grupo_id'))
  const id = pedida > 0 ? pedida : grupoId
  return <Navigate to={id ? `/grupos/${id}?pestana=alumnado` : '/grupos'} replace />
}

function Layout() {
  const { modo, nombre, iniciarLogin, cerrarSesion, loginDisponible } = useAuth()
  const t = useT()
  const { pathname } = useLocation()
  const barra = usarBarra(pathname)
  const aspecto = useAspecto()
  const [exportOpen, setExportOpen] = useState(false)
  const [plegado, setPlegado] = useState(() => localStorage.getItem(K_PLEGADO) === '1')
  // Resuelve al arrancar si NEAE y evidencias van encendidos en este aparato,
  // y repinta todas las pantallas cuando el docente lo cambia en Alumnado
  useDatosSensibles()

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

  // Las pantallas y lo que flota sobre ellas son los mismos con los dos marcos
  const rutas = (
    <Routes>
      <Route path="/"              element={<Dashboard />} />
      <Route path="/grupos/*"      element={<GruposPage />} />
      <Route path="/alumnos/*"     element={<IrAlAlumnado />} />
      {/* El hub de áreas es de Lámina; con el aspecto de siempre lleva al Calificador */}
      <Route path="/areas"         element={aspecto === 'lamina' ? <HubAreas /> : <Navigate to="/evaluacion" replace />} />
      <Route path="/evaluacion/*"  element={<EvaluacionPage />} />
      <Route path="/escanear"      element={<EscanearPage />} />
      <Route path="/sesiones/*"    element={<SesionesPage />} />
      <Route path="/planificacion" element={<PlanificacionPage />} />
      <Route path="/seguimiento"   element={<SeguimientoPage />} />
      <Route path="/tutorias"      element={<TutoriasPage />} />
      <Route path="/informes"      element={<InformesPage />} />
      <Route path="/sincronizar"   element={<SincronizarPage />} />
      <Route path="/instalar"      element={<InstalarPage />} />
      <Route path="/auth/callback" element={<CallbackPage />} />
      {/* Sin esto, una URL desconocida pintaba el marco con el contenido vacío */}
      <Route path="*"              element={<NoEncontrada />} />
    </Routes>
  )
  const flotantes = (
    <>
      {exportOpen && <ExportImport onClose={() => setExportOpen(false)} />}
      <EstadoConexion />
      <ActualizacionApp />
      <SyncAutomatica />
      <CopiaAutomatica />
      <ElegirIdioma />
    </>
  )

  // Con el aspecto Lámina encendido en este aparato, el marco es otro; el de
  // siempre, que es lo que sigue, no se toca hasta la 2.0.0
  if (aspecto === 'lamina') return (
    <>
      <MarcoLamina barra={barra} alExportar={() => setExportOpen(true)}>{rutas}</MarcoLamina>
      {flotantes}
    </>
  )

  return (
    <div className={`layout${plegado ? ' plegado' : ''}`}>
      {/* Identidad Sistema Lámina (nivel 1): barra de mundos EDUmind */}
      <div className="lm-plate-top lm-plate-top--compact lm-plate-fixed" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </div>

      <aside className="sidebar">
        <div className="sidebar-cabecera">
          <div className="sidebar-logo"><Marca lado={26} /><span className="sidebar-logo-texto">EDUmind <span>MiClase</span></span></div>
          <button
            className="sidebar-toggle"
            onClick={() => setPlegado(p => !p)}
            title={t(plegado ? 'menu.desplegar' : 'menu.plegar')}
            aria-label={t(plegado ? 'menu.desplegarAria' : 'menu.plegarAria')}
            aria-expanded={!plegado}
          >
            {plegado ? '»' : '«'}
          </button>
        </div>

        <nav>
          {NAV.map(({ bloque, entradas }) => (
            <div key={bloque} className="nav-bloque">
              <div className="nav-bloque-titulo">{t(bloque)}</div>
              {entradas.map(({ to, label, icon }) => (
                <NavLink key={to} to={to} end={to === '/'} title={t(label)}
                  className={({ isActive }) => isActive ? 'active' : ''}>
                  <span className="nav-icono" aria-hidden="true">{icon}</span>
                  <span className="nav-texto">{t(label)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Panel de auth / backup en la parte baja del sidebar */}
        <div className="sidebar-panel">
          {modo === 'cargando' && (
            <div className="sidebar-panel-texto" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{t('menu.cargando')}</div>
          )}

          {modo === 'local' && (
            <div>
              <div className="sidebar-panel-texto" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                {t('menu.modoLocal')}
              </div>
              <button className="sidebar-btn" onClick={() => setExportOpen(true)} title={t('menu.exportarTitulo')}>
                📦 <span className="sidebar-panel-texto">{t('menu.exportar')}</span>
              </button>
              {loginDisponible && (
                <button className="sidebar-btn sidebar-btn--tenue" onClick={iniciarLogin} title={t('menu.conectar')}>
                  🔑 <span className="sidebar-panel-texto">{t('menu.conectar')}</span>
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
                {t('menu.conectado')}
              </div>
              <button className="sidebar-btn" onClick={() => setExportOpen(true)} title={t('menu.exportarTitulo')}>
                📦 <span className="sidebar-panel-texto">{t('menu.exportar')}</span>
              </button>
              <button
                onClick={cerrarSesion}
                className="sidebar-panel-texto"
                style={{ width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}
              >
                {t('menu.cerrarSesion')}
              </button>
            </div>
          )}
          <SelectorIdioma />
        </div>

        <div className="sidebar-pie">
          EDUmind MiClase v{VERSION}
          <br />
          © {new Date().getFullYear()} EDUmind® por Luis Vilela Acuña
          <br />
          {t('menu.softwareLibre')}{' '}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">AGPL-3.0-or-later</a>
          {' / '}
          <a href="https://eupl.eu/1.2/es/" target="_blank" rel="noopener noreferrer">EUPL-1.2</a>
          <br />
          <a href="https://github.com/edumind-es/edumind-miclase/blob/main/PRIVACIDAD.md"
             target="_blank" rel="noopener noreferrer">{t('menu.privacidad')}</a>
          {' · '}
          <a href="https://github.com/edumind-es/edumind-miclase" target="_blank" rel="noopener noreferrer">
            {t('menu.codigo')}
          </a>
        </div>
      </aside>

      <main className="main-content">
        {barra && <BarraClase conArea={barra.conArea} conTrimestre={barra.conTrimestre} />}
        {rutas}
      </main>

      {flotantes}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ClaseActivaProvider>
        <Layout />
      </ClaseActivaProvider>
    </AuthProvider>
  )
}
