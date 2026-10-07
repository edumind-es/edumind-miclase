/**
 * Familias e hijos en el Calificador, de punta a punta: con dos hijos dentro
 * de «Táboa de indicadores» (Speaking y Cuaderno), la vista por instrumento
 * los agrupa bajo su familia, «Evaluar hoy» escribe en el hijo, la casilla
 * por criterio enseña la nota fundida de la familia (la misma del cálculo),
 * el panel ofrece los hijos y no la familia, y ninguna nota se guarda con el
 * id de la familia.
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

const estado = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const alumnos = (await leer('alumnos')).sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  const a = alumnos[0]
  return {
    instrumentos: (await leer('instrumentos')).map(i => ({ id: i.id, nombre: i.nombre, familia_id: i.familia_id ?? null })),
    notas: (await leer('calificaciones')).filter(c => c.alumno_id === a.id && c.valor != null).map(c => ({ criterio: c.criterio_id, instrumento_id: c.instrumento_id, valor: c.valor, origen: c.origen ?? null })),
    diario: (await leer('diario')).filter(r => r.alumno_id === a.id).map(r => ({ instrumento_id: r.instrumento_id, valor: r.valor })),
  }
})

const anadirHijo = async (bloque, nombre, tipo) => {
  await bloque.locator('[data-hijo-nuevo]').click()
  await bloque.locator('[data-hijo-form] input:not([type="checkbox"])').first().fill(nombre)
  await bloque.locator('[data-hijo-form] select').selectOption(tipo)
  await bloque.locator('[data-hijo-crear]').click()
  await bloque.locator(`[data-hijo][data-nombre="${nombre}"]`).waitFor({ timeout: 5000 })
}

try {
  console.log('\n1. Clase con programación de PROENS y dos hijos en la táboa')
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
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  const columnasCriterio = await p.locator('th.criterio-th').count()
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()
  const gestor = p.getByRole('dialog', { name: 'Gestionar instrumentos de evaluación' })
  await gestor.waitFor({ timeout: 5000 })
  const taboa = gestor.locator('[data-familia-hijos]').nth(1)
  await anadirHijo(taboa, 'Speaking', 'oral')
  await anadirHijo(taboa, 'Cuaderno', 'portfolio')
  const colores = taboa.locator('[data-hijo][data-nombre="Cuaderno"] [data-color-hijo] button[aria-pressed="true"]')
  ok(await colores.count() === 1, 'cada hijo tiene un color marcado por defecto')
  await gestor.getByRole('button', { name: 'Cerrar' }).click()
  await gestor.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(1200)
  let e = await estado()
  const speaking = e.instrumentos.find(i => i.nombre === 'Speaking')
  const cuaderno = e.instrumentos.find(i => i.nombre === 'Cuaderno')
  const famTaboa = e.instrumentos.find(i => i.id === speaking.familia_id)
  ok(!!famTaboa && cuaderno.familia_id === famTaboa.id, 'los dos cuelgan de la táboa')

  console.log('\n2. Por criterio: mismas columnas, la cabecera lleva franja y siglas')
  ok(await p.locator('th.criterio-th').count() === columnasCriterio, 'los hijos no añaden columnas por criterio')
  ok(await p.locator('.criterio-th-franja').count() === columnasCriterio, 'cada criterio lleva su franja de color')
  const siglas = await p.locator('.criterio-th-instr .abrev').allTextContents()
  ok(siglas.includes('TI') && siglas.includes('PE'), 'las siglas son de las familias (TI, PE), no de los hijos', [...new Set(siglas)].join(','))
  await foto('familias-cal-01-criterios')

  console.log('\n3. Por instrumento: agrupado por familia')
  await p.locator('[data-vista="instrumentos"]').click()
  await p.locator('[data-instr-th]').first().waitFor({ timeout: 5000 })
  const familiasTh = p.locator('[data-familia-th]')
  ok(await familiasTh.count() === 2, 'una fila de familias con dos grupos', `${await familiasTh.count()}`)
  const grupoTaboa = familiasTh.filter({ hasText: /T[aá]boa/ })
  ok(await grupoTaboa.getAttribute('colspan') === '2', 'la táboa abarca sus dos hijos', await grupoTaboa.getAttribute('colspan'))
  const nombres = await p.locator('[data-instr-th]').evaluateAll(ths => ths.map(t => t.dataset.nombre))
  ok(nombres.length === 3 && nombres.includes('Speaking') && nombres.includes('Cuaderno') && !nombres.some(n => /T[aá]boa/.test(n)),
    'las columnas son la proba y los dos hijos; la táboa no es columna', nombres.join(' | '))
  await foto('familias-cal-02-instrumentos')

  console.log('\n4. «Evaluar hoy» con Cuaderno escribe en el hijo')
  await p.locator('[data-instr-th][data-nombre="Cuaderno"] [data-sesion-abrir]').click()
  const sesion = p.getByRole('dialog', { name: /^Evaluar hoy: Cuaderno/ })
  await sesion.waitFor({ timeout: 5000 })
  await sesion.locator('[data-sesion-fila]').first().locator('button.nivel-3').click()
  await sesion.locator('[data-sesion-fila]').first().locator('[data-sesion-nota]').getByText('7.5').waitFor({ timeout: 5000 })
  await sesion.getByRole('button', { name: 'Hecho' }).click()
  await sesion.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(900)
  e = await estado()
  ok(e.diario.length === 1 && e.diario[0].instrumento_id === cuaderno.id, 'el registro del diario es del cuaderno')
  ok(e.notas.length > 0 && e.notas.every(n => n.instrumento_id === cuaderno.id && n.valor === 7.5 && n.origen === 'diario'), 'las notas derivadas son del cuaderno', JSON.stringify(e.notas.slice(0, 2)))
  ok(!e.notas.some(n => n.instrumento_id === famTaboa.id), 'ninguna nota lleva el id de la familia')
  const criterioCuaderno = e.notas[0].criterio

  console.log('\n5. Por criterio: la casilla enseña la nota de la familia, fundida')
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('th.criterio-th').first().waitFor({ timeout: 5000 })
  await p.waitForTimeout(600)
  const idx = await p.locator('th.criterio-th .criterio-th-id').evaluateAll((els, id) => els.findIndex(x => x.textContent.trim() === id), criterioCuaderno)
  ok(idx >= 0, `la columna ${criterioCuaderno} existe`)
  const celda = p.locator('tbody tr').first().locator('td.celda .celda-btn').nth(idx)
  ok((await celda.textContent()).startsWith('7.5'), 'con un solo hijo con nota, la casilla vale 7,5', await celda.textContent())
  await celda.click()
  const panel = p.getByRole('dialog', { name: /^Evaluar / })
  // El panel pliega en «Más» lo que no es el instrumento (criterio entero, copiar o
  // vincular, observación, evidencias, ajustes). Estas pruebas lo necesitan abierto.
  const abrirMas = async () => {
    const t = panel.locator('[data-mas-toggle]')
    if (await t.count() && (await t.getAttribute('aria-expanded')) !== 'true') await t.click()
  }
  await panel.waitFor({ timeout: 8000 })
  await abrirMas()
  const chips = await panel.locator('[data-instrumento-chip]').evaluateAll(bs => bs.map(b => b.dataset.instrumentoChip))
  ok(chips.includes('Speaking') && chips.includes('Cuaderno') && !chips.some(c => /T[aá]boa/.test(c)), 'el panel ofrece los hijos y no la familia', chips.join(' | '))
  ok(await panel.locator('[data-grupo-familia]').count() === 1, 'y los agrupa bajo el rótulo de la familia')
  await panel.locator('[data-instrumento-chip="Speaking"]').click()
  await panel.locator('[data-diario-manual]').count() // no hay diario en Speaking: la parrilla está a la vista
  await panel.locator('button.cal-5').click()
  await panel.getByText(/5 guardado en/).waitFor({ timeout: 5000 })
  await foto('familias-cal-03-panel')
  await p.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(900)
  e = await estado()
  const deSpeaking = e.notas.find(n => n.instrumento_id === speaking.id && n.criterio === criterioCuaderno)
  ok(deSpeaking?.valor === 5, 'el 5 se guarda con el id de Speaking')
  // Táboa = media(7.5 del cuaderno, 5 de speaking) con peso 1 cada uno = 6.25 → 6.3
  const celda2 = p.locator('tbody tr').first().locator('td.celda .celda-btn').nth(idx)
  ok((await celda2.textContent()).startsWith('6.3'), 'la casilla funde los dos hijos: 6,3', await celda2.textContent())

  console.log('\n6. Seguimiento usa la misma fusión')
  await p.getByRole('link', { name: 'Seguimiento', exact: true }).click()
  await p.waitForTimeout(1800)
  // Seguimiento resume el área: media de los cinco criterios con nota, CE1.1
  // fundida a 6,25 y los otros cuatro a 7,5 → 7,25 (7,3 a un decimal). Si la
  // familia contara además de sus hijos, o los hijos por separado con el peso
  // de la familia, saldría otra cosa.
  const texto = await p.locator('body').textContent()
  ok(/7[.,]25|7[.,]3(?![\d])/.test(texto), 'la nota del área en seguimiento sale de la misma fusión (7,25)', texto.match(/7[.,]\d+/g)?.slice(0, 6).join(' ') ?? 'sin sietes')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('familias-cal-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
