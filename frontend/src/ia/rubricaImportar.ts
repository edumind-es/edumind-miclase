/**
 * Importar una rúbrica desde un fichero: hoja de cálculo (.xlsx), Markdown
 * (.md) o JSON (.json).
 *
 * Los tres formatos acaban en el mismo sitio —una tabla de indicadores por
 * niveles— y pasan por la misma comprobación (`componer`), para que una
 * rúbrica no se lea distinto según de dónde venga.
 *
 * La tabla, en hoja de cálculo o en Markdown, es siempre la misma:
 *
 *   | Indicador | Peso | Excelente (4) | Notable (3) | Bien (2) | Insuficiente (1) |
 *
 * «Peso» es opcional. Los puntos de cada nivel van entre paréntesis.
 *
 * Puro: no toca la base de datos ni la pantalla. Los fallos se lanzan como
 * `Error` con un mensaje que el docente puede leer tal cual.
 */
import { celdasDeFila, type RubricaParsed, type RubricaNivel, type RubricaIndicador } from './rubricaPrompt'
import { leerXlsx, escribirXlsx } from './xlsxMinimo'

export type RubricaImportada = {
  rubrica: RubricaParsed
  /** Lo que se ha tenido que suponer o arreglar al leer. Se enseña al docente. */
  avisos: string[]
  /** Solo lo trae el formato propio (.edurubrica.json). */
  contexto?: string
  area?: string
}

type NivelCrudo = { nombre: string; valor?: number }
type IndicadorCrudo = { nombre: string; peso?: number; celdas: string[] }

const limpiar = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** «25», «25 %», «33,3» o «0.25» → número. Lo que no sea un número, `undefined`. */
function numero(s: unknown): number | undefined {
  if (typeof s === 'number') return Number.isFinite(s) ? s : undefined
  const t = limpiar(s).replace(/%$/, '').trim().replace(',', '.')
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return undefined
  return Number(t)
}

const redondear = (n: number) => Math.round(n * 10) / 10

/** «Excelente (4)», «Bien (2,5 pts)» → nombre y puntos. Sin paréntesis, solo nombre. */
function nivelDeCabecera(celda: string): NivelCrudo {
  const m = celda.match(/^(.+?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(?:pts?\.?|puntos?)?\s*\)$/i)
  return m ? { nombre: m[1].trim(), valor: Number(m[2].replace(',', '.')) } : { nombre: celda }
}

/**
 * Comprobación y remate comunes a los tres formatos.
 *
 * Aquí se decide lo que un fichero hecho a mano suele dejar a medias: niveles
 * sin puntos, pesos escritos como porcentaje de Excel (0,25) o que no suman
 * 100. Nada de eso impide importar; se arregla lo evidente y se avisa.
 */
