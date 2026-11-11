/**
 * Planificación y calendario de la clase activa.
 *
 * Una sola entrada del menú con dos vistas: la semana, con una fila por
 * franja y una columna por día (como la «Vista rápida» del .md de Luis), y
 * el mes, con lo planificado y los eventos. Pulsar una sesión abre su
 * detalle; lo planificado con ■ en un área de la clase lleva al Calificador
 * en su unidad. La vista elegida se recuerda en el aparato.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useClaseActiva } from '@/contexto/ClaseActiva'
import { useParametrosClase } from '@/contexto/useParametrosClase'
import { eliminarSesionPlan, getEventos, getPlanificacion } from '@/db/queries'
import type { EventoCalendario, SesionPlan } from '@/db/localDb'
import { criteriosDe, secuenciaDe, vaAlCalificador } from '@/planificacion/casar'
import { claveArea } from '@/planificacion/semanal'
import { diaLargo, diasDeSemana, franjasDe, nombreDia, semanaAHtml, semanaAMarkdown, tituloSemana, type Franja } from '@/planificacion/exportar'
import { imprimir } from '@/informes/lamina'
import { descargarFichero } from '@/utils/compartir'
import { cuadriculaMes, deIso, hoyIso, lunesDe, mismoMes, nombreMes, sumarDias } from './fechas'
import VolcarSemana from './VolcarSemana'
import { AvisoBorradorIA } from '@/components/AvisoIA'
import EditarSesion from './EditarSesion'
import EditarEvento, { iconoEvento } from './EditarEvento'

type Vista = 'semana' | 'mes'
const CLAVE_VISTA = 'miclase.planificacion.vista'

const vistaGuardada = (): Vista => {
  try { return localStorage.getItem(CLAVE_VISTA) === 'mes' ? 'mes' : 'semana' } catch { return 'semana' }
}

/** Color estable por área, para reconocerla de un vistazo (nunca es la única pista: va el nombre). */
const TONOS = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#8a6db5', '#6e6e6e']
function tonoDe(area: string) {
  const k = claveArea(area)
  let h = 0
  for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TONOS[h % TONOS.length]
}

export function enlaceCalificador(s: Pick<SesionPlan, 'grupo_id' | 'asignatura_id' | 'unidad_id'>): string {
  const p = new URLSearchParams({ grupo_id: String(s.grupo_id), asignatura_id: String(s.asignatura_id) })
  if (s.unidad_id) p.set('unidad_id', String(s.unidad_id))
  return `/evaluacion?${p}`
}

const eventosDelDia = (eventos: EventoCalendario[], d: string) => eventos.filter(e => e.fecha <= d && (e.fecha_fin || e.fecha) >= d)

