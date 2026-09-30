/**
 * Importar rúbricas desde fichero: hoja de cálculo, Markdown y JSON.
 *
 * Lo que se vigila: que los tres formatos den la MISMA rúbrica, que una celda
 * en blanco no corra las demás de columna, y que lo que un fichero hecho a
 * mano deja a medias (niveles sin puntos, pesos como porcentaje de Excel) se
 * arregle avisando en vez de importarse mal en silencio.
 *
 * El .xlsx de `fixtures/` está escrito con openpyxl —textos compartidos y
 * comprimido—, que es como lo guarda una hoja de cálculo de verdad.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  importarRubrica, rubricaDeFilas, rubricaDeJson, filasDeMarkdown,
  rubricaAXlsx, rubricaAMarkdown, rubricaAJson, RUBRICA_EJEMPLO,
} from '../frontend/src/ia/rubricaImportar'
import { leerXlsx, escribirXlsx } from '../frontend/src/ia/xlsxMinimo'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const bytes = (texto: string) => new TextEncoder().encode(texto).buffer as ArrayBuffer
/** Comparación sin depender del orden en que se escribieron las claves. */
const canon = (x: unknown): string => JSON.stringify(x, (_k, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
    : v)
const falla = async (fn: () => unknown): Promise<string> => {
  try { await fn(); return '' } catch (e: any) { return e.message || 'error' }
}

console.log('\n1. Hoja de cálculo real (openpyxl)')
{
  const b = readFileSync(resolve('pruebas/fixtures/rubrica_juegos.xlsx'))
  const datos = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  const { rubrica: r, avisos } = await importarRubrica('rubrica_juegos.xlsx', datos)
  ok(r.titulo === 'Rúbrica de juegos populares', 'toma el título de la fila suelta de arriba', r.titulo)
  ok(r.niveles.length === 4, 'cuatro niveles, sin contar «Peso» como nivel', String(r.niveles.length))
  ok(r.niveles[0].valor === 4 && r.niveles[3].nombre === 'No lo hace' && r.niveles[3].valor === 0,
     'con sus puntos, incluido el nivel 0')
  ok(r.indicadores.length === 3, 'tres indicadores, aunque la tabla empiece en B3')
  ok(r.indicadores.map(i => i.peso).join() === '50,25,25', 'los pesos con formato % de Excel (0,5) pasan a 50', r.indicadores.map(i => i.peso).join())
  ok(r.indicadores[1].descriptores['Notable'] === '', 'la celda en blanco se queda en blanco')
  ok(r.indicadores[1].descriptores['Bien'] === 'A veces', 'y no corre las siguientes de columna', r.indicadores[1].descriptores['Bien'])
  ok(r.indicadores[0].descriptores['Excelente'] === 'Con detalle & ejemplos' &&
     r.indicadores[2].descriptores['Excelente'] === 'Siempre <con gestos>', 'los caracteres especiales llegan enteros')
  ok(avisos.some(a => a.includes('en blanco')), 'avisa del descriptor vacío')
}

console.log('\n2. Markdown con columna de pesos')
{
  const md = `Texto antes.\n\n# Rúbrica de cuaderno\n\n| **Indicador** | Peso | Excelente (4) | Bien (2) |\n|---|---|---|---|\n| Orden | 60 % | Todo fechado | A medias |\n| Limpieza | 40 | Sin tachones |  |\n`
  const { rubrica: r } = await importarRubrica('cuaderno.md', bytes(md))
  ok(r.titulo === 'Rúbrica de cuaderno', 'título del encabezado #', r.titulo)
  ok(r.niveles.length === 2 && r.niveles[1].valor === 2, 'dos niveles')
  ok(r.indicadores[0].peso === 60 && r.indicadores[1].peso === 40, 'pesos con y sin signo %')
  ok(r.indicadores[1].descriptores['Bien'] === '', 'descriptor vacío al final de la fila')
  ok(filasDeMarkdown(md)[1][0] === 'Indicador', 'quita las negritas de la cabecera')
}

console.log('\n3. Niveles sin puntos')
{
  const { rubrica: r, avisos } = rubricaDeFilas([
    ['Indicador', 'Excelente', 'Bien', 'Insuficiente'],
    ['Participa', 'Siempre', 'A veces', 'Nunca'],
  ], 'Sin puntos')
  ok(r.niveles.map(n => n.valor).join() === '3,2,1', 'se numeran de mayor a menor', r.niveles.map(n => n.valor).join())
  ok(avisos.some(a => a.includes('no traían puntos')), 'y se avisa')
  const e = await falla(() => rubricaDeFilas([['Indicador', 'Excelente (4)', 'Bien'], ['Participa', 'a', 'b']], 't'))
  ok(e.includes('«Bien»'), 'unos con puntos y otros sin: error que nombra el nivel', e)
}

console.log('\n4. JSON')
{
  const propio = rubricaDeJson(rubricaAJson(RUBRICA_EJEMPLO, { area: 'Lengua', contexto: 'SA 2' }), 't')
  ok(canon(propio.rubrica) === canon(RUBRICA_EJEMPLO), 'el formato de compartir vuelve idéntico')
  ok(propio.area === 'Lengua' && propio.contexto === 'SA 2', 'con su área y su contexto')

  const aMano = rubricaDeJson(JSON.stringify({
    titulo: 'A mano',
    niveles: ['Logrado (2)', 'En proceso (1)'],
    indicadores: [{ nombre: 'Salta', descriptores: ['Con los dos pies', 'Con ayuda'] }],
  }), 't')
  ok(aMano.rubrica.niveles[0].valor === 2, 'niveles escritos como texto')
  ok(aMano.rubrica.indicadores[0].descriptores['En proceso'] === 'Con ayuda', 'descriptores como lista, por posición')

  ok((await falla(() => rubricaDeJson('{ "titulo": ', 't'))).includes('JSON válido'), 'JSON roto: mensaje claro')
  ok((await falla(() => rubricaDeJson('{"titulo":"x","niveles":[]}', 't'))).includes('indicadores'), 'sin indicadores: dice qué falta')
  ok((await falla(() => rubricaDeJson('{"formato":"edumind-paquete","niveles":[],"indicadores":[]}', 't'))).includes('edumind-paquete'),
     'otro fichero de EDUmind no cuela como rúbrica')
}

console.log('\n5. Los tres formatos dan la misma rúbrica')
{
  const x = rubricaAXlsx(RUBRICA_EJEMPLO)
  const deXlsx = (await importarRubrica('plantilla.xlsx', x.buffer)).rubrica
  const deMd = (await importarRubrica('plantilla.md', bytes(rubricaAMarkdown(RUBRICA_EJEMPLO)))).rubrica
  const deJson = (await importarRubrica('plantilla.json', bytes(rubricaAJson(RUBRICA_EJEMPLO)))).rubrica
  const esperado = canon(RUBRICA_EJEMPLO)
  ok(canon(deXlsx) === esperado, 'la plantilla .xlsx se vuelve a leer sin cambios')
  ok(canon(deMd) === esperado, 'la plantilla .md, igual')
  ok(canon(deJson) === esperado, 'la plantilla .json, igual')
  ok((await importarRubrica('sin-extension', x.buffer)).rubrica.indicadores.length === 3,
     'manda el contenido, no la extensión')
}

console.log('\n6. Hoja de cálculo: detalles del lector')
{
  const filas = await leerXlsx(escribirXlsx([['a', '', 'c'], [], ['', 7, 'ñ & <b>']]).buffer)
  ok(filas.length === 3 && filas[1].length === 0, 'conserva la fila vacía en su sitio')
  ok(filas[0][2] === 'c' && filas[0][1] === '', 'y la celda vacía en medio')
  ok(filas[2][1] === '7' && filas[2][2] === 'ñ & <b>', 'números y caracteres especiales')
}

console.log('\n7. Ficheros que no son una rúbrica')
{
  ok((await falla(() => importarRubrica('notas.txt', bytes('Hola, esto no es una tabla.')))).includes('No se reconoce'), 'texto sin tabla')
  ok((await falla(() => importarRubrica('viejo.xls', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]).buffer))).includes('.xlsx'),
     'Excel antiguo: explica cómo convertirlo')
  ok((await falla(() => importarRubrica('roto.xlsx', new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]).buffer))).includes('válida'), 'ZIP roto')
  ok((await falla(() => rubricaDeFilas([['Indicador', 'Excelente (4)']], 't'))).includes('indicadores'), 'cabecera sin filas')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
