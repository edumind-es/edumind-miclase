/**
 * La identidad de un área dentro de su clase: una sigla y un color.
 *
 * Sirven para que el docente sepa de un vistazo en qué área está cuando
 * califica (petición de Luis, nov 2026). Reglas que no se deben romper:
 *  · el color NUNCA va solo: siempre lo acompaña la sigla;
 *  · vive en el marco y en el hub de áreas, no dentro de la tabla de notas,
 *    donde mandan el semáforo y el color de instrumento;
 *  · los diez tonos dan 4,5:1 o más bajo la sigla en blanco.
 *
 * El área puede guardar los suyos (`Asignatura.color` y `.sigla`, sin índice);
 * si no, el color le toca por orden entre las áreas de la clase y la sigla
 * sale del nombre. Puro: se prueba en `areas.test.ts`.
 */
export const PALETA_AREAS = ['#5b4a8a', '#2c6e8a', '#8f4a2b', '#457436', '#846514', '#a23f5c', '#1f6e63', '#8e4a8c', '#3c5a9c', '#666a22'] as const

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Áreas con sigla de uso corriente, en castellano y en galego. La primera que casa, manda. */
const CONOCIDAS: [RegExp, string][] = [
  [/matemat/, 'MAT'],
  [/gal(l)?eg/, 'LG'],
  [/castel|lengua castellana|lingua castela/, 'LC'],
  [/ingles|extranjera|estranxeira/, 'ING'],
  [/frances/, 'FR'],
  [/natur/, 'CN'],
  [/socia/, 'CS'],
  [/conocimiento del medio|conecemento do medio/, 'CM'],
  [/educacion fisica/, 'EF'],
  [/plastica|artistica/, 'EPV'],
  [/music/, 'MUS'],
  [/valores/, 'VAL'],
  [/relix|relig/, 'REL'],
  [/tecnolox|tecnolog|dixital|digital/, 'TEC'],
  [/fisica e quimica|fisica y quimica/, 'FQ'],
  [/bioloxia|biologia/, 'BX'],
  [/xeografia|geografia|historia/, 'XH'],
]
const VACIAS = new Set(['de', 'del', 'da', 'do', 'das', 'dos', 'e', 'y', 'la', 'el', 'a', 'o', 'en', 'las', 'los'])

/** La sigla de un área por su nombre: la corriente si la hay, o sus iniciales. Dos a cuatro letras. */
export function siglaDeNombre(nombre: string): string {
  const n = sinTildes(nombre)
  for (const [rx, sigla] of CONOCIDAS) if (rx.test(n)) return sigla
  const palabras = n.split(/[^a-z0-9]+/).filter(p => p && !VACIAS.has(p))
  if (!palabras.length) return '?'
  const sigla = palabras.length === 1 ? palabras[0].slice(0, 3) : palabras.slice(0, 3).map(p => p[0]).join('')
  return sigla.toUpperCase()
}

/** El papel teñido con un color: ese color al 9 % sobre el papel. Calculado, sin `color-mix` (iOS 15). */
export function tenir(hex: string, k = 0.09): string {
  const papel = [0xec, 0xe9, 0xe1]
  return '#' + [1, 3, 5].map((p, i) => Math.round(parseInt(hex.slice(p, p + 2), 16) * k + papel[i] * (1 - k)).toString(16).padStart(2, '0')).join('')
}

export interface IdentidadArea { sigla: string; color: string; papel: string }

const esColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

/**
 * Sigla y color de cada área de una clase, en el orden en que llegan. Dos
 * áreas no comparten sigla: a la segunda se le añade un número.
 */
export function identidadDeAreas<A extends { id?: number; nombre_display: string; color?: string | null; sigla?: string | null }>(areas: A[]): Map<number, IdentidadArea> {
  const usadas = new Map<string, number>()
  const salida = new Map<number, IdentidadArea>()
  areas.forEach((a, i) => {
    const base = (a.sigla?.trim() || siglaDeNombre(a.nombre_display)).toUpperCase().slice(0, 4)
    const veces = (usadas.get(base) ?? 0) + 1
    usadas.set(base, veces)
    const color = esColor(a.color) ? a.color : PALETA_AREAS[i % PALETA_AREAS.length]
    if (a.id != null) salida.set(a.id, { sigla: veces > 1 ? `${base.slice(0, 3)}${veces}` : base, color, papel: tenir(color) })
  })
  return salida
}
