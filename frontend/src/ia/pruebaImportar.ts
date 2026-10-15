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
  normalizarPrueba, LETRAS, MAX_OPCIONES,
  type PruebaDef, type TipoPrueba, type RepartoPrueba, type NivelPrueba, type PreguntaPrueba,
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
  // Un test con clave: «Opciones» (separadas por «;», «·» o «/») y «Correcta» (la letra).
  const colOpciones = cab.findIndex((c, j) => j > c0 && /^opcion/i.test(c))
  const colCorrecta = cab.findIndex((c, j) => j > c0 && /^(correcta|clave|respuesta)/i.test(c))

  const preguntas: Omit<PreguntaPrueba, 'id'>[] = []
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
    const opciones = colOpciones >= 0 ? (f[colOpciones] ?? '').split(/\s*[;·/]\s*/).map(limpiar).filter(Boolean) : []
    const correcta = colCorrecta >= 0 ? letraAIndice(f[colCorrecta] ?? '') : null
    preguntas.push({
      enunciado, max: puntos != null && puntos > 0 ? puntos : 1, criterio_id: criterio || null,
      ...(opciones.length ? { opciones, correcta } : {}),
    })
  }
  if (colOpciones >= 0 && !tipo) tipo = 'test'
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

/** «B», «b)», «2» → índice de la opción; cualquier otra cosa, null. */
export function letraAIndice(texto: string): number | null {
  const t = limpiar(texto).replace(/[).:]+$/, '').toUpperCase()
  const i = (LETRAS as readonly string[]).indexOf(t)
  if (i >= 0) return i
  return /^[1-9]$/.test(t) ? Number(t) - 1 : null
}

const ES_PREGUNTA = /^(?:\*\*)?(?:pregunta\s+)?(\d{1,3})[.)]\s*(?:\*\*)?\s*(.+?)\s*(?:\*\*)?$/i
const ES_OPCION = /^(?:[-*]\s+)?(?:\[([ xX✓✔])\]\s*)?(?:\*\*|\*|✓|✔|→)?\s*([a-fA-F])[.)]\s*(.+?)\s*$/
const MARCA_CORRECTA = /(\*\*|\*|✓|✔)\s*$|\s*\((?:correcta|correct|verdadera|✓)\)\s*$/i
const ES_CLAVE = /^(?:\*\*)?(?:respuestas?|clave|soluciones?|solucionario)(?:\*\*)?\s*:?\s*(.*)$/i
const ES_CRITERIO_PREGUNTA = /^(?:[-*]\s+)?(?:criterio|ce)\s*:?\s*([A-Za-z]{0,3}\d+(?:\.\d+)*)\s*$/i
const ES_PUNTOS_PREGUNTA = /^(?:[-*]\s+)?puntos?\s*:?\s*(\d+(?:[.,]\d+)?)\s*$/i

/**
 * Un examen escrito como examen —no como tabla—: preguntas numeradas y, bajo
 * cada una, sus opciones a), b), c)… La correcta se marca con un asterisco,
 * un ✓, en negrita, con «[x]» o con «(correcta)»; o va al final en una línea
 * «Respuestas: 1-b, 2-c, 3-a». Es lo que escribe una IA cuando se le pide un
 * test, y lo que un docente escribe a mano sin pensar en formatos.
 *
 * Bajo una pregunta también valen «Criterio: CE1.2» y «Puntos: 2».
 */
