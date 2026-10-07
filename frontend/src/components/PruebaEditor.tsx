/**
 * Editor de una prueba escrita: tipo de examen, preguntas y lo que vale cada una.
 *
 * Hermano del editor de rúbricas. El examen se define una vez —a mano o desde
 * un fichero— y después, al abrir a cada alumno, se anota pregunta a pregunta
 * y la nota sale sola.
 *
 * Un mismo instrumento («Prueba escrita») suele usarse en varias unidades, y
 * cada una tiene su examen: por eso el examen se guarda para una unidad, o
 * como general del instrumento si vale para todas.
 */
import { useEffect, useRef, useState } from 'react'
import {
  getPruebasDeInstrumento, guardarPrueba, eliminarPrueba,
  contarCorregidosDeExamen, recalcularNotasDeExamen, type PruebaGuardada,
} from '@/db/queries'
import {
  pruebaVacia, normalizarPrueba, puntosTotales, criteriosSinDestino, idDePreguntaNueva,
  TIPOS_PRUEBA, ESCALA_POR_DEFECTO,
  type PruebaDef, type PreguntaPrueba, type TipoPrueba, type RepartoPrueba,
} from '@/db/prueba'
import {
  importarPrueba, pruebaAXlsx, pruebaAMarkdown, pruebaAJson, PRUEBA_EJEMPLO,
} from '@/ia/pruebaImportar'
import { TIPO_XLSX } from './AyudaImportarRubrica'

interface Props {
  instrumentoId: number
  instrumentoNombre: string
  /** Unidad desde la que se abre, o null si se abre desde el gestor de instrumentos. */
  unidadId: number | null
  unidadNombre?: string
  /** Criterios que el instrumento evalúa aquí: los que se pueden asignar a las preguntas. */
  criterios: { id: string; descripcion: string }[]
  onCerrar: () => void
  capa?: string
}

type Ambito = 'unidad' | 'general'

