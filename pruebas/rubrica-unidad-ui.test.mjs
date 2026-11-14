/**
 * Rúbrica propia por unidad y modelos: desde la ficha «Editar» de una
 * actividad se elige un modelo (de serie o del banco), que se COPIA al editor
 * y se guarda como rúbrica general; desde otra unidad se guarda otra «solo
 * para esta unidad» sin tocar la general; cada unidad abre la suya y, al
 * eliminar la propia, la unidad vuelve a la general.
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
const preguntas = []
await aceptarConfirmaciones(p, t => preguntas.push(t))
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })


try {
  console.log('\n1. Clase con programación de PROENS; una actividad toma un modelo de serie como rúbrica general')
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
  const rubricas = () => p.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
    const tabla = (t) => new Promise((res) => { const tx = db.transaction(t, 'readonly').objectStore(t).getAll(); tx.onsuccess = () => res(tx.result) })
    const ins = new Map((await tabla('instrumentos')).map(i => [i.id, i.nombre]))
    return (await tabla('rubricas')).filter(r => r.tipo !== 'prueba').map(r => ({
      instrumento: ins.get(r.instrumento_id) ?? r.instrumento_id, unidad: r.unidad_id ?? null, titulo: r.titulo,
      filas: JSON.parse(r.indicadores_json).length, viva: !r.deleted_at,
    }))
  })
  const editor = p.getByRole('dialog', { name: /^Rúbrica de / })
  const ficha = p.locator('[data-ficha-actividad]')
  // El selector de alcance sale cuando el editor ya ha cargado la rúbrica.
  const textos = async () => { await editor.locator('[data-rubrica-alcance]').waitFor({ timeout: 8000 }); await p.waitForTimeout(300); return editor.locator('input, textarea').evaluateAll(cs => cs.map(c => c.value).join(' | ')) }
  const cerrarEditor = async () => {
    await editor.getByRole('button', { name: 'Cerrar', exact: true }).first().click()
    await editor.waitFor({ state: 'detached', timeout: 5000 })
    await p.waitForTimeout(700)
  }

  await p.getByRole('link', { name: /Exámenes y pruebas/ }).click()
  const tarjeta = p.locator('[data-examenes-hoja]')
  const bloques = tarjeta.locator('[data-area-examenes] [data-unidad-bloque]')
  await bloques.first().waitFor({ timeout: 10000 })
  ok(await tarjeta.locator('[data-modelo-serie]').count() === 3, 'el bloque de modelos enseña los tres de serie')
  const fila = n => bloques.nth(n).locator('[data-fila-actividad][data-herramienta="diario"], [data-fila-actividad][data-herramienta="rúbrica"]').first()
  const nombre = await fila(0).getAttribute('data-nombre')
  const unidad2 = Number(new URL(await bloques.nth(1).locator('[data-fila-calificar]').first().getAttribute('href'), BASE).searchParams.get('unidad_id'))
  await fila(0).locator('[data-editar-actividad]').click()
  await ficha.waitFor({ timeout: 8000 })
  await ficha.locator('[data-ficha-modelos]').click()
  const lista = ficha.locator('[data-elegir-modelo]')
  ok(await aparece(lista) && await lista.locator('[data-modelo-elegir^="serie:"]').count() === 3, 'la ficha ofrece los tres modelos de serie')
  await lista.locator('[data-modelo-elegir="serie:cuaderno"]').click()
  ok(await aparece(editor), 'elegir uno abre el editor de rúbricas')
  ok((await textos()).includes('Las actividades están corregidas'), 'con el modelo copiado dentro')
  ok(await editor.locator('[data-rubrica-alcance]').getAttribute('data-rubrica-alcance') === 'general', 'y propuesto para todas las unidades')
  ok((await rubricas()).length === 0, 'nada se guarda hasta pulsar «Guardar»')
  await editor.getByRole('button', { name: /Guardar rúbrica/ }).click()
  ok(await aparece(editor.getByText('Rúbrica guardada correctamente.')), 'se guarda')
  await cerrarEditor()
  let rs = await rubricas()
  ok(rs.length === 1 && rs[0].unidad === null && rs[0].filas === 6 && rs[0].instrumento === nombre, 'una rúbrica general, la del cuaderno', JSON.stringify(rs))
  ok(await aparece(bloques.nth(0).locator(`[data-fila-actividad][data-nombre="${nombre}"][data-herramienta="rúbrica"]`))
    && await aparece(bloques.nth(1).locator(`[data-fila-actividad][data-nombre="${nombre}"][data-herramienta="rúbrica"]`)), 'y la actividad pasa a evaluarse con rúbrica en todas las unidades')

  console.log('\n2. Desde otra unidad, otro modelo «solo para esta unidad»')
  await fila(1).locator('[data-editar-actividad]').click()
  await ficha.waitFor({ timeout: 8000 })
  ok(/general/.test(await ficha.locator('[data-ficha-herramienta]').textContent()), 'la ficha dice que usa la general')
  await ficha.locator('[data-ficha-modelos]').click()
  await ficha.locator('[data-modelo-elegir="serie:trabajo-en-equipo"]').click()
  await editor.waitFor({ timeout: 8000 })
  await editor.locator('[data-rubrica-alcance-select]').selectOption('unidad')
  await editor.getByRole('button', { name: /Guardar rúbrica/ }).click()
  ok(await aparece(editor.getByText(/guardada solo para/)), 'dice que se guarda solo para la unidad')
  await cerrarEditor()
  rs = await rubricas()
  const general = rs.find(r => r.unidad === null), propia = rs.find(r => r.unidad === unidad2)
  ok(rs.length === 2 && general?.filas === 6 && general.viva && propia?.filas === 5 && propia.viva, 'dos rúbricas: la general intacta y la de la unidad', JSON.stringify(rs))
  await foto('rubrica-unidad-01')

  console.log('\n3. Cada unidad abre la suya')
  await fila(1).locator('[data-editar-actividad]').click()
  await ficha.waitFor({ timeout: 8000 })
  ok(/propia/.test(await ficha.locator('[data-ficha-herramienta]').textContent()), 'la ficha de la segunda unidad dice que es propia')
  await ficha.locator('[data-ficha-rubrica]').click()
  await editor.waitFor({ timeout: 8000 })
  ok((await textos()).includes('Participa y aporta ideas') && await editor.locator('[data-rubrica-alcance]').getAttribute('data-rubrica-alcance') === 'unidad', 'la segunda unidad abre la del trabajo en equipo, como propia')
  await cerrarEditor()
  await fila(0).locator('[data-editar-actividad]').click()
  await ficha.waitFor({ timeout: 8000 })
  await ficha.locator('[data-ficha-rubrica]').click()
  await editor.waitFor({ timeout: 8000 })
  ok((await textos()).includes('Las actividades están corregidas') && await editor.locator('[data-rubrica-alcance]').getAttribute('data-rubrica-alcance') === 'general', 'la primera sigue con la del cuaderno, la general')
  await cerrarEditor()

  console.log('\n4. En el Calificador, la pasada de cada unidad usa su rúbrica')
  await bloques.nth(1).locator(`[data-fila-actividad][data-nombre="${nombre}"] [data-fila-calificar]`).click()
  await p.locator('[data-unidad-select]').waitFor({ timeout: 10000 })
  await p.waitForTimeout(1500)
  const th = p.locator('th[data-criterios]').filter({ hasText: nombre }).first()
  await th.getByRole('button', { name: /Calificar/ }).first().click()
  const pasada = p.getByRole('dialog').filter({ hasText: 'Participa y aporta ideas' })
  ok(await aparece(pasada), 'la pasada de la segunda unidad trae los aspectos del trabajo en equipo')
  await p.keyboard.press('Escape')
  await p.waitForTimeout(500)

  console.log('\n5. Eliminar la propia devuelve la unidad a la general')
  await p.getByRole('link', { name: /Exámenes y pruebas/ }).click()
  await bloques.first().waitFor({ timeout: 10000 })
  await fila(1).locator('[data-editar-actividad]').click()
  await ficha.waitFor({ timeout: 8000 })
  await ficha.locator('[data-ficha-rubrica]').click()
  await editor.waitFor({ timeout: 8000 })
  preguntas.length = 0
  await editor.getByRole('button', { name: /Eliminar rúbrica/ }).click()
  ok(await aparece(editor.getByText('Rúbrica eliminada.')), 'se elimina')
  ok(preguntas.some(t => /volverá a usar la general/.test(t)), 'tras avisar de que la unidad vuelve a la general', preguntas.join(' | '))
  await cerrarEditor()
  rs = await rubricas()
  ok(rs.find(r => r.unidad === unidad2)?.viva === false && rs.find(r => r.unidad === null)?.viva === true, 'solo se retira la de la unidad', JSON.stringify(rs))
  ok(await aparece(bloques.nth(1).locator(`[data-fila-actividad][data-nombre="${nombre}"][data-herramienta="rúbrica"]`)), 'y la unidad sigue con rúbrica: la general')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('rubrica-unidad-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
