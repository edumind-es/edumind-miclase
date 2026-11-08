/**
 * Crear o editar una sesión planificada a mano. Mover una sesión es cambiarle
 * aquí el día o la franja. Los criterios se escriben como en el .md («CA6.5,
 * CA6.6») y se casan con el currículo del área al guardar.
 */
import { useEffect, useState } from 'react'
import type { Asignatura, Grupo, SesionPlan, TipoSesionPlan } from '@/db/localDb'
import { getUnidades, guardarSesionPlan, type UnidadConCriterios } from '@/db/queries'
import { casarCriterios, criteriosDe, secuenciaDe } from '@/planificacion/casar'
import { codigosCriterio, normalizarHora } from '@/planificacion/semanal'
import type { Franja } from '@/planificacion/exportar'
import { useAppStore } from '@/store/useAppStore'
import { idsDeCriterios } from './curriculo'

interface Props {
  grupo: Grupo & { id?: number }
  asignaturas: Asignatura[]
  /** La sesión a editar, o los campos de partida de una nueva (día y franja pulsados). */
  sesion: Partial<SesionPlan>
  franjas: Franja[]
  onCerrar: () => void
  onGuardado: () => void
}

const OTRA = -1

function secuenciaATexto(s: Partial<SesionPlan>): string {
  return secuenciaDe({ secuencia_json: s.secuencia_json ?? null })
    .map(f => `${f.fase}${f.minutos != null ? ` (${f.minutos} min)` : ''}: ${f.texto}`).join('\n')
}

/** «Inicio (10 min): texto», una fase por línea. */
function textoASecuencia(t: string) {
  return t.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = /^([^:(]+?)\s*(?:\((\d+)\s*min\.?\))?\s*:\s*(.*)$/i.exec(l)
    return m ? { fase: m[1].trim(), minutos: m[2] ? Number(m[2]) : null, texto: m[3].trim() }
      : { fase: '', minutos: null, texto: l }
  })
}

