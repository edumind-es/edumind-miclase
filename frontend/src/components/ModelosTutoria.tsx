/**
 * Los modelos de tutoría del docente: los de serie (solo se duplican) y los
 * propios (se editan y se borran). Un modelo dice qué apartados lleva el
 * acta, en qué orden y con qué texto de partida, los puntos del orden del
 * día y si trae a la vista los acuerdos pendientes de antes.
 *
 * Los modelos no son de ninguna clase: sirven para todas.
 */
import { useEffect, useState } from 'react'
import {
  TIPOS_TUTORIA, MODALIDADES, modelosElegibles, claveNueva, nombreTipo,
  type ModeloElegible, type ModeloTutoria,
} from '@/db/tutorias'
import { getModelosTutoria, guardarModeloTutoria, eliminarModeloTutoria } from '@/db/queries'

type Borrador = Omit<ModeloTutoria, 'updated_at' | 'deleted_at' | 'created_at'>

const borradorDe = (m: ModeloElegible, copia: boolean): Borrador => ({
  id: copia ? undefined : m.id,
  nombre: copia ? `${m.nombre} (copia)` : m.nombre,
  tipo: m.tipo, modalidad: m.modalidad,
  apartados: m.apartados.map(a => ({ ...a })),
  orden_dia: [...m.orden_dia],
  con_seguimiento: m.con_seguimiento,
})

const VACIO: Borrador = {
  nombre: '', tipo: 'familia', modalidad: 'presencial',
  apartados: [{ clave: 'temas', titulo: 'Temas tratados', texto: '' }], orden_dia: [], con_seguimiento: true,
}

