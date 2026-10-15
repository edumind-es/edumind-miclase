/**
 * Lee una hoja de respuestas en una foto: dónde está, de quién es y qué
 * burbujas están rellenas.
 *
 * Todo pasa en el aparato, sobre el búfer de píxeles, sin OpenCV ni servidor:
 *
 *  1. Las cuatro marcas negras de las esquinas se buscan como manchas
 *     oscuras, cuadradas y macizas, una por esquina de la foto. Se trabaja
 *     sobre una copia reducida: para encontrar un cuadrado de un centímetro
 *     no hace falta la foto entera.
 *  2. Con sus cuatro centros se calcula la homografía milímetros → píxeles.
 *     A partir de ahí la foto puede estar torcida, en perspectiva o del
 *     revés: cada cosa de la hoja (`db/hojaOMR.ts`) se busca donde dice la
 *     geometría. Si el QR no se lee, se prueban las otras tres orientaciones.
 *  3. El QR se recorta enderezado y lo decodifica jsQR: dice la prueba, el
 *     alumno y el tamaño de la parrilla.
 *  4. Cada burbuja se compara con el papel que la rodea: oscuridad relativa,
 *     para que una foto con sombra no cuente como todo marcado. Una pregunta
 *     con dos burbujas oscuras, o una a medias, se devuelve como dudosa: el
 *     docente decide, el escáner no adivina.
 *
 * Puro salvo jsQR. Se prueba en `pruebas/hoja-escaner.test.mjs` con la hoja
 * que imprime la propia app, fotografiada de mentira (girada y sobre fondo).
 */
import jsQR from 'jsqr'
import {
  MARCAS, MARCA, QR, BURBUJA, centroBurbuja, leerPayloadHoja, type PayloadHoja,
} from '../db/hojaOMR'

export type Gris = { ancho: number; alto: number; datos: Uint8Array }
export type Punto = { x: number; y: number }

/** RGBA → gris (luma). */
export function aGris(rgba: Uint8ClampedArray | Uint8Array, ancho: number, alto: number): Gris {
  const datos = new Uint8Array(ancho * alto)
  for (let i = 0, j = 0; i < datos.length; i++, j += 4) {
    datos[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8
  }
  return { ancho, alto, datos }
}

function reducir(g: Gris, ladoMaximo: number): { gris: Gris; factor: number } {
  const factor = Math.max(1, Math.ceil(Math.max(g.ancho, g.alto) / ladoMaximo))
  if (factor === 1) return { gris: g, factor }
  const ancho = Math.floor(g.ancho / factor), alto = Math.floor(g.alto / factor)
  const datos = new Uint8Array(ancho * alto)
  const n = factor * factor
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
    let s = 0
    for (let dy = 0; dy < factor; dy++) for (let dx = 0; dx < factor; dx++) s += g.datos[(y * factor + dy) * g.ancho + x * factor + dx]
    datos[y * ancho + x] = s / n
  }
  return { gris: { ancho, alto, datos }, factor }
}

/** Umbral de Otsu: separa papel de tinta sin fijar un número a ojo. */
export function umbralOtsu(g: Gris): number {
  const h = new Float64Array(256)
  for (const v of g.datos) h[v]++
  const total = g.datos.length
  let suma = 0
  for (let i = 0; i < 256; i++) suma += i * h[i]
  let sumaB = 0, pesoB = 0, mejor = 0, umbral = 128
  for (let t = 0; t < 256; t++) {
    pesoB += h[t]; if (!pesoB) continue
    const pesoF = total - pesoB; if (!pesoF) break
    sumaB += t * h[t]
    const mB = sumaB / pesoB, mF = (suma - sumaB) / pesoF
    const entre = pesoB * pesoF * (mB - mF) ** 2
    if (entre > mejor) { mejor = entre; umbral = t }
  }
  return umbral
}

type Mancha = { cx: number; cy: number; x0: number; y0: number; x1: number; y1: number; area: number; borde: boolean }

