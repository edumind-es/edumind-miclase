/**
 * Adaptación curricular de un alumno en un área: qué criterios de la clase
 * no cuentan para él y cuáles se evalúan con otro texto —el criterio del
 * mismo código en otro curso del currículo, o uno escrito por el docente—.
 *
 * No crea criterios nuevos: la nota del criterio adaptado se guarda en la
 * casilla del criterio de la clase al que sustituye, y aquí solo se guarda
 * el texto (`Medida.criterios_json`) y el curso de referencia. Los criterios
 * de otro curso salen del currículo empaquetado en la app (`@/curriculo`:
 * `cursos` y `criterios`, con el servidor de reserva); nada del alumno sale
 * del aparato.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Alumno, Asignatura, Grupo, Medida } from '@/db/localDb'
import { getUnidades, guardarMedida, eliminarMedida } from '@/db/queries'
import { parsearCriterios, trimestresDeMedida, type CriteriosAdaptados, type Sustituto } from '@/db/medidas'
import * as curriculo from '@/curriculo'

type Props = {
  alumno: Alumno
  asignatura: Asignatura
  grupo: Grupo
  medida: Medida | null
  onCambio: () => void
}

type Criterio = { id: string; descripcion: string }
const ORDINAL: Record<number, string> = { 1: '1T', 2: '2T', 3: '3T' }
const { normalizarCurso } = curriculo

export default function MedidaAdaptacion({ alumno, asignatura, grupo, medida, onCambio }: Props) {
  const comunidad = asignatura.comunidad || grupo.comunidad
  const cursoClase = normalizarCurso(grupo.curso)

  const [programados, setProgramados] = useState<string[]>([])
  const [deClase, setDeClase] = useState<Map<string, string>>(new Map())
  const [cursos, setCursos] = useState<string[]>([])
  const [curso, setCurso] = useState<string>('')
  const [deOtro, setDeOtro] = useState<Criterio[]>([])
  const [criterios, setCriterios] = useState<CriteriosAdaptados>({})
  const [trimestres, setTrimestres] = useState<number[]>([1, 2, 3])
  const [descripcion, setDescripcion] = useState('')
  const [estado, setEstado] = useState('')
  const [errorCurriculo, setErrorCurriculo] = useState(false)

  const criteriosDe = (c: string): Promise<Criterio[]> =>
    curriculo.criterios(asignatura.nombre, c, grupo.etapa, comunidad)

  // Criterios programados del área (unión de las unidades) y sus textos.
  useEffect(() => {
    let vigente = true
    getUnidades(asignatura.id!).then(us => {
      if (!vigente) return
      const ids = new Set<string>()
      for (const u of us) for (const c of u.criterios) ids.add(c.criterio_id)
      setProgramados([...ids].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })))
    })
    criteriosDe(cursoClase)
      .then(all => { if (vigente) { setDeClase(new Map((Array.isArray(all) ? all : []).map(c => [c.id, c.descripcion]))); setErrorCurriculo(false) } })
      .catch(() => { if (vigente) setErrorCurriculo(true) })
    curriculo.cursos(asignatura.nombre, grupo.etapa, comunidad)
      .then(lista => { if (vigente) setCursos((Array.isArray(lista) ? lista : []).map(x => normalizarCurso(x.curso)).filter(c => c !== cursoClase)) })
      .catch(() => { /* sin currículo no hay otros cursos: queda el texto libre */ })
    return () => { vigente = false }
  }, [asignatura.id])

  useEffect(() => {
    setCriterios(parsearCriterios(medida))
    setTrimestres(medida ? trimestresDeMedida(medida) : [1, 2, 3])
    setDescripcion(medida?.descripcion ?? '')
    setCurso(medida?.curso_referencia ?? '')
  }, [medida?.id, medida?.updated_at])

  // Criterios del curso de referencia, cuando se elige otro.
  useEffect(() => {
    if (!curso) { setDeOtro([]); return }
    let vigente = true
    criteriosDe(curso)
      .then(all => { if (vigente) setDeOtro(Array.isArray(all) ? all : []) })
      .catch(() => { if (vigente) setDeOtro([]) })
    return () => { vigente = false }
  }, [curso, asignatura.id])

  const guardar = async (cambios: Partial<Medida>) => {
    await guardarMedida({ alumno_id: alumno.id!, asignatura_id: asignatura.id!, tipo: 'adaptacion', ...cambios })
    setEstado('Guardado')
    onCambio()
  }
  const criteriosJson = (c: CriteriosAdaptados) => JSON.stringify(c)

  const activar = () => guardar({ criterios_json: '{}', trimestres: JSON.stringify(trimestres), curso_referencia: curso || null })

  const fijarCriterio = async (id: string, valor: Sustituto | null | 'igual') => {
    const c = { ...criterios }
    if (valor === 'igual') delete c[id]
    else c[id] = valor
    setCriterios(c)
    await guardar({ criterios_json: criteriosJson(c) })
  }

  const elegirCurso = async (nuevo: string) => {
    setCurso(nuevo)
    if (medida) await guardar({ curso_referencia: nuevo || null })
  }

  /** Sustituir todos los programados por el del mismo código en el curso de referencia. */
  const sustituirTodos = async () => {
    const c = { ...criterios }
    for (const id of programados) {
      const otro = deOtro.find(x => x.id === id)
      if (otro) c[id] = { codigo: otro.id, descripcion: otro.descripcion, curso }
    }
    setCriterios(c)
    await guardar({ criterios_json: criteriosJson(c), curso_referencia: curso })
  }

  const cambiarTrimestres = async (t: number, marcado: boolean) => {
    const lista = [1, 2, 3].filter(x => x === t ? marcado : trimestres.includes(x))
    if (!lista.length) return
    setTrimestres(lista)
    if (medida) await guardar({ trimestres: JSON.stringify(lista) })
  }

  const quitar = async () => {
    if (!medida) return
    if (!window.confirm(`¿Quitar la adaptación de ${alumno.nombre} en ${asignatura.nombre_display}?\n\nSus notas no cambian: vuelven a contar todos los criterios con el texto de la clase.`)) return
    await eliminarMedida(medida.id!)
    setCriterios({})
    setEstado('Adaptación retirada')
    onCambio()
  }

  const modoDe = (id: string): 'igual' | 'excluido' | 'sustituido' => {
    if (!(id in criterios)) return 'igual'
    return criterios[id] === null ? 'excluido' : 'sustituido'
  }
  const cuantos = useMemo(() => ({
    excluidos: Object.values(criterios).filter(v => v === null).length,
    sustituidos: Object.values(criterios).filter(v => v !== null).length,
  }), [criterios])

  return (
    <div data-medida-adaptacion data-activa={medida ? '' : undefined} style={{ display: 'grid', gap: 10 }}>
      {!medida ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--gris-600)' }}>Sin adaptación: se evalúa con los criterios de la clase.</span>
          <button type="button" className="btn-secondary" style={{ fontSize: 13 }} onClick={activar} data-adaptacion-activar>
            Activar adaptación
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Aplica en</span>
            {[1, 2, 3].map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={trimestres.includes(t)} data-adaptacion-trimestre={t}
                  onChange={e => cambiarTrimestres(t, e.target.checked)} /> {ORDINAL[t]}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Criterios de referencia</span>
              <select value={curso} onChange={e => elegirCurso(e.target.value)} data-adaptacion-curso style={{ fontSize: 13 }}>
                <option value="">los de la clase ({cursoClase})</option>
                {cursos.map(c => <option key={c} value={c}>{c} {grupo.etapa}</option>)}
              </select>
            </label>
            {curso && deOtro.length > 0 && (
              <button type="button" className="btn-secondary" style={{ fontSize: 12.5 }} onClick={sustituirTodos} data-adaptacion-sustituir-todos>
                Sustituir todos por el mismo código de {curso}
              </button>
            )}
            {curso && !deOtro.length && <span style={{ fontSize: 12, color: 'var(--ambar-600, #b45309)' }}>No se han podido cargar los criterios de {curso}.</span>}
            {!cursos.length && !errorCurriculo && <span style={{ fontSize: 12, color: 'var(--gris-500)' }}>Sin otros cursos en el currículo: se puede escribir el criterio a mano.</span>}
          </div>

          {!programados.length ? (
            <p style={{ fontSize: 13, color: 'var(--ambar-600, #b45309)', margin: 0 }}>El área aún no tiene criterios programados en ninguna unidad.</p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {programados.map(id => {
                const modo = modoDe(id)
                const sust = modo === 'sustituido' ? criterios[id]! : null
                const otro = deOtro.find(x => x.id === id)
                return (
                  <div key={id} data-adaptacion-criterio={id} data-modo={modo}
                    style={{ borderTop: '1px solid var(--gris-200, #e5e7eb)', padding: '6px 0', display: 'grid', gap: 4, fontSize: 13, opacity: modo === 'excluido' ? .6 : 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <strong style={{ color: 'var(--azul-900)', whiteSpace: 'nowrap' }}>{id}</strong>
                      <span style={{ flex: 1, color: 'var(--gris-600)', fontSize: 12.5 }}>{deClase.get(id) ?? ''}</span>
                      <select value={modo} data-adaptacion-modo style={{ fontSize: 12 }}
                        onChange={e => {
                          const v = e.target.value
                          if (v === 'igual') fijarCriterio(id, 'igual')
                          else if (v === 'excluido') fijarCriterio(id, null)
                          else fijarCriterio(id, otro ? { codigo: otro.id, descripcion: otro.descripcion, curso } : { codigo: id, descripcion: '', curso: null })
                        }}>
                        <option value="igual">Igual que la clase</option>
                        <option value="excluido">No cuenta</option>
                        <option value="sustituido">Sustituir por…</option>
                      </select>
                    </div>
                    {sust && (
                      <div style={{ display: 'grid', gap: 4, marginLeft: 8 }}>
                        {deOtro.length > 0 && (
                          <select value={deOtro.some(x => x.id === sust.codigo && x.descripcion === sust.descripcion) ? sust.codigo : ''} data-adaptacion-sustituto
                            onChange={e => {
                              const o = deOtro.find(x => x.id === e.target.value)
                              if (o) fijarCriterio(id, { codigo: o.id, descripcion: o.descripcion, curso })
                            }} style={{ fontSize: 12, maxWidth: '100%' }}>
                            <option value="">— elegir un criterio de {curso} —</option>
                            {deOtro.map(o => <option key={o.id} value={o.id}>{o.id} · {o.descripcion.slice(0, 90)}{o.descripcion.length > 90 ? '…' : ''}</option>)}
                          </select>
                        )}
                        <textarea rows={2} value={sust.descripcion} data-adaptacion-texto placeholder="Criterio adaptado, con tus palabras"
                          onChange={e => setCriterios(c => ({ ...c, [id]: { ...sust, descripcion: e.target.value } }))}
                          onBlur={e => { if (e.target.value !== (parsearCriterios(medida)[id]?.descripcion ?? '')) fijarCriterio(id, { ...sust, descripcion: e.target.value }) }}
                          style={{ width: '100%', fontSize: 12.5 }} />
                        <span style={{ fontSize: 11.5, color: 'var(--gris-500)' }}>
                          La nota se guarda en la casilla de {id}{sust.curso ? ` · referencia: ${sust.curso}` : ''}.
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: 'var(--gris-600)' }}>
            <span data-adaptacion-resumen>{cuantos.sustituidos} sustituido{cuantos.sustituidos !== 1 ? 's' : ''} · {cuantos.excluidos} que no cuenta{cuantos.excluidos !== 1 ? 'n' : ''}</span>
            <button type="button" style={{ marginLeft: 'auto', fontSize: 12.5, background: 'none', border: 'none', color: 'var(--rojo-500, #b91c1c)', cursor: 'pointer', fontWeight: 600 }} onClick={quitar} data-adaptacion-quitar>
              Quitar adaptación
            </button>
          </div>

          <label style={{ fontSize: 12.5, display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Nota del docente (opcional)</span>
            <textarea rows={2} value={descripcion} data-adaptacion-descripcion
              onChange={e => setDescripcion(e.target.value)}
              onBlur={() => { if ((medida?.descripcion ?? '') !== descripcion) guardar({ descripcion: descripcion.trim() || null }) }}
              style={{ width: '100%', fontSize: 13 }} />
          </label>
        </>
      )}
      {estado && <div role="status" style={{ fontSize: 12, color: 'var(--gris-600)' }}>{estado}</div>}
    </div>
  )
}
