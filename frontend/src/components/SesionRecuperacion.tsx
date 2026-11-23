/**
 * Calificar una recuperación, alumno a alumno.
 *
 * La app propone y el docente retoca (decisión de Luis, 23/11/2026): por
 * cada alumno salen los criterios de la columna con la nota que tenía con
 * ese instrumento en la unidad, y los suspensos vienen ya marcados. La nota
 * que se pone va SOLO a los criterios marcados; se puede marcar uno que no
 * está suspenso (el que no vuelve a evaluarse, el que condiciona) o quitar
 * uno que sí.
 *
 * No calcula la nota que queda: guarda la de la recuperación en su casilla,
 * por `saveCalificaciones` con `sinVinculos`, y el cálculo aplica la regla
 * (`db/recuperacion.ts`). Lo que se enseña como «queda» sale de esa misma
 * función, `notaRecuperada`.
 */
import { useEffect, useState } from 'react'
import { notasParaRecuperar, saveCalificaciones, type DatosDeArea, type MatrizEvaluacion } from '@/db/queries'
import type { ColumnaInstrumento } from './MatrizInstrumentos'
import { BotonEditarActividad } from './FichaActividad'
import { ESCALA_RAPIDA } from './SesionNota'
import { calificativo } from '@/db/calculo'
import { claveUnidad } from '@/db/migracionUnidades'
import { REGLAS_RECUPERACION, estaSuspenso, notaRecuperada, type ReglaRecuperacion } from '@/db/recuperacion'
import type { Alumno } from '@/db/localDb'

interface Props {
  columna: ColumnaInstrumento
  matriz: MatrizEvaluacion
  alumnos: Alumno[]
  trimestre: number
  unidadId: number | null
  unidadNombre?: string
  area: DatosDeArea
  onCambio: () => void
  onCerrar: () => void
}

const formato = (n: number | null | undefined) => n == null ? '—' : String(Math.round(n * 10) / 10).replace('.', ',')

