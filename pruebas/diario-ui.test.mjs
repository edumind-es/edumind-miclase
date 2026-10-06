/**
 * Diario de evaluación de punta a punta: varios registros que no se pisan,
 * nota derivada con la regla del instrumento, reparto a los criterios
 * hermanos, mini-tendencia en la matriz y nota a mano que desactiva el diario.
 *
 * Misma clase de partida que copiar-vincular: la programación gemela de
 * PROENS, donde «Proba escrita» evalúa varios criterios de la misma unidad.
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
p.on('dialog', d => d.accept())
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })

/** Estado vivo en IndexedDB del primer alumno: notas (criterio → {valor, origen}) y registros del diario. */
const estado = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const alumnos = (await leer('alumnos')).sort((a, b) => a.apellidos.localeCompare(b.apellidos))
  const a = alumnos[0]
  const cals = (await leer('calificaciones')).filter(c => c.alumno_id === a.id && c.valor != null)
  const diario = (await leer('diario')).filter(r => r.alumno_id === a.id)
  return {
    notas: Object.fromEntries(cals.map(c => [c.criterio_id, { valor: c.valor, origen: c.origen ?? null, anterior: c.valor_anterior ?? null }])),
    registros: diario.map(r => ({ valor: r.valor, criterios: JSON.parse(r.criterios_json) })),
    version: db.version,
  }
})

const panel = p.getByRole('dialog', { name: /^Evaluar / })
const diario = panel.locator('[data-diario]')
const aviso = texto => panel.getByText(texto).waitFor({ timeout: 6000 }).then(() => true, () => false)
const registrar = async (nivel) => {
  await diario.locator('[data-diario-nuevo]').click()
  await diario.locator(`button.nivel-${nivel}`).click()
  await diario.locator('[data-diario-guardar]').click()
}

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
  await diario.waitFor({ timeout: 5000 })
  const origen = (await panel.getByText(/^CRITERIO /).textContent()).replace('CRITERIO ', '').trim()
  let e = await estado()
  ok(e.version === 60, 'la base está en la versión 6 del esquema', `idb v${e.version}`)
  ok(Object.keys(e.notas).length === 0 && e.registros.length === 0, 'sin notas ni registros todavía')
  ok(await panel.locator('button.cal-5').count() === 1, 'sin registros, la parrilla 0-10 sigue a la vista')

  console.log(`\n2. Primer registro en ${origen}: nivel 3`)
  await registrar(3)
  ok(await aviso(/Registro 1 añadido · nota 7\.5 en /), 'avisa de la nota derivada y de dónde ha ido')
  e = await estado()
  ok(e.registros.length === 1 && e.registros[0].valor === 3, 'hay un registro de nivel 3 en el diario')
  const criterios = e.registros[0].criterios
  ok(criterios.length >= 2 && criterios.includes(origen), 'el registro reparte al criterio y a sus hermanos', criterios.join(', '))
  ok(criterios.every(c => e.notas[c]?.valor === 7.5 && e.notas[c]?.origen === 'diario'),
    'todos llevan 7,5 con origen «diario»', JSON.stringify(e.notas))
  ok(Object.keys(e.notas).length === criterios.length, 'y ningún otro criterio tiene nota')
  ok(await panel.locator('button.cal-5').count() === 0, 'con la nota derivada, la parrilla 0-10 queda plegada')
  ok(await panel.getByText(/calculada del diario/).count() === 1, 'el panel dice que la nota sale del diario')
  await foto('diario-01-primer-registro')

  console.log('\n3. Segundo registro: nivel 4 (media de 3 y 4)')
  await registrar(4)
  ok(await aviso(/Registro 2 añadido · nota 8\.8 en /), 'la nota pasa a 8,8')
  e = await estado()
  ok(e.registros.length === 2, 'los dos registros conviven: ninguno pisa al otro')
  ok(e.notas[origen]?.valor === 8.8, 'la nota materializada es 8,8', String(e.notas[origen]?.valor))
  const tendencia = await p.locator('.celda-diario').first().textContent()
  ok(tendencia === '3·4', 'la casilla de la matriz enseña la mini-tendencia', tendencia)

  console.log('\n4. Borrar el primer registro')
  await diario.locator('[data-registro] button').first().click()
  ok(await aviso(/Registro borrado · nota recalculada/), 'lo dice')
  e = await estado()
  ok(e.registros.length === 1 && e.registros[0].valor === 4, 'queda solo el de nivel 4')
  ok(e.notas[origen]?.valor === 10, 'y la nota es 10', String(e.notas[origen]?.valor))

  console.log('\n5. Cambiar la regla de agregación a «última»')
  await registrar(1)
  ok(await aviso(/Registro 2 añadido · nota 6\.3 en /), 'con media, 4 y 1 dan 6,3')
  await p.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()
  const gestor = p.getByRole('dialog', { name: 'Gestionar instrumentos de evaluación' })
  await gestor.waitFor({ timeout: 5000 })
  const selects = gestor.locator('[data-agregacion] select')
  ok(await selects.count() >= 1, 'cada instrumento tiene su regla de agregación', `${await selects.count()} instrumentos`)
  for (let i = 0; i < await selects.count(); i++) await selects.nth(i).selectOption('ultima')
  await p.waitForTimeout(600)
  await gestor.getByRole('button', { name: 'Cerrar' }).click()
  await p.waitForTimeout(1200)
  e = await estado()
  ok(e.notas[origen]?.valor === 2.5 && e.notas[origen]?.origen === 'diario', 'con «última» la nota pasa a 2,5 sin tocar el diario', JSON.stringify(e.notas[origen]))
  ok(e.registros.length === 2, 'los registros siguen ahí')
  await foto('diario-02-ultima')

  console.log('\n6. Poner la nota a mano desactiva el diario hasta el próximo registro')
  await p.locator('.celda-btn:not(.sin-instrumento)').first().click()
  await panel.waitFor({ timeout: 8000 })
  await diario.waitFor({ timeout: 5000 })
  await panel.locator('[data-diario-manual]').click()
  await panel.locator('button.cal-9').waitFor({ timeout: 5000 })
  await panel.locator('button.cal-9').click()
  ok(await aviso(/9 guardado en /), 'la nota a mano se guarda')
  e = await estado()
  ok(e.notas[origen]?.valor === 9 && e.notas[origen]?.origen === null, 'la casilla deja de ser derivada', JSON.stringify(e.notas[origen]))
  await registrar(4)
  ok(await aviso(/Registro 3 añadido · nota 10 en /), 'un registro nuevo vuelve a mandar')
  e = await estado()
  ok(e.notas[origen]?.valor === 10 && e.notas[origen]?.origen === 'diario' && e.notas[origen]?.anterior === 9,
    'el 9 a mano queda como nota fantasma, no se pierde', JSON.stringify(e.notas[origen]))
  ok(await panel.locator('[data-fantasma]').count() === 1, 'y el panel la enseña')
  await foto('diario-03-fantasma')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('diario-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
