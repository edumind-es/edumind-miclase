/**
 * La marca de EDUmind MiClase: un corro de clase. Cinco círculos —Los Cinco
 * Mundos— alrededor de uno central, que es la clase.
 *
 * Es la misma geometría que dibuja `scripts/generar_iconos.py` para los
 * iconos de web, iOS y Android: si cambia allí, cambia aquí. Puro: lo usan
 * el menú (`components/Marca.tsx`) y los informes (`informes/lamina.ts`).
 */

/** Fracciones del lado del cuadrado que ocupa la marca. */
const ANILLO = 0.38
const RADIO_MUNDO = 0.12
const RADIO_CLASE = 0.105
const BAJADA = 0.036

/** Los Cinco Mundos en color pleno (canon Lámina). */
const MUNDOS = ['#e8613f', '#e8a92e', '#6ea94a', '#3f7d99', '#2c5c66']
/** Sobre fondo oscuro, el mundo interior va aclarado: si no, se pierde. */
const INTERIOR_SOBRE_OSCURO = '#5b9aa6'

export type FondoMarca = 'oscuro' | 'papel'

export type CirculoMarca = { cx: number; cy: number; r: number; color: string }

const redondo = (n: number) => Math.round(n * 100) / 100

/**
 * Los seis círculos en un cuadrado de `lado`: los cinco mundos, empezando
 * arriba y en sentido horario, y al final el central. Sobre papel el central
 * va en tinta; sobre oscuro, en color papel.
 */
export function circulosDeMarca(lado: number, fondo: FondoMarca): CirculoMarca[] {
  const c = lado / 2
  const cy = c + lado * BAJADA
  const mundos = MUNDOS.map((color, k) => {
    const angulo = ((-90 + 72 * k) * Math.PI) / 180
    return {
      cx: redondo(c + lado * ANILLO * Math.cos(angulo)),
      cy: redondo(cy + lado * ANILLO * Math.sin(angulo)),
      r: redondo(lado * RADIO_MUNDO),
      color: k === 4 && fondo === 'oscuro' ? INTERIOR_SOBRE_OSCURO : color,
    }
  })
  return [...mundos, { cx: redondo(c), cy: redondo(cy), r: redondo(lado * RADIO_CLASE), color: fondo === 'oscuro' ? '#e9e6dd' : '#1c1a16' }]
}

/** La marca como SVG en texto, para los documentos que se montan como HTML. */
export function marcaSVG(lado: number, fondo: FondoMarca, clase = 'marca'): string {
  const circulos = circulosDeMarca(100, fondo)
    .map(o => `<circle cx="${o.cx}" cy="${o.cy}" r="${o.r}" fill="${o.color}"/>`).join('')
  return `<svg class="${clase}" width="${lado}" height="${lado}" viewBox="0 0 100 100" aria-hidden="true">${circulos}</svg>`
}
