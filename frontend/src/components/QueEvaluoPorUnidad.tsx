/**
 * «Qué evalúo», unidad a unidad.
 *
 * Luis: el gestor de instrumentos del área es «complejísimo», todo sale
 * mezclado —pesos, trimestres, actividades y los criterios de todas las
 * unidades a la vez—. Aquí se elige UNA unidad y se ve solo lo que se usa en
 * ella: cada instrumento con sus actividades, con qué se evalúa cada una, qué
 * criterios cubre y cuánto pesa. Una actividad que no se usa en la unidad no
 * sale; «+ actividad en esta unidad» crea una o trae una de otra unidad.
 *
 * No calcula ni guarda nada por su cuenta: las columnas son las mismas que
 * pinta el Calificador (`getMatrizEvaluacion` + `columnasPorInstrumento`) y
 * los criterios se escriben con `asignarCriterioAColumna` /
 * `quitarCriterioDeColumna`, como desde la cabecera de la columna.
 */
import { useEffect, useState } from 'react'
import {
  getUnidades, getMatrizEvaluacion, getHijos, crearInstrumentoHijo, datosDirectosDeFamilia,
  asignarCriterioAColumna, quitarCriterioDeColumna,
  type UnidadConCriterios, type MatrizEvaluacion, type CeldaInstrumento,
} from '@/db/queries'
import type { Instrumento } from '@/db/localDb'
import { columnasPorInstrumento, type ColumnaInstrumento } from './MatrizInstrumentos'
import { BotonEditarActividad } from './FichaActividad'
import { esDeObservacion } from './ElegirHerramienta'
import { TIPOS_INSTRUMENTO, abreviatura } from '@/ia/instrumentosConfig'
import { confirmar } from '@/utils/confirmar'

interface Props {
  asignaturaId: number
  /** Enunciados del currículo, para nombrar cada criterio. */
  criterios: { id: string; descripcion: string }[]
  /** La unidad abierta en el Calificador, si se viene de una. */
  unidadInicial?: number | null
  capa?: string
  /** Lo que es de toda el área (pesos, trimestres, borrar) está en la otra pestaña. */
  onIrAPesos: () => void
}

type Anadir = { familia: number; cual: string; nombre: string; tipo: string; criterios: string[] }

const boton = { minHeight: 44, fontSize: 14 } as const
const chip = { display: 'inline-block', fontWeight: 700, fontSize: 12.5, color: 'var(--azul-700)', background: 'var(--gris-100)', border: '1px solid var(--gris-300)', padding: '2px 8px', margin: '0 5px 4px 0', borderRadius: 10 } as const

/** Con qué se evalúa una columna, en una palabra. */
export function herramientaDe(ins: Pick<CeldaInstrumento, 'tiene_prueba' | 'tiene_rubrica' | 'tipo'>): 'examen' | 'rúbrica' | 'diario' | 'sin herramienta' {
  return ins.tiene_prueba ? 'examen' : ins.tiene_rubrica ? 'rúbrica' : esDeObservacion(ins.tipo) ? 'diario' : 'sin herramienta'
}

