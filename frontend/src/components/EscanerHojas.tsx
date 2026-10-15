/**
 * Corregir un test por cámara: la pila de hojas de respuestas, una tras otra.
 *
 * La cámara mira hasta que encuentra una hoja con su QR; entonces se congela
 * la foto, se pinta encima lo leído (verde acierto, rojo fallo, ámbar duda)
 * y se enseña la lista pregunta a pregunta para corregir con el dedo lo que
 * el escáner no ha visto claro. «Guardar» pasa por `guardarExamenDeAlumno`,
 * exactamente igual que corregir a mano: la nota y el reparto por criterios
 * salen por el mismo camino. Después vuelve la cámara para la siguiente hoja.
 *
 * Sin cámara —o si va mejor así— se puede elegir una foto de la galería.
 * Nada sale del aparato.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { getPrueba, guardarExamenDeAlumno, type CeldaInstrumento, type DatosDeArea, type PruebaGuardada } from '@/db/queries'
import { tieneClave, respuestaDeMarca, notaDePrueba, LETRAS, type PruebaDef } from '@/db/prueba'
import { aGris, leerHoja, aplicar, type LecturaHoja, type Homografia } from '@/utils/lectorHoja'
import { centroBurbuja, BURBUJA } from '@/db/hojaOMR'
import { sePuedeEscanear } from '@/utils/lectorQR'
import { calificativo } from '@/db/calculo'
import type { Alumno } from '@/db/localDb'

interface Props {
  instrumento: CeldaInstrumento
  unidadId: number | null
  unidadNombre?: string
  trimestre: number
  alumnos: Alumno[]
  /** Criterios que el instrumento evalúa en lo que se está viendo. */
  criterios: { id: string; descripcion: string }[]
  area: DatosDeArea
  onGuardado: () => void
  onCerrar: () => void
}

/** Lado mayor del fotograma que se analiza: con 1600 px una burbuja de 5 mm son unos 25 px. */
const LADO = 1600

type Capturada = {
  lectura: LecturaHoja
  alumno: Alumno | null
  /** La foto congelada, para pintar encima. */
  imagen: ImageData
  /** pregunta → opción elegida (editable por el docente). */
  marcadas: (number | null)[]
}

