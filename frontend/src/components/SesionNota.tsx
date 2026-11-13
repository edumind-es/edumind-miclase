/**
 * Calificar una columna de un tirón, con nota directa.
 *
 * La clase entera en una lista y, por alumno, cinco calificativos con nota
 * fija (IN 3 · SU 5 · BI 6 · NT 7,5 · SB 9,5; decisión de Luis, nov 2026) y
 * una casilla para la nota exacta. Cada pulsación guarda y pasa al
 * siguiente alumno: no se abre ni se cierra nada entre uno y otro. Es lo que
 * abre «Calificar» en un instrumento sin examen ni rúbrica que no es de
 * observación; con examen se abre el corrector y con rúbrica o diario, su
 * pasada de clase.
 *
 * No finge una herramienta: dice que es nota directa y ofrece definirla
 * (`onDefinir`). Guarda como «Pegar columna»: la nota va a todos los
 * criterios que el instrumento evalúa en esta unidad y trimestre, por
 * `saveCalificaciones` con `sinVinculos`. «Deshacer» devuelve a cada
 * criterio lo que tenía antes de la última pulsación.
 */
import { BotonEditarActividad } from './FichaActividad'
import { useEffect, useRef, useState } from 'react'
import { saveCalificaciones, type DatosDeArea, type MatrizEvaluacion } from '@/db/queries'
import { resumenCelda, type ColumnaInstrumento } from './MatrizInstrumentos'
import { calificativo } from '@/db/calculo'
import { claveUnidad } from '@/db/migracionUnidades'
import { verNeae } from '@/db/datosSensibles'
import type { Alumno } from '@/db/localDb'

/** Los cinco calificativos de la escala rápida y la nota que guarda cada uno. */
export const ESCALA_RAPIDA: { sigla: string; etiqueta: string; nota: number }[] = [
  { sigla: 'IN', etiqueta: 'Insuficiente', nota: 3 },
  { sigla: 'SU', etiqueta: 'Suficiente', nota: 5 },
  { sigla: 'BI', etiqueta: 'Bien', nota: 6 },
  { sigla: 'NT', etiqueta: 'Notable', nota: 7.5 },
  { sigla: 'SB', etiqueta: 'Sobresaliente', nota: 9.5 },
]

interface Props {
  columna: ColumnaInstrumento
  matriz: MatrizEvaluacion
  alumnos: Alumno[]
  trimestre: number
  unidadId: number | null
  unidadNombre?: string
  area: DatosDeArea
  /** Se ha guardado algo: la matriz tiene que releerse. */
  onCambio: () => void
  onCerrar: () => void
  /** Elegir herramienta (rúbrica, lista, escala o examen) en vez de la nota directa. */
  onDefinir?: () => void
}

const formato = (n: number | null | undefined) => n == null ? '—' : String(Math.round(n * 10) / 10).replace('.', ',')

type Paso = { alumno: Alumno; previas: Record<string, number | null> }

