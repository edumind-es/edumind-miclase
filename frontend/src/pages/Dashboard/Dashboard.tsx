import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { getEstadoConfiguracion, type PasoEstado } from '@/db/queries'
import { trimestreActual } from '@/db/calculo'

type Paso = {
  n: number
  titulo: string
  explicacion: string
  hecho: boolean
  cta: string
  destino: string
  detalle?: string
}

function construirPasos(e: PasoEstado): Paso[] {
  const g = e.grupoPrincipalId
  return [
    {
      n: 1,
      titulo: 'Crea tu clase',
      explicacion: 'Un grupo por cada clase que impartes: nombre, curso, etapa y comunidad autónoma. La comunidad determina qué currículo LOMLOE se carga.',
      hecho: e.grupos > 0,
      cta: e.grupos > 0 ? 'Ver mis clases' : 'Crear la primera clase',
      destino: e.grupos > 0 ? '/grupos' : '/grupos/nuevo',
      detalle: e.grupos > 0 ? `${e.grupos} clase${e.grupos !== 1 ? 's' : ''}` : undefined,
    },
    {
      n: 2,
      titulo: 'Añade tu alumnado',
      explicacion: 'Escribe la lista o pégala de un tirón desde tu documento. Cada alumno recibe un código anónimo para el QR de mesa; los nombres nunca salen de este dispositivo.',
      hecho: e.alumnos > 0,
      cta: 'Gestionar alumnado',
      destino: g ? `/alumnos?grupo_id=${g}` : '/alumnos',
      detalle: e.alumnos > 0 ? `${e.alumnos} alumnos` : undefined,
    },
    {
      n: 3,
      titulo: 'Elige las áreas que impartes',
      explicacion: 'Marca de una vez todas las áreas de esa clase. Aparecerán como pestañas en Evaluación, cada una con sus criterios LOMLOE ya cargados.',
      hecho: e.asignaturas > 0,
      cta: 'Elegir áreas',
      destino: g ? `/grupos/${g}` : '/grupos',
      detalle: e.asignaturas > 0 ? `${e.asignaturas} áreas` : undefined,
    },
    {
      n: 4,
      titulo: 'Monta la programación',
      explicacion: 'Reparte los criterios de evaluación entre tus unidades o situaciones de aprendizaje. Puedes generar la estructura automáticamente y ajustarla después.',
      hecho: e.unidades > 0 && e.criteriosVinculados > 0,
      cta: 'Ir a programación',
      destino: g ? `/grupos/${g}` : '/grupos',
      detalle: e.unidades > 0 ? `${e.unidades} unidades · ${e.criteriosVinculados} criterios` : undefined,
    },
    {
      n: 5,
      titulo: 'Di con qué evalúas cada criterio',
      explicacion: 'Asigna a cada criterio su instrumento: prueba, rúbrica, observación, trabajo… Es lo que hará que al pulsar una casilla del calificador sepas exactamente con qué estás evaluando.',
      hecho: e.criteriosConInstrumento > 0,
      cta: 'Asignar instrumentos',
      destino: g ? `/grupos/${g}` : '/grupos',
      detalle: e.criteriosConInstrumento > 0
        ? `${e.criteriosConInstrumento} criterios con instrumento`
        : (e.instrumentos > 0 ? `${e.instrumentos} instrumentos creados, sin asignar` : undefined),
    },
    {
      n: 6,
      titulo: 'Evalúa',
      explicacion: 'Ya puedes calificar en la matriz, o imprimir el QR de cada mesa y evaluar desde el móvil escaneando: nota, observación y foto de la producción en pocos segundos.',
      hecho: e.calificaciones > 0,
      cta: 'Abrir el calificador',
      destino: e.asignaturaPrincipalId
        ? `/evaluacion?grupo_id=${g}&asignatura_id=${e.asignaturaPrincipalId}`
        : '/evaluacion',
      detalle: e.calificaciones > 0 ? `${e.calificaciones} calificaciones registradas` : undefined,
    },
  ]
}

