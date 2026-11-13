/**
 * El informe de una prueba corregida: la lectura a la vista y el documento
 * Lámina para imprimir o guardar.
 *
 * Se abre desde la cabecera de la columna del examen y desde la lista de
 * «Exámenes y pruebas de evaluación». Todo se calcula en el aparato
 * (`db/informePrueba.ts`) con las respuestas que ya guarda cada nota; no
 * sale nada del dispositivo. El documento va por `imprimir` (iframe en web,
 * plugin Impresora en nativo) y por `descargarHTML`, como los demás informes.
 *
 * Dos lecturas del mismo examen (`[data-informe-de]`): «El grupo», sin
 * nombres, y «Un alumno», con su nota, su acierto por etiqueta y todas las
 * preguntas que falló, comparado con la clase o con los compañeros de media
 * parecida (`alumnosDeMediaParecida`, sobre la nota del área). El documento
 * del alumno lleva nombre y solo compara con la clase.
 */
import { useEffect, useMemo, useState } from 'react'
import { getPrueba, getResumenCurso, getUnidades, respuestasDeExamen } from '@/db/queries'
import { analizarExamen, alumnosDeMediaParecida, MINIMO_GRUPO, type AnalisisExamen, type ExamenDeArea } from '@/db/analisisAlumno'
import { documentoInformeAlumnoPrueba } from '@/informes/informeAlumnoPrueba'
import { competenciasDeLaPrueba, informeDePrueba, radialSVG, type InformePrueba as Informe } from '@/db/informePrueba'
import type { ConexionCriterio } from '@/db/competenciasClave'
import type { Asignatura, Grupo } from '@/db/localDb'
import { curriculoDeArea } from '@/informes/datos'
import { useAppStore } from '@/store/useAppStore'
import { pruebaDeUnidad, tieneUnidadesPorPregunta, unidadesDelExamen, type PruebaDef } from '@/db/prueba'
import { documentoInformePrueba } from '@/informes/informePrueba'
import { imprimir, descargarHTML } from '@/informes/lamina'

interface Props {
  instrumentoId: number
  instrumentoNombre: string
  unidadId: number | null
  unidadNombre?: string | null
  /** Criterios que el instrumento evalúa aquí, con su descripción si se tiene. */
  criterios: { id: string; descripcion: string }[]
  /** Clase y área del examen: de su currículo salen las competencias clave. */
  grupo?: Grupo
  asig?: Asignatura
  grupoNombre: string
  areaNombre: string
  /** Abrir ya en «Un alumno», con este alumno elegido. */
  alumnoInicial?: number | null
  onCerrar: () => void
}

const coma = (n: number | null | undefined) => n == null ? '—' : String(Math.round(n * 10) / 10).replace('.', ',')
const colorPct = (p: number) => p < 50 ? '#c0302f' : p < 70 ? '#a85a00' : '#1f6fa5'

