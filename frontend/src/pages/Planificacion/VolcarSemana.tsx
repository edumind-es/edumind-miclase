/**
 * Volcar una semana desde un .md: leer, enseñar qué ha salido y qué no casa
 * con la clase, y solo entonces guardar. Si la semana ya tiene algo
 * planificado, pregunta antes de sustituirlo (volcar dos veces no duplica).
 */
import { useEffect, useState } from 'react'
import { leerSemana, type SemanaLeida } from '@/planificacion/semanal'
import { prepararVolcado, casarArea, type Volcado } from '@/planificacion/casar'
import { contarPlanificado, getUnidades, volcarSemana } from '@/db/queries'
import type { Asignatura, Grupo } from '@/db/localDb'
import { useAppStore } from '@/store/useAppStore'
import { idsDeCriterios } from './curriculo'
import { diaLargo, diasDeSemana, tituloSemana, type Franja } from '@/planificacion/exportar'
import { generarPromptSemana, franjasATexto, franjasDeTexto, type AreaPrompt } from '@/ia/planificacionPrompt'
import { useLocalAI, hasWebGPU } from '@/ia/useLocalAI'
import { AvisoContextoIA, AvisoBorradorIA } from '@/components/AvisoIA'
import { trimestreDeFecha } from '@/db/calculo'
import { sumarDias } from './fechas'
import * as curriculo from '@/curriculo'

import { confirmar } from '@/utils/confirmar'
interface Props {
  grupo: Grupo & { id?: number }
  asignaturas: Asignatura[]
  /** El lunes de la semana que se está mirando: la que se le pide a la IA. */
  lunes: string
  /** Las franjas que ya se conocen de la clase, para el prompt. */
  horario: Franja[]
  onCerrar: () => void
  /** Tras guardar: el lunes de la semana volcada, para ir a verla. */
  onGuardado: (desde: string, mensaje: string) => void
}

