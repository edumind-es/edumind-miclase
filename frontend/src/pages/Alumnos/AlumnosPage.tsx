import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import {
  crearAlumno as dbCrearAlumno, getAlumnosByGrupo,
  actualizarAlumno, eliminarAlumno,
} from '@/db/queries'
import EvidenciasGaleria from '@/components/EvidenciasGaleria'
import type { Alumno as DBAlumno } from '@/db/localDb'

// ─── Parser de importación masiva ───────────────────────────────────────────

interface ParsedAlumno { nombre: string; apellidos: string }

function parsearTexto(texto: string): ParsedAlumno[] {
  const lineas = texto.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0)

  let entradas: string[]
  if (lineas.length > 1) {
    // Multi-línea: cada línea es un alumno
    entradas = lineas
  } else if (lineas.length === 1) {
    // Una sola línea: separar por coma
    entradas = lineas[0].split(',').map(e => e.trim()).filter(e => e.length > 0)
  } else {
    return []
  }

  return entradas.map(entrada => {
    // Formato "Apellidos, Nombre" solo en modo multilínea con coma interna
    if (lineas.length > 1 && entrada.includes(',')) {
      const idx = entrada.indexOf(',')
      return {
        apellidos: entrada.substring(0, idx).trim(),
        nombre: entrada.substring(idx + 1).trim(),
      }
    }
    // Formato "Nombre Apellidos"
    const palabras = entrada.trim().split(/\s+/)
    if (palabras.length === 0) return null
    if (palabras.length === 1) return { nombre: palabras[0], apellidos: '' }
    return { nombre: palabras[0], apellidos: palabras.slice(1).join(' ') }
  }).filter((a): a is ParsedAlumno => a !== null && a.nombre.length > 0)
}

// ─── Exportar lista de códigos como CSV ─────────────────────────────────────

