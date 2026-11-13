/**
 * «Qué evalúo» unidad a unidad: el gestor abre en «Por unidad» con la unidad
 * del Calificador, enseña solo lo que se usa en ella, deja crear una
 * actividad en la unidad y traerla a otra, cambiar sus criterios y abrir su
 * ficha; «Pesos del área» conserva el gestor de siempre y la pestaña elegida
 * se recuerda. Esc con la ficha abierta cierra la ficha y no el gestor.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { navegadorChromium, elegirUnidad, aceptarConfirmaciones } from './lib/entorno.mjs'

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
await aceptarConfirmaciones(p)
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })


const leer = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const tabla = (t) => new Promise((res) => {
    const tx = db.transaction(t, 'readonly').objectStore(t).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  return { instrumentos: await tabla('instrumentos'), ci: await tabla('criterio_instrumentos') }
})

try {
  console.log('\n1. Clase con programación de PROENS; el gestor abre «Por unidad»')
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

  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await elegirUnidad(p, 1)
  await p.waitForTimeout(1000)
  const unidadCal = await p.locator('[data-unidad-select]').inputValue()
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()
  const gestor = p.getByRole('dialog', { name: 'Gestionar instrumentos de evaluación' })
  const vista = gestor.locator('[data-que-por-unidad]')
  await vista.waitFor({ timeout: 8000 })
  ok(await gestor.locator('[data-pestana="unidad"]').getAttribute('aria-selected') === 'true', 'la pestaña elegida es «Por unidad»')
  ok(await gestor.locator('[data-familia-bloque]').count() === 0, 'lo de toda el área no sale mezclado')
  const selector = vista.locator('[data-que-unidad]')
  ok(await selector.inputValue() === unidadCal, 'abre en la unidad del Calificador', `${await selector.inputValue()} / ${unidadCal}`)
  ok(await selector.locator('option').count() === 7, 'el selector trae las siete unidades')
  const bloques = vista.locator('[data-unidad-instrumento]')
  await bloques.first().waitFor({ timeout: 8000 })
  ok(await bloques.count() === 2, 'dos instrumentos, los de la programación', (await bloques.evaluateAll(bs => bs.map(b => b.dataset.nombre))).join(' · '))
  const taboa = bloques.nth(1)
  const nombreTaboa = await taboa.getAttribute('data-nombre')
  ok(await taboa.locator('[data-unidad-actividad]').count() === 1, 'sin actividades, el instrumento se califica directamente')
  ok(/directamente/.test(await taboa.locator('[data-unidad-actividad]').textContent()), 'y lo dice')
  const criteriosTaboa = (await taboa.locator('[data-unidad-criterios]').getAttribute('data-criterios')).split(' ').filter(Boolean)
  ok(criteriosTaboa.length > 0, 'con los criterios que le asigna la programación', criteriosTaboa.join(' '))
  await foto('que-evaluo-01-por-unidad')

  console.log('\n2. «+ actividad en esta unidad» crea la actividad con los criterios del instrumento')
  await taboa.locator('[data-unidad-anadir]').click()
  const form = taboa.locator('[data-unidad-anadir-form]')
  ok(await form.locator('[data-unidad-anadir-aceptar]').isDisabled(), 'sin nombre no se puede añadir')
  ok(await form.locator('[data-unidad-anadir-criterio]:checked').count() === criteriosTaboa.length, 'propone los criterios que el instrumento evalúa en la unidad')
  await form.locator('[data-unidad-anadir-nombre]').fill('Speaking')
  await form.locator('[data-unidad-anadir-tipo]').selectOption('oral')
  await form.locator('[data-unidad-anadir-aceptar]').click()
  const speaking = taboa.locator('[data-unidad-actividad][data-nombre="Speaking"]')
  await speaking.waitFor({ timeout: 8000 })
  ok(/Speaking/.test(await vista.locator('[data-que-aviso]').textContent()), 'dice lo que ha hecho')
  ok(await taboa.locator('[data-unidad-actividad]').count() === 1, 'la actividad sustituye a la fila directa del instrumento')
  ok(await speaking.locator('[data-unidad-pct]').textContent() === '100 %', 'una sola actividad vale el 100 % del instrumento')
  let e = await leer()
  const insSpeaking = e.instrumentos.find(i => i.nombre === 'Speaking')
  const insTaboa = e.instrumentos.find(i => i.nombre === nombreTaboa)
  ok(insSpeaking?.familia_id === insTaboa.id, 'cuelga de su instrumento')
  const unidadesSpeaking = () => [...new Set(e.ci.filter(f => f.instrumento_id === insSpeaking.id).map(f => f.unidad_id))]
  ok(unidadesSpeaking().length === 1 && String(unidadesSpeaking()[0]) === unidadCal, 'y solo se usa en esta unidad', unidadesSpeaking().join(','))

  console.log('\n3. En otra unidad no sale; se trae de la primera')
  const valores = await selector.locator('option').evaluateAll(os => os.map(o => o.value))
  const otra = valores.find(v => v !== unidadCal)
  await selector.selectOption(otra)
  await p.waitForTimeout(800)
  ok(await taboa.locator('[data-unidad-actividad][data-nombre="Speaking"]').count() === 0, 'una actividad que no se usa en la unidad no sale')
  await taboa.locator('[data-unidad-anadir]').click()
  const cual = taboa.locator('[data-unidad-anadir-cual]')
  ok(/Speaking/.test(await cual.textContent()), 'ofrece traer la que ya existe')
  await cual.selectOption({ label: 'Traer «Speaking» de otra unidad' })
  ok(await taboa.locator('[data-unidad-anadir-nombre]').count() === 0, 'al traer una no se pide nombre')
  await taboa.locator('[data-unidad-anadir-aceptar]').click()
  await speaking.waitFor({ timeout: 8000 })
  e = await leer()
  ok(e.instrumentos.filter(i => i.nombre === 'Speaking').length === 1, 'no se duplica la actividad')
  ok(unidadesSpeaking().length === 2, 'ahora se usa en dos unidades', unidadesSpeaking().join(','))

  console.log('\n4. Los criterios de la actividad se cambian aquí')
  const antes = (await speaking.locator('[data-unidad-criterios]').getAttribute('data-criterios')).split(' ').filter(Boolean)
  await speaking.locator('[data-unidad-criterios-editar]').click()
  const lista = speaking.locator('[data-unidad-criterios-lista]')
  ok(await lista.locator('input:checked').count() === antes.length, 'la lista marca los que evalúa')
  const total = await lista.locator('input').count()
  if (antes.length > 1) {
    await lista.locator(`[data-unidad-criterio="${antes[0]}"]`).click()
    await p.waitForFunction(([n]) => document.querySelector('[data-unidad-actividad][data-nombre="Speaking"] [data-unidad-criterios]')?.dataset.criterios.split(' ').filter(Boolean).length === n, [antes.length - 1], { timeout: 8000 })
    ok(true, 'quitar un criterio (tras aceptar la pregunta) lo retira de la actividad en esta unidad')
    e = await leer()
    ok(!e.ci.some(f => f.instrumento_id === insSpeaking.id && String(f.unidad_id) === otra && f.criterio_id === antes[0]), 'y la programación lo refleja')
    ok(e.ci.some(f => f.instrumento_id === insSpeaking.id && String(f.unidad_id) === unidadCal), 'sin tocar la otra unidad')
  } else ok(total >= 1, 'la lista trae los criterios de la unidad')
  await foto('que-evaluo-02-criterios')

  console.log('\n5. «Editar» abre la ficha; Esc la cierra sin cerrar el gestor')
  await speaking.locator('[data-editar-actividad]').click()
  const ficha = p.locator('[data-ficha-actividad]')
  await ficha.waitFor({ timeout: 5000 })
  ok(await ficha.locator('[data-ficha-nombre]').inputValue() === 'Speaking', 'la ficha es la de la actividad')
  await p.keyboard.press('Escape')
  await ficha.waitFor({ state: 'hidden', timeout: 5000 })
  ok(await vista.isVisible(), 'Esc cierra la ficha y «Qué evalúo» sigue abierto')

  console.log('\n6. «Pesos del área» conserva el gestor de siempre y se recuerda')
  await gestor.locator('[data-pestana="pesos"]').click()
  await gestor.locator('[data-familia-bloque]').first().waitFor({ timeout: 5000 })
  ok(await gestor.locator('[data-familia-bloque]').count() === 2, 'los dos instrumentos con sus pesos')
  await gestor.locator('[data-hijo][data-nombre="Speaking"]').waitFor({ timeout: 8000 })
  ok(await gestor.locator('[data-hijo][data-nombre="Speaking"]').count() === 1, 'y la actividad creada por unidad está dentro del suyo')
  ok(await vista.count() === 0, 'la vista por unidad se retira')
  await foto('que-evaluo-03-pesos')
  await gestor.getByRole('button', { name: 'Cerrar' }).click()
  await gestor.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(800)
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()
  await gestor.locator('[data-familia-bloque]').first().waitFor({ timeout: 8000 })
  ok(await gestor.locator('[data-pestana="pesos"]').getAttribute('aria-selected') === 'true', 'al volver a abrir recuerda «Pesos del área»')
  await gestor.locator('[data-pestana="unidad"]').click()
  await vista.waitFor({ timeout: 5000 })
  ok(true, 'y se vuelve a «Por unidad» con un toque')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('que-evaluo-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