/** Manchas oscuras conexas (4-vecinos) de la imagen reducida. */
function manchas(g: Gris, umbral: number): Mancha[] {
  const { ancho, alto, datos } = g
  const visto = new Uint8Array(ancho * alto)
  const salida: Mancha[] = []
  const pila = new Int32Array(ancho * alto)
  for (let inicio = 0; inicio < datos.length; inicio++) {
    if (visto[inicio] || datos[inicio] >= umbral) continue
    let n = 0, top = 0
    pila[top++] = inicio; visto[inicio] = 1
    let sx = 0, sy = 0, x0 = ancho, y0 = alto, x1 = 0, y1 = 0, borde = false
    while (top) {
      const i = pila[--top]
      const x = i % ancho, y = (i - x) / ancho
      n++; sx += x; sy += y
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      if (x === 0 || y === 0 || x === ancho - 1 || y === alto - 1) borde = true
      const vecinos = [i - 1, i + 1, i - ancho, i + ancho]
      if (x === 0) vecinos[0] = -1
      if (x === ancho - 1) vecinos[1] = -1
      for (const v of vecinos) {
        if (v < 0 || v >= datos.length || visto[v] || datos[v] >= umbral) continue
        visto[v] = 1; pila[top++] = v
      }
    }
    if (n >= 12) salida.push({ cx: sx / n, cy: sy / n, x0, y0, x1, y1, area: n, borde })
  }
  return salida
}

/**
 * Las cuatro marcas: cuadradas, macizas, sin tocar el borde, de tamaño
 * parecido entre sí, y cada una la más cercana a una esquina de la foto.
 * Devuelve sus centros en píxeles de la foto original, en el orden TL, TR,
 * BL, BR de la foto (no de la hoja: eso lo decide después el QR).
 */
export function buscarMarcas(g: Gris): Punto[] | null {
  // A 900 px el anillo blanco de los patrones del QR (más de un milímetro)
  // sigue viéndose, y así no pasan por marcas macizas.
  const { gris, factor } = reducir(g, 900)
  const umbral = umbralOtsu(gris)
  const lado = Math.max(gris.ancho, gris.alto)
  // Una marca es un cuadrado macizo: llena su caja, y girada hasta unos 15°
  // sigue llenando más del 74 %. Los patrones de posición del QR, con su
  // anillo blanco, se quedan por debajo. Una burbuja rellena (78 %) pasa el
  // filtro, pero es cuatro veces más pequeña: no llega a las mayores.
  const candidatas = manchas(gris, umbral).filter(m => {
    const bw = m.x1 - m.x0 + 1, bh = m.y1 - m.y0 + 1
    const relleno = m.area / (bw * bh), aspecto = bw / bh
    const tam = Math.max(bw, bh) / lado
    return !m.borde && relleno > 0.74 && aspecto > 0.7 && aspecto < 1.45 && tam > 0.012 && tam < 0.12
  })
  if (candidatas.length < 4) return null
  // Las marcas están entre las mayores; de ellas, cada esquina de la foto se
  // queda con la más cercana.
  const grandes = [...candidatas].sort((a, b) => b.area - a.area).slice(0, 8)
  const esquinas = [[0, 0], [gris.ancho, 0], [0, gris.alto], [gris.ancho, gris.alto]]
  const elegidas: Mancha[] = []
  for (const [ex, ey] of esquinas) {
    let mejor: Mancha | null = null, d0 = Infinity
    for (const m of grandes) {
      if (elegidas.includes(m)) continue
      const d = (m.cx - ex) ** 2 + (m.cy - ey) ** 2
      if (d < d0) { d0 = d; mejor = m }
    }
    if (!mejor) return null
    elegidas.push(mejor)
  }
  // Las cuatro del mismo tamaño (la perspectiva no llega a triplicar un área)
  // y formando un cuadrilátero que no sea diminuto.
  const areas = elegidas.map(m => m.area)
  if (Math.max(...areas) > Math.min(...areas) * 3) return null
  const [tl, tr, bl, br] = elegidas
  const ancho = Math.min(Math.hypot(tr.cx - tl.cx, tr.cy - tl.cy), Math.hypot(br.cx - bl.cx, br.cy - bl.cy))
  const alto = Math.min(Math.hypot(bl.cx - tl.cx, bl.cy - tl.cy), Math.hypot(br.cx - tr.cx, br.cy - tr.cy))
  if (ancho < lado * 0.25 || alto < lado * 0.25) return null
  return elegidas.map(m => ({ x: (m.cx + 0.5) * factor, y: (m.cy + 0.5) * factor }))
}

