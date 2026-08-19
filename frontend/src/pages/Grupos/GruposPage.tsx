import { useEffect, useState } from 'react'
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { getGrupoDetalle } from '@/db/queries'
import { imprimirHojaQR } from '@/utils/qrSheet'
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
  const [form, setForm] = useState({
    nombre: '', etapa: 'primaria', curso: '3', comunidad: 'Galicia', curso_escolar: '2025-2026', color: COLORES[0]
  })
  const [guardando, setGuardando] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre) return
    setGuardando(true)
    await crearGrupo({ ...form, docente_id: 1 })
    navigate('/grupos')
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

function DetalleGrupo() {
  const { id } = useParams()
  const navigate = useNavigate()
  const eliminarGrupo = useAppStore(s => s.eliminarGrupo)
  const [grupo, setGrupo] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [qrVisible, setQrVisible] = useState(false)
  const [modoAnon, setModoAnon] = useState(() =>
    localStorage.getItem(`miclase_anon_${id}`) === '1'
  )

  useEffect(() => {
    getGrupoDetalle(Number(id))
      .then(d => { setGrupo(d ?? null); setCargando(false) })
  }, [id])

  const toggleAnon = () => {
    const nuevo = !modoAnon
    setModoAnon(nuevo)
    localStorage.setItem(`miclase_anon_${id}`, nuevo ? '1' : '0')
  }

  const handleEliminar = async () => {
    if (!confirm(`¿Eliminar el grupo "${grupo?.nombre}" y todos sus datos? Esta acción no se puede deshacer.`)) return
    await eliminarGrupo(Number(id))
    navigate('/grupos')
  }

  if (cargando) return <p>Cargando grupo…</p>
  if (!grupo) return <p>Grupo no encontrado.</p>

  const qrUrl = `https://miclase.edumind.es/evaluacion?grupo_id=${id}`

  return (
    <>
      {qrVisible && (
        <QRModal
          url={qrUrl}
          titulo={`Evaluación ${grupo.nombre} — acceso móvil`}
          onClose={() => setQrVisible(false)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/grupos" style={{ color: 'var(--gris-600)', fontSize: 20 }}>←</Link>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{grupo.nombre}</h1>
            <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>
              {grupo.etapa} · Curso {grupo.curso}º · {grupo.curso_escolar}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={toggleAnon}
            className={modoAnon ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 13 }}
            title="Oculta los nombres reales y muestra solo el código. Útil al proyectar en clase."
          >
            {modoAnon ? '🔐 Anon. activa' : '🔓 Anonimizar'}
          </button>
          <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setQrVisible(true)}>
            📱 QR acceso móvil
          </button>
          <button
            className="btn-secondary" style={{ fontSize: 13 }}
            title="Hoja imprimible con un QR por alumno para pegar en las mesas"
            onClick={async () => {
              if (!grupo.alumnos?.length) { alert('El grupo no tiene alumnos.'); return }
              const conNombres = confirm('¿Incluir los nombres bajo cada QR?\n\nAceptar = con nombres · Cancelar = solo códigos (anónimo)')
              try { await imprimirHojaQR(grupo, grupo.alumnos, conNombres) }
              catch (e: any) { alert(e.message) }
            }}>
            🖨 QR de mesas
          </button>
          <button
            onClick={handleEliminar}
            style={{ fontSize: 13, padding: '6px 12px', background: 'none', border: '1px solid var(--rojo-500)', color: 'var(--rojo-500)', borderRadius: 8, cursor: 'pointer' }}
            title="Eliminar grupo"
          >
            🗑 Eliminar grupo
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Alumnado ({grupo.alumnos?.length || 0})</h2>
          <Link to={`/alumnos?grupo_id=${id}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--azul-500)' }}>
            + Gestionar alumnado
          </Link>
        </div>
        {grupo.alumnos?.length === 0 && (
          <p style={{ color: 'var(--gris-600)', fontSize: 14 }}>No hay alumnos en este grupo todavía.</p>
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

      <PlanoClase grupoId={Number(id)} alumnos={grupo.alumnos || []} modoAnon={modoAnon} />

      <AsignaturasPanel grupoId={id!} etapa={grupo.etapa} curso={grupo.curso} comunidad={grupo.comunidad || 'Galicia'} />

      {/* Evaluar en vivo con el QR de mesa: el atajo que casi nadie descubre solo */}
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
          <button
            className="btn-primary" style={{ fontSize: 13 }}
            onClick={async () => {
              if (!grupo.alumnos?.length) { alert('Añade alumnado antes de imprimir los QR.'); return }
              const conNombres = confirm('¿Incluir los nombres bajo cada QR?\n\nAceptar = con nombres · Cancelar = solo códigos (anónimo, recomendado)')
              try { await imprimirHojaQR(grupo, grupo.alumnos, conNombres) }
              catch (e: any) { alert(e.message) }
            }}>
            🖨 Imprimir QR de mesas
          </button>
          <Link to="/escanear"
            style={{ padding: '8px 16px', background: 'white', color: 'var(--azul-700)', border: '1px solid var(--azul-300)', borderRadius: 6, fontWeight: 600, fontSize: 13 }}>
            📷 Abrir el escáner
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to={`/evaluacion?grupo_id=${id}`}
          style={{ padding: '10px 20px', background: 'var(--azul-700)', color: 'white', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
          📋 Calificador
        </Link>
        <Link to={`/sesiones?grupo_id=${id}`}
          style={{ padding: '10px 20px', background: 'var(--verde-500)', color: 'white', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
          ✅ Asistencia
        </Link>
        <Link to={`/seguimiento?grupo_id=${id}`}
          style={{ padding: '10px 20px', background: 'var(--gris-100)', color: 'var(--gris-600)', border: '1px solid var(--gris-300)', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
          📈 Seguimiento
        </Link>
        <Link to={`/informes`}
          style={{ padding: '10px 20px', background: 'var(--gris-100)', color: 'var(--gris-600)', border: '1px solid var(--gris-300)', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
          📄 Informes
        </Link>
      </div>
    </>
  )
}
