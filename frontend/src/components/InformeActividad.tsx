/**
 * El informe de un alumno en una actividad que se evalúa con rúbrica (o lista
 * de control, o escala) o con el diario: el hermano de «Un alumno» del
 * informe de una prueba (`InformePrueba`).
 *
 * No calcula nada: `actividadesDeArea` trae lo guardado y `analizarActividad`
 * (`db/informeActividad.ts`, puro) lo lee. Se compara con la clase o con los
 * compañeros de media parecida (`alumnosDeMediaParecida`, sobre la nota del
 * área), y esto último solo se ve aquí: el documento, que lleva nombre y vale
 * para la familia, compara con la clase y calla sus cifras con pocas notas.
 * Las observaciones del docente solo se imprimen si marca la casilla.
 */
import { useEffect, useMemo, useState } from 'react'
import Dialogo from './comunes/Dialogo'
import Boton from './comunes/Boton'
import { actividadesDeArea, getResumenCurso } from '@/db/queries'
import { alumnosDeMediaParecida, MINIMO_GRUPO } from '@/db/analisisAlumno'
import { analizarActividad, tieneDatos, type ActividadDeUnidad, type AnalisisActividad, type IndicadorAnalizado } from '@/db/informeActividad'
import { documentoInformeAlumnoActividad, fechaCorta, TEXTO_TENDENCIA } from '@/informes/informeAlumnoActividad'
import { etiquetaAgregacion } from '@/db/diario'
import { imprimir, descargarHTML } from '@/informes/lamina'

interface Props {
  asignaturaId: number
  instrumentoId: number
  instrumentoNombre: string
  /** La unidad tal como va en la casilla (`claveUnidad`). */
  unidadId: number
  trimestre: number
  grupoNombre: string
  areaNombre: string
  alumnoInicial?: number | null
  /** Va encima de otro diálogo (el panel de la casilla, el análisis del alumno). */
  anidado?: boolean
  onCerrar: () => void
}

const coma = (n: number | null | undefined) => n == null ? '—' : String(Math.round(n * 10) / 10).replace('.', ',')
const colorPct = (p: number) => p < 50 ? '#c0302f' : p < 70 ? '#a85a00' : '#1f6fa5'
const celda = { padding: '6px' } as const

function FilaIndicador({ i, grupo }: { i: IndicadorAnalizado; grupo: string }) {
  return (
    <tr data-indicador={i.nombre} data-flojo={i.flojo ? '' : undefined} style={{ borderTop: '1px solid var(--gris-200)' }}>
      <td style={celda}>
        {i.nombre}
        {i.descriptor && <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>{i.descriptor}</div>}
      </td>
      <td style={celda}>
        {i.pctAlumno == null
          ? <span style={{ color: 'var(--gris-600)' }}>Sin marcar</span>
          : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 8, background: 'var(--gris-200)', position: 'relative', minWidth: 60 }}>
                <div style={{ width: `${i.pctAlumno}%`, height: '100%', background: colorPct(i.pctAlumno) }} />
                {/* La marca del grupo sobre la barra del alumno. */}
                {i.pctGrupo != null && <div aria-hidden="true" style={{ position: 'absolute', top: -3, left: `${i.pctGrupo}%`, width: 2, height: 14, background: 'var(--gris-700)' }} />}
              </div>
              <strong style={{ whiteSpace: 'nowrap', color: colorPct(i.pctAlumno) }}>{i.nivel ?? i.valor}</strong>
            </div>
          )}
      </td>
      <td style={{ ...celda, textAlign: 'right', whiteSpace: 'nowrap' }} title={`${grupo}: ${i.nGrupo} con este indicador marcado`}>
        {i.pctGrupo != null ? `${i.pctGrupo} %` : '—'}
      </td>
    </tr>
  )
}

