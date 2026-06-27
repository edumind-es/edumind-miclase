import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function SeguimientoPage() {
  const [params] = useSearchParams()
  const grupoId = params.get('grupo_id')
  const [asignaturas, setAsignaturas] = useState<any[]>([])
  const [asignaturaId, setAsignaturaId] = useState('')
  const [datos, setDatos] = useState<any[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!grupoId) return
    fetch(`/api/asignaturas?grupo_id=${grupoId}`)
      .then(r => r.json())
      .then(d => { setAsignaturas(d); if (d[0]) setAsignaturaId(String(d[0].id)) })
  }, [grupoId])

  useEffect(() => {
    if (!asignaturaId) return
    setCargando(true)
    Promise.all([
      fetch(`/api/calificaciones/resumen-grupo?asignatura_id=${asignaturaId}&trimestre=1`).then(r => r.json()),
      fetch(`/api/calificaciones/resumen-grupo?asignatura_id=${asignaturaId}&trimestre=2`).then(r => r.json()),
      fetch(`/api/calificaciones/resumen-grupo?asignatura_id=${asignaturaId}&trimestre=3`).then(r => r.json()),
    ]).then(([t1, t2, t3]) => {
      // Agrupa por criterio
      const map: Record<string, any> = {}
      const add = (rows: any[], label: string) => rows.forEach(r => {
        if (!map[r.criterio_id]) map[r.criterio_id] = { criterio: r.criterio_id }
        map[r.criterio_id][label] = parseFloat(r.media?.toFixed(1) || '0')
      })
      add(t1, '1T'); add(t2, '2T'); add(t3, '3T')
      setDatos(Object.values(map))
      setCargando(false)
    })
  }, [asignaturaId])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Seguimiento del grupo</h1>
        <select value={asignaturaId} onChange={e => setAsignaturaId(e.target.value)}>
          {asignaturas.map(a => <option key={a.id} value={a.id}>{a.nombre_display}</option>)}
        </select>
      </div>

      {!grupoId && (
        <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
          Selecciona un grupo desde la sección Mis Grupos para ver el seguimiento.
        </div>
      )}

      {grupoId && datos.length === 0 && !cargando && (
        <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
          Aún no hay calificaciones registradas para mostrar gráficas.
        </div>
      )}

      {datos.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>
            Media por criterio — comparativa trimestral
          </h2>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={datos} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--gris-300)" />
              <XAxis dataKey="criterio" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="1T" name="1er Trim." fill="#2e6db4" radius={[3,3,0,0]} />
              <Bar dataKey="2T" name="2º Trim."  fill="#27a35a" radius={[3,3,0,0]} />
              <Bar dataKey="3T" name="3er Trim." fill="#e07b10" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}
