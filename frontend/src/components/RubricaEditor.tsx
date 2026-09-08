import { useEffect, useRef, useState } from 'react'
import { getRubrica, guardarRubrica, eliminarRubrica } from '@/db/queries'
import {
  parsearRespuestaIA, generarPromptRubrica, rubricaToMarkdown,
  rubricaVacia, NIVELES_DEFAULT,
  type RubricaParsed, type RubricaIndicador, type RubricaNivel,
} from '@/ia/rubricaPrompt'
import { PLANTILLAS_RUBRICA, rubricaDesdePlantilla } from '@/ia/rubricaPlantillas'
import { useLocalAI, hasWebGPU } from '@/ia/useLocalAI'

interface Props {
  instrumentoId: number
  instrumentoNombre: string
  asignaturaNombre: string
  nivel: string  // e.g. "6º Primaria"
  onCerrar: () => void
}

type Tab = 'diseniar' | 'ia'
/** Antes de editar hay que decidir de dónde parte la rúbrica. */
type Modo = 'cargando' | 'elegir' | 'editar'

export default function RubricaEditor({ instrumentoId, instrumentoNombre, asignaturaNombre, nivel, onCerrar }: Props) {
  const [tab, setTab] = useState<Tab>('diseniar')
  const [modo, setModo] = useState<Modo>('cargando')
  const [plantillasAbiertas, setPlantillasAbiertas] = useState(false)
  const [rubrica, setRubrica] = useState<RubricaParsed>(rubricaVacia(instrumentoNombre))
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [tieneDatos, setTieneDatos] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const importRubricaRef = useRef<HTMLInputElement>(null)

  // IA
  const ai = useLocalAI()
  const [iaContexto, setIaContexto] = useState('')
  const [iaRespuesta, setIaRespuesta] = useState('')
  const [iaNIndicadores, setIaNIndicadores] = useState(4)
  const [iaError, setIaError] = useState('')
  const [promptCopiado, setPromptCopiado] = useState(false)

  // Cerrar con Esc, como el resto de los modales de la app. Este era el único
  // que no lo hacía, y es el más grande de todos.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [onCerrar])

  // Una rúbrica que ya existe se abre para editarla. Una que no existe abría
  // antes una tabla con «Indicador 1», «Indicador 2» y ocho celdas en blanco:
  // el docente se encontraba el trabajo por hacer y sin pistas de por dónde.
  // Ahora se le ofrece de dónde partir.
  useEffect(() => {
    getRubrica(instrumentoId).then(r => {
      if (r) {
        setTieneDatos(true)
        setRubrica({
          titulo: r.titulo,
          niveles: JSON.parse(r.niveles_json),
          indicadores: JSON.parse(r.indicadores_json),
        })
        setModo('editar')
      } else {
        setModo('elegir')
      }
    }).catch(() => setModo('elegir'))
  }, [instrumentoId])

  const empezarEnBlanco = () => { setTab('diseniar'); setModo('editar') }
  const empezarConIA = () => { setTab('ia'); setModo('editar') }
  const empezarDesdePlantilla = (id: string) => {
    const pl = PLANTILLAS_RUBRICA.find(p => p.id === id)
    if (!pl) return
    setRubrica(rubricaDesdePlantilla(pl, instrumentoNombre))
    setTab('diseniar')
    setModo('editar')
    setMsg({ tipo: 'ok', texto: `Plantilla «${pl.nombre}» cargada. Ajústala a tu clase y guárdala.` })
  }

  // ── Edición manual ─────────────────────────────────────────────────────

  const setTitulo = (titulo: string) => setRubrica(r => ({ ...r, titulo }))

  const setIndicadorNombre = (idx: number, nombre: string) =>
    setRubrica(r => {
      const indicadores = [...r.indicadores]
      indicadores[idx] = { ...indicadores[idx], nombre }
      return { ...r, indicadores }
    })

  const setDescriptor = (indIdx: number, nivelNombre: string, texto: string) =>
    setRubrica(r => {
      const indicadores = [...r.indicadores]
      indicadores[indIdx] = {
        ...indicadores[indIdx],
        descriptores: { ...indicadores[indIdx].descriptores, [nivelNombre]: texto },
      }
      return { ...r, indicadores }
    })

  const addIndicador = () =>
    setRubrica(r => ({
      ...r,
      indicadores: [
        ...r.indicadores,
        {
          nombre: `Indicador ${r.indicadores.length + 1}`,
          descriptores: Object.fromEntries(r.niveles.map(n => [n.nombre, ''])),
        },
      ],
    }))

  const removeIndicador = (idx: number) =>
    setRubrica(r => ({
      ...r,
      indicadores: r.indicadores.filter((_, i) => i !== idx),
    }))

  // ── Guardar ────────────────────────────────────────────────────────────

  const guardar = async (generadaIA = false) => {
    if (rubrica.indicadores.length === 0) { setMsg({ tipo: 'error', texto: 'Añade al menos un indicador.' }); return }
    setGuardando(true)
    try {
      await guardarRubrica({
        instrumento_id: instrumentoId,
        titulo: rubrica.titulo,
        niveles_json: JSON.stringify(rubrica.niveles),
        indicadores_json: JSON.stringify(rubrica.indicadores),
        generada_ia: generadaIA ? 1 : 0,
        contexto: iaContexto || undefined,
      })
      setMsg({ tipo: 'ok', texto: 'Rúbrica guardada correctamente.' })
      setTieneDatos(true)
    } catch {
      setMsg({ tipo: 'error', texto: 'Error al guardar la rúbrica.' })
    } finally { setGuardando(false) }
  }

  const borrar = async () => {
    if (!confirm('¿Eliminar esta rúbrica? No se puede deshacer.')) return
    await eliminarRubrica(instrumentoId)
    setRubrica(rubricaVacia(instrumentoNombre))
    setTieneDatos(false)
    setMsg({ tipo: 'ok', texto: 'Rúbrica eliminada.' })
  }

  // ── Import / Export ────────────────────────────────────────────────────

  const exportarMD = () => {
    const md = rubricaToMarkdown(rubrica)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rubrica-${instrumentoNombre.replace(/\s+/g, '-').toLowerCase()}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  /**
   * Intercambio fiel entre docentes.
   *
   * El Markdown es cómodo de leer y de pasar por una IA, pero pierde el valor
   * numérico de cada nivel: al reimportarlo hay que adivinarlo. Este formato
   * guarda la rúbrica tal cual, con su escala, para que compartirla entre
   * compañeros no degrade nada. Es un fichero: no pasa por ningún servidor.
   */
  const exportarRubrica = () => {
    const paquete = {
      formato: 'edumind-rubrica',
      version: 1,
      exportado: new Date().toISOString(),
      titulo: rubrica.titulo,
      area: asignaturaNombre,
      nivel,
      contexto: iaContexto || undefined,
      niveles: rubrica.niveles,
      indicadores: rubrica.indicadores,
    }
    const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${instrumentoNombre.replace(/\s+/g, '-').toLowerCase()}.edurubrica.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    setMsg({ tipo: 'ok', texto: 'Rúbrica exportada. Puedes pasársela a quien quieras: es un fichero, no sube a ningún sitio.' })
  }

  const importarRubrica = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const p = JSON.parse(await file.text())
      if (p.formato !== 'edumind-rubrica') throw new Error('El fichero no es una rúbrica de EDUmind.')
      if (!Array.isArray(p.niveles) || !p.niveles.length) throw new Error('La rúbrica no trae niveles.')
      if (!Array.isArray(p.indicadores) || !p.indicadores.length) throw new Error('La rúbrica no trae indicadores.')

      setRubrica(r => ({
        ...r,
        titulo: p.titulo || r.titulo,
        niveles: p.niveles,
        indicadores: p.indicadores,
      }))
      if (p.contexto) setIaContexto(p.contexto)
      const de = p.area && p.area !== asignaturaNombre ? ` (venía de ${p.area})` : ''
      setMsg({
        tipo: 'ok',
        texto: `Rúbrica «${p.titulo}» importada con ${p.indicadores.length} indicadores y ${p.niveles.length} niveles${de}. Revísala y pulsa Guardar.`,
      })
    } catch (err: any) {
      setMsg({ tipo: 'error', texto: err.message || 'No se pudo leer el fichero de rúbrica.' })
    }
  }

  const importarMD = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const texto = await file.text()
    const parsed = parsearRespuestaIA(texto)
    if (!parsed) { setMsg({ tipo: 'error', texto: 'No se pudo leer la rúbrica del fichero. Verifica que tiene formato de tabla markdown.' }); return }
    setRubrica(parsed)
    setMsg({ tipo: 'ok', texto: `Rúbrica importada: "${parsed.titulo}" con ${parsed.indicadores.length} indicadores.` })
    e.target.value = ''
  }

  // ── Generación con IA ──────────────────────────────────────────────────

  const prompt = generarPromptRubrica({
    asignatura: asignaturaNombre, nivel, objetivo: instrumentoNombre,
    contexto: iaContexto, nIndicadores: iaNIndicadores,
  })

  const copiarPrompt = async () => {
    await navigator.clipboard.writeText(prompt)
    setPromptCopiado(true)
    setTimeout(() => setPromptCopiado(false), 2000)
  }

  const cargarRespuesta = () => {
    setIaError('')
    const parsed = parsearRespuestaIA(iaRespuesta)
    if (!parsed) { setIaError('No se encontró una tabla markdown válida. Asegúrate de pegar la respuesta completa.'); return }
    setRubrica(parsed)
    setTab('diseniar')
    setMsg({ tipo: 'ok', texto: `Rúbrica cargada: "${parsed.titulo}". Revísala y guárdala.` })
  }

  const generarConIA = async () => {
    if (!iaContexto.trim()) { setIaError('Describe la situación o criterio a evaluar.'); return }
    setIaError('')
    try {
      const respuesta = await ai.generate(prompt)
      setIaRespuesta(respuesta)
      const parsed = parsearRespuestaIA(respuesta)
      if (parsed) {
        setRubrica(parsed)
        setTab('diseniar')
        setMsg({ tipo: 'ok', texto: `Rúbrica generada con IA: "${parsed.titulo}". Revisa y guarda.` })
      } else {
        setIaError('La IA generó texto pero no tiene formato de tabla. Revisa la respuesta y usa "Cargar respuesta".')
      }
    } catch (e: any) {
      setIaError(e.message || 'Error generando con IA.')
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Rúbrica de ${instrumentoNombre}`}
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }}
      style={{
        // Anidado: se abre desde el gestor de instrumentos, que es otro modal
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 'var(--z-modal-anidado)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '20px 16px', overflowY: 'auto',
      }}>
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 900,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>
        {/* Cabecera */}
        <div style={{ background: 'var(--azul-700)', color: 'white', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, opacity: .8, marginBottom: 2 }}>Rúbrica de evaluación</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{instrumentoNombre}</div>
          </div>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {modo === 'cargando' && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--gris-600)', fontSize: 13 }}>Cargando…</div>
        )}

        {modo === 'elegir' && (
          <PuntoDePartida
            asignaturaNombre={asignaturaNombre}
            nivel={nivel}
            plantillasAbiertas={plantillasAbiertas}
            onPlantillas={() => setPlantillasAbiertas(v => !v)}
            onIA={empezarConIA}
            onPlantilla={empezarDesdePlantilla}
            onBlanco={empezarEnBlanco}
          />
        )}

        {modo === 'editar' && (<>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--gris-200)', background: 'var(--gris-50)' }}>
          {(['diseniar', 'ia'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              borderBottom: tab === t ? '2px solid var(--azul-700)' : '2px solid transparent',
              background: 'transparent',
              color: tab === t ? 'var(--azul-700)' : 'var(--gris-600)',
            }}>
              {t === 'diseniar' ? '✏️ Diseñar rúbrica' : '🤖 Generar con IA'}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          {msg && (
            <div style={{
              marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: msg.tipo === 'ok' ? '#dcfce7' : '#fee2e2',
              color: msg.tipo === 'ok' ? '#166534' : '#991b1b',
            }}>
              {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
            </div>
          )}

          {/* ── TAB: DISEÑAR ── */}
          {tab === 'diseniar' && (
            <>
              {/* Título */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--gris-700)' }}>Título de la rúbrica</label>
                <input
                  value={rubrica.titulo}
                  onChange={e => setTitulo(e.target.value)}
                  style={{ width: '100%', fontSize: 15, fontWeight: 600 }}
                  placeholder="Título de la rúbrica"
                />
              </div>

              {/* Tabla de indicadores */}
              <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ background: 'var(--azul-700)', color: 'white', padding: '8px 10px', textAlign: 'left', minWidth: 160, borderRadius: '4px 0 0 0' }}>
                        Indicador
                      </th>
                      {rubrica.niveles.map((n, ni) => (
                        <th key={ni} style={{
                          background: ni === 0 ? '#166534' : ni === 1 ? '#15803d' : ni === 2 ? '#16a34a' : '#dc2626',
                          color: 'white', padding: '8px 10px', textAlign: 'center', minWidth: 140,
                          borderRadius: ni === rubrica.niveles.length - 1 ? '0 4px 0 0' : 0,
                        }}>
                          <div style={{ fontWeight: 700 }}>{n.nombre}</div>
                          <div style={{ fontSize: 10, opacity: .85 }}>({n.valor} pts)</div>
                        </th>
                      ))}
                      <th style={{ background: 'var(--gris-200)', width: 36 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rubrica.indicadores.map((ind, ii) => (
                      <tr key={ii} style={{ background: ii % 2 === 0 ? 'white' : '#f8fafc' }}>
                        <td style={{ padding: 6, borderRight: '1px solid var(--gris-200)', verticalAlign: 'top' }}>
                          <textarea
                            value={ind.nombre}
                            onChange={e => setIndicadorNombre(ii, e.target.value)}
                            rows={2}
                            style={{ width: '100%', fontSize: 12, fontWeight: 600, resize: 'vertical', border: '1px solid var(--gris-300)', borderRadius: 4, padding: 4 }}
                            placeholder={`Indicador ${ii + 1}`}
                          />
                        </td>
                        {rubrica.niveles.map((n, ni) => (
                          <td key={ni} style={{ padding: 6, borderRight: '1px solid var(--gris-200)', verticalAlign: 'top' }}>
                            <textarea
                              value={ind.descriptores[n.nombre] || ''}
                              onChange={e => setDescriptor(ii, n.nombre, e.target.value)}
                              rows={3}
                              style={{ width: '100%', fontSize: 11, resize: 'vertical', border: '1px solid var(--gris-300)', borderRadius: 4, padding: 4 }}
                              placeholder="Describe el nivel de desempeño…"
                            />
                          </td>
                        ))}
                        <td style={{ padding: 4, textAlign: 'center', verticalAlign: 'top' }}>
                          <button onClick={() => removeIndicador(ii)}
                            title="Eliminar indicador"
                            style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={addIndicador}>
                  + Añadir indicador
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn-secondary" style={{ fontSize: 12 }}
                  onClick={() => importRubricaRef.current?.click()}
                  title="Cargar una rúbrica compartida por otro docente (.edurubrica.json)">
                  📥 Importar rúbrica
                </button>
                <input ref={importRubricaRef} type="file" accept=".json,.edurubrica.json"
                  style={{ display: 'none' }} onChange={importarRubrica} />
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={exportarRubrica}
                  disabled={rubrica.indicadores.length === 0}
                  title="Guardar la rúbrica en un fichero para compartirla con otro docente">
                  📤 Compartir rúbrica
                </button>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => importRef.current?.click()} title="Importar desde archivo .md">
                  ⬆ Importar .md
                </button>
                <input ref={importRef} type="file" accept=".md,.txt" style={{ display: 'none' }} onChange={importarMD} />
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={exportarMD} disabled={rubrica.indicadores.length === 0}>
                  ⬇ Exportar .md
                </button>
                {tieneDatos && (
                  <button onClick={borrar}
                    style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', fontWeight: 600 }}>
                    Eliminar rúbrica
                  </button>
                )}
                <button className="btn-primary" style={{ fontSize: 13, padding: '7px 18px' }} onClick={() => guardar(false)} disabled={guardando}>
                  {guardando ? 'Guardando…' : '💾 Guardar rúbrica'}
                </button>
              </div>
            </>
          )}

          {/* ── TAB: IA ── */}
          {tab === 'ia' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Situación de Aprendizaje, Unidad Didáctica o criterio a evaluar *
                  </label>
                  <textarea
                    value={iaContexto}
                    onChange={e => setIaContexto(e.target.value)}
                    rows={4}
                    style={{ width: '100%', fontSize: 13, resize: 'vertical' }}
                    placeholder="Describe lo que quieres evaluar. Ejemplo: 'SA 3 — Juegos populares y tradicionales gallegos. El alumno diseña y presenta un juego de su comunidad, argumentando sus reglas...'"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>N.º indicadores</label>
                  <select value={iaNIndicadores} onChange={e => setIaNIndicadores(Number(e.target.value))} style={{ width: '100%' }}>
                    {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {/* Botones de generación */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn-secondary" style={{ fontSize: 13 }} onClick={copiarPrompt} disabled={!iaContexto.trim()}>
                  {promptCopiado ? '✅ Copiado' : '📋 Copiar prompt'}
                </button>
                <span style={{ fontSize: 12, color: 'var(--gris-500)' }}>→ pega en ChatGPT, Claude o Gemini</span>
                {hasWebGPU() && (
                  <>
                    <div style={{ flex: 1 }} />
                    {ai.isReady ? (
                      <button className="btn-primary" style={{ fontSize: 13 }} onClick={generarConIA}
                        disabled={!iaContexto.trim() || ai.status === 'generando'}>
                        {ai.status === 'generando' ? '⚡ Generando…' : '⚡ Generar con IA local'}
                      </button>
                    ) : (
                      <button className="btn-primary" style={{ fontSize: 13, background: '#166534' }}
                        onClick={ai.cargarModelo}
                        disabled={ai.status === 'descargando' || ai.status === 'cargando'}>
                        {ai.status === 'descargando' && `⬇ Descargando Phi-3.5 (${ai.progress}%)`}
                        {ai.status === 'cargando' && '⏳ Cargando modelo…'}
                        {ai.status === 'idle' && '⬇ Descargar IA local (Phi-3.5 · ~2GB)'}
                        {ai.status === 'error' && 'Error — reintentar'}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* El motivo real del fallo. `useLocalAI` lo exponía en `error`
                  y nadie lo leía: el botón se limitaba a poner «Error —
                  reintentar» y el docente no sabía si era su navegador, la
                  red o el servidor. */}
              {ai.status === 'error' && ai.error && (
                <div style={{ padding: '10px 14px', background: 'var(--rojo-100)', borderRadius: 8, fontSize: 12, color: '#991b1b', border: '1px solid var(--rojo-500)' }}>
                  <strong>No se pudo cargar el modelo.</strong> {ai.error}
                  <div style={{ marginTop: 4, color: 'var(--gris-600)' }}>
                    Puedes seguir copiando el prompt y pegándolo en una IA externa: el
                    resultado se pega abajo igual.
                  </div>
                </div>
              )}

              {!hasWebGPU() && (
                <div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                  ⚠️ Tu navegador no soporta IA local (requiere Chrome o Edge con WebGPU). Copia el prompt y pégalo en cualquier IA externa.
                </div>
              )}

              {/* Información sobre el modelo */}
              {hasWebGPU() && !ai.isReady && ai.status === 'idle' && (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#166534', border: '1px solid #bbf7d0' }}>
                  ℹ️ <strong>Phi-3.5-mini</strong> de Microsoft — se descarga una vez (~2 GB) desde
                  Hugging Face y queda guardado en tu navegador. A partir de ahí genera rúbricas sin
                  conexión y sin pasar por ningún servidor: ni el texto que escribes ni la rúbrica
                  salen de este equipo. Solo en Chrome o Edge de escritorio; en el iPad no hay WebGPU.
                </div>
              )}

              {/* Área para pegar respuesta externa */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Pegar respuesta de la IA (markdown con tabla)
                </label>
                <textarea
                  value={iaRespuesta}
                  onChange={e => setIaRespuesta(e.target.value)}
                  rows={8}
                  style={{ width: '100%', fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
                  placeholder={`Pega aquí la respuesta de ChatGPT, Claude o Gemini. La tabla debe tener este formato:\n\n| Indicador | Excelente (4) | Notable (3) | Bien (2) | Insuficiente (1) |\n|---|---|---|---|---|\n| Indicador 1 | Descriptor... | ...`}
                />
              </div>

              {iaError && (
                <div style={{ padding: '8px 12px', background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                  ❌ {iaError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-primary" onClick={cargarRespuesta} disabled={!iaRespuesta.trim()}>
                  📥 Cargar en editor
                </button>
                <span style={{ fontSize: 12, color: 'var(--gris-500)', alignSelf: 'center' }}>
                  Parsea la tabla markdown y abre el editor para revisar y guardar
                </span>
              </div>
            </div>
          )}
        </div>
        </>)}
      </div>
    </div>
  )
}

/**
 * Punto de partida de una rúbrica nueva.
 *
 * El docente elige de dónde arranca en vez de encontrarse una tabla vacía.
 * El contexto (área y nivel) se enseña aquí porque es lo que la app va a
 * meter sola en el prompt: así se ve antes de generar nada.
 */
function PuntoDePartida({ asignaturaNombre, nivel, plantillasAbiertas, onPlantillas, onIA, onPlantilla, onBlanco }: {
  asignaturaNombre: string
  nivel: string
  plantillasAbiertas: boolean
  onPlantillas: () => void
  onIA: () => void
  onPlantilla: (id: string) => void
  onBlanco: () => void
}) {
  return (
    <div style={{ padding: 24 }}>
      <p style={{ fontSize: 13.5, color: 'var(--gris-600)', lineHeight: 1.6, marginBottom: 4 }}>
        Esta rúbrica todavía está vacía. Elige por dónde empezar:
      </p>
      <div style={{ fontSize: 12, color: 'var(--gris-500)', marginBottom: 18 }}>
        Contexto que se usará: <strong>{asignaturaNombre}</strong> · <strong>{nivel}</strong>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: plantillasAbiertas ? 14 : 0 }}>
        <BotonPartida
          icono="🤖" titulo="Generar con IA" recomendado
          texto="Describes qué quieres evaluar y la IA propone los indicadores y sus cuatro niveles. El área y el curso van solos en la petición."
          onClick={onIA}
        />
        <BotonPartida
          icono="📋" titulo="Partir de una plantilla"
          texto="Cuaderno, exposición oral, trabajo en equipo o producción práctica. Vienen rellenas y se ajustan."
          onClick={onPlantillas}
        />
        <BotonPartida
          icono="✏️" titulo="Empezar en blanco"
          texto="Escribes tú los indicadores y los descriptores, uno a uno."
          onClick={onBlanco}
        />
      </div>

      {plantillasAbiertas && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          {PLANTILLAS_RUBRICA.map(pl => (
            <button key={pl.id} onClick={() => onPlantilla(pl.id)}
              style={{
                textAlign: 'left', background: 'white', border: '1px solid var(--gris-300)',
                borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
              }}>
              <div style={{ fontSize: 20, marginBottom: 4 }} aria-hidden="true">{pl.icono}</div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--azul-900)' }}>{pl.nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--gris-600)', marginTop: 3, lineHeight: 1.5 }}>{pl.descripcion}</div>
              <div style={{ fontSize: 11, color: 'var(--gris-500)', marginTop: 6 }}>
                {pl.filas.length} indicadores · 4 niveles
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BotonPartida({ icono, titulo, texto, recomendado, onClick }: {
  icono: string; titulo: string; texto: string; recomendado?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14, textAlign: 'left',
        background: 'white', border: `1px solid ${recomendado ? 'var(--azul-300)' : 'var(--gris-300)'}`,
        borderRadius: 10, padding: '14px 16px', cursor: 'pointer', width: '100%',
      }}>
      <span style={{ fontSize: 22, lineHeight: 1.1 }} aria-hidden="true">{icono}</span>
      <span>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5, color: 'var(--azul-900)' }}>
          {titulo}
          {recomendado && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--azul-500)' }}>recomendado</span>
          )}
        </span>
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--gris-600)', marginTop: 3, lineHeight: 1.55 }}>
          {texto}
        </span>
      </span>
    </button>
  )
}
