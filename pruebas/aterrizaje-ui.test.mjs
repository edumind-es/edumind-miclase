/**
 * Aterrizaje para quien viene de una hoja de cálculo: la primera vez que un
 * área tiene instrumentos, el Calificador abre por instrumento con la tarjeta
 * «Así se organiza tu evaluación»; «Entendido» la cierra y no vuelve; y
 * «Pegar columna» trae las notas de Excel a un instrumento, con vista previa
 * alumno a alumno, guardándolas en todos los criterios que cubre.
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

const notas = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const alumnos = (await leer('alumnos')).sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es'))
  const cals = (await leer('calificaciones')).filter(c => c.valor != null)
  return alumnos.map(a => ({
    nombre: `${a.apellidos}, ${a.nombre}`,
    notas: cals.filter(c => c.alumno_id === a.id).map(c => ({ criterio: c.criterio_id, valor: c.valor, instrumento_id: c.instrumento_id })),
  }))
})

try {
  console.log('\n1. Clase con programación y tres alumnos')
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

  console.log('\n2. Primera vez en el Calificador: por instrumento y con la tarjeta')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  ok(await p.locator('[data-instr-th]').count() >= 1, 'sin elección previa, abre por instrumento')
  ok(await p.locator('[data-vista="instrumentos"][aria-pressed="true"]').count() === 1, 'y el conmutador lo marca')
  const tarjeta = p.locator('[data-presentacion]')
  await tarjeta.waitFor({ timeout: 5000 })
  ok(await tarjeta.locator('[data-presentacion-familia]').count() === 2, 'la tarjeta enseña las dos familias de la programación')
  await foto('aterrizaje-01-tarjeta')
  await tarjeta.locator('[data-presentacion-ajustar]').click()
  const gestor = p.getByRole('dialog', { name: 'Gestionar instrumentos de evaluación' })
  await gestor.waitFor({ timeout: 5000 })
  ok(true, '«Ajustarlo a mi forma de trabajar» abre el gestor')
  await gestor.getByRole('button', { name: 'Cerrar' }).click()
  await gestor.waitFor({ state: 'hidden', timeout: 5000 })
  await tarjeta.locator('[data-presentacion-entendido]').click()
  await tarjeta.waitFor({ state: 'hidden', timeout: 5000 })
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  ok(await p.locator('[data-presentacion]').count() === 0, 'tras «Entendido» no vuelve a salir en este aparato')
  ok(await p.locator('[data-instr-th]').count() >= 1, 'y sigue por instrumento')
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)

  console.log('\n3. Pegar una columna de Excel, por orden de lista')
  const col = p.locator('[data-instr-th]').first()
  const nombreInstr = await col.getAttribute('data-nombre')
  const idsCabecera = (await col.locator('.instr-th-criterios').textContent()).split(':')[1].split('·').map(s => s.trim()).filter(Boolean)
  await col.locator('[data-pegar-abrir]').click()
  const dialogo = p.getByRole('dialog', { name: /^Pegar notas en / })
  await dialogo.waitFor({ timeout: 5000 })
  await dialogo.locator('[data-pegar-texto]').fill('7,5\n5\n')
  await dialogo.locator('[data-pegar-fila]').first().waitFor({ timeout: 5000 })
  const filas = dialogo.locator('[data-pegar-fila]')
  ok(await filas.count() === 2 && (await filas.first().textContent()).includes('Abad Ríos, Ana'), 'la vista previa asigna por orden: la primera a Abad')
  ok((await dialogo.textContent()).includes('Sin nota: Casal Vidal'), 'y dice quién se queda sin nota')
  await foto('aterrizaje-02-pegar-orden')
  await dialogo.locator('[data-pegar-guardar]').click()
  await dialogo.waitFor({ state: 'hidden', timeout: 8000 })
  await p.waitForTimeout(900)
  let n = await notas()
  ok(n[0].notas.length === idsCabecera.length && n[0].notas.every(x => x.valor === 7.5), `Abad tiene 7,5 en los ${idsCabecera.length} criterios de «${nombreInstr}»`, JSON.stringify(n[0].notas.map(x => [x.criterio, x.valor])))
  ok(n[1].notas.every(x => x.valor === 5) && n[1].notas.length === idsCabecera.length, 'Bello tiene 5 en los mismos')
  ok(n[2].notas.length === 0, 'Casal sigue sin nota')

  console.log('\n4. Pegar con nombres: casa por nombre y sobrescribe')
  await col.locator('[data-pegar-abrir]').click()
  await dialogo.waitFor({ timeout: 5000 })
  await dialogo.locator('[data-pegar-texto]').fill('Alumno\tNota\nCasal Vidal, Carla\t9\nAbad Ríos, Ana\t6\nPérez, Pepe\t3')
  await dialogo.locator('[data-pegar-fila]').first().waitFor({ timeout: 5000 })
  ok((await dialogo.textContent()).includes('Ningún alumno de la clase se llama así'), 'Pérez no es de la clase y se señala')
  ok(await dialogo.locator('[data-pegar-fila][data-ok]').count() === 2, 'dos notas listas')
  await foto('aterrizaje-03-pegar-nombres')
  await dialogo.locator('[data-pegar-guardar]').click()
  await dialogo.waitFor({ state: 'hidden', timeout: 8000 })
  await p.waitForTimeout(900)
  n = await notas()
  ok(n[2].notas.length === idsCabecera.length && n[2].notas.every(x => x.valor === 9), 'Casal recibe su 9 por nombre, aunque iba la primera')
  ok(n[0].notas.every(x => x.valor === 6), 'el 6 de Abad sobrescribe el 7,5')
  ok(n[1].notas.every(x => x.valor === 5), 'Bello no estaba en la hoja y conserva su 5')
  const celda = p.locator('tbody tr').nth(2).locator('[data-celda-instr]').first()
  ok((await celda.textContent()).startsWith('9'), 'la matriz lo enseña', await celda.textContent())

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('aterrizaje-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