function componer(titulo: string, nivelesCrudos: NivelCrudo[], indicadoresCrudos: IndicadorCrudo[]): RubricaImportada {
  const avisos: string[] = []
  if (!nivelesCrudos.length) throw new Error('La rúbrica no trae niveles: faltan las columnas «Excelente (4)», «Notable (3)»…')
  if (!indicadoresCrudos.length) throw new Error('La rúbrica no trae indicadores: no hay ninguna fila debajo de la cabecera.')

  // Los descriptores se guardan por nombre de nivel: dos niveles con el mismo
  // nombre se pisarían el uno al otro.
  const vistos = new Set<string>()
  const nombres = nivelesCrudos.map((n, i) => {
    let nombre = limpiar(n.nombre) || `Nivel ${i + 1}`
    while (vistos.has(nombre)) nombre += ' (bis)'
    vistos.add(nombre)
    return nombre
  })

  const conPuntos = nivelesCrudos.filter(n => typeof n.valor === 'number').length
  if (conPuntos > 0 && conPuntos < nivelesCrudos.length) {
    const sin = nombres.filter((_, i) => typeof nivelesCrudos[i].valor !== 'number')
    throw new Error(`Hay niveles sin puntos: ${sin.map(s => `«${s}»`).join(', ')}. Escríbelos como «${sin[0]} (2)», con los puntos entre paréntesis.`)
  }
  const total = nivelesCrudos.length
  const niveles: RubricaNivel[] = nombres.map((nombre, i) => ({
    nombre,
    valor: conPuntos ? nivelesCrudos[i].valor! : total - i,
  }))
  if (!conPuntos) {
    avisos.push(`Los niveles no traían puntos: se han puesto de ${total} a 1 en el orden en que venían (${niveles.map(n => `${n.nombre} = ${n.valor}`).join(', ')}). Corrígelos si no es así.`)
  }

  // Excel guarda «25 %» como 0,25: si todos los pesos caben en 1 y suman 1,
  // son porcentajes con formato y no pesos diminutos.
  const pesos = indicadoresCrudos.map(i => i.peso)
  const dados = pesos.filter((p): p is number => typeof p === 'number')
  const sonFracciones = dados.length > 0 && dados.every(p => p <= 1) &&
    Math.abs(dados.reduce((t, p) => t + p, 0) - 1) < 0.011
  const indicadores: RubricaIndicador[] = indicadoresCrudos.map((ind, i) => {
    const peso = pesos[i]
    return {
      nombre: limpiar(ind.nombre),
      descriptores: Object.fromEntries(niveles.map((n, j) => [n.nombre, limpiar(ind.celdas[j])])),
      ...(typeof peso === 'number' && peso > 0 ? { peso: redondear(sonFracciones ? peso * 100 : peso) } : {}),
    }
  })

  const conPeso = indicadores.filter(i => i.peso != null)
  if (conPeso.length > 0 && conPeso.length < indicadores.length) {
    avisos.push(`${indicadores.length - conPeso.length} indicador(es) no traen peso: se les repartirá a partes iguales. Revísalo antes de guardar.`)
  } else if (conPeso.length === indicadores.length) {
    const suma = redondear(conPeso.reduce((t, i) => t + i.peso!, 0))
    if (Math.abs(suma - 100) >= 0.5) avisos.push(`Los pesos suman ${suma} y no 100. La nota se calcula igual (en proporción), pero conviene cuadrarlos.`)
  }

  const vacios = indicadores.reduce((t, ind) => t + niveles.filter(n => !ind.descriptores[n.nombre]).length, 0)
  if (vacios > 0) avisos.push(`${vacios} descriptor(es) vienen en blanco.`)

  return { rubrica: { titulo: limpiar(titulo) || 'Rúbrica importada', niveles, indicadores }, avisos }
}

const ES_PESO = /^(peso|ponderaci[oó]n|%)/i
const ES_SEPARADOR = /^:?-{2,}:?$/

/**
 * Una tabla (de hoja de cálculo o de Markdown) → rúbrica.
 *
 * La tabla no tiene por qué empezar en la primera fila ni en la primera
 * columna: se busca la celda «Indicador» y se lee a partir de ahí. Una fila
 * anterior con una sola celda escrita se toma como título.
 */