export default function ModelosTutoria({ onCerrar }: { onCerrar: () => void }) {
  const [modelos, setModelos] = useState<ModeloElegible[]>([])
  const [editando, setEditando] = useState<Borrador | null>(null)
  const [msg, setMsg] = useState('')

  const cargar = async () => setModelos(modelosElegibles(await getModelosTutoria()).filter(m => m.clave !== 'serie:blanco'))
  useEffect(() => { cargar() }, [])

  const guardar = async () => {
    if (!editando) return
    if (!editando.nombre.trim()) { setMsg('Ponle un nombre al modelo.'); return }
    await guardarModeloTutoria(editando)
    setMsg(`Modelo «${editando.nombre.trim()}» guardado.`)
    setEditando(null)
    cargar()
  }

  const borrar = async (m: ModeloElegible) => {
    if (!m.id) return
    if (!window.confirm(`¿Borrar el modelo «${m.nombre}»? Las tutorías ya hechas con él no cambian.`)) return
    await eliminarModeloTutoria(m.id)
    setMsg(`Modelo «${m.nombre}» borrado.`)
    cargar()
  }

  const mover = (i: number, d: -1 | 1) => {
    if (!editando) return
    const l = [...editando.apartados]
    const j = i + d
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    setEditando({ ...editando, apartados: l })
  }

  const etiqueta = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } as const

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label="Modelos de tutoría" data-modelos-tutoria
        style={{ width: 'min(720px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Modelos de tutoría</h2>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {!editando && <>
          <p style={{ fontSize: 13, color: 'var(--gris-600)', marginTop: 0 }}>
            Un modelo es el guion de una tutoría: sus apartados, el orden del día y los textos de partida.
            Los de serie no se cambian: duplícalos y edita tu copia.
          </p>
          {modelos.map(m => (
            <div key={m.clave} data-modelo-fila={m.clave}
              style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--gris-200)', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.nombre} {m.serie && <span className="badge" style={{ background: 'var(--gris-100)', color: 'var(--gris-600)', fontSize: 11 }}>de serie</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>
                  {nombreTipo(m.tipo)} · {m.apartados.map(a => a.titulo).join(' · ')}
                </div>
              </div>
              <button className="btn-secondary" style={{ fontSize: 12.5, padding: '4px 10px' }} data-modelo-duplicar
                onClick={() => { setMsg(''); setEditando(borradorDe(m, true)) }}>Duplicar</button>
              {!m.serie && <>
                <button className="btn-secondary" style={{ fontSize: 12.5, padding: '4px 10px' }} data-modelo-editar
                  onClick={() => { setMsg(''); setEditando(borradorDe(m, false)) }}>Editar</button>
                <button className="btn-secondary" style={{ fontSize: 12.5, padding: '4px 10px' }} data-modelo-borrar
                  onClick={() => borrar(m)}>Borrar</button>
              </>}
            </div>
          ))}
          <button className="btn-primary" style={{ marginTop: 14 }} data-modelo-nuevo
            onClick={() => { setMsg(''); setEditando({ ...VACIO, apartados: VACIO.apartados.map(a => ({ ...a })) }) }}>+ Modelo nuevo</button>
        </>}

        {editando && (
          <div data-modelo-editor>
            <label htmlFor="mod-nombre" style={etiqueta}>Nombre del modelo</label>
            <input id="mod-nombre" value={editando.nombre} autoFocus data-modelo-nombre
              onChange={e => setEditando({ ...editando, nombre: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <label style={{ fontSize: 13 }}>Tipo{' '}
                <select value={editando.tipo} onChange={e => setEditando({ ...editando, tipo: e.target.value as Borrador['tipo'] })}>
                  {TIPOS_TUTORIA.map(x => <option key={x.valor} value={x.valor}>{x.nombre}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>Modalidad{' '}
                <select value={editando.modalidad} onChange={e => setEditando({ ...editando, modalidad: e.target.value as Borrador['modalidad'] })}>
                  {MODALIDADES.map(x => <option key={x.valor} value={x.valor}>{x.nombre}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={editando.con_seguimiento}
                  onChange={e => setEditando({ ...editando, con_seguimiento: e.target.checked })} />
                Abrir con los acuerdos pendientes a la vista
              </label>
            </div>

            <label htmlFor="mod-orden" style={etiqueta}>Orden del día (un punto por línea)</label>
            <textarea id="mod-orden" rows={4} value={editando.orden_dia.join('\n')} data-modelo-orden
              onChange={e => setEditando({ ...editando, orden_dia: e.target.value.split('\n') })}
              onBlur={() => setEditando(v => v && { ...v, orden_dia: v.orden_dia.map(x => x.trim()).filter(Boolean) })}
              style={{ width: '100%', marginBottom: 12 }} />

            <span style={etiqueta}>Apartados del acta, en orden</span>
            {editando.apartados.map((a, i) => (
              <div key={a.clave} data-modelo-apartado style={{ border: '1px solid var(--gris-200)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input value={a.titulo} placeholder="Título del apartado" aria-label={`Título del apartado ${i + 1}`} data-modelo-apartado-titulo
                    onChange={e => setEditando({ ...editando, apartados: editando.apartados.map((x, j) => j === i ? { ...x, titulo: e.target.value } : x) })}
                    style={{ flex: 1, minWidth: 0, fontWeight: 600 }} />
                  <button className="btn-secondary" style={{ padding: '2px 8px' }} aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
                  <button className="btn-secondary" style={{ padding: '2px 8px' }} aria-label="Bajar" disabled={i === editando.apartados.length - 1} onClick={() => mover(i, 1)}>↓</button>
                  <button className="btn-secondary" style={{ padding: '2px 8px' }} aria-label={`Quitar apartado ${i + 1}`}
                    onClick={() => setEditando({ ...editando, apartados: editando.apartados.filter((_, j) => j !== i) })}>×</button>
                </div>
                <textarea value={a.texto} rows={2} placeholder="Texto de partida (opcional)" aria-label={`Texto de partida del apartado ${i + 1}`}
                  onChange={e => setEditando({ ...editando, apartados: editando.apartados.map((x, j) => j === i ? { ...x, texto: e.target.value } : x) })}
                  style={{ width: '100%' }} />
              </div>
            ))}
            <button className="btn-secondary" style={{ fontSize: 12.5, padding: '4px 12px' }} data-modelo-apartado-anadir
              onClick={() => setEditando({ ...editando, apartados: [...editando.apartados, { clave: claveNueva(editando.apartados.map(a => a.clave)), titulo: '', texto: '' }] })}>
              + Apartado
            </button>
            <p style={{ fontSize: 12, color: 'var(--gris-600)' }}>
              Asistentes, acuerdos y próxima cita van siempre en el acta; no hace falta añadirlos.
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn-primary" onClick={guardar} data-modelo-guardar>Guardar modelo</button>
              <button className="btn-secondary" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          </div>
        )}

        {msg && <div role="status" data-modelos-msg style={{ fontSize: 13, color: 'var(--azul-700)', marginTop: 10 }}>{msg}</div>}
      </div>
    </div>
  )
}
