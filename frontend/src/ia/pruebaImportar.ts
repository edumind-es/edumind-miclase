/**
 * Definir una prueba escrita desde un fichero: hoja de cálculo (.xlsx),
 * Markdown (.md) o JSON (.json). Hermano de `rubricaImportar.ts`.
 *
 * El fichero es una tabla con una fila por pregunta:
 *
 *   | Pregunta | Puntos | Criterio |
 *
 * «Criterio» es opcional: si se rellena, cada criterio recibe la nota de sus
 * preguntas. Encima de la tabla pueden ir, cada uno en su fila, los ajustes
 * del examen —todos opcionales—:
 *
 *   Tipo          puntos | test | niveles
 *   Reparto       nota única | por criterios
 *   Penalización  0,25            (solo test)
 *   Escala        Correcta (2) | Parcial (1) | En blanco (0)   (solo niveles)
 *
 * Puro. Los fallos se lanzan como `Error` con un mensaje para el docente.
 */
import { celdasDeFila } from './rubricaPrompt'
import { leerXlsx, escribirXlsx } from './xlsxMinimo'
import {
  normalizarPrueba,
  type PruebaDef, type TipoPrueba, type RepartoPrueba, type NivelPrueba,
} from '../db/prueba'

export type PruebaImportada = { prueba: PruebaDef; avisos: string[] }

const limpiar = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** «0,25», «25 %» o «1/3» → número. */
function numero(s: unknown): number | undefined {
  if (typeof s === 'number') return Number.isFinite(s) ? s : undefined
  const t = limpiar(s).replace(',', '.')
  const fraccion = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (fraccion) return Number(fraccion[2]) ? Number(fraccion[1]) / Number(fraccion[2]) : undefined
  const pct = t.match(/^(-?\d+(?:\.\d+)?)\s*%$/)
  if (pct) return Number(pct[1]) / 100
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : undefined
}

function tipoDe(texto: string): TipoPrueba | undefined {
  if (/test|acierto/i.test(texto)) return 'test'
  if (/nivel|escala/i.test(texto)) return 'niveles'
  if (/punto/i.test(texto)) return 'puntos'
  return undefined
}

function repartoDe(texto: string): RepartoPrueba | undefined {
  if (/criterio/i.test(texto)) return 'criterios'
  if (/[uú]nica|global|examen/i.test(texto)) return 'unica'
  return undefined
}

function nivelDe(celda: string): NivelPrueba | null {
  const m = celda.match(/^(.+?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(?:pts?\.?|puntos?)?\s*\)$/i)
  return m ? { nombre: m[1].trim(), valor: Number(m[2].replace(',', '.')) } : null
}

const ES_AJUSTE = /^(tipo|reparto|penalizaci[oó]n|escala)\b/i
const ES_SEPARADOR = /^:?-{2,}:?$/

