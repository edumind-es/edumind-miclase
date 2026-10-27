/**
 * Mover lo que una columna tiene en ESTA unidad y ESTE trimestre a otro
 * instrumento del área.
 *
 * Luis puso toda una prueba del 20 % en la columna «Proba escrita» (la
 * familia del 80 %) y no tenía forma de llevarla a «Táboa de indicadores».
 * Aquí elige el destino, ve antes cuántas notas van y cuántas se quedan (y
 * por qué: el destino no evalúa ese criterio en esta unidad, o ya tiene la
 * casilla con nota) y confirma. Todo lo hace `moverColumna` en `queries.ts`;
 * esta pantalla no toca la base.
 */
import { useEffect, useState } from 'react'
import { moverColumna, type ResultadoMoverColumna } from '@/db/queries'
import type { ColumnaInstrumento } from './MatrizInstrumentos'
import type { Instrumento } from '@/db/localDb'

interface Props {
  origen: ColumnaInstrumento
  /** Instrumentos del área (familias e hijos), de donde sale el destino. */
  instrumentos: Instrumento[]
  /** Columnas de la unidad: un destino con columna aquí es el caso normal. */
  columnas: ColumnaInstrumento[]
  unidadId: number
  unidadNombre: string
  trimestre: number
  onMovido: (r: ResultadoMoverColumna, destino: Instrumento) => void
  onCerrar: () => void
}