export default function SesionNota({ columna, matriz, alumnos, trimestre, unidadId, unidadNombre, area, onCambio, onCerrar, onDefinir }: Props) {
  const ins = columna.ins
  /** Lo puesto en esta pantalla, para pintarlo sin esperar a que la matriz se relea. */
  const [puestas, setPuestas] = useState<Record<number, number | null>>({})
  const [exactas, setExactas] = useState<Record<number, string>>({})
  const [actual, setActual] = useState<number | null>(alumnos[0]?.id ?? null)
  const [ultimo, setUltimo] = useState<Paso | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const filas = useRef(new Map<number, HTMLDivElement>())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const notaDe = (al: Alumno): number | null =>
    al.id! in puestas ? puestas[al.id!] : resumenCelda(matriz, al.id!, columna, trimestre).valor
  const conNota = alumnos.filter(al => notaDe(al) != null).length

  const escribir = async (al: Alumno, valores: Record<string, number | null>) => {
    await saveCalificaciones(Object.entries(valores).map(([criterio_id, valor]) => ({
      alumno_id: al.id!, instrumento_id: ins.instrumento_id, criterio_id, ...area,
      trimestre, valor, observacion: null, unidad_id: claveUnidad(unidadId),
    })), { sinVinculos: true })
  }

  /** Pone la nota al alumno en todos los criterios de la columna y pasa al siguiente. */
  const poner = async (al: Alumno, valor: number | null) => {
    if (guardando) return
    setGuardando(true); setAviso(null)
    try {
      const previas = Object.fromEntries(columna.criterios.map(c =>
        [c.id, matriz.calificaciones[`${al.id}:${c.id}:${ins.instrumento_id}:${trimestre}`]?.valor ?? null]))
      // Si ya se le había puesto algo aquí, lo previo es eso, no lo que traía la matriz.
      if (al.id! in puestas) for (const c of columna.criterios) previas[c.id] = puestas[al.id!]
      await escribir(al, Object.fromEntries(columna.criterios.map(c => [c.id, valor])))
      setPuestas(p => ({ ...p, [al.id!]: valor }))
      setExactas(e => { const { [al.id!]: _fuera, ...resto } = e; return resto })
      setUltimo({ alumno: al, previas })
      onCambio()
      if (valor != null) {
        const siguiente = alumnos[alumnos.findIndex(a => a.id === al.id) + 1]
        if (siguiente) {
          setActual(siguiente.id!)
          filas.current.get(siguiente.id!)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }
    } catch (e) {
      setAviso(`No se pudo guardar: ${(e as Error).message}`)
    } finally {
      setGuardando(false)
    }
  }

  const deshacer = async () => {
    if (!ultimo || guardando) return
    setGuardando(true)
    try {
      await escribir(ultimo.alumno, ultimo.previas)
      const valores = Object.values(ultimo.previas).filter((v): v is number => v != null)
      const media = valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null
      setPuestas(p => ({ ...p, [ultimo.alumno.id!]: media }))
      setActual(ultimo.alumno.id!)
      setAviso(`Deshecho: ${ultimo.alumno.apellidos}, ${ultimo.alumno.nombre} vuelve a ${media == null ? 'estar sin nota' : formato(media)}.`)
      setUltimo(null)
      onCambio()
    } catch (e) {
      setAviso(`No se pudo deshacer: ${(e as Error).message}`)
    } finally {
      setGuardando(false)
    }
  }

  const confirmarExacta = (al: Alumno) => {
    const texto = exactas[al.id!]
    if (texto === undefined) return
    const limpio = texto.trim().replace(',', '.')
    if (limpio === '') { setExactas(e => { const { [al.id!]: _f, ...r } = e; return r }); return }
    const n = Number(limpio)
    if (!Number.isFinite(n) || n < 0 || n > 10) { setAviso('La nota exacta va de 0 a 10.'); return }
    poner(al, Math.round(n * 100) / 100)
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Calificar: ${ins.nombre}`} data-nota-directa
        style={{ width: 'min(760px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--gris-300)', borderLeft: `6px solid ${ins.color}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--azul-900)' }}>{ins.nombre}</h2>
              <div style={{ fontSize: 12.5, color: 'var(--gris-600)', marginTop: 2 }}>
                {unidadNombre ? `${unidadNombre} · ` : ''}{trimestre}º trimestre · la nota va a {columna.criterios.length === 1
                  ? <>su criterio</> : <>sus <strong>{columna.criterios.length} criterios</strong></>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <BotonEditarActividad instrumento={ins} criterios={columna.criterios} unidadNombre={unidadNombre} area={area} onCambio={onCambio} onHerramienta={() => { onCambio(); onCerrar() }} />
              <button className="modal-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
            </div>
          </div>
          <div data-sin-herramienta style={{ fontSize: 12.5, color: 'var(--gris-600)', marginTop: 6 }}>
            Nota directa, sin examen ni rúbrica: IN 3 · SU 5 · BI 6 · NT 7,5 · SB 9,5, o la nota exacta.
            {onDefinir && <>{' '}
              <button type="button" data-herramienta-definir onClick={onDefinir}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--azul-500)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
                Definir una herramienta
              </button></>}
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '6px 18px', flex: 1 }}>
          {alumnos.map(al => {
            const v = notaDe(al)
            const esActual = al.id === actual
            return (
              <div key={al.id} ref={el => { if (el) filas.current.set(al.id!, el); else filas.current.delete(al.id!) }}
                data-fila-nota={al.id} data-actual={esActual || undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '7px 8px',
                  borderBottom: '1px solid var(--gris-300)', outline: esActual ? '2px solid var(--azul-700)' : 'none', outlineOffset: -2, borderRadius: 6,
                }}>
                <div style={{ flex: '1 1 170px', minWidth: 0, fontSize: 14, fontWeight: esActual ? 700 : 500 }}>
                  {al.apellidos}, {al.nombre}
                  {al.neae && verNeae() ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
                </div>
                <div role="group" aria-label={`Nota de ${al.apellidos}, ${al.nombre}`} style={{ display: 'flex', gap: 5 }}>
                  {ESCALA_RAPIDA.map(e => {
                    const marcado = v === e.nota
                    return (
                      <button key={e.sigla} type="button" data-calificativo={e.sigla} aria-pressed={marcado} disabled={guardando}
                        title={`${e.etiqueta}: guarda un ${formato(e.nota)}${marcado ? ' (pulsa otra vez para quitarla)' : ''}`}
                        onClick={() => poner(al, marcado ? null : e.nota)}
                        style={{
                          minWidth: 48, minHeight: 44, borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 13.5,
                          border: `2px solid ${marcado ? calificativo(e.nota).color : 'var(--gris-300)'}`,
                          background: marcado ? calificativo(e.nota).color : 'white', color: marcado ? 'white' : 'var(--gris-900)',
                        }}>
                        {e.sigla}
                      </button>
                    )
                  })}
                </div>
                <input type="text" inputMode="decimal" data-nota-exacta aria-label={`Nota exacta de ${al.apellidos}, ${al.nombre}`}
                  placeholder="exacta" value={exactas[al.id!] ?? ''} disabled={guardando}
                  onFocus={() => setActual(al.id!)}
                  onChange={e => setExactas(x => ({ ...x, [al.id!]: e.target.value }))}
                  onBlur={() => confirmarExacta(al)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  style={{ width: 70, minHeight: 44, textAlign: 'center', fontSize: 14 }} />
                <div data-nota-puesta style={{
                  minWidth: 46, textAlign: 'center', fontWeight: 800, fontSize: 15, padding: '6px 4px', borderRadius: 6,
                  background: v == null ? 'var(--gris-100)' : calificativo(v).color, color: v == null ? 'var(--gris-500)' : 'white',
                }}>{formato(v)}</div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--gris-300)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div role="status" data-sesion-nota-estado style={{ flex: 1, fontSize: 12.5, color: 'var(--gris-600)', minWidth: 160 }}>
            {aviso ?? `${conNota} de ${alumnos.length} con nota. Cada pulsación se guarda y pasa al siguiente.`}
          </div>
          <button type="button" className="btn-secondary" data-nota-deshacer disabled={!ultimo || guardando} onClick={deshacer} style={{ minHeight: 44 }}>
            Deshacer
          </button>
          <button type="button" className="btn-primary" data-sesion-nota-hecho onClick={onCerrar} style={{ minHeight: 44 }}>
            Hecho
          </button>
        </div>
      </div>
    </div>
  )
}
