/**
 * Inicio — el puesto de mando del docente.
 *
 * Antes esto era el asistente de puesta en marcha a pantalla completa: en
 * octubre seguía recibiendo al docente con «paso 5 de 6», y no había manera de
 * saber de un vistazo en qué clase estaba ni qué le tocaba hacer hoy. Ahora
 * enseña la clase activa, lo que puede hacer con ella ahora mismo y, solo si
 * falta algo, el aviso de configuración.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEstadoConfiguracion, getSesiones, type PasoEstado } from '@/db/queries'
import { useClaseActiva } from '@/contexto/ClaseActiva'
import PuestaEnMarcha from '@/components/PuestaEnMarcha'
import InstalarApp from '@/components/InstalarApp'

function hoyISO() { return new Date().toISOString().slice(0, 10) }

/** `capitalize` del CSS pone en mayúscula cada palabra: «Lunes, 7 De Septiembre». */
function conMayusculaInicial(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

export default function Dashboard() {
  const { grupos, grupo, grupoId, asignaturas, trimestre, cargando } = useClaseActiva()
  const [estado, setEstado] = useState<PasoEstado | null>(null)
  const [sesionHoy, setSesionHoy] = useState<{ id: number } | null>(null)

  useEffect(() => {
    getEstadoConfiguracion(grupoId).then(setEstado).catch(() => setEstado(null))
  }, [grupoId])

  useEffect(() => {
    if (grupoId == null) { setSesionHoy(null); return }
    getSesiones(grupoId)
      .then(ss => setSesionHoy((ss.find(s => s.fecha === hoyISO()) as { id: number }) ?? null))
      .catch(() => setSesionHoy(null))
  }, [grupoId])

  const fecha = conMayusculaInicial(
    new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))
  const hora = new Date().getHours()
  const saludo = hora < 13 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'

  if (cargando) return <p style={{ color: 'var(--gris-600)' }}>Cargando…</p>

  // ── Primera vez: sin clases no hay nada que enseñar, hay que explicar ──
  if (grupos.length === 0) return <Bienvenida />

  const listaParaEvaluar = !!estado && estado.asignaturas > 0 && estado.alumnos > 0
  const trimestreLabel = trimestre === 1 ? '1er' : trimestre === 2 ? '2º' : '3er'

  return (
    <>
      <div className="home-cabecera">
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>{saludo}</h1>
          <p style={{ color: 'var(--gris-600)', fontSize: 14 }}>{fecha}</p>
        </div>
        {grupo && (
          <div className="home-clase" style={{ borderLeftColor: grupo.color || 'var(--azul-500)' }}>
            <div className="home-clase-nombre">{grupo.nombre}</div>
            <div className="home-clase-datos">
              {grupo.etapa === 'primaria' ? 'Primaria' : 'Secundaria'} · {grupo.curso}º ·{' '}
              {grupo.num_alumnos || 0} alumnos · {asignaturas.length} áreas · {trimestreLabel} trimestre
            </div>
          </div>
        )}
      </div>

      {estado && <PuestaEnMarcha estado={estado} nombreClase={grupo?.nombre} />}

      <h2 className="home-titulo">Hoy</h2>
      <div className="home-acciones">
        <AccionGrande
          to="/sesiones" icono="✅" titulo="Pasar lista"
          pie={sesionHoy ? 'Ya hay sesión de hoy — revisar' : 'Sin sesión de hoy todavía'}
          color="var(--verde-500)" activa={estado ? estado.alumnos > 0 : false}
          motivoInactiva="Añade alumnado a esta clase primero"
        />
        <AccionGrande
          to="/evaluacion" icono="📋" titulo="Calificar"
          pie={estado?.criteriosSinInstrumento
            ? `${estado.criteriosSinInstrumento} criterios sin instrumento`
            : 'Matriz de alumnado × criterios'}
          color="var(--azul-700)" activa={listaParaEvaluar}
          motivoInactiva="Elige las áreas de esta clase primero"
        />
        <AccionGrande
          to="/escanear" icono="📷" titulo="Evaluar con QR"
          pie="Apunta al código de la mesa"
          color="var(--ambar-500)" activa={estado ? estado.alumnos > 0 : false}
          motivoInactiva="Añade alumnado a esta clase primero"
        />
      </div>

      <InstalarApp />

      <h2 className="home-titulo">Mis clases</h2>
      <div className="home-clases">
        {grupos.map(g => (
          <Link key={g.id} to={`/grupos/${g.id}`} className="home-tarjeta-clase"
            style={{ borderLeftColor: g.color || 'var(--azul-500)' }}>
            <div className="home-tarjeta-nombre">{g.nombre}</div>
            <div className="home-tarjeta-datos">
              {g.etapa === 'primaria' ? 'Primaria' : 'Secundaria'} · {g.curso}º · {g.curso_escolar}
            </div>
            <div className="home-tarjeta-alumnos">{g.num_alumnos || 0} alumnos</div>
          </Link>
        ))}
        <Link to="/grupos/nuevo" className="home-tarjeta-nueva">
          <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
          <span>Nueva clase</span>
        </Link>
      </div>
    </>
  )
}

