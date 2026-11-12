import { circulosDeMarca, type FondoMarca } from '@/marca'

/** El símbolo de EDUmind MiClase (el corro de clase), decorativo junto al nombre. */
export default function Marca({ lado = 24, fondo = 'oscuro' }: { lado?: number; fondo?: FondoMarca }) {
  return (
    <svg data-marca width={lado} height={lado} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {circulosDeMarca(100, fondo).map((o, i) => <circle key={i} cx={o.cx} cy={o.cy} r={o.r} fill={o.color} />)}
    </svg>
  )
}
