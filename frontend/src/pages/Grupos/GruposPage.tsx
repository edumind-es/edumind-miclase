import { useEffect, useState } from 'react'
import { Routes, Route, Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { useClaseActiva } from '@/contexto/ClaseActiva'
import { getGrupoDetalle, actualizarGrupo } from '@/db/queries'
import { imprimirHojaQR } from '@/utils/qrSheet'
import { urlPublica } from '@/api'
import QRModal from '@/components/QRModal'
import AsignaturasPanel from '@/components/AsignaturasPanel'
import PlanoClase from '@/components/PlanoClase'

const COLORES = ['#1a4a7a','#27a35a','#d94040','#e07b10','#7b4fa6','#2ea8a0','#c07b1a']
const CURSOS_PRIMARIA = ['1','2','3','4','5','6']
const CURSOS_ESO = ['1','2','3','4']

const COMUNIDADES = [
  { value: 'Galicia',   label: 'Galicia' },
  { value: 'MADRID',    label: 'Comunidad de Madrid' },
  { value: 'Aragon',    label: 'Aragón' },
  { value: 'Canarias',  label: 'Canarias' },
  { value: 'CyL',       label: 'Castilla y León' },
  { value: 'CLM',       label: 'Castilla-La Mancha' },
  { value: 'Valencia',  label: 'Comunitat Valenciana' },
]

export default function GruposPage() {
  return (
    <Routes>
      <Route index element={<ListaGrupos />} />
      <Route path="nuevo" element={<NuevoGrupo />} />
      <Route path=":id" element={<DetalleGrupo />} />
    </Routes>
  )
}

function ListaGrupos() {
  const { grupos, cargarGrupos, cargando } = useAppStore()
  useEffect(() => { cargarGrupos() }, [cargarGrupos])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Mis clases</h1>
        <Link to="nuevo" className="btn-primary" style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 8, background: 'var(--azul-700)', color: 'white', fontWeight: 600 }}>
          + Nueva clase
        </Link>
      </div>

      {cargando && <p>Cargando…</p>}
      {grupos.length === 0 && !cargando && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ color: 'var(--gris-600)' }}>No tienes clases todavía.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {grupos.map(g => (
          <Link key={g.id} to={`/grupos/${g.id}`} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ borderLeft: `4px solid ${g.color}` }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{g.nombre}</div>
              <div style={{ fontSize: 13, color: 'var(--gris-600)', margin: '4px 0 10px' }}>
                {g.etapa} · Curso {g.curso}º · {g.curso_escolar}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--azul-500)' }}>
                {g.num_alumnos || 0} alumnos
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}