/** Acción de un toque. Si no se puede usar todavía, dice por qué en vez de fallar. */
function AccionGrande({ to, icono, titulo, pie, color, activa, motivoInactiva }: {
  to: string; icono: string; titulo: string; pie: string
  color: string; activa: boolean; motivoInactiva: string
}) {
  if (!activa) {
    return (
      <div className="accion-grande inactiva" title={motivoInactiva}>
        <span className="accion-icono" style={{ background: 'var(--gris-100)' }} aria-hidden="true">{icono}</span>
        <span>
          <span className="accion-titulo">{titulo}</span>
          <span className="accion-pie">{motivoInactiva}</span>
        </span>
      </div>
    )
  }
  return (
    <Link to={to} className="accion-grande">
      <span className="accion-icono" style={{ background: color + '1f', color }} aria-hidden="true">{icono}</span>
      <span>
        <span className="accion-titulo">{titulo}</span>
        <span className="accion-pie">{pie}</span>
      </span>
    </Link>
  )
}

/** Pantalla de primera vez: qué es esto y por dónde se empieza. */
function Bienvenida() {
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', paddingTop: 12 }}>
      <h1 className="page-title" style={{ marginBottom: 8 }}>Bienvenido a EDUmind MiClase</h1>
      <p style={{ color: 'var(--gris-600)', lineHeight: 1.7, marginBottom: 18 }}>
        Tu cuaderno de evaluación competencial LOMLOE. Todo lo que escribas —clases, alumnado,
        calificaciones, evidencias— se guarda <strong>en este dispositivo</strong> y funciona sin
        conexión. El servidor no puede leer nada de eso.
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--azul-700)', marginBottom: 12 }}>
          Cómo funciona
        </h2>
        <ol style={{ paddingLeft: 20, fontSize: 13.5, color: 'var(--gris-600)', lineHeight: 1.85 }}>
          <li>Creas una clase y eliges tu comunidad autónoma: se carga su currículo LOMLOE.</li>
          <li>Añades el alumnado y marcas las áreas que impartes.</li>
          <li>Repartes los criterios entre tus unidades y dices con qué evalúas cada uno.</li>
          <li>Calificas en la matriz, o escaneando el QR de la mesa desde el móvil.</li>
        </ol>
      </div>

      <Link to="/grupos/nuevo" className="btn-primary"
        style={{ display: 'inline-block', padding: '12px 24px', borderRadius: 8, background: 'var(--azul-700)', color: 'white', fontWeight: 700 }}>
        Crear mi primera clase →
      </Link>

      <InstalarApp />
    </div>
  )
}
