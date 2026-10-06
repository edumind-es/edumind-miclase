/**
 * Calificador por instrumento, de punta a punta: el conmutador de vista, una
 * columna por instrumento con los criterios que cubre, la pasada «Evaluar
 * hoy» que escribe en el diario sin pisar nada (y que corrige el botón
 * equivocado sin dejar dos registros), la casilla con la media y el panel
 * centrado en el instrumento con sus criterios como fichas.
 *
 * Misma clase de partida que el diario: la programación gemela de PROENS,
 * con «Proba escrita» y «Táboa de indicadores» cubriendo varios criterios.
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

/** Estado vivo en IndexedDB del primer alumno (por apellidos): notas y registros del diario. */
const estado = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const alumnos = (await leer('alumnos')).sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  const a = alumnos[0]
  const cals = (await leer('calificaciones')).filter(c => c.alumno_id === a.id && c.valor != null)
  const diario = (await leer('diario')).filter(r => r.alumno_id === a.id)
  return {
    notas: Object.fromEntries(cals.map(c => [c.criterio_id, { valor: c.valor, origen: c.origen ?? null }])),
    registros: diario.map(r => ({ valor: r.valor, criterios: JSON.parse(r.criterios_json), observacion: r.observacion ?? null })),
  }
})

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

  console.log('\n2. Vista por instrumento en la primera unidad')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  // Por defecto ya abre por instrumento; esta suite compara las dos vistas,
  // así que empieza por la de criterios y cierra la tarjeta de bienvenida.
  await p.locator('[data-presentacion-entendido]').click({ timeout: 5000 }).catch(() => {})
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  const nCriterios = await p.locator('th.criterio-th').count()
  ok(nCriterios >= 3, 'por criterio hay una columna por criterio de la unidad', `${nCriterios} columnas`)
  await p.locator('[data-vista="instrumentos"]').click()
  await p.locator('[data-instr-th]').first().waitFor({ timeout: 5000 })
  const columnas = p.locator('[data-instr-th]')
  const nInstr = await columnas.count()
  ok(nInstr >= 1 && nInstr < nCriterios, 'por instrumento hay menos columnas: una por instrumento', `${nInstr} instrumentos`)
  ok(await p.locator('th.criterio-th').count() === 0, 'y las de criterio ya no están')
  const textoCabecera = await columnas.first().textContent()
  ok(/\d+ criterios?: /.test(textoCabecera), 'cada cabecera dice qué criterios cubre', textoCabecera.trim().slice(0, 80))
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  ok(await p.locator('[data-instr-th]').count() >= 1, 'la vista elegida se recuerda al recargar')
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  await foto('instrumentos-01-matriz')

  console.log('\n3. «Evaluar hoy» con un instrumento que no es examen')
  const colDiario = p.locator('[data-instr-th]:not([data-tipo="prueba-escrita"])').first()
  const nombreInstr = await colDiario.getAttribute('data-nombre')
  const idsCabecera = (await colDiario.locator('.instr-th-criterios').textContent()).split(':')[1].split('·').map(s => s.trim()).filter(Boolean)
  ok(idsCabecera.length >= 1, `«${nombreInstr}» cubre ${idsCabecera.length} criterio(s)`, idsCabecera.join(', '))
  await colDiario.locator('[data-sesion-abrir]').click()
  const sesion = p.getByRole('dialog', { name: /^Evaluar hoy: / })
  await sesion.waitFor({ timeout: 5000 })
  const filas = sesion.locator('[data-sesion-fila]')
  ok(await filas.count() === 3, 'una fila por alumno')
  ok((await sesion.locator('[data-sesion-resumen]').textContent()).startsWith('0 de 3'), 'nadie evaluado todavía')

  await filas.first().locator('button.nivel-3').click()
  await filas.first().locator('[data-sesion-nota]').getByText('7.5').waitFor({ timeout: 5000 })
  let e = await estado()
  ok(e.registros.length === 1 && e.registros[0].valor === 3, 'un registro de nivel 3 en el diario del primer alumno')
  ok(JSON.stringify([...e.registros[0].criterios].sort()) === JSON.stringify([...idsCabecera].sort()),
    'reparte exactamente a los criterios que anuncia la cabecera', e.registros[0].criterios.join(', '))
  ok(idsCabecera.every(c => e.notas[c]?.valor === 7.5 && e.notas[c]?.origen === 'diario'), 'todos con 7,5 derivado del diario', JSON.stringify(e.notas))
  ok((await sesion.locator('[data-sesion-resumen]').textContent()).startsWith('1 de 3'), 'el resumen cuenta uno')

  console.log('\n4. Botón equivocado: cambiar de nivel no duplica, repetirlo lo quita')
  await filas.first().locator('button.nivel-4').click()
  await filas.first().locator('[data-sesion-nota]').getByText('10').waitFor({ timeout: 5000 })
  e = await estado()
  ok(e.registros.length === 1 && e.registros[0].valor === 4, 'sigue habiendo un solo registro, ahora de nivel 4', JSON.stringify(e.registros))
  await filas.first().locator('button.nivel-4').click()
  await filas.first().locator('[data-sesion-nota]').getByText('Sin registros').waitFor({ timeout: 5000 })
  e = await estado()
  ok(e.registros.length === 0 && Object.keys(e.notas).length === 0, 'repetir el nivel quita el registro y la nota derivada')
  await filas.first().locator('button.nivel-2').click()
  await filas.first().locator('[data-sesion-nota]').getByText('5').waitFor({ timeout: 5000 })
  await filas.nth(1).locator('button.nivel-4').click()
  await filas.nth(1).locator('[data-sesion-nota]').getByText('10').waitFor({ timeout: 5000 })
  await foto('instrumentos-02-sesion')
  await sesion.getByRole('button', { name: 'Hecho' }).click()
  await sesion.waitFor({ state: 'hidden', timeout: 5000 })

  console.log('\n5. La casilla enseña la media con el instrumento y abre el panel centrado en él')
  await p.waitForTimeout(800)
  const idx = await p.locator('[data-instr-th]').evaluateAll((ths, nombre) => ths.findIndex(t => t.textContent.includes(nombre)), nombreInstr)
  const celda = p.locator('tbody tr').first().locator('[data-celda-instr]').nth(idx)
  ok((await celda.textContent()).startsWith('5'), 'la casilla del primer alumno vale 5 (nivel 2)', await celda.textContent())
  ok(await celda.locator('.celda-diario').count() === 1, 'y enseña la mini-tendencia del diario')
  await celda.click()
  const panel = p.getByRole('dialog', { name: /^Evaluar / })
  await panel.waitFor({ timeout: 8000 })
  await panel.locator('[data-enfoque-instrumento]').waitFor({ timeout: 5000 })
  ok(await panel.getByText(`INSTRUMENTO · ${nombreInstr}`).count() === 1, 'el panel se centra en el instrumento')
  const chips = panel.locator('[data-criterio-chip]')
  ok(await chips.count() === idsCabecera.length, 'con una ficha por criterio que cubre', `${await chips.count()}`)
  if (idsCabecera.length > 1) {
    const segundo = await chips.nth(1).textContent()
    await chips.nth(1).click()
    await panel.locator(`[data-criterio-chip][aria-pressed="true"]`).filter({ hasText: segundo }).waitFor({ timeout: 5000 })
    ok(true, `pulsar una ficha cambia al criterio ${segundo} sin cerrar el panel`)
  }
  ok(await panel.locator('[data-diario]').count() === 1, 'y el diario está a mano')
  await foto('instrumentos-03-panel')
  await p.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden', timeout: 5000 })

  console.log('\n6. La columna del examen ofrece corregir alumno a alumno')
  const colExamen = p.locator('[data-instr-th][data-tipo="prueba-escrita"]').first()
  if (await colExamen.count()) {
    await colExamen.locator('[data-corregir-abrir]').click()
    await panel.waitFor({ timeout: 8000 })
    ok(await panel.getByText(/Abad Ríos, Ana/).count() === 1, 'se abre por el primer alumno')
    ok(await panel.getByRole('button', { name: /Definir examen|Examen/ }).count() >= 1, 'con el examen al alcance')
    await p.keyboard.press('Escape')
    await panel.waitFor({ state: 'hidden', timeout: 5000 })
  } else {
    ok(true, '(sin examen en esta unidad: nada que comprobar)')
  }

  console.log('\n7. Volver a la vista por criterio: las notas del diario están ahí')
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('th.criterio-th').first().waitFor({ timeout: 5000 })
  ok(await p.locator('.celda-btn.cal-5').count() >= idsCabecera.length, 'las casillas de los criterios cubiertos valen 5', `${await p.locator('.celda-btn.cal-5').count()}`)

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('instrumentos-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
