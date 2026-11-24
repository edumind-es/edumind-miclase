/**
 * Un icono de la familia de MiClase (`src/iconos.ts`): de línea, del color del
 * texto que lo rodea y con el mismo trazo en todos.
 *
 * Por defecto es un adorno y se esconde a los lectores de pantalla, porque lo
 * normal es que vaya junto a su palabra («Imprimir»). Si va SOLO, sin texto al
 * lado, hay que darle `titulo`: entonces se anuncia con ese nombre.
 */
import type { SVGAttributes } from 'react'
import { ATRIBUTOS_ICONO, ICONOS, type NombreIcono } from '@/iconos'

interface Props extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
  nombre: NombreIcono
  /** Lado en píxeles. 22 en el menú; 18 dentro de un botón. */
  lado?: number
  /** Solo si el icono va sin texto al lado: cómo se llama para quien no lo ve. */
  titulo?: string
}

export default function Icono({ nombre, lado = 22, titulo, className, style, ...resto }: Props) {
  return (
    <svg
      {...ATRIBUTOS_ICONO}
      width={lado} height={lado}
      className={`icono${className ? ` ${className}` : ''}`}
      // Que no se encoja dentro de un botón o de una fila flexible
      style={{ flex: 'none', ...style }}
      {...(titulo ? { role: 'img', 'aria-label': titulo } : { 'aria-hidden': true })}
      {...resto}
    >
      {ICONOS[nombre].map((t, i) => ('d' in t ? <path key={i} d={t.d} /> : <circle key={i} cx={t.cx} cy={t.cy} r={t.r} />))}
    </svg>
  )
}
