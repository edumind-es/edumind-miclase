import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'

export default function AlumnosPage() {
  const [searchParams] = useSearchParams()
  const grupoId = searchParams.get('grupo_id')
  const { alumnos, cargarAlumnos, crearAlumno, grupos, cargarGrupos } = useAppStore()
  const [busqueda, setBusqueda] = useState('')
  const [modoNuevo, setModoNuevo] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { cargarGrupos() }, [cargarGrupos])
  useEffect(() => {
    if (grupoId) cargarAlumnos(Number(grupoId))
  }, [grupoId, cargarAlumnos])

  const filtrados = alumnos.filter(a =>
    `${a.nombre} ${a.apellidos}`.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Alumnado</h1>
        <button className="btn-primary" onClick={() => setModoNuevo(true)}>+ Añadir alumno</button>
      </div>

      {modoNuevo && (
        <FormNuevoAlumno
          grupos={grupos}
          grupoIdInicial={grupoId ? Number(grupoId) : undefined}
          onGuardar={async (datos: Record<string, any>) => {
            const alumnoId = await crearAlumno(datos)
            if (grupoId) {
              await fetch(`/api/grupos/${grupoId}/alumnos/${alumnoId}`, { method: 'POST' })
              cargarAlumnos(Number(grupoId))
            }
            setModoNuevo(false)
          }}
          onCancelar={() => setModoNuevo(false)}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o apellidos…"
          style={{ width: '100%', maxWidth: 360 }}
        />
      </div>

      {grupoId && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--gris-600)' }}>
          Mostrando alumnos del grupo seleccionado.{' '}
          <Link to="/alumnos">Ver todos</Link>
        </div>
      )}

      {filtrados.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--gris-600)' }}>
          {busqueda ? 'Sin resultados para esa búsqueda.' : 'No hay alumnos. Añade el primero.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {filtrados.map(a => (
          <div key={a.id} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{a.apellidos}, {a.nombre}</div>
            {a.neae ? (
              <span className="badge" style={{ background: 'var(--ambar-100)', color: 'var(--ambar-500)', marginTop: 4 }}>
                NEAE
              </span>
            ) : null}
            {a.observaciones && (
              <div style={{ fontSize: 12, color: 'var(--gris-600)', marginTop: 6 }}>{a.observaciones}</div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function FormNuevoAlumno({ grupos, grupoIdInicial, onGuardar, onCancelar }: any) {
  const [form, setForm] = useState({
    nombre: '', apellidos: '', neae: false, observaciones: '', grupoId: grupoIdInicial || ''
  })
  const s = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre || !form.apellidos) return
    onGuardar({ nombre: form.nombre, apellidos: form.apellidos, neae: form.neae, observaciones: form.observaciones })
  }

  return (
    <div className="card" style={{ maxWidth: 480, marginBottom: 24 }}>
      <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Nuevo alumno</h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <input value={form.nombre} onChange={e => s('nombre', e.target.value)} placeholder="Nombre *" required />
          <input value={form.apellidos} onChange={e => s('apellidos', e.target.value)} placeholder="Apellidos *" required />
        </div>
        <input value={form.observaciones} onChange={e => s('observaciones', e.target.value)} placeholder="Observaciones (opcional)" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={form.neae} onChange={e => s('neae', e.target.checked)} />
          Alumno con NEAE
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="submit" className="btn-primary">Guardar</button>
          <button type="button" className="btn-secondary" onClick={onCancelar}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