function NuevoGrupo() {
  const navigate = useNavigate()
  const crearGrupo = useAppStore(s => s.crearGrupo)
  const { elegirGrupo, recargarGrupos } = useClaseActiva()
  const [form, setForm] = useState({
    nombre: '', etapa: 'primaria', curso: '3', comunidad: 'Galicia', curso_escolar: '2025-2026', color: COLORES[0]
  })
  const [guardando, setGuardando] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre) return
    setGuardando(true)
    const id = await crearGrupo({ ...form, docente_id: 1 })
    // La clase recién creada pasa a ser la activa: es la que el docente va a
    // configurar a continuación, y así no tiene que volver a elegirla.
    await recargarGrupos()
    elegirGrupo(id)
    navigate(`/grupos/${id}`)
  }

  const cursos = form.etapa === 'primaria' ? CURSOS_PRIMARIA : CURSOS_ESO

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link to="/grupos" style={{ color: 'var(--gris-600)', fontSize: 20 }}>←</Link>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Nueva clase</h1>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
            Nombre del grupo *
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
              placeholder="Ej: 3ºA, 5ºB…" required style={{ width: '100%' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
              Etapa
              <select value={form.etapa} onChange={e => { set('etapa', e.target.value); set('curso', '1') }}>
                <option value="primaria">Primaria</option>
                <option value="secundaria">Secundaria (ESO)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
              Curso
              <select value={form.curso} onChange={e => set('curso', e.target.value)}>
                {cursos.map(c => <option key={c} value={c}>{c}º</option>)}
              </select>
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
            Comunidad autónoma
            <select value={form.comunidad} onChange={e => set('comunidad', e.target.value)}>
              {COMUNIDADES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
            Curso escolar
            <input value={form.curso_escolar} onChange={e => set('curso_escolar', e.target.value)}
              placeholder="2025-2026" />
          </label>

          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Color del grupo</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {COLORES.map(c => (
                <button key={c} type="button"
                  style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--gris-900)' : '3px solid transparent', cursor: 'pointer' }}
                  onClick={() => set('color', c)} />
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={guardando} style={{ marginTop: 8 }}>
            {guardando ? 'Guardando…' : 'Crear grupo'}
          </button>
        </form>
      </div>
    </>
  )
}

/**
 * Configuración de una clase.
 *
 * Antes esto era una ficha corrida: alumnado, plano, áreas, programación,
 * instrumentos, rúbricas, QR y el botón de borrar, todo en un mismo scroll.
 * Los pasos 3, 4 y 5 del asistente apuntaban los tres aquí y el docente tenía
 * que buscar dónde continuar. Ahora es una pantalla con pestañas, y cada paso
 * enlaza con la suya (`?pestana=`).
 */

const PESTANAS = [
  { id: 'datos',    label: 'Datos de la clase' },
  { id: 'alumnado', label: 'Alumnado' },
  { id: 'areas',    label: 'Áreas y evaluación' },
  { id: 'plano',    label: 'Plano y QR de mesas' },
] as const

type PestanaId = typeof PESTANAS[number]['id']

function DetalleGrupo() {
  const { id } = useParams()
  const grupoId = Number(id)
  const [params, setParams] = useSearchParams()
  const { recargarGrupos, recargarAsignaturas } = useClaseActiva()

  const pedida = params.get('pestana') as PestanaId | null
  const pestana: PestanaId = PESTANAS.some(p => p.id === pedida) ? pedida! : 'datos'

  const [grupo, setGrupo] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [modoAnon, setModoAnon] = useState(() =>
    localStorage.getItem(`miclase_anon_${id}`) === '1'
  )

  const recargar = () =>
    getGrupoDetalle(grupoId).then(d => { setGrupo(d ?? null); setCargando(false) })

  useEffect(() => { setCargando(true); recargar() }, [id])

  const toggleAnon = () => {
    const nuevo = !modoAnon
    setModoAnon(nuevo)
    localStorage.setItem(`miclase_anon_${id}`, nuevo ? '1' : '0')
  }

  if (cargando) return <p>Cargando clase…</p>
  if (!grupo) return <p>Clase no encontrada.</p>

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <Link to="/grupos" style={{ color: 'var(--gris-600)', fontSize: 20 }} aria-label="Volver a mis clases">←</Link>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>{grupo.nombre}</h1>
          <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>
            {grupo.etapa === 'primaria' ? 'Primaria' : 'Secundaria'} · Curso {grupo.curso}º ·{' '}
            {grupo.curso_escolar} · {grupo.alumnos?.length || 0} alumnos
          </div>
        </div>
      </div>

      <div className="tabs-area" role="tablist" aria-label="Configuración de la clase" style={{ margin: '18px 0 22px' }}>
        {PESTANAS.map(p => (
          <button key={p.id} role="tab" aria-selected={p.id === pestana}
            className={`tab-area${p.id === pestana ? ' activa' : ''}`}
            onClick={() => setParams({ pestana: p.id }, { replace: true })}>
            {p.label}
          </button>
        ))}
      </div>

      {pestana === 'datos' && (
        <DatosClase grupo={grupo} onGuardado={async () => { await recargar(); await recargarGrupos() }} />
      )}

      {pestana === 'alumnado' && (
        <ListaAlumnado grupo={grupo} modoAnon={modoAnon} onToggleAnon={toggleAnon} />
      )}

      {pestana === 'areas' && (
        <AsignaturasPanel
          grupoId={id!}
          etapa={grupo.etapa}
          curso={grupo.curso}
          comunidad={grupo.comunidad || 'Galicia'}
          onCambio={recargarAsignaturas}
        />
      )}

      {pestana === 'plano' && (
        <PlanoYQR grupo={grupo} modoAnon={modoAnon} />
      )}
    </>
  )
}

// ─── Pestaña: datos de la clase ─────────────────────────────────────────────

/**
 * Hasta ahora una clase no se podía corregir: `actualizarGrupo` existía en
 * db/queries.ts sin que nada la llamara, así que una errata en el nombre o
 * una comunidad mal elegida obligaban a borrar la clase entera.
 */
function DatosClase({ grupo, onGuardado }: { grupo: any; onGuardado: () => Promise<void> }) {
  const navigate = useNavigate()
  const eliminarGrupo = useAppStore(s => s.eliminarGrupo)
  const { recargarGrupos } = useClaseActiva()

  const [form, setForm] = useState({
    nombre: grupo.nombre || '',
    etapa: grupo.etapa || 'primaria',
    curso: String(grupo.curso || '1'),
    comunidad: grupo.comunidad || 'Galicia',
    curso_escolar: grupo.curso_escolar || '',
    color: grupo.color || COLORES[0],
  })
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const set = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setGuardado(false) }
  const cursos = form.etapa === 'primaria' ? CURSOS_PRIMARIA : CURSOS_ESO

  // Curso, etapa y comunidad deciden qué criterios LOMLOE se piden al
  // servidor. Cambiarlos con áreas ya montadas deja la programación apuntando
  // a criterios de otro currículo, así que se avisa antes de guardar.
  const cambiaCurriculo =
    form.etapa !== grupo.etapa ||
    form.curso !== String(grupo.curso) ||
    form.comunidad !== (grupo.comunidad || 'Galicia')

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre) return
    if (cambiaCurriculo && !confirm(
      'Vas a cambiar el curso, la etapa o la comunidad.\n\n' +
      'Son los que deciden qué currículo LOMLOE se carga: la programación que ya tengas ' +
      'puede quedar apuntando a criterios que ya no existen. Las calificaciones no se borran.\n\n' +
      '¿Continuar?'
    )) return

    setGuardando(true)
    await actualizarGrupo(grupo.id, form)
    await onGuardado()
    setGuardando(false)
    setGuardado(true)
  }

  const eliminar = async () => {
    if (!confirm(`¿Eliminar la clase "${grupo.nombre}" y todos sus datos? Esta acción no se puede deshacer.`)) return
    await eliminarGrupo(grupo.id)
    await recargarGrupos()
    navigate('/grupos')
  }

  return (
    <>
      <div className="card" style={{ maxWidth: 520, marginBottom: 22 }}>
        <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
            Nombre de la clase *
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)} required />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
              Etapa
              <select value={form.etapa} onChange={e => { set('etapa', e.target.value); set('curso', '1') }}>
                <option value="primaria">Primaria</option>
                <option value="secundaria">Secundaria (ESO)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
              Curso
              <select value={form.curso} onChange={e => set('curso', e.target.value)}>
                {cursos.map(c => <option key={c} value={c}>{c}º</option>)}
              </select>
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
            Comunidad autónoma
            <select value={form.comunidad} onChange={e => set('comunidad', e.target.value)}>
              {COMUNIDADES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--gris-600)' }}>
              Determina qué currículo LOMLOE se carga en las áreas de esta clase.
            </span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
            Curso escolar
            <input value={form.curso_escolar} onChange={e => set('curso_escolar', e.target.value)} placeholder="2025-2026" />
          </label>

          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Color de la clase</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {COLORES.map(c => (
                <button key={c} type="button" aria-label={`Color ${c}`}
                  style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--gris-900)' : '3px solid transparent', cursor: 'pointer' }}
                  onClick={() => set('color', c)} />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {guardado && <span style={{ fontSize: 13, color: 'var(--verde-500)', fontWeight: 600 }}>✓ Guardado</span>}
          </div>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 520, borderLeft: '4px solid var(--rojo-500)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--rojo-500)', marginBottom: 6 }}>Eliminar la clase</h3>
        <p style={{ fontSize: 13, color: 'var(--gris-600)', lineHeight: 1.6, marginBottom: 12 }}>
          Se van con ella el alumnado, la programación y las calificaciones de esta clase.
          Haz antes una copia de seguridad desde el menú lateral si quieres conservarlas.
        </p>
        <button className="btn-danger" onClick={eliminar}>Eliminar clase</button>
      </div>
    </>
  )
}