export function pruebaDeExamenMarkdown(texto: string, tituloPorDefecto: string): PruebaImportada {
  const avisos: string[] = []
  let titulo = tituloPorDefecto
  let penalizacion: number | undefined
  let reparto: RepartoPrueba | undefined
  const preguntas: Omit<PreguntaPrueba, 'id'>[] = []
  let actual: Omit<PreguntaPrueba, 'id'> | null = null
  const clave = new Map<number, number>()
  let enClave = false

  for (const bruta of texto.split('\n')) {
    const linea = bruta.trim().replace(/`/g, '')
    if (!linea) continue
    if (linea.startsWith('#')) {
      const t = linea.replace(/^#+\s*/, '').replace(/\*\*/g, '')
      if (preguntas.length === 0 && !actual) titulo = t
      enClave = false
      continue
    }
    const ajuste = linea.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').match(/^(penalizaci[oó]n|reparto)\s*:\s*(.+)$/i)
    if (ajuste && !actual) {
      if (/^penaliz/i.test(ajuste[1])) penalizacion = numero(ajuste[2])
      else reparto = repartoDe(ajuste[2])
      continue
    }
    const mClave = linea.match(ES_CLAVE)
    if (mClave) {
      enClave = true
      for (const [, n, l] of mClave[1].matchAll(/(\d{1,3})\s*[-–:.)]?\s*([a-fA-F])\b/g)) {
        const i = letraAIndice(l); if (i != null) clave.set(Number(n), i)
      }
      continue
    }
    if (enClave) {
      // Las líneas siguientes de la clave: «1. b», «2 - c», o varias por línea.
      const pares = [...linea.matchAll(/(\d{1,3})\s*[-–:.)]?\s*([a-fA-F])\b/g)]
      if (pares.length) { for (const [, n, l] of pares) { const i = letraAIndice(l); if (i != null) clave.set(Number(n), i) } continue }
      enClave = false
    }
    const mPregunta = linea.match(ES_PREGUNTA)
    // Una línea «1. …» es pregunta salvo que parezca una opción suelta.
    if (mPregunta && !ES_OPCION.test(linea)) {
      actual = { enunciado: mPregunta[2].replace(/\*\*/g, '').trim(), max: 1, criterio_id: null, opciones: [], correcta: null }
      preguntas.push(actual)
      continue
    }
    if (!actual) continue
    const mCriterio = linea.match(ES_CRITERIO_PREGUNTA)
    if (mCriterio) { actual.criterio_id = mCriterio[1].toUpperCase(); continue }
    const mPuntos = linea.match(ES_PUNTOS_PREGUNTA)
    if (mPuntos) { actual.max = numero(mPuntos[1]) ?? 1; continue }
    const mOpcion = linea.match(ES_OPCION)
    if (mOpcion) {
      // La casilla «[x]» puede ir antes o después de la letra.
      const casillaDespues = mOpcion[3].match(/^\[([ xX✓✔])\]\s*/)
      const marcada = !!(mOpcion[1] && mOpcion[1] !== ' ') || !!(casillaDespues && casillaDespues[1] !== ' ')
        || /^(?:[-*]\s+)?(?:\*\*|\*|✓|✔|→)/.test(linea) || MARCA_CORRECTA.test(mOpcion[3])
      const textoOpcion = mOpcion[3].replace(/^\[([ xX✓✔])\]\s*/, '').replace(MARCA_CORRECTA, '').replace(/\*\*/g, '').trim()
      const i = letraAIndice(mOpcion[2])
      const opciones = actual.opciones!
      // La letra manda sobre el orden: una opción «c)» va en la tercera casilla.
      const pos = i != null && i < MAX_OPCIONES ? i : opciones.length
      while (opciones.length <= pos) opciones.push('')
      opciones[pos] = textoOpcion
      if (marcada) actual.correcta = pos
      continue
    }
    // Texto suelto bajo la pregunta: continúa el enunciado.
    if (actual.opciones!.length === 0) actual.enunciado = `${actual.enunciado} ${linea.replace(/\*\*/g, '')}`.trim()
  }

  if (!preguntas.length) throw new Error('No se encuentran preguntas numeradas («1. …») con sus opciones («a) …»).')
  preguntas.forEach((p, i) => {
    const deClave = clave.get(i + 1)
    if (deClave != null && (p.opciones?.length ?? 0) > deClave) p.correcta = deClave
    // Huecos de letras que nadie escribió («a» y «c» sin «b»).
    p.opciones = (p.opciones ?? []).map(o => o || '—')
  })
  const sinOpciones = preguntas.filter(p => (p.opciones?.length ?? 0) < 2).length
  const sinCorrecta = preguntas.filter(p => (p.opciones?.length ?? 0) >= 2 && p.correcta == null).length
  if (sinOpciones === preguntas.length) throw new Error('Las preguntas no traen opciones: para un test hacen falta al menos dos por pregunta («a) …», «b) …»).')
  if (sinOpciones) avisos.push(`${sinOpciones} pregunta(s) con menos de dos opciones.`)
  if (sinCorrecta) avisos.push(`${sinCorrecta} pregunta(s) sin marcar la correcta: márcala en el editor.`)
  const conCriterio = preguntas.filter(p => p.criterio_id).length
  if (!reparto) reparto = conCriterio > 0 ? 'criterios' : 'unica'
  const prueba = normalizarPrueba({
    titulo, tipo: 'test', reparto, penalizacion,
    preguntas: preguntas.map((p, i) => ({ id: `p${i + 1}`, ...p })),
  })
  return { prueba, avisos }
}

/** Hay al menos dos preguntas numeradas seguidas de opciones con letra. */
export function pareceExamenMarkdown(texto: string): boolean {
  let preguntas = 0, opciones = 0
  for (const bruta of texto.split('\n')) {
    const l = bruta.trim()
    if (ES_PREGUNTA.test(l) && !ES_OPCION.test(l)) preguntas++
    else if (ES_OPCION.test(l)) opciones++
  }
  return preguntas >= 1 && opciones >= 2 && !/^\s*\|/m.test(texto)
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
      : {
        id: q?.id, enunciado: limpiar(q?.enunciado ?? q?.pregunta), max: numero(q?.max ?? q?.puntos), criterio_id: limpiar(q?.criterio_id ?? q?.criterio),
        opciones: Array.isArray(q?.opciones) ? q.opciones.map(limpiar) : undefined,
        correcta: typeof q?.correcta === 'string' ? letraAIndice(q.correcta) : numero(q?.correcta),
      }),
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
  if (pareceExamenMarkdown(texto)) return pruebaDeExamenMarkdown(texto, titulo)
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
  const conOpciones = d.tipo === 'test' && d.preguntas.some(p => p.opciones?.length)
  return [
    [d.titulo],
    ['Tipo', NOMBRE_TIPO[d.tipo]],
    ['Reparto', NOMBRE_REPARTO[d.reparto]],
    ...(d.tipo === 'test' ? [['Penalización', d.penalizacion ?? 0]] : []),
    ...(d.tipo === 'niveles' ? [['Escala', ...(d.escala ?? []).map(n => `${n.nombre} (${n.valor})`)]] : []),
    ['Pregunta', 'Puntos', ...(conCriterio ? ['Criterio'] : []), ...(conOpciones ? ['Opciones', 'Correcta'] : [])],
    ...d.preguntas.map((p, i) => [
      p.enunciado || `Pregunta ${i + 1}`, p.max,
      ...(conCriterio ? [p.criterio_id ?? ''] : []),
      ...(conOpciones ? [(p.opciones ?? []).map(o => o.replace(/[;·/]/g, ',')).join(' ; '), p.correcta != null ? LETRAS[p.correcta] : ''] : []),
    ]),
  ]
}

/**
 * El examen tal como lo lee el alumnado: título, preguntas y opciones. Sin la
 * clave, salvo que se pida. Es el mismo formato que se sabe importar.
 */
export function examenAMarkdown(d: PruebaDef, opciones: { conClave?: boolean } = {}): string {
  const lineas = [`# ${d.titulo}`, '']
  if (opciones.conClave && d.penalizacion) lineas.push(`Penalización: ${d.penalizacion}`, '')
  d.preguntas.forEach((p, i) => {
    lineas.push(`${i + 1}. ${p.enunciado || `Pregunta ${i + 1}`}`)
    if (opciones.conClave && p.criterio_id) lineas.push(`   Criterio: ${p.criterio_id}`)
    if (opciones.conClave && p.max !== 1) lineas.push(`   Puntos: ${p.max}`)
    ;(p.opciones ?? []).forEach((o, j) => lineas.push(`   ${LETRAS[j].toLowerCase()}) ${o}`))
    lineas.push('')
  })
  if (opciones.conClave) {
    lineas.push(`Respuestas: ${d.preguntas.map((p, i) => `${i + 1}-${p.correcta != null ? LETRAS[p.correcta].toLowerCase() : '?'}`).join(', ')}`, '')
  }
  return lineas.join('\n')
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