/** El examen de un alumno frente al grupo elegido: nota, etiquetas y preguntas falladas. */
function VistaAlumno({ a, grupo }: { a: AnalisisExamen; grupo: string }) {
  const g = a.nota.grupo
  return (
    <div data-informe-individual>
      <div data-informe-alumno-nota style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
        <span>Nota <strong style={{ fontSize: 17 }}>{coma(a.nota.valor)}</strong></span>
        {g && <span>{grupo} ({g.n}): media <strong>{coma(g.media)}</strong> · mediana <strong>{coma(g.mediana)}</strong></span>}
        {a.nota.diferencia != null && <span>{a.nota.diferencia > 0 ? '+' : ''}{coma(a.nota.diferencia)} sobre la mediana</span>}
      </div>

      <div style={{ fontWeight: 700, color: 'var(--azul-900)', marginBottom: 4 }}>Por {a.ejesPor === 'aspecto' ? 'etiqueta' : 'criterio'}</div>
      <table data-informe-ejes style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--gris-600)', fontSize: 12 }}>
            <th style={{ padding: '4px 6px' }}>{a.ejesPor === 'aspecto' ? 'Etiqueta' : 'Criterio'}</th>
            <th style={{ padding: '4px 6px', width: '40%' }}>Su acierto</th>
            <th style={{ padding: '4px 6px', textAlign: 'right' }}>{grupo}</th>
          </tr>
        </thead>
        <tbody>
          {[...a.ejes].sort((x, y) => x.pctAlumno - y.pctAlumno).map(e => (
            <tr key={e.nombre} data-eje={e.nombre} style={{ borderTop: '1px solid var(--gris-200)' }}>
              <td style={{ padding: '6px' }}>{e.nombre}</td>
              <td style={{ padding: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 8, background: 'var(--gris-200)', position: 'relative' }}>
                    <div style={{ width: `${e.pctAlumno}%`, height: '100%', background: colorPct(e.pctAlumno) }} />
                    {/* La marca del grupo sobre la barra del alumno. */}
                    <div aria-hidden="true" style={{ position: 'absolute', top: -3, left: `${e.pctGrupo}%`, width: 2, height: 14, background: 'var(--gris-700)' }} />
                  </div>
                  <strong style={{ minWidth: 44, textAlign: 'right' }}>{e.pctAlumno} %</strong>
                </div>
              </td>
              <td style={{ padding: '6px', textAlign: 'right' }}>{e.pctGrupo} %</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontWeight: 700, color: 'var(--azul-900)', marginBottom: 4 }}>
        Preguntas falladas ({a.falladas.length} de {a.preguntas.length})
      </div>
      {a.falladas.length === 0
        ? <p style={{ margin: 0, color: 'var(--gris-600)' }}>No falló ninguna pregunta.</p>
        : (
          <>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--gris-600)' }}>Primero las que más acierta {grupo.toLowerCase()}: son las que más conviene repasar.</p>
            <ul data-informe-falladas style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {a.falladas.map(p => (
                <li key={p.numero} data-fallada={p.numero} style={{ padding: '6px 0', borderTop: '1px solid var(--gris-200)', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <strong style={{ minWidth: 24 }}>{p.numero}.</strong>
                  <span style={{ flex: 1 }}>
                    {p.enunciado || `Pregunta ${p.numero}`}
                    <span style={{ color: 'var(--gris-600)', fontSize: 12 }}>{p.aspecto ? ` · ${p.aspecto}` : ''}{p.criterio_id ? ` · ${p.criterio_id}` : ''}</span>
                  </span>
                  <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {coma(p.obtenido)} / {coma(p.max)} · {grupo.toLowerCase()} <strong>{p.pctGrupo} %</strong>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
    </div>
  )
}

export default function InformePrueba({ instrumentoId, instrumentoNombre, unidadId, unidadNombre, criterios, grupo, asig, grupoNombre, areaNombre, alumnoInicial, onCerrar }: Props) {
  /** El examen entero, tal como está guardado. */
  const [entero, setEntero] = useState<PruebaDef | null>(null)
  const [respuestas, setRespuestas] = useState<Awaited<ReturnType<typeof respuestasDeExamen>> | null>(null)
  /** Unidades en las que cuenta el examen, si reparte sus preguntas entre ellas. */
  const [partes, setPartes] = useState<{ id: number; nombre: string }[]>([])
  /** Qué parte se mira: una unidad, o null para el examen entero. */
  const [parte, setParte] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [conexiones, setConexiones] = useState<Map<string, ConexionCriterio>>()
  const headers = useAppStore(s => s._headers)
  /** De quién es el informe: del grupo (sin nombres) o de un alumno. */
  const [de, setDe] = useState<'grupo' | 'alumno'>(alumnoInicial != null ? 'alumno' : 'grupo')
  const [alumnoId, setAlumnoId] = useState<number | null>(alumnoInicial ?? null)
  const [frente, setFrente] = useState<'clase' | 'parecidos'>('clase')
  /** alumno → nota del área (la del curso hasta hoy), para buscar a los de media parecida. */
  const [notasArea, setNotasArea] = useState<Map<number, number | null> | null>(null)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      const prueba = await getPrueba(instrumentoId, unidadId)
      if (!prueba) { if (vigente) setError(`«${instrumentoNombre}» no tiene examen definido${unidadNombre ? ` en ${unidadNombre}` : ''}.`); return }
      const respuestas = await respuestasDeExamen(instrumentoId, prueba.unidad_id, prueba.def)
      if (!vigente) return
      // Con preguntas repartidas por unidad, el informe se puede mirar unidad a unidad.
      let unidades: { id: number; nombre: string }[] = []
      if (tieneUnidadesPorPregunta(prueba.def) && asig?.id != null) {
        const ids = unidadesDelExamen(prueba.unidad_id, prueba.def)
        const todas = await getUnidades(asig.id)
        unidades = ids.map(id => todas.find(u => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u).map(u => ({ id: u.id!, nombre: u.nombre }))
      }
      if (!vigente) return
      setEntero(prueba.def)
      setRespuestas(respuestas)
      setPartes(unidades.length > 1 ? unidades : [])
    })().catch(() => { if (vigente) setError('No se pudo preparar el informe.') })
    return () => { vigente = false }
  }, [instrumentoId, unidadId, instrumentoNombre, unidadNombre, criterios, asig?.id])

  // El examen tal como cuenta en la unidad elegida: sus preguntas y las que no dicen unidad.
  const def = useMemo(() => entero && parte != null ? pruebaDeUnidad(entero, parte) : entero, [entero, parte])
  const informe: Informe | null = useMemo(
    () => def && respuestas ? informeDePrueba(def, respuestas, criterios.map(c => c.id)) : null,
    [def, respuestas, criterios],
  )
  const nombreParte = parte != null ? partes.find(u => u.id === parte)?.nombre ?? null : null

  // Los alumnos con el examen corregido, por orden de lista.
  const corregidos = useMemo(
    () => (respuestas ?? []).filter(r => Object.keys(r.respuestas).length).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [respuestas],
  )
  useEffect(() => {
    if (de === 'alumno' && alumnoId == null && corregidos.length) setAlumnoId(corregidos[0].alumno_id)
  }, [de, alumnoId, corregidos])

  // La nota del área de cada alumno solo hace falta para «media parecida».
  useEffect(() => {
    if (de !== 'alumno' || notasArea || asig?.id == null) return
    let vigente = true
    getResumenCurso(asig.id).then(r => {
      if (vigente && r) setNotasArea(new Map([...r.notas].map(([id, n]) => [id, n.final])))
    }).catch(() => { /* sin notas del área solo se compara con la clase */ })
    return () => { vigente = false }
  }, [de, notasArea, asig?.id])

  const examen: ExamenDeArea | null = useMemo(() => def && respuestas ? {
    instrumento: instrumentoNombre, unidad_id: parte, unidad: unidadNombre ?? null,
    def, destinos: criterios.map(c => c.id), respuestas,
  } : null, [def, respuestas, parte, instrumentoNombre, unidadNombre, criterios])
  /** Frente a toda la clase: lo que se imprime. */
  const delAlumno = useMemo(() => examen && alumnoId != null ? analizarExamen(examen, alumnoId) : null, [examen, alumnoId])
  const parecidos = useMemo(
    () => notasArea && alumnoId != null ? alumnosDeMediaParecida(alumnoId, notasArea, corregidos.map(r => r.alumno_id)) : [],
    [notasArea, alumnoId, corregidos],
  )
  const conParecidos = useMemo(
    () => examen && alumnoId != null && parecidos.length ? analizarExamen(examen, alumnoId, { solo: parecidos }) : null,
    [examen, alumnoId, parecidos],
  )
  const nombreAlumno = corregidos.find(r => r.alumno_id === alumnoId)?.nombre ?? ''
  const individual = de === 'alumno'

  // Sin conexión el informe sale igual, sin el bloque de competencias clave
  useEffect(() => {
    if (!grupo || !asig) return
    let vigente = true
    curriculoDeArea(grupo, asig, headers).then(c => { if (vigente) setConexiones(c.conexiones) })
    return () => { vigente = false }
  }, [grupo, asig, headers])

  const ctx = { grupo: grupoNombre, area: areaNombre, unidad: nombreParte ? `${nombreParte} (solo sus preguntas)` : unidadNombre, descripciones: new Map(criterios.map(c => [c.id, c.descripcion])), conexiones }
  const nombreFichero = `informe-${(def?.titulo ?? instrumentoNombre).replace(/\s+/g, '-').toLowerCase()}.html`

  /** El documento que toca: el del grupo o, con un alumno elegido, el suyo. */
  const documentoActual = (): { html: string; fichero: string } | null => {
    if (!def || !informe) return null
    if (!individual) return { html: documentoInformePrueba(informe, def, ctx), fichero: nombreFichero }
    if (!delAlumno) return null
    return {
      html: documentoInformeAlumnoPrueba({ alumno: nombreAlumno, clase: grupoNombre, area: areaNombre, unidad: ctx.unidad, def, analisis: delAlumno }),
      fichero: nombreFichero.replace(/\.html$/, `-${nombreAlumno.replace(/[,.]/g, '').replace(/\s+/g, '-').toLowerCase()}.html`),
    }
  }

  const aImprimir = async () => {
    const doc = documentoActual()
    if (!doc) return
    setOcupado(true)
    try {
      const hecho = await imprimir(doc.html, doc.fichero.replace(/\.html$/, ''))
      setMsg(hecho ? 'Informe enviado a imprimir.' : 'No se ha imprimido nada: la vista previa se cerró sin imprimir ni compartir.')
    }
    catch { setMsg('No se pudo imprimir.') }
    finally { setOcupado(false) }
  }
  const aGuardar = async () => {
    const doc = documentoActual()
    if (!doc) return
    setOcupado(true)
    try { await descargarHTML(doc.html, doc.fichero); setMsg('Informe guardado como .html (se abre en cualquier navegador).') }
    catch { setMsg('No se pudo guardar.') }
    finally { setOcupado(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Informe de ${def?.titulo ?? instrumentoNombre}`} data-informe-prueba
        style={{ width: 'min(720px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--gris-500)' }}>Informe de la prueba</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--azul-900)' }}>{def?.titulo ?? instrumentoNombre}</div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>{grupoNombre} · {areaNombre}{unidadNombre ? ` · ${unidadNombre}` : ''}</div>
          </div>
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar">✕</button>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1, minHeight: 0, fontSize: 13, color: 'var(--gris-700)', lineHeight: 1.5 }}>
          {error && <div style={{ color: '#92400e', background: '#fffbeb', padding: '8px 10px', borderRadius: 8 }}>{error}</div>}
          {!error && !informe && <div style={{ color: 'var(--gris-500)' }}>Preparando el informe…</div>}
          {informe && def && informe.alumnos > 0 && (
            <div role="group" aria-label="De quién es el informe" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              {(['grupo', 'alumno'] as const).map(v => (
                <button key={v} type="button" data-informe-de={v} aria-pressed={de === v} onClick={() => { setDe(v); setMsg(null) }}
                  className={de === v ? 'btn-primary' : 'btn-secondary'} style={{ minHeight: 44, fontSize: 14 }}>
                  {v === 'grupo' ? 'El grupo' : 'Un alumno'}
                </button>
              ))}
              {individual && (
                <>
                  <select data-informe-alumno aria-label="Alumno del informe" value={alumnoId ?? ''} onChange={e => setAlumnoId(Number(e.target.value))}
                    style={{ minHeight: 44, fontSize: 14, flex: '1 1 180px' }}>
                    {corregidos.map(r => <option key={r.alumno_id} value={r.alumno_id}>{r.nombre}</option>)}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    Comparar con
                    <select data-informe-comparar aria-label="Con quién se compara" value={frente} onChange={e => setFrente(e.target.value as 'clase' | 'parecidos')}
                      style={{ minHeight: 44, fontSize: 14 }}>
                      <option value="clase">La clase</option>
                      <option value="parecidos" disabled={!conParecidos}>Media parecida</option>
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
          {informe && def && individual && (
            <>
              {partes.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
                  Ver:
                  <select data-informe-unidad value={parte ?? ''} onChange={e => setParte(e.target.value ? Number(e.target.value) : null)}
                    aria-label="Unidad del informe" style={{ minHeight: 44, fontSize: 14 }}>
                    <option value="">Todo el examen</option>
                    {partes.map(u => <option key={u.id} value={u.id}>Solo «{u.nombre}»</option>)}
                  </select>
                </label>
              )}
              {!delAlumno && <p style={{ color: 'var(--gris-600)' }}>Este alumno no tiene el examen corregido pregunta a pregunta.</p>}
              {delAlumno && frente === 'parecidos' && conParecidos && (
                <>
                  <p data-informe-parecidos style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--gris-600)' }}>
                    Media parecida: {parecidos.length} compañero{parecidos.length !== 1 ? 's' : ''} con la nota del área más cercana a la suya
                    {notasArea?.get(alumnoId!) != null ? ` (${coma(notasArea.get(alumnoId!))})` : ''}, a un punto o menos; si no llegan a {MINIMO_GRUPO}, los {MINIMO_GRUPO} más cercanos.
                    Solo se ve aquí: el documento compara con la clase.
                  </p>
                  <VistaAlumno a={conParecidos} grupo="Media parecida" />
                </>
              )}
              {delAlumno && !(frente === 'parecidos' && conParecidos) && <VistaAlumno a={delAlumno} grupo="La clase" />}
              {delAlumno && (delAlumno.nota.grupo?.n ?? 0) < MINIMO_GRUPO && (
                <p data-informe-pocos style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', padding: '8px 10px', marginTop: 10 }}>
                  Hay menos de {MINIMO_GRUPO} exámenes corregidos: el documento saldrá sin las cifras de la clase, porque de tan pocas se deducen las de los compañeros.
                </p>
              )}
            </>
          )}
          {informe && def && !individual && (
            <>
              {partes.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
                  Este examen reparte sus preguntas por unidad. Ver:
                  <select data-informe-unidad value={parte ?? ''} onChange={e => setParte(e.target.value ? Number(e.target.value) : null)}
                    aria-label="Unidad del informe" style={{ minHeight: 44, fontSize: 14 }}>
                    <option value="">Todo el examen</option>
                    {partes.map(u => <option key={u.id} value={u.id}>Solo «{u.nombre}»</option>)}
                  </select>
                </label>
              )}
              <div data-informe-resumen style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12, fontSize: 12.5 }}>
                <span><strong>{informe.alumnos}</strong> alumno{informe.alumnos !== 1 ? 's' : ''} corregido{informe.alumnos !== 1 ? 's' : ''}</span>
                {informe.notaMedia != null && <span>nota media <strong>{informe.notaMedia.toFixed(1).replace('.', ',')}</strong></span>}
                {informe.alumnos > 0 && <span><strong>{informe.aprobados}</strong> aprueban · <strong>{informe.suspensos}</strong> suspenden</span>}
              </div>
              <ul data-informe-lectura style={{ margin: '0 0 12px 18px', padding: 0 }}>
                {informe.lectura.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
              {informe.alumnos > 0 && informe.ejes.length > 0 && (
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: radialSVG(informe.ejes, { lado: 300, tinta: '#1f2937', relleno: '#2a7a6d', papel: '#cbd5e1' }) }} />
                  <div style={{ flex: '1 1 220px', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--azul-900)', marginBottom: 4 }}>De más fallada a más acertada</div>
                    <ol style={{ margin: '0 0 0 18px', padding: 0 }}>
                      {informe.porDificultad.slice(0, 8).map(p => (
                        <li key={p.id} value={p.numero}>{p.enunciado || `Pregunta ${p.numero}`} — <strong>{p.pctAcierto} %</strong>{p.aspecto ? ` · ${p.aspecto}` : ''}{p.criterio_id ? ` · ${p.criterio_id}` : ''}</li>
                      ))}
                    </ol>
                    {informe.porDificultad.length > 8 && <div style={{ color: 'var(--gris-500)', marginTop: 4 }}>… y {informe.porDificultad.length - 8} más en el documento.</div>}
                  </div>
                </div>
              )}
              {informe.alumnos > 0 && conexiones && (() => {
                const { porCompetencia } = competenciasDeLaPrueba(informe, conexiones)
                return porCompetencia.length > 0 && (
                  <div data-informe-competencias style={{ marginTop: 12, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--azul-900)', marginBottom: 4 }}>Acierto por competencia clave</div>
                    {porCompetencia.map(c => (
                      <span key={c.id} style={{ display: 'inline-block', marginRight: 12 }}><strong>{c.id}</strong> {c.pctAcierto} %</span>
                    ))}
                  </div>
                )
              })()}
              {!def.preguntas.some(p => p.aspecto) && informe.alumnos > 0 && (
                <p style={{ fontSize: 11.5, color: 'var(--gris-500)', marginTop: 10 }}>
                  Los ejes salen por criterio. Si pones un <strong>aspecto</strong> a cada pregunta en el editor del examen («Ríos», «Cálculo»…), el informe dirá qué aspectos fallan.
                </p>
              )}
            </>
          )}
          {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: '#166534', background: '#dcfce7', padding: '8px 10px', borderRadius: 8 }}>✅ {msg}</div>}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--gris-200)', background: 'var(--gris-50)', flexWrap: 'wrap' }}>
          <button className="btn-primary" data-informe-imprimir onClick={aImprimir} disabled={!informe || ocupado || (individual && !delAlumno)} style={{ fontSize: 13 }}>🖨 Imprimir{individual ? ' el del alumno' : ''}</button>
          <button className="btn-secondary" data-informe-guardar onClick={aGuardar} disabled={!informe || ocupado || (individual && !delAlumno)} style={{ fontSize: 13 }}>⬇ Guardar .html</button>
          <div style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={onCerrar} style={{ fontSize: 13 }}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
