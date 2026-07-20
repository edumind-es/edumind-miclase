import { useEffect, useRef, useState } from 'react'
import { getRubrica, guardarRubrica, eliminarRubrica } from '@/db/queries'
import {
  parsearRespuestaIA, generarPromptRubrica, rubricaToMarkdown,
  rubricaVacia, NIVELES_DEFAULT,
  type RubricaParsed, type RubricaIndicador, type RubricaNivel,
} from '@/ia/rubricaPrompt'
import { useLocalAI, hasWebGPU } from '@/ia/useLocalAI'

interface Props {
  instrumentoId: number
  instrumentoNombre: string
  asignaturaNombre: string
  nivel: string  // e.g. "6º Primaria"
  onCerrar: () => void
}

type Tab = 'diseniar' | 'ia'

export default function RubricaEditor({ instrumentoId, instrumentoNombre, asignaturaNombre, nivel, onCerrar }: Props) {
  const [tab, setTab] = useState<Tab>('diseniar')
  const [rubrica, setRubrica] = useState<RubricaParsed>(rubricaVacia(instrumentoNombre))
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [tieneDatos, setTieneDatos] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  // IA
  const ai = useLocalAI()
  const [iaContexto, setIaContexto] = useState('')
  const [iaRespuesta, setIaRespuesta] = useState('')
  const [iaNIndicadores, setIaNIndicadores] = useState(4)
  const [iaError, setIaError] = useState('')
  const [promptCopiado, setPromptCopiado] = useState(false)

  useEffect(() => {
    getRubrica(instrumentoId).then(r => {
      if (r) {
        setTieneDatos(true)
        setRubrica({
          titulo: r.titulo,
          niveles: JSON.parse(r.niveles_json),
          indicadores: JSON.parse(r.indicadores_json),
        })
      }
    })
  }, [instrumentoId])

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

  const prompt = generarPromptRubrica({ asignatura: asignaturaNombre, nivel, contexto: iaContexto, nIndicadores: iaNIndicadores })

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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
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

              {!hasWebGPU() && (
                <div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                  ⚠️ Tu navegador no soporta IA local (requiere Chrome o Edge con WebGPU). Copia el prompt y pégalo en cualquier IA externa.
                </div>
              )}

              {/* Información sobre el modelo */}
              {hasWebGPU() && !ai.isReady && ai.status === 'idle' && (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#166534', border: '1px solid #bbf7d0' }}>
                  ℹ️ <strong>Phi-3.5-mini</strong> de Microsoft — modelo de IA que se descarga una vez (~2GB) y queda guardado en tu navegador. Genera rúbricas sin conexión ni servidor. Solo disponible en Chrome/Edge escritorio.
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
      </div>
    </div>
  )
}
