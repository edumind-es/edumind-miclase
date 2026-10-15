/**
 * Importar el CSV del libro de calificaciones de Edixgal (Moodle) al
 * Calificador.
 *
 * El docente que califica en Edixgal exporta «Calificacións → Exportar →
 * Ficheiro de texto» y lo trae aquí. Se le enseña qué alumnos se han
 * reconocido y cuáles no, y elige columna a columna a qué instrumento de la
 * clase va cada ítem de Moodle; lo que no asigne se ignora. Cada nota se
 * guarda en todos los criterios que el instrumento cubre en lo que se está
 * viendo, con `sinVinculos`, igual que «Pegar columna». Al terminar se dice
 * qué ha pasado: notas guardadas, alumnos sin encontrar, columnas ignoradas.
 *
 * Leer el CSV es cosa de `utils/importarMoodle.ts` (puro, con pruebas).
 */
import { useMemo, useState } from 'react'
import { saveCalificaciones, type DatosDeArea } from '@/db/queries'
import { leerCSVMoodle, notasDeColumna, sugerirInstrumento, type LecturaMoodle } from '@/utils/importarMoodle'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import type { Alumno } from '@/db/localDb'
import type { ColumnaInstrumento } from './MatrizInstrumentos'

interface Props {
  /** Instrumentos de la vista, con los criterios que cubre cada uno. */
  columnas: ColumnaInstrumento[]
  alumnos: Alumno[]
  trimestre: number
  unidadId: number | null
  area: DatosDeArea
  /** Se ha guardado algo: la matriz tiene que refrescarse. */
  onGuardado: () => void
  onCerrar: () => void
}

type Resumen = {
  notas: number
  columnas: { titulo: string; instrumento: string; notas: number }[]
  ignoradas: string[]
  sinAlumno: string[]
  sinFila: string[]
}

