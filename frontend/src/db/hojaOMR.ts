/**
 * La hoja de respuestas de un test: dónde va cada cosa, en milímetros.
 *
 * Es el contrato entre lo que se imprime (`informes/hojasTest.ts`) y lo que
 * la cámara lee (`utils/lectorHoja.ts`): los dos parten de esta geometría y
 * de nada más. Cambiarla aquí cambia las dos a la vez; cambiarla en una sola
 * rompería la corrección de las hojas ya impresas, así que lleva versión en
 * el QR.
 *
 * La hoja es un A4 con cuatro marcas negras en las esquinas. Todo lo demás
 * —título, nombre, QR y burbujas— está dentro del marco que forman, de modo
 * que con las cuatro marcas localizadas se sabe dónde cae cada burbuja aunque
 * la foto esté torcida o en perspectiva.
 *
 * Puro: sin DOM ni base de datos. Se prueba en `pruebas/hoja-omr.test.ts`.
 */

/** Versión de la geometría. Va en el QR: una hoja vieja no se lee con una regla nueva. */
export const VERSION_HOJA = 1

/** Lo que cabe en una hoja: dos columnas de 25 preguntas, hasta cinco opciones. */
export const MAX_PREGUNTAS_HOJA = 50
export const MAX_OPCIONES_HOJA = 5
const POR_COLUMNA = 25

/** A4 en milímetros. */
export const PAGINA = { ancho: 210, alto: 297 } as const

/** Lado de cada marca de esquina y centro de las cuatro (TL, TR, BL, BR). */
export const MARCA = { lado: 10 } as const
export const MARCAS: readonly { cx: number; cy: number }[] = [
  { cx: 15, cy: 15 }, { cx: 195, cy: 15 }, { cx: 15, cy: 282 }, { cx: 195, cy: 282 },
]

/** El QR del alumno: arriba a la derecha, dentro del marco. */
export const QR = { x: 150, y: 24, lado: 34 } as const

/** Burbujas: diámetro y paso. Columnas a x fijo; filas desde `y0`. */
export const BURBUJA = { diametro: 5, paso: 8, y0: 70, numeroAncho: 9 } as const
const COLUMNAS_X = [30, 110] as const

export type Burbuja = {
  /** Índice de la pregunta (0 = la primera) y de la opción (0 = A). */
  pregunta: number
  opcion: number
  /** Centro y radio, en mm sobre la página. */
  cx: number
  cy: number
  r: number
}

export type GeometriaHoja = {
  nPreguntas: number
  nOpciones: number
  burbujas: Burbuja[]
  /** x de cada columna de preguntas y las filas que tiene. */
  columnas: { x: number; desde: number; hasta: number }[]
}

export function cabeEnHoja(nPreguntas: number, nOpciones: number): boolean {
  return nPreguntas >= 1 && nPreguntas <= MAX_PREGUNTAS_HOJA && nOpciones >= 2 && nOpciones <= MAX_OPCIONES_HOJA
}

/** Centro de la burbuja de una pregunta y una opción. */
export function centroBurbuja(pregunta: number, opcion: number): { cx: number; cy: number } {
  const col = Math.floor(pregunta / POR_COLUMNA)
  const fila = pregunta % POR_COLUMNA
  return {
    cx: COLUMNAS_X[col] + BURBUJA.numeroAncho + opcion * BURBUJA.paso + BURBUJA.diametro / 2,
    cy: BURBUJA.y0 + fila * BURBUJA.paso + BURBUJA.diametro / 2,
  }
}

export function geometriaHoja(nPreguntas: number, nOpciones: number): GeometriaHoja {
  if (!cabeEnHoja(nPreguntas, nOpciones)) {
    throw new Error(`Una hoja admite de 1 a ${MAX_PREGUNTAS_HOJA} preguntas con 2 a ${MAX_OPCIONES_HOJA} opciones (pedidas: ${nPreguntas} × ${nOpciones}).`)
  }
  const burbujas: Burbuja[] = []
  for (let i = 0; i < nPreguntas; i++) {
    for (let j = 0; j < nOpciones; j++) {
      burbujas.push({ pregunta: i, opcion: j, ...centroBurbuja(i, j), r: BURBUJA.diametro / 2 })
    }
  }
  const columnas = []
  for (let c = 0; c * POR_COLUMNA < nPreguntas; c++) {
    columnas.push({ x: COLUMNAS_X[c], desde: c * POR_COLUMNA, hasta: Math.min(nPreguntas, (c + 1) * POR_COLUMNA) - 1 })
  }
  return { nPreguntas, nOpciones, burbujas, columnas }
}

// ─── El QR de la hoja ──────────────────────────────────────────────────────

export type PayloadHoja = {
  version: number
  /** Fila de `rubricas` con la definición del examen. */
  prueba_id: number
  alumno_id: number
  nPreguntas: number
  nOpciones: number
}

const PREFIJO = 'MCT'

/** Lo que lleva el QR: corto a propósito, para que los módulos salgan grandes y se lea de lejos. */
export function payloadHoja(p: Omit<PayloadHoja, 'version'>): string {
  return `${PREFIJO}${VERSION_HOJA}|${p.prueba_id}|${p.alumno_id}|${p.nPreguntas}|${p.nOpciones}`
}

/** Lee el QR de una hoja. Cualquier otro QR —el de una mesa, el de emparejar— da null. */
export function leerPayloadHoja(texto: string): PayloadHoja | null {
  const m = /^MCT(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)$/.exec(texto.trim())
  if (!m) return null
  const [, v, prueba, alumno, n, k] = m.map(Number)
  if (v !== VERSION_HOJA) return null
  if (!cabeEnHoja(n, k)) return null
  return { version: v, prueba_id: prueba, alumno_id: alumno, nPreguntas: n, nOpciones: k }
}