function Vista({ a, grupo }: { a: AnalisisActividad; grupo: string }) {
  const g = a.nota.grupo
  const subtitulo = { fontWeight: 700, color: 'var(--azul-900)', margin: '12px 0 4px' } as const
  const cabecera = (
    <thead>
      <tr style={{ textAlign: 'left', color: 'var(--gris-600)', fontSize: 12 }}>
        <th style={{ padding: '4px 6px' }}>Indicador</th>
        <th style={{ padding: '4px 6px', width: '40%' }}>Su nivel</th>
        <th style={{ padding: '4px 6px', textAlign: 'right' }}>{grupo}</th>
      </tr>
    </thead>
  )
  return (
    <div data-informe-individual>
      <div data-informe-alumno-nota style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
        <span>Nota <strong style={{ fontSize: 17 }}>{coma(a.nota.valor)}</strong></span>
        {g && <span>{grupo} ({g.n}): media <strong>{coma(g.media)}</strong> · mediana <strong>{coma(g.mediana)}</strong></span>}
        {a.nota.diferencia != null && <span>{a.nota.diferencia > 0 ? '+' : ''}{coma(a.nota.diferencia)} sobre la mediana</span>}
        {a.tendencia && <span data-informe-tendencia={a.tendencia}>Evolución: <strong>{TEXTO_TENDENCIA[a.tendencia]}</strong></span>}
      </div>

      {a.herramienta === 'rubrica' && (
        <>
          <div style={subtitulo}>A mejorar ({a.flojos.length} de {a.indicadores.length})</div>
          {a.flojos.length === 0
            ? <p style={{ margin: 0, color: 'var(--gris-600)' }}>Ningún indicador queda por debajo de la mitad.</p>
            : a.flojos.length === a.indicadores.length
            ? <p data-informe-todos-flojos style={{ margin: 0, color: 'var(--gris-600)' }}>Todos quedan por debajo de la mitad: son los de la tabla siguiente.</p>
            : (
              <>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--gris-600)' }}>Del más bajo al menos; a igualdad, primero el que mejor lleva {grupo.toLowerCase()}.</p>
                <table data-informe-flojos style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  {cabecera}
                  <tbody>{a.flojos.map(i => <FilaIndicador key={i.nombre} i={i} grupo={grupo} />)}</tbody>
                </table>
              </>
            )}
          <div style={subtitulo}>Indicador a indicador</div>
          <table data-informe-indicadores style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            {cabecera}
            <tbody>{a.indicadores.map(i => <FilaIndicador key={i.nombre} i={i} grupo={grupo} />)}</tbody>
          </table>
          {a.sinMarcar > 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--gris-600)' }}>
              {a.sinMarcar === 1 ? 'Un indicador está' : `${a.sinMarcar} indicadores están`} sin marcar: no cuenta{a.sinMarcar === 1 ? '' : 'n'} en la nota. Si la rúbrica se cambió después de calificar, sus marcas son de la anterior.
            </p>
          )}
        </>
      )}

      {a.registros.length > 0 && (
        <>
          <div style={subtitulo}>{a.herramienta === 'rubrica' ? 'Cómo ha ido evolucionando' : 'Registro a registro'} ({a.registros.length})</div>
          <ul data-informe-registros style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {a.registros.map((r, n) => (
              <li key={n} data-registro style={{ padding: '6px 0', borderTop: '1px solid var(--gris-200)', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ minWidth: 86, color: 'var(--gris-600)' }}>{fechaCorta(r.fecha)}</span>
                <strong style={{ minWidth: 34 }}>{coma(r.nota)}</strong>
                <span>{r.etiqueta ?? 'Con la rúbrica'}</span>
                {r.observacion && <span style={{ flex: '1 1 200px', color: 'var(--gris-600)' }}>{r.observacion}</span>}
              </li>
            ))}
          </ul>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--gris-600)' }}>
            Con varios registros, la nota es: {etiquetaAgregacion(a.agregacion).toLowerCase()}.
          </p>
        </>
      )}
    </div>
  )
}

