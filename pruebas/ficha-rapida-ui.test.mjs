/**
 * Ficha rápida del alumno desde el Calificador: su nombre en la fila es un
 * botón que abre una ficha con dos pestañas —«Esta área» (la nota del
 * boletín por trimestre, con el desglose por instrumento) y «Todas las
 * áreas» (la nota de cada una, observaciones y la ficha de siempre)—. Se
 * abre desde las tres tablas, no calcula nada por su cuenta y lo que se
 * edita en la ficha se ve al volver a abrirla.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { navegadorChromium, aceptarConfirmaciones, irAlAlumnado, elegirUnidad } from './lib/entorno.mjs'

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
  await irAlAlumnado(p)
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
  await sesion.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(800)

  console.log('\n3. El nombre del alumno abre su ficha: «Esta área»')
  const rapida = p.locator('[data-ficha-rapida]')
  ok(await p.locator('[data-alumno-abrir]').count() === 2, 'cada nombre de la tabla por instrumento es un botón')
  await p.locator('[data-alumno-abrir]').first().click()
  await rapida.waitFor({ timeout: 8000 })
  ok((await rapida.textContent()).includes('Abad Ríos, Ana'), 'la ficha es la de la alumna pulsada')
  await rapida.locator('[data-ficha-nota-area]').waitFor({ timeout: 15000 })
  const filaArea = (await rapida.locator('[data-ficha-nota-area]').textContent()).trim()
  ok(/\d,\d\d/.test(filaArea), 'enseña la nota del área por trimestre y la final', filaArea)
  ok(await rapida.locator('[data-ficha-nota-instrumento]').count() >= 1, 'y el desglose por instrumento')
  ok(await rapida.getByRole('tab', { name: /Esta área · Ciencias Sociales/ }).getAttribute('aria-selected') === 'true', 'abre en «Esta área», con su nombre')
  await foto('ficha-rapida-01-area')

  console.log('\n4. «Todas las áreas» y la ficha de siempre')
  await rapida.getByRole('tab', { name: 'Todas las áreas' }).click()
  const filaSociales = rapida.locator('[data-ficha-area="Ciencias Sociales"]')
  await filaSociales.waitFor({ timeout: 8000 })
  await p.waitForFunction(() => !document.querySelector('[data-ficha-area]')?.textContent?.includes('…'), null, { timeout: 15000 })
  ok(/\d,\d\d/.test(await filaSociales.textContent()), 'una fila por área con sus notas', (await filaSociales.textContent()).trim())
  ok((await rapida.locator('[data-ficha-rapida-todas]').textContent()).includes('ninguna'), 'sin observaciones lo dice')
  await rapida.locator('[data-ficha-rapida-editar]').click()
  await p.locator('#ed-obs').waitFor({ timeout: 5000 })
  ok(await rapida.count() === 0, 'la ficha de siempre se enseña en lugar de la rápida, no encima')
  await p.locator('#ed-obs').fill('Se sienta delante.')
  await p.getByRole('button', { name: 'Guardar', exact: true }).click()
  await p.locator('#ed-obs').waitFor({ state: 'detached', timeout: 5000 })
  await p.waitForTimeout(1200)
  ok(await rapida.count() === 0, 'al guardar se vuelve al Calificador')
  await p.locator('[data-alumno-abrir]').first().click()
  await rapida.getByRole('tab', { name: 'Todas las áreas' }).click()
  await rapida.locator('[data-ficha-rapida-observaciones]').waitFor({ timeout: 8000 })
  ok((await rapida.locator('[data-ficha-rapida-observaciones]').textContent()) === 'Se sienta delante.', 'y la observación guardada sale en la ficha rápida')
  await foto('ficha-rapida-02-todas')
  await p.keyboard.press('Escape')
  await rapida.waitFor({ state: 'detached', timeout: 5000 })
  ok(true, 'Esc cierra la ficha')

  console.log('\n5. También desde la vista por criterio y desde «Todo el curso»')
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('th.criterio-th').first().waitFor({ timeout: 8000 })
  await p.locator('[data-alumno-abrir]').nth(1).click()
  await rapida.waitFor({ timeout: 8000 })
  ok((await rapida.textContent()).includes('Bello Souto, Bruno'), 'por criterio abre la del alumno pulsado')
  await rapida.getByRole('button', { name: 'Hecho' }).click()
  await rapida.waitFor({ state: 'detached', timeout: 5000 })
  await elegirUnidad(p, 0)
  await p.locator('[data-alumno-abrir]').first().waitFor({ timeout: 10000 })
  await p.locator('[data-alumno-abrir]').first().click()
  await rapida.waitFor({ timeout: 8000 })
  ok(true, '«Todo el curso» también la abre')
  await p.keyboard.press('Escape')
  await rapida.waitFor({ state: 'detached', timeout: 5000 })

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('ficha-rapida-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
