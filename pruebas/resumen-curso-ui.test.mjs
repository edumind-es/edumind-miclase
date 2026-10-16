/**
 * «Todo el curso» con los tres trimestres a la vez, de punta a punta: el
 * mismo criterio calificado en dos unidades del mismo trimestre (8 y 6) se
 * ve separado en cada pestaña de unidad y como media (7) en el resumen, en
 * la columna 1T, con la final; la ficha nombra las dos unidades y explica el
 * camino (media de unidades → instrumento → familia); el selector de
 * trimestre de la barra no cambia el resumen; la vista por familia agrupa a
 * los hijos; y a 1024 px (iPad) la página no desborda porque el resumen
 * arranca plegado por competencia.
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

/** Unidades con sus criterios e instrumentos, tal como están en IndexedDB. */
const programacion = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const unidades = (await leer('unidades')).sort((a, b) => (a.trimestre ?? 9) - (b.trimestre ?? 9) || a.orden - b.orden || a.id - b.id)
  const ucs = await leer('unidad_criterios')
  const cis = await leer('criterio_instrumentos')
  return unidades.map((u, i) => ({
    id: u.id, nombre: u.nombre, trimestre: u.trimestre, pestana: i + 1,
    criterios: ucs.filter(x => x.unidad_id === u.id).map(x => x.criterio_id)
      .filter(c => cis.some(ci => ci.unidad_id === u.id && ci.criterio_id === c)),
  }))
})