async function exportarCodigos(grupoId: string | null) {
  if (!grupoId) return
  const datos = await getAlumnosByGrupo(Number(grupoId))
  const csv = ['Código,Apellidos,Nombre', ...datos.map(d => `${d.codigo_cifrado || ''},"${d.apellidos}","${d.nombre}"`)]
  const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'codigos-alumnado.csv'
  a.click()
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function AlumnosPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const grupoParam = searchParams.get('grupo_id')
  const { alumnos, cargarAlumnos, crearAlumno, grupos, cargarGrupos } = useAppStore()
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState<'individual' | 'bulk' | null>(null)
  const [alumnoGaleria, setAlumnoGaleria] = useState<DBAlumno | null>(null)
  // Hasta ahora una errata en un nombre era permanente: las funciones de
  // edición y borrado existían en db/queries.ts sin que nada las llamara.
  const [alumnoEditar, setAlumnoEditar] = useState<DBAlumno | null>(null)

  // El alumnado SIEMPRE pertenece a una clase concreta. Antes, entrando sin
  // `grupo_id`, los alumnos nuevos caían en el grupo 1: aquí se elige de forma
  // explícita y no se puede dar de alta a nadie sin clase.
  const grupoId = grupoParam || (grupos.length === 1 ? String(grupos[0].id) : '')

  useEffect(() => { cargarGrupos() }, [cargarGrupos])
  useEffect(() => {
    if (grupoId) cargarAlumnos(Number(grupoId))
  }, [grupoId, cargarAlumnos])

  const elegirGrupo = (id: string) => {
    setSearchParams(id ? { grupo_id: id } : {}, { replace: true })
  }

  const grupoActual = grupos.find(g => String(g.id) === grupoId)

  const filtrados = alumnos.filter(a =>
    `${a.nombre} ${a.apellidos}`.toLowerCase().includes(busqueda.toLowerCase())
  )

  const recargar = () => {
    if (grupoId) cargarAlumnos(Number(grupoId))
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Alumnado</h1>
          <select value={grupoId} onChange={e => elegirGrupo(e.target.value)} style={{ minWidth: 190 }}>
            <option value="">— Elige una clase —</option>
            {grupos.map(g => (
              <option key={g.id} value={g.id}>{g.nombre} · {g.curso}º · {g.num_alumnos || 0} alumnos</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={() => setModal('bulk')} disabled={!grupoId}>📋 Importar lista</button>
          <button className="btn-primary" onClick={() => setModal('individual')} disabled={!grupoId}>+ Añadir alumno</button>
        </div>
      </div>

      {grupos.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--gris-600)' }}>
          Primero crea una clase: el alumnado siempre pertenece a una.{' '}
          <Link to="/grupos/nuevo" style={{ color: 'var(--azul-500)', fontWeight: 600 }}>Crear clase →</Link>
        </div>
      )}

      {grupos.length > 0 && !grupoId && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--gris-600)' }}>
          Elige arriba de qué clase quieres ver o añadir alumnado.
        </div>
      )}

      {grupoId && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--gris-600)' }}>
            Clase <strong>{grupoActual?.nombre}</strong> ·
          </span>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => exportarCodigos(grupoId)}>
            🔐 Descargar claves anonimización
          </button>
          <Link to={`/grupos/${grupoId}`} style={{ fontSize: 13, color: 'var(--azul-500)' }}>Ir a la ficha de la clase →</Link>
        </div>
      )}

      {modal === 'individual' && (
        <FormNuevoAlumno
          grupoIdInicial={grupoId ? Number(grupoId) : undefined}
          onGuardar={async (datos: Record<string, any>) => {
            if (!grupoId) return
            await crearAlumno({ ...datos, grupo_id: Number(grupoId) })
            recargar()
            setModal(null)
          }}
          onCancelar={() => setModal(null)}
        />
      )}

      {modal === 'bulk' && (
        <ImportadorMasivo
          grupoId={grupoId}
          onCompletado={recargar}
          onCerrar={() => setModal(null)}
        />
      )}

      {grupoId && (
        <div style={{ marginBottom: 16 }}>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o apellidos…"
            style={{ width: '100%', maxWidth: 380 }} />
        </div>
      )}

      {grupoId && filtrados.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--gris-600)' }}>
          {busqueda
            ? 'Sin resultados.'
            : 'Esta clase todavía no tiene alumnado. Añade uno o pega la lista completa con «Importar lista».'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {filtrados.map(a => (
          <div key={a.id} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{a.apellidos}</div>
            <div style={{ fontSize: 14, color: 'var(--gris-600)' }}>{a.nombre}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {a.neae ? <span className="badge" style={{ background: 'var(--ambar-100)', color: 'var(--ambar-500)', fontSize: 11 }}>NEAE</span> : null}
              {(a as any).codigo_cifrado && (
                <span className="badge" style={{ background: 'var(--azul-100)', color: 'var(--azul-700)', fontSize: 11, fontFamily: 'monospace' }}>
                  {(a as any).codigo_cifrado}
                </span>
              )}
              <button
                onClick={() => setAlumnoEditar(a as unknown as DBAlumno)}
                title="Editar los datos del alumno"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 2px', marginLeft: 'auto' }}
                aria-label={`Editar ${a.nombre} ${a.apellidos}`}>
                ✏️
              </button>
              <button
                onClick={() => setAlumnoGaleria(a as unknown as DBAlumno)}
                title="Ver evidencias del alumno"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
                aria-label={`Evidencias de ${a.nombre} ${a.apellidos}`}>
                📸
              </button>
            </div>
          </div>
        ))}
      </div>

      {alumnoGaleria && (
        <EvidenciasGaleria alumno={alumnoGaleria} onClose={() => setAlumnoGaleria(null)} />
      )}

      {alumnoEditar && grupoId && (
        <EditarAlumno
          alumno={alumnoEditar}
          grupoId={Number(grupoId)}
          onCerrar={() => setAlumnoEditar(null)}
          onGuardado={() => { setAlumnoEditar(null); recargar() }}
        />
      )}
    </>
  )
}

