/**
 * El banco de rúbricas, de punta a punta.
 *
 * Una rúbrica guardada en un instrumento tiene que poder elegirse desde otro
 * sin pasar por un fichero. Se comprueba además lo que haría del banco una
 * lista inservible si fallara: que la misma rúbrica usada en dos sitios salga
 * una sola vez, que elegirla sea una copia, que guardarla dos veces no la
 * duplique y que la copia del banco sobreviva al borrado de los instrumentos.
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
const ctx = await navegador.newContext({ viewport: { width: 1400, height: 1000 } })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
// Las confirmaciones (quitar del banco, borrar instrumento) se aceptan.
p.on('dialog', d => d.accept())
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })

/** Lo que sale tras releer la base de datos tarda un instante: se espera, no se mira al vuelo. */
const aparece = (loc) => loc.waitFor({ timeout: 5000 }).then(() => true, () => false)

const gestor = p.getByRole('dialog', { name: /Gestionar instrumentos/ })
const editorDe = nombre => p.getByRole('dialog', { name: new RegExp(`Rúbrica de ${nombre}`) })

/** Crea un instrumento de tipo rúbrica; el editor se abre solo. */
const nuevaRubrica = async (nombre) => {
  await gestor.getByRole('button', { name: /\+ Nuevo instrumento/ }).click()
  await gestor.getByPlaceholder('Nombre del instrumento *').fill(nombre)
  await gestor.locator('select').last().selectOption('rubrica')
  await gestor.getByRole('button', { name: 'Crear', exact: true }).click()
  const editor = editorDe(nombre)
  await editor.waitFor({ timeout: 8000 })
  return editor
}

const rubricasEnBD = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const filas = await new Promise((res) => {
    const tx = db.transaction('rubricas', 'readonly').objectStore('rubricas').getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  return filas.map(r => ({ titulo: r.titulo, instrumento_id: r.instrumento_id, area: r.area, nivel: r.nivel, n: JSON.parse(r.indicadores_json).length }))
})

