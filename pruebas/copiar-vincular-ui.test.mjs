/**
 * Un instrumento para varios criterios: copiar la nota y vincular, de punta a punta.
 *
 * Parte de una programación real (el PDF gemelo de PROENS, donde «Proba
 * escrita» evalúa varios criterios de la misma unidad) y tres alumnos. Se
 * comprueba en IndexedDB, que es donde un fallo aquí haría daño: que copiar no
 * pise notas ya puestas, que un vínculo replique solo a los criterios elegidos
 * y solo desde que existe, que lo diga al guardar, y que quitarlo deje de
 * replicar sin tocar lo ya escrito.
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
const ctx = await navegador.newContext({ viewport: { width: 1500, height: 1000 } })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })

/** Notas vivas: alumno (por orden de lista) → criterio → valor. */
const notas = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const alumnos = (await leer('alumnos')).sort((a, b) => a.apellidos.localeCompare(b.apellidos))
  const cals = (await leer('calificaciones')).filter(c => c.valor != null)
  return alumnos.map(a => Object.fromEntries(
    cals.filter(c => c.alumno_id === a.id).map(c => [c.criterio_id, c.valor]).sort()))
})

const panel = p.getByRole('dialog', { name: /^Evaluar / })
const caja = panel.locator('[data-hermanos]')
const aviso = texto => panel.getByText(texto).waitFor({ timeout: 6000 }).then(() => true, () => false)
const poner = async (n) => { await panel.locator(`button.cal-${n}`).click(); await aviso(new RegExp(`^✅ ${n} guardado`)) }