function descargar(nombre: string, contenido: BlobPart, tipo: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

const PENALIZACIONES = [
  { valor: 0, texto: 'No resta' },
  { valor: 0.25, texto: 'Resta 1/4 de la pregunta' },
  { valor: 1 / 3, texto: 'Resta 1/3 de la pregunta' },
  { valor: 0.5, texto: 'Resta 1/2 de la pregunta' },
  { valor: 1, texto: 'Resta la pregunta entera' },
]

export default function PruebaEditor({
  instrumentoId, instrumentoNombre, unidadId, unidadNombre, criterios, onCerrar, capa = 'var(--z-modal-anidado)',
}: Props) {
  const [cargando, setCargando] = useState(true)
  const [def, setDef] = useState<PruebaDef>(pruebaVacia(instrumentoNombre))
  const [guardadas, setGuardadas] = useState<PruebaGuardada[]>([])
  /** Fila de la que salió lo que hay en pantalla, si salió de alguna. */
  const [cargadaId, setCargadaId] = useState<number | null>(null)
  const [ambito, setAmbito] = useState<Ambito>(unidadId != null ? 'unidad' : 'general')
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [ayuda, setAyuda] = useState(false)
  // Generador: cuántas preguntas y cuánto suma el examen.
  const [genN, setGenN] = useState(10)
  const [genTotal, setGenTotal] = useState(10)
  const importRef = useRef<HTMLInputElement>(null)

  const cerrar = () => {
    if (sucio && !confirm('Tienes cambios sin guardar en este examen. Si sales ahora se pierden.\n\n¿Salir de todos modos?')) return
    onCerrar()
  }

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [onCerrar, sucio])

  // Se abre el examen de la unidad si lo tiene; si no, el general; si no, uno nuevo.
  useEffect(() => {
    getPruebasDeInstrumento(instrumentoId).then(todas => {
      setGuardadas(todas)
      const suya = unidadId != null ? todas.find(p => p.unidad_id === unidadId) : undefined
      const elegida = suya ?? todas.find(p => p.unidad_id == null)
      if (elegida) {
        setDef(elegida.def)
        setCargadaId(elegida.id)
        setAmbito(elegida.unidad_id == null ? 'general' : 'unidad')
        setGenN(elegida.def.preguntas.length)
        setGenTotal(puntosTotales(elegida.def))
      }
      setCargando(false)
    }).catch(() => setCargando(false))
  }, [instrumentoId, unidadId])

  const editar = (fn: (d: PruebaDef) => PruebaDef) => { setSucio(true); setDef(fn) }

  const setTipo = (tipo: TipoPrueba) => editar(d => ({
    ...d, tipo,
    penalizacion: tipo === 'test' ? d.penalizacion ?? 0 : undefined,
    escala: tipo === 'niveles' ? d.escala?.length ? d.escala : ESCALA_POR_DEFECTO : undefined,
  }))
  const setReparto = (reparto: RepartoPrueba) => editar(d => ({ ...d, reparto }))

  const setPregunta = (i: number, cambios: Partial<PreguntaPrueba>) =>
    editar(d => ({ ...d, preguntas: d.preguntas.map((p, j) => j === i ? { ...p, ...cambios } : p) }))
  const addPregunta = () => editar(d => ({
    ...d, preguntas: [...d.preguntas, { id: idDePreguntaNueva(d.preguntas), enunciado: '', max: 1, criterio_id: null }],
  }))
  const removePregunta = (i: number) => editar(d => ({ ...d, preguntas: d.preguntas.filter((_, j) => j !== i) }))

  /**
   * Deja N preguntas que suman el total. Las que ya había conservan su
   * enunciado, su criterio y su id —y con el id, las respuestas ya anotadas—;
   * solo cambian los puntos.
   */
  const repartir = () => editar(d => {
    const n = Math.max(1, Math.min(200, Math.round(genN) || 1))
    const max = Math.round(((genTotal > 0 ? genTotal : n) / n) * 100) / 100
    const preguntas = d.preguntas.slice(0, n).map(p => ({ ...p, max }))
    while (preguntas.length < n) preguntas.push({ id: idDePreguntaNueva(preguntas), enunciado: '', max, criterio_id: null })
    return { ...d, preguntas }
  })

  const setEscala = (i: number, cambios: Partial<{ nombre: string; valor: number }>) =>
    editar(d => ({ ...d, escala: (d.escala ?? []).map((n, j) => j === i ? { ...n, ...cambios } : n) }))

  // ── Guardar ────────────────────────────────────────────────────────────

  const unidadDestino = ambito === 'unidad' ? unidadId : null

  const guardar = async () => {
    if (def.preguntas.length === 0) { setMsg({ tipo: 'error', texto: 'Añade al menos una pregunta.' }); return }
    // Guardar sobre el examen de otro ámbito lo sustituye: se pregunta.
    const yaHay = guardadas.find(p => p.unidad_id === unidadDestino)
    if (yaHay && yaHay.id !== cargadaId && !confirm(
      `Ya hay un examen ${unidadDestino == null ? 'general de este instrumento' : 'para esta unidad'} («${yaHay.def.titulo}»).\n\n¿Sustituirlo por este?`)) return
    setGuardando(true)
    try {
      const limpia = normalizarPrueba(def)
      const id = await guardarPrueba(instrumentoId, unidadDestino, limpia)
      setDef(limpia)
      setCargadaId(id)
      setGuardadas(await getPruebasDeInstrumento(instrumentoId))
      setSucio(false)
      // Un examen ya corregido que cambia deja notas que no salen del examen
      // nuevo. Se ofrece recalcularlas; no se hace sin preguntar, porque son
      // notas ya puestas.
      const corregidos = await contarCorregidosDeExamen(instrumentoId, unidadDestino, limpia)
      let recalculo = ''
      if (corregidos > 0) {
        if (confirm(`Este examen ya está corregido para ${corregidos} alumno${corregidos !== 1 ? 's' : ''}.\n\n¿Recalcular sus notas con el examen tal como queda ahora?\n\nNo se pierde nada: lo anotado en cada pregunta no se toca, y cada nota que cambie deja la anterior a la vista, en gris y sin contar.`)) {
          const hoy = new Date().toLocaleDateString('es-ES')
          const r = await recalcularNotasDeExamen(instrumentoId, unidadDestino, limpia,
            `Nota de «${limpia.titulo}» antes de cambiar el examen el ${hoy}`)
          recalculo = ` Notas recalculadas para ${r.alumnos} alumno${r.alumnos !== 1 ? 's' : ''}.`
            + (r.fantasmas ? ` ${r.fantasmas} nota${r.fantasmas !== 1 ? 's' : ''} anterior${r.fantasmas !== 1 ? 'es quedan' : ' queda'} a la vista en el calificador, sin contar.` : '')
        } else {
          recalculo = ' Las notas ya puestas se quedan como estaban.'
        }
      }
      setMsg({ tipo: 'ok', texto: `Examen guardado.${recalculo || ' Al abrir a un alumno lo corregirás pregunta a pregunta.'}` })
    } catch {
      setMsg({ tipo: 'error', texto: 'No se pudo guardar el examen.' })
    } finally { setGuardando(false) }
  }

  const borrar = async () => {
    if (cargadaId == null) return
    if (!confirm('¿Eliminar la definición de este examen?\n\nLas notas ya puestas se conservan, pero dejarán de poder corregirse por preguntas.')) return
    await eliminarPrueba(cargadaId)
    setGuardadas(await getPruebasDeInstrumento(instrumentoId))
    setDef(pruebaVacia(instrumentoNombre))
    setCargadaId(null)
    setSucio(false)
    setMsg({ tipo: 'ok', texto: 'Examen eliminado.' })
  }

  // ── Importar / exportar ────────────────────────────────────────────────

  const importar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (sucio && !confirm('Tienes cambios sin guardar en este examen. Si cargas otro encima se pierden.\n\n¿Cargarlo de todos modos?')) return
    try {
      const { prueba, avisos } = await importarPrueba(file.name, await file.arrayBuffer())
      setDef(prueba)
      setSucio(true)
      setAyuda(false)
      setGenN(prueba.preguntas.length)
      setGenTotal(puntosTotales(prueba))
      setMsg({
        tipo: 'ok',
        texto: `Examen «${prueba.titulo}» importado: ${prueba.preguntas.length} preguntas, ${puntosTotales(prueba)} puntos. `
          + (avisos.length ? `Ojo: ${avisos.join(' ')} ` : '') + 'Revísalo y pulsa «Guardar examen».',
      })
    } catch (err: any) {
      setMsg({ tipo: 'error', texto: `${err.message || 'No se pudo leer el fichero.'} Mira «Cómo importar» para ver la forma que debe tener.` })
    }
  }

  const nombreFichero = (def.titulo || instrumentoNombre).replace(/\s+/g, '-').toLowerCase()
  const total = puntosTotales(def)
  const sinDestino = criterios.length ? criteriosSinDestino(def, criterios.map(c => c.id)) : []
  const etiqueta = { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--gris-700)' } as const

  return (
    <div role="dialog" aria-modal="true" aria-label={`Examen de ${instrumentoNombre}`}
      onClick={e => { if (e.target === e.currentTarget) cerrar() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: capa,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto',
      }}>
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 820,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ background: 'var(--azul-700)', color: 'white', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 12, opacity: .8, marginBottom: 2 }}>Prueba escrita</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {instrumentoNombre}{unidadNombre ? ` · ${unidadNombre}` : ''}
            </div>
          </div>
          <button onClick={cerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <input ref={importRef} type="file" style={{ display: 'none' }} onChange={importar}
          data-uso="examen" accept=".xlsx,.md,.markdown,.txt,.json" />

        {cargando ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--gris-600)', fontSize: 13 }}>Cargando…</div>
        ) : (<>
          <div style={{ padding: 20, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {msg && (
              <div style={{
                marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
                background: msg.tipo === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.tipo === 'ok' ? '#166534' : '#991b1b',
              }}>
                {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
              </div>
            )}

            {ayuda && <AyudaImportarPrueba onCerrar={() => setAyuda(false)} />}

            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta}>Título del examen</label>
              <input value={def.titulo} onChange={e => editar(d => ({ ...d, titulo: e.target.value }))}
                aria-label="Título del examen" style={{ width: '100%', fontSize: 15, fontWeight: 600 }} />
            </div>

            {unidadId != null && (
              <div style={{ marginBottom: 14 }}>
                <span style={etiqueta}>Este examen es de</span>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="radio" name="ambito-examen" checked={ambito === 'unidad'} onChange={() => { setAmbito('unidad'); setSucio(true) }} />
                    Esta unidad{unidadNombre ? ` («${unidadNombre}»)` : ''}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="radio" name="ambito-examen" checked={ambito === 'general'} onChange={() => { setAmbito('general'); setSucio(true) }} />
                    Todas las unidades que usan «{instrumentoNombre}»
                  </label>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--gris-500)', marginTop: 3 }}>
                  Si cada unidad tiene su examen, déjalo en «Esta unidad»: las demás tendrán el suyo.
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <span style={etiqueta}>Tipo de examen</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                {TIPOS_PRUEBA.map(t => (
                  <label key={t.valor} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', padding: '9px 11px', borderRadius: 9,
                    border: `2px solid ${def.tipo === t.valor ? 'var(--azul-700)' : 'var(--gris-300)'}`,
                    background: def.tipo === t.valor ? 'var(--azul-100)' : 'white',
                  }}>
                    <input type="radio" name="tipo-examen" checked={def.tipo === t.valor} onChange={() => setTipo(t.valor)} style={{ marginTop: 3 }} />
                    <span>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: 'var(--azul-900)' }}>{t.nombre}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--gris-600)', lineHeight: 1.45 }}>{t.explicacion}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {def.tipo === 'test' && (
              <div style={{ marginBottom: 14 }}>
                <label style={etiqueta} htmlFor="penalizacion-examen">Cada fallo</label>
                <select id="penalizacion-examen" value={String(PENALIZACIONES.find(p => Math.abs(p.valor - (def.penalizacion ?? 0)) < 0.01)?.valor ?? def.penalizacion ?? 0)}
                  onChange={e => editar(d => ({ ...d, penalizacion: Number(e.target.value) }))} style={{ fontSize: 13 }}>
                  {PENALIZACIONES.map(p => <option key={p.valor} value={String(p.valor)}>{p.texto}</option>)}
                </select>
                <span style={{ fontSize: 11.5, color: 'var(--gris-500)', marginLeft: 8 }}>En blanco ni suma ni resta.</span>
              </div>
            )}

            {def.tipo === 'niveles' && (
              <div style={{ marginBottom: 14 }}>
                <span style={etiqueta}>Escala con la que se valora cada pregunta</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(def.escala ?? []).map((n, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input value={n.nombre} onChange={e => setEscala(i, { nombre: e.target.value })}
                        aria-label={`Nombre del nivel ${i + 1}`} style={{ flex: '1 1 160px', fontSize: 13 }} />
                      <input type="number" min={0} step={0.5} value={n.valor} onChange={e => setEscala(i, { valor: Number(e.target.value) })}
                        aria-label={`Puntos del nivel ${n.nombre}`} style={{ width: 64, fontSize: 13, textAlign: 'center' }} />
                      <span style={{ fontSize: 11.5, color: 'var(--gris-500)' }}>pts</span>
                      {(def.escala ?? []).length > 2 && (
                        <button onClick={() => editar(d => ({ ...d, escala: (d.escala ?? []).filter((_, j) => j !== i) }))}
                          aria-label={`Quitar el nivel ${n.nombre}`}
                          style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button className="btn-secondary" style={{ fontSize: 12, marginTop: 6 }}
                  onClick={() => editar(d => ({ ...d, escala: [...(d.escala ?? []), { nombre: `Nivel ${(d.escala ?? []).length + 1}`, valor: 0 }] }))}>
                  + Añadir nivel
                </button>
                <div style={{ fontSize: 11.5, color: 'var(--gris-500)', marginTop: 4 }}>
                  El nivel con más puntos da la pregunta entera; los demás, su parte proporcional.
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <span style={etiqueta}>La nota del examen</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" name="reparto-examen" checked={def.reparto === 'unica'} onChange={() => setReparto('unica')} style={{ marginTop: 3 }} />
                  <span><strong>Es una sola</strong> y va a todos los criterios que evalúa esta prueba.</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" name="reparto-examen" checked={def.reparto === 'criterios'} onChange={() => setReparto('criterios')} style={{ marginTop: 3 }} />
                  <span><strong>Se reparte por criterios</strong>: cada pregunta dice cuál evalúa y cada criterio recibe la nota de las suyas. Una pregunta de «Todos» cuenta para cada criterio del examen.</span>
                </label>
              </div>
            </div>

            {/* Generador: el punto de partida habitual es «10 preguntas de un punto». */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10, padding: '10px 12px', background: 'var(--gris-50)', borderRadius: 9, border: '1px solid var(--gris-200)' }}>
              <div>
                <label style={etiqueta} htmlFor="gen-n">N.º de preguntas</label>
                <input id="gen-n" type="number" min={1} max={200} value={genN} onChange={e => setGenN(Number(e.target.value))} style={{ width: 80, fontSize: 13, textAlign: 'center' }} />
              </div>
              <div>
                <label style={etiqueta} htmlFor="gen-total">Puntos del examen</label>
                <input id="gen-total" type="number" min={1} step={0.5} value={genTotal} onChange={e => setGenTotal(Number(e.target.value))} style={{ width: 80, fontSize: 13, textAlign: 'center' }} />
              </div>
              <button className="btn-secondary" style={{ fontSize: 12.5 }} onClick={repartir}
                title="Deja ese número de preguntas, todas con los mismos puntos. Las que ya hay conservan su texto y su criterio.">
                ⚖ Repartir a partes iguales
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--azul-900)' }}>
                {def.preguntas.length} pregunta{def.preguntas.length !== 1 ? 's' : ''} · suman {total} puntos
              </span>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--azul-700)', color: 'white' }}>
                    <th style={{ padding: '7px 8px', textAlign: 'center', width: 34 }}>N.º</th>
                    <th style={{ padding: '7px 8px', textAlign: 'left' }}>Pregunta <span style={{ fontWeight: 400, opacity: .8 }}>(opcional: para reconocerla al corregir)</span></th>
                    <th style={{ padding: '7px 8px', textAlign: 'center', width: 84 }}>{def.tipo === 'niveles' ? 'Vale' : 'Puntos'}</th>
                    {def.reparto === 'criterios' && <th style={{ padding: '7px 8px', textAlign: 'left', width: 170 }}>Criterio</th>}
                    <th style={{ width: 30 }} />
                  </tr>
                </thead>
                <tbody>
                  {def.preguntas.map((p, i) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                      <td style={{ padding: 5, textAlign: 'center', color: 'var(--gris-600)', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: 5 }}>
                        <input value={p.enunciado} onChange={e => setPregunta(i, { enunciado: e.target.value })}
                          aria-label={`Enunciado de la pregunta ${i + 1}`} placeholder={`Pregunta ${i + 1}`}
                          style={{ width: '100%', fontSize: 12.5 }} />
                      </td>
                      <td style={{ padding: 5 }}>
                        <input type="number" min={0.05} step={0.25} value={p.max}
                          onChange={e => setPregunta(i, { max: Number(e.target.value) })}
                          aria-label={`Puntos de la pregunta ${i + 1}`}
                          style={{ width: '100%', fontSize: 12.5, fontWeight: 700, textAlign: 'center' }} />
                      </td>
                      {def.reparto === 'criterios' && (
                        <td style={{ padding: 5 }}>
                          {criterios.length ? (
                            <select value={p.criterio_id ?? ''} onChange={e => setPregunta(i, { criterio_id: e.target.value || null })}
                              aria-label={`Criterio de la pregunta ${i + 1}`} style={{ width: '100%', fontSize: 12 }}>
                              <option value="">Todos</option>
                              {criterios.map(c => <option key={c.id} value={c.id} title={c.descripcion}>{c.id}</option>)}
                              {p.criterio_id && !criterios.some(c => c.id === p.criterio_id) && (
                                <option value={p.criterio_id}>{p.criterio_id} (no asignado)</option>
                              )}
                            </select>
                          ) : (
                            <input value={p.criterio_id ?? ''} onChange={e => setPregunta(i, { criterio_id: e.target.value.trim() || null })}
                              aria-label={`Criterio de la pregunta ${i + 1}`} placeholder="CE1.1 (vacío = todos)"
                              style={{ width: '100%', fontSize: 12 }} />
                          )}
                        </td>
                      )}
                      <td style={{ padding: 3, textAlign: 'center' }}>
                        <button onClick={() => removePregunta(i)} title="Eliminar pregunta" aria-label={`Eliminar la pregunta ${i + 1}`}
                          style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sinDestino.length > 0 && (
              <div style={{ padding: '9px 13px', borderRadius: 8, fontSize: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 10 }}>
                <strong>{sinDestino.join(', ')}</strong> {sinDestino.length === 1 ? 'no está asignado' : 'no están asignados'} a «{instrumentoNombre}» en la
                programación{unidadNombre ? ' de esta unidad' : ''}: sus preguntas no pondrán nota en ningún sitio. Asígnale el instrumento en 📋 Programación o cambia el criterio de esas preguntas.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={addPregunta}>+ Añadir pregunta</button>
              <div style={{ flex: 1 }} />
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => importRef.current?.click()}
                title="Definir el examen desde una hoja de cálculo (.xlsx), un Markdown (.md) o un JSON (.json)">
                📥 Importar
              </button>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setAyuda(v => !v)} aria-expanded={ayuda}
                title="Qué forma debe tener el fichero, con plantillas para descargar">
                ❓ Cómo importar
              </button>
              <button className="btn-secondary" style={{ fontSize: 12 }} disabled={def.preguntas.length === 0}
                onClick={() => descargar(`examen-${nombreFichero}.xlsx`, pruebaAXlsx(normalizarPrueba(def)), TIPO_XLSX)}
                title="Descargar el examen como hoja de cálculo">
                ⬇ .xlsx
              </button>
              <button className="btn-secondary" style={{ fontSize: 12 }} disabled={def.preguntas.length === 0}
                onClick={() => descargar(`examen-${nombreFichero}.md`, pruebaAMarkdown(normalizarPrueba(def)), 'text/markdown;charset=utf-8')}>
                ⬇ .md
              </button>
              <button className="btn-secondary" style={{ fontSize: 12 }} disabled={def.preguntas.length === 0}
                onClick={() => descargar(`${nombreFichero}.eduprueba.json`, pruebaAJson(normalizarPrueba(def)), 'application/json')}
                title="Guardar el examen en un fichero para compartirlo con otro docente">
                📤 Compartir
              </button>
            </div>
          </div>

          <div style={{
            flexShrink: 0, borderTop: '1px solid var(--gris-200)', background: 'var(--gris-50)',
            padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 140, fontSize: 12, color: sucio ? '#92400e' : 'var(--gris-500)', fontWeight: sucio ? 700 : 400 }}>
              {sucio ? '● Cambios sin guardar' : cargadaId != null ? '✅ Guardado en este dispositivo' : 'Todavía sin guardar'}
            </div>
            {cargadaId != null && (
              <button onClick={borrar}
                style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', fontWeight: 600 }}>
                Eliminar examen
              </button>
            )}
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={cerrar}>Cerrar</button>
            <button className="btn-primary" style={{ fontSize: 13, padding: '8px 20px' }}
              onClick={guardar} disabled={guardando || def.preguntas.length === 0}>
              {guardando ? 'Guardando…' : '💾 Guardar examen'}
            </button>
          </div>
        </>)}
      </div>
    </div>
  )
}