export default function Dashboard() {
  const { grupos, cargarGrupos, cargando } = useAppStore()
  const [estado, setEstado] = useState<PasoEstado | null>(null)
  const [asistenteAbierto, setAsistenteAbierto] = useState(false)

  useEffect(() => { cargarGrupos() }, [cargarGrupos])
  useEffect(() => { getEstadoConfiguracion().then(setEstado) }, [])

  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const trimestre = trimestreActual()
  const trimestreLabel = trimestre === 1 ? '1er' : trimestre === 2 ? '2º' : '3er'
  const hora = new Date().getHours()
  const saludo = hora < 13 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'

  const pasos = estado ? construirPasos(estado) : []
  const completados = pasos.filter(p => p.hecho).length
  const siguiente = pasos.find(p => !p.hecho)
  const todoListo = estado != null && !siguiente

  // Mientras falte algo, el asistente se muestra abierto por defecto
  useEffect(() => {
    if (estado) setAsistenteAbierto(!todoListo)
  }, [estado, todoListo])

  return (
    <>
      <h1 className="page-title" style={{ marginBottom: 4 }}>{saludo} 👋</h1>
      <p style={{ color: 'var(--gris-600)', marginBottom: 24, textTransform: 'capitalize' }}>{hoy}</p>

      {/* ── Asistente de primeros pasos ────────────────────────────────── */}
      {estado && (
        <div className="card" style={{ marginBottom: 26, padding: 0, overflow: 'hidden' }}>
          <div
            onClick={() => setAsistenteAbierto(a => !a)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer',
              background: todoListo ? 'var(--verde-100)' : 'var(--azul-100)',
            }}
          >
            <div style={{ fontSize: 24 }}>{todoListo ? '✅' : '🧭'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: todoListo ? 'var(--verde-500)' : 'var(--azul-900)' }}>
                {todoListo ? 'Todo listo para evaluar' : `Puesta en marcha — paso ${(siguiente?.n ?? 1)} de ${pasos.length}`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--gris-600)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {todoListo
                  ? 'Tu clase está configurada de principio a fin. Puedes reabrir esta guía cuando quieras.'
                  : siguiente?.titulo}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ width: 110, height: 6, background: 'var(--gris-300)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${(completados / pasos.length) * 100}%`, height: '100%',
                  background: todoListo ? 'var(--verde-500)' : 'var(--azul-700)', transition: 'width .3s',
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gris-600)' }}>{completados}/{pasos.length}</span>
              <span style={{ color: 'var(--gris-600)' }}>{asistenteAbierto ? '▲' : '▼'}</span>
            </div>
          </div>

          {asistenteAbierto && (
            <div style={{ padding: '6px 20px 18px' }}>
              {pasos.map(p => {
                const esSiguiente = siguiente?.n === p.n
                return (
                  <div key={p.n} style={{
                    display: 'flex', gap: 14, padding: '12px 0',
                    borderBottom: p.n < pasos.length ? '1px solid var(--gris-100)' : 'none',
                    opacity: p.hecho && !esSiguiente ? .72 : 1,
                  }}>
                    <div style={{
                      flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                      background: p.hecho ? 'var(--verde-500)' : esSiguiente ? 'var(--azul-700)' : 'var(--gris-300)',
                      color: p.hecho || esSiguiente ? 'white' : 'var(--gris-600)',
                    }}>
                      {p.hecho ? '✓' : p.n}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                        {p.titulo}
                        {p.detalle && (
                          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--gris-500)' }}>
                            · {p.detalle}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.55 }}>
                        {p.explicacion}
                      </div>
                    </div>
                    <Link to={p.destino}
                      className={esSiguiente ? 'btn-primary' : 'btn-secondary'}
                      style={{
                        flexShrink: 0, alignSelf: 'center', fontSize: 12.5, padding: '7px 14px',
                        borderRadius: 8, fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none',
                        ...(esSiguiente
                          ? { background: 'var(--azul-700)', color: 'white' }
                          : { background: 'var(--gris-100)', color: 'var(--gris-600)', border: '1px solid var(--gris-300)' }),
                      }}>
                      {p.cta} →
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Clases activas" value={grupos.length} icon="👥" color="var(--azul-700)" />
        <StatCard label="Alumnado total" value={grupos.reduce((s, g) => s + (g.num_alumnos || 0), 0)} icon="🎒" color="var(--verde-500)" />
        <StatCard label="Trimestre actual" value={trimestreLabel} icon="📅" color="var(--ambar-500)" />
        <StatCard label="Calificaciones" value={estado?.calificaciones ?? 0} icon="📋" color="var(--azul-500)" />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: 'var(--azul-700)' }}>Mis clases</h2>

      {cargando && <p style={{ color: 'var(--gris-600)' }}>Cargando…</p>}

      {grupos.length === 0 && !cargando && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--gris-600)', marginBottom: 16 }}>Aún no tienes clases. Empieza por el paso 1 de la guía.</p>
          <Link to="/grupos/nuevo" style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 8, background: 'var(--azul-700)', color: 'white', fontWeight: 600 }}>
            Crear mi primera clase
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {grupos.map(g => (
          <Link key={g.id} to={`/grupos/${g.id}`} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ borderLeft: `4px solid ${g.color || 'var(--azul-500)'}`, transition: 'box-shadow .2s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--sombra-md)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--sombra)')}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, color: 'var(--gris-900)' }}>{g.nombre}</div>
              <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 8 }}>
                {g.etapa === 'primaria' ? 'Primaria' : 'Secundaria'} · {g.curso}º · {g.curso_escolar}
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