try {
  console.log('\n1. Clase con programación de PROENS y tres alumnos')
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
  await p.getByPlaceholder('Pega aquí la lista de alumnado…').fill('Abad Ríos, Ana\nBello Souto, Bruno\nCasal Vidal, Carla')
  await p.getByRole('button', { name: /Analizar/ }).click()
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: /Confirmar e importar/ }).click()
  await p.getByText(/3 alumnos creados/).waitFor({ timeout: 8000 })
  await p.getByRole('button', { name: 'Cerrar' }).click()

  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  await p.locator('.celda-btn:not(.sin-instrumento)').first().click()
  await panel.waitFor({ timeout: 8000 })
  await caja.waitFor({ timeout: 5000 })
  const origen = (await panel.getByText(/^CRITERIO /).textContent()).replace('CRITERIO ', '').trim()
  const textoCaja = await caja.textContent()
  ok(/evalúa también/.test(textoCaja), 'el panel dice qué otros criterios evalúa el instrumento', textoCaja.slice(0, 90))
  ok((await notas()).every(a => Object.keys(a).length === 0), 'y no hay ninguna nota todavía')

  console.log(`\n2. Copiar la nota de ${origen} (solo este alumno)`)
  await poner(8)
  await caja.getByRole('button', { name: 'Copiar nota…' }).click()
  const casillas = caja.locator('input[type="checkbox"]')
  const nHermanos = (await casillas.count()) - 1   // la última es «Sobrescribir»
  ok(nHermanos >= 2, 'ofrece los demás criterios del instrumento', `${nHermanos} criterios`)
  // Se deja fuera el último para comprobar que solo se copia a los elegidos.
  await casillas.nth(nHermanos - 1).uncheck()
  await foto('copiar-vincular-01-copiar')
  await caja.getByRole('button', { name: 'Copiar', exact: true }).click()
  ok(await aviso(new RegExp(`${nHermanos - 1} notas? copiadas? de ${origen}`)), 'dice cuántas ha copiado')
  let n = await notas()
  ok(Object.keys(n[0]).length === nHermanos && Object.values(n[0]).every(v => v === 8),
    'el alumno tiene la nota en el origen y en los elegidos, y en ninguno más', JSON.stringify(n[0]))
  ok(Object.keys(n[1]).length === 0 && Object.keys(n[2]).length === 0, 'los demás alumnos no se tocan')
  const copiados = Object.keys(n[0]).filter(c => c !== origen)

  console.log('\n3. Vincular con un solo criterio')
  await caja.getByRole('button', { name: /Vincular…/ }).click()
  for (let i = 1; i < nHermanos; i++) await casillas.nth(i).uncheck()
  const vinculado = (await caja.locator('label').first().locator('strong').textContent()).trim()
  await caja.getByRole('button', { name: '🔗 Vincular', exact: true }).click()
  ok(await aviso(new RegExp(`${origen} vinculado con ${vinculado}`)), 'confirma el vínculo')
  ok(await caja.getByText(new RegExp(`Vinculado con ${vinculado}`)).waitFor({ timeout: 5000 }).then(() => true, () => false),
    'y el panel lo recuerda')
  ok(JSON.stringify(await notas()) === JSON.stringify(n), 'vincular no cambia ninguna nota ya puesta')
  ok(await p.locator('.criterio-th-instr .vinculo').count() === 2, 'las dos columnas llevan la marca 🔗 en la cabecera',
    String(await p.locator('.criterio-th-instr .vinculo').count()))

  console.log('\n4. Calificar con el vínculo puesto')
  await panel.getByRole('button', { name: '↓' }).click()
  await p.waitForTimeout(400)
  await panel.locator('button.cal-6').click()
  ok(await aviso(/6 guardado en .+ y en 1 criterio vinculado/), 'al guardar avisa de que ha escrito también en el vinculado')
  n = await notas()
  ok(Object.keys(n[1]).length === 2 && n[1][origen] === 6 && n[1][vinculado] === 6,
    'el segundo alumno tiene la nota en los dos criterios, y solo en esos', JSON.stringify(n[1]))

  await panel.getByRole('button', { name: '↑' }).click()
  await p.waitForTimeout(400)
  await panel.locator('button.cal-5').click()
  await aviso(/5 guardado/)
  n = await notas()
  const sinVincular = copiados.filter(c => c !== vinculado)
  ok(n[0][origen] === 5 && n[0][vinculado] === 5, 'corregir la nota corrige también la vinculada')
  ok(sinVincular.every(c => n[0][c] === 8), 'los que solo se copiaron conservan su 8: la copia no es un vínculo', JSON.stringify(n[0]))

  console.log('\n5. Copiar la columna a toda la clase, sin pisar')
  await caja.getByRole('button', { name: 'Copiar nota…' }).click()
  await caja.getByLabel(/Toda la clase \(3\)/).check()
  await caja.getByRole('button', { name: 'Copiar', exact: true }).click()
  ok(await aviso(/ya tenían? nota y se han? respetado/), 'dice cuántas casillas ha respetado')
  ok(await aviso(/1 alumno sin nota/), 'y cuántos alumnos no tenían nota que copiar')
  n = await notas()
  ok(sinVincular.every(c => n[0][c] === 8), 'las notas que ya había no se pisan', JSON.stringify(n[0]))
  ok(Object.keys(n[1]).length === nHermanos + 1 && Object.values(n[1]).every(v => v === 6),
    'el segundo alumno recibe su 6 en todos', JSON.stringify(n[1]))
  ok(Object.keys(n[2]).length === 0, 'el tercero, sin nota en el origen, sigue sin nada')
  await foto('copiar-vincular-02-columna')

  console.log('\n6. Quitar el vínculo')
  await caja.getByRole('button', { name: /Cambiar vínculo…/ }).click()
  await caja.getByRole('button', { name: 'Quitar el vínculo' }).click()
  ok(await aviso(/Vínculo quitado/), 'lo confirma')
  await panel.getByRole('button', { name: '↓' }).click()
  await p.waitForTimeout(300)
  await panel.getByRole('button', { name: '↓' }).click()
  await p.waitForTimeout(400)
  await poner(7)
  n = await notas()
  ok(Object.keys(n[2]).length === 1 && n[2][origen] === 7, 'la nota nueva ya no se replica', JSON.stringify(n[2]))
  ok(n[0][vinculado] === 5 && n[1][vinculado] === 6, 'y las replicadas antes se quedan como estaban')
  ok(await p.locator('.criterio-th-instr .vinculo').count() === 0, 'la marca 🔗 desaparece de la cabecera')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('copiar-vincular-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
