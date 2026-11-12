/**
 * Análisis de un alumno frente a su grupo, en un área: su nota junto a la
 * media, la mediana y la moda de la clase —por área, por instrumento y por
 * criterio—, sus puntos débiles y, en cada examen, las preguntas que falló y
 * la mayoría acertó.
 *
 * No calcula nada: `getResumenCurso` da las notas de toda la clase (las
 * mismas de «Todo el curso») y `db/analisisAlumno.ts` las compara. Se abre
 * desde Seguimiento («Por alumno») y desde la ficha del alumno. La pantalla
 * es del docente y enseña todas las cifras; el documento impreso calla las
 * del grupo cuando son de menos de cinco notas.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Alumno, Asignatura, Grupo } from '@/db/localDb'
import { getAsignaturas, getGrupo, getResumenCurso, examenesDeArea, type ResumenCurso } from '@/db/queries'
import {
  analizarAlumno, analizarExamen, PERIODOS, ETIQUETA_PERIODO, MINIMO_GRUPO,
  type Comparacion, type ExamenDeArea, type FilaAnalisis, type Periodo,
} from '@/db/analisisAlumno'
import { textoDeModa } from '@/db/estadistica'
import { calificativo } from '@/db/calculo'
import { documentoAnalisisAlumno } from '@/informes/analisisAlumno'
import { imprimir } from '@/informes/lamina'
import * as curriculo from '@/curriculo'
import Dialogo from '@/components/comunes/Dialogo'

interface Props {
  alumno: Alumno
  grupoId: number
  /** Área con la que abrir; sin ella, la primera de la clase. */
  asignaturaId?: number | null
  onCerrar: () => void
}

const formato = (n: number | null | undefined) => n == null ? '—' : String(Math.round(n * 10) / 10).replace('.', ',')
const signo = (n: number | null) => n == null ? '' : `${n > 0 ? '+' : ''}${formato(n)}`

/** La nota del alumno y, debajo, dónde queda frente a la mediana del grupo. */
function Celda({ c }: { c: Comparacion }) {
  if (c.valor == null && !c.grupo) return <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--gris-500)' }}>—</td>
  const cal = calificativo(c.valor)
  return (
    <td style={{ padding: '6px 8px', textAlign: 'center' }}
      title={c.grupo ? `Grupo (${c.grupo.n}): media ${formato(c.grupo.media)} · mediana ${formato(c.grupo.mediana)} · moda ${textoDeModa(c.grupo.moda, c.grupo.n)}` : undefined}>
      <div style={{ fontWeight: 700, color: c.valor == null ? 'var(--gris-500)' : cal.color }}>{formato(c.valor)}</div>
      {c.grupo && (
        <div style={{ fontSize: 11.5, color: 'var(--gris-600)' }}>
          med. {formato(c.grupo.mediana)}{c.diferencia != null && <span style={{ color: c.diferencia < 0 ? '#b91c1c' : c.diferencia > 0 ? '#166534' : undefined }}> ({signo(c.diferencia)})</span>}
        </div>
      )}
    </td>
  )
}