export default function SesionRecuperacion({ columna, matriz, alumnos, trimestre, unidadId, unidadNombre, area, onCambio, onCerrar }: Props) {
  const ins = columna.ins
  const regla = (ins.recuperacion ?? 'mejor') as ReglaRecuperacion
  const criterios = columna.criterios.map(c => c.id)
  /** Lo que cada alumno tenía antes de recuperar, por criterio. */
  const [antes, setAntes] = useState<Map<number, Map<string, number | null>> | null>(null)
  /** Criterios marcados por alumno; sin tocar, los que ya tienen nota de recuperación o los suspensos. */
  const [marcados, setMarcados] = useState<Record<number, string[]>>({})
  /** Nota de recuperación puesta en esta pantalla. */
  const [puestas, setPuestas] = useState<Record<number, number | null>>({})
  const [exactas, setExactas] = useState<Record<number, string>>({})
  /** Criterios en los que esta pantalla ha dejado nota, por si la matriz aún no se ha releído. */
  const [escritos, setEscritos] = useState<Record<number, string[]>>({})
  const [todos, setTodos] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const clave = criterios.join(' ')
  useEffect(() => {
    let vigente = true
    notasParaRecuperar(matriz.asig.id!, ins.instrumento_id, claveUnidad(unidadId), trimestre, clave.split(' ').filter(Boolean))
      .then(m => { if (vigente) setAntes(m) })
      .catch(e => { if (vigente) { setAntes(new Map()); setAviso(`No se pudieron leer las notas: ${(e as Error).message}`) } })
    return () => { vigente = false }
  }, [matriz.asig.id, ins.instrumento_id, unidadId, trimestre, clave])

  /** La nota de recuperación guardada en un criterio, según la matriz. */
  const guardada = (al: Alumno, criterio: string): number | null =>
    matriz.calificaciones[`${al.id}:${criterio}:${ins.instrumento_id}:${trimestre}`]?.valor ?? null
  const conGuardada = (al: Alumno) => criterios.filter(c => guardada(al, c) != null)
  const suspensos = (al: Alumno) => criterios.filter(c => estaSuspenso(antes?.get(al.id!)?.get(c)))
  const marcadosDe = (al: Alumno): string[] => {
    if (marcados[al.id!]) return marcados[al.id!]
    const ya = conGuardada(al)
    return ya.length ? ya : suspensos(al)
  }
  const notaDe = (al: Alumno): number | null => {
    if (al.id! in puestas) return puestas[al.id!]
    const vs = conGuardada(al).map(c => guardada(al, c)!)
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null
  }

  /** Escribe la nota en los criterios marcados y la quita de los demás de la columna. */
  const escribir = async (al: Alumno, valor: number | null, lista: string[]) => {
    setGuardando(true); setAviso(null)
    try {
      // Solo se escribe donde va la nota o donde hay que quitar una ya puesta:
      // un criterio sin marcar y sin nota no estrena casilla.
      const aQuitar = new Set([...conGuardada(al), ...(escritos[al.id!] ?? [])])
      await saveCalificaciones(criterios.filter(c => (valor != null && lista.includes(c)) || aQuitar.has(c)).map(criterio_id => ({
        alumno_id: al.id!, instrumento_id: ins.instrumento_id, criterio_id, ...area,
        trimestre, valor: lista.includes(criterio_id) ? valor : null, observacion: null, unidad_id: claveUnidad(unidadId),
      })), { sinVinculos: true })
      setPuestas(p => ({ ...p, [al.id!]: lista.length ? valor : null }))
      setEscritos(x => ({ ...x, [al.id!]: valor == null ? [] : lista }))
      setExactas(e => { const { [al.id!]: _fuera, ...resto } = e; return resto })
      onCambio()
    } catch (e) {
      setAviso(`No se pudo guardar: ${(e as Error).message}`)
    } finally { setGuardando(false) }
  }

  const poner = (al: Alumno, valor: number | null) => {
    if (guardando) return
    const lista = marcadosDe(al)
    if (valor != null && !lista.length) { setAviso(`Marca antes qué criterios recupera ${al.nombre}.`); return }
    void escribir(al, valor, lista)
  }

  const alternar = (al: Alumno, criterio: string) => {
    if (guardando) return
    const lista = marcadosDe(al)
    const nueva = lista.includes(criterio) ? lista.filter(c => c !== criterio) : [...lista, criterio]
    setMarcados(m => ({ ...m, [al.id!]: nueva }))
    // Con la nota ya puesta, el cambio se guarda al momento.
    const v = notaDe(al)
    if (v != null) void escribir(al, v, nueva)
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

  const propuestos = alumnos.filter(al => suspensos(al).length > 0 || notaDe(al) != null)
  const lista = todos ? alumnos : propuestos
  const conNota = alumnos.filter(al => notaDe(al) != null).length
  const nombreRegla = REGLAS_RECUPERACION.find(r => r.id === regla)?.nombre ?? ''

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Recuperación: ${ins.nombre}`} data-recuperacion data-regla={regla}
        style={{ width: 'min(820px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--gris-300)', borderLeft: `6px solid ${ins.color}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--azul-900)' }}>{ins.nombre}</h2>
              <div style={{ fontSize: 12.5, color: 'var(--gris-600)', marginTop: 2 }}>
                {unidadNombre ? `${unidadNombre} · ` : ''}{trimestre}º trimestre · recupera lo de «{ins.familia_nombre}»
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <BotonEditarActividad instrumento={ins} criterios={columna.criterios} unidadNombre={unidadNombre} unidadId={unidadId} area={area} onCambio={onCambio} onHerramienta={() => { onCambio(); onCerrar() }} />
              <button className="modal-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
            </div>
          </div>
          <div data-recuperacion-regla style={{ fontSize: 12.5, color: 'var(--gris-700)', marginTop: 6 }}>
            Queda <strong>{nombreRegla.toLowerCase()}</strong>. La nota va solo a los criterios marcados de cada alumno: vienen marcados
            los suspensos y puedes añadir o quitar. Las notas de las otras actividades no se tocan.
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '6px 18px', flex: 1 }}>
          {antes == null && <p style={{ fontSize: 13.5, color: 'var(--gris-600)' }}>Leyendo las notas…</p>}
          {antes != null && lista.length === 0 && (
            <p data-recuperacion-nadie style={{ fontSize: 13.5, color: 'var(--gris-700)', padding: '10px 0' }}>
              Nadie tiene suspenso ningún criterio de esta recuperación en la unidad.
            </p>
          )}
          {antes != null && lista.map(al => {
            const sel = marcadosDe(al)
            const v = notaDe(al)
            return (
              <div key={al.id} data-fila-recuperacion={al.id}
                style={{ padding: '8px 4px', borderBottom: '1px solid var(--gris-300)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 170px', minWidth: 0, fontSize: 14, fontWeight: 600 }}>{al.apellidos}, {al.nombre}</div>
                  <div role="group" aria-label={`Nota de recuperación de ${al.apellidos}, ${al.nombre}`} style={{ display: 'flex', gap: 5 }}>
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
                  <input type="text" inputMode="decimal" data-nota-exacta aria-label={`Nota exacta de recuperación de ${al.apellidos}, ${al.nombre}`}
                    placeholder="exacta" value={exactas[al.id!] ?? ''} disabled={guardando}
                    onChange={e => setExactas(x => ({ ...x, [al.id!]: e.target.value }))}
                    onBlur={() => confirmarExacta(al)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    style={{ width: 70, minHeight: 44, textAlign: 'center', fontSize: 14 }} />
                  <div data-nota-puesta style={{
                    minWidth: 46, textAlign: 'center', fontWeight: 800, fontSize: 15, padding: '6px 4px', borderRadius: 6,
                    background: v == null ? 'var(--gris-100)' : calificativo(v).color, color: v == null ? 'var(--gris-500)' : 'white',
                  }}>{formato(v)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {columna.criterios.map(c => {
                    const tenia = antes.get(al.id!)?.get(c.id) ?? null
                    const dentro = sel.includes(c.id)
                    const queda = dentro && v != null && tenia != null ? notaRecuperada(tenia, v, regla) : null
                    return (
                      <button key={c.id} type="button" data-recuperar-criterio={c.id} aria-pressed={dentro} disabled={guardando}
                        data-suspenso={estaSuspenso(tenia) || undefined} title={c.descripcion}
                        onClick={() => alternar(al, c.id)}
                        style={{
                          minHeight: 44, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, textAlign: 'left',
                          border: `2px solid ${dentro ? 'var(--azul-700)' : 'var(--gris-300)'}`,
                          background: dentro ? 'var(--azul-700)' : 'white', color: dentro ? 'white' : 'var(--gris-900)',
                        }}>
                        <strong>{c.id}</strong>{' · '}
                        {tenia == null ? 'sin nota' : <>tenía {formato(tenia)}{estaSuspenso(tenia) ? ' (suspenso)' : ''}</>}
                        {queda != null ? <> → queda <strong data-recuperar-queda>{formato(queda)}</strong></> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--gris-300)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div role="status" data-recuperacion-estado style={{ flex: 1, fontSize: 12.5, color: 'var(--gris-600)', minWidth: 160 }}>
            {aviso ?? `${conNota} con nota de recuperación. ${propuestos.length} de ${alumnos.length} con algo suspenso o ya recuperado.`}
          </div>
          <button type="button" className="btn-secondary" data-recuperacion-todos aria-pressed={todos} onClick={() => setTodos(t => !t)} style={{ minHeight: 44 }}>
            {todos ? 'Solo los propuestos' : 'Ver toda la clase'}
          </button>
          <button type="button" className="btn-primary" data-recuperacion-hecho onClick={onCerrar} style={{ minHeight: 44 }}>
            Hecho
          </button>
        </div>
      </div>
    </div>
  )
}
