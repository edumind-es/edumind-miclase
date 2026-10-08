/**
 * Imprimir un test: las hojas de respuestas de la clase (una por alumno, con
 * su QR) y el examen para el alumnado.
 *
 * Se abre desde la columna del examen en el calificador por instrumento. Si
 * el examen no tiene clave completa —opciones y correcta en todas las
 * preguntas— no se imprime nada: una hoja sin clave no se podría corregir, y
 * se dice qué falta en vez de dejar que el docente lo descubra con la pila
 * de hojas ya hecha.
 *
 * Los QR se pintan aquí con `qrcode` y se meten en el documento como data
 * URL; el documento sale por el iframe de impresión de las láminas.
 */
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { getPrueba, type CeldaInstrumento, type PruebaGuardada } from '@/db/queries'
import { tieneClave, preguntasSinClave } from '@/db/prueba'
import { cabeEnHoja, payloadHoja, MAX_PREGUNTAS_HOJA, MAX_OPCIONES_HOJA } from '@/db/hojaOMR'
import { documentoHojasRespuestas, documentoExamen } from '@/informes/hojasTest'
import { imprimir } from '@/informes/lamina'
import type { Alumno } from '@/db/localDb'

interface Props {
  instrumento: CeldaInstrumento
  unidadId: number | null
  unidadNombre?: string
  alumnos: Alumno[]
  grupoNombre: string
  areaNombre: string
  onCerrar: () => void
}

