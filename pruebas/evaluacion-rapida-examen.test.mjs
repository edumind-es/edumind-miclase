/**
 * Evaluación rápida (el camino del QR): vínculos y examen por preguntas.
 *
 * El calificador y la evaluación rápida son dos puertas a las mismas notas.
 * Un vínculo o un examen definidos en una tienen que valer igual en la otra:
 * si no, la misma casilla daría notas distintas según por dónde se entre.
 *
 * Se prepara en el calificador (vínculo entre dos criterios, examen de la
 * unidad) y se califica entrando por el código del alumno, como tras escanear
 * su QR. Lo que se comprueba es lo guardado en IndexedDB.
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
const aparece = (loc) => loc.waitFor({ timeout: 6000 }).then(() => true, () => false)

const bd = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const [alumnos, cals, unidades, cis, instrumentos] = await Promise.all(
    ['alumnos', 'calificaciones', 'unidades', 'criterio_instrumentos', 'instrumentos'].map(leer))
  alumnos.sort((a, b) => a.apellidos.localeCompare(b.apellidos))
  unidades.sort((a, b) => a.orden - b.orden)
  const ud = unidades[0]
  const deTipo = (tipo) => instrumentos.find(i => i.tipo === tipo)
  const criteriosDe = (ins) => cis.filter(c => c.unidad_id === ud.id && c.instrumento_id === ins?.id).map(c => c.criterio_id).sort()
  const notasDe = (ins) => alumnos.map(a => Object.fromEntries(cals
    .filter(c => c.alumno_id === a.id && c.instrumento_id === ins?.id && c.valor != null)
    .map(c => [c.criterio_id, c.valor])))
  const examen = deTipo('prueba-escrita'), tabla = deTipo('observacion')
  return {
    unidad: ud.nombre,
    codigos: alumnos.map(a => a.codigo_cifrado),
    examen: { nombre: examen?.nombre, criterios: criteriosDe(examen), notas: notasDe(examen) },
    tabla: { nombre: tabla?.nombre, criterios: criteriosDe(tabla), notas: notasDe(tabla) },
  }
})

const panel = p.getByRole('dialog', { name: /^Evaluar / })
const abrirCelda = async (fila, criterio, instrumento) => {
  const ids = await p.locator('.criterio-th-id').allTextContents()
  const col = ids.findIndex(t => t.trim() === criterio)
  await p.locator('table.matriz tbody tr').nth(fila).locator('td.celda').nth(col).locator('button').click()
  await panel.waitFor({ timeout: 8000 })
  const chip = panel.getByRole('button', { name: new RegExp(instrumento) })
  if (await chip.count()) await chip.first().click()
  await p.waitForTimeout(300)
}

try {
  console.log('\n1. Preparar en el calificador: un vínculo y un examen')
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
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)

  const ini = await bd()
  const [t1, t2, t3] = ini.tabla.criterios
  const [e1, e2] = ini.examen.criterios
  ok(ini.tabla.criterios.length >= 3 && ini.examen.criterios.length >= 2 && ini.codigos.every(Boolean),
    'la unidad tiene un instrumento para varios criterios, una prueba escrita y alumnos con código',
    `${ini.tabla.nombre}: ${ini.tabla.criterios.join(', ')} · ${ini.examen.nombre}: ${ini.examen.criterios.join(', ')}`)

  // Vínculo t1 ↔ t2 (t3 se queda fuera)
  await abrirCelda(0, t1, ini.tabla.nombre)
  const caja = panel.locator('[data-hermanos]')
  await caja.getByRole('button', { name: /Vincular…/ }).click()
  const casillas = caja.locator('input[type="checkbox"]')
  for (let i = 1; i < await casillas.count(); i++) await casillas.nth(i).uncheck()
  await caja.getByRole('button', { name: '🔗 Vincular', exact: true }).click()
  ok(await aparece(caja.getByText(new RegExp(`Vinculado con ${t2.replace('.', '\\.')}`))), `${t1} queda vinculado con ${t2}`)
  await panel.getByRole('button', { name: 'Cerrar' }).click()

  // Examen de la unidad: dos preguntas de e1, una de e2
  await abrirCelda(0, e1, ini.examen.nombre)
  await panel.getByRole('button', { name: /Definir examen/ }).click()
  const editor = p.getByRole('dialog', { name: /^Examen de / })
  await aparece(editor.getByLabel('Título del examen'))
  const md = `# Examen rápido\n\n| Pregunta | Puntos | Criterio |\n|---|---|---|\n| Uno | 4 | ${e1} |\n| Dos | 2 | ${e1} |\n| Tres | 4 | ${e2} |\n`
  await editor.locator('input[data-uso="examen"]').setInputFiles({ name: 'examen.md', mimeType: 'text/markdown', buffer: Buffer.from(md) })
  await aparece(editor.getByText(/importado: 3 preguntas, 10 puntos/))
  await editor.getByRole('button', { name: /Guardar examen/ }).click()
  ok(await aparece(editor.getByText('✅ Guardado en este dispositivo')), 'examen de la unidad guardado')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await panel.getByRole('button', { name: 'Cerrar' }).click()

  console.log('\n2. Entrar por el código del alumno, como tras escanear su QR')
  await p.getByRole('link', { name: /Evaluar QR/ }).click()
  await p.getByPlaceholder('M7KP2').fill(ini.codigos[1])
  await p.getByRole('button', { name: 'Abrir', exact: true }).click()
  ok(await aparece(p.getByText('Bello Souto, Bruno')), 'se abre la evaluación rápida del alumno')
  const rapida = p.locator('.card').filter({ hasText: 'Bello Souto, Bruno' })
  await rapida.locator('select').filter({ hasText: 'Todos los criterios' }).selectOption({ label: ini.unidad })
  await p.waitForTimeout(800)

  console.log('\n3. El vínculo vale también aquí')
  await rapida.getByRole('button', { name: t1, exact: true }).click()
  await p.waitForTimeout(400)
  await rapida.getByRole('button', { name: new RegExp(ini.tabla.nombre) }).click()
  await p.waitForTimeout(400)
  await rapida.locator('button.cal-7').click()
  ok(await aparece(rapida.getByText(/7 guardado en .+ y en 1 criterio vinculado/)), 'al guardar avisa de la nota vinculada')
  let d = await bd()
  ok(d.tabla.notas[1][t1] === 7 && d.tabla.notas[1][t2] === 7 && Object.keys(d.tabla.notas[1]).length === 2,
    `la nota va a ${t1} y a ${t2}, y a ninguno más (${t3} no estaba vinculado)`, JSON.stringify(d.tabla.notas[1]))

  console.log('\n4. El examen se corrige por preguntas también aquí')
  await rapida.getByRole('button', { name: e1, exact: true }).click()
  await p.waitForTimeout(400)
  const chip = rapida.getByRole('button', { name: new RegExp(ini.examen.nombre) })
  if (await chip.count()) await chip.first().click()
  const examen = rapida.locator('[data-corregir-prueba]')
  ok(await aparece(examen), 'salen las preguntas del examen')
  ok(await rapida.locator('button.cal-7').count() === 0, 'en lugar del teclado 0–10')
  await examen.locator('[data-pregunta="1"] input').fill('3')
  await examen.locator('[data-pregunta="1"] input').press('Tab')
  await p.waitForTimeout(500)
  await examen.locator('[data-pregunta="2"]').getByRole('button', { name: /todos los puntos/ }).click()
  await p.waitForTimeout(500)
  await examen.locator('[data-pregunta="3"] input').fill('1')
  await examen.locator('[data-pregunta="3"] input').press('Enter')
  ok(await aparece(examen.getByText('3 de 3 anotadas · 6 / 10 puntos')), 'el resumen suma 6 de 10')
  await foto('rapida-examen')
  await p.waitForTimeout(500)
  d = await bd()
  // e1: (3 + 2) de 6 → 8,33 · e2: 1 de 4 → 2,5
  ok(d.examen.notas[1][e1] === 8.33 && d.examen.notas[1][e2] === 2.5,
    'cada criterio recibe la nota de sus preguntas, igual que en el calificador', JSON.stringify(d.examen.notas[1]))
  ok(Object.keys(d.examen.notas[0]).length === 0 && Object.keys(d.tabla.notas[0]).length === 0, 'el otro alumno no se toca')

  console.log('\n5. Y en el calificador se ve lo corregido aquí')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  await abrirCelda(1, e2, ini.examen.nombre)
  ok(await aparece(panel.locator('[data-corregir-prueba]').getByText('3 de 3 anotadas · 6 / 10 puntos')), 'el examen sale corregido')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('rapida-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