export default function PlanificacionPage() {
  useParametrosClase()
  const { grupo, grupoId, asignaturas, cargando } = useClaseActiva()
  const [params, setParams] = useSearchParams()
  const [vista, setVista] = useState<Vista>(vistaGuardada)
  const ancla = params.get('fecha') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('fecha')!) ? params.get('fecha')! : hoyIso()
  const lunes = lunesDe(ancla)
  const domingo = sumarDias(lunes, 6)

  const [sesiones, setSesiones] = useState<SesionPlan[]>([])
  const [horario, setHorario] = useState<Franja[]>([])
  const [eventos, setEventos] = useState<EventoCalendario[]>([])
  const [mesSesiones, setMesSesiones] = useState<SesionPlan[]>([])
  const [refresco, setRefresco] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)

  const [volcar, setVolcar] = useState(false)
  const [detalle, setDetalle] = useState<SesionPlan | null>(null)
  const [editar, setEditar] = useState<Partial<SesionPlan> | null>(null)
  const [editarEvento, setEditarEvento] = useState<Partial<EventoCalendario> | null>(null)

  const irA = useCallback((fecha: string) => {
    const p = new URLSearchParams(params)
    p.set('fecha', fecha)
    setParams(p, { replace: true })
  }, [params, setParams])

  const cambiarVista = (v: Vista) => {
    setVista(v)
    try { localStorage.setItem(CLAVE_VISTA, v) } catch { /* sin almacenamiento, se olvida */ }
  }

  const cuadricula = useMemo(() => cuadriculaMes(ancla), [ancla])

  useEffect(() => {
    if (!grupoId) { setSesiones([]); setEventos([]); setMesSesiones([]); return }
    const desde = vista === 'mes' ? cuadricula[0] : lunes
    const hasta = vista === 'mes' ? cuadricula[cuadricula.length - 1] : domingo
    Promise.all([
      getPlanificacion(grupoId, lunes, domingo),
      // El horario sale de lo planificado las semanas anteriores: así una
      // semana vacía enseña ya sus franjas para rellenarlas a mano.
      getPlanificacion(grupoId, sumarDias(lunes, -56), sumarDias(lunes, 55)),
      getEventos(grupoId, desde, hasta),
      vista === 'mes' ? getPlanificacion(grupoId, desde, hasta) : Promise.resolve([]),
    ]).then(([sem, cerca, evs, mes]) => {
      setSesiones(sem)
      setHorario(franjasDe(cerca.filter(s => s.franja)))
      setEventos(evs)
      setMesSesiones(mes)
    }).catch(e => setAviso(`No se pudo leer la planificación: ${(e as Error).message}`))
  }, [grupoId, lunes, domingo, vista, cuadricula, refresco])

  const recargar = () => setRefresco(n => n + 1)

  const franjas = useMemo(() => franjasDe([...horario.map(f => ({ ...f })), ...sesiones]), [horario, sesiones])
  const dias = useMemo(() => diasDeSemana(lunes, domingo,
    new Set([...sesiones.map(s => s.fecha), ...eventos.filter(e => e.fecha >= lunes).map(e => e.fecha)])), [lunes, domingo, sesiones, eventos])

  const nombreClase = grupo?.nombre ?? ''
  const exportarMd = async () => {
    const md = semanaAMarkdown(nombreClase, lunes, sumarDias(lunes, 4), sesiones, eventos.filter(e => e.fecha >= lunes && e.fecha <= domingo))
    await descargarFichero(`planificacion-${nombreClase.replace(/\W+/g, '-')}-${lunes}.md`, md, 'text/markdown;charset=utf-8')
  }
  const imprimirSemana = async () => {
    const hecho = await imprimir(semanaAHtml(nombreClase, lunes, sumarDias(lunes, 4), sesiones, eventos), `planificacion-${lunes}`)
    setAviso(hecho ? null : 'No se ha impreso nada.')
  }

  const borrar = async (s: SesionPlan) => {
    if (!confirm(`¿Borrar la sesión de ${s.area} del ${diaLargo(s.fecha)} (${s.hora_inicio})?`)) return
    await eliminarSesionPlan(s.id!)
    setDetalle(null)
    recargar()
  }

  if (cargando) return null
  if (!grupo) {
    return (
      <div style={{ padding: 24 }}>
        <h1 className="page-title">Planificación</h1>
        <p>Primero crea una clase en <Link to="/grupos">Mis clases</Link>.</p>
      </div>
    )
  }

  return (
    <div className="plan-pagina" data-planificacion>
      <div className="plan-barra">
        <h1 className="page-title" style={{ margin: 0 }}>Planificación</h1>
        <div className="vista-conmutador" role="group" aria-label="Vista de la planificación">
          <button aria-pressed={vista === 'semana'} data-vista-plan="semana" onClick={() => cambiarVista('semana')}>Semana</button>
          <button aria-pressed={vista === 'mes'} data-vista-plan="mes" onClick={() => cambiarVista('mes')}>Mes</button>
        </div>
        <div className="plan-nav">
          <button className="btn-secondary" aria-label="Anterior" data-plan-anterior
            onClick={() => irA(vista === 'mes' ? sumarDias(cuadricula[0], -1) : sumarDias(lunes, -7))}>‹</button>
          <button className="btn-secondary" onClick={() => irA(hoyIso())}>Hoy</button>
          <button className="btn-secondary" aria-label="Siguiente" data-plan-siguiente
            onClick={() => irA(vista === 'mes' ? sumarDias(cuadricula[41], 1) : sumarDias(lunes, 7))}>›</button>
          <span className="plan-titulo" data-plan-titulo>
            {vista === 'mes' ? nombreMes(ancla) : tituloSemana(lunes, sumarDias(lunes, 4))}
          </span>
        </div>
        <div className="plan-acciones">
          <button className="btn-primary" data-volcar-abrir onClick={() => setVolcar(true)}>⬆ Volcar semana</button>
          <button className="btn-secondary" data-sesion-nueva onClick={() => setEditar({ fecha: vista === 'mes' ? ancla : lunes })}>+ Sesión</button>
          <button className="btn-secondary" data-evento-nuevo onClick={() => setEditarEvento({ fecha: vista === 'mes' ? ancla : lunes })}>+ Evento</button>
          {vista === 'semana' && sesiones.length > 0 && <>
            <button className="btn-secondary" data-plan-imprimir onClick={imprimirSemana}>🖨 Imprimir</button>
            <button className="btn-secondary" data-plan-exportar onClick={exportarMd}>⬇ .md</button>
          </>}
        </div>
      </div>

      {aviso && <div className="plan-aviso" data-plan-aviso>{aviso} <button className="modal-close" onClick={() => setAviso(null)} aria-label="Cerrar aviso">✕</button></div>}

      {vista === 'semana' ? (
        <div className="plan-semana-wrap">
          {!franjas.length ? (
            <div className="card plan-vacio" data-plan-vacio>
              <p><b>Esta semana no tiene nada planificado en {grupo.nombre}.</b></p>
              <p>Vuelca el .md de tu programación semanal o añade las sesiones a mano.</p>
              {eventos.length > 0 && <ul>{eventos.map(e => <li key={e.id}>{iconoEvento(e.tipo)} {diaLargo(e.fecha)}: {e.titulo}</li>)}</ul>}
            </div>
          ) : (
            <table className="plan-semana" data-planificacion-semana>
              <thead>
                <tr>
                  <th className="plan-franja-th" />
                  {dias.map(d => (
                    <th key={d} className={d === hoyIso() ? 'plan-hoy' : ''}>
                      <div className="plan-dia-cab">
                        <span>{nombreDia(d)} {deIso(d).getDate()}</span>
                        <button className="plan-mini" title="Añadir evento este día" aria-label={`Añadir evento el ${diaLargo(d)}`}
                          onClick={() => setEditarEvento({ fecha: d })}>+</button>
                      </div>
                      {eventosDelDia(eventos, d).map(e => (
                        <button key={e.id} className={`plan-evento plan-evento--${e.tipo}`} data-evento={e.tipo} onClick={() => setEditarEvento(e)}>
                          {iconoEvento(e.tipo)} {e.titulo}
                        </button>
                      ))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {franjas.map(fr => (
                  <tr key={`${fr.hora_inicio}-${fr.hora_fin}`}>
                    <th className="plan-franja-th">
                      {fr.franja && <b>{fr.franja}</b>}<br />
                      <span>{fr.hora_inicio}-{fr.hora_fin}</span>
                    </th>
                    {dias.map(d => {
                      const aqui = sesiones.filter(s => s.fecha === d && s.hora_inicio === fr.hora_inicio && s.hora_fin === fr.hora_fin)
                      return (
                        <td key={d} className={d === hoyIso() ? 'plan-hoy' : ''}>
                          {aqui.map(s => (
                            <button key={s.id} className={`plan-sesion plan-sesion--${s.tipo}`} data-sesion-plan
                              data-fecha={s.fecha} data-franja={s.franja ?? ''} style={{ borderLeftColor: tonoDe(s.area) }}
                              onClick={() => setDetalle(s)}>
                              <b>{s.area}</b>{s.evaluable ? <span className="plan-evaluable" title="Evaluable"> ■</span> : null}
                              <span className="plan-sesion-sub">
                                {s.tipo === 'especialista' ? 'Especialista' : s.tipo === 'centro' ? 'Actividad de centro'
                                  : [/^UD\s*\d+/i.exec(s.unidad_texto ?? '')?.[0], s.titulo].filter(Boolean).join(' · ')}
                              </span>
                            </button>
                          ))}
                          {!aqui.length && (
                            <button className="plan-hueco" aria-label={`Añadir sesión el ${diaLargo(d)} a las ${fr.hora_inicio}`}
                              onClick={() => setEditar({ fecha: d, franja: fr.franja, hora_inicio: fr.hora_inicio, hora_fin: fr.hora_fin })}>+</button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="plan-mes" data-planificacion-mes>
          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => <div key={d} className="plan-mes-cab">{d}</div>)}
          {cuadricula.map(d => {
            const delDia = mesSesiones.filter(s => s.fecha === d)
            const evaluables = delDia.filter(s => s.evaluable)
            return (
              <div key={d} data-dia-mes={d}
                className={`plan-mes-dia${mismoMes(d, ancla) ? '' : ' plan-mes-fuera'}${d === hoyIso() ? ' plan-hoy' : ''}`}>
                <button className="plan-mes-num" onClick={() => { irA(d); cambiarVista('semana') }} title="Ver la semana">
                  {deIso(d).getDate()}
                </button>
                {eventosDelDia(eventos, d).map(e => (
                  <button key={e.id} className={`plan-evento plan-evento--${e.tipo}`} data-evento={e.tipo} onClick={() => setEditarEvento(e)}>
                    {iconoEvento(e.tipo)} {e.titulo}
                  </button>
                ))}
                {delDia.length > 0 && (
                  <button className="plan-mes-resumen" onClick={() => { irA(d); cambiarVista('semana') }}>
                    {delDia.length === 1 ? '1 sesión' : `${delDia.length} sesiones`}
                  </button>
                )}
                {evaluables.map(s => vaAlCalificador(s) ? (
                  <Link key={s.id} to={enlaceCalificador(s)} className="plan-mes-evaluable" data-ir-calificador>
                    ■ {s.area}{s.unidad_texto ? ` · ${/^UD\s*\d+/i.exec(s.unidad_texto)?.[0] ?? ''}` : ''}
                  </Link>
                ) : (
                  <span key={s.id} className="plan-mes-evaluable">■ {s.area}</span>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {detalle && (
        <DetalleSesion sesion={detalle} onCerrar={() => setDetalle(null)}
          onEditar={() => { setEditar(detalle); setDetalle(null) }} onBorrar={() => borrar(detalle)} />
      )}
      {editar && (
        <EditarSesion grupo={grupo} asignaturas={asignaturas} sesion={editar} franjas={franjas}
          onCerrar={() => setEditar(null)} onGuardado={() => { setEditar(null); recargar() }} />
      )}
      {editarEvento && (
        <EditarEvento grupo={grupo} evento={editarEvento}
          onCerrar={() => setEditarEvento(null)} onGuardado={() => { setEditarEvento(null); recargar() }} />
      )}
      {volcar && (
        <VolcarSemana grupo={grupo} asignaturas={asignaturas} lunes={lunes} horario={franjas} onCerrar={() => setVolcar(false)}
          onGuardado={(desde, mensaje) => { setVolcar(false); setAviso(mensaje); cambiarVista('semana'); irA(desde); recargar() }} />
      )}
    </div>
  )
}

function DetalleSesion({ sesion: s, onCerrar, onEditar, onBorrar }: {
  sesion: SesionPlan; onCerrar: () => void; onEditar: () => void; onBorrar: () => void
}) {
  const fases = secuenciaDe(s)
  const criterios = criteriosDe(s)
  const avisoIA = s.generada_ia ? <div style={{ marginBottom: 10 }}><AvisoBorradorIA que="planificación" /></div> : null
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card plan-modal" role="dialog" aria-modal="true" aria-label={`Sesión de ${s.area}`} data-sesion-detalle>
        <div className="plan-modal-cab">
          <div>
            <div className="plan-detalle-cuando">
              {diaLargo(s.fecha)} · {s.franja ? `${s.franja} · ` : ''}{s.hora_inicio}-{s.hora_fin}
              {s.bloque && <> · bloque {s.bloque}</>}
            </div>
            <h2 style={{ borderLeft: `4px solid ${tonoDe(s.area)}`, paddingLeft: 8 }}>
              {s.area}{s.evaluable ? ' ■' : ''}
              {s.tipo !== 'clase' && <span className="badge" style={{ marginLeft: 8, background: 'var(--gris-100)' }}>
                {s.tipo === 'especialista' ? 'Especialista' : 'Actividad de centro'}</span>}
            </h2>
            {(s.unidad_texto || s.titulo) && (
              <div>{s.unidad_texto && <b>{s.unidad_texto}</b>}{s.unidad_texto && s.titulo ? ' · ' : ''}{s.titulo}</div>
            )}
          </div>
          <button className="modal-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>

        {avisoIA}
        {s.objetivo && <section className="plan-detalle-sec"><h3>Objetivo</h3><p>{s.objetivo}</p></section>}
        {fases.length > 0 && (
          <section className="plan-detalle-sec"><h3>Secuencia</h3>
            <ul>{fases.map((f, i) => <li key={i}><b>{f.fase}{f.minutos != null ? ` (${f.minutos} min)` : ''}:</b> {f.texto}</li>)}</ul>
          </section>
        )}
        {s.recursos && <section className="plan-detalle-sec"><h3>Recursos</h3><p>{s.recursos}</p></section>}
        {s.evaluacion && <section className="plan-detalle-sec"><h3>Evaluación formativa</h3><p>{s.evaluacion}</p></section>}
        {criterios.length > 0 && (
          <section className="plan-detalle-sec"><h3>Criterios anclados</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {criterios.map(c => (
                <span key={c.codigo} className="badge" data-criterio-anclado={c.codigo}
                  style={{ background: c.criterio_id ? 'var(--azul-100)' : 'var(--ambar-100)' }}
                  title={c.criterio_id ? `Casa con ${c.criterio_id} del currículo` : 'No casa con ningún criterio del currículo del área'}>
                  {c.codigo}{c.criterio_id ? '' : ' ?'}
                </span>
              ))}
            </div>
          </section>
        )}
        {!s.objetivo && !fases.length && !s.recursos && !s.evaluacion && (
          <p className="plan-ayuda">Sin detalle. Puedes añadirlo con «Editar».</p>
        )}
        {!!s.evaluable && !s.asignatura_id && (
          <div className="plan-aviso">Evaluable, pero «{s.area}» no es un área de esta clase: no hay Calificador al que ir.</div>
        )}
        {!!s.evaluable && !!s.asignatura_id && !s.unidad_id && s.unidad_texto && (
          <div className="plan-aviso">La unidad «{s.unidad_texto}» no está enlazada: el Calificador abrirá el área sin unidad.</div>
        )}

        <div className="plan-modal-pie">
          <button className="btn-danger" data-sesion-borrar onClick={onBorrar} style={{ marginRight: 'auto' }}>Borrar</button>
          <button className="btn-secondary" data-sesion-editar onClick={onEditar}>Editar o mover</button>
          {vaAlCalificador(s) && (
            <Link className="btn-primary plan-boton-enlace" to={enlaceCalificador(s)} data-ir-calificador>Calificar →</Link>
          )}
        </div>
      </div>
    </div>
  )
}