export default function EscanerHojas({ instrumento, unidadId, unidadNombre, trimestre, alumnos, criterios, area, onGuardado, onCerrar }: Props) {
  const [prueba, setPrueba] = useState<PruebaGuardada | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [capturada, setCapturada] = useState<Capturada | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [corregidos, setCorregidos] = useState<{ alumno: Alumno; nota: number | null }[]>([])
  const [camaraActiva, setCamaraActiva] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const lienzoRef = useRef<HTMLCanvasElement>(null)
  const vistaRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const relojRef = useRef<number | null>(null)
  const ocupadoRef = useRef(false)
  const capturadaRef = useRef<Capturada | null>(null)
  const ficheroRef = useRef<HTMLInputElement>(null)
  capturadaRef.current = capturada

  useEffect(() => {
    let vigente = true
    getPrueba(instrumento.instrumento_id, unidadId).then(p => { if (vigente) setPrueba(p) })
    return () => { vigente = false }
  }, [instrumento.instrumento_id, unidadId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const def = prueba?.def
  const listo = !!def && tieneClave(def)
  const nOpciones = def ? Math.max(0, ...def.preguntas.map(p => p.opciones?.length ?? 0)) : 0

  // ── Cámara ────────────────────────────────────────────────────────────

  const parar = () => {
    if (relojRef.current) { clearInterval(relojRef.current); relojRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCamaraActiva(false)
  }

  const arrancar = async () => {
    if (!sePuedeEscanear()) { setError('Este aparato no tiene cámara disponible. Elige una foto de la galería.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      void video.play().catch(() => { /* el bucle espera datos */ })
      setCamaraActiva(true)
      setError(null)
      relojRef.current = window.setInterval(() => {
        if (ocupadoRef.current || capturadaRef.current) return
        const v = videoRef.current
        if (!v || v.readyState < 2 || !v.videoWidth) return
        ocupadoRef.current = true
        try { analizar(v, v.videoWidth, v.videoHeight) } finally { ocupadoRef.current = false }
      }, 700)
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en los ajustes del navegador, o elige una foto.' : 'No se pudo abrir la cámara. Elige una foto de la galería.')
    }
  }

  useEffect(() => {
    if (listo) void arrancar()
    return parar
    // Una sola vez cuando el examen está: rearrancar la cámara en cada render parpadea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo])

  /** Pinta la fuente reducida en el lienzo oculto y la lee. Devuelve si había hoja de este examen. */
  const analizar = (fuente: CanvasImageSource, ancho: number, alto: number): boolean => {
    if (!def || !prueba) return false
    const lienzo = lienzoRef.current
    const ctx = lienzo?.getContext('2d', { willReadFrequently: true })
    if (!lienzo || !ctx) return false
    const escala = Math.min(1, LADO / Math.max(ancho, alto))
    const w = Math.round(ancho * escala), h = Math.round(alto * escala)
    if (lienzo.width !== w || lienzo.height !== h) { lienzo.width = w; lienzo.height = h }
    ctx.drawImage(fuente, 0, 0, w, h)
    const imagen = ctx.getImageData(0, 0, w, h)
    const r = leerHoja(aGris(imagen.data, w, h))
    if (r.estado === 'sin-marcas') { setAviso('Buscando la hoja: que se vean las cuatro esquinas.'); return false }
    if (r.estado === 'sin-qr') { setAviso('Veo la hoja pero no leo el código: acércate o evita el brillo.'); return false }
    const { lectura } = r
    if (lectura.payload.prueba_id !== prueba.id) {
      setAviso(`Esta hoja es de otro examen (código ${lectura.payload.prueba_id}), no de «${def.titulo}».`)
      return false
    }
    const alumno = alumnos.find(a => a.id === lectura.payload.alumno_id) ?? null
    setAviso(null)
    if ('vibrate' in navigator) navigator.vibrate?.(60)
    setCapturada({ lectura, alumno, imagen, marcadas: lectura.preguntas.map(q => q.marcada) })
    return true
  }

  const deFichero = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const bmp = await createImageBitmap(f)
      const habia = analizar(bmp, bmp.width, bmp.height)
      bmp.close()
      setError(habia ? null : 'En esa foto no se encuentra una hoja de este examen con sus cuatro esquinas y su código.')
    } catch { setError('No se pudo leer la imagen.') }
  }

  // ── La foto congelada con lo leído encima ─────────────────────────────

  useEffect(() => {
    const c = vistaRef.current
    if (!c || !capturada || !def) return
    const { imagen, lectura, marcadas } = capturada
    c.width = imagen.width; c.height = imagen.height
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.putImageData(imagen, 0, 0)
    const px = escalaDe(lectura.H)
    ctx.lineWidth = Math.max(2, px * 0.6)
    for (const q of lectura.preguntas) {
      const p = def.preguntas[q.pregunta]
      if (!p) continue
      for (let j = 0; j < (lectura.payload.nOpciones); j++) {
        const c0 = centroBurbuja(q.pregunta, j)
        const centro = aplicar(lectura.H, { x: c0.cx, y: c0.cy })
        const elegida = marcadas[q.pregunta] === j
        const correcta = p.correcta === j
        if (!elegida && !correcta) continue
        ctx.beginPath()
        ctx.arc(centro.x, centro.y, px * BURBUJA.diametro * 0.75, 0, Math.PI * 2)
        ctx.strokeStyle = elegida ? (q.dudosa ? '#d97706' : correcta ? '#16a34a' : '#dc2626') : '#16a34a'
        if (!elegida && correcta) ctx.setLineDash([px, px]); else ctx.setLineDash([])
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = Math.max(2, px * 0.4)
    for (const m of lectura.marcas) ctx.strokeRect(m.x - px * 5, m.y - px * 5, px * 10, px * 10)
  }, [capturada, def])

  const respuestas = useMemo(() => {
    if (!capturada || !def) return {}
    const r: Record<string, number> = {}
    def.preguntas.forEach((p, i) => { r[p.id] = respuestaDeMarca(p, capturada.marcadas[i]) })
    return r
  }, [capturada, def])
  const resultado = useMemo(() => def ? notaDePrueba(def, respuestas, criterios.map(c => c.id)) : null, [def, respuestas, criterios])

  const elegir = (i: number, j: number | null) => setCapturada(c => c && { ...c, marcadas: c.marcadas.map((m, k) => k === i ? (m === j ? null : j) : m) })

  const guardar = async () => {
    if (!capturada || !def || !capturada.alumno) return
    setGuardando(true); setError(null)
    try {
      const r = await guardarExamenDeAlumno({
        alumno_id: capturada.alumno.id!, instrumento_id: instrumento.instrumento_id, trimestre, unidad_id: unidadId,
        def, respuestas, destinos: criterios.map(c => c.id), area,
      })
      setCorregidos(l => [...l.filter(x => x.alumno.id !== capturada.alumno!.id), { alumno: capturada.alumno!, nota: r.nota }])
      setCapturada(null)
      onGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la corrección.')
    } finally { setGuardando(false) }
  }

  const dudosas = capturada?.lectura.preguntas.filter(q => q.dudosa).length ?? 0
  const faltan = alumnos.filter(a => !corregidos.some(c => c.alumno.id === a.id))

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Corregir por cámara: ${instrumento.nombre}`}
        style={{ width: 'min(980px, 96vw)', maxHeight: '94vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)', borderTop: `4px solid ${instrumento.color}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--azul-900)' }}>📷 Corregir por cámara{def ? ` · ${def.titulo}` : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>
              {instrumento.nombre} · {trimestre}º trim.{unidadNombre ? ` · ${unidadNombre}` : ''} · <span data-escaner-progreso>{corregidos.length} de {alumnos.length} corregidos</span>
            </div>
          </div>
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar">✕</button>
        </div>

        <div style={{ padding: '12px 18px 18px' }}>
          {prueba === null && <div style={{ padding: '10px 13px', borderRadius: 8, fontSize: 13, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>Este instrumento no tiene examen definido{unidadNombre ? ` para «${unidadNombre}»` : ''}.</div>}
          {def && !listo && <div style={{ padding: '10px 13px', borderRadius: 8, fontSize: 13, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>«{def.titulo}» no es un test con clave completa: no hay con qué corregir las hojas.</div>}
          {error && <div style={{ color: 'var(--rojo-500)', fontSize: 13, marginBottom: 8 }}>❌ {error}</div>}

          <canvas ref={lienzoRef} style={{ display: 'none' }} />
          <input ref={ficheroRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={deFichero} data-escaner-fichero />

          {listo && !capturada && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 14 }}>
              <div>
                <div style={{ position: 'relative', background: '#000', borderRadius: 10, overflow: 'hidden', minHeight: 240 }}>
                  <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block', maxHeight: '60vh', objectFit: 'contain' }} />
                  <div data-escaner-aviso style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 12px', background: 'rgba(0,0,0,.55)', color: 'white', fontSize: 13 }}>
                    {camaraActiva ? (aviso ?? 'Encuadra la hoja entera, con las cuatro esquinas negras.') : 'Cámara apagada.'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button className="btn-secondary" style={{ fontSize: 12.5 }} onClick={() => ficheroRef.current?.click()}>🖼 Elegir una foto</button>
                  {!camaraActiva && <button className="btn-secondary" style={{ fontSize: 12.5 }} onClick={arrancar}>📷 Encender la cámara</button>}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: 'var(--gris-900)', marginBottom: 4 }}>Faltan {faltan.length}</div>
                <div data-escaner-faltan style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {faltan.map(a => <div key={a.id}>{a.apellidos}, {a.nombre}</div>)}
                </div>
                {corregidos.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 700, color: 'var(--gris-900)', marginBottom: 4 }}>Corregidos</div>
                    {corregidos.slice(-6).reverse().map(c => (
                      <div key={c.alumno.id}>{c.alumno.apellidos}, {c.alumno.nombre} → <strong style={{ color: calificativo(c.nota).color }}>{c.nota ?? '—'}</strong></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {listo && capturada && def && resultado && (
            <div data-escaner-capturada style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 340px)', gap: 14 }}>
              <div>
                <canvas ref={vistaRef} style={{ width: '100%', borderRadius: 10, display: 'block', background: '#000' }} />
                <div style={{ fontSize: 11.5, color: 'var(--gris-500)', marginTop: 4 }}>Verde: acierto · rojo: fallo · ámbar: duda · verde discontinuo: la correcta sin marcar.</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: capturada.alumno ? 'var(--azul-900)' : 'var(--rojo-500)' }} data-escaner-alumno>
                  {capturada.alumno ? `${capturada.alumno.apellidos}, ${capturada.alumno.nombre}` : `Alumno ${capturada.lectura.payload.alumno_id} no está en esta clase`}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div data-escaner-nota style={{ width: 54, height: 54, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: 'white', background: calificativo(resultado.nota).color }}>
                    {resultado.nota ?? '—'}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.4 }}>
                    {resultado.obtenido} / {resultado.maximo} puntos
                    {dudosas > 0 && <div style={{ color: '#92400e', fontWeight: 700 }}>⚠ {dudosas} pregunta{dudosas !== 1 ? 's' : ''} dudosa{dudosas !== 1 ? 's' : ''}: revísala{dudosas !== 1 ? 's' : ''}</div>}
                  </div>
                </div>
                <div style={{ maxHeight: '42vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {def.preguntas.map((p, i) => {
                    const q = capturada.lectura.preguntas[i]
                    const m = capturada.marcadas[i]
                    const acierto = m != null && m === p.correcta
                    return (
                      <div key={p.id} data-escaner-pregunta={i + 1} data-dudosa={q?.dudosa || undefined} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 6, background: q?.dudosa ? '#fffbeb' : m == null ? 'transparent' : acierto ? 'var(--verde-100)' : 'var(--rojo-100)' }}>
                        <span style={{ width: 24, fontSize: 12, fontWeight: 700, color: 'var(--gris-600)', textAlign: 'right' }}>{i + 1}</span>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {Array.from({ length: nOpciones }, (_, j) => (
                            <button key={j} type="button" aria-pressed={m === j} onClick={() => elegir(i, j)}
                              title={`${LETRAS[j]}: ${p.opciones?.[j] ?? ''}${p.correcta === j ? ' (correcta)' : ''}`}
                              style={{ width: 28, height: 26, borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                                border: `2px solid ${p.correcta === j ? '#16a34a' : 'transparent'}`,
                                background: m === j ? (acierto ? '#16a34a' : '#dc2626') : 'white', color: m === j ? 'white' : 'var(--gris-900)' }}>
                              {LETRAS[j]}
                            </button>
                          ))}
                        </div>
                        <span style={{ fontSize: 10.5, color: 'var(--gris-500)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                          {m == null ? 'en blanco' : acierto ? '✓' : '✗'}{q?.dudosa ? ' · duda' : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className="btn-secondary" style={{ fontSize: 12.5 }} onClick={() => setCapturada(null)} disabled={guardando}>↺ Repetir</button>
                  <div style={{ flex: 1 }} />
                  <button className="btn-primary" data-escaner-guardar style={{ fontSize: 13 }} onClick={guardar} disabled={guardando || !capturada.alumno}>
                    {guardando ? 'Guardando…' : '💾 Guardar y siguiente'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Píxeles por milímetro en la foto, a partir de la homografía. */
function escalaDe(H: Homografia): number {
  const a = aplicar(H, { x: 0, y: 0 }), b = aplicar(H, { x: 10, y: 0 })
  return Math.hypot(b.x - a.x, b.y - a.y) / 10
}