export default function QueEvaluoPorUnidad({ asignaturaId, criterios, unidadInicial = null, capa, onIrAPesos }: Props) {
  const [unidades, setUnidades] = useState<UnidadConCriterios[] | null>(null)
  const [unidadId, setUnidadId] = useState<number | null>(unidadInicial)
  const [matriz, setMatriz] = useState<MatrizEvaluacion | null>(null)
  /** Todas las actividades de cada instrumento, se usen o no en la unidad. */
  const [actividades, setActividades] = useState<Record<number, Instrumento[]>>({})
  /** Instrumentos sin actividades que ya guardan notas, diario, examen o rúbrica a su nombre. */
  const [conDatos, setConDatos] = useState<Record<number, boolean>>({})
  const [anadir, setAnadir] = useState<Anadir | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      const us = await getUnidades(asignaturaId, criterios)
      if (!vigente) return
      setUnidades(us)
      setUnidadId(actual => (actual != null && us.some(u => u.id === actual)) ? actual : us[0]?.id ?? null)
    })()
    return () => { vigente = false }
  }, [asignaturaId, criterios, recarga])

  const unidad = unidades?.find(u => u.id === unidadId) ?? null
  const trimestre = unidad?.trimestre ?? 1

  useEffect(() => {
    if (unidadId == null) { setMatriz(null); return }
    let vigente = true
    ;(async () => {
      const m = await getMatrizEvaluacion(asignaturaId, unidadId, trimestre)
      if (!vigente || !m) return
      const familias = m.instrumentos.filter(i => i.familia_id == null)
      const hijos = await Promise.all(familias.map(async f => [f.id!, await getHijos(f.id!)] as const))
      const datos = await Promise.all(hijos.filter(([, hs]) => hs.length === 0).map(async ([id]) => {
        const d = await datosDirectosDeFamilia(id)
        return [id, d.calificaciones + d.diario + d.examenes + d.rubricas > 0] as const
      }))
      if (!vigente) return
      setMatriz(m); setActividades(Object.fromEntries(hijos)); setConDatos(Object.fromEntries(datos))
    })()
    return () => { vigente = false }
  }, [asignaturaId, unidadId, trimestre, recarga])

  if (unidades == null) return null
  if (!unidad) {
    return <p data-unidad-ninguna style={{ fontSize: 14, color: 'var(--gris-600)' }}>Esta área no tiene unidades todavía: créalas en 📋 Programación.</p>
  }

  const releer = () => setRecarga(r => r + 1)
  const deLaUnidad = unidad.criterios.map(c => ({ id: c.criterio_id, descripcion: c.descripcion ?? '' }))
  const columnas: ColumnaInstrumento[] = matriz ? columnasPorInstrumento(matriz, deLaUnidad) : []
  const familias = matriz?.instrumentos.filter(i => i.familia_id == null) ?? []
  const sinActividad = matriz ? deLaUnidad.filter(c => !(matriz.porCriterio.get(c.id)?.length)) : []
  const area = matriz ? { asignatura: matriz.asig.nombre, curso: matriz.grupo.curso, etapa: matriz.grupo.etapa, comunidad: matriz.asig.comunidad || matriz.grupo.comunidad } : null

  const hacer = async (que: () => Promise<void>, dicho: string) => {
    setError(null)
    try { await que(); setAviso(dicho); releer() }
    catch (e) { setError((e as Error).message) }
  }

  const cambiarCriterio = async (col: ColumnaInstrumento, criterio: string, poner: boolean) => {
    if (poner) {
      await hacer(() => asignarCriterioAColumna(col.ins.instrumento_id, unidad.id!, criterio), `«${col.ins.nombre}» evalúa ahora ${criterio} en esta unidad.`)
      return
    }
    const ultimo = col.criterios.length === 1
    if (!await confirmar({
      texto: `Quitar ${criterio} de «${col.ins.nombre}» en «${unidad.nombre}».\n\nLas notas ya puestas se conservan.${ultimo ? ' Es su último criterio aquí: dejará de usarse en esta unidad.' : ''}`,
      aceptar: 'Quitar criterio',
    })) return
    await hacer(() => quitarCriterioDeColumna(col.ins.instrumento_id, unidad.id!, criterio), `«${col.ins.nombre}» ya no evalúa ${criterio} en esta unidad. Las notas siguen guardadas.`)
    if (ultimo) setEditando(null)
  }

  const abrirAnadir = (f: Instrumento, delInstrumento: string[]) => {
    setAviso(null); setError(null)
    // Lo normal es que la actividad evalúe lo que su instrumento evalúa en la unidad.
    setAnadir({ familia: f.id!, cual: 'nueva', nombre: '', tipo: f.tipo, criterios: delInstrumento.length ? delInstrumento : [] })
  }

  const aceptarAnadir = async () => {
    if (!anadir) return
    const a = anadir
    const existente = a.cual === 'nueva' ? null : (actividades[a.familia] ?? []).find(h => String(h.id) === a.cual)
    const nombre = existente?.nombre ?? a.nombre.trim()
    if (!nombre || a.criterios.length === 0) return
    await hacer(async () => {
      const id = existente?.id ?? await crearInstrumentoHijo(a.familia, { nombre, tipo: a.tipo })
      for (const c of a.criterios) await asignarCriterioAColumna(id, unidad.id!, c)
      setAnadir(null)
    }, `«${nombre}» se usa ahora en «${unidad.nombre}» con ${a.criterios.length} criterio${a.criterios.length !== 1 ? 's' : ''}.`)
  }

  return (
    <div data-que-por-unidad>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 700 }}>
          Unidad
          <select data-que-unidad value={String(unidad.id)} style={{ ...boton, padding: '6px 10px', maxWidth: 'min(420px, 70vw)' }}
            onChange={e => { setUnidadId(Number(e.target.value)); setAnadir(null); setEditando(null); setAviso(null); setError(null) }}>
            {unidades.map(u => <option key={u.id} value={String(u.id)}>{u.nombre}{u.trimestre ? ` · ${u.trimestre}.º trim.` : ''}</option>)}
          </select>
        </label>
        <span data-que-unidad-resumen style={{ fontSize: 13, color: 'var(--gris-600)' }}>
          {unidad.trimestre ? `${unidad.trimestre}.º trimestre · ` : ''}{deLaUnidad.length} criterio{deLaUnidad.length !== 1 ? 's' : ''}
        </span>
      </div>

      {aviso && <div data-que-aviso role="status" style={{ fontSize: 13, color: '#166534', background: '#dcfce7', padding: '8px 10px', marginBottom: 10 }}>{aviso}</div>}
      {error && <div data-que-error role="alert" style={{ fontSize: 13, color: '#991b1b', background: '#fee2e2', padding: '8px 10px', marginBottom: 10 }}>{error}</div>}

      {familias.length === 0 && matriz && (
        <p style={{ fontSize: 14, color: 'var(--gris-600)' }}>
          Sin instrumentos todavía. <button type="button" className="btn-secondary" style={boton} onClick={onIrAPesos}>Crear el primero en «Pesos del área»</button>
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {familias.map(f => {
          const cols = columnas.filter(c => (c.ins.familia_id ?? c.ins.instrumento_id) === f.id)
          // Lo que la programación asigna al instrumento en esta unidad: lo que se propone a una actividad nueva.
          const delInstrumento = unidad.criterios.filter(c => c.instrumentos.some(v => v.instrumento_id === f.id)).map(c => c.criterio_id)
          const enUso = new Set(cols.map(c => c.ins.instrumento_id))
          const deOtras = (actividades[f.id!] ?? []).filter(h => !enUso.has(h.id!))
          const form = anadir?.familia === f.id ? anadir : null
          const primeraConDatos = (actividades[f.id!] ?? []).length === 0 && conDatos[f.id!]
          return (
            <section key={f.id} data-unidad-instrumento data-nombre={f.nombre}
              style={{ border: '1px solid var(--gris-300)', borderRadius: 10, padding: '10px 12px', background: 'var(--blanco)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--azul-900)', margin: 0 }}>
                {f.nombre} <span style={{ fontWeight: 500, color: 'var(--gris-600)', fontSize: 13 }}>· {f.solo_medidas ? 'solo con medida' : `${f.peso} % del área`}</span>
              </h3>

              {cols.length === 0 && (
                <p data-unidad-sin-uso style={{ fontSize: 13, color: 'var(--gris-600)', margin: '6px 0 0' }}>No se usa en esta unidad.</p>
              )}

              {cols.map(col => {
                const ins = col.ins
                const abierto = editando === ins.instrumento_id
                const suyos = new Set(col.criterios.map(c => c.id))
                return (
                  <div key={ins.instrumento_id} data-unidad-actividad data-nombre={ins.nombre}
                    style={{ borderLeft: `5px solid ${ins.color}`, background: 'var(--gris-100)', borderRadius: 6, padding: '8px 10px', marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700 }}>
                          <span style={{ background: ins.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginRight: 6 }}>{abreviatura(ins.nombre)}</span>
                          {ins.nombre}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--gris-700)', marginTop: 2 }}>
                          <span data-unidad-herramienta>{herramientaDe(ins)}</span>
                          {ins.familia_id == null
                            ? ' · se califica directamente con el instrumento'
                            : ins.pct_familia != null ? <> · <strong data-unidad-pct>{ins.pct_familia} %</strong> del instrumento</> : null}
                        </div>
                      </div>
                      <button type="button" className="btn-secondary" data-unidad-criterios-editar aria-expanded={abierto}
                        onClick={() => setEditando(abierto ? null : ins.instrumento_id)} style={boton}>
                        Criterios ({col.criterios.length})
                      </button>
                      {area && <BotonEditarActividad instrumento={ins} criterios={col.criterios} unidadNombre={unidad.nombre} unidadId={unidad.id} area={area} capa={capa} onCambio={releer} />}
                    </div>
                    <div data-unidad-criterios data-criterios={col.criterios.map(c => c.id).join(' ')} style={{ marginTop: 6 }}>
                      {!abierto && col.criterios.map(c => <span key={c.id} title={c.descripcion} style={chip}>{c.id}</span>)}
                      {abierto && (
                        <div data-unidad-criterios-lista style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {deLaUnidad.map(c => (
                            <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minHeight: 44, fontSize: 13, padding: '6px 0', cursor: 'pointer' }}>
                              <input type="checkbox" data-unidad-criterio={c.id} checked={suyos.has(c.id)}
                                onChange={() => { void cambiarCriterio(col, c.id, !suyos.has(c.id)) }} style={{ width: 20, height: 20, marginTop: 2 }} />
                              <span><strong>{c.id}</strong> {c.descripcion}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {form ? (
                <div data-unidad-anadir-form style={{ marginTop: 10, background: 'var(--gris-100)', borderRadius: 8, padding: 10 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {deOtras.length > 0 && (
                      <select data-unidad-anadir-cual value={form.cual} aria-label="Qué actividad" style={{ ...boton, padding: '6px 8px' }}
                        onChange={e => setAnadir({ ...form, cual: e.target.value })}>
                        <option value="nueva">Una actividad nueva</option>
                        {deOtras.map(h => <option key={h.id} value={String(h.id)}>Traer «{h.nombre}» de otra unidad</option>)}
                      </select>
                    )}
                    {form.cual === 'nueva' && <>
                      <input data-unidad-anadir-nombre value={form.nombre} placeholder="Nombre de la actividad *" aria-label="Nombre de la actividad"
                        onChange={e => setAnadir({ ...form, nombre: e.target.value })} style={{ ...boton, flex: '1 1 180px', padding: '6px 10px' }} />
                      <select data-unidad-anadir-tipo value={form.tipo} aria-label="Tipo" style={{ ...boton, padding: '6px 8px' }}
                        onChange={e => setAnadir({ ...form, tipo: e.target.value })}>
                        {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </>}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gris-600)', margin: '10px 0 2px' }}>Qué criterios evalúa en esta unidad</div>
                  {deLaUnidad.length === 0 && <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>La unidad no tiene criterios: añádelos en 📋 Programación.</div>}
                  {deLaUnidad.map(c => {
                    const marcado = form.criterios.includes(c.id)
                    return (
                      <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minHeight: 44, fontSize: 13, padding: '6px 0', cursor: 'pointer' }}>
                        <input type="checkbox" data-unidad-anadir-criterio={c.id} checked={marcado} style={{ width: 20, height: 20, marginTop: 2 }}
                          onChange={() => setAnadir({ ...form, criterios: marcado ? form.criterios.filter(x => x !== c.id) : [...form.criterios, c.id] })} />
                        <span><strong>{c.id}</strong> {c.descripcion}{!delInstrumento.includes(c.id) ? <em style={{ color: 'var(--gris-600)' }}> · «{f.nombre}» no lo evalúa aún en esta unidad: se le añadirá</em> : null}</span>
                      </label>
                    )
                  })}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn-primary" data-unidad-anadir-aceptar style={boton} onClick={() => { void aceptarAnadir() }}
                      disabled={form.criterios.length === 0 || (form.cual === 'nueva' && !form.nombre.trim())}>Añadir a la unidad</button>
                    <button type="button" className="btn-secondary" style={boton} onClick={() => setAnadir(null)}>Cancelar</button>
                  </div>
                </div>
              ) : primeraConDatos ? (
                // La primera actividad deja al instrumento sin columna propia: eso se pregunta, y se pregunta en un solo sitio.
                <p data-unidad-primera-con-datos style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '8px 10px', margin: '10px 0 0' }}>
                  «{f.nombre}» ya tiene notas o herramienta a su nombre. Su primera actividad se crea en «Pesos del área», que pregunta antes qué hacer con ellas.{' '}
                  <button type="button" className="btn-secondary" style={boton} onClick={onIrAPesos}>Ir a «Pesos del área»</button>
                </p>
              ) : (
                <button type="button" className="btn-secondary" data-unidad-anadir style={{ ...boton, marginTop: 10 }} onClick={() => abrirAnadir(f, delInstrumento)}>
                  + actividad en esta unidad
                </button>
              )}
            </section>
          )
        })}
      </div>

      {sinActividad.length > 0 && (
        <div data-unidad-sin-actividad data-criterios={sinActividad.map(c => c.id).join(' ')}
          style={{ marginTop: 12, fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '8px 10px' }}>
          <strong>{sinActividad.length} criterio{sinActividad.length !== 1 ? 's' : ''} de la unidad sin nada que lo{sinActividad.length !== 1 ? 's' : ''} evalúe:</strong>{' '}
          {sinActividad.map(c => (
            <span key={c.id} title={c.descripcion} style={{ ...chip, color: '#92400e' }}>
              {c.id}{matriz?.criteriosFueraDeTrimestre.has(c.id) ? ' (su instrumento no aplica este trimestre)' : ''}
            </span>
          ))}
          <div style={{ marginTop: 2 }}>Pulsa «Criterios» en una actividad, o añade una, para que cuenten.</div>
        </div>
      )}
    </div>
  )
}
