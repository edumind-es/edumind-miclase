/**
 * Familias e hijos desde ⚙ Instrumentos, de punta a punta: añadir un hijo a
 * mano (hereda todos los criterios de la familia), recortarle criterios,
 * lanzar el asistente con «un examen por unidad», y comprobar en IndexedDB
 * que cada hijo cuelga de su familia y no se sale de sus criterios. Y que la
 * matriz por criterio sigue con las mismas columnas: los hijos no asoman.
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

/** Instrumentos vivos y filas criterio↔instrumento vivas. */
const estado = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const instrumentos = await leer('instrumentos')
  const filas = await leer('criterio_instrumentos')
  return {
    instrumentos: instrumentos.map(i => ({ id: i.id, nombre: i.nombre, tipo: i.tipo, peso: i.peso, familia_id: i.familia_id ?? null })),
    filas: filas.map(f => ({ unidad_id: f.unidad_id, criterio_id: f.criterio_id, instrumento_id: f.instrumento_id })),
  }
})
/** ¿Los criterios de cada hijo son subconjunto de los de su familia en la misma unidad? */
const subconjunto = (e) => {
  const fam = new Map(e.instrumentos.map(i => [i.id, i.familia_id]))
  const tiene = new Set(e.filas.map(f => `${f.unidad_id}|${f.criterio_id}|${f.instrumento_id}`))
  return e.filas.filter(f => fam.get(f.instrumento_id) != null)
    .every(f => tiene.has(`${f.unidad_id}|${f.criterio_id}|${fam.get(f.instrumento_id)}`))
}

