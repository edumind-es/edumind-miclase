/**
 * La sigla de un área sobre su color (MAT, LG, CS…). Es lo que acompaña
 * siempre al color de área: quien no distingue bien los colores lee la sigla.
 * El color llega de `db/areas.ts`; todos dan 4,5:1 o más con el texto en blanco.
 */
import type { CSSProperties } from 'react'

export default function Sigla({ sigla, color }: { sigla: string; color: string }) {
  return <span className="sigla-area" style={{ '--c': color } as CSSProperties}>{sigla}</span>
}