try {
  console.log('\n1. Una rúbrica guardada en un instrumento')
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

  let editor = await nuevaRubrica('Juegos populares')
  await editor.getByRole('button', { name: /Elegir de mi banco/ }).click()
  ok(await aparece(editor.getByText(/Todavía no hay rúbricas en tu banco/)),
    'el banco vacío lo dice y explica cómo se llena')
  await editor.locator('input[type="file"]:not([data-uso])').setInputFiles(XLSX)
  await editor.getByText(/importada con 3 indicadores/).waitFor({ timeout: 8000 })
  await editor.getByRole('button', { name: /Guardar rúbrica/ }).click()
  await editor.getByText('✅ Guardada en este dispositivo').waitFor({ timeout: 5000 })
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()

  console.log('\n2. Elegirla desde otro instrumento')
  editor = await nuevaRubrica('Exposición')
  await editor.getByRole('button', { name: /Elegir de mi banco/ }).click()
  const tarjeta = editor.locator('[data-rubrica-banco="Rúbrica de juegos populares"]')
  await tarjeta.waitFor({ timeout: 5000 })
  ok(await tarjeta.getByText(/3 indicadores · 4 niveles/).isVisible(), 'el banco la lista con sus indicadores y niveles')
  ok(await tarjeta.getByText(/En uso en: 6ºA · Ciencias Sociales · Juegos populares/).isVisible(), 'y dice dónde se usa')
  await tarjeta.getByRole('button', { name: 'Ver' }).click()
  ok(await tarjeta.getByText('Explica las reglas — 50%').isVisible()
    && await tarjeta.getByText(/No lo hace \(0\)/).isVisible(), '«Ver» enseña indicadores, pesos y escala')
  await foto('rubrica-banco-01-elegir')
  await tarjeta.getByRole('button', { name: 'Usar esta' }).click()
  await editor.getByText(/copiada de tu banco/).waitFor({ timeout: 5000 })
  ok(await editor.locator('input[value="Rúbrica de juegos populares"]').count() === 1, 'se carga en el editor')
  ok(await editor.getByText('● Cambios sin guardar').isVisible(), 'sin guardar todavía')
  await editor.getByRole('button', { name: /Guardar rúbrica/ }).click()
  await editor.getByText('✅ Guardada en este dispositivo').waitFor({ timeout: 5000 })
  let bd = await rubricasEnBD()
  ok(bd.length === 2 && new Set(bd.map(r => r.instrumento_id)).size === 2, 'es una copia: dos rúbricas, una por instrumento', JSON.stringify(bd))

  console.log('\n3. La misma rúbrica en dos sitios sale una vez')
  await editor.getByRole('button', { name: '📚 Mi banco' }).click()
  ok(await aparece(tarjeta.getByText(/Juegos populares — 6ºA · Ciencias Sociales · Exposición/)), 'con sus dos usos')
  ok(await editor.locator('[data-rubrica-banco]').count() === 1, 'en una sola tarjeta')

  console.log('\n4. Guardar en el banco')
  await editor.getByRole('button', { name: '⭐ Guardar en mi banco' }).click()
  await editor.getByText(/guardada en tu banco/).waitFor({ timeout: 5000 })
  ok(await aparece(tarjeta.getByText('⭐ En el banco')), 'la tarjeta pasa a «En el banco»')
  bd = await rubricasEnBD()
  const copia = bd.find(r => r.instrumento_id === 0)
  ok(bd.length === 3 && copia?.area === 'Ciencias Sociales' && /6/.test(copia?.nivel || ''),
    'copia aparte, con su área y su curso', JSON.stringify(copia))
  await editor.getByRole('button', { name: '⭐ Guardar en mi banco' }).click()
  await editor.getByText(/ya estaba en tu banco/).waitFor({ timeout: 5000 })
  ok((await rubricasEnBD()).length === 3, 'guardarla otra vez no la duplica')

  console.log('\n5. Añadir ficheros directamente al banco')
  const md = '# Rúbrica de cuaderno\n\n| Indicador | Excelente (4) | Bien (2) |\n|---|---|---|\n| Orden | Todo fechado | A medias |\n'
  await editor.locator('input[data-uso="banco"]').setInputFiles([
    { name: 'cuaderno.md', mimeType: 'text/markdown', buffer: Buffer.from(md) },
    { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('Esto no es una tabla.') },
  ])
  await editor.getByText(/1 rúbrica añadida al banco/).waitFor({ timeout: 8000 })
  ok(await editor.getByText(/notas\.txt: No se reconoce/).isVisible(), 'el fichero que no vale se nombra, sin tirar el resto')
  ok(await aparece(editor.locator('[data-rubrica-banco="Rúbrica de cuaderno"]').getByText('⭐ En el banco')), 'la nueva aparece en el banco')
  await foto('rubrica-banco-02-lleno')

  console.log('\n6. La copia del banco sobrevive a sus instrumentos')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await gestor.getByRole('button', { name: 'Eliminar' }).first().click()
  await p.waitForTimeout(400)
  await gestor.getByRole('button', { name: 'Eliminar' }).first().click()
  await p.waitForTimeout(400)
  editor = await nuevaRubrica('Otra')
  await editor.getByRole('button', { name: /Elegir de mi banco/ }).click()
  const superviviente = editor.locator('[data-rubrica-banco="Rúbrica de juegos populares"]')
  await superviviente.waitFor({ timeout: 5000 })
  ok(await aparece(superviviente.getByText('⭐ En el banco')), 'sigue en el banco')
  ok(!(await superviviente.getByText(/En uso en/).isVisible().catch(() => false)), 'ya sin usos')

  console.log('\n7. Quitar del banco')
  await superviviente.getByRole('button', { name: 'Quitar del banco' }).click()
  await editor.getByText(/quitada del banco/).waitFor({ timeout: 5000 })
  ok(await superviviente.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false), 'desaparece de la lista')
  bd = await rubricasEnBD()
  ok(bd.length === 1 && bd[0].titulo === 'Rúbrica de cuaderno', 'queda solo la otra', JSON.stringify(bd))

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('rubrica-banco-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