try {
  console.log('\n1. Clase con programación de PROENS')
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

  console.log('\n1b. Al importar, el cuarto paso pregunta qué haces dentro de cada familia')
  const pasoFamilias = p.locator('[data-paso-familias]')
  await pasoFamilias.waitFor({ timeout: 5000 })
  ok(await pasoFamilias.locator('[data-familia-importada]').count() === 2, 'una fila por familia importada')
  ok((await pasoFamilias.textContent()).includes('Nada dentro todavía'), 'y dice que aún no hay nada dentro')
  await pasoFamilias.locator('[data-familia-importada]').first().locator('[data-familia-asistente]').click()
  const asistenteImport = p.getByRole('dialog', { name: /Qué haces dentro de/ })
  await asistenteImport.waitFor({ timeout: 5000 })
  ok(await asistenteImport.locator('[data-plantilla]').count() >= 4, 'se abre el mismo asistente que en el gestor')
  await asistenteImport.getByRole('button', { name: 'Cancelar' }).click()
  await asistenteImport.waitFor({ state: 'hidden', timeout: 5000 })

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

  console.log('\n2. El gestor enseña dos familias, sin hijos')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  const columnasAntes = await p.locator('th.criterio-th').count()
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()
  const gestor = p.getByRole('dialog', { name: 'Gestionar instrumentos de evaluación' })
  await gestor.waitFor({ timeout: 5000 })
  const bloques = gestor.locator('[data-familia-hijos]')
  ok(await bloques.count() === 2, 'cada familia tiene su bloque «dentro de esta familia»', `${await bloques.count()}`)
  ok(await gestor.getByText(/100%/).count() >= 1, 'el reparto de las familias suma 100 %')
  const taboa = bloques.nth(1)
  ok((await taboa.textContent()).includes('Nada todavía'), 'sin hijos se dice que se califica con la familia')

  console.log('\n3. Añadir «Cuaderno» a mano dentro de la táboa')
  await taboa.locator('[data-hijo-nuevo]').click()
  await taboa.locator('[data-hijo-form] input[type="text"], [data-hijo-form] input:not([type])').first().fill('Cuaderno')
  await taboa.locator('[data-hijo-form] select').selectOption('portfolio')
  await taboa.locator('[data-hijo-crear]').click()
  const cuaderno = taboa.locator('[data-hijo][data-nombre="Cuaderno"]')
  await cuaderno.waitFor({ timeout: 5000 })
  let e = await estado()
  const famTaboa = e.instrumentos.find(i => /T[aá]boa/.test(i.nombre) && i.familia_id == null)
  const hijoCuaderno = e.instrumentos.find(i => i.nombre === 'Cuaderno')
  ok(!!hijoCuaderno && hijoCuaderno.familia_id === famTaboa.id, 'cuelga de la táboa', JSON.stringify(hijoCuaderno))
  ok(hijoCuaderno.peso === 1 && hijoCuaderno.tipo === 'portfolio', 'con peso relativo 1 y tipo portfolio')
  const deFamilia = e.filas.filter(f => f.instrumento_id === famTaboa.id).length
  const deCuaderno = e.filas.filter(f => f.instrumento_id === hijoCuaderno.id).length
  ok(deCuaderno === deFamilia && deFamilia > 0, 'empieza cubriendo todos los criterios de la familia', `${deCuaderno} de ${deFamilia}`)
  const texto = await cuaderno.locator('[data-hijo-criterios]').textContent()
  ok(/^(\d+) de \1 criterios/.test(texto.trim()), 'y el botón lo dice', texto.trim())
  ok(subconjunto(e), 'nada se sale de la familia')

  console.log('\n4. Recortar un criterio al cuaderno')
  await cuaderno.locator('[data-hijo-criterios]').click()
  const lista = cuaderno.locator('[data-hijo-criterios-lista]')
  await lista.waitFor({ timeout: 5000 })
  const primerChip = lista.locator('button[aria-pressed="true"]').first()
  const quitado = await primerChip.textContent()
  await primerChip.click()
  await p.waitForTimeout(600)
  e = await estado()
  ok(e.filas.filter(f => f.instrumento_id === hijoCuaderno.id).length === deCuaderno - 1, `al quitar ${quitado} en una unidad queda una fila menos`)
  ok(subconjunto(e), 'sigue dentro de la familia')
  await foto('familias-01-cuaderno')

  console.log('\n5. Asistente en «Proba escrita»: un examen por unidad')
  const proba = bloques.nth(0)
  await proba.locator('[data-asistente-abrir]').click()
  const asistente = p.getByRole('dialog', { name: /Qué haces dentro de/ })
  await asistente.waitFor({ timeout: 5000 })
  ok(await asistente.locator('[data-plantilla]').count() >= 4, 'ofrece las plantillas generales (sociales no es idioma)', `${await asistente.locator('[data-plantilla]').count()}`)
  ok(await asistente.locator('[data-plantilla] input[type="checkbox"]:checked').count() === 0, 'en un área que no es idioma no marca nada por defecto')
  await asistente.locator('[data-plantilla="Examen"] input[type="checkbox"]').check()
  const textoExamen = await asistente.locator('[data-plantilla="Examen"] [data-plantilla-criterios]').textContent()
  const nUnidades = Number(/Se crean (\d+)/.exec(textoExamen)?.[1])
  ok(nUnidades >= 2, 'anuncia uno por unidad donde la familia cubre algo', textoExamen.trim().slice(0, 90))
  await foto('familias-02-asistente')
  await asistente.locator('[data-asistente-crear]').click()
  await asistente.waitFor({ state: 'hidden', timeout: 10000 })
  await p.waitForTimeout(800)
  e = await estado()
  const famProba = e.instrumentos.find(i => /Proba/.test(i.nombre) && i.familia_id == null)
  const examenes = e.instrumentos.filter(i => i.familia_id === famProba.id)
  ok(examenes.length === nUnidades, `se crean ${nUnidades} exámenes colgando de la proba`, examenes.map(x => x.nombre).join(' | '))
  ok(examenes.every(x => x.tipo === 'prueba-escrita' && /^Examen · /.test(x.nombre)), 'con tipo prueba escrita y el nombre de su unidad')
  const porUnidad = examenes.every(x => {
    const unidades = new Set(e.filas.filter(f => f.instrumento_id === x.id).map(f => f.unidad_id))
    return unidades.size === 1
  })
  ok(porUnidad, 'cada examen evalúa en una sola unidad')
  ok(subconjunto(e), 'y dentro de los criterios de la proba en esa unidad')
  ok(await proba.locator('[data-hijo]').count() === nUnidades, 'el gestor los lista dentro de la familia')
  ok(await gestor.getByText(/100%/).count() >= 1, 'el reparto de las familias sigue en 100 %: los hijos no suman ahí')
  await foto('familias-03-examenes')

  console.log('\n6. La matriz por criterio no cambia')
  await gestor.getByRole('button', { name: 'Cerrar' }).click()
  await gestor.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(1200)
  ok(await p.locator('th.criterio-th').count() === columnasAntes, 'mismas columnas que antes', `${await p.locator('th.criterio-th').count()} vs ${columnasAntes}`)
  await p.locator('.celda-btn:not(.sin-instrumento)').first().click()
  const panel = p.getByRole('dialog', { name: /^Evaluar / })
  await panel.waitFor({ timeout: 8000 })
  await panel.locator('button.cal-7').click()
  await panel.getByText(/7 guardado en/).waitFor({ timeout: 5000 })
  ok(true, 'y se sigue pudiendo calificar con la familia')
  await p.keyboard.press('Escape')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('familias-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