function Tabla({ filas, primera, periodos, etiqueta }: {
  filas: FilaAnalisis[]; primera: string; periodos: readonly Periodo[]; etiqueta: (f: FilaAnalisis) => React.ReactNode
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--gris-100)' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>{primera}</th>
            {periodos.map(p => <th key={p} style={{ padding: '6px 8px', width: 96 }}>{ETIQUETA_PERIODO[p]}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.id} data-analisis-fila={f.id} style={{ borderTop: '1px solid var(--gris-300)' }}>
              <td style={{ padding: '6px 8px' }}>{etiqueta(f)}</td>
              {periodos.map(p => <Celda key={p} c={f.periodos[p]} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const tituloSeccion = { fontSize: 14, fontWeight: 700, margin: '18px 0 6px', color: 'var(--azul-900)' } as const

export default function AnalisisAlumno({ alumno, grupoId, asignaturaId, onCerrar }: Props) {
  const [grupo, setGrupo] = useState<Grupo | null>(null)
  const [areas, setAreas] = useState<Asignatura[]>([])
  const [areaId, setAreaId] = useState<number | null>(asignaturaId ?? null)
  const [resumen, setResumen] = useState<ResumenCurso | null>(null)
  const [examenes, setExamenes] = useState<ExamenDeArea[]>([])
  const [descripciones, setDescripciones] = useState<Map<string, string>>(new Map())
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const [verCriterios, setVerCriterios] = useState(false)

  useEffect(() => {
    let vigente = true
    Promise.all([getGrupo(grupoId), getAsignaturas(grupoId)]).then(([g, as]) => {
      if (!vigente) return
      setGrupo(g ?? null)
      setAreas(as)
      setAreaId(id => id ?? as[0]?.id ?? null)
      if (!as.length) setCargando(false)
    }).catch(e => { if (vigente) { setAviso(`No se pudo leer la clase: ${(e as Error).message}`); setCargando(false) } })
    return () => { vigente = false }
  }, [grupoId])

  useEffect(() => {
    if (!areaId) return
    let vigente = true
    setCargando(true); setAviso(null)
    Promise.all([getResumenCurso(areaId), examenesDeArea(areaId)]).then(([r, ex]) => {
      if (!vigente) return
      setResumen(r); setExamenes(ex); setCargando(false)
    }).catch(e => { if (vigente) { setAviso(`No se pudo calcular el análisis: ${(e as Error).message}`); setCargando(false) } })
    return () => { vigente = false }
  }, [areaId])

  // Las descripciones de los criterios, para leer los puntos débiles sin ir a buscarlos.
  useEffect(() => {
    const asig = areas.find(a => a.id === areaId)
    if (!asig || !grupo) return
    let vigente = true
    curriculo.criterios(asig.nombre, grupo.curso, grupo.etapa, asig.comunidad || grupo.comunidad)
      .then((lista: { id: string; descripcion: string }[]) => { if (vigente) setDescripciones(new Map(lista.map(c => [c.id, c.descripcion]))) })
      .catch(() => { if (vigente) setDescripciones(new Map()) })
    return () => { vigente = false }
  }, [areaId, areas, grupo])

  const analisis = useMemo(() => resumen ? analizarAlumno(alumno.id!, resumen.notas, resumen.medidas) : null, [resumen, alumno.id])
  const deExamenes = useMemo(() => examenes.map(e => analizarExamen(e, alumno.id!)).filter((e): e is NonNullable<typeof e> => !!e), [examenes, alumno.id])
  const asig = areas.find(a => a.id === areaId)
  const nombre = `${alumno.apellidos}, ${alumno.nombre}`
  const sinDatos = !!analisis && PERIODOS.every(p => analisis.area.periodos[p].valor == null) && deExamenes.length === 0
  const final = analisis?.area.periodos.final

  const imprimirInforme = async () => {
    if (!analisis || !asig) return
    const hecho = await imprimir(documentoAnalisisAlumno({
      alumno: nombre, clase: grupo?.nombre ?? '', area: asig.nombre_display || asig.nombre,
      cursoEscolar: grupo?.curso_escolar, analisis, examenes: deExamenes, descripciones,
    }), `analisis-${alumno.apellidos}-${asig.nombre}`.replace(/\s+/g, '-').toLowerCase())
    setAviso(hecho ? null : 'No se ha impreso nada.')
  }

  return (
    <Dialogo anidado ancho={860} antetitulo="ANÁLISIS FRENTE AL GRUPO" titulo={nombre} onCerrar={onCerrar} data-analisis-alumno>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 4px' }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            Área
            <select value={areaId ?? ''} onChange={e => setAreaId(Number(e.target.value))} data-analisis-area aria-label="Área del análisis">
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre_display || a.nombre}</option>)}
            </select>
          </label>
          <button className="btn-secondary" data-analisis-imprimir disabled={!analisis || sinDatos} onClick={imprimirInforme} style={{ fontSize: 13 }}>
            Imprimir informe
          </button>
        </div>
        {aviso && <div role="alert" style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12.5, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>{aviso}</div>}

        {cargando && <p style={{ color: 'var(--gris-600)' }}>Calculando…</p>}
        {!cargando && !areas.length && <p style={{ color: 'var(--gris-600)' }}>La clase todavía no tiene áreas.</p>}
        {!cargando && analisis && sinDatos && (
          <p data-analisis-vacio style={{ color: 'var(--gris-600)' }}>Todavía no hay notas de este alumno en {asig?.nombre_display || 'esta área'}.</p>
        )}

        {!cargando && analisis && !sinDatos && (
          <>
            <h3 style={tituloSeccion}>Nota del área</h3>
            <Tabla filas={[analisis.area]} primera="" periodos={PERIODOS} etiqueta={() => asig?.nombre_display || asig?.nombre || 'Área'} />
            {final?.grupo && (
              <p data-analisis-grupo style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '6px 0 0' }}>
                Grupo en la nota final ({final.grupo.n} alumno{final.grupo.n !== 1 ? 's' : ''}): media <strong>{formato(final.grupo.media)}</strong> ·
                mediana <strong>{formato(final.grupo.mediana)}</strong> · moda <strong>{textoDeModa(final.grupo.moda, final.grupo.n)}</strong> ·
                entre {formato(final.grupo.min)} y {formato(final.grupo.max)}.
                {final.grupo.n < MINIMO_GRUPO && <> Con menos de {MINIMO_GRUPO} notas, estas cifras no salen en el informe impreso.</>}
              </p>
            )}
            <p style={{ fontSize: 11.5, color: 'var(--gris-500)', margin: '4px 0 0' }}>
              En cada casilla, su nota y debajo la mediana del grupo con la diferencia. Mantén el cursor para ver media y moda.
            </p>

            {analisis.instrumentos.length > 0 && (
              <>
                <h3 style={tituloSeccion}>Por instrumento de evaluación</h3>
                <Tabla filas={analisis.instrumentos} primera="Instrumento" periodos={['1', '2', '3']} etiqueta={f => f.nombre} />
              </>
            )}

            <h3 style={tituloSeccion}>Dónde necesita más apoyo</h3>
            {analisis.debiles.length ? (
              <ul data-analisis-debiles style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                {analisis.debiles.map(p => (
                  <li key={p.criterio_id} data-debil={p.criterio_id}>
                    <strong>{p.criterio_id}</strong> · nota <strong style={{ color: calificativo(p.valor).color }}>{formato(p.valor)}</strong>
                    {p.mediana != null && <> (mediana del grupo {formato(p.mediana)})</>}
                    {descripciones.get(p.criterio_id) && <span style={{ color: 'var(--gris-600)' }}> — {descripciones.get(p.criterio_id)}</span>}
                  </li>
                ))}
              </ul>
            ) : <p style={{ fontSize: 13, color: 'var(--gris-600)', margin: 0 }}>Ningún criterio suspenso ni claramente por debajo del grupo.</p>}

            {analisis.fuertes.length > 0 && (
              <p data-analisis-fuertes style={{ fontSize: 13, margin: '10px 0 0' }}>
                <strong>Destaca en:</strong> {analisis.fuertes.slice(0, 6).map(p => `${p.criterio_id} (${formato(p.valor)})`).join(' · ')}
              </p>
            )}

            <h3 style={tituloSeccion}>
              <button type="button" className="btn-secondary" data-analisis-criterios-toggle aria-expanded={verCriterios}
                onClick={() => setVerCriterios(v => !v)} style={{ fontSize: 13 }}>
                {verCriterios ? '▾' : '▸'} Todos los criterios ({analisis.criterios.length})
              </button>
            </h3>
            {verCriterios && (
              <Tabla filas={analisis.criterios} primera="Criterio" periodos={PERIODOS}
                etiqueta={f => <span title={descripciones.get(f.id)}><strong>{f.id}</strong>{f.adaptado ? <span style={{ fontSize: 11, color: 'var(--gris-500)' }}> · no se compara</span> : null}</span>} />
            )}

            <h3 style={tituloSeccion}>Exámenes</h3>
            {deExamenes.length === 0 && <p style={{ fontSize: 13, color: 'var(--gris-600)', margin: 0 }}>No tiene ningún examen corregido pregunta a pregunta en esta área.</p>}
            {deExamenes.map((e, i) => (
              <div key={i} data-analisis-examen style={{ border: '1px solid var(--gris-300)', borderRadius: 9, padding: '10px 12px', marginBottom: 8, fontSize: 13 }}>
                <div>
                  <strong>{e.titulo}</strong>{e.unidad ? ` · ${e.unidad}` : ''} <span style={{ color: 'var(--gris-500)' }}>({e.instrumento})</span>
                </div>
                <div style={{ marginTop: 3 }}>
                  Nota <strong style={{ color: calificativo(e.nota.valor).color }}>{formato(e.nota.valor)}</strong>
                  {e.nota.grupo && <> · grupo ({e.nota.grupo.n}): media {formato(e.nota.grupo.media)}, mediana {formato(e.nota.grupo.mediana)}, moda {textoDeModa(e.nota.grupo.moda, e.nota.grupo.n)}</>}
                </div>
                {e.ejes.length > 0 && (
                  <div style={{ marginTop: 3, color: 'var(--gris-600)' }}>
                    {e.ejes.map(x => `${x.nombre}: ${x.pctAlumno} % (grupo ${x.pctGrupo} %)`).join(' · ')}
                  </div>
                )}
                {e.fallosDestacados.length > 0 ? (
                  <div data-fallos-destacados style={{ marginTop: 5 }}>
                    <strong>Falló y la mayoría acertó:</strong>
                    <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                      {e.fallosDestacados.map(p => (
                        <li key={p.numero}>{p.numero}. {p.enunciado || `Pregunta ${p.numero}`} <span style={{ color: 'var(--gris-500)' }}>(acierto del grupo {p.pctGrupo} %)</span></li>
                      ))}
                    </ul>
                  </div>
                ) : <div style={{ marginTop: 5, color: 'var(--gris-600)' }}>No falló ninguna pregunta que la mayoría acertara.</div>}
              </div>
            ))}
          </>
        )}
    </Dialogo>
  )
}
