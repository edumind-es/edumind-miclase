/**
 * El marco de la app con el aspecto Lámina: menú, barra superior, colofón y,
 * en el móvil, barra inferior. Es una pieza aparte del marco de siempre
 * (`Layout` en App.tsx), que no se toca: con Lámina apagada se monta aquel.
 *
 * Lo que se decidió sobre la maqueta (nov 2026):
 *  · la cabecera del menú y la barra superior miden lo mismo y comparten filete;
 *  · el menú tiene tres formas —ancho, plegado con icono y nombre corto, y
 *    barra inferior con «Más» en el móvil— y la decide el ancho de la ventana,
 *    no una media query suelta: un icono solo obliga a adivinar;
 *  · el pie del menú es el estado de ESTE aparato (copia, versión); lo legal va
 *    en el colofón, al final de la página, y ya no a 10 px;
 *  · la versión tiene su fila y abre «Acerca de», donde van también el idioma,
 *    el aspecto, la cuenta e «Instalar».
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import '@/lamina-marco.css'
import Marca from '@/components/Marca'
import Icono from '@/components/comunes/Icono'
import Lista from '@/components/comunes/Lista'
import Dialogo from '@/components/comunes/Dialogo'
import { useAuth } from '@/auth/AuthProvider'
import { useClaseActiva } from '@/contexto/ClaseActiva'
import { identidadDeAreas } from '@/db/areas'
import Sigla from '@/components/comunes/Sigla'
import { IDIOMAS, NOMBRE_IDIOMA, fijarIdioma, useIdioma, useT, type Clave } from '@/i18n'
import { fijarAspecto } from '@/aspecto'
import { fijarModoNotas } from '@/notas'
import { useModoNotas } from '@/useAspecto'
import { VERSION } from '@/version'
import type { NombreIcono } from '@/iconos'

/** `tambien`: otras rutas que son esta misma entrada (el Calificador entra por el hub de áreas). */
interface Entrada { to: string; clave: Clave; corto: Clave; icono: NombreIcono; bloque?: Clave; tambien?: string[] }

const ENTRADAS: Entrada[] = [
  { to: '/',              clave: 'menu.inicio',        corto: 'marco.corto.inicio',        icono: 'inicio', bloque: 'menu.aula' },
  { to: '/planificacion', clave: 'menu.planificacion', corto: 'marco.corto.planificacion', icono: 'planificacion' },
  { to: '/areas',         clave: 'menu.calificador',   corto: 'marco.corto.calificador',   icono: 'calificador', tambien: ['/evaluacion'] },
  { to: '/escanear',      clave: 'menu.examenes',      corto: 'marco.corto.examenes',      icono: 'examenes' },
  { to: '/sesiones',      clave: 'menu.asistencia',    corto: 'marco.corto.asistencia',    icono: 'asistencia' },
  { to: '/seguimiento',   clave: 'menu.seguimiento',   corto: 'marco.corto.seguimiento',   icono: 'seguimiento' },
  { to: '/tutorias',      clave: 'menu.tutorias',      corto: 'marco.corto.tutorias',      icono: 'tutorias' },
  { to: '/informes',      clave: 'menu.informes',      corto: 'marco.corto.informes',      icono: 'informes' },
  { to: '/grupos',        clave: 'menu.clases',        corto: 'marco.corto.clases',        icono: 'clases', bloque: 'menu.configuracion' },
  { to: '/sincronizar',   clave: 'menu.sincronizar',   corto: 'marco.corto.sincronizar',   icono: 'sincronizar' },
]
/** Lo que cabe en la barra inferior del móvil; el resto va en «Más». */
const EN_BARRA = ['/', '/areas', '/escanear', '/sesiones']

export type Forma = 'ancho' | 'rail' | 'movil'
const K_MENU = 'miclase.marco.menu'

/** La forma del marco: la decide el ancho de la ventana, y entre ancho y plegado, el docente. */
export function formaDe(ancho: number, elegido: string | null): Forma {
  if (ancho < 700) return 'movil'
  if (elegido === 'rail' || elegido === 'ancho') return elegido
  return ancho < 1100 ? 'rail' : 'ancho'
}

