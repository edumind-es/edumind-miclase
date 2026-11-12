/**
 * Pestaña «Nota final» de un área, en el panel de áreas.
 *
 * Dos cosas que hasta ahora no se podían tocar desde la interfaz: el
 * porcentaje de cada trimestre (`pesos_trimestres`, que existía pero solo
 * se escribía al crear el área) y la regla con la que se obtiene la final
 * (`regla_final`: ponderada, continua, más alta, mediana). Decisión de Luis:
 * lo normal es la media de los tres, pero hay docentes que no lo hacen así.
 *
 * Y la regla de la nota del área en cada trimestre (`regla_area`): por
 * instrumento (el 80/20 de la programación sobre el área, lo de siempre) o
 * por criterio (el instrumento pesa solo dentro de cada criterio). Luis vio
 * en el iPad que con 5 criterios de examen y 20 de tabla el 80/20 no se
 * cumplía: era la regla por criterio.
 *
 * Guarda al soltar el control, sin botón, y avisa si los porcentajes no
 * suman 100 (el cálculo normaliza por la suma, así que no rompe nada; es
 * solo para que el docente vea lo que ha escrito).
 */
import { useEffect, useState } from 'react'
import type { ReglaArea, ReglaFinal, ReglaUnidades } from '@/db/localDb'
import {
  REGLAS_AREA, REGLAS_FINAL, REGLAS_UNIDADES, normalizarReglaArea, normalizarReglaFinal, normalizarReglaUnidades,
  parsearPesosTrimestres,
} from '@/db/calculo'
import { actualizarAsignatura, actualizarUnidad, getUnidades } from '@/db/queries'

/** Lo mínimo del área que hace falta aquí: el panel trabaja con su propio tipo recortado. */
type AreaMin = {
  id?: number; pesos_trimestres?: string; regla_final?: ReglaFinal | null; regla_area?: ReglaArea | null
  regla_unidades?: ReglaUnidades | null
}
/** Una unidad con el peso que le da la programación, para editarlo aquí. */
type UnidadPeso = { id: number; nombre: string; trimestre: number | null; peso: string }
type Props = { asignatura: AreaMin; onCambio?: () => void }

const ORDINAL: Record<number, string> = { 1: '1er trimestre', 2: '2º trimestre', 3: '3er trimestre' }

export default function NotaFinalPanel({ asignatura, onCambio }: Props) {
  const [pesos, setPesos] = useState<Record<number, number>>(() => parsearPesosTrimestres(asignatura.pesos_trimestres))
  const [regla, setRegla] = useState<ReglaFinal>(() => normalizarReglaFinal(asignatura.regla_final))
  const [reglaArea, setReglaArea] = useState<ReglaArea>(() => normalizarReglaArea(asignatura.regla_area))
  const [reglaUnidades, setReglaUnidades] = useState<ReglaUnidades>(() => normalizarReglaUnidades(asignatura.regla_unidades))
  const [unidades, setUnidades] = useState<UnidadPeso[]>([])
  const [guardado, setGuardado] = useState('')

  // Las unidades solo hacen falta para escribir sus pesos.
  useEffect(() => {
    let vigente = true
    if (asignatura.id == null) return
    getUnidades(asignatura.id).then(us => {
      if (vigente) setUnidades(us.map(u => ({ id: u.id!, nombre: u.nombre, trimestre: u.trimestre ?? null, peso: u.peso ? String(u.peso) : '' })))
    })
    return () => { vigente = false }
  }, [asignatura.id])
  const sinPeso = unidades.filter(u => !(Number(u.peso) > 0))

  const guardarReglaUnidades = async (nueva: ReglaUnidades) => {
    setReglaUnidades(nueva)
    await actualizarAsignatura(asignatura.id!, { regla_unidades: nueva })
    setGuardado('Regla guardada')
    onCambio?.()
  }

  const guardarPesoUnidad = async (u: UnidadPeso) => {
    const peso = Number(u.peso.replace(',', '.'))
    await actualizarUnidad(u.id, { peso: Number.isFinite(peso) && peso > 0 ? peso : null })
    setGuardado('Peso de la unidad guardado')
    onCambio?.()
  }

  const total = pesos[1] + pesos[2] + pesos[3]
  const descripcion = REGLAS_FINAL.find(r => r.id === regla)!.descripcion
  const descripcionArea = REGLAS_AREA.find(r => r.id === reglaArea)!.descripcion

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

  const guardarReglaArea = async (nueva: ReglaArea) => {
    setReglaArea(nueva)
    await actualizarAsignatura(asignatura.id!, { regla_area: nueva })
    setGuardado('Regla guardada')
    onCambio?.()
  }

  return (
    <div data-nota-final-panel style={{ display: 'grid', gap: 14 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Nota del área en cada trimestre</div>
        <select value={reglaArea} onChange={e => guardarReglaArea(e.target.value as ReglaArea)} data-regla-area
          style={{ fontSize: 14, padding: '6px 8px', maxWidth: 320 }} aria-label="Regla de la nota del área">
          {REGLAS_AREA.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '6px 0 0' }}>
          {descripcionArea} Un instrumento sin nota en el trimestre no cuenta. La nota de cada criterio no cambia.
        </p>
      </div>

      <div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Unidades de un mismo trimestre</div>
        <select value={reglaUnidades} onChange={e => guardarReglaUnidades(e.target.value as ReglaUnidades)} data-regla-unidades
          style={{ fontSize: 14, padding: '6px 8px', maxWidth: 320 }} aria-label="Cómo cuentan las unidades de un trimestre">
          {REGLAS_UNIDADES.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '6px 0 0' }}>
          {REGLAS_UNIDADES.find(r => r.id === reglaUnidades)!.descripcion} La nota de cada unidad no cambia: cambia lo que cuenta cada una en el trimestre.
        </p>
        {reglaUnidades === 'peso' && (
          <div data-pesos-unidad style={{ marginTop: 8 }}>
            {unidades.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: 0 }}>Esta área todavía no tiene unidades.</p>
            ) : (
              <div style={{ display: 'grid', gap: 5 }}>
                {unidades.map((u, i) => (
                  <label key={u.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min={0} step={1} value={u.peso} data-peso-unidad={u.id} placeholder="—"
                      aria-label={`Peso de ${u.nombre}`}
                      onChange={e => setUnidades(us => us.map((x, j) => j === i ? { ...x, peso: e.target.value } : x))}
                      onBlur={() => guardarPesoUnidad(u)}
                      style={{ width: 64, padding: '4px 6px', fontSize: 14 }} />
                    <span>{u.nombre}{u.trimestre ? <span style={{ color: 'var(--gris-500)' }}> · T{u.trimestre}</span> : null}</span>
                  </label>
                ))}
              </div>
            )}
            <p data-pesos-unidad-aviso style={{ fontSize: 12.5, margin: '6px 0 0', color: sinPeso.length ? 'var(--ambar-600, #b45309)' : 'var(--gris-600)' }}>
              {unidades.length > 0 && sinPeso.length === unidades.length
                ? 'Ninguna unidad tiene peso: mientras tanto, todas cuentan igual.'
                : sinPeso.length
                  ? `${sinPeso.length} unidad${sinPeso.length !== 1 ? 'es' : ''} sin peso: cuenta${sinPeso.length !== 1 ? 'n' : ''} con la media de las demás.`
                  : 'El peso se compara entre las unidades del mismo trimestre; no hace falta que sumen 100.'}
            </p>
          </div>
        )}
      </div>

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
