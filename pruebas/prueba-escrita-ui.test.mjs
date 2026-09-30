/**
 * Prueba escrita con preguntas, de punta a punta.
 *
 * Sobre la programación del PDF gemelo de PROENS —donde «Proba escrita» es un
 * solo instrumento que evalúa varios criterios de la unidad—: se define el
 * examen importando un fichero, se corrige a un alumno pregunta a pregunta y
 * se mira en IndexedDB que cada criterio recibe la nota de SUS preguntas.
 * Después se cambia a test con penalización y nota única, y se comprueba que
 * la misma nota va a todos los criterios del instrumento en la unidad.
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
const ctx = await navegador.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
p.on('dialog', d => d.accept())
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })

/** Lo que hay en la base de datos, leído desde la página. */
const bd = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const [alumnos, cals, unidades, cis, instrumentos, rubricas] = await Promise.all(
    ['alumnos', 'calificaciones', 'unidades', 'criterio_instrumentos', 'instrumentos', 'rubricas'].map(leer))
  alumnos.sort((a, b) => a.apellidos.localeCompare(b.apellidos))
  unidades.sort((a, b) => a.orden - b.orden)
  const prueba = instrumentos.find(i => i.tipo === 'prueba-escrita')
  // La unidad donde la prueba escrita evalúa más criterios: hacen falta tres
  // para ver el reparto y, además, un criterio que el examen no nombra.
  const criteriosDe = (u) => cis.filter(c => c.unidad_id === u.id && c.instrumento_id === prueba?.id).map(c => c.criterio_id).sort()
  const ud1 = [...unidades].sort((a, b) => criteriosDe(b).length - criteriosDe(a).length)[0]
  return {
    instrumento: prueba?.nombre,
    /** Posición de esa unidad entre las pestañas (la 0 es «Todo el curso»). */
    pestana: unidades.indexOf(ud1) + 1,
    /** Criterios que la prueba escrita evalúa en ella. */
    criterios: criteriosDe(ud1),
    /** Por alumno: criterio → { valor, nº de respuestas guardadas }. */
    notas: alumnos.map(a => Object.fromEntries(cals
      .filter(c => c.alumno_id === a.id && c.instrumento_id === prueba?.id)
      .map(c => [c.criterio_id, { valor: c.valor, anterior: c.valor_anterior ?? null, respuestas: Object.keys(c.niveles_rubrica || {}).length }]))),
    examenes: rubricas.filter(r => r.tipo === 'prueba').map(r => ({ titulo: r.titulo, unidad_id: r.unidad_id, def: JSON.parse(r.prueba_json) })),
    rubricas: rubricas.filter(r => r.tipo !== 'prueba').length,
    ud1: ud1.id,
  }
})

const panel = p.getByRole('dialog', { name: /^Evaluar / })
const editor = p.getByRole('dialog', { name: /^Examen de / })
const examen = panel.locator('[data-corregir-prueba]')
const aparece = (loc) => loc.waitFor({ timeout: 6000 }).then(() => true, () => false)