export default function ImprimirTest({ instrumento, unidadId, unidadNombre, alumnos, grupoNombre, areaNombre, onCerrar }: Props) {
  const [prueba, setPrueba] = useState<PruebaGuardada | null | undefined>(undefined)
  const [ocupado, setOcupado] = useState<'hojas' | 'examen' | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

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
  const nOpciones = def ? Math.max(0, ...def.preguntas.map(p => p.opciones?.length ?? 0)) : 0
  const faltan = def ? preguntasSinClave(def) : []
  const conClave = !!def && tieneClave(def)
  const cabe = !!def && cabeEnHoja(def.preguntas.length, nOpciones)
  const ctx = { grupo: grupoNombre, area: areaNombre, unidad: unidadNombre ?? null }

  const imprimirHojas = async () => {
    if (!def || !prueba) return
    setOcupado('hojas'); setMsg(null)
    try {
      const qr = new Map<number, string>()
      for (const a of alumnos) {
        const texto = payloadHoja({ prueba_id: prueba.id, alumno_id: a.id!, nPreguntas: def.preguntas.length, nOpciones })
        // Margen 0: el blanco alrededor ya lo pone la hoja. Corrección M: aguanta una esquina doblada.
        qr.set(a.id!, await QRCode.toDataURL(texto, { errorCorrectionLevel: 'M', margin: 0, width: 400, color: { dark: '#000000', light: '#ffffff' } }))
      }
      await imprimir(documentoHojasRespuestas(def, alumnos.map(a => ({ id: a.id!, nombre: a.nombre, apellidos: a.apellidos })), qr, ctx))
      setMsg({ tipo: 'ok', texto: `${alumnos.length} hoja${alumnos.length !== 1 ? 's' : ''} enviada${alumnos.length !== 1 ? 's' : ''} a imprimir.` })
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudieron preparar las hojas.' })
    } finally { setOcupado(null) }
  }

  const imprimirExamen = async () => {
    if (!def) return
    setOcupado('examen'); setMsg(null)
    try {
      await imprimir(documentoExamen(def, ctx))
      setMsg({ tipo: 'ok', texto: 'Examen enviado a imprimir.' })
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo preparar el examen.' })
    } finally { setOcupado(null) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Imprimir test: ${instrumento.nombre}`}
        style={{ width: 'min(560px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)', borderTop: `4px solid ${instrumento.color}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--azul-900)' }}>🖨 Imprimir {def ? `«${def.titulo}»` : instrumento.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>{grupoNombre} · {areaNombre}{unidadNombre ? ` · ${unidadNombre}` : ''}</div>
          </div>
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar">✕</button>
        </div>

        <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {prueba === undefined && <div style={{ color: 'var(--gris-600)', fontSize: 13 }}>Cargando…</div>}

          {prueba === null && (
            <div data-sin-examen style={{ padding: '10px 13px', borderRadius: 8, fontSize: 13, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', lineHeight: 1.5 }}>
              Este instrumento no tiene examen definido{unidadNombre ? ` para «${unidadNombre}»` : ''}. Defínelo desde la casilla de un alumno (📝 Definir examen) y vuelve aquí.
            </div>
          )}

          {def && def.tipo !== 'test' && (
            <div data-no-test style={{ padding: '10px 13px', borderRadius: 8, fontSize: 13, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', lineHeight: 1.5 }}>
              «{def.titulo}» es un examen de <strong>{def.tipo === 'puntos' ? 'puntos por pregunta' : 'preguntas por niveles'}</strong>. Solo los tests con opciones se imprimen con hoja de respuestas.
            </div>
          )}

          {def && def.tipo === 'test' && !conClave && (
            <div data-sin-clave style={{ padding: '10px 13px', borderRadius: 8, fontSize: 13, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', lineHeight: 1.5 }}>
              <strong>{faltan.length} de {def.preguntas.length} pregunta{def.preguntas.length !== 1 ? 's' : ''}</strong> sin opciones o sin la correcta
              {faltan.length <= 12 ? ` (${faltan.map(i => i + 1).join(', ')})` : ''}. Complétalas en el editor del examen: sin clave, la hoja no se podría corregir.
            </div>
          )}

          {def && def.tipo === 'test' && conClave && !cabe && (
            <div data-no-cabe style={{ padding: '10px 13px', borderRadius: 8, fontSize: 13, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', lineHeight: 1.5 }}>
              La hoja admite hasta {MAX_PREGUNTAS_HOJA} preguntas con {MAX_OPCIONES_HOJA} opciones; este examen tiene {def.preguntas.length} preguntas y {nOpciones} opciones.
            </div>
          )}

          {def && def.tipo === 'test' && conClave && cabe && (
            <>
              <div style={{ fontSize: 13, color: 'var(--gris-900)', lineHeight: 1.5 }}>
                <strong>{def.preguntas.length} preguntas · {nOpciones} opciones · clave completa.</strong>{' '}
                Cada alumno recibe su hoja con nombre y QR; después se corrigen con la cámara.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn-primary" data-imprimir-hojas onClick={imprimirHojas} disabled={ocupado != null || alumnos.length === 0}
                  style={{ fontSize: 14, padding: '12px 16px', textAlign: 'left' }}>
                  {ocupado === 'hojas' ? '⏳ Preparando…' : `🖨 Hojas de respuestas · ${alumnos.length} alumno${alumnos.length !== 1 ? 's' : ''}`}
                  <div style={{ fontSize: 11.5, fontWeight: 400, opacity: .85, marginTop: 2 }}>Una página A4 por alumno, con su nombre y su código.</div>
                </button>
                <button className="btn-secondary" data-imprimir-examen onClick={imprimirExamen} disabled={ocupado != null}
                  style={{ fontSize: 14, padding: '12px 16px', textAlign: 'left' }}>
                  {ocupado === 'examen' ? '⏳ Preparando…' : '📄 Examen para el alumnado'}
                  <div style={{ fontSize: 11.5, fontWeight: 400, opacity: .85, marginTop: 2 }}>Las preguntas con sus opciones, sin la clave. Una copia por alumno, o proyectado.</div>
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--gris-500)', lineHeight: 1.5 }}>
                En el diálogo de impresión, sin escalado («100 %» o «tamaño real») y sin márgenes: las marcas de las esquinas tienen que salir enteras.
              </div>
            </>
          )}

          {msg && (
            <div style={{ padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: msg.tipo === 'ok' ? 'var(--verde-100)' : 'var(--rojo-100)', color: msg.tipo === 'ok' ? 'var(--verde-500)' : 'var(--rojo-500)' }}>
              {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
