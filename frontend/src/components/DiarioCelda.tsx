/**
 * Diario de evaluación dentro del panel de una casilla.
 *
 * Varias observaciones fechadas de un alumno con un instrumento (exit ticket,
 * cuaderno, trabajo en equipo…) que no se pisan entre sí. La nota del
 * criterio no se pide: sale de los registros con la regla del instrumento
 * (media, última, tendencia, mediana). Cada registro reparte a todos los
 * criterios que la programación asigna al instrumento, salvo que el docente
 * lo limite a este.
 */
import { useState } from 'react'
import { anadirRegistro, borrarRegistro, type CeldaInstrumento, type DatosDeArea } from '@/db/queries'
import { ETIQUETAS_NIVEL, NIVELES_DIARIO, etiquetaAgregacion, nivelDiarioANota, notaDeDiario } from '@/db/diario'
import { calificativo } from '@/db/calculo'
import type { Alumno, RegistroDiario } from '@/db/localDb'

interface Props {
  alumno: Alumno
  instrumento: CeldaInstrumento
  criterio: { id: string }
  /** Los otros criterios que el instrumento evalúa en lo que se está viendo. */
  hermanos: { id: string; descripcion: string }[]
  trimestre: number
  unidadId: number | null
  area: DatosDeArea
  /** Registros de esta casilla, en orden cronológico. */
  registros: RegistroDiario[]
  guardando: boolean
  onCambio: (texto: string) => void
  onError: (texto: string) => void
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

export default function DiarioCelda({
  alumno, instrumento, criterio, hermanos, trimestre, unidadId, area,
  registros, guardando, onCambio, onError,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [nivel, setNivel] = useState<number | null>(null)
  const [texto, setTexto] = useState('')
  const [soloEste, setSoloEste] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const notaDerivada = notaDeDiario(registros, instrumento.agregacion)
  const regla = etiquetaAgregacion(instrumento.agregacion)

  const guardar = async () => {
    if (nivel == null) return
    setOcupado(true)
    try {
      const criterios = soloEste ? [criterio.id] : [criterio.id, ...hermanos.map(h => h.id)]
      const { notas } = await anadirRegistro({
        alumno_id: alumno.id!, instrumento_id: instrumento.instrumento_id, trimestre, unidad_id: unidadId,
        valor: nivel, observacion: texto.trim() || null, criterios, area,
      })
      const nota = notas[criterio.id]
      const donde = criterios.length > 1 ? `en ${criterios.join(', ')}` : `en ${criterio.id}`
      onCambio(`Registro ${registros.length + 1} añadido · nota ${nota ?? '—'} ${donde}`)
      setNivel(null); setTexto(''); setAbierto(false)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo guardar el registro')
    } finally { setOcupado(false) }
  }

  const borrar = async (r: RegistroDiario) => {
    if (!confirm(`¿Borrar el registro del ${fechaCorta(r.fecha)} (nivel ${r.valor})? La nota se recalcula con los que queden.`)) return
    setOcupado(true)
    try {
      await borrarRegistro(r.id!)
      onCambio(registros.length > 1 ? 'Registro borrado · nota recalculada' : 'Registro borrado · casilla sin nota')
    } catch {
      onError('No se pudo borrar el registro')
    } finally { setOcupado(false) }
  }

  const bloqueado = guardando || ocupado

  return (
    <div data-diario style={{ marginBottom: 14, border: '1px solid var(--gris-300)', borderRadius: 10, padding: '10px 12px', background: 'white' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
          Diario de evaluación
        </div>
        <div style={{ flex: 1 }} />
        {registros.length > 0 && (
          <span data-diario-nota style={{ fontSize: 11.5, color: 'var(--gris-600)', fontWeight: 600 }}>
            {regla} de {registros.length} registro{registros.length !== 1 ? 's' : ''} → <strong>{notaDerivada}</strong>
          </span>
        )}
      </div>

      {registros.length === 0 && !abierto && (
        <div style={{ fontSize: 12, color: 'var(--gris-500)', marginBottom: 8, lineHeight: 1.45 }}>
          Anota lo que observas cada vez: la nota sale sola y ningún registro borra el anterior.
        </div>
      )}

      {registros.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {registros.map(r => {
            const c = calificativo(nivelDiarioANota(r.valor))
            return (
              <li key={r.id} data-registro style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ color: 'var(--gris-500)', minWidth: 54, fontVariantNumeric: 'tabular-nums' }}>{fechaCorta(r.fecha)}</span>
                <span title={ETIQUETAS_NIVEL[r.valor]} style={{
                  minWidth: 22, height: 22, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 12, color: 'white', background: c.color,
                }}>{r.valor}</span>
                <span style={{ flex: 1, color: 'var(--gris-900)', lineHeight: 1.35 }}>
                  {r.observacion || <span style={{ color: 'var(--gris-500)' }}>{ETIQUETAS_NIVEL[r.valor]}</span>}
                </span>
                <button onClick={() => borrar(r)} disabled={bloqueado} title="Borrar este registro"
                  style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!abierto ? (
        <button data-diario-nuevo onClick={() => setAbierto(true)} disabled={bloqueado} className="btn-secondary" style={{ fontSize: 12 }}>
          + Registro
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {NIVELES_DIARIO.map(n => {
              const c = calificativo(nivelDiarioANota(n))
              const activo = nivel === n
              return (
                <button key={n} className={`nivel-${n}`} onClick={() => setNivel(n)} disabled={bloqueado} aria-pressed={activo}
                  style={{
                    minHeight: 50, borderRadius: 9, cursor: 'pointer', padding: '6px 4px',
                    border: `2px solid ${activo ? 'var(--gris-900)' : 'transparent'}`,
                    background: c.color, color: 'white', fontWeight: 800, fontSize: 16, lineHeight: 1.1,
                  }}>
                  {n}
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 600, opacity: .9, marginTop: 2 }}>{ETIQUETAS_NIVEL[n]}</span>
                </button>
              )
            })}
          </div>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Qué has observado (opcional)…"
            style={{ width: '100%', minHeight: 38 }} />
          {hermanos.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gris-600)', cursor: 'pointer' }}>
              <input type="checkbox" checked={soloEste} onChange={e => setSoloEste(e.target.checked)} />
              Solo este criterio (si no, también en {hermanos.map(h => h.id).join(', ')})
            </label>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-diario-guardar className="btn-primary" onClick={guardar} disabled={bloqueado || nivel == null} style={{ fontSize: 12.5 }}>
              Guardar registro
            </button>
            <button className="btn-secondary" onClick={() => { setAbierto(false); setNivel(null); setTexto('') }} disabled={bloqueado} style={{ fontSize: 12.5 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
