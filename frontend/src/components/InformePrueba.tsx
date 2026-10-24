/**
 * El informe de una prueba corregida: la lectura a la vista y el documento
 * Lámina para imprimir o guardar.
 *
 * Se abre desde la cabecera de la columna del examen y desde la lista de
 * «Evaluar con QR y cámara». Todo se calcula en el aparato
 * (`db/informePrueba.ts`) con las respuestas que ya guarda cada nota; no
 * sale nada del dispositivo. El documento va por `imprimir` (iframe en web,
 * plugin Impresora en nativo) y por `descargarHTML`, como los demás informes.
 */
import { useEffect, useState } from 'react'
import { getPrueba, respuestasDeExamen } from '@/db/queries'
import { informeDePrueba, radialSVG, type InformePrueba as Informe } from '@/db/informePrueba'
import type { PruebaDef } from '@/db/prueba'
import { documentoInformePrueba } from '@/informes/informePrueba'
import { imprimir, descargarHTML } from '@/informes/lamina'

interface Props {
  instrumentoId: number
  instrumentoNombre: string
  unidadId: number | null
  unidadNombre?: string | null
  /** Criterios que el instrumento evalúa aquí, con su descripción si se tiene. */
  criterios: { id: string; descripcion: string }[]
  grupoNombre: string
  areaNombre: string
  onCerrar: () => void
}

export default function InformePrueba({ instrumentoId, instrumentoNombre, unidadId, unidadNombre, criterios, grupoNombre, areaNombre, onCerrar }: Props) {
  const [def, setDef] = useState<PruebaDef | null>(null)
  const [informe, setInforme] = useState<Informe | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      const prueba = await getPrueba(instrumentoId, unidadId)
      if (!prueba) { if (vigente) setError(`«${instrumentoNombre}» no tiene examen definido${unidadNombre ? ` en ${unidadNombre}` : ''}.`); return }
      const respuestas = await respuestasDeExamen(instrumentoId, prueba.unidad_id, prueba.def)
      if (!vigente) return
      setDef(prueba.def)
      setInforme(informeDePrueba(prueba.def, respuestas, criterios.map(c => c.id)))
    })().catch(() => { if (vigente) setError('No se pudo preparar el informe.') })
    return () => { vigente = false }
  }, [instrumentoId, unidadId, instrumentoNombre, unidadNombre, criterios])

  const ctx = { grupo: grupoNombre, area: areaNombre, unidad: unidadNombre, descripciones: new Map(criterios.map(c => [c.id, c.descripcion])) }
  const nombreFichero = `informe-${(def?.titulo ?? instrumentoNombre).replace(/\s+/g, '-').toLowerCase()}.html`

  const aImprimir = async () => {
    if (!def || !informe) return
    setOcupado(true)
    try {
      const hecho = await imprimir(documentoInformePrueba(informe, def, ctx), nombreFichero.replace(/\.html$/, ''))
      setMsg(hecho ? 'Informe enviado a imprimir.' : 'No se ha imprimido nada: la vista previa se cerró sin imprimir ni compartir.')
    }
    catch { setMsg('No se pudo imprimir.') }
    finally { setOcupado(false) }
  }
  const aGuardar = async () => {
    if (!def || !informe) return
    setOcupado(true)
    try { await descargarHTML(documentoInformePrueba(informe, def, ctx), nombreFichero); setMsg('Informe guardado como .html (se abre en cualquier navegador).') }
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
          {informe && def && (
            <>
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
          <button className="btn-primary" data-informe-imprimir onClick={aImprimir} disabled={!informe || ocupado} style={{ fontSize: 13 }}>🖨 Imprimir</button>
          <button className="btn-secondary" data-informe-guardar onClick={aGuardar} disabled={!informe || ocupado} style={{ fontSize: 13 }}>⬇ Guardar .html</button>
          <div style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={onCerrar} style={{ fontSize: 13 }}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
