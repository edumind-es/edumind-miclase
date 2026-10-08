/**
 * «Evaluar hoy»: una pasada por toda la clase con un instrumento.
 *
 * Es el gesto de aula que la matriz no permitía: recoger los billetes de
 * salida, revisar los apuntes de todos, anotar la participación de la sesión.
 * Una fila por alumno, cuatro niveles, y cada pulsación va al diario de
 * evaluación —no pisa nada— repartiendo a todos los criterios que la
 * programación asigna al instrumento. La nota del criterio sale sola con la
 * regla del instrumento.
 *
 * Volver a pulsar el mismo nivel lo quita; pulsar otro lo cambia: en el
 * mismo día un alumno tiene un solo registro con este instrumento, para que
 * equivocarse de botón no deje dos.
 *
 * Si el instrumento tiene rúbrica —niveles e indicadores—, los cuatro niveles
 * del diario no pintan nada: la herramienta elegida es la rúbrica, y lo que
 * se abre es `SesionRubrica`. Luis la pidió así: abrir «Evaluar hoy» en un
 * instrumento con rúbrica y encontrarse una escala era un engaño.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  anadirRegistro, editarRegistro, borrarRegistro, getRegistrosDeCelda, getRubrica,
  type CeldaInstrumento, type DatosDeArea,
} from '@/db/queries'
import SesionRubrica, { type IndicadorRubrica, type NivelRubrica } from './SesionRubrica'
import { ETIQUETAS_NIVEL, NIVELES_DIARIO, etiquetaAgregacion, nivelDiarioANota, notaDeDiario } from '@/db/diario'
import { calificativo } from '@/db/calculo'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import type { Alumno, RegistroDiario } from '@/db/localDb'

interface Props {
  instrumento: CeldaInstrumento
  criterios: { id: string; descripcion: string }[]
  alumnos: Alumno[]
  trimestre: number
  unidadId: number | null
  unidadNombre?: string
  area: DatosDeArea
  /** Algo ha cambiado en el diario: la matriz tiene que releerse. */
  onCambio: () => void
  onCerrar: () => void
}

/** AAAA-MM-DD en hora local: lo que entiende `<input type="date">`. */
function diaLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** El registro de ese día se guarda al mediodía local: ni ayer ni mañana en ningún huso. */
function fechaDe(dia: string): string {
  return dia === diaLocal() ? new Date().toISOString() : new Date(`${dia}T12:00:00`).toISOString()
}

/** La rúbrica del instrumento si está completa; `null` si no la hay o está a medias. */
function rubricaCompleta(r: { niveles_json: string; indicadores_json: string } | null): { niveles: NivelRubrica[]; indicadores: IndicadorRubrica[] } | null {
  if (!r) return null
  try {
    const niveles = (JSON.parse(r.niveles_json) as NivelRubrica[]).filter(n => typeof n?.valor === 'number')
    const inds = JSON.parse(r.indicadores_json) as IndicadorRubrica[]
    const indicadores = Array.isArray(inds) ? inds.filter(i => i?.nombre) : []
    return niveles.length && indicadores.length ? { niveles, indicadores } : null
  } catch { return null }
}

export default function SesionInstrumento(props: Props) {
  /** `undefined` mientras se lee: no se enseña el diario para cambiarlo por la rúbrica un instante después. */
  const [rubrica, setRubrica] = useState<ReturnType<typeof rubricaCompleta> | undefined>(undefined)
  useEffect(() => {
    let vigente = true
    setRubrica(undefined)
    getRubrica(props.instrumento.instrumento_id).then(r => { if (vigente) setRubrica(rubricaCompleta(r)) })
    return () => { vigente = false }
  }, [props.instrumento.instrumento_id])
  if (rubrica === undefined) return null
  if (rubrica) return <SesionRubrica {...props} niveles={rubrica.niveles} indicadores={rubrica.indicadores} />
  return <SesionDiario {...props} />
}

