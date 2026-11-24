/**
 * La familia de iconos de MiClase. Propios, de línea y de un solo color.
 *
 * Sustituyen a los emoji: un emoji lo dibuja cada sistema a su manera (y en
 * color), y la app va a iOS, macOS, Windows, Linux y Android. Decisión de
 * Luis (nov 2026); los números en vez de iconos se descartaron por poco
 * operativos.
 *
 * Reglas del dibujo, para que uno nuevo no desentone:
 *  · rejilla de 24 × 24, con medio punto de aire en los bordes;
 *  · solo línea: sin relleno, trazo de 1,5, extremos cuadrados y uniones en
 *    inglete (lo pone `Icono`, no cada dibujo);
 *  · un color, el del texto (`currentColor`);
 *  · que simbolice lo fundamental del elemento, sin adornos.
 *
 * Este fichero es puro (no importa React): los informes y las pruebas pueden
 * pedir el mismo dibujo como texto con `iconoSVG`.
 */
export type Trazo = { d: string } | { cx: number; cy: number; r: number }

const linea = (d: string): Trazo => ({ d })
const circulo = (cx: number, cy: number, r: number): Trazo => ({ cx, cy, r })

export const ICONOS = {
  // ── Menú ──
  inicio:        [linea('M3 11.5 12 3.5l9 8M5.5 9.5V20.5h13V9.5M10 20.5v-6h4v6')],
  planificacion: [linea('M3.5 5.5h17v15h-17zM3.5 10h17M8 3v4.5M16 3v4.5')],
  calificador:   [linea('M3.5 4.5h17v15h-17zM3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15')],
  examenes:      [linea('M6 3.5h8.5l4 4v13H6zM14.5 3.5v4h4M9 12l1.5 1.5L13 11M9 17h6')],
  asistencia:    [linea('M3.5 3.5h17v17h-17zM7.5 12.5l3 3 6-7')],
  seguimiento:   [linea('M4 4v16h16M7.5 15.5l4-5 3 3 4.5-6.5')],
  tutorias:      [linea('M3.5 4.5h12v8.5H9l-3.5 3.5V13h-2zM18 9h2.5v8.5h-2V20l-3-2.5h-3.5')],
  informes:      [linea('M6 3.5h12v17H6zM9.5 17v-4M12 17V8.5M14.5 17v-6')],
  clases:        [linea('M3.5 4.5h17v11.5h-17zM8.5 20.5l1.5-4.5M15.5 20.5 14 16M7 8.5h6M7 11.5h3.5')],
  alumnado:      [circulo(12, 8, 3.5), linea('M5 20.5v-1.5c0-3 3-4.5 7-4.5s7 1.5 7 4.5v1.5')],
  sincronizar:   [linea('M4 9h15.5l-3.5-3.5M20 15H4.5L8 18.5')],
  // ── Marco ──
  panel:         [linea('M3.5 4.5h17v15h-17zM9 4.5v15')],
  mas:           [linea('M4 6.5h16M4 12h16M4 17.5h16')],
  rejilla:       [linea('M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z')],
  anterior:      [linea('M15 5l-7 7 7 7')],
  siguiente:     [linea('M9 5l7 7-7 7')],
  cerrar:        [linea('M5.5 5.5l13 13M18.5 5.5l-13 13')],
  abajo:         [linea('M5 9l7 7 7-7')],
  // ── Acciones ──
  importar:      [linea('M12 3.5v11.5M7 10.5l5 5 5-5M4 20.5h16')],
  camara:        [linea('M3.5 7.5h4l1.5-2.5h6l1.5 2.5h4v12h-17z'), circulo(12, 13.5, 3.5)],
  imprimir:      [linea('M7 8V3.5h10V8M7 17H3.5V8h17v9H17M7 14h10v6.5H7z')],
  editar:        [linea('M4 20l1-4.5L16 4.5 19.5 8 8.5 19zM14 6.5 17.5 10')],
  ajustes:       [linea('M4 7.5h4M12 7.5h8M4 16.5h9M17 16.5h3M8 5.5h4v4H8zM13 14.5h4v4h-4z')],
  anadir:        [linea('M12 4.5v15M4.5 12h15')],
  borrar:        [linea('M4.5 7h15M9.5 7V4h5v3M6.5 7l1 13.5h9l1-13.5')],
  aviso:         [linea('M12 4.5 20.5 19.5h-17zM12 10.5v4M12 16.5v.5')],
} satisfies Record<string, Trazo[]>

export type NombreIcono = keyof typeof ICONOS

/** Lo que lleva todo icono, se pinte con React o como texto. */
export const ATRIBUTOS_ICONO = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'square', strokeLinejoin: 'miter',
} as const

/** El icono como texto SVG, para documentos que no pasan por React (informes). */
export function iconoSVG(nombre: NombreIcono, lado = 22): string {
  const dentro = ICONOS[nombre].map((t) => ('d' in t ? `<path d="${t.d}"/>` : `<circle cx="${t.cx}" cy="${t.cy}" r="${t.r}"/>`)).join('')
  return `<svg class="icono" viewBox="0 0 24 24" width="${lado}" height="${lado}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${dentro}</svg>`
}
