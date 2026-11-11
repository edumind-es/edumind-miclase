/**
 * Medidas de atención a la diversidad de punta a punta: un refuerzo desde la
 * ficha del alumno (con NEAE encendido) que excluye una familia, el sello en
 * el calificador, la casilla que no cuenta, la nota de «Todo el curso» que
 * cambia solo para ese alumno, «de dónde sale esta nota» que lo dice, y que
 * apagar NEAE esconde sello y editor sin cambiar la nota.
 *
 * Misma clase de partida que las demás: la programación gemela de PROENS
 * («Proba escrita» 80 % y «Táboa de indicadores» 20 %).
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
const ctx = await navegador.newContext({ viewport: { width: 1500, height: 1000 } })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
await aceptarConfirmaciones(p)
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })

const sensibles = (neae) => p.evaluate((neae) => {
  const d = { neae, evidencias: false }
  localStorage.setItem('miclase.sensibles', JSON.stringify(d))
  window.dispatchEvent(new CustomEvent('miclase:sensibles', { detail: d }))
}, neae)

/** Unidades con sus criterios y, por criterio, los nombres de las familias que lo evalúan. */
const programacion = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const unidades = (await leer('unidades')).sort((a, b) => (a.trimestre ?? 9) - (b.trimestre ?? 9) || a.orden - b.orden || a.id - b.id)
  const ucs = await leer('unidad_criterios')
  const cis = await leer('criterio_instrumentos')
  const ins = await leer('instrumentos')
  const nombre = id => ins.find(i => i.id === id)?.nombre
  return {
    version: db.version,
    unidades: unidades.map((u, i) => ({
      id: u.id, nombre: u.nombre, trimestre: u.trimestre, pestana: i + 1,
      criterios: ucs.filter(x => x.unidad_id === u.id).map(x => ({
        id: x.criterio_id,
        familias: cis.filter(ci => ci.unidad_id === u.id && ci.criterio_id === x.criterio_id).map(ci => nombre(ci.instrumento_id)).filter(Boolean),
      })),
    })),
  }
})

/** Las medidas vivas en IndexedDB. */
const medidasGuardadas = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const tx = db.transaction('medidas', 'readonly').objectStore('medidas').getAll()
  return new Promise((res) => { tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at)) })
})

const panel = p.getByRole('dialog', { name: /^Evaluar / })
const guardado = (nota) => panel.getByText(new RegExp(`${nota} guardado en`)).waitFor({ timeout: 5000 })

/** Nota con cada familia a un alumno (fila `filaIdx`) en un criterio de la unidad abierta. */
const calificar = async (filaIdx, criterio, porFamilia) => {
  await p.locator('th.criterio-th').first().waitFor({ timeout: 8000 })
  const idx = await p.locator('th.criterio-th .criterio-th-id').evaluateAll((els, id) => els.findIndex(x => x.textContent.trim() === id), criterio)
  ok(idx >= 0, `la columna ${criterio} existe en la unidad`)
  const celda = p.locator('tbody tr').nth(filaIdx).locator('td.celda .celda-btn').nth(idx)
  await celda.click()
  await panel.waitFor({ timeout: 8000 })
  for (const [familia, nota] of porFamilia) {
    // El selector de instrumento solo existe si la casilla tiene varios.
    const chip = panel.locator(`[data-instrumento-chip="${familia}"]`)
    if (await chip.count()) await chip.click()
    await panel.locator(`button.cal-${nota}`).waitFor({ timeout: 5000 })
    await panel.locator(`button.cal-${nota}`).click()
    await guardado(nota)
  }
  await p.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(900)
  return (await celda.textContent()).trim()
}

