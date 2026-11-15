/**
 * Informe de un alumno en una actividad con rúbrica: tras calificar la clase
 * con la lista de control del cuaderno, el informe se abre desde el «Más» de
 * la columna, desde el panel de la casilla y desde Seguimiento → Por alumno;
 * enseña indicador a indicador y lo que hay que mejorar, compara con la clase
 * o con los de media parecida y guarda un documento que, con dos notas,
 * calla las cifras de la clase.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { navegadorChromium, aceptarConfirmaciones } from './lib/entorno.mjs'

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
const ctx = await navegador.newContext({ viewport: { width: 1500, height: 1100 } })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
const preguntas = []
await aceptarConfirmaciones(p, t => preguntas.push(t))
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })


try {
  console.log('\n1. Clase con programación de PROENS; dos alumnos')
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



  const aparece = (loc) => loc.waitFor({ timeout: 8000 }).then(() => true, () => false)
  const editor = p.getByRole('dialog', { name: /^Rúbrica de / })
  const ficha = p.locator('[data-ficha-actividad]')

  console.log('\n2. Una actividad toma la lista de control del cuaderno y se califica a la clase')
  await p.getByRole('link', { name: /Exámenes y pruebas/ }).click()
  const bloques = p.locator('[data-examenes-hoja] [data-area-examenes] [data-unidad-bloque]')
  await bloques.first().waitFor({ timeout: 10000 })
  const fila = bloques.nth(0).locator('[data-fila-actividad][data-herramienta="diario"], [data-fila-actividad][data-herramienta="rúbrica"]').first()
  const nombre = await fila.getAttribute('data-nombre')
  await fila.locator('[data-editar-actividad]').click()
  await ficha.waitFor({ timeout: 8000 })
  await ficha.locator('[data-ficha-modelos]').click()
  await ficha.locator('[data-modelo-elegir="serie:cuaderno"]').click()
  await editor.locator('[data-rubrica-alcance]').waitFor({ timeout: 8000 })
  await editor.getByRole('button', { name: /Guardar rúbrica/ }).click()
  await editor.getByText('Rúbrica guardada correctamente.').waitFor({ timeout: 8000 })
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).first().click()
  await editor.waitFor({ state: 'detached', timeout: 5000 })
  await p.waitForTimeout(700)

  await bloques.nth(0).locator(`[data-fila-actividad][data-nombre="${nombre}"] [data-fila-calificar]`).click()
  await p.locator('[data-unidad-select]').waitFor({ timeout: 10000 })
  await p.waitForTimeout(1500)
  const th = p.locator('th[data-criterios]').filter({ hasText: nombre }).first()
  await th.getByRole('button', { name: /Calificar/ }).first().click()
  const sesion = p.getByRole('dialog', { name: /^Calificar con la rúbrica: / })
  const filas = sesion.locator('[data-sesion-fila]')
  await filas.first().waitFor({ timeout: 8000 })
  // Ana, el nivel más alto en todo; Bruno, el más bajo.
  await filas.nth(0).locator('button[data-nivel]').first().click()
  await filas.nth(0).locator('[data-sesion-nota] strong').waitFor({ timeout: 5000 })
  await filas.nth(1).locator('button[data-nivel]').last().click()
  await filas.nth(1).locator('[data-sesion-nota] strong').waitFor({ timeout: 5000 })
  await sesion.getByRole('button', { name: 'Cerrar' }).first().click()
  await sesion.waitFor({ state: 'detached', timeout: 5000 })
  await p.waitForTimeout(900)

  console.log('\n3. El informe desde el «Más» de la columna')
  const informe = p.locator('[data-informe-actividad]')
  await th.locator('[data-columna-mas]').click()
  const hoja = p.locator('[data-hoja-columna]')
  ok(await aparece(hoja.locator('[data-informe-actividad-abrir]')), 'la hoja de la columna ofrece «Informe de un alumno»')
  await hoja.locator('[data-informe-actividad-abrir]').click()
  ok(await aparece(informe.locator('[data-informe-individual]')), 'se abre el informe')
  ok(await informe.getAttribute('data-informe-actividad') === 'rubrica', 'y sabe que es una rúbrica')
  const alumnos = informe.locator('[data-informe-alumno] option')
  ok(await alumnos.count() === 2, 'con los dos alumnos calificados', (await alumnos.allTextContents()).join(' | '))
  ok(await informe.locator('[data-informe-indicadores] tr[data-indicador]').count() === 6, 'enseña los seis indicadores de la lista')
  // Cuál de los dos quedó abajo depende del orden de los niveles: se mira en los dos.
  const flojos = []
  for (const valor of await alumnos.evaluateAll(os => os.map(o => o.value))) {
    await informe.locator('[data-informe-alumno]').selectOption(valor)
    await p.waitForTimeout(300)
    flojos.push(await informe.locator('[data-informe-indicadores] tr[data-flojo]').count())
  }
  ok(flojos.slice().sort().join() === '0,6', 'uno no tiene nada que mejorar y el otro, los seis', flojos.join())
  ok(await aparece(informe.locator('[data-informe-pocos]')), 'avisa de que con dos notas el documento calla las cifras de la clase')
  await informe.locator('[data-informe-comparar]').selectOption('parecidos')
  ok(await aparece(informe.locator('[data-informe-parecidos]')), 'se puede comparar con los de media parecida')
  await informe.locator('[data-informe-comparar]').selectOption('clase')
  const [fichero] = await Promise.all([p.waitForEvent('download'), informe.locator('[data-informe-guardar]').click()])
  ok(/^informe-.*\.html$/.test(fichero.suggestedFilename()), 'se guarda como .html', fichero.suggestedFilename())
  const html = readFileSync(await fichero.path(), 'utf8')
  ok(html.includes('Indicador a indicador') && html.includes('no se dan las cifras de la clase') && !html.includes('Media de la clase'), 'el documento lleva la rúbrica y calla las cifras de la clase')
  ok(/Abad Ríos, Ana|Bello Souto, Bruno/.test(html), 'y lleva el nombre del alumno')
  await foto('informe-actividad-01')
  await informe.getByRole('button', { name: 'Cerrar' }).last().click()
  await informe.waitFor({ state: 'detached', timeout: 5000 })

  console.log('\n4. Desde el panel de la casilla')
  await p.locator(`[data-celda-instr][title*="${nombre}"]`).first().click()
  const enPanel = p.getByRole('button', { name: /^Informe de .+ en esta actividad$/ })
  ok(await aparece(enPanel), 'el panel ofrece el informe del alumno en la actividad')
  await enPanel.click()
  ok(await aparece(informe.locator('[data-informe-indicadores]')), 'y lo abre encima del panel')
  ok(/Abad Ríos, Ana/.test(await informe.locator('[data-informe-alumno] option:checked').textContent()), 'con el alumno de la casilla ya elegido')
  await p.keyboard.press('Escape')
  await informe.waitFor({ state: 'detached', timeout: 5000 })
  await p.keyboard.press('Escape')
  await p.waitForTimeout(500)

  console.log('\n5. Desde Seguimiento → Por alumno')
  await p.getByRole('link', { name: 'Seguimiento', exact: true }).click()
  await p.waitForTimeout(1200)
  await p.getByRole('tab', { name: /Por alumno/ }).click()
  await p.locator('[data-analisis-abrir]').first().click()
  const analisis = p.locator('[data-analisis-alumno]')
  const tarjeta = analisis.locator('[data-analisis-actividad="rubrica"]')
  ok(await aparece(tarjeta) && await tarjeta.count() === 1, 'el análisis del alumno lista la actividad con rúbrica')
  ok((await tarjeta.textContent()).includes(nombre), 'con su nombre')
  await tarjeta.locator('[data-analisis-informe-actividad]').click()
  ok(await aparece(informe.locator('[data-informe-indicadores]')), 'y abre su informe completo')
  await foto('informe-actividad-02')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('informe-actividad-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
