/**
 * Plegar por competencia y panel de cobertura, en la matriz por criterio:
 * fila CE1 · CE2 · CE3 encima, pulsar una pliega sus criterios a una columna
 * con la media, se recuerda al recargar; el panel dice cuántos criterios
 * tienen alguna nota y lista los que no, y pulsar uno de ellos despliega su
 * competencia.
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
const ctx = await navegador.newContext({ viewport: { width: 1500, height: 1100 } })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
p.on('dialog', d => d.accept())
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })

try {
  console.log('\n1. Clase con programación y dos alumnos')
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

  console.log('\n2. Fila de competencias y plegado')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('[data-presentacion-entendido]').click({ timeout: 5000 }).catch(() => {})
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  const columnasAntes = await p.locator('th.criterio-th').count()
  const comps = p.locator('[data-competencia-th]')
  const etiquetas = await comps.evaluateAll(ths => ths.map(t => t.dataset.competenciaTh))
  ok(etiquetas.length >= 2 && etiquetas.every(e => /^CE\d$/.test(e)), 'hay una fila con las competencias de la unidad', etiquetas.join(' '))
  const ce1 = p.locator('[data-competencia-th="CE1"]')
  const nCE1 = Number(await ce1.getAttribute('colspan'))
  ok(nCE1 >= 2, 'CE1 abarca varios criterios', `${nCE1}`)

  // Una nota en un criterio de CE1 para que la media plegada tenga algo
  await p.locator('.celda-btn:not(.sin-instrumento)').first().click()
  const panel = p.getByRole('dialog', { name: /^Evaluar / })
  await panel.waitFor({ timeout: 8000 })
  const criterioConNota = (await panel.getByText(/^CRITERIO /).textContent()).replace('CRITERIO ', '').trim()
  await panel.locator('button.cal-8').click()
  await panel.getByText(/8 guardado en/).waitFor({ timeout: 5000 })
  await p.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(800)

  await ce1.click()
  await p.locator('[data-plegado="CE1"]').waitFor({ timeout: 5000 })
  ok(await p.locator('th.criterio-th').count() === columnasAntes - nCE1 + 1, 'plegar CE1 deja una sola columna en su lugar', `${await p.locator('th.criterio-th').count()} vs ${columnasAntes}`)
  const plegada = p.locator('tbody tr').first().locator('[data-celda-plegada]')
  ok((await plegada.textContent()).startsWith('8'), 'la casilla plegada enseña la media del alumno en CE1 (8, de un solo criterio)', await plegada.textContent())
  ok(await plegada.locator('b').count() === 1, 'y cuántos de sus criterios tienen nota')
  await foto('cobertura-01-plegado')
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  ok(await p.locator('[data-plegado="CE1"]').count() === 1, 'el plegado se recuerda al recargar')
  await plegada.click()
  await p.waitForTimeout(600)
  ok(await p.locator('[data-plegado="CE1"]').count() === 0 && await p.locator('th.criterio-th').count() === columnasAntes, 'pulsar la casilla plegada despliega')

  console.log('\n3. Panel de cobertura')
  const cob = p.locator('[data-cobertura]')
  await cob.waitFor({ timeout: 5000 })
  const resumen = await cob.locator('[data-cobertura-toggle]').textContent()
  ok(/1 de \d+ criterios con alguna nota/.test(resumen), 'resume cuántos criterios tienen alguna nota', resumen.trim())
  ok(/1 alumno sin nada/.test(resumen), 'y cuántos alumnos no tienen nada')
  await cob.locator('[data-cobertura-toggle]').click()
  const detalle = cob.locator('[data-cobertura-detalle]')
  await detalle.waitFor({ timeout: 5000 })
  const chips = detalle.locator('.cobertura-chip:not(.suave)')
  const nChips = await chips.count()
  ok(nChips === columnasAntes - 1, 'lista los criterios sin ninguna nota', `${nChips}`)
  ok((await detalle.textContent()).includes(`${criterioConNota} 1/2`), 'y el que está a medias, con cuántos alumnos')
  ok((await detalle.textContent()).includes('Bello Souto, Bruno'), 'y nombra al alumno sin nada')
  await foto('cobertura-02-panel')

  // Plegar CE2 y pulsar en el panel un criterio de CE2: se despliega
  await p.locator('[data-competencia-th="CE2"]').click()
  await p.locator('[data-plegado="CE2"]').waitFor({ timeout: 5000 })
  await chips.filter({ hasText: /^CE2\./ }).first().click()
  await p.waitForTimeout(600)
  ok(await p.locator('[data-plegado="CE2"]').count() === 0, 'pulsar un criterio sin nota en el panel despliega su competencia')

  console.log('\n4. El panel también está en la vista por instrumento')
  await p.locator('[data-vista="instrumentos"]').click()
  await p.locator('[data-instr-th]').first().waitFor({ timeout: 5000 })
  ok(await p.locator('[data-cobertura]').count() === 1, 'sigue a la vista por instrumento')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('cobertura-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