export default function VolcarSemana({ grupo, asignaturas, lunes, horario, onCerrar, onGuardado }: Props) {
  const headers = useAppStore(s => s._headers)
  const [texto, setTexto] = useState('')
  const [leida, setLeida] = useState<SemanaLeida | null>(null)
  const [volcado, setVolcado] = useState<Volcado | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Pedir la semana a una IA ──────────────────────────────────────────
  // El prompt se monta con lo que ya sabe la app; la respuesta vuelve al
  // cuadro de texto de siempre y pasa por la misma vista previa.
  const ai = useLocalAI()
  const viernes = sumarDias(lunes, 4)
  const [iaAbierta, setIaAbierta] = useState(false)
  const [indicaciones, setIndicaciones] = useState('')
  const [horarioTexto, setHorarioTexto] = useState(() => franjasATexto(horario))
  const [areasPrompt, setAreasPrompt] = useState<AreaPrompt[] | null>(null)
  const [areasFuera, setAreasFuera] = useState<Set<string>>(new Set())
  const [diaLocal, setDiaLocal] = useState(lunes)
  const [copiado, setCopiado] = useState(false)
  /** Lo que se va a guardar lo escribió una IA: se marca en cada sesión. */
  const [deIA, setDeIA] = useState(false)

  // Áreas con las unidades del trimestre de esa semana y sus criterios.
  useEffect(() => {
    if (!iaAbierta || areasPrompt) return
    let vigente = true
    const trimestre = trimestreDeFecha(lunes)
    Promise.all(asignaturas.map(async a => {
      let descripciones = new Map<string, string>()
      try {
        const lista = await curriculo.criterios(a.nombre, grupo.curso, grupo.etapa, a.comunidad || grupo.comunidad)
        descripciones = new Map(lista.map((c: { id: string; descripcion: string }) => [c.id, c.descripcion]))
      } catch { /* sin currículo: los códigos van sin texto */ }
      const unidades = (await getUnidades(a.id!)).filter(u => !u.trimestre || u.trimestre === trimestre)
      return {
        nombre: a.nombre_display || a.nombre,
        unidades: unidades.map(u => ({
          nombre: u.nombre, trimestre: u.trimestre ?? null,
          criterios: u.criterios.map(c => ({ id: c.criterio_id, descripcion: descripciones.get(c.criterio_id) ?? null })),
        })),
      }
    })).then(lista => { if (vigente) setAreasPrompt(lista) }).catch(() => { if (vigente) setAreasPrompt([]) })
    return () => { vigente = false }
  }, [iaAbierta, areasPrompt, asignaturas, grupo, lunes])

  const promptDe = (soloDia: string | null) => generarPromptSemana({
    clase: grupo.nombre,
    nivel: `${grupo.curso}º de ${grupo.etapa === 'secundaria' ? 'Secundaria' : 'Primaria'}`,
    desde: lunes, hasta: viernes,
    franjas: franjasDeTexto(horarioTexto),
    areas: (areasPrompt ?? []).filter(a => !areasFuera.has(a.nombre)),
    indicaciones, soloDia,
  })
  const promptSemana = iaAbierta && areasPrompt ? promptDe(null) : ''

  const copiarPrompt = async () => {
    // Lo que se pegue después vendrá de una IA: se deja marcado (antes de
    // esperar al portapapeles, que puede tardar o negarse), y se puede desmarcar.
    setDeIA(true)
    try { await navigator.clipboard.writeText(promptSemana); setCopiado(true) } catch { setCopiado(false) }
  }

  const generarDiaLocal = async () => {
    setError(null)
    try {
      const respuesta = await ai.generate(promptDe(diaLocal), setTexto)
      setTexto(respuesta)
      setDeIA(true)
    } catch (e) {
      setError(`La IA local no ha podido generar: ${(e as Error).message}`)
    }
  }

  const leer = async (md: string) => {
    setError(null); setLeida(null); setVolcado(null)
    const s = leerSemana(md)
    setLeida(s)
    if (s.generada_ia) setDeIA(true)
    if (!s.sesiones.length) return
    setTrabajando(true)
    try {
      // Solo las áreas que aparecen: no hace falta pedir el currículo de todas
      const usadas = asignaturas.filter(a => s.sesiones.some(x => casarArea(x.area, [{ id: a.id!, nombre: a.nombre, nombre_display: a.nombre_display }])))
      const unidades = (await Promise.all(usadas.map(a => getUnidades(a.id!)))).flat()
      const criterios = new Map<number, string[] | null>()
      await Promise.all(usadas.map(async a => criterios.set(a.id!, await idsDeCriterios(grupo, a, headers()))))
      setVolcado(prepararVolcado(s, {
        asignaturas: asignaturas.map(a => ({ id: a.id!, nombre: a.nombre, nombre_display: a.nombre_display })),
        unidades: unidades.map(u => ({ id: u.id!, asignatura_id: u.asignatura_id, nombre: u.nombre })),
        criterios,
      }))
    } catch (e) {
      setError(`No se pudo preparar la vista previa: ${(e as Error).message}`)
    } finally {
      setTrabajando(false)
    }
  }

  const abrirFichero = async (f: File | undefined) => {
    if (!f) return
    const t = await f.text()
    setTexto(t)
    await leer(t)
  }

  const guardar = async () => {
    if (!leida || !volcado || !leida.desde || !leida.hasta) return
    setTrabajando(true)
    try {
      const desde = leida.desde, hasta = leida.hasta
      const previas = await contarPlanificado(grupo.id!, desde, hasta)
      let sustituir = false
      if (previas) {
        sustituir = await confirmar(`Esa semana ya tiene ${previas} sesión(es) planificada(s) en ${grupo.nombre}.\n\n` +
          '¿Sustituirlas por las del fichero? Los eventos que escribiste a mano se quedan.')
        if (!sustituir) { setTrabajando(false); return }
      }
      const sesiones = deIA ? volcado.sesiones.map(s => ({ ...s, generada_ia: true })) : volcado.sesiones
      const r = await volcarSemana(grupo.id!, sesiones, leida.notas, { desde, hasta, sustituir })
      if (!r) { setError('No se ha guardado nada.'); return }
      onGuardado(desde, `Volcadas ${r.creadas} sesiones${r.eventos ? ` y ${r.eventos} nota(s) del día` : ''}` +
        (r.retiradas ? `; sustituidas las ${r.retiradas} que había.` : '.'))
    } catch (e) {
      setError(`No se pudo guardar: ${(e as Error).message}`)
    } finally {
      setTrabajando(false)
    }
  }

  const sinCasar = volcado && (volcado.areasSinCasar.length + volcado.unidadesSinCasar.length +
    volcado.criteriosSinCasar.length + volcado.criteriosSinComprobar.length)

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card plan-modal" role="dialog" aria-modal="true" aria-label="Volcar una semana">
        <div className="plan-modal-cab">
          <h2>Volcar una semana</h2>
          <button className="modal-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>

        <p className="plan-ayuda">
          Sube el fichero <b>.md</b> de la programación semanal o pega su texto. Primero verás lo que sale;
          no se guarda nada hasta que pulses «Guardar». Se guarda en <b>{grupo.nombre}</b>.
        </p>

        <div data-ia-semana style={{ border: '1px solid var(--gris-300)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          <button type="button" className="btn-secondary" data-ia-semana-toggle aria-expanded={iaAbierta}
            onClick={() => setIaAbierta(v => !v)} style={{ fontSize: 13 }}>
            {iaAbierta ? '▾' : '▸'} Pedir una propuesta a una IA
          </button>
          {iaAbierta && (
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              <p className="plan-ayuda" style={{ margin: 0 }}>
                Se prepara un prompt para <b>{tituloSemana(lunes, viernes).toLowerCase()}</b> con el horario, las unidades
                y los criterios de <b>{grupo.nombre}</b>. Cópialo en ChatGPT, Claude o Gemini y pega aquí abajo lo que
                responda: pasa por la misma vista previa antes de guardarse.
              </p>
              <label style={{ fontSize: 12.5, display: 'grid', gap: 3 }}>
                Horario (una franja por línea)
                <textarea data-ia-semana-horario value={horarioTexto} onChange={e => setHorarioTexto(e.target.value)} rows={Math.min(8, Math.max(3, horarioTexto.split('\n').length))}
                  placeholder={'1ª 9:00-9:50\n2ª 9:50-10:40\n3ª 10:40-11:30'} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
                {franjasDeTexto(horarioTexto).length === 0 && (
                  <span style={{ color: '#92400e' }}>Escribe las franjas de la clase: sin horario la IA se lo inventa y no casará con el tuyo.</span>
                )}
              </label>
              {areasPrompt && areasPrompt.length > 0 && (
                <div style={{ fontSize: 12.5 }}>
                  Áreas que entran
                  <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', marginTop: 3 }}>
                    {areasPrompt.map(a => (
                      <label key={a.nombre} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                        <input type="checkbox" data-ia-semana-area={a.nombre} checked={!areasFuera.has(a.nombre)}
                          onChange={e => setAreasFuera(prev => { const s = new Set(prev); if (e.target.checked) s.delete(a.nombre); else s.add(a.nombre); return s })} />
                        {a.nombre}<span style={{ color: 'var(--gris-500)' }}> · {a.unidades.length} ud.</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <label style={{ fontSize: 12.5, display: 'grid', gap: 3 }}>
                Indicaciones para la IA (opcional)
                <textarea data-ia-semana-indicaciones value={indicaciones} onChange={e => setIndicaciones(e.target.value)} rows={2}
                  placeholder="El jueves hay salida al museo; en Lengua toca repasar para el examen…" style={{ width: '100%', fontSize: 12.5 }} />
                <AvisoContextoIA />
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="btn-primary" data-ia-semana-copiar disabled={!promptSemana} onClick={copiarPrompt}>
                  📋 Copiar prompt
                </button>
                {copiado && <span role="status" style={{ fontSize: 12.5, color: 'var(--verde-600, #166534)' }}>Copiado. Pega la respuesta abajo.</span>}
              </div>
              <details>
                <summary style={{ fontSize: 12.5, cursor: 'pointer' }}>Ver el prompt</summary>
                <textarea data-ia-semana-prompt readOnly value={promptSemana} rows={10}
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: 11.5, marginTop: 6 }} />
              </details>
              {hasWebGPU() ? (
                <div data-ia-semana-local style={{ borderTop: '1px solid var(--gris-300)', paddingTop: 8, fontSize: 12.5 }}>
                  <div style={{ marginBottom: 6 }}>
                    O genera <b>un solo día</b> con la IA de este equipo (no sale del aparato; una semana entera no le cabe):
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={diaLocal} onChange={e => setDiaLocal(e.target.value)} aria-label="Día que se genera" data-ia-semana-dia>
                      {diasDeSemana(lunes, viernes).map(d => <option key={d} value={d}>{diaLargo(d)}</option>)}
                    </select>
                    {ai.isReady || ai.status === 'generando' ? (
                      ai.status === 'generando'
                        ? <button type="button" className="btn-secondary" onClick={ai.cancelar}>✋ Detener</button>
                        : <button type="button" className="btn-secondary" data-ia-semana-generar disabled={!areasPrompt} onClick={generarDiaLocal}>⚡ Generar el día</button>
                    ) : (
                      <button type="button" className="btn-secondary" onClick={ai.cargarModelo}
                        disabled={ai.status === 'descargando' || ai.status === 'cargando'}>
                        {ai.status === 'descargando' && `⬇ Descargando Phi-3.5 (${ai.progress}%)`}
                        {ai.status === 'cargando' && '⏳ Cargando modelo…'}
                        {ai.status === 'idle' && '⬇ Descargar IA local (Phi-3.5 · ~2GB)'}
                        {ai.status === 'error' && 'Error — reintentar'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--gris-500)' }}>
                  La IA de este equipo necesita WebGPU (no está en este navegador): usa «Copiar prompt».
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <label className="btn-secondary" style={{ padding: '8px 14px', borderRadius: 6, cursor: 'pointer' }}>
            📄 Elegir fichero
            <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden data-volcar-fichero
              onChange={e => abrirFichero(e.target.files?.[0])} />
          </label>
          <span style={{ fontSize: 13, color: 'var(--gris-500)' }}>o pega el texto:</span>
        </div>
        <textarea data-volcar-texto value={texto} onChange={e => setTexto(e.target.value)} rows={6}
          placeholder="# Programación semanal · 6º A…" style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginTop: 6, cursor: 'pointer' }}>
          <input type="checkbox" data-volcar-de-ia checked={deIA} onChange={e => setDeIA(e.target.checked)} />
          Este texto lo ha escrito una IA
        </label>
        {deIA && <div style={{ marginTop: 6 }}><AvisoBorradorIA que="planificación" /></div>}
        <div style={{ marginTop: 8 }}>
          <button className="btn-secondary" data-volcar-leer disabled={!texto.trim() || trabajando} onClick={() => leer(texto)}>
            Leer
          </button>
        </div>

        {error && <div className="plan-aviso plan-aviso--error">{error}</div>}

        {leida && (
          <div data-volcar-resumen style={{ marginTop: 14 }}>
            <div className="plan-resumen">
              <b>{leida.sesiones.length} sesiones</b>
              {leida.titulo_semana && <> · {leida.titulo_semana}</>}
              {leida.clase && <> · el fichero dice «{leida.clase}»</>}
              {leida.notas.length > 0 && <> · {leida.notas.length} nota(s) del día</>}
            </div>
            {leida.avisos.map((a, i) => <div key={i} className="plan-aviso">{a}</div>)}
            {!leida.desde && leida.sesiones.length > 0 && (
              <div className="plan-aviso plan-aviso--error">No sé de qué semana es: falta la línea «Semana del … al …».</div>
            )}

            {volcado && (
              <>
                {sinCasar ? (
                  <div className="plan-nocasa" data-no-casa>
                    <b>Lo que no casa con {grupo.nombre}</b> (se guarda igual, con el texto tal cual):
                    <ul>
                      {volcado.areasSinCasar.map(a => (
                        <li key={a.area} data-no-casa-area={a.area}>
                          Área «{a.area}» ({a.sesiones === 1 ? '1 sesión' : `${a.sesiones} sesiones`})
                          {a.especialista ? ': es de especialista y la clase no tiene esa área.' : ': la clase no tiene esa área.'}
                        </li>
                      ))}
                      {volcado.unidadesSinCasar.map(u => (
                        <li key={u.area + u.unidad} data-no-casa-unidad={u.unidad}>
                          Unidad «{u.unidad}» de {u.area}: no hay ninguna unidad con ese nombre o número en el área.
                        </li>
                      ))}
                      {volcado.criteriosSinCasar.map(c => (
                        <li key={c.area + c.codigo} data-no-casa-criterio={c.codigo}>
                          Criterio {c.codigo} de {c.area}: no está en el currículo del área.
                        </li>
                      ))}
                      {volcado.criteriosSinComprobar.map(a => (
                        <li key={a}>Criterios de {a}: no se han podido comprobar (sin conexión con el currículo).</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="plan-aviso plan-aviso--ok">Todo casa: áreas, unidades y criterios.</div>
                )}

                <div className="plan-previa">
                  {volcado.sesiones.map((s, i) => (
                    <div key={i} className="plan-previa-fila">
                      <span className="plan-previa-dia">{diaLargo(s.fecha)} · {s.franja ?? ''} {s.hora_inicio}</span>
                      <span>
                        <b>{s.area}</b>{s.unidad_texto ? ` · ${s.unidad_texto}` : ''}{s.titulo ? ` · ${s.titulo}` : ''}
                        {s.evaluable ? ' ■' : ''}
                        {!s.asignatura_id && s.tipo !== 'centro' && <span className="plan-chip-nocasa">sin área</span>}
                        {s.asignatura_id && s.unidad_texto && /UD\s*\d/i.test(s.unidad_texto) && !s.unidad_id && <span className="plan-chip-nocasa">sin unidad</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="plan-modal-pie">
          <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" data-volcar-guardar disabled={!volcado || !volcado.sesiones.length || !leida?.desde || trabajando}
            onClick={guardar}>
            {trabajando ? 'Un momento…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
