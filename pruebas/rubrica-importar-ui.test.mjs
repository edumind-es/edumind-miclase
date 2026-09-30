/**
 * Importar una rúbrica desde la interfaz, de punta a punta.
 *
 * Crea una clase con un área y un instrumento de tipo rúbrica, y sube por el
 * botón una hoja de cálculo de verdad (la de `fixtures/`, escrita con
 * openpyxl). Comprueba lo que las pruebas del lector no pueden ver: que el
 * navegador descomprime el .xlsx, que la ayuda enseña qué forma debe tener el
 * fichero, que la plantilla que se descarga se vuelve a importar, y que lo
 * guardado en IndexedDB es lo que decía la hoja.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const TIROS = process.env.SCRATCH + '/tiros'
const XLSX = join(process.cwd(), 'pruebas/fixtures/rubrica_juegos.xlsx')

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })
const fichero = p.locator('input[type="file"][accept*="xlsx"]')

try {
  console.log('\n1. Clase con un área y un instrumento de tipo rúbrica')
  await p.goto(BASE + '/grupos/nuevo', { waitUntil: 'networkidle' })
  await p.waitForTimeout(500)
  await p.getByPlaceholder('Ej: 3ºA, 5ºB…').fill('6ºA')
  await p.locator('select').first().selectOption('primaria')
  await p.locator('select').nth(1).selectOption('6')
  await p.locator('select').nth(2).selectOption('Galicia')
  await p.getByRole('button', { name: /Crear grupo/ }).click()
  await p.waitForURL(/\/grupos\/\d+/)
  await p.waitForTimeout(900)
  await p.getByRole('tab', { name: 'Áreas y evaluación' }).click()
  await p.waitForTimeout(600)
  await p.getByRole('button', { name: /\+ Añadir áreas/ }).click()
  await p.waitForTimeout(700)
  await p.locator('label').filter({ hasText: /^Ciencias Sociales$/ }).locator('input[type="checkbox"]').check()
  await p.getByRole('button', { name: /Añadir 1 área/ }).click()
  await p.waitForTimeout(1000)

  await p.goto(BASE + '/evaluacion', { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()
  await p.getByRole('button', { name: /\+ Nuevo instrumento/ }).click()
  await p.getByPlaceholder('Nombre del instrumento *').fill('Juegos populares')
  await p.getByRole('dialog', { name: /Gestionar instrumentos/ }).locator('select').last().selectOption('rubrica')
  await p.getByRole('button', { name: 'Crear', exact: true }).click()
  const editor = p.getByRole('dialog', { name: /Rúbrica de Juegos populares/ })
  await editor.waitFor({ timeout: 8000 })
  ok(await editor.getByRole('button', { name: /Importar de un fichero/ }).isVisible(),
    'una rúbrica vacía ofrece importar de un fichero')

  console.log('\n2. La ayuda explica el formato')
  await editor.getByRole('button', { name: /Cómo preparo el fichero/ }).click()
  ok(await editor.getByText(/puntos entre paréntesis/).isVisible(), 'dice cómo se escriben los niveles')
  ok(await editor.getByText('📗 Hoja de cálculo (.xlsx)').isVisible()
    && await editor.getByText('📝 Markdown (.md)').isVisible()
    && await editor.getByText('🔁 Rúbrica de EDUmind (.json)').isVisible(), 'y nombra los tres formatos')
  await foto('rubrica-importar-01-ayuda')
  const [descarga] = await Promise.all([
    p.waitForEvent('download'),
    editor.getByRole('button', { name: /Plantilla \.xlsx/ }).click(),
  ])
  const plantilla = join(process.env.SCRATCH, 'plantilla-rubrica.xlsx')
  await descarga.saveAs(plantilla)
  ok(descarga.suggestedFilename() === 'plantilla-rubrica.xlsx', 'la plantilla .xlsx se descarga')

  console.log('\n3. Un fichero que no es una rúbrica')
  await fichero.setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('Esto no es una tabla.') })
  ok(await editor.getByText(/No se reconoce el fichero/).isVisible(), 'lo dice sin salir del punto de partida')

  console.log('\n4. Importar la hoja de cálculo')
  await fichero.setInputFiles(XLSX)
  await editor.getByText(/importada con 3 indicadores y 4 niveles/).waitFor({ timeout: 8000 })
  ok(true, 'el navegador abre el .xlsx y cuenta 3 indicadores y 4 niveles')
  ok(await editor.getByText(/1 descriptor\(es\) vienen en blanco/).isVisible(), 'avisa del descriptor en blanco')
  ok(await editor.locator('input[value="Rúbrica de juegos populares"]').count() === 1, 'con el título de la hoja')
  ok(await editor.getByText('● Cambios sin guardar').isVisible(), 'queda sin guardar, para revisarla')
  ok(await editor.getByText('100% ✓').isVisible(), 'los pesos (50/25/25) suman 100')
  await foto('rubrica-importar-02-editor')
  await editor.getByRole('button', { name: /Guardar rúbrica/ }).click()
  await editor.getByText('✅ Guardada en este dispositivo').waitFor({ timeout: 5000 })

  const guardada = await p.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
    const filas = await new Promise((res) => {
      const tx = db.transaction('rubricas', 'readonly').objectStore('rubricas').getAll()
      tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
    })
    return filas.map(r => ({ titulo: r.titulo, niveles: JSON.parse(r.niveles_json), indicadores: JSON.parse(r.indicadores_json), ia: r.generada_ia }))
  })
  const r = guardada[0]
  ok(guardada.length === 1 && r.titulo === 'Rúbrica de juegos populares', 'una rúbrica guardada', JSON.stringify(guardada.map(g => g.titulo)))
  ok(r.niveles.map(n => n.valor).join() === '4,3,2,0', 'con su escala, nivel 0 incluido', r.niveles.map(n => n.valor).join())
  ok(r.indicadores.map(i => i.peso).join() === '50,25,25', 'y sus pesos', r.indicadores.map(i => i.peso).join())
  ok(r.indicadores[1].descriptores['Bien'] === 'A veces' && r.indicadores[1].descriptores['Notable'] === '',
    'cada descriptor en su nivel')
  ok(r.ia === 0, 'no queda marcada como generada con IA')

  console.log('\n5. La plantilla descargada se importa encima')
  await fichero.setInputFiles(plantilla)
  await editor.getByText(/«Exposición oral» importada con 3 indicadores y 4 niveles/).waitFor({ timeout: 8000 })
  ok(true, 'la plantilla que da la app la lee la app')

  console.log('\n6. Exportar a hoja de cálculo')
  const [salida] = await Promise.all([
    p.waitForEvent('download'),
    editor.getByRole('button', { name: '⬇ .xlsx' }).click(),
  ])
  ok(salida.suggestedFilename() === 'rubrica-juegos-populares.xlsx', 'descarga el .xlsx con el nombre del instrumento', salida.suggestedFilename())

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('rubrica-importar-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