export function rubricaDeFilas(filasOriginales: unknown[][], tituloPorDefecto: string): RubricaImportada {
  const filas = filasOriginales.map(f => (f ?? []).map(limpiar))

  let iCab = -1
  let c0 = 0
  for (let i = 0; i < filas.length && iCab < 0; i++) {
    const j = filas[i].findIndex(c => /^indicador/i.test(c))
    if (j >= 0 && filas[i].slice(j + 1).some(Boolean)) { iCab = i; c0 = j }
  }
  // Sin la palabra «Indicador»: vale la primera fila que parezca una cabecera.
  if (iCab < 0) {
    iCab = filas.findIndex(f => f.filter(Boolean).length >= 2)
    if (iCab >= 0) c0 = filas[iCab].findIndex(Boolean)
  }
  if (iCab < 0) {
    throw new Error('No se encuentra la tabla de la rúbrica. La primera fila debe ser la cabecera: «Indicador», y a su derecha una columna por nivel, como «Excelente (4)».')
  }

  let titulo = tituloPorDefecto
  for (let i = iCab - 1; i >= 0; i--) {
    const escritas = filas[i].filter(Boolean)
    if (escritas.length === 1) { titulo = escritas[0].replace(/^#+\s*/, ''); break }
  }

  const cabecera = filas[iCab]
  let colPeso = -1
  const colNiveles: number[] = []
  const niveles: NivelCrudo[] = []
  for (let j = c0 + 1; j < cabecera.length; j++) {
    if (!cabecera[j]) continue
    if (colPeso < 0 && ES_PESO.test(cabecera[j])) { colPeso = j; continue }
    colNiveles.push(j)
    niveles.push(nivelDeCabecera(cabecera[j]))
  }

  const indicadores: IndicadorCrudo[] = []
  for (let i = iCab + 1; i < filas.length; i++) {
    const f = filas[i]
    const nombre = f[c0]
    // Una fila sin nombre de indicador no se puede editar después: se ignora.
    // Y la línea `|---|---|` de Markdown no es un indicador.
    if (!nombre || ES_SEPARADOR.test(nombre)) continue
    indicadores.push({
      nombre,
      peso: colPeso >= 0 ? numero(f[colPeso]) : undefined,
      celdas: colNiveles.map(j => f[j] ?? ''),
    })
  }

  return componer(titulo, niveles, indicadores)
}

/** Las tablas de un texto Markdown, como filas. El encabezado `#` viaja como fila de título. */
export function filasDeMarkdown(texto: string): string[][] {
  const filas: string[][] = []
  for (const bruta of texto.split('\n')) {
    const linea = bruta.trim()
    if (linea.startsWith('#')) filas.push([linea.replace(/^#+\s*/, '')])
    // Negritas y código que añaden las IA alrededor de los nombres: fuera.
    else if (linea.startsWith('|')) filas.push(celdasDeFila(linea).map(c => c.replace(/\*\*|__|`/g, '').replace(/<br\s*\/?>/gi, ' ')))
  }
  return filas
}

/**
 * JSON → rúbrica. Admite el formato propio de compartir (`edumind-rubrica`) y
 * uno escrito a mano o por una IA, más laxo: los niveles pueden ser textos
 * («Excelente (4)») y los descriptores una lista en el orden de los niveles.
 */
export function rubricaDeJson(texto: string, tituloPorDefecto: string): RubricaImportada {
  let p: any
  try { p = JSON.parse(texto) } catch {
    throw new Error('El fichero no es un JSON válido. Si lo has escrito a mano, revisa comas y comillas.')
  }
  const r = p?.rubrica ?? p
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('El JSON no contiene una rúbrica.')
  if (r.formato && r.formato !== 'edumind-rubrica') {
    throw new Error(`El fichero es de tipo «${r.formato}», no una rúbrica.`)
  }
  if (!Array.isArray(r.niveles)) throw new Error('Al JSON le falta la lista «niveles».')
  if (!Array.isArray(r.indicadores)) throw new Error('Al JSON le falta la lista «indicadores».')

  const niveles: NivelCrudo[] = r.niveles.map((n: any) => {
    if (typeof n === 'string') return nivelDeCabecera(limpiar(n))
    return { nombre: limpiar(n?.nombre ?? n?.name), valor: numero(n?.valor ?? n?.puntos ?? n?.value) }
  })
  const indicadores: IndicadorCrudo[] = r.indicadores
    .map((ind: any) => {
      const d = ind?.descriptores ?? ind?.niveles ?? {}
      return {
        nombre: limpiar(ind?.nombre ?? ind?.indicador),
        peso: numero(ind?.peso),
        // Por posición si es una lista; por nombre de nivel si es un objeto.
        celdas: niveles.map((n, j) => limpiar(Array.isArray(d) ? d[j] : d?.[n.nombre])),
      }
    })
    .filter((ind: IndicadorCrudo) => ind.nombre)

  const resultado = componer(limpiar(r.titulo) || tituloPorDefecto, niveles, indicadores)
  if (typeof r.contexto === 'string' && r.contexto.trim()) resultado.contexto = r.contexto
  if (typeof r.area === 'string' && r.area.trim()) resultado.area = r.area
  return resultado
}

/**
 * Lee una rúbrica de un fichero, sea cual sea de los tres formatos.
 *
 * Manda el contenido y no la extensión: un `.xlsx` es un ZIP y empieza por
 * «PK», y un JSON empieza por llave. Así una rúbrica guardada como `.txt` o
 * bajada con otro nombre se importa igual.
 */
export async function importarRubrica(nombreFichero: string, datos: ArrayBuffer): Promise<RubricaImportada> {
  const titulo = nombreFichero.replace(/\.[^.]+$/, '').replace(/\.edurubrica$/, '').replace(/[-_]+/g, ' ').trim() || 'Rúbrica importada'
  const cabeza = new Uint8Array(datos.slice(0, 8))

  if (cabeza[0] === 0x50 && cabeza[1] === 0x4b) {
    return rubricaDeFilas(await leerXlsx(datos), titulo)
  }
  // Firma del Excel antiguo (.xls, anterior a 2007), que es otro formato.
  if (cabeza[0] === 0xd0 && cabeza[1] === 0xcf) {
    throw new Error('Es un Excel antiguo (.xls). Ábrelo y usa «Guardar como» → Libro de Excel (.xlsx).')
  }

  const texto = new TextDecoder().decode(datos).replace(/^﻿/, '')
  if (/^\s*[{[]/.test(texto)) return rubricaDeJson(texto, titulo)

  const filas = filasDeMarkdown(texto)
  if (!filas.some(f => f.length >= 2)) {
    throw new Error('No se reconoce el fichero. Sirven una hoja de cálculo (.xlsx), un Markdown (.md) con la rúbrica en una tabla, o un JSON (.json).')
  }
  return rubricaDeFilas(filas, titulo)
}

// ── Exportar y plantillas ────────────────────────────────────────────────

/** La rúbrica como tabla, con la misma forma que se sabe leer. «Peso» solo si alguien lo ha puesto. */
export function filasDeRubrica(r: RubricaParsed): (string | number)[][] {
  const conPeso = r.indicadores.some(i => i.peso != null)
  const cabecera: (string | number)[] = ['Indicador', ...(conPeso ? ['Peso'] : []), ...r.niveles.map(n => `${n.nombre} (${n.valor})`)]
  return [
    [r.titulo],
    cabecera,
    ...r.indicadores.map(ind => [
      ind.nombre,
      ...(conPeso ? [ind.peso ?? ''] : []),
      ...r.niveles.map(n => ind.descriptores[n.nombre] || ''),
    ]),
  ]
}

export function rubricaAXlsx(r: RubricaParsed): Uint8Array<ArrayBuffer> {
  return escribirXlsx(filasDeRubrica(r), 'Rúbrica')
}

/** Markdown con la columna de pesos, que el de las IA (`rubricaToMarkdown`) no lleva. */
export function rubricaAMarkdown(r: RubricaParsed): string {
  const [titulo, cabecera, ...cuerpo] = filasDeRubrica(r)
  const fila = (f: (string | number)[]) => `| ${f.map(c => String(c).replace(/\|/g, '/')).join(' | ')} |`
  return `# ${titulo[0]}\n\n${fila(cabecera)}\n${fila(cabecera.map(() => '---'))}\n${cuerpo.map(fila).join('\n')}\n`
}

/** Lo que se guarda al «compartir»: la rúbrica tal cual, sin adivinar nada al volver. */
export function rubricaAJson(r: RubricaParsed, extra: { area?: string; nivel?: string; contexto?: string } = {}): string {
  return JSON.stringify({
    formato: 'edumind-rubrica',
    version: 1,
    exportado: new Date().toISOString(),
    titulo: r.titulo,
    area: extra.area,
    nivel: extra.nivel,
    contexto: extra.contexto || undefined,
    niveles: r.niveles,
    indicadores: r.indicadores,
  }, null, 2)
}

/** Rúbrica de muestra para las plantillas descargables: enseña el formato con un caso real. */
export const RUBRICA_EJEMPLO: RubricaParsed = {
  titulo: 'Exposición oral',
  niveles: [
    { nombre: 'Excelente', valor: 4 },
    { nombre: 'Notable', valor: 3 },
    { nombre: 'Bien', valor: 2 },
    { nombre: 'Insuficiente', valor: 1 },
  ],
  indicadores: [
    {
      nombre: 'Organiza lo que cuenta',
      peso: 40,
      descriptores: {
        Excelente: 'Presenta el tema, lo desarrolla en orden y lo cierra con una conclusión.',
        Notable: 'Sigue un orden claro, aunque le falta la presentación o el cierre.',
        Bien: 'Cuenta las ideas, pero salta de una a otra.',
        Insuficiente: 'Enumera datos sueltos sin relación entre sí.',
      },
    },
    {
      nombre: 'Se expresa con claridad',
      peso: 30,
      descriptores: {
        Excelente: 'Habla con volumen y ritmo adecuados y usa el vocabulario del tema.',
        Notable: 'Se le entiende bien y usa parte del vocabulario del tema.',
        Bien: 'Se le entiende, con pausas largas o vocabulario muy general.',
        Insuficiente: 'Lee el texto o habla tan bajo que cuesta seguirle.',
      },
    },
    {
      nombre: 'Responde a las preguntas',
      peso: 30,
      descriptores: {
        Excelente: 'Responde con seguridad y añade ejemplos propios.',
        Notable: 'Responde correctamente a lo que se le pregunta.',
        Bien: 'Responde con ayuda o de forma incompleta.',
        Insuficiente: 'No responde o repite lo que ya había dicho.',
      },
    },
  ],
}