function SesionDiario({
  instrumento, criterios, alumnos, trimestre, unidadId, unidadNombre, area, onCambio, onCerrar,
}: Props) {
  const [dia, setDia] = useState(diaLocal())
  /** alumno_id → todos sus registros con este instrumento en el trimestre. */
  const [registros, setRegistros] = useState<Map<number, RegistroDiario[]>>(new Map())
  const [notaAbierta, setNotaAbierta] = useState<number | null>(null)
  const [textos, setTextos] = useState<Record<number, string>>({})
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  const cfg = getInstrConfig(instrumento.tipo)
  const ids = useMemo(() => criterios.map(c => c.id), [criterios])

  useEffect(() => {
    let vigente = true
    Promise.all(alumnos.map(a => getRegistrosDeCelda(a.id!, instrumento.instrumento_id, trimestre)))
      .then(listas => {
        if (!vigente) return
        setRegistros(new Map(alumnos.map((a, i) => [a.id!, listas[i]])))
      })
    return () => { vigente = false }
  }, [alumnos, instrumento.instrumento_id, trimestre, recarga])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  /** El registro del día elegido, si el alumno ya tiene uno (el último, por si hubiera dos). */
  const registroDelDia = (alumnoId: number): RegistroDiario | undefined => {
    const regs = registros.get(alumnoId) ?? []
    return [...regs].reverse().find(r => diaLocal(new Date(r.fecha)) === dia)
  }

  const cambiado = () => { setRecarga(n => n + 1); onCambio() }

  const marcar = async (al: Alumno, nivel: number) => {
    setOcupado(al.id!); setError(null)
    try {
      const actual = registroDelDia(al.id!)
      if (actual && actual.valor === nivel) {
        await borrarRegistro(actual.id!)
      } else if (actual) {
        await editarRegistro(actual.id!, { valor: nivel })
      } else {
        await anadirRegistro({
          alumno_id: al.id!, instrumento_id: instrumento.instrumento_id, trimestre, unidad_id: unidadId,
          valor: nivel, observacion: textos[al.id!]?.trim() || null, criterios: ids, area, fecha: fechaDe(dia),
        })
      }
      cambiado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el registro')
    } finally { setOcupado(null) }
  }

  const guardarTexto = async (al: Alumno) => {
    const actual = registroDelDia(al.id!)
    const texto = textos[al.id!]?.trim() || null
    if (!actual || (actual.observacion ?? null) === texto) return
    try {
      await editarRegistro(actual.id!, { observacion: texto })
      cambiado()
    } catch {
      setError('No se pudo guardar la observación')
    }
  }

  const evaluadosHoy = alumnos.filter(a => registroDelDia(a.id!)).length

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Evaluar hoy: ${instrumento.nombre}`}
        style={{ width: 'min(720px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)', borderTop: `4px solid ${instrumento.color}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--azul-900)' }}>
              <span aria-hidden="true">{cfg.icon}</span> {instrumento.nombre}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)', lineHeight: 1.5 }}>
              {cfg.label} · {trimestre}º trim.{unidadNombre ? ` · ${unidadNombre}` : ''} · nota por {etiquetaAgregacion(instrumento.agregacion).toLowerCase()} del diario
            </div>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 10.5, color: 'var(--gris-600)', fontWeight: 600 }}>
            Día
            <input type="date" value={dia} max={diaLocal()} onChange={e => e.target.value && setDia(e.target.value)}
              style={{ fontSize: 13, padding: '4px 6px' }} />
          </label>
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar">✕</button>
        </div>

        <div style={{ padding: '12px 18px 18px' }}>
          <div style={{ background: 'var(--azul-100)', borderRadius: 9, padding: '9px 12px', marginBottom: 12, fontSize: 12.5, color: 'var(--gris-900)', lineHeight: 1.5 }}>
            <strong>Cada nivel se anota en {ids.length} criterio{ids.length !== 1 ? 's' : ''}:</strong>{' '}
            {criterios.map(c => <span key={c.id} title={c.descripcion} style={{ fontWeight: 700, color: 'var(--azul-700)', marginRight: 6 }}>{c.id}</span>)}
            <span style={{ color: 'var(--gris-600)' }}>— los que la programación asigna a este instrumento. Nada se pisa: cada día es un registro más.</span>
          </div>

          {error && <div style={{ color: 'var(--rojo-500)', fontSize: 12.5, marginBottom: 8 }}>{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {alumnos.map(al => {
              const hoy = registroDelDia(al.id!)
              const todos = registros.get(al.id!) ?? []
              const nota = notaDeDiario(todos, instrumento.agregacion)
              const cal = calificativo(nota)
              const bloqueado = ocupado === al.id
              return (
                <div key={al.id} data-sesion-fila style={{
                  display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) auto auto', gap: 8, alignItems: 'center',
                  padding: '6px 8px', borderRadius: 8, background: hoy ? 'var(--verde-100)' : 'transparent',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--gris-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {al.apellidos}, {al.nombre}
                      {al.neae ? <span style={{ marginLeft: 6, fontSize: 9.5, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
                    </div>
                    <div data-sesion-nota style={{ fontSize: 11, color: 'var(--gris-600)' }}>
                      {todos.length === 0
                        ? 'Sin registros'
                        : <>{todos.length} registro{todos.length !== 1 ? 's' : ''} · {todos.slice(-4).map(r => r.valor).join('·')} → <strong style={{ color: cal.color }}>{nota}</strong></>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {NIVELES_DIARIO.map(n => {
                      const c = calificativo(nivelDiarioANota(n))
                      const activo = hoy?.valor === n
                      return (
                        <button key={n} type="button" className={`nivel-${n}`} aria-pressed={activo} disabled={bloqueado}
                          onClick={() => marcar(al, n)}
                          title={`${ETIQUETAS_NIVEL[n]} (${nivelDiarioANota(n)})${activo ? ' · pulsar otra vez lo quita' : ''}`}
                          style={{
                            width: 44, height: 40, borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 15,
                            border: `2px solid ${activo ? 'var(--gris-900)' : 'transparent'}`,
                            background: activo ? c.color : hoy ? 'var(--gris-100)' : c.color,
                            color: activo ? 'white' : hoy ? 'var(--gris-500)' : 'white',
                            opacity: hoy && !activo ? .75 : 1,
                          }}>
                          {n}
                        </button>
                      )
                    })}
                  </div>
                  <button type="button" onClick={() => setNotaAbierta(notaAbierta === al.id ? null : al.id!)}
                    title="Añadir una observación a este registro" aria-label={`Observación de ${al.nombre}`}
                    style={{ background: 'none', border: '1px solid var(--gris-300)', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', color: (hoy?.observacion || textos[al.id!]) ? 'var(--azul-700)' : 'var(--gris-500)' }}>
                    ✎
                  </button>
                  {notaAbierta === al.id && (
                    <input autoFocus value={textos[al.id!] ?? hoy?.observacion ?? ''} placeholder="Qué has observado (opcional)…"
                      onChange={e => setTextos(t => ({ ...t, [al.id!]: e.target.value }))}
                      onBlur={() => guardarTexto(al)}
                      onKeyDown={e => { if (e.key === 'Enter') { guardarTexto(al); setNotaAbierta(null) } }}
                      style={{ gridColumn: '1 / -1', fontSize: 12.5, minHeight: 34 }} />
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, fontSize: 12.5, color: 'var(--gris-600)' }}>
            <span data-sesion-resumen><strong>{evaluadosHoy}</strong> de {alumnos.length} con registro este día</span>
            <div style={{ flex: 1 }} />
            <button className="btn-primary" onClick={onCerrar} style={{ fontSize: 13 }}>Hecho</button>
          </div>
        </div>
      </div>
    </div>
  )
}