/** Qué forma debe tener el fichero de un examen, con plantillas. */
function AyudaImportarPrueba({ onCerrar }: { onCerrar: () => void }) {
  const celda = { border: '1px solid var(--gris-300)', padding: '4px 7px', fontSize: 11, textAlign: 'left' as const }
  const cab = { ...celda, background: 'var(--gris-100)', fontWeight: 700 }
  return (
    <div style={{ border: '1px solid var(--azul-300)', background: 'var(--azul-100)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 13.5, color: 'var(--azul-900)', flex: 1 }}>Cómo preparar el fichero del examen</strong>
        <button onClick={onCerrar} aria-label="Cerrar la ayuda"
          style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--gris-600)', lineHeight: 1 }}>×</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--gris-700)', lineHeight: 1.55, marginBottom: 10 }}>
        El examen es <strong>una tabla con una fila por pregunta</strong>, en una hoja de cálculo (.xlsx) o en Markdown (.md).
        Se lee en este dispositivo y no se sube a ningún sitio.
      </p>
      <div style={{ overflowX: 'auto', marginBottom: 10 }}>
        <table style={{ borderCollapse: 'collapse', background: 'white' }}>
          <tbody>
            <tr><td style={celda}>Prueba de la unidad 1</td><td style={celda} /><td style={celda} /></tr>
            <tr><td style={celda}>Tipo</td><td style={celda}>puntos</td><td style={celda} /></tr>
            <tr><td style={cab}>Pregunta</td><td style={cab}>Puntos</td><td style={cab}>Criterio</td></tr>
            <tr><td style={celda}>1. Define relieve</td><td style={celda}>2</td><td style={celda}>CE1.1</td></tr>
            <tr><td style={celda}>2. Sitúa los ríos</td><td style={celda}>3</td><td style={celda}>CE1.1</td></tr>
            <tr><td style={celda}>3. Presentación</td><td style={celda}>1</td><td style={celda} /></tr>
          </tbody>
        </table>
      </div>
      <ul style={{ fontSize: 12, color: 'var(--gris-700)', lineHeight: 1.6, margin: '0 0 12px 18px', padding: 0 }}>
        <li>La cabecera lleva <strong>Pregunta</strong> y <strong>Puntos</strong>. Los puntos pueden sumar lo que quieras (10, 20, 100…): la nota se pasa sola a 0–10.</li>
        <li><strong>Criterio</strong> es opcional. Si lo rellenas, cada criterio recibe la nota de sus preguntas; una pregunta sin criterio cuenta para todos los criterios del examen.</li>
        <li>Encima de la tabla, cada uno en su fila y todos opcionales: <strong>Tipo</strong> (puntos, test o niveles), <strong>Reparto</strong> (nota única o por criterios),
          {' '}<strong>Penalización</strong> para el test (0,25 o 1/3) y <strong>Escala</strong> para los niveles («Correcta (2)», «Parcial (1)», «En blanco (0)», una por celda).</li>
        <li>Una celda suelta arriba del todo es el título del examen.</li>
      </ul>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-secondary" style={{ fontSize: 11.5 }}
          onClick={() => descargar('plantilla-examen.xlsx', pruebaAXlsx(PRUEBA_EJEMPLO), TIPO_XLSX)}>⬇ Plantilla .xlsx</button>
        <button className="btn-secondary" style={{ fontSize: 11.5 }}
          onClick={() => descargar('plantilla-examen.md', pruebaAMarkdown(PRUEBA_EJEMPLO), 'text/markdown;charset=utf-8')}>⬇ Plantilla .md</button>
        <button className="btn-secondary" style={{ fontSize: 11.5 }}
          onClick={() => descargar('ejemplo.eduprueba.json', pruebaAJson(PRUEBA_EJEMPLO), 'application/json')}>⬇ Ejemplo .json</button>
      </div>
    </div>
  )
}