export default function ImportarMoodle({ columnas, alumnos, trimestre, unidadId, area, onGuardado, onCerrar }: Props) {
  const [nombreFichero, setNombreFichero] = useState<string | null>(null)
  const [lectura, setLectura] = useState<LecturaMoodle | null>(null)
  /** Índice de columna de Moodle → instrumento_id elegido (ausente = ignorar). */
  const [destino, setDestino] = useState<Map<number, number>>(new Map())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  /** Las preguntas sueltas de un cuestionario («P. 1», «P. 2»…) salen plegadas: lo normal es importar solo la nota. */
  const [preguntasAbiertas, setPreguntasAbiertas] = useState(false)

  const lista = useMemo(() => alumnos.map(a => ({ id: a.id!, nombre: a.nombre, apellidos: a.apellidos })), [alumnos])
  const instrumentos = useMemo(() => columnas.map(c => ({ id: c.ins.instrumento_id, nombre: c.ins.nombre, col: c })), [columnas])

  const cargar = async (fichero: File | null) => {
    if (!fichero) return
    setError(null); setResumen(null)
    const texto = await fichero.text()
    const l = leerCSVMoodle(texto, lista)
    setNombreFichero(fichero.name)
    setLectura(l)
    // Propuesta por nombre; lo que no tiene pista queda sin asignar.
    const propuesta = new Map<number, number>()
    for (const c of l.columnas) {
      const s = sugerirInstrumento(c, instrumentos)
      if (s) propuesta.set(c.indice, s.id)
    }
    setDestino(propuesta)
  }

  const asignadas = lectura ? lectura.columnas.filter(c => destino.has(c.indice)) : []
  const totalNotas = lectura ? asignadas.reduce((s, c) => s + notasDeColumna(lectura, c).length, 0) : 0
  const reconocidos = lectura ? lectura.filas.filter(f => f.alumno) : []
  const noReconocidos = lectura ? lectura.filas.filter(f => !f.alumno) : []

  const guardar = async () => {
    if (!lectura || !totalNotas) return
    setGuardando(true); setError(null)
    try {
      const porColumna: Resumen['columnas'] = []
      const items = asignadas.flatMap(c => {
        const col = instrumentos.find(i => i.id === destino.get(c.indice))!.col
        const notas = notasDeColumna(lectura, c)
        porColumna.push({ titulo: c.titulo, instrumento: col.ins.nombre, notas: notas.length })
        return notas.flatMap(n => col.criterios.map(cr => ({
          alumno_id: n.alumno.id, instrumento_id: col.ins.instrumento_id, criterio_id: cr.id,
          ...area, trimestre, valor: n.valor, observacion: null, unidad_id: unidadId,
        })))
      })
      // Sin vínculos: el reparto a los criterios de cada instrumento ya está hecho aquí.
      await saveCalificaciones(items, { sinVinculos: true })
      setResumen({
        notas: totalNotas,
        columnas: porColumna,
        ignoradas: lectura.columnas.filter(c => !destino.has(c.indice)).map(c => c.titulo),
        sinAlumno: noReconocidos.map(f => `${f.apellidos}, ${f.nombre}`.replace(/^, /, '') || `fila ${f.fila}`),
        sinFila: lectura.sinFila.map(a => `${a.apellidos}, ${a.nombre}`),
      })
      onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar las notas')
    } finally {
      setGuardando(false)
    }
  }

  const etiquetaAlumno = (f: { nombre: string; apellidos: string }) => `${f.apellidos}, ${f.nombre}`.replace(/^, /, '')

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !guardando) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label="Importar CSV de Edixgal" data-importar-moodle
        style={{ width: 'min(820px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--azul-900)' }}>📥 Importar CSV de Edixgal</div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)', lineHeight: 1.5 }}>
              En Edixgal: <strong>Calificacións → Exportar → Ficheiro de texto</strong>. Trae aquí ese fichero y elige a qué instrumento va cada columna. Lo que no asignes se ignora.
            </div>
          </div>
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar" disabled={guardando}>✕</button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {resumen ? (
            <ResumenImportacion resumen={resumen} />
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                <input data-importar-fichero type="file" accept=".csv,.txt,text/csv,text/plain"
                  onChange={e => cargar(e.target.files?.[0] ?? null)} />
                {nombreFichero && <span style={{ color: 'var(--gris-600)' }}>{nombreFichero}</span>}
              </label>

              {lectura && lectura.avisos.map((a, i) => (
                <div key={i} data-importar-aviso style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', padding: '8px 10px', borderRadius: 8 }}>{a}</div>
              ))}

              {lectura && lectura.columnas.length > 0 && (
                <>
                  {/* Alumnos */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Alumnado · {reconocidos.length} de {lectura.filas.length} fila{lectura.filas.length !== 1 ? 's' : ''} reconocida{lectura.filas.length !== 1 ? 's' : ''}
                    </div>
                    {noReconocidos.length > 0 && (
                      <div data-importar-sin-alumno style={{ fontSize: 12.5, color: '#92400e', lineHeight: 1.5 }}>
                        <strong>No están en esta clase:</strong>{' '}
                        {noReconocidos.map(f => `${etiquetaAlumno(f) || `fila ${f.fila}`} (${f.aviso})`).join(' · ')}. Sus notas no se guardan.
                      </div>
                    )}
                    {lectura.sinFila.length > 0 && (
                      <div style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.5 }}>
                        <strong>Sin fila en el CSV:</strong> {lectura.sinFila.map(etiquetaAlumno).join(' · ')}. Se quedan como están.
                      </div>
                    )}
                    {noReconocidos.length === 0 && lectura.sinFila.length === 0 && (
                      <div style={{ fontSize: 12.5, color: 'var(--gris-600)' }}>Todos los alumnos del CSV están en la clase, y al revés.</div>
                    )}
                  </div>

                  {/* Columnas → instrumentos */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Columnas de Moodle · {asignadas.length} de {lectura.columnas.length} asignada{asignadas.length !== 1 ? 's' : ''}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {lectura.columnas.filter(c => !c.pregunta || preguntasAbiertas).map(c => {
                        const elegido = destino.get(c.indice)
                        const n = notasDeColumna(lectura, c).length
                        return (
                          <div key={c.indice} data-importar-columna={c.titulo} data-asignada={elegido != null || undefined} style={{
                            display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(200px, 1fr)', gap: 10, alignItems: 'center',
                            fontSize: 12.5, padding: '6px 10px', borderRadius: 8, background: elegido != null ? 'var(--verde-100)' : 'var(--gris-100)',
                          }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: 'var(--gris-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.etiqueta}>
                                {c.titulo}
                              </div>
                              <div style={{ fontSize: 11, color: c.sinNumeros ? '#92400e' : 'var(--gris-600)' }}>
                                {c.actividad ? `${c.actividad} · ` : ''}
                                {c.sinNumeros ? 'sin notas numéricas: no se puede importar'
                                  : `${n} nota${n !== 1 ? 's' : ''} para alumnos de la clase${
                                    c.maximo != null && c.maximo !== 10 ? ` · sobre ${c.maximo}, se pasa a 0-10` : c.escala100 ? ' · escala 0-100, se divide entre 10' : ''}`}
                              </div>
                            </div>
                            <select value={elegido ?? ''} disabled={c.sinNumeros}
                              onChange={e => setDestino(prev => {
                                const m = new Map(prev)
                                if (e.target.value === '') m.delete(c.indice); else m.set(c.indice, Number(e.target.value))
                                return m
                              })}
                              style={{ fontSize: 12.5, padding: '5px 8px' }}>
                              <option value="">— Ignorar esta columna —</option>
                              {instrumentos.map(i => (
                                <option key={i.id} value={i.id}>{getInstrConfig(i.col.ins.tipo).icon} {i.nombre}</option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                      {lectura.columnas.some(c => c.pregunta) && (
                        <button type="button" data-importar-preguntas className="btn-secondary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
                          onClick={() => setPreguntasAbiertas(v => !v)}>
                          {preguntasAbiertas ? 'Ocultar las preguntas sueltas' : `Mostrar las ${lectura.columnas.filter(c => c.pregunta).length} preguntas sueltas del cuestionario`}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {error && <div style={{ color: 'var(--rojo-500)', fontSize: 12.5, padding: '0 18px 12px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 18px 18px', flexWrap: 'wrap' }}>
          {resumen ? (
            <button className="btn-primary" onClick={onCerrar} style={{ fontSize: 13 }}>Cerrar</button>
          ) : (
            <>
              <button data-importar-guardar className="btn-primary" onClick={guardar} disabled={guardando || totalNotas === 0} style={{ fontSize: 13 }}>
                {guardando ? 'Guardando…' : `Guardar ${totalNotas} nota${totalNotas !== 1 ? 's' : ''}`}
              </button>
              <button className="btn-secondary" onClick={onCerrar} disabled={guardando} style={{ fontSize: 13 }}>Cancelar</button>
              <span style={{ fontSize: 11.5, color: 'var(--gris-600)' }}>
                Cada nota va a todos los criterios del instrumento elegido. Las casillas que ya tengan nota se sobrescriben.
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Qué ha pasado, también lo que no: nada de importar se queda callado. */
function ResumenImportacion({ resumen }: { resumen: Resumen }) {
  return (
    <div data-importar-resumen style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--verde-700, #15803d)' }}>
        ✓ {resumen.notas} nota{resumen.notas !== 1 ? 's' : ''} guardada{resumen.notas !== 1 ? 's' : ''}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {resumen.columnas.map(c => (
          <li key={c.titulo}><strong>{c.titulo}</strong> → {c.instrumento}: {c.notas} nota{c.notas !== 1 ? 's' : ''}</li>
        ))}
      </ul>
      {resumen.ignoradas.length > 0 && (
        <div style={{ color: 'var(--gris-600)' }}><strong>Columnas ignoradas:</strong> {resumen.ignoradas.join(' · ')}</div>
      )}
      {resumen.sinAlumno.length > 0 && (
        <div style={{ color: '#92400e' }}><strong>Alumnos del CSV que no están en la clase:</strong> {resumen.sinAlumno.join(' · ')}. Sus notas no se han guardado.</div>
      )}
      {resumen.sinFila.length > 0 && (
        <div style={{ color: 'var(--gris-600)' }}><strong>Alumnos de la clase sin fila en el CSV:</strong> {resumen.sinFila.join(' · ')}. Se quedan como estaban.</div>
      )}
    </div>
  )
}