/** Abre la casilla de un alumno (por fila) en la columna de un criterio. */
const abrirCelda = async (fila, criterio) => {
  const ids = await p.locator('th.criterio-th:not(.fantasma) .criterio-th-id').allTextContents()
  const col = ids.findIndex(t => t.trim() === criterio)
  if (col < 0) throw new Error(`No hay columna para ${criterio}: ${ids.join(', ')}`)
  await p.locator('table.matriz tbody tr').nth(fila).locator('td.celda:not(.fantasma)').nth(col).locator('button').click()
  await panel.waitFor({ timeout: 8000 })
  const chip = panel.getByRole('button', { name: /Proba escrita/ })
  if (await chip.count()) await chip.first().click()
  await p.waitForTimeout(300)
}
const cerrarPanel = async () => { await panel.getByRole('button', { name: 'Cerrar' }).click(); await p.waitForTimeout(300) }

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
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)

  const inicio = await bd()
  const [cA, cB, cC] = inicio.criterios
  await p.locator('.tab-unidad').nth(inicio.pestana).click()
  await p.waitForTimeout(1200)
  ok(inicio.criterios.length >= 3, 'la prueba escrita evalúa varios criterios en la unidad', inicio.criterios.join(', '))

  console.log('\n2. Definir el examen importando un fichero')
  await abrirCelda(0, cA)
  ok(await aparece(panel.getByText(/¿Corriges por preguntas\?/)), 'sin examen, el panel invita a definirlo')
  await panel.getByRole('button', { name: /Definir examen/ }).click()
  await editor.waitFor({ timeout: 8000 })
  await aparece(editor.getByLabel('Título del examen'))   // el editor carga antes de pintar
  ok(await editor.getByLabel(/Esta unidad/).isChecked(), 'desde una unidad, el examen nace para esa unidad')
  await editor.getByRole('button', { name: /Cómo importar/ }).click()
  ok(await editor.getByText(/una tabla con una fila por pregunta/).isVisible(), 'la ayuda explica la forma del fichero')
  const md = `# Examen de la unidad 1\n\n| Pregunta | Puntos | Criterio |\n|---|---|---|\n`
    + `| Uno | 2 | ${cA} |\n| Dos | 3 | ${cA} |\n| Tres | 3 | ${cB} |\n| Cuatro | 2 | |\n| Cinco | 1 | CE9.9 |\n`
  await editor.locator('input[data-uso="examen"]').setInputFiles({ name: 'examen.md', mimeType: 'text/markdown', buffer: Buffer.from(md) })
  ok(await aparece(editor.getByText(/«Examen de la unidad 1» importado: 5 preguntas, 11 puntos/)), 'importa 5 preguntas y 11 puntos')
  ok(await editor.getByLabel('Tipo de examen').count() === 0 && await editor.getByRole('radio', { name: /Puntos por pregunta/ }).isChecked(), 'tipo: puntos por pregunta')
  ok(await editor.getByRole('radio', { name: /Se reparte por criterios/ }).isChecked(), 'con criterios en el fichero, el reparto es por criterios')
  ok(await aparece(editor.getByText(/CE9\.9 no está asignado/)), 'avisa del criterio que la programación no da a este instrumento')
  await foto('prueba-01-editor')
  await editor.getByRole('button', { name: 'Eliminar la pregunta 5' }).click()
  ok(await aparece(editor.getByText(/4 preguntas · suman 10 puntos/)), 'al quitar la pregunta, el examen suma 10')
  await editor.getByRole('button', { name: /Guardar examen/ }).click()
  ok(await aparece(editor.getByText('✅ Guardado en este dispositivo')), 'se guarda')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  let d = await bd()
  ok(d.examenes.length === 1 && d.examenes[0].unidad_id === d.ud1 && d.examenes[0].def.preguntas.length === 4,
    'queda un examen, de la unidad, con 4 preguntas', JSON.stringify(d.examenes.map(e => [e.titulo, e.unidad_id])))
  ok(d.rubricas === 0, 'y no cuenta como rúbrica')

  console.log('\n3. Corregir pregunta a pregunta')
  await examen.waitFor({ timeout: 6000 })
  ok(await examen.locator('[data-pregunta]').count() === 4, 'el panel enseña las 4 preguntas en lugar del 0–10')
  ok(await panel.locator('button.cal-8').count() === 0, 'sin los botones de nota a mano')
  const casilla = n => examen.locator(`[data-pregunta="${n}"] input`)
  await casilla(1).fill('2')
  await casilla(1).press('Tab')
  await aparece(panel.getByText(/^✅ Examen: /))
  await casilla(2).fill('1,5')
  await casilla(2).press('Enter')
  await p.waitForTimeout(500)
  await examen.locator('[data-pregunta="3"]').getByRole('button', { name: /todos los puntos/ }).click()
  await p.waitForTimeout(500)
  await examen.locator('[data-pregunta="4"]').getByRole('button', { name: /cero puntos/ }).click()
  ok(await aparece(examen.getByText('4 de 4 anotadas · 6,5 / 10 puntos')), 'el resumen suma 6,5 de 10')
  await foto('prueba-02-corregir')
  await p.waitForTimeout(400)
  d = await bd()
  // cA: (2 + 1,5 + 0) de 7 → 5 · cB: (3 + 0) de 5 → 6
  ok(d.notas[0][cA]?.valor === 5, `${cA} recibe la nota de sus preguntas más la común: 5`, JSON.stringify(d.notas[0][cA]))
  ok(d.notas[0][cB]?.valor === 6, `${cB}, la de la suya: 6`, JSON.stringify(d.notas[0][cB]))
  ok(Object.keys(d.notas[0]).length === 2, 'y ningún otro criterio recibe nota', Object.keys(d.notas[0]).join(', '))
  ok(d.notas[0][cA].respuestas === 4 && d.notas[0][cB].respuestas === 4, 'las respuestas quedan guardadas en los dos')
  ok(Object.keys(d.notas[1]).length === 0, 'el otro alumno no se toca')
  await cerrarPanel()

  console.log('\n4. Reabrir desde otro criterio')
  await abrirCelda(0, cB)
  ok(await aparece(examen.getByText('4 de 4 anotadas · 6,5 / 10 puntos')), `desde ${cB} el examen sale corregido`)
  await casilla(3).fill('1.5')
  await casilla(3).press('Tab')
  await p.waitForTimeout(600)
  d = await bd()
  ok(d.notas[0][cB]?.valor === 3 && d.notas[0][cA]?.valor === 5, `corregir la pregunta de ${cB} cambia solo su nota`, JSON.stringify(d.notas[0]))
  await cerrarPanel()
  await abrirCelda(0, cC)
  ok(await aparece(panel.getByText(new RegExp(`no tiene ninguna pregunta de ${cC.replace('.', '\\.')}`))), `${cC} no está en el examen: lo dice`)
  ok(await aparece(examen.getByText(/4 de 4 anotadas/)), 'y aun así enseña el examen ya corregido, no uno en blanco')
  await cerrarPanel()

  console.log('\n5. «Todo el curso» no adivina de qué unidad es el examen')
  await p.locator('.tab-unidad').first().click()
  await p.waitForTimeout(1200)
  await abrirCelda(0, cA)
  ok(await aparece(panel.getByText(/están definidos por unidad/)), 'avisa de que hay que entrar en la unidad')
  ok(await examen.count() === 0, 'y deja la nota a mano')
  await cerrarPanel()
  await p.locator('.tab-unidad').nth(inicio.pestana).click()
  await p.waitForTimeout(1200)

  console.log('\n6. Cambiar a test con penalización y nota única')
  await abrirCelda(1, cA)
  await panel.getByRole('button', { name: '📝 Examen' }).click()
  await editor.waitFor({ timeout: 8000 })
  ok(await aparece(editor.locator('input[value="Examen de la unidad 1"]')), 'el editor abre el examen guardado')
  await editor.getByRole('radio', { name: /^Test/ }).check()
  await editor.getByLabel('Cada fallo').selectOption({ label: 'Resta 1/4 de la pregunta' })
  await editor.getByRole('radio', { name: /Es una sola/ }).check()
  const [descarga] = await Promise.all([p.waitForEvent('download'), editor.getByRole('button', { name: '⬇ .xlsx' }).click()])
  ok(descarga.suggestedFilename() === 'examen-examen-de-la-unidad-1.xlsx', 'el examen se descarga como hoja de cálculo', descarga.suggestedFilename())
  await editor.getByRole('button', { name: /Guardar examen/ }).click()
  // El examen ya estaba corregido para Ana: pregunta si recalcular (se acepta).
  ok(await aparece(editor.getByText(/Notas recalculadas para 1 alumno/)), 'al cambiar un examen ya corregido ofrece recalcular, y lo hace')
  d = await bd()
  // Lo anotado a Ana (2 · 1,5 · 1,5 · 0) leído como test: tres aciertos y una en blanco → 8 de 10.
  ok(inicio.criterios.every(c => d.notas[0][c]?.valor === 8) && Object.keys(d.notas[0]).length === inicio.criterios.length,
    'sus notas pasan a ser las del examen nuevo, en todos los criterios', JSON.stringify(d.notas[0]))
  ok(d.notas[0][cA].respuestas === 4, 'sin tocar lo anotado en cada pregunta')
  ok(d.notas[0][cA].anterior === 5 && d.notas[0][cB].anterior === 3,
    'y las notas que había (5 y 3) no se pierden: quedan como nota anterior', JSON.stringify(d.notas[0]))
  ok(await aparece(editor.getByText(/2 notas anteriores quedan a la vista/)), 'el editor lo dice')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await examen.waitFor({ timeout: 6000 })
  for (const n of [1, 2, 3]) {
    await examen.locator(`[data-pregunta="${n}"]`).getByRole('button', { name: /acierto/ }).click()
    await p.waitForTimeout(450)
  }
  await examen.locator('[data-pregunta="4"]').getByRole('button', { name: /fallo/ }).click()
  // Aciertos: 2 + 3 + 3 = 8 · fallo: −0,25 × 2 = −0,5 → 7,5 de 10
  ok(await aparece(examen.getByText('4 de 4 anotadas · 7,5 / 10 puntos')), 'tres aciertos y un fallo que resta: 7,5')
  await p.waitForTimeout(500)
  d = await bd()
  ok(inicio.criterios.every(c => d.notas[1][c]?.valor === 7.5) && Object.keys(d.notas[1]).length === inicio.criterios.length,
    'nota única: el 7,5 va a todos los criterios de la prueba en la unidad', JSON.stringify(d.notas[1]))
  ok(d.notas[0][cA]?.valor === 8, 'y la del otro alumno sigue siendo la recalculada')
  ok(await p.locator('[data-hermanos]').count() === 0, 'con examen no se ofrece copiar ni vincular: el reparto lo decide el examen')
  await foto('prueba-03-test')

  console.log('\n7. De nota única a por criterios: el criterio que el examen ya no nombra')
  await panel.getByRole('button', { name: '📝 Examen' }).click()
  await editor.waitFor({ timeout: 8000 })
  await aparece(editor.getByLabel('Título del examen'))
  await editor.getByRole('radio', { name: /Se reparte por criterios/ }).check()
  await editor.getByRole('button', { name: /Guardar examen/ }).click()
  ok(await aparece(editor.getByText(/Notas recalculadas para 2 alumnos/)), 'recalcula a los dos alumnos')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await cerrarPanel()
  d = await bd()
  // Ninguna pregunta nombra cC: deja de recibir nota, pero la que tenía sigue ahí.
  ok(d.notas[0][cC]?.valor == null && d.notas[0][cC]?.anterior === 8,
    `${cC} de Ana se queda sin nota que cuente, con su 8 como nota anterior`, JSON.stringify(d.notas[0][cC]))
  ok(d.notas[1][cC]?.valor == null && d.notas[1][cC]?.anterior === 7.5,
    `y el de Bruno, con su 7,5`, JSON.stringify(d.notas[1][cC]))
  ok(d.notas[1][cA]?.valor === 6.43 && d.notas[1][cA]?.anterior === 7.5,
    `${cA} de Bruno pasa a la nota de sus preguntas (6,43) y guarda la anterior (7,5)`, JSON.stringify(d.notas[1][cA]))
  const cabeceras = await p.locator('th.criterio-th.fantasma .criterio-th-id').allTextContents()
  ok(cabeceras.map(t => t.trim()).includes(cC) && cabeceras.length === inicio.criterios.length,
    'en la matriz, cada criterio con nota anterior duplica su columna, semitranslúcida', cabeceras.join(', '))
  ok(await p.locator('td.celda.fantasma button').first().evaluate(e => getComputedStyle(e).opacity) === '0.4', 'con la nota anterior atenuada')
  await foto('prueba-04-fantasma')

  await abrirCelda(0, cC)
  const caja = panel.locator('[data-fantasma]')
  ok(await aparece(caja.getByText(/Nota anterior: no cuenta/)), 'el panel enseña la nota anterior y dice que no cuenta')
  await caja.getByRole('button', { name: 'Recuperar' }).click()
  ok(await aparece(panel.getByText(new RegExp(`8 recuperado como nota de ${cC.replace('.', '\\.')}`))), 'se puede recuperar')
  await p.waitForTimeout(400)
  d = await bd()
  ok(d.notas[0][cC]?.valor === 8 && d.notas[0][cC]?.anterior == null, 'vuelve a ser la nota que cuenta, sin fantasma', JSON.stringify(d.notas[0][cC]))
  await cerrarPanel()
  await abrirCelda(1, cA)
  await caja.getByRole('button', { name: 'Descartar' }).click()
  await p.waitForTimeout(500)
  d = await bd()
  ok(d.notas[1][cA]?.valor === 6.43 && d.notas[1][cA]?.anterior == null, 'descartar quita la anterior y deja la que cuenta', JSON.stringify(d.notas[1][cA]))

  console.log('\n8. Quitar el examen conserva las notas')
  await panel.getByRole('button', { name: '📝 Examen' }).click()
  await editor.waitFor({ timeout: 8000 })
  await editor.getByRole('button', { name: 'Eliminar examen' }).click()
  await aparece(editor.getByText(/Examen eliminado/))
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  ok(await aparece(panel.locator('button.cal-8')), 'el panel vuelve a la nota a mano')
  d = await bd()
  ok(d.examenes.length === 0 && d.notas[1][cA]?.valor === 6.43, 'sin examen, y la nota sigue ahí')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('prueba-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