export default function EditarSesion({ grupo, asignaturas, sesion, franjas, onCerrar, onGuardado }: Props) {
  const headers = useAppStore(s => s._headers)
  const [f, setF] = useState({
    fecha: sesion.fecha ?? '',
    franja: sesion.franja ?? '',
    hora_inicio: sesion.hora_inicio ?? '',
    hora_fin: sesion.hora_fin ?? '',
    asignatura_id: sesion.asignatura_id ?? (sesion.area ? OTRA : (asignaturas[0]?.id ?? OTRA)),
    area: sesion.area ?? '',
    unidad_id: sesion.unidad_id ?? null as number | null,
    unidad_texto: sesion.unidad_texto ?? '',
    titulo: sesion.titulo ?? '',
    tipo: (sesion.tipo ?? 'clase') as TipoSesionPlan,
    evaluable: !!sesion.evaluable,
    objetivo: sesion.objetivo ?? '',
    secuencia: secuenciaATexto(sesion),
    recursos: sesion.recursos ?? '',
    evaluacion: sesion.evaluacion ?? '',
    criterios: criteriosDe({ criterios_json: sesion.criterios_json ?? null }).map(c => c.codigo).join(', '),
  })
  const [unidades, setUnidades] = useState<UnidadConCriterios[]>([])
  const [error, setError] = useState<string | null>(null)
  const pon = (campos: Partial<typeof f>) => setF(prev => ({ ...prev, ...campos }))

  useEffect(() => {
    if (f.asignatura_id && f.asignatura_id !== OTRA) getUnidades(f.asignatura_id).then(setUnidades).catch(() => setUnidades([]))
    else setUnidades([])
  }, [f.asignatura_id])

  const elegirFranja = (clave: string) => {
    const fr = franjas.find(x => `${x.hora_inicio}-${x.hora_fin}` === clave)
    if (fr) pon({ franja: fr.franja ?? '', hora_inicio: fr.hora_inicio, hora_fin: fr.hora_fin })
  }

  const guardar = async () => {
    setError(null)
    const hi = normalizarHora(f.hora_inicio), hf = normalizarHora(f.hora_fin)
    if (!f.fecha || !/^\d{1,2}:\d{2}$/.test(hi) || !/^\d{1,2}:\d{2}$/.test(hf)) {
      setError('Hacen falta el día y las horas de inicio y fin (por ejemplo, 9:00 y 9:50).'); return
    }
    const asig = asignaturas.find(a => a.id === f.asignatura_id) ?? null
    const area = asig ? (asig.nombre_display || asig.nombre) : f.area.trim()
    if (!area) { setError('Falta el área.'); return }
    const codigos = codigosCriterio(f.criterios)
    const ids = asig && codigos.length ? await idsDeCriterios(grupo, asig, headers()) : null
    const uni = unidades.find(u => u.id === f.unidad_id) ?? null
    const fases = textoASecuencia(f.secuencia)
    try {
      await guardarSesionPlan({
        grupo_id: grupo.id!,
        fecha: f.fecha,
        franja: f.franja.trim() || null,
        hora_inicio: hi,
        hora_fin: hf,
        area,
        asignatura_id: asig?.id ?? null,
        unidad_id: uni?.id ?? null,
        unidad_texto: uni ? uni.nombre : (f.unidad_texto.trim() || null),
        titulo: f.titulo.trim(),
        tipo: f.tipo,
        evaluable: f.evaluable ? 1 : 0,
        objetivo: f.objetivo.trim() || null,
        secuencia_json: fases.length ? JSON.stringify(fases) : null,
        recursos: f.recursos.trim() || null,
        evaluacion: f.evaluacion.trim() || null,
        criterios_json: codigos.length ? JSON.stringify(casarCriterios(codigos, ids)) : null,
        bloque: sesion.bloque ?? null,
        origen: sesion.origen ?? 'manual',
      }, sesion.id)
      onGuardado()
    } catch (e) {
      setError(`No se pudo guardar: ${(e as Error).message}`)
    }
  }

  const claveFranja = `${f.hora_inicio}-${f.hora_fin}`

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card plan-modal" role="dialog" aria-modal="true" aria-label={sesion.id ? 'Editar sesión' : 'Nueva sesión'}>
        <div className="plan-modal-cab">
          <h2>{sesion.id ? 'Editar sesión' : 'Nueva sesión'}</h2>
          <button className="modal-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>

        <div className="plan-form">
          <label>Día<input type="date" data-campo="fecha" value={f.fecha} onChange={e => pon({ fecha: e.target.value })} /></label>
          {franjas.length > 0 && (
            <label>Franja
              <select data-campo="franja-elegir" value={franjas.some(x => `${x.hora_inicio}-${x.hora_fin}` === claveFranja) ? claveFranja : ''}
                onChange={e => elegirFranja(e.target.value)}>
                <option value="">Otra hora…</option>
                {franjas.map(x => <option key={`${x.hora_inicio}-${x.hora_fin}`} value={`${x.hora_inicio}-${x.hora_fin}`}>
                  {x.franja ? `${x.franja} · ` : ''}{x.hora_inicio}-{x.hora_fin}</option>)}
              </select>
            </label>
          )}
          <label>Empieza<input data-campo="hora_inicio" value={f.hora_inicio} placeholder="9:00" onChange={e => pon({ hora_inicio: e.target.value })} /></label>
          <label>Acaba<input data-campo="hora_fin" value={f.hora_fin} placeholder="9:50" onChange={e => pon({ hora_fin: e.target.value })} /></label>
          <label>Nombre de la franja<input data-campo="franja" value={f.franja} placeholder="1ª" onChange={e => pon({ franja: e.target.value })} /></label>
          <label>Tipo
            <select data-campo="tipo" value={f.tipo} onChange={e => pon({ tipo: e.target.value as TipoSesionPlan })}>
              <option value="clase">Clase</option>
              <option value="especialista">Especialista</option>
              <option value="centro">Actividad de centro</option>
            </select>
          </label>
          <label>Área
            <select data-campo="asignatura" value={f.asignatura_id ?? OTRA} onChange={e => pon({ asignatura_id: Number(e.target.value), unidad_id: null })}>
              {asignaturas.map(a => <option key={a.id} value={a.id}>{a.nombre_display || a.nombre}</option>)}
              <option value={OTRA}>Otra (escríbela)</option>
            </select>
          </label>
          {f.asignatura_id === OTRA && (
            <label>Nombre del área<input data-campo="area" value={f.area} onChange={e => pon({ area: e.target.value })} /></label>
          )}
          {f.asignatura_id !== OTRA && unidades.length > 0 ? (
            <label>Unidad
              <select data-campo="unidad" value={f.unidad_id ?? ''} onChange={e => pon({ unidad_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{f.unidad_texto ? `«${f.unidad_texto}» (sin enlazar)` : 'Ninguna'}</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </label>
          ) : (
            <label>Unidad<input data-campo="unidad_texto" value={f.unidad_texto} placeholder="UD3 · …" onChange={e => pon({ unidad_texto: e.target.value })} /></label>
          )}
          <label className="plan-form-ancho">Título<input data-campo="titulo" value={f.titulo} onChange={e => pon({ titulo: e.target.value })} /></label>
          <label className="plan-form-check">
            <input type="checkbox" data-campo="evaluable" checked={f.evaluable} onChange={e => pon({ evaluable: e.target.checked })} />
            ■ Evaluable (hay algo que calificar)
          </label>
          <label className="plan-form-ancho">Objetivo<textarea rows={2} data-campo="objetivo" value={f.objetivo} onChange={e => pon({ objetivo: e.target.value })} /></label>
          <label className="plan-form-ancho">Secuencia <small>(una fase por línea: «Inicio (10 min): …»)</small>
            <textarea rows={4} data-campo="secuencia" value={f.secuencia} onChange={e => pon({ secuencia: e.target.value })} />
          </label>
          <label className="plan-form-ancho">Recursos<textarea rows={2} data-campo="recursos" value={f.recursos} onChange={e => pon({ recursos: e.target.value })} /></label>
          <label className="plan-form-ancho">Evaluación formativa<textarea rows={2} data-campo="evaluacion" value={f.evaluacion} onChange={e => pon({ evaluacion: e.target.value })} /></label>
          <label className="plan-form-ancho">Criterios anclados <small>(«CA6.5, CA6.6»)</small>
            <input data-campo="criterios" value={f.criterios} onChange={e => pon({ criterios: e.target.value })} />
          </label>
        </div>

        {error && <div className="plan-aviso plan-aviso--error">{error}</div>}
        <div className="plan-modal-pie">
          <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" data-sesion-guardar onClick={guardar}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