export default function MoverColumna({ origen, instrumentos, columnas, unidadId, unidadNombre, trimestre, onMovido, onCerrar }: Props) {
  const candidatos = instrumentos.filter(i => i.id !== origen.ins.instrumento_id)
  const conColumna = new Set(columnas.map(c => c.ins.instrumento_id))
  // Por defecto, el primero que ya tiene columna en esta unidad.
  const [destinoId, setDestinoId] = useState<number | null>(candidatos.find(i => conColumna.has(i.id!))?.id ?? candidatos[0]?.id ?? null)
  const [previa, setPrevia] = useState<ResultadoMoverColumna | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moviendo, setMoviendo] = useState(false)
  const destino = candidatos.find(i => i.id === destinoId) ?? null
  const nombreDe = (i: Instrumento) => {
    const fam = i.familia_id != null ? instrumentos.find(f => f.id === i.familia_id) : null
    return fam ? `${i.nombre} (dentro de ${fam.nombre})` : i.nombre
  }

  useEffect(() => {
    let vigente = true
    setPrevia(null); setError(null)
    if (destinoId == null) return
    moverColumna(origen.ins.instrumento_id, destinoId, unidadId, trimestre, { simular: true })
      .then(r => { if (vigente) setPrevia(r) })
      .catch(e => { if (vigente) setError(e instanceof Error ? e.message : 'No se puede mover ahí') })
    return () => { vigente = false }
  }, [destinoId, origen.ins.instrumento_id, unidadId, trimestre])

  const nada = previa ? previa.calificaciones + previa.diario === 0 : true
  const quedan = previa ? previa.noMovidos.sinCriterio + previa.noMovidos.ocupadas + previa.noMovidos.diario : 0

  const mover = async () => {
    if (!destino || !previa || nada) return
    const lineas = [
      `Mover de «${origen.ins.nombre}» a «${destino.nombre}», solo en «${unidadNombre}» (${trimestre}º trimestre):`,
      `· ${previa.calificaciones} nota${previa.calificaciones !== 1 ? 's' : ''}${previa.diario ? ` y ${previa.diario} registro${previa.diario !== 1 ? 's' : ''} del diario` : ''}.`,
    ]
    if (quedan) lineas.push(`· Se quedan en «${origen.ins.nombre}» ${quedan} que no encajan (se explica abajo).`)
    lineas.push('', 'Las demás unidades no cambian. El examen o la rúbrica definidos con el origen se quedan donde están.')
    if (!confirm(lineas.join('\n'))) return
    setMoviendo(true); setError(null)
    try {
      const r = await moverColumna(origen.ins.instrumento_id, destino.id!, unidadId, trimestre)
      onMovido(r, destino)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mover')
      setMoviendo(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !moviendo) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Mover las notas de ${origen.ins.nombre}`} data-mover-columna-dialogo
        style={{ width: 'min(600px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)', borderTop: `4px solid ${origen.ins.color}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--azul-900)' }}>⇄ Mover las notas de «{origen.ins.nombre}»</div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)', marginTop: 2 }}>
              Solo las de <strong>{unidadNombre}</strong>, {trimestre}º trimestre. Las demás unidades no cambian.
            </div>
          </div>
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar" disabled={moviendo}>✕</button>
        </div>

        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--gris-700)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            A qué instrumento
            <select data-mover-columna-destino value={destinoId ?? ''} onChange={e => setDestinoId(Number(e.target.value))} disabled={moviendo} style={{ fontSize: 13, padding: '6px 8px' }}>
              {candidatos.map(i => (
                <option key={i.id} value={i.id}>
                  {nombreDe(i)}{conColumna.has(i.id!) ? '' : ' — sin columna en esta unidad'}
                </option>
              ))}
            </select>
          </label>

          {error && <div data-mover-columna-error style={{ fontSize: 12.5, color: 'var(--rojo-500)', fontWeight: 600 }}>{error}</div>}

          {previa && (
            <div data-mover-columna-previa style={{ fontSize: 12.5, lineHeight: 1.6, background: 'var(--gris-100)', borderRadius: 8, padding: '10px 12px' }}>
              {nada ? (
                <>No hay nada que mover: esta columna no tiene notas ni registros en esta unidad y trimestre.</>
              ) : (
                <>
                  <div>
                    <strong>{previa.calificaciones} nota{previa.calificaciones !== 1 ? 's' : ''}</strong>
                    {previa.diario ? <> y <strong>{previa.diario} registro{previa.diario !== 1 ? 's' : ''} del diario</strong></> : null}
                    {' '}pasan a «{destino?.nombre}», en los criterios que evalúa aquí: {previa.criteriosDestino.join(' · ')}.
                  </div>
                  {previa.noMovidos.sinCriterio > 0 && (
                    <div style={{ color: '#92400e' }}>
                      Se quedan {previa.noMovidos.sinCriterio} nota{previa.noMovidos.sinCriterio !== 1 ? 's' : ''} de {previa.criteriosSinDestino.join(' · ')}: «{destino?.nombre}» no evalúa {previa.criteriosSinDestino.length !== 1 ? 'esos criterios' : 'ese criterio'} en esta unidad. Asígnaselos en la programación y vuelve a mover.
                    </div>
                  )}
                  {previa.noMovidos.ocupadas > 0 && (
                    <div style={{ color: '#92400e' }}>
                      Se quedan {previa.noMovidos.ocupadas} nota{previa.noMovidos.ocupadas !== 1 ? 's' : ''} cuya casilla «{destino?.nombre}» ya tiene con nota: lo puesto en el destino manda.
                    </div>
                  )}
                  {previa.noMovidos.diario > 0 && (
                    <div style={{ color: '#92400e' }}>
                      Se quedan {previa.noMovidos.diario} registro{previa.noMovidos.diario !== 1 ? 's' : ''} del diario sin ningún criterio que el destino evalúe.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--gris-300)' }}>
          <button className="btn-secondary" onClick={onCerrar} disabled={moviendo} style={{ fontSize: 13 }}>Cancelar</button>
          <button data-mover-columna-aceptar className="btn-primary" onClick={mover} disabled={moviendo || !previa || nada || !!error} style={{ fontSize: 13 }}>
            {moviendo ? 'Moviendo…' : 'Mover'}
          </button>
        </div>
      </div>
    </div>
  )
}