function useForma(): [Forma, () => void] {
  const [ancho, setAncho] = useState(() => window.innerWidth)
  const [elegido, setElegido] = useState<string | null>(() => { try { return localStorage.getItem(K_MENU) } catch { return null } })
  useEffect(() => {
    const medir = () => setAncho(window.innerWidth)
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  const forma = formaDe(ancho, elegido)
  const alternar = () => {
    const nuevo = forma === 'rail' ? 'ancho' : 'rail'
    try { localStorage.setItem(K_MENU, nuevo) } catch { /* vale para esta sesión */ }
    setElegido(nuevo)
  }
  return [forma, alternar]
}

const enRuta = (pathname: string, to: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/'))
const esActual = (pathname: string, e: Entrada) => enRuta(pathname, e.to) || !!e.tambien?.some(r => enRuta(pathname, r))

export default function MarcoLamina({ barra, alExportar, children }: {
  /** Qué enseña la barra superior en esta pantalla, o null si no lleva clase. */
  barra: { conArea: boolean; conTrimestre: boolean } | null
  alExportar: () => void
  children: ReactNode
}) {
  const t = useT()
  const [forma, alternarMenu] = useForma()
  const [acerca, setAcerca] = useState(false)
  // Con sesión de EDUmind, el pie del menú lo dice: es parte del estado de este aparato
  const { modo, nombre } = useAuth()
  const { pathname } = useLocation()
  const navegar = useNavigate()

  // Atajo de siempre: Ctrl/Cmd + B pliega y despliega. Se registra UNA vez y
  // lee la función por referencia: registrado en cada pintado, se perdía con
  // una pulsación de verdad, porque el marco de siempre (que sigue escuchando
  // por debajo) repinta en mitad de la pulsación y el escuchador se quitaba y
  // se volvía a poner justo entonces, ya tarde para esa tecla.
  const alternar = useRef(alternarMenu)
  alternar.current = alternarMenu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); alternar.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const entrada = (e: Entrada) => (
    // `Link` y no `NavLink`: «estás aquí» lo decide el marco, porque una entrada
    // puede ser varias rutas (el Calificador es el hub de áreas y la tabla)
    <Link key={e.to} to={e.to} data-entrada={e.icono}
      className="ml-entrada" aria-current={esActual(pathname, e) ? 'page' : undefined}>
      <Icono nombre={e.icono} />
      <span className="ml-largo">{t(e.clave)}</span>
      <span className="ml-corto">{t(e.corto)}</span>
    </Link>
  )
  const fueraDeBarra = ENTRADAS.filter(e => !EN_BARRA.includes(e.to))

  return (
    <div className="ml-app" data-forma={forma} data-marco-lamina>
      <div className="ml-sistema" aria-hidden="true" />
      <div className="ml-mundos" aria-hidden="true"><i /><i /><i /><i /><i /></div>

      <aside className="ml-menu">
        <div className="ml-menu-cab"><Marca lado={26} fondo="lamina" /><span>MiClase</span></div>
        <nav aria-label={t('marco.principal')}>
          {ENTRADAS.map((e, i) => (
            <Fragment key={e.to}>
              {e.bloque && <>{i > 0 && <hr />}<span className="ml-rotulo">{t(e.bloque)}</span></>}
              {entrada(e)}
            </Fragment>
          ))}
        </nav>
        <div className="ml-estado">
          <button type="button" className="ml-entrada" onClick={alExportar} data-marco-copia title={t('menu.exportarTitulo')}>
            <Icono nombre="importar" /><span className="ml-largo">{t('marco.copia')}</span><span className="ml-corto">{t('marco.copiaCorto')}</span>
          </button>
          {modo === 'authentik' && (
            <button type="button" className="ml-entrada" onClick={() => setAcerca(true)} aria-haspopup="dialog" data-marco-cuenta title={nombre ?? undefined}>
              <Icono nombre="alumnado" /><span className="ml-largo">{t('menu.conectado')}</span><span className="ml-corto">EDUmind</span>
            </button>
          )}
          <button type="button" className="ml-entrada ml-version" onClick={() => setAcerca(true)} aria-haspopup="dialog" data-marco-version
            aria-label={`${t('marco.acerca')} · ${VERSION}`}>
            <b><span className="ml-largo">MiClase </span>{VERSION}</b>
          </button>
          <button type="button" className="ml-entrada" onClick={alternarMenu} data-marco-plegar
            aria-label={t(forma === 'rail' ? 'menu.desplegarAria' : 'menu.plegarAria')} aria-expanded={forma !== 'rail'}>
            <Icono nombre="panel" /><span className="ml-largo">{t('marco.plegar')}</span><span className="ml-corto">{t('marco.desplegar')}</span>
          </button>
        </div>
      </aside>

      <div className="ml-principal">
        <BarraLamina barra={barra} forma={forma} />
        <div className="ml-desplaza" data-marco-desplaza>
          <main className="main-content">{children}</main>
          <footer className="ml-colofon">
            <div className="ml-colofon-fila">
              <span>EDUmind® · Luis Vilela Acuña</span>
              <span>
                {t('menu.softwareLibre')}{' '}
                <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">AGPL-3.0-or-later</a>
                {' / '}
                <a href="https://eupl.eu/1.2/es/" target="_blank" rel="noopener noreferrer">EUPL-1.2</a>
                {' · '}
                <a href="https://github.com/edumind-es/edumind-miclase/blob/main/PRIVACIDAD.md" target="_blank" rel="noopener noreferrer">{t('menu.privacidad')}</a>
                {' · '}
                <a href="https://github.com/edumind-es/edumind-miclase" target="_blank" rel="noopener noreferrer">{t('menu.codigo')}</a>
              </span>
            </div>
            <div className="ml-mundos" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          </footer>
        </div>
      </div>

      <nav className="ml-inferior" aria-label={t('marco.principal')}>
        {ENTRADAS.filter(e => EN_BARRA.includes(e.to)).map(entrada)}
        <Lista<string> etiqueta={t('marco.mas')} className="ml-entrada" data-marco-mas
          actual={fueraDeBarra.some(e => esActual(pathname, e))}
          opciones={[
            ...fueraDeBarra.map(e => ({ valor: e.to, texto: t(e.clave), icono: e.icono })),
            { valor: '#copia', texto: t('marco.copia'), icono: 'importar' as const },
            { valor: '#acerca', texto: t('marco.acerca'), meta: VERSION },
          ]}
          alElegir={v => (v === '#copia' ? alExportar() : v === '#acerca' ? setAcerca(true) : navegar(v))}>
          <Icono nombre="mas" /><span className="ml-corto">{t('marco.mas')}</span>
        </Lista>
      </nav>

      {acerca && <Acerca onCerrar={() => setAcerca(false)} />}
    </div>
  )
}

/** Barra superior: la clase, el área y el trimestre en curso. Siempre está, para que su filete no se corte. */
function BarraLamina({ barra, forma }: { barra: { conArea: boolean; conTrimestre: boolean } | null; forma: Forma }) {
  const t = useT()
  const { grupos, grupoId, asignaturas, asignaturaId, trimestre, cargando, elegirGrupo, elegirAsignatura, elegirTrimestre } = useClaseActiva()
  const hayClase = !!barra && !cargando && grupos.length > 0
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const identidad = identidadDeAreas(asignaturas)
  const conArea = hayClase && barra.conArea && asignaturas.length > 0
  const suya = conArea && asignaturaId != null ? identidad.get(asignaturaId) : undefined
  // «Todas las áreas» solo donde hay hub al que volver: en el Calificador, y con más de un área
  const conHub = asignaturas.length > 1 && (pathname === '/evaluacion' || pathname.startsWith('/evaluacion/'))

  return (
    <>
    <div className="ml-superior" data-marco-superior>
      <span className="ml-superior-marca"><Marca lado={26} fondo="lamina" /></span>
      {hayClase && (
        <div className="ml-dato">
          <span className="ml-rotulo">{t('marco.clase')}</span>
          <Lista<number> etiqueta={t('marco.clase')} data-marco-clase valor={grupoId}
            opciones={grupos.map(g => ({ valor: g.id!, texto: `${g.nombre} · ${g.curso}º`, enCampo: g.nombre }))}
            alElegir={v => elegirGrupo(v)} />
        </div>
      )}
      {conArea && (
        <div className="ml-dato ml-dato--area">
          <span className="ml-rotulo">{t('marco.area')}</span>
          <Lista<number> etiqueta={t('marco.area')} data-marco-area valor={asignaturaId}
            opciones={[
              ...(conHub ? [{ valor: 0, texto: t('marco.todasLasAreas'), icono: 'rejilla' as const }] : []),
              ...asignaturas.map(a => { const id = identidad.get(a.id!)!; return { valor: a.id!, texto: a.nombre_display, antes: <Sigla sigla={id.sigla} color={id.color} /> } }),
            ]}
            alElegir={v => (v === 0 ? navegar('/areas') : elegirAsignatura(v))} />
        </div>
      )}
      {hayClase && barra.conTrimestre && (
        <div className="ml-dato">
          <span className="ml-rotulo">{t('marco.trimestre')}</span>
          {forma === 'movil'
            ? <Lista<number> etiqueta={t('marco.trimestre')} data-marco-trimestre valor={trimestre}
                opciones={[1, 2, 3].map(n => ({ valor: n, texto: `${n}T` }))} alElegir={v => elegirTrimestre(v)} />
            : <div className="ml-seg" role="group" aria-label={t('marco.trimestre')} data-marco-trimestre>
                {[1, 2, 3].map(n => (
                  <button key={n} type="button" aria-pressed={trimestre === n} aria-label={`${t('marco.trimestre')} ${n}`} onClick={() => elegirTrimestre(n)}>{n}T</button>
                ))}
              </div>}
        </div>
      )}
      <span className="ml-relleno" />
      {hayClase && grupoId != null && (
        <Link to={`/grupos/${grupoId}`} className="ml-superior-ajustes" aria-label={t('marco.configurar')} title={t('marco.configurar')}>
          <Icono nombre="ajustes" />
        </Link>
      )}
    </div>
    {/* El color del área, bajo el filete de la barra: «estás en esta área» */}
    {suya && <div className="ml-franja-area" data-marco-franja data-sigla={suya.sigla} style={{ background: suya.color }} aria-hidden="true" />}
    </>
  )
}

/** «Acerca de»: el sitio de la versión y de lo que se elige una vez por aparato. */
function Acerca({ onCerrar }: { onCerrar: () => void }) {
  const t = useT()
  const idioma = useIdioma()
  const notas = useModoNotas()
  const { modo, nombre, iniciarLogin, cerrarSesion, loginDisponible } = useAuth()
  const fila = (rotulo: string, contenido: ReactNode, dato: string) => (
    <div data-acerca={dato}><dt className="ml-rotulo">{rotulo}</dt><dd>{contenido}</dd></div>
  )
  return (
    <Dialogo titulo="MiClase" onCerrar={onCerrar} ancho={540} data-acerca-dialogo>
      <dl className="ml-acerca">
        {fila(t('acerca.version'), <strong>{VERSION}</strong>, 'version')}
        {fila(t('acerca.datos'), t('acerca.datosTexto'), 'datos')}
        {fila(t('idioma.menu'), (
          <div className="ml-seg" role="group" aria-label={t('idioma.menu')}>
            {IDIOMAS.map(i => (
              <button key={i} type="button" lang={i} data-idioma={i} aria-pressed={i === idioma} onClick={() => { if (i !== idioma) fijarIdioma(i) }}>{NOMBRE_IDIOMA[i]}</button>
            ))}
          </div>
        ), 'idioma')}
        {fila(t('acerca.notas'), (
          <div className="ml-seg" role="group" aria-label={t('acerca.notas')}>
            {(['filete', 'relleno'] as const).map(n => (
              <button key={n} type="button" data-notas-elegir={n} aria-pressed={n === notas} onClick={() => fijarModoNotas(n)}>
                {t(n === 'filete' ? 'acerca.notasFilete' : 'acerca.notasRelleno')}
              </button>
            ))}
          </div>
        ), 'notas')}
        {fila(t('acerca.aspecto'), (
          <>
            <div className="ml-seg" role="group" aria-label={t('acerca.aspecto')}>
              <button type="button" aria-pressed="true" data-aspecto-elegir="lamina">{t('acerca.aspectoLamina')}</button>
              <button type="button" aria-pressed="false" data-aspecto-elegir="clasico" onClick={() => fijarAspecto('clasico')}>{t('acerca.aspectoClasico')}</button>
            </div>
            <p className="ml-nota">{t('acerca.aspectoNota')}</p>
          </>
        ), 'aspecto')}
        {fila(t('acerca.cuenta'), (
          modo === 'authentik'
            ? <>{nombre} · {t('menu.conectado')} <button type="button" className="boton-enlace" onClick={cerrarSesion}>{t('menu.cerrarSesion')}</button></>
            : <>{t('menu.modoLocal')}{loginDisponible && <> <button type="button" className="boton-enlace" onClick={iniciarLogin}>{t('menu.conectar')}</button></>}</>
        ), 'cuenta')}
        {fila(t('acerca.instalar'), <Link to="/instalar" onClick={onCerrar}>{t('acerca.instalarEnlace')}</Link>, 'instalar')}
        {fila(t('acerca.autoria'), 'EDUmind® · Luis Vilela Acuña', 'autoria')}
        {fila(t('acerca.licencia'), <>{t('menu.softwareLibre')} AGPL-3.0-or-later / EUPL-1.2</>, 'licencia')}
        {fila(t('acerca.plano'), t('acerca.planoTexto'), 'plano')}
      </dl>
    </Dialogo>
  )
}