// ─── Homografía ─────────────────────────────────────────────────────────────

export type Homografia = number[]

/** H tal que H·(x, y, 1) ≈ (u, v, w) con (u/w, v/w) el punto destino. Cuatro correspondencias. */
export function homografia(origen: Punto[], destino: Punto[]): Homografia | null {
  // Sistema 8×8 por eliminación de Gauss con pivote.
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = origen[i], { x: u, y: v } = destino[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let c = 0; c < 8; c++) {
    let p = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    if (Math.abs(A[p][c]) < 1e-12) return null
    ;[A[c], A[p]] = [A[p], A[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  const h = A.map((fila, i) => fila[8] / fila[i])
  return [...h, 1]
}

export function aplicar(H: Homografia, p: Punto): Punto {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

function muestra(g: Gris, p: Punto): number {
  const x = Math.round(p.x), y = Math.round(p.y)
  if (x < 0 || y < 0 || x >= g.ancho || y >= g.alto) return 255
  return g.datos[y * g.ancho + x]
}

// ─── El QR ──────────────────────────────────────────────────────────────────

const PX_POR_MM_QR = 6
const MARGEN_QR = 4

/** Recorta el QR enderezado y lo decodifica. */
function leerQR(g: Gris, H: Homografia): PayloadHoja | null {
  const lado = Math.round((QR.lado + MARGEN_QR * 2) * PX_POR_MM_QR)
  const rgba = new Uint8ClampedArray(lado * lado * 4)
  for (let py = 0; py < lado; py++) for (let px = 0; px < lado; px++) {
    const v = muestra(g, aplicar(H, { x: QR.x - MARGEN_QR + px / PX_POR_MM_QR, y: QR.y - MARGEN_QR + py / PX_POR_MM_QR }))
    const i = (py * lado + px) * 4
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255
  }
  const codigo = jsQR(rgba, lado, lado, { inversionAttempts: 'dontInvert' })
  return codigo ? leerPayloadHoja(codigo.data) : null
}

// ─── Las burbujas ───────────────────────────────────────────────────────────

export type LecturaPregunta = {
  pregunta: number
  /** Opción marcada (0 = A) o null si está en blanco. */
  marcada: number | null
  /** Dos marcas, o una a medias: que lo mire el docente. */
  dudosa: boolean
  /** Oscuridad relativa de cada opción, 0 (papel) a 1 (tinta). */
  oscuridad: number[]
}

/** Umbrales de oscuridad relativa: marcada a partir de 0,4; entre 0,22 y 0,4, dudosa. */
export const UMBRAL_MARCADA = 0.4
export const UMBRAL_DUDA = 0.22

/** Oscuridad relativa de una burbuja: su interior frente al papel de alrededor. */
function oscuridadBurbuja(g: Gris, H: Homografia, cx: number, cy: number): number {
  const r = BURBUJA.diametro / 2
  let dentro = 0, nDentro = 0, fuera = 0, nFuera = 0
  const paso = 0.3
  for (let dy = -r * 1.8; dy <= r * 1.8; dy += paso) for (let dx = -r * 1.8; dx <= r * 1.8; dx += paso) {
    const d = Math.hypot(dx, dy)
    if (d <= r * 0.72) { dentro += muestra(g, aplicar(H, { x: cx + dx, y: cy + dy })); nDentro++ }
    else if (d >= r * 1.35 && d <= r * 1.8) { fuera += muestra(g, aplicar(H, { x: cx + dx, y: cy + dy })); nFuera++ }
  }
  const papel = nFuera ? fuera / nFuera : 255
  const tinta = nDentro ? dentro / nDentro : 255
  if (papel <= 8) return 0
  return Math.max(0, Math.min(1, 1 - tinta / papel))
}

export function leerBurbujas(g: Gris, H: Homografia, nPreguntas: number, nOpciones: number): LecturaPregunta[] {
  const salida: LecturaPregunta[] = []
  for (let i = 0; i < nPreguntas; i++) {
    const oscuridad: number[] = []
    for (let j = 0; j < nOpciones; j++) {
      const c = centroBurbuja(i, j)
      oscuridad.push(Math.round(oscuridadBurbuja(g, H, c.cx, c.cy) * 100) / 100)
    }
    const orden = oscuridad.map((o, j) => ({ o, j })).sort((a, b) => b.o - a.o)
    const [primera, segunda] = orden
    let marcada: number | null = null, dudosa = false
    if (primera.o >= UMBRAL_MARCADA) {
      marcada = primera.j
      // Dos oscuras: una tachada y otra rellena, o dos rellenas. Se propone la
      // más oscura, pero que lo confirme el docente.
      if (segunda && segunda.o >= UMBRAL_MARCADA) dudosa = true
    } else if (primera.o >= UMBRAL_DUDA) {
      marcada = primera.j
      dudosa = true
    }
    salida.push({ pregunta: i, marcada, dudosa, oscuridad })
  }
  return salida
}

// ─── Todo junto ─────────────────────────────────────────────────────────────

export type LecturaHoja = {
  payload: PayloadHoja
  /** Homografía mm → píxeles de la foto, para pintar encima lo leído. */
  H: Homografia
  /** Las cuatro marcas en la foto, en el orden de la hoja (TL, TR, BL, BR). */
  marcas: Punto[]
  preguntas: LecturaPregunta[]
}

export type ResultadoLectura =
  | { estado: 'sin-marcas' }
  | { estado: 'sin-qr'; marcas: Punto[] }
  | { estado: 'leida'; lectura: LecturaHoja }

/**
 * Lee una hoja de respuestas en una foto. `esperado` acota la parrilla al
 * examen que se está corrigiendo; si el QR dice otra cosa, se devuelve lo
 * que dice el QR y el llamante decide.
 */
export function leerHoja(g: Gris): ResultadoLectura {
  const enFoto = buscarMarcas(g)
  if (!enFoto) return { estado: 'sin-marcas' }
  const mm = MARCAS.map(m => ({ x: m.cx, y: m.cy }))
  // La hoja puede estar girada: TL de la foto puede ser cualquier esquina de
  // la hoja. Se prueban las cuatro orientaciones hasta que el QR se lea.
  const ordenes = [
    [0, 1, 2, 3], // derecha
    [3, 2, 1, 0], // del revés
    [1, 3, 0, 2], // girada 90° (apaisada)
    [2, 0, 3, 1], // girada 270°
  ]
  for (const orden of ordenes) {
    const marcas = orden.map(i => enFoto[i])
    const H = homografia(mm, marcas)
    if (!H) continue
    const payload = leerQR(g, H)
    if (!payload) continue
    return { estado: 'leida', lectura: { payload, H, marcas, preguntas: leerBurbujas(g, H, payload.nPreguntas, payload.nOpciones) } }
  }
  return { estado: 'sin-qr', marcas: enFoto }
}

/** El lado de la marca en píxeles de la foto: para saber si la hoja está lejos. */
export function escalaPxPorMm(H: Homografia): number {
  const a = aplicar(H, { x: MARCAS[0].cx, y: MARCAS[0].cy }), b = aplicar(H, { x: MARCAS[1].cx, y: MARCAS[1].cy })
  return Math.hypot(b.x - a.x, b.y - a.y) / (MARCAS[1].cx - MARCAS[0].cx)
}

export { MARCA }
