/**
 * Pestaña «Nota final» de un área, en el panel de áreas.
 *
 * Dos cosas que hasta ahora no se podían tocar desde la interfaz: el
 * porcentaje de cada trimestre (`pesos_trimestres`, que existía pero solo
 * se escribía al crear el área) y la regla con la que se obtiene la final
 * (`regla_final`: ponderada, continua, más alta, mediana). Decisión de Luis:
 * lo normal es la media de los tres, pero hay docentes que no lo hacen así.
 *
 * Guarda al soltar el control, sin botón, y avisa si los porcentajes no
 * suman 100 (el cálculo normaliza por la suma, así que no rompe nada; es
 * solo para que el docente vea lo que ha escrito).
 */
import { useState } from 'react'
import type { ReglaFinal } from '@/db/localDb'
import { REGLAS_FINAL, normalizarReglaFinal, parsearPesosTrimestres } from '@/db/calculo'
import { actualizarAsignatura } from '@/db/queries'

/** Lo mínimo del área que hace falta aquí: el panel trabaja con su propio tipo recortado. */
type AreaMin = { id?: number; pesos_trimestres?: string; regla_final?: ReglaFinal | null }
type Props = { asignatura: AreaMin; onCambio?: () => void }

const ORDINAL: Record<number, string> = { 1: '1er trimestre', 2: '2º trimestre', 3: '3er trimestre' }

export default function NotaFinalPanel({ asignatura, onCambio }: Props) {
  const [pesos, setPesos] = useState<Record<number, number>>(() => parsearPesosTrimestres(asignatura.pesos_trimestres))
  const [regla, setRegla] = useState<ReglaFinal>(() => normalizarReglaFinal(asignatura.regla_final))
  const [guardado, setGuardado] = useState('')

  const total = pesos[1] + pesos[2] + pesos[3]
  const descripcion = REGLAS_FINAL.find(r => r.id === regla)!.descripcion

  const guardarPesos = async (nuevos: Record<number, number>) => {
    await actualizarAsignatura(asignatura.id!, { pesos_trimestres: JSON.stringify({ 1: nuevos[1], 2: nuevos[2], 3: nuevos[3] }) })
    setGuardado('Porcentajes guardados')
    onCambio?.()
  }

  const guardarRegla = async (nueva: ReglaFinal) => {
    setRegla(nueva)
    await actualizarAsignatura(asignatura.id!, { regla_final: nueva })
    setGuardado('Regla guardada')
    onCambio?.()
  }

  return (
    <div data-nota-final-panel style={{ display: 'grid', gap: 14 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Regla de la nota final</div>
        <select value={regla} onChange={e => guardarRegla(e.target.value as ReglaFinal)} data-regla-final
          style={{ fontSize: 14, padding: '6px 8px', maxWidth: 320 }} aria-label="Regla de la nota final">
          {REGLAS_FINAL.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '6px 0 0' }}>
          {descripcion} Se aplica igual a la final de cada criterio y a la del área, en «Todo el curso» y en el boletín.
        </p>
      </div>

      <div style={{ opacity: regla === 'ponderada' ? 1 : 0.6 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
          Porcentaje de cada trimestre
          {regla !== 'ponderada' && <span style={{ fontWeight: 400, color: 'var(--gris-600)' }}> · solo cuenta con la media ponderada</span>}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[1, 2, 3].map(t => (
            <label key={t} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              {ORDINAL[t]}
              <input type="number" min={0} max={100} step={1} value={pesos[t]} data-peso-trimestre={t}
                onChange={e => setPesos(p => ({ ...p, [t]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                onBlur={() => guardarPesos(pesos)}
                style={{ width: 64, padding: '4px 6px', fontSize: 14 }} />
              %
            </label>
          ))}
        </div>
        <p style={{ fontSize: 12.5, margin: '6px 0 0', color: total === 100 ? 'var(--gris-600)' : 'var(--ambar-600, #b45309)' }} data-pesos-total>
          {total === 100
            ? 'Suman 100.'
            : `Suman ${total}. El cálculo reparte proporcionalmente, pero conviene que sumen 100 para leerlos como porcentajes.`}
        </p>
      </div>

      {guardado && <p role="status" style={{ fontSize: 12.5, color: 'var(--verde-600, #166534)', margin: 0 }}>{guardado}</p>}
    </div>
  )
}
