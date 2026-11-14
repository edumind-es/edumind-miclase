/**
 * «Exámenes y pruebas» por área: una pestaña por área de la clase activa y,
 * dentro, un bloque por unidad con sus actividades y la herramienta de cada
 * una. Una actividad sin examen lleva «Editar» (la ficha, desde la que se
 * define el examen) y con examen, los botones del examen; «Calificar» lleva
 * a esa unidad del Calificador. Un examen general no se esconde: va en
 * «Otros exámenes del área». Sin áreas en la clase activa queda la lista de
 * siempre, con los exámenes de todas las clases.
 */
import { mkdirSync } from 'node:fs'
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
await aceptarConfirmaciones(p)
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })


try {
  console.log('\n1. Clase con programación de PROENS; «Exámenes y pruebas» abre por área')
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
  const editor = p.getByRole('dialog', { name: /^Examen de / })
  const cargarExamen = async (titulo) => {
    await editor.waitFor({ timeout: 8000 })
    await aparece(editor.getByLabel('Título del examen'))
    await editor.locator('[data-ia-toggle]').click()
    await editor.locator('[data-ia-respuesta]').fill(`# ${titulo}\n\n| Pregunta | Puntos |\n|---|---|\n| 1. Relaciona cada termo | 1 |\n| 2. Elementos dun mapa | 1 |\n`)
    await editor.locator('[data-ia-cargar]').click()
    await editor.getByText(/Examen cargado: 2 preguntas/).waitFor({ timeout: 8000 })
    await editor.getByRole('button', { name: /Guardar examen/ }).click()
    await editor.getByText('✅ Guardado en este dispositivo').waitFor({ timeout: 8000 })
    await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    await editor.waitFor({ state: 'detached', timeout: 5000 })
  }

  await p.getByRole('link', { name: /Exámenes y pruebas/ }).click()
  const tarjeta = p.locator('[data-examenes-hoja]')
  const area = tarjeta.locator('[data-area-examenes]')
  await area.locator('[data-unidad-bloque]').first().waitFor({ timeout: 10000 })
  ok((await tarjeta.locator('[data-examenes-clase]').textContent()).includes('6ºA'), 'dice de qué clase son las pestañas')
  ok(await tarjeta.getByRole('tab').count() === 1 && await tarjeta.getByRole('tab').first().getAttribute('aria-selected') === 'true', 'una pestaña por área de la clase, elegida')
  ok(await area.getAttribute('data-area-examenes') === 'Ciencias Sociales', 'el área es la de la clase', await area.getAttribute('data-area-examenes'))
  const bloques = area.locator('[data-unidad-bloque]')
  ok(await bloques.count() === 7, 'un bloque por unidad', String(await bloques.count()))
  const ud1 = bloques.first()
  const filas = ud1.locator('[data-fila-actividad]')
  ok(await filas.count() === 2, 'la primera unidad trae sus dos instrumentos', (await filas.evaluateAll(fs => fs.map(f => `${f.dataset.nombre} (${f.dataset.herramienta})`))).join(' · '))
  ok(await tarjeta.locator('[data-examen]').count() === 0, 'todavía no hay ningún examen')
  ok(await tarjeta.locator('[data-modelos-toggle]').isDisabled() && /\(0\)/.test(await tarjeta.locator('[data-modelos-toggle]').textContent()), 'el bloque de modelos está, vacío')
  await foto('examenes-area-01-unidades')

  console.log('\n2. Desde la fila de una actividad sin herramienta se define su examen')
  const proba = ud1.locator('[data-fila-actividad][data-herramienta="sin herramienta"]').first()
  const nombreProba = await proba.getAttribute('data-nombre')
  ok(await proba.locator('[data-examen-editar]').count() === 0, 'sin examen no hay botones de examen')
  await proba.locator('[data-editar-actividad]').click()
  const ficha = p.locator('[data-ficha-actividad]')
  await ficha.waitFor({ timeout: 8000 })
  await ficha.locator('[data-elegir-herramienta="examen"]').click()
  await cargarExamen('Exame UD1')
  const conExamen = ud1.locator('[data-fila-actividad][data-examen="Exame UD1"]')
  ok(await aparece(conExamen), 'la fila pasa a ser la del examen')
  ok(await conExamen.getAttribute('data-nombre') === nombreProba && await conExamen.getAttribute('data-herramienta') === 'examen', 'en la misma actividad, ahora con examen')
  ok(await conExamen.locator('[data-examen-editar]').count() === 1 && await conExamen.locator('[data-examen-informe]').count() === 1 && await conExamen.locator('[data-examen-corregir]').isDisabled(), 'con editar e informe, y sin corregir por cámara porque no es un test')
  ok(await tarjeta.locator('[data-examen]').count() === 1, 'y sale una sola vez')
  ok(await bloques.nth(1).locator('[data-examen]').count() === 0, 'la segunda unidad no lo hereda')
  await conExamen.locator('[data-examen-editar]').click()
  ok(await aparece(editor) && await editor.getByLabel('Título del examen').inputValue() === 'Exame UD1', '«Editar» abre ese examen')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await editor.waitFor({ state: 'detached', timeout: 5000 })

  console.log('\n3. Un examen general no se esconde')
  await tarjeta.locator('[data-examen-nuevo]').click()
  const dialogoNuevo = p.locator('[data-examen-nuevo-dialogo]')
  await dialogoNuevo.waitFor({ timeout: 5000 })
  await p.waitForTimeout(800)
  const selects = dialogoNuevo.locator('select')
  if (await selects.nth(3).inputValue() === '') await selects.nth(3).selectOption({ index: 1 })
  await dialogoNuevo.locator('[data-examen-nuevo-abrir]').click()
  await cargarExamen('Exame xeral')
  const sueltos = area.locator('[data-examenes-sueltos]')
  ok(await aparece(sueltos.locator('[data-examen="Exame xeral"]')), 'va en «Otros exámenes del área»')
  ok(await aparece(bloques.nth(1).locator(`[data-fila-actividad][data-nombre="${nombreProba}"]`).filter({ hasText: 'todas las unidades' })), 'y la unidad que no tiene el suyo dice que usa el general')
  ok(await ud1.locator('[data-examen="Exame UD1"]').count() === 1, 'la que tiene el suyo sigue con el suyo')
  await foto('examenes-area-02-examenes')

  console.log('\n4. «Calificar» lleva a esa unidad del Calificador')
  const enlace = bloques.nth(1).locator('[data-fila-calificar]').first()
  const unidad2 = new URL(await enlace.getAttribute('href'), BASE).searchParams.get('unidad_id')
  await enlace.click()
  await p.locator('[data-unidad-select]').waitFor({ timeout: 10000 })
  await p.waitForTimeout(1200)
  ok(await p.locator('[data-unidad-select]').inputValue() === unidad2, 'el Calificador abre en la unidad de la fila', `${await p.locator('[data-unidad-select]').inputValue()} / ${unidad2}`)

  console.log('\n5. Con otra clase activa, los exámenes de esta siguen a mano')
  await p.goto(BASE + '/grupos/nuevo', { waitUntil: 'networkidle' })
  await p.waitForTimeout(500)
  await p.getByPlaceholder('Ej: 3ºA, 5ºB…').fill('5ºB')
  await p.locator('select').first().selectOption('primaria')
  await p.locator('select').nth(1).selectOption('5')
  await p.locator('select').nth(2).selectOption('Galicia')
  await p.getByRole('button', { name: /Crear grupo/ }).click()
  await p.waitForURL(/\/grupos\/\d+/)
  await p.waitForTimeout(900)
  await p.getByRole('link', { name: /Exámenes y pruebas/ }).click()
  await tarjeta.locator('[data-examen]').first().waitFor({ timeout: 10000 }).catch(() => {})
  const activa = await tarjeta.locator('[data-examenes-clase]').count() ? await tarjeta.locator('[data-examenes-clase]').textContent() : '(sin pestañas)'
  if (await tarjeta.locator('[data-examenes-otras-toggle]').count()) await tarjeta.locator('[data-examenes-otras-toggle]').click()
  ok(await tarjeta.locator('[data-examen]').count() === 2, 'los dos exámenes de 6ºA siguen en la pantalla', `clase activa: ${activa}`)
  ok((await tarjeta.locator('[data-examen]').first().textContent()).includes('6ºA'), 'y cada uno dice de qué clase es')
  await foto('examenes-area-03-otra-clase')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('examenes-area-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