// ─── Formulario individual ───────────────────────────────────────────────────

function FormNuevoAlumno({ grupoIdInicial, onGuardar, onCancelar }: any) {
  const [form, setForm] = useState({ nombre: '', apellidos: '', neae: false, observaciones: '' })
  const s = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre || !form.apellidos) return
    onGuardar({ nombre: form.nombre, apellidos: form.apellidos, neae: form.neae, observaciones: form.observaciones })
  }

  return (
    <div className="card" style={{ maxWidth: 480, marginBottom: 24 }}>
      <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Nuevo alumno</h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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

// ─── Importador masivo ───────────────────────────────────────────────────────

function ImportadorMasivo({ grupoId, onCompletado, onCerrar }: {
  grupoId: string | null; onCompletado: () => void; onCerrar: () => void
}) {
  const [texto, setTexto] = useState('')
  const [parsed, setParsed] = useState<ParsedAlumno[]>([])
  const [editados, setEditados] = useState<ParsedAlumno[]>([])
  const [paso, setPaso] = useState<'entrada' | 'preview'>('entrada')
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<any>(null)

  const analizar = () => {
    const lista = parsearTexto(texto)
    setParsed(lista)
    setEditados(lista.map(a => ({ ...a })))
    setPaso('preview')
  }

  const editarAlumno = (i: number, campo: 'nombre' | 'apellidos', val: string) => {
    setEditados(prev => prev.map((a, idx) => idx === i ? { ...a, [campo]: val } : a))
  }

  const eliminarFila = (i: number) => setEditados(prev => prev.filter((_, idx) => idx !== i))

  const confirmar = async () => {
    const validos = editados.filter(a => a.nombre.trim())
    if (validos.length === 0 || !grupoId) return
    setGuardando(true)
    try {
      let insertados = 0
      for (const al of validos) {
        await dbCrearAlumno({
          nombre: al.nombre, apellidos: al.apellidos,
          neae: 0, etiquetas: '[]',
        }, Number(grupoId))
        insertados++
      }
      setResultado({ total: insertados })
      onCompletado()
    } finally {
      setGuardando(false)
    }
  }

  if (resultado) {
    return (
      <div className="card" style={{ marginBottom: 24, maxWidth: 560 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          {resultado.total} alumno{resultado.total !== 1 ? 's' : ''} creado{resultado.total !== 1 ? 's' : ''} correctamente
        </div>
        <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 16 }}>
          Se ha asignado un código de anonimización a cada alumno.
          {grupoId && ' Pulsa "Descargar claves" arriba para guardar la lista de códigos.'}
        </div>
        <button className="btn-primary" onClick={onCerrar}>Cerrar</button>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 24, maxWidth: 680 }}>
      {paso === 'entrada' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Importar lista de alumnado</h3>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onCerrar}>✕ Cancelar</button>
          </div>

          <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 10 }}>
            Pega el listado en cualquiera de estos formatos:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Una por línea', ejemplo: 'Juan García\nMaría López\nPedro Pérez' },
              { label: 'Apellidos, Nombre', ejemplo: 'García López, Juan\nLópez Martínez, María' },
              { label: 'Separado por comas', ejemplo: 'Juan García, María López, Pedro Pérez' },
            ].map(f => (
              <div key={f.label} style={{ background: 'var(--gris-100)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--azul-700)', marginBottom: 4 }}>{f.label}</div>
                <pre style={{ fontSize: 11, color: 'var(--gris-600)', margin: 0, whiteSpace: 'pre-wrap' }}>{f.ejemplo}</pre>
              </div>
            ))}
          </div>

          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Pega aquí la lista de alumnado…"
            rows={8}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
            autoFocus
          />

          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button className="btn-primary" onClick={analizar} disabled={texto.trim().length < 2}>
              Analizar ({parsearTexto(texto).length} alumnos detectados)
            </button>
            <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Confirmar importación — {editados.length} alumnos</h3>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setPaso('entrada')}>← Volver</button>
          </div>

          <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 12 }}>
            Revisa y corrige si es necesario. Cada alumno recibirá un código de anonimización automáticamente.
          </div>

          <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--azul-100)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--azul-700)' }}>#</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--azul-700)' }}>Nombre</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--azul-700)' }}>Apellidos</th>
                  <th style={{ padding: '6px 10px', width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {editados.map((a, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gris-100)' }}>
                    <td style={{ padding: '4px 10px', color: 'var(--gris-600)', fontSize: 12 }}>{i + 1}</td>
                    <td style={{ padding: '4px 6px' }}>
                      <input value={a.nombre} onChange={e => editarAlumno(i, 'nombre', e.target.value)}
                        style={{ width: '100%', padding: '4px 8px' }} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input value={a.apellidos} onChange={e => editarAlumno(i, 'apellidos', e.target.value)}
                        style={{ width: '100%', padding: '4px 8px' }} />
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <button onClick={() => eliminarFila(i)}
                        style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 16, padding: 0 }}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" onClick={confirmar} disabled={guardando || editados.length === 0}>
              {guardando ? 'Importando…' : `Confirmar e importar (${editados.length})`}
            </button>
            <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Editar un alumno ya creado ─────────────────────────────────────────────

function EditarAlumno({ alumno, grupoId, onCerrar, onGuardado }: {
  alumno: DBAlumno
  grupoId: number
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [form, setForm] = useState({
    nombre: alumno.nombre,
    apellidos: alumno.apellidos,
    neae: !!alumno.neae,
    observaciones: alumno.observaciones || '',
  })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCerrar])

  const guardar = async () => {
    if (!form.nombre.trim() || !form.apellidos.trim()) return
    setGuardando(true)
    await actualizarAlumno(alumno.id!, {
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      neae: form.neae ? 1 : 0,
      observaciones: form.observaciones.trim() || undefined,
    })
    onGuardado()
  }

  const quitar = async () => {
    // No borra al alumno: lo da de baja en esta clase. Sus notas y evidencias
    // siguen ahí, que es lo que hace falta si vuelve o si fue un error.
    const ok = window.confirm(
      `¿Quitar a ${form.nombre} ${form.apellidos} de esta clase?\n\n` +
      'Sus calificaciones y evidencias se conservan; deja de aparecer en las ' +
      'listas de esta clase. Puedes volver a añadirlo.')
    if (!ok) return
    setGuardando(true)
    await eliminarAlumno(alumno.id!, grupoId)
    onGuardado()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Editar alumno"
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" style={{ width: 'min(430px, 94vw)', padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Editar alumno</h2>

        <label htmlFor="ed-apellidos" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Apellidos</label>
        <input id="ed-apellidos" value={form.apellidos} autoFocus
          onChange={e => setForm({ ...form, apellidos: e.target.value })}
          style={{ width: '100%', marginBottom: 12 }} />

        <label htmlFor="ed-nombre" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Nombre</label>
        <input id="ed-nombre" value={form.nombre}
          onChange={e => setForm({ ...form, nombre: e.target.value })}
          style={{ width: '100%', marginBottom: 12 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 12 }}>
          <input type="checkbox" checked={form.neae}
            onChange={e => setForm({ ...form, neae: e.target.checked })} />
          Necesidades específicas de apoyo educativo (NEAE)
        </label>

        <label htmlFor="ed-obs" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Observaciones</label>
        <textarea id="ed-obs" value={form.observaciones} rows={3}
          onChange={e => setForm({ ...form, observaciones: e.target.value })}
          style={{ width: '100%', marginBottom: 18 }} />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn-primary" onClick={guardar}
            disabled={guardando || !form.nombre.trim() || !form.apellidos.trim()}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button className="btn-secondary" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button onClick={quitar} disabled={guardando}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                     color: 'var(--rojo-500, #b91c1c)', fontSize: 13, fontWeight: 600 }}>
            Quitar de la clase
          </button>
        </div>
      </div>
    </div>
  )
}