// ─── Pestaña: alumnado ──────────────────────────────────────────────────────

function ListaAlumnado({ grupo, modoAnon, onToggleAnon }: {
  grupo: any; modoAnon: boolean; onToggleAnon: () => void
}) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Alumnado ({grupo.alumnos?.length || 0})</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onToggleAnon}
            className={modoAnon ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 13 }}
            title="Oculta los nombres reales y muestra solo el código. Útil al proyectar en clase."
          >
            {modoAnon ? '🔐 Anon. activa' : '🔓 Anonimizar'}
          </button>
          <Link to="/alumnos" className="btn-primary"
            style={{ fontSize: 13, padding: '8px 14px', borderRadius: 6, background: 'var(--azul-700)', color: 'white', fontWeight: 600 }}>
            + Añadir o editar alumnado
          </Link>
        </div>
      </div>

      {!grupo.alumnos?.length && (
        <p style={{ color: 'var(--gris-600)', fontSize: 14 }}>
          Esta clase no tiene alumnado todavía. Puedes escribirlo uno a uno o pegar la lista entera.
        </p>
      )}

      {modoAnon && grupo.alumnos?.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--azul-700)', background: 'var(--azul-100)', padding: '6px 12px', borderRadius: 6, marginBottom: 12 }}>
          Modo privacidad activo — se muestran solo códigos
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {grupo.alumnos?.map((a: any) => (
          <div key={a.id} style={{ padding: '8px 12px', background: 'var(--gris-100)', borderRadius: 8, fontSize: 14 }}>
            {modoAnon ? (
              <div style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--azul-700)', letterSpacing: 1 }}>
                {a.codigo_cifrado || '—'}
              </div>
            ) : (
              <div style={{ fontWeight: 600 }}>{a.apellidos}, {a.nombre}</div>
            )}
            {a.neae ? <span style={{ fontSize: 11, color: 'var(--ambar-500)', fontWeight: 600 }}>NEAE</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Pestaña: plano y QR ────────────────────────────────────────────────────

function PlanoYQR({ grupo, modoAnon }: { grupo: any; modoAnon: boolean }) {
  const [qrVisible, setQrVisible] = useState(false)

  const imprimir = async () => {
    if (!grupo.alumnos?.length) { alert('Añade alumnado antes de imprimir los QR.'); return }
    const conNombres = confirm('¿Incluir los nombres bajo cada QR?\n\nAceptar = con nombres · Cancelar = solo códigos (anónimo, recomendado)')
    try { await imprimirHojaQR(grupo, grupo.alumnos, conNombres) }
    catch (e: any) { alert(e.message) }
  }

  return (
    <>
      {qrVisible && (
        <QRModal
          url={urlPublica('/evaluacion')}
          titulo={`Evaluación ${grupo.nombre} — acceso móvil`}
          onClose={() => setQrVisible(false)}
        />
      )}

      <div className="card" style={{ marginBottom: 20, background: 'var(--azul-100)', boxShadow: 'none' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--azul-700)', marginBottom: 8 }}>
          📱 Evaluar en el aula con el QR de mesa
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--gris-600)', lineHeight: 1.65, marginBottom: 12 }}>
          Imprime la hoja de QR y pega uno en cada mesa. Con el móvil o la tablet, entra en
          <strong> Evaluar QR</strong>, apunta la cámara al código y se abre directamente el panel de ese alumno:
          eliges el criterio, pulsas la nota y, si quieres, haces una foto de la producción como evidencia.
          Los códigos son anónimos — no llevan el nombre, así que la hoja puede estar a la vista.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ fontSize: 13 }} onClick={imprimir}>
            🖨 Imprimir QR de mesas
          </button>
          <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setQrVisible(true)}>
            📱 QR de acceso móvil
          </button>
          <Link to="/escanear"
            style={{ padding: '8px 16px', background: 'white', color: 'var(--azul-700)', border: '1px solid var(--azul-300)', borderRadius: 6, fontWeight: 600, fontSize: 13 }}>
            📷 Abrir el escáner
          </Link>
        </div>
      </div>

      <PlanoClase grupoId={grupo.id} alumnos={grupo.alumnos || []} modoAnon={modoAnon} />
    </>
  )
}
