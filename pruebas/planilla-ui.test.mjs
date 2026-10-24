/**
 * Planilla de corrección desde la interfaz.
 *
 * Luis corrige en papel con una planilla por pregunta —clave y cómo se
 * reparten los puntos— y quería volcarla a la app. Aquí se comprueba el
 * camino entero: el editor de un examen de puntos ofrece el bloque de IA
 * como planilla (no como generador de test), la tabla que devuelve la IA se
 * carga con clave y corrección por pregunta, se guarda, y al corregir a un
 * alumno cada pregunta enseña su clave y su reparto.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const TIROS = process.env.SCRATCH + '/tiros'
const PDF = join(process.cwd(), 'pruebas/fixtures/proens_ccss6.pdf')

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1500, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'] })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
p.on('dialog', d => d.accept())
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })
const aparece = (loc) => loc.waitFor({ timeout: 6000 }).then(() => true, () => false)

const editor = p.getByRole('dialog', { name: /^Examen de / })
const panel = p.getByRole('dialog', { name: /^Evaluar / })

try {
  console.log('\n1. Clase con programación de PROENS y dos alumnos')
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
  await p.locator('span').filter({ hasText: /^Ciencias Sociales$/ }).first().click()
  await p.waitForTimeout(900)
  await p.getByRole('button', { name: /📋 Programación/ }).first().click()
  await p.waitForTimeout(700)
  await p.getByRole('button', { name: /Importar de PROENS/ }).click()
  await p.waitForTimeout(300)
  await p.locator('input[type="file"][accept*="pdf"]').setInputFiles(PDF)
  await p.getByRole('button', { name: /Importar 7 unidades/ }).click({ timeout: 20000 })
  await p.getByText(/Programación importada/).waitFor({ timeout: 15000 })
  await p.getByRole('button', { name: 'Cerrar' }).click()
  await p.getByRole('link', { name: 'Alumnado', exact: true }).click()
  await p.waitForTimeout(500)
  await p.getByRole('button', { name: /Importar lista/ }).click()
  await p.getByPlaceholder('Pega aquí la lista de alumnado…').fill('Abad Ríos, Ana\nBello Souto, Bruno')
  await p.getByRole('button', { name: /Analizar/ }).click()
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: /Confirmar e importar/ }).click()
  await p.getByText(/2 alumnos creados/).waitFor({ timeout: 8000 })
  await p.getByRole('button', { name: 'Cerrar' }).click()

  console.log('\n2. El editor de un examen de puntos ofrece volcar la planilla con IA')
  await p.goto(BASE + '/escanear', { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  const tarjeta = p.locator('[data-examenes-hoja]')
  await tarjeta.locator('[data-examen-nuevo]').click()
  const dialogoNuevo = p.locator('[data-examen-nuevo-dialogo]')
  await dialogoNuevo.waitFor({ timeout: 5000 })
  await p.waitForTimeout(800)
  const selects = dialogoNuevo.locator('select')
  await selects.nth(2).selectOption({ index: 1 })
  if (await selects.nth(3).inputValue() === '') await selects.nth(3).selectOption({ index: 1 })
  await dialogoNuevo.locator('[data-examen-nuevo-abrir]').click()
  await editor.waitFor({ timeout: 8000 })
  await aparece(editor.getByLabel('Título del examen'))
  ok(await editor.locator('[data-ia-bloque="planilla"]').count() === 1, 'con puntos por pregunta, el bloque de IA es la planilla de corrección')
  await editor.locator('[data-ia-toggle]').click()
  await editor.locator('#ia-contexto').fill('1. Relaciona cada termo coa súa definición (1 punto)\n2. Elementos dun mapa (1 punto)')
  await editor.locator('[data-ia-copiar]').click()
  const prompt = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok(prompt.includes('PLANILLA DE CORRECCIÓN') && prompt.includes('Relaciona cada termo') && prompt.includes('| Clave | Corrección |'), 'el prompt lleva el examen del docente y pide la tabla con clave y corrección')

  console.log('\n3. La tabla que devuelve la IA se carga con clave y corrección')
  const criterios = await p.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
    const leer = (tabla) => new Promise((res) => { const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll(); tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at)) })
    const cis = await leer('criterio_instrumentos'); return [...new Set(cis.map(c => c.criterio_id))].slice(0, 2)
  })
  const tabla = `# Exame UD1 · O mundo que nos rodea

| Pregunta | Puntos | Criterio | Aspecto | Clave | Corrección |
|---|---|---|---|---|---|
| 1. Relaciona cada termo | 1 | ${criterios[0]} | Mapas | 1-d · 2-e · 3-a · 4-c · 5-b | 0,2 cada acerto |
| 2. Elementos dun mapa | 1 | ${criterios[1]} | Mapas | Título · rosa dos ventos · lenda · escala | 0,25 cada elemento |
`
  await editor.locator('[data-ia-respuesta]').fill(tabla)
  await editor.locator('[data-ia-cargar]').click()
  ok(await aparece(editor.getByText(/Examen cargado: 2 preguntas, 2 puntos/)), 'carga 2 preguntas con sus puntos')
  ok((await editor.locator('[data-planilla-toggle]').getAttribute('aria-pressed')) === 'true', 'las columnas de clave y corrección se abren solas')
  ok(await editor.getByLabel('Clave de la pregunta 1').inputValue() === '1-d · 2-e · 3-a · 4-c · 5-b', 'la clave de la pregunta 1 está en su casilla')
  ok(await editor.getByLabel('Corrección de la pregunta 2').inputValue() === '0,25 cada elemento', 'y la corrección de la 2')
  await foto('planilla-01-editor')
  await editor.getByRole('button', { name: /Guardar examen/ }).click()
  ok(await aparece(editor.getByText('✅ Guardado en este dispositivo')), 'se guarda')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await editor.waitFor({ state: 'detached', timeout: 5000 })

  console.log('\n4. Al corregir, cada pregunta enseña su clave y su reparto')
  await p.goto(BASE + '/evaluacion', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  const cerrarPres = p.locator('button:has-text("Entendido"), button:has-text("Empezar")')
  if (await cerrarPres.count()) await cerrarPres.first().click()
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  await p.locator('table.matriz tbody tr').first().locator('td.celda button').first().click()
  await panel.waitFor({ timeout: 8000 })
  const examen = panel.locator('[data-corregir-prueba]')
  ok(await aparece(examen), 'la casilla abre el corrector pregunta a pregunta')
  ok((await examen.locator('[data-pregunta="1"] [data-pregunta-clave]').textContent()).includes('1-d · 2-e'), 'la pregunta 1 enseña su clave')
  ok((await examen.locator('[data-pregunta="2"] [data-pregunta-correccion]').textContent()).includes('0,25 cada elemento'), 'y la 2 cómo se puntúa')
  await foto('planilla-02-corregir')
  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('planilla-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