/** Una tabla (de hoja de cálculo o de Markdown) → definición de examen. */
export function pruebaDeFilas(filasOriginales: unknown[][], tituloPorDefecto: string): PruebaImportada {
  const filas = filasOriginales.map(f => (f ?? []).map(limpiar))
  const avisos: string[] = []

  let iCab = -1, c0 = 0
  for (let i = 0; i < filas.length && iCab < 0; i++) {
    const j = filas[i].findIndex(c => /^pregunta/i.test(c))
    if (j >= 0) { iCab = i; c0 = j }
  }
  if (iCab < 0) {
    if (filas.some(f => f.some(c => /^indicador/i.test(c)))) {
      throw new Error('Este fichero parece una rúbrica (tiene una columna «Indicador»), no un examen. Impórtalo desde 📊 Rúbrica.')
    }
    throw new Error('No se encuentra la tabla del examen. Hace falta una fila de cabecera con «Pregunta» y «Puntos», y debajo una fila por pregunta.')
  }

  // Lo que hay encima de la cabecera: el título y los ajustes.
  let titulo = tituloPorDefecto
  let tipo: TipoPrueba | undefined
  let reparto: RepartoPrueba | undefined
  let penalizacion: number | undefined
  let escala: NivelPrueba[] | undefined
  for (let i = 0; i < iCab; i++) {
    const escritas = filas[i].filter(Boolean)
    if (!escritas.length) continue
    const [clave, ...valores] = escritas
    // Un ajuste trae su valor, en otra celda o tras dos puntos. Una celda sola
    // sin valor es el título, aunque empiece por «Tipo…»: «Tipo test» es un
    // nombre de examen perfectamente normal.
    const esAjuste = ES_AJUSTE.test(clave) && (valores.length > 0 || clave.includes(':'))
    if (!esAjuste) {
      if (escritas.length === 1) titulo = clave.replace(/^#+\s*/, '')
      continue
    }
    // «Tipo: test» en una sola celda vale igual que en dos.
    const pegado = clave.split(/:\s*/).slice(1).join(': ')
    const valor = [pegado, ...valores].filter(Boolean)
    if (/^tipo/i.test(clave)) tipo = tipoDe(valor.join(' '))
    else if (/^reparto/i.test(clave)) reparto = repartoDe(valor.join(' '))
    else if (/^penaliz/i.test(clave)) penalizacion = numero(valor[0])
    else if (/^escala/i.test(clave)) {
      const niveles = valor.flatMap(v => v.split(/\s*[|·;]\s*/)).map(nivelDe)
      if (niveles.some(n => !n)) throw new Error('La escala debe llevar los puntos de cada nivel entre paréntesis: «Correcta (2)», «Parcial (1)», «En blanco (0)».')
      escala = niveles as NivelPrueba[]
    }
  }

  const cab = filas[iCab]
  const colPuntos = cab.findIndex((c, j) => j > c0 && /^(puntos?|valor|puntuaci[oó]n|m[aá]x|peso)/i.test(c))
  const colCriterio = cab.findIndex((c, j) => j > c0 && /^criterio/i.test(c))

  const preguntas: { enunciado: string; max: number; criterio_id: string | null }[] = []
  let sinPuntos = 0
  for (let i = iCab + 1; i < filas.length; i++) {
    const f = filas[i]
    const enunciado = f[c0] ?? ''
    const puntos = colPuntos >= 0 ? numero(f[colPuntos]) : undefined
    const criterio = colCriterio >= 0 ? (f[colCriterio] ?? '') : ''
    if (ES_SEPARADOR.test(enunciado)) continue
    // Fila vacía del todo, o una de totales al pie de la hoja: no es una pregunta.
    if (!enunciado && puntos == null && !criterio) continue
    if (/^(total|suma)\b/i.test(enunciado)) continue
    if (puntos == null || puntos <= 0) sinPuntos++
    preguntas.push({ enunciado, max: puntos != null && puntos > 0 ? puntos : 1, criterio_id: criterio || null })
  }
  if (!preguntas.length) throw new Error('El examen no trae preguntas: no hay ninguna fila debajo de la cabecera.')
  if (sinPuntos) avisos.push(`${sinPuntos} pregunta(s) no traían puntos: se les ha puesto 1.`)

  const conCriterio = preguntas.filter(p => p.criterio_id).length
  if (!reparto) reparto = conCriterio > 0 ? 'criterios' : 'unica'
  if (reparto === 'criterios' && conCriterio === 0) {
    avisos.push('El reparto es por criterios pero ninguna pregunta dice cuál evalúa: todas contarán para todos. Asígnalos en el editor.')
  } else if (reparto === 'criterios' && conCriterio < preguntas.length) {
    avisos.push(`${preguntas.length - conCriterio} pregunta(s) sin criterio: contarán para todos los criterios del examen.`)
  }
  if (!tipo) tipo = escala ? 'niveles' : penalizacion != null ? 'test' : 'puntos'

  const prueba = normalizarPrueba({
    titulo, tipo, reparto, penalizacion, escala,
    preguntas: preguntas.map((p, i) => ({ id: `p${i + 1}`, ...p })),
  })
  return { prueba, avisos }
}

/** Markdown → filas. Además de la tabla, admite los ajustes como líneas «Tipo: test». */
export function filasDeMarkdownPrueba(texto: string): string[][] {
  const filas: string[][] = []
  for (const bruta of texto.split('\n')) {
    const linea = bruta.trim().replace(/\*\*|__|`/g, '')
    if (linea.startsWith('#')) filas.push([linea.replace(/^#+\s*/, '')])
    else if (linea.startsWith('|')) filas.push(celdasDeFila(linea))
    else {
      const m = linea.replace(/^[-*]\s+/, '').match(/^(tipo|reparto|penalizaci[oó]n|escala)\s*:\s*(.+)$/i)
      if (m) filas.push([m[1], m[2]])
    }
  }
  return filas
}

export function pruebaDeJson(texto: string, tituloPorDefecto: string): PruebaImportada {
  let p: any
  try { p = JSON.parse(texto) } catch {
    throw new Error('El fichero no es un JSON válido. Si lo has escrito a mano, revisa comas y comillas.')
  }
  const d = p?.prueba ?? p
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('El JSON no contiene un examen.')
  if (d.formato === 'edumind-rubrica' || Array.isArray(d.indicadores)) {
    throw new Error('Este fichero es una rúbrica, no un examen. Impórtalo desde 📊 Rúbrica.')
  }
  if (d.formato && d.formato !== 'edumind-prueba') throw new Error(`El fichero es de tipo «${d.formato}», no un examen.`)
  if (!Array.isArray(d.preguntas) || !d.preguntas.length) throw new Error('Al JSON le falta la lista «preguntas».')
  const prueba = normalizarPrueba({
    titulo: limpiar(d.titulo) || tituloPorDefecto,
    tipo: tipoDe(String(d.tipo ?? '')) ?? 'puntos',
    reparto: repartoDe(String(d.reparto ?? '')) ?? (d.preguntas.some((q: any) => q?.criterio_id || q?.criterio) ? 'criterios' : 'unica'),
    penalizacion: numero(d.penalizacion),
    escala: Array.isArray(d.escala)
      ? d.escala.map((n: any) => typeof n === 'string' ? nivelDe(limpiar(n)) : { nombre: limpiar(n?.nombre), valor: numero(n?.valor) })
      : undefined,
    preguntas: d.preguntas.map((q: any) => typeof q === 'string'
      ? { enunciado: limpiar(q), max: 1 }
      : { id: q?.id, enunciado: limpiar(q?.enunciado ?? q?.pregunta), max: numero(q?.max ?? q?.puntos), criterio_id: limpiar(q?.criterio_id ?? q?.criterio) }),
  } as Partial<PruebaDef>)
  return { prueba, avisos: [] }
}

/** Lee un examen de un fichero. Manda el contenido, no la extensión. */
export async function importarPrueba(nombreFichero: string, datos: ArrayBuffer): Promise<PruebaImportada> {
  const titulo = nombreFichero.replace(/\.[^.]+$/, '').replace(/\.eduprueba$/, '').replace(/[-_]+/g, ' ').trim() || 'Prueba escrita'
  const cabeza = new Uint8Array(datos.slice(0, 8))
  if (cabeza[0] === 0x50 && cabeza[1] === 0x4b) return pruebaDeFilas(await leerXlsx(datos), titulo)
  if (cabeza[0] === 0xd0 && cabeza[1] === 0xcf) {
    throw new Error('Es un Excel antiguo (.xls). Ábrelo y usa «Guardar como» → Libro de Excel (.xlsx).')
  }
  const texto = new TextDecoder().decode(datos).replace(/^﻿/, '')
  if (/^\s*[{[]/.test(texto)) return pruebaDeJson(texto, titulo)
  const filas = filasDeMarkdownPrueba(texto)
  if (!filas.some(f => f.length >= 2)) {
    throw new Error('No se reconoce el fichero. Sirven una hoja de cálculo (.xlsx), un Markdown (.md) con las preguntas en una tabla, o un JSON (.json).')
  }
  return pruebaDeFilas(filas, titulo)
}

// ── Exportar y plantillas ────────────────────────────────────────────────

const NOMBRE_TIPO: Record<TipoPrueba, string> = { puntos: 'puntos', test: 'test', niveles: 'niveles' }
const NOMBRE_REPARTO: Record<RepartoPrueba, string> = { unica: 'nota única', criterios: 'por criterios' }

/** El examen como tabla, con la misma forma que se sabe leer. */
export function filasDePrueba(d: PruebaDef): (string | number)[][] {
  const conCriterio = d.reparto === 'criterios' || d.preguntas.some(p => p.criterio_id)
  return [
    [d.titulo],
    ['Tipo', NOMBRE_TIPO[d.tipo]],
    ['Reparto', NOMBRE_REPARTO[d.reparto]],
    ...(d.tipo === 'test' ? [['Penalización', d.penalizacion ?? 0]] : []),
    ...(d.tipo === 'niveles' ? [['Escala', ...(d.escala ?? []).map(n => `${n.nombre} (${n.valor})`)]] : []),
    ['Pregunta', 'Puntos', ...(conCriterio ? ['Criterio'] : [])],
    ...d.preguntas.map((p, i) => [p.enunciado || `Pregunta ${i + 1}`, p.max, ...(conCriterio ? [p.criterio_id ?? ''] : [])]),
  ]
}

export function pruebaAXlsx(d: PruebaDef): Uint8Array<ArrayBuffer> {
  return escribirXlsx(filasDePrueba(d), 'Examen')
}

export function pruebaAMarkdown(d: PruebaDef): string {
  const filas = filasDePrueba(d)
  const iCab = filas.findIndex(f => f[0] === 'Pregunta')
  const fila = (f: (string | number)[]) => `| ${f.map(c => String(c).replace(/\|/g, '/')).join(' | ')} |`
  const ajustes = filas.slice(1, iCab).map(([clave, ...v]) => `${clave}: ${v.join(' · ')}`)
  const cab = filas[iCab]
  return `# ${filas[0][0]}\n\n${ajustes.join('\n')}\n\n${fila(cab)}\n${fila(cab.map(() => '---'))}\n${filas.slice(iCab + 1).map(fila).join('\n')}\n`
}

export function pruebaAJson(d: PruebaDef): string {
  return JSON.stringify({ formato: 'edumind-prueba', version: 1, exportado: new Date().toISOString(), ...d }, null, 2)
}

/** Examen de muestra para las plantillas: puntos por pregunta, repartido por criterios. */
export const PRUEBA_EJEMPLO: PruebaDef = normalizarPrueba({
  titulo: 'Prueba de la unidad 1',
  tipo: 'puntos',
  reparto: 'criterios',
  preguntas: [
    { id: 'p1', enunciado: '1. Define relieve y pon dos ejemplos', max: 2, criterio_id: 'CE1.1' },
    { id: 'p2', enunciado: '2. Sitúa en el mapa los ríos principales', max: 3, criterio_id: 'CE1.1' },
    { id: 'p3', enunciado: '3. Explica por qué llueve más en la costa', max: 3, criterio_id: 'CE1.2' },
    { id: 'p4', enunciado: '4. Presentación y ortografía', max: 2, criterio_id: null },
  ],
})