try {
  console.log('\n1. Clase con programación de PROENS, dos alumnos y NEAE encendido')
  await p.goto(BASE + '/grupos/nuevo', { waitUntil: 'networkidle' })
  await p.waitForTimeout(500)
  await sensibles(true)
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

  const prog = await programacion()
  ok(prog.version === 100, 'la base está en la versión 10 del esquema', `idb v${prog.version}`)
  // Una unidad con un criterio evaluado por una familia y otro por otra
  // distinta (en la programación de PROENS cada criterio lleva una familia).
  let eleccion = null
  for (const u of prog.unidades) {
    const a = u.criterios.find(c => c.familias.length === 1)
    const b = a && u.criterios.find(c => c.familias.length === 1 && c.familias[0] !== a.familias[0])
    if (a && b && !eleccion) eleccion = { unidad: u, c1: a.id, famA: a.familias[0], c2: b.id, famB: b.familias[0] }
  }
  ok(!!eleccion, 'hay una unidad con dos criterios evaluados por familias distintas', eleccion ? `${eleccion.unidad.nombre} · ${eleccion.c1} (${eleccion.famA}) · ${eleccion.c2} (${eleccion.famB})` : '')
  const { unidad, c1, famA, c2, famB } = eleccion
  const T = unidad.trimestre

  console.log(`\n2. Los dos alumnos con las mismas notas: 4 en ${c1} («${famA}») y 10 en ${c2} («${famB}»)`)
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('[data-presentacion-entendido]').click({ timeout: 5000 }).catch(() => {})
  await p.locator('[data-vista="criterios"]').click()
  await p.getByLabel('Trimestre').selectOption(String(T))
  await elegirUnidad(p, unidad.pestana)
  await p.waitForTimeout(1200)
  const ana1 = await calificar(0, c1, [[famA, 4]])
  const ana2 = await calificar(0, c2, [[famB, 10]])
  const bruno1 = await calificar(1, c1, [[famA, 4]])
  const bruno2 = await calificar(1, c2, [[famB, 10]])
  ok(ana1 === bruno1 && ana2 === bruno2, 'sin medidas, las mismas casillas valen lo mismo para los dos', `${ana1}/${bruno1} · ${ana2}/${bruno2}`)
  ok(await p.locator('[data-sello-medida]').count() === 0, 'nadie lleva sello de medida todavía')

  console.log('\n3. Refuerzo desde la ficha de Ana: «' + famA + '» no cuenta')
  await p.getByRole('link', { name: 'Alumnado', exact: true }).click()
  await p.waitForTimeout(600)
  await p.getByRole('button', { name: /Editar Ana Abad/ }).click()
  await p.getByRole('dialog', { name: 'Editar alumno' }).waitFor({ timeout: 5000 })
  await p.locator('[data-medidas-abrir]').click()
  const editor = p.locator('[data-medidas-alumno]')
  await editor.waitFor({ timeout: 5000 })
  // Con una sola área el editor la abre desplegada; si no, se despliega.
  await editor.locator('[data-medida-refuerzo]').first().waitFor({ timeout: 4000 })
    .catch(() => editor.locator('[data-medidas-area-toggle]').first().click())
  await editor.locator('[data-refuerzo-activar]').click()
  await editor.locator('[data-medida-refuerzo][data-activa]').waitFor({ timeout: 5000 })
  const filas = editor.locator('[data-refuerzo-instrumento]')
  ok(await filas.count() >= 2, 'el refuerzo lista las familias del área con sus porcentajes', `${await filas.count()} filas`)
  const filaA = filas.filter({ hasText: famA }).first()
  await filaA.locator('[data-refuerzo-excluir]').check()
  await p.waitForTimeout(600)
  ok(await filaA.getAttribute('data-cuenta') === null, `«${famA}» queda marcada como que no cuenta`)
  let guardadas = await medidasGuardadas()
  ok(guardadas.length === 1 && guardadas[0].tipo === 'refuerzo' && JSON.parse(guardadas[0].pesos_json)[Object.keys(JSON.parse(guardadas[0].pesos_json)).find(k => true)] !== undefined,
    'hay una medida de refuerzo guardada con sus pesos', JSON.stringify(guardadas.map(m => ({ tipo: m.tipo, pesos: m.pesos_json, trimestres: m.trimestres }))))
  ok(Object.values(JSON.parse(guardadas[0].pesos_json)).includes(0), 'y uno de los pesos es 0 (no cuenta)')
  await foto('medidas-01-editor')
  await p.keyboard.press('Escape')
  await editor.waitFor({ state: 'hidden', timeout: 5000 })
  await p.keyboard.press('Escape')

  console.log('\n4. En el calificador: sello, casilla que no cuenta y nota distinta solo para Ana')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('[data-vista="criterios"]').click()
  await p.getByLabel('Trimestre').selectOption(String(T))
  await elegirUnidad(p, unidad.pestana)
  await p.waitForTimeout(1200)
  const filaAna = p.locator('tbody tr').first()
  ok(await filaAna.locator('[data-sello-medida="refuerzo"]').count() === 1, 'Ana lleva el sello RE', await filaAna.locator('[data-sello-medida]').allTextContents().then(x => x.join(',')))
  ok(await p.locator('tbody tr').nth(1).locator('[data-sello-medida]').count() === 0, 'Bruno no')
  // La casilla de c1 no cuenta para Ana (su única familia está excluida); la de c2 sí.
  const idxDe = id => p.locator('th.criterio-th .criterio-th-id').evaluateAll((els, id) => els.findIndex(x => x.textContent.trim() === id), id)
  const celdaC1 = filaAna.locator('td.celda .celda-btn').nth(await idxDe(c1))
  const celdaC2 = filaAna.locator('td.celda .celda-btn').nth(await idxDe(c2))
  ok(await celdaC1.getAttribute('data-no-cuenta') !== null && await celdaC2.getAttribute('data-no-cuenta') === null, `por criterio, ${c1} sale apagada para Ana y ${c2} no`)
  ok(await p.locator('tbody tr').nth(1).locator('[data-no-cuenta]').count() === 0, 'para Bruno ninguna casilla está apagada')
  await celdaC1.click()
  await panel.waitFor({ timeout: 8000 })
  const aviso = panel.locator('[data-medida-aviso]')
  ok(await aviso.count() === 1 && /Refuerzo educativo/.test(await aviso.textContent()) && /no cuenta/i.test(await aviso.textContent()), 'el panel de la casilla avisa del refuerzo y de que no cuenta', (await aviso.textContent().catch(() => '')).slice(0, 90))
  await p.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden', timeout: 5000 })

  // Vista por instrumento: la columna de la familia excluida sale apagada para Ana.
  await p.locator('[data-vista="instrumentos"]').click()
  await p.waitForTimeout(900)
  const apagadas = await p.locator('tbody tr').first().locator('[data-celda-instr][data-no-cuenta]').count()
  const apagadasBruno = await p.locator('tbody tr').nth(1).locator('[data-celda-instr][data-no-cuenta]').count()
  ok(apagadas >= 1 && apagadasBruno === 0, 'por instrumento, la columna excluida sale apagada para Ana y no para Bruno', `${apagadas} / ${apagadasBruno}`)
  await foto('medidas-02-calificador')

  console.log('\n5. «Todo el curso»: para Ana ' + c1 + ' no cuenta y el área sale solo de ' + c2)
  await p.locator('[data-vista="criterios"]').click()
  await elegirUnidad(p, 0)
  await p.locator('[data-matriz-resumen="criterios"]').waitFor({ timeout: 8000 })
  for (const ce of new Set([c1, c2].map(c => 'CE' + c.match(/(\d+)/)[1]))) {
    await p.locator(`[data-competencia-th="${ce}"]`).click()
  }
  await p.locator(`[data-criterio-th="${c1}"]`).waitFor({ timeout: 5000 })
  const celdaDe = (fila, c, t) => p.locator('tbody tr').nth(fila).locator(`[data-celda-resumen][data-criterio="${c}"][data-trimestre="${t}"]`)
  const areaDe = fila => p.locator('tbody tr').nth(fila).locator('[data-celda-resumen][data-area][data-trimestre="final"]')
  const anaC1 = (await celdaDe(0, c1, T).textContent()).trim()
  const brunoC1 = (await celdaDe(1, c1, T).textContent()).trim()
  ok(anaC1 === '·', `Ana no tiene nota en ${c1}: su familia no cuenta`, anaC1)
  ok(brunoC1 === '4', `Bruno sigue con 4 en ${c1}`, brunoC1)
  const anaArea = (await areaDe(0).textContent()).trim()
  const brunoArea = (await areaDe(1).textContent()).trim()
  ok(anaArea === '10', 'el área de Ana sale solo del criterio que cuenta: 10', anaArea)
  ok(brunoArea !== '10' && brunoArea !== '·', 'la de Bruno pondera los dos criterios', brunoArea)
  await celdaDe(0, c2, T).click()
  const explicacion = p.locator('[data-explicacion-medida]')
  ok(await explicacion.count() === 1 && /Refuerzo educativo/.test(await explicacion.textContent()), '«de dónde sale esta nota» nombra el refuerzo')
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)

  console.log('\n6. Con NEAE apagado: ni sello ni editor, pero la misma nota')
  await sensibles(false)
  await p.waitForTimeout(500)
  ok(await p.locator('[data-sello-medida]').count() === 0, 'el sello desaparece')
  ok((await areaDe(0).textContent()).trim() === '10', 'el área de Ana sigue siendo 10: la medida se aplica igual')
  await p.getByRole('link', { name: 'Alumnado', exact: true }).click()
  await p.waitForTimeout(600)
  await p.getByRole('button', { name: /Editar Ana Abad/ }).click()
  await p.getByRole('dialog', { name: 'Editar alumno' }).waitFor({ timeout: 5000 })
  ok(await p.locator('[data-medidas-abrir]').count() === 0, 'la ficha no ofrece las medidas')
  await p.keyboard.press('Escape')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('medidas-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
