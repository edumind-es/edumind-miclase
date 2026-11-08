/** Crear, editar o borrar un evento del calendario (festivo, actividad, evaluación, reunión). */
import { useState } from 'react'
import { TODAS_LAS_CLASES, type EventoCalendario, type Grupo, type TipoEvento } from '@/db/localDb'
import { eliminarEvento, guardarEvento } from '@/db/queries'

export const TIPOS_EVENTO: { valor: TipoEvento; etiqueta: string; icono: string }[] = [
  { valor: 'festivo',    etiqueta: 'Festivo',             icono: '🏖' },
  { valor: 'centro',     etiqueta: 'Actividad de centro', icono: '🏫' },
  { valor: 'evaluacion', etiqueta: 'Evaluación',          icono: '📝' },
  { valor: 'reunion',    etiqueta: 'Reunión',             icono: '👥' },
  { valor: 'nota',       etiqueta: 'Nota del día',        icono: '✎' },
  { valor: 'otro',       etiqueta: 'Otro',                icono: '•' },
]
export const iconoEvento = (t: TipoEvento) => TIPOS_EVENTO.find(x => x.valor === t)?.icono ?? '•'

interface Props {
  grupo: Grupo & { id?: number }
  evento: Partial<EventoCalendario>
  onCerrar: () => void
  onGuardado: () => void
}

export default function EditarEvento({ grupo, evento, onCerrar, onGuardado }: Props) {
  const [f, setF] = useState({
    fecha: evento.fecha ?? '',
    fecha_fin: evento.fecha_fin ?? '',
    hora: evento.hora ?? '',
    tipo: (evento.tipo ?? 'centro') as TipoEvento,
    titulo: evento.titulo ?? '',
    notas: evento.notas ?? '',
    todas: evento.grupo_id === TODAS_LAS_CLASES,
  })
  const [error, setError] = useState<string | null>(null)
  const pon = (c: Partial<typeof f>) => setF(p => ({ ...p, ...c }))

  const guardar = async () => {
    if (!f.fecha || !f.titulo.trim()) { setError('Hacen falta el día y el título.'); return }
    if (f.fecha_fin && f.fecha_fin < f.fecha) { setError('El último día no puede ser anterior al primero.'); return }
    await guardarEvento({
      grupo_id: f.todas ? TODAS_LAS_CLASES : grupo.id!,
      fecha: f.fecha,
      fecha_fin: f.fecha_fin && f.fecha_fin !== f.fecha ? f.fecha_fin : null,
      hora: f.hora.trim() || null,
      tipo: f.tipo,
      titulo: f.titulo.trim(),
      notas: f.notas.trim() || null,
      origen: evento.origen ?? 'manual',
    }, evento.id)
    onGuardado()
  }

  const borrar = async () => {
    if (!evento.id || !confirm(`¿Borrar «${evento.titulo}» del calendario?`)) return
    await eliminarEvento(evento.id)
    onGuardado()
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card plan-modal plan-modal--estrecho" role="dialog" aria-modal="true" aria-label={evento.id ? 'Editar evento' : 'Nuevo evento'}>
        <div className="plan-modal-cab">
          <h2>{evento.id ? 'Editar evento' : 'Nuevo evento'}</h2>
          <button className="modal-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="plan-form">
          <label className="plan-form-ancho">Título<input data-evento-campo="titulo" value={f.titulo} onChange={e => pon({ titulo: e.target.value })} /></label>
          <label>Tipo
            <select data-evento-campo="tipo" value={f.tipo} onChange={e => pon({ tipo: e.target.value as TipoEvento })}>
              {TIPOS_EVENTO.map(t => <option key={t.valor} value={t.valor}>{t.icono} {t.etiqueta}</option>)}
            </select>
          </label>
          <label>Hora <small>(opcional)</small><input value={f.hora} placeholder="16:00" onChange={e => pon({ hora: e.target.value })} /></label>
          <label>Día<input type="date" data-evento-campo="fecha" value={f.fecha} onChange={e => pon({ fecha: e.target.value })} /></label>
          <label>Hasta <small>(si dura varios días)</small><input type="date" value={f.fecha_fin} onChange={e => pon({ fecha_fin: e.target.value })} /></label>
          <label className="plan-form-ancho">Notas<textarea rows={2} value={f.notas} onChange={e => pon({ notas: e.target.value })} /></label>
          <label className="plan-form-check plan-form-ancho">
            <input type="checkbox" checked={f.todas} onChange={e => pon({ todas: e.target.checked })} />
            Vale para todas mis clases (no solo {grupo.nombre})
          </label>
        </div>
        {error && <div className="plan-aviso plan-aviso--error">{error}</div>}
        <div className="plan-modal-pie">
          {evento.id && <button className="btn-danger" data-evento-borrar onClick={borrar} style={{ marginRight: 'auto' }}>Borrar</button>}
          <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" data-evento-guardar onClick={guardar}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