/** Pone una nota (clase `cal-N`) al primer alumno en un criterio de la unidad abierta. */
const calificar = async (criterio, nota) => {
  await p.locator('th.criterio-th').first().waitFor({ timeout: 8000 })
  const idx = await p.locator('th.criterio-th .criterio-th-id').evaluateAll((els, id) => els.findIndex(x => x.textContent.trim() === id), criterio)
  ok(idx >= 0, `la columna ${criterio} existe en la unidad`)
  const celda = p.locator('tbody tr').first().locator('td.celda .celda-btn').nth(idx)
  await celda.click()
  const panel = p.getByRole('dialog', { name: /^Evaluar / })
  await panel.waitFor({ timeout: 8000 })
  await panel.locator(`button.cal-${nota}`).click()
  await panel.getByText(new RegExp(`${nota} guardado en`)).waitFor({ timeout: 5000 })
  await p.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(900)
  return (await celda.textContent()).trim()
}

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

  // Dos unidades del mismo trimestre que compartan un criterio con instrumento.
  const unidades = await programacion()
  let par = null
  for (const a of unidades) {
    for (const b of unidades) {
      if (b.pestana <= a.pestana || a.trimestre !== b.trimestre) continue
      const comun = a.criterios.find(c => b.criterios.includes(c))
      if (comun && !par) par = { a, b, criterio: comun }
    }
  }
  ok(!!par, 'hay dos unidades del mismo trimestre con un criterio común', par ? `${par.a.nombre} y ${par.b.nombre} · ${par.criterio} · T${par.a.trimestre}` : unidades.map(u => `${u.nombre}:T${u.trimestre}:${u.criterios.length}`).join(' | '))
  const { a: udA, b: udB, criterio, } = par
  const T = udA.trimestre

  console.log(`\n2. El mismo criterio (${criterio}) en dos unidades del ${T}º trimestre: 8 y 6`)
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('[data-presentacion-entendido]').click({ timeout: 5000 }).catch(() => {})
  await p.locator('[data-vista="criterios"]').click()
  // El selector de la barra en el trimestre de las unidades, para calificar en él.
  await p.getByLabel('Trimestre').selectOption(String(T))
  await p.locator('.tab-unidad').nth(udA.pestana).click()
  await p.waitForTimeout(1200)
  const enA = await calificar(criterio, 8)
  await p.locator('.tab-unidad').nth(udB.pestana).click()
  await p.waitForTimeout(1200)
  const enB = await calificar(criterio, 6)
  ok(enB.startsWith('6'), `en ${udB.nombre} la casilla vale 6`, enB)
  await p.locator('.tab-unidad').nth(udA.pestana).click()
  await p.waitForTimeout(1200)
  const idxA = await p.locator('th.criterio-th .criterio-th-id').evaluateAll((els, id) => els.findIndex(x => x.textContent.trim() === id), criterio)
  const otraVezA = (await p.locator('tbody tr').first().locator('td.celda .celda-btn').nth(idxA).textContent()).trim()
  ok(enA.startsWith('8') && otraVezA.startsWith('8'), `y en ${udA.nombre} sigue valiendo 8: las unidades son estancas`, `${enA} / ${otraVezA}`)

  console.log('\n3. «Todo el curso» por criterio: 1T · 2T · 3T · Final, con la media de las unidades')
  await p.locator('.tab-unidad').nth(0).click()
  await p.locator('[data-resumen-curso]').waitFor({ timeout: 5000 })
  await p.locator('[data-matriz-resumen="criterios"]').waitFor({ timeout: 8000 })
  const banda = await p.locator('[data-resumen-curso]').textContent()
  ok(/tres trimestres/.test(banda) && /no manda aquí/.test(banda), 'la banda dice que se ven los tres trimestres y que el selector no manda', banda.trim().slice(0, 90))
  ok(await p.locator('[data-plegado]').count() >= 2 && await p.locator('[data-criterio-th]').count() === 0, 'arranca plegado por competencia', `${await p.locator('[data-plegado]').count()} plegadas`)
  const plegarTodas = p.locator('[data-plegar-todas]')
  ok(/Desplegar todas/.test(await plegarTodas.textContent()), 'y ofrece desplegar todas')
  const etiquetas = await p.locator('[data-plegado]').first().locator('.th-trimestres span').allTextContents()
  ok(etiquetas.join(' ') === '1T 2T 3T Final', 'cada columna lleva 1T · 2T · 3T · Final', etiquetas.join(' '))
  // La competencia del criterio, desplegada: sus criterios con las cuatro columnas.
  const ce = 'CE' + criterio.match(/(\d+)/)[1]
  await p.locator(`[data-competencia-th="${ce}"]`).click()
  await p.locator(`[data-criterio-th="${criterio}"]`).waitFor({ timeout: 5000 })
  const fila = p.locator('tbody tr').first()
  const celdaT = t => fila.locator(`[data-celda-resumen][data-criterio="${criterio}"][data-trimestre="${t}"]`)
  ok((await celdaT(T).textContent()).trim() === '7', `la casilla ${T}T es la media de las dos unidades: 7`, (await celdaT(T).textContent()).trim())
  const otros = [1, 2, 3].filter(t => t !== T)
  ok((await celdaT(otros[0]).textContent()).trim() === '·' && (await celdaT(otros[1]).textContent()).trim() === '·', 'los otros trimestres están vacíos')
  ok((await celdaT('final').textContent()).trim() === '7', 'la final, con un solo trimestre con nota, es 7')
  ok(await fila.locator('[data-celda-resumen][data-area][data-trimestre="final"]').count() === 1, 'y al final va la nota del área')
  ok(await p.locator('[data-celda-resumen]').evaluateAll(bs => bs.every(b => b.classList.contains('solo-lectura'))), 'todas las casillas son de solo lectura')
  await foto('resumen-01-criterios')

  console.log('\n4. La ficha nombra las dos unidades y explica el camino')
  await celdaT(T).click()
  const ficha = p.locator('[data-explicacion-nota]')
  await ficha.waitFor({ timeout: 5000 })
  ok(await p.getByRole('dialog', { name: /^Evaluar / }).count() === 0, 'pulsar la casilla no abre el panel de edición')
  await ficha.locator('[data-explicacion-fila]').first().waitFor({ timeout: 5000 })
  ok(await ficha.locator('[data-explicacion-fila]').count() === 2, 'lista las dos notas, una por unidad', `${await ficha.locator('[data-explicacion-fila]').count()}`)
  const textoFicha = await ficha.textContent()
  ok(textoFicha.includes(`anotada en ${udA.nombre}`) && textoFicha.includes(`anotada en ${udB.nombre}`), 'nombrando cada unidad')
  ok(/media de 2 unidades/.test(textoFicha), 'y dice que el instrumento vale la media de sus unidades')
  ok(await ficha.locator('[data-explicacion-regla]').count() === 1 && /media de sus unidades/.test(textoFicha) && /familia/.test(textoFicha), 'con la regla a la vista: unidades → instrumento → familia')
  ok((await ficha.locator('[data-explicacion-valor]').first().textContent()).trim() === '7', 'el valor del bloque es la media, 7')
  ok(await ficha.locator('[data-explicacion-trimestres]').count() === 1, 'enseña T1 · T2 · T3 y la final')
  ok(await ficha.locator('[data-explicacion-area]').count() === 1, 'y la nota del área')
  await foto('resumen-02-ficha')
  await p.keyboard.press('Escape')
  await ficha.waitFor({ state: 'hidden', timeout: 5000 })
  await celdaT('final').click()
  await ficha.waitFor({ timeout: 5000 })
  ok(/Final del curso/.test(await ficha.textContent()), 'la casilla Final abre la ficha de la nota final')
  ok(await ficha.locator('[data-explicacion-final]').count() === 1, 'que explica cómo se ponderan los trimestres')
  await p.keyboard.press('Escape')
  await ficha.waitFor({ state: 'hidden', timeout: 5000 })

  console.log('\n5. El selector de trimestre de la barra no manda en el resumen')
  const selectorTrimestre = p.getByLabel('Trimestre')
  await selectorTrimestre.selectOption(String(otros[0]))
  await p.waitForTimeout(1200)
  ok((await celdaT(T).textContent()).trim() === '7', `cambiar la barra al ${otros[0]}º trimestre no mueve la casilla ${T}T`)
  ok(await p.locator(`[data-criterio-th="${criterio}"]`).count() === 1, 'ni cambia las columnas')
  await selectorTrimestre.selectOption(String(T))
  await p.waitForTimeout(800)

  console.log('\n6. Por familia: una columna por familia y trimestre, con los hijos dentro')
  await p.locator('[data-vista="instrumentos"]').click()
  await p.locator('[data-matriz-resumen="instrumentos"]').waitFor({ timeout: 8000 })
  const familias = await p.locator('[data-familia-th]').evaluateAll(ths => ths.map(t => ({ nombre: t.dataset.nombre, colspan: t.getAttribute('colspan') })))
  ok(familias.length >= 1 && familias.every(f => f.colspan === '3'), 'cada familia abarca 1T · 2T · 3T', JSON.stringify(familias))
  ok(await p.locator('[data-instr-th] [data-sesion-abrir], [data-instr-th] [data-corregir-abrir], [data-instr-th] [data-renombrar-abrir], [data-instr-th] [data-pegar-abrir]').count() === 0,
    'las cabeceras no ofrecen calificar, corregir, renombrar ni pegar')
  const casillaFam = fila.locator(`[data-celda-resumen][data-instrumento][data-trimestre="${T}"]`).filter({ hasNotText: '·' }).first()
  const valorFam = (await casillaFam.locator('span').first().textContent()).trim()
  ok(valorFam === '7', `la familia que evalúa ${criterio} vale 7 en el ${T}T (su único criterio con nota)`, valorFam)
  ok(/1\/\d+/.test(await casillaFam.textContent()), 'y dice cuántos de sus criterios tienen nota')
  await casillaFam.click()
  await ficha.waitFor({ timeout: 5000 })
  await ficha.locator('[data-explicacion-fila]').first().waitFor({ timeout: 5000 })
  ok(await ficha.locator('[data-explicacion-fila]').count() === 2 && /anotada en/.test(await ficha.textContent()), 'su ficha también lista las dos unidades')
  await p.keyboard.press('Escape')
  await ficha.waitFor({ state: 'hidden', timeout: 5000 })
  await foto('resumen-03-familias')

  console.log('\n7. En un iPad (1024 px) la página no desborda')
  await p.setViewportSize({ width: 1024, height: 768 })
  await p.waitForTimeout(600)
  const anchoPagina = await p.evaluate(() => document.documentElement.scrollWidth)
  ok(anchoPagina <= 1024, 'por familia, sin desplazamiento horizontal de página', `${anchoPagina}px`)
  await p.screenshot({ path: `${TIROS}/resumen-04-ipad-familias.png` })
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('[data-matriz-resumen="criterios"]').waitFor({ timeout: 8000 })
  // El botón alterna entre todo plegado y todo desplegado; con una competencia
  // a medias, primero pliega. Se lleva a todo desplegado (lo que más ocupa).
  if (/Plegar/.test(await plegarTodas.textContent())) { await plegarTodas.click(); await p.waitForTimeout(400) }
  await plegarTodas.click()
  await p.waitForTimeout(600)
  ok(await p.locator('[data-plegado]').count() === 0, 'con «Desplegar todas» no queda ninguna competencia plegada')
  ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= 1024, 'por criterio, con todo desplegado, la matriz rueda por dentro y la página no', `${await p.evaluate(() => document.documentElement.scrollWidth)}px`)
  await plegarTodas.click()
  await p.waitForTimeout(600)
  ok(await p.locator('[data-criterio-th]').count() === 0, 'con «Plegar todas» no queda ningún criterio suelto')
  const anchoMatriz = await p.locator('[data-matriz-resumen="criterios"]').evaluate(t => t.scrollWidth)
  const anchoMarco = await p.locator('.matriz-wrap').evaluate(w => w.clientWidth)
  ok(anchoMatriz <= anchoMarco + 400, 'plegado por competencia, la matriz cabe o casi en el iPad', `matriz ${anchoMatriz}px · marco ${anchoMarco}px`)
  await p.screenshot({ path: `${TIROS}/resumen-05-ipad-criterios.png` })

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('resumen-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