export default function InformeActividad({ asignaturaId, instrumentoId, instrumentoNombre, unidadId, trimestre, grupoNombre, areaNombre, alumnoInicial, anidado, onCerrar }: Props) {
  const [actividad, setActividad] = useState<ActividadDeUnidad | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [alumnoId, setAlumnoId] = useState<number | null>(alumnoInicial ?? null)
  const [frente, setFrente] = useState<'clase' | 'parecidos'>('clase')
  /** alumno → nota del área, para buscar a los de media parecida. */
  const [notasArea, setNotasArea] = useState<Map<number, number | null> | null>(null)
  const [conObservaciones, setConObservaciones] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vigente = true
    actividadesDeArea(asignaturaId, { instrumento_id: instrumentoId, unidad_id: unidadId, trimestre }).then(as => {
      if (!vigente) return
      if (!as[0]) setError(`«${instrumentoNombre}» no tiene aquí nada que desgranar: ni rúbrica marcada ni registros del diario.`)
      else setActividad(as[0])
    }).catch(() => { if (vigente) setError('No se pudo preparar el informe.') })
    return () => { vigente = false }
  }, [asignaturaId, instrumentoId, instrumentoNombre, unidadId, trimestre])

  useEffect(() => {
    let vigente = true
    getResumenCurso(asignaturaId).then(r => {
      if (vigente && r) setNotasArea(new Map([...r.notas].map(([id, n]) => [id, n.final])))
    }).catch(() => { /* sin notas del área solo se compara con la clase */ })
    return () => { vigente = false }
  }, [asignaturaId])

  const conDatos = useMemo(() => actividad ? actividad.alumnos.filter(a => tieneDatos(a, actividad.herramienta)) : [], [actividad])
  useEffect(() => {
    if (!conDatos.length) return
    if (alumnoId == null || !conDatos.some(a => a.alumno_id === alumnoId)) setAlumnoId(conDatos[0].alumno_id)
  }, [conDatos, alumnoId])

  /** Frente a toda la clase: lo que se imprime. */
  const delAlumno = useMemo(() => actividad && alumnoId != null ? analizarActividad(actividad, alumnoId) : null, [actividad, alumnoId])
  const parecidos = useMemo(
    () => notasArea && alumnoId != null ? alumnosDeMediaParecida(alumnoId, notasArea, conDatos.map(a => a.alumno_id)) : [],
    [notasArea, alumnoId, conDatos],
  )
  const conParecidos = useMemo(
    () => actividad && alumnoId != null && parecidos.length ? analizarActividad(actividad, alumnoId, { solo: parecidos }) : null,
    [actividad, alumnoId, parecidos],
  )
  const nombreAlumno = conDatos.find(a => a.alumno_id === alumnoId)?.nombre ?? ''
  const hayObservaciones = !!delAlumno?.registros.some(r => r.observacion)

  const documentoActual = () => {
    if (!delAlumno) return null
    const limpio = (t: string) => t.replace(/[,.«»]/g, '').replace(/\s+/g, '-').toLowerCase()
    return {
      html: documentoInformeAlumnoActividad({ alumno: nombreAlumno, clase: grupoNombre, area: areaNombre, trimestre, analisis: delAlumno, conObservaciones }),
      fichero: `informe-${limpio(delAlumno.titulo)}-${limpio(nombreAlumno)}.html`,
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

  const queEs = actividad?.herramienta === 'diario' ? 'diario de observación' : 'rúbrica'
  return (
    <Dialogo data-informe-actividad={actividad?.herramienta ?? ''} anidado={anidado} ancho={720} onCerrar={onCerrar}
      antetitulo={`Informe de un alumno · ${queEs}`}
      titulo={delAlumno?.titulo ?? instrumentoNombre}
      subtitulo={`${grupoNombre} · ${areaNombre}${actividad?.unidad ? ` · ${actividad.unidad}` : ''} · ${trimestre}.º trimestre`}
      pie={(
        <>
          <Boton variante="primario" data-informe-imprimir onClick={aImprimir} disabled={!delAlumno || ocupado}>Imprimir el del alumno</Boton>
          <Boton data-informe-guardar onClick={aGuardar} disabled={!delAlumno || ocupado}>Guardar .html</Boton>
          <Boton onClick={onCerrar}>Cerrar</Boton>
        </>
      )}>
      <div style={{ fontSize: 13, color: 'var(--gris-700)', lineHeight: 1.5 }}>
        {error && <div data-informe-error style={{ color: '#92400e', background: '#fffbeb', padding: '8px 10px' }}>{error}</div>}
        {!error && !actividad && <div style={{ color: 'var(--gris-600)' }}>Preparando el informe…</div>}
        {actividad && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <select data-informe-alumno aria-label="Alumno del informe" value={alumnoId ?? ''} onChange={e => { setAlumnoId(Number(e.target.value)); setMsg(null) }}
              style={{ minHeight: 44, fontSize: 14, flex: '1 1 180px' }}>
              {conDatos.map(a => <option key={a.alumno_id} value={a.alumno_id}>{a.nombre}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Comparar con
              <select data-informe-comparar aria-label="Con quién se compara" value={frente} onChange={e => setFrente(e.target.value as 'clase' | 'parecidos')}
                style={{ minHeight: 44, fontSize: 14 }}>
                <option value="clase">La clase</option>
                <option value="parecidos" disabled={!conParecidos}>Media parecida</option>
              </select>
            </label>
          </div>
        )}
        {delAlumno && frente === 'parecidos' && conParecidos && (
          <>
            <p data-informe-parecidos style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--gris-600)' }}>
              Media parecida: {parecidos.length} compañero{parecidos.length !== 1 ? 's' : ''} con la nota del área más cercana a la suya
              {notasArea?.get(alumnoId!) != null ? ` (${coma(notasArea.get(alumnoId!))})` : ''}, a un punto o menos; si no llegan a {MINIMO_GRUPO}, los {MINIMO_GRUPO} más cercanos.
              Solo se ve aquí: el documento compara con la clase.
            </p>
            <Vista a={conParecidos} grupo="Media parecida" />
          </>
        )}
        {delAlumno && !(frente === 'parecidos' && conParecidos) && <Vista a={delAlumno} grupo="La clase" />}
        {delAlumno && (delAlumno.nota.grupo?.n ?? 0) < MINIMO_GRUPO && (
          <p data-informe-pocos style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', padding: '8px 10px', marginTop: 10 }}>
            Hay menos de {MINIMO_GRUPO} notas en esta actividad: el documento saldrá sin las cifras de la clase, porque de tan pocas se deducen las de los compañeros.
          </p>
        )}
        {delAlumno && hayObservaciones && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 8 }}>
            <input type="checkbox" data-informe-observaciones checked={conObservaciones} onChange={e => setConObservaciones(e.target.checked)} style={{ width: 22, height: 22 }} />
            Imprimir también mis observaciones (si no, se quedan en la app)
          </label>
        )}
        {msg && <div data-informe-msg role="status" style={{ marginTop: 10, fontSize: 12.5, color: '#166534', background: '#dcfce7', padding: '8px 10px' }}>{msg}</div>}
      </div>
    </Dialogo>
  )
}
