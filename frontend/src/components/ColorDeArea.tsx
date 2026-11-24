/**
 * El color y la sigla de un área, para reconocerla al calificar con el
 * aspecto Lámina (hub de áreas, franja bajo la barra, selector de área).
 *
 * Sin elegir nada, el área lleva el color que le toca por orden y la sigla de
 * su nombre (`db/areas.ts`); aquí el docente puede fijar los suyos. Diez
 * tonos, todos legibles con la sigla en blanco: no hay color libre a
 * propósito, porque uno cualquiera podría no leerse o confundirse con el
 * semáforo de las notas.
 */
import { useState } from 'react'
import { actualizarAsignatura } from '@/db/queries'
import { PALETA_AREAS, type IdentidadArea } from '@/db/areas'
import Sigla from './comunes/Sigla'

const NOMBRES = ['violeta', 'azul petróleo', 'siena', 'verde', 'ocre', 'granate', 'verde botella', 'malva', 'azul', 'oliva']

export default function ColorDeArea({ areaId, nombre, identidad, siglaPropia, alCambiar }: {
  areaId: number
  nombre: string
  /** Lo que el área lleva ahora mismo, propio o por defecto. */
  identidad: IdentidadArea
  /** La sigla que el docente fijó, si fijó alguna. */
  siglaPropia?: string | null
  alCambiar: () => void | Promise<void>
}) {
  const [sigla, setSigla] = useState(siglaPropia ?? '')
  const guardar = async (data: { color?: string; sigla?: string | null }) => { await actualizarAsignatura(areaId, data); await alCambiar() }

  return (
    <div className="color-area" data-color-area={areaId}>
      <Sigla sigla={identidad.sigla} color={identidad.color} />
      <label className="color-area-sigla">
        <span className="ml-rotulo">Sigla</span>
        <input value={sigla} maxLength={4} placeholder={identidad.sigla} aria-label={`Sigla de ${nombre}`} data-color-area-sigla
          onChange={e => setSigla(e.target.value.toUpperCase())}
          onBlur={() => { const s = sigla.trim(); if (s !== (siglaPropia ?? '')) guardar({ sigla: s || null }) }} />
      </label>
      <div className="color-area-muestras" role="group" aria-label={`Color de ${nombre}`}>
        {PALETA_AREAS.map((c, i) => (
          <button key={c} type="button" className="color-area-muestra" data-color-area-muestra={c}
            style={{ background: c }} aria-pressed={c === identidad.color} aria-label={`Color ${NOMBRES[i]}`} title={NOMBRES[i]}
            onClick={() => guardar({ color: c })} />
        ))}
      </div>
    </div>
  )
}
