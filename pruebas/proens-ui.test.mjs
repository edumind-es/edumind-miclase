/**
 * Importar una programación de PROENS desde la interfaz, de punta a punta.
 *
 * Crea una clase de 6º en Galicia con Ciencias Sociales, sube el PDF gemelo
 * de PROENS por el botón del panel de programación, revisa la vista previa
 * y aplica. Después mira en IndexedDB que lo guardado es lo que decía el
 * PDF: siete unidades con su trimestre, dos instrumentos con su peso, cada
 * criterio con su mínimo y su instrumento, y el «Baleiro» sin ninguno.
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
const ctx = await navegador.newContext({ viewport: { width: 1400, height: 950 } })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })

try {
  console.log('\n1. Clase de 6º en Galicia con Ciencias Sociales')
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
  const boton = p.getByRole('button', { name: /Importar de PROENS/ })
  ok(await boton.isVisible(), 'en Galicia el panel ofrece importar de PROENS')

  console.log('\n2. Vista previa')
  await boton.click()
  await p.waitForTimeout(300)
  await p.locator('input[type="file"][accept*="pdf"]').setInputFiles(PDF)
  await p.getByRole('button', { name: /Importar 7 unidades/ }).waitFor({ timeout: 20000 })
  ok(true, 'el PDF se lee y la vista previa cuenta 7 unidades')
  ok(await p.getByText(/Ciencias Sociais/).first().isVisible(), 'muestra el área del PDF')
  ok(!(await p.getByText(/Comprueba que es el documento correcto/).isVisible().catch(() => false)),
    'no confunde «Ciencias Sociais» con otra área')
  ok(!(await p.getByText(/no conoce/).isVisible().catch(() => false)), 'todos los códigos CA existen como CE en el currículo')
  ok(await p.getByText('Proba escrita').first().isVisible() || (await p.locator('input[value="Proba escrita"]').count()) > 0,
    'lista los instrumentos de la leyenda')
  await p.getByRole('button', { name: /▶ 10 criterios/ }).click()
  await p.waitForTimeout(300)
  ok(await p.getByText(/Mínimo:/).first().isVisible(), 'cada criterio enseña su mínimo de consecución')
  ok(await p.getByText('CA4.1 → CE4.1').isVisible(), 'y el código de PROENS casado con el del currículo')
  await foto('proens-01-previa')

  console.log('\n3. Aplicar')
  await p.getByRole('button', { name: /Importar 7 unidades/ }).click()
  await p.getByText(/Programación importada/).waitFor({ timeout: 15000 })
  ok(true, 'confirma la importación')
  await p.getByRole('button', { name: 'Cerrar' }).click()
  await p.waitForTimeout(600)
  ok(await p.getByText(/7 unidades · 16\/16 criterios/).isVisible(), 'el panel cuenta 7 unidades y los 16 criterios del currículo cubiertos')
  ok(await p.getByText(/1 criterio sin instrumento asignado/).isVisible(), 'avisa del único criterio «Baleiro»')
  await p.getByRole('button', { name: /▶ 10 criterios/ }).first().click()
  await p.waitForTimeout(300)
  ok(await p.getByText(/Mínimo:/).first().isVisible(), 'el mínimo se ve en la programación')
  await foto('proens-02-programacion')

  console.log('\n4. Lo guardado en IndexedDB')
  const dump = await p.evaluate(async () => {
    const abrir = () => new Promise((res, rej) => {
      const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    const db = await abrir()
    const leer = (tabla) => new Promise((res) => {
      const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
      tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at)); tx.onerror = () => res([])
    })
    const unidades = await leer('unidades')
    const ucs = await leer('unidad_criterios')
    const cis = await leer('criterio_instrumentos')
    const ins = await leer('instrumentos')
    return {
      unidades: unidades.map(u => ({ nombre: u.nombre, trimestre: u.trimestre, sesiones: u.sesiones, peso: u.peso, orden: u.orden, contenidos: (u.contenidos || '').length, descripcion: (u.descripcion || '').length })),
      ucs: ucs.map(c => ({ unidad_id: c.unidad_id, criterio_id: c.criterio_id, minimo: c.minimo || '' })),
      nVinculos: cis.length,
      instrumentos: ins.map(i => ({ nombre: i.nombre, tipo: i.tipo, peso: i.peso })),
    }
  })
  ok(dump.unidades.length === 7, 'siete unidades', String(dump.unidades.length))
  const u1 = dump.unidades.find(u => u.orden === 0)
  ok(u1?.nombre === 'O mundo que nos rodea' && u1?.trimestre === 1 && u1?.sesiones === 10 && u1?.peso === 15,
    'UD 1 con trimestre, sesiones y peso', JSON.stringify(u1))
  ok(u1?.descripcion > 50 && u1?.contenidos > 50, 'con descripción y contidos')
  ok(dump.unidades.filter(u => u.trimestre === 3).length === 2, 'dos unidades en el tercer trimestre')
  ok(dump.ucs.length === 56, 'los 56 vínculos criterio-unidad', String(dump.ucs.length))
  ok(dump.ucs.every(c => /^CE\d\.\d$/.test(c.criterio_id)), 'todos con código del currículo (CE)')
  ok(dump.ucs.filter(c => c.minimo).length === 55, '55 con mínimo (todos menos el «Baleiro»)', String(dump.ucs.filter(c => c.minimo).length))
  ok(dump.nVinculos === 55, '55 vínculos con instrumento', String(dump.nVinculos))
  const pe = dump.instrumentos.find(i => i.nombre === 'Proba escrita')
  const ti = dump.instrumentos.find(i => i.nombre === 'Táboa de indicadores')
  ok(dump.instrumentos.length === 2 && pe?.peso === 80 && pe?.tipo === 'prueba-escrita' && ti?.peso === 20 && ti?.tipo === 'observacion',
    'dos instrumentos con su tipo y su peso', JSON.stringify(dump.instrumentos))

  console.log('\n5. Repetir la importación no duplica')
  await p.getByRole('button', { name: /Importar de PROENS/ }).click()
  await p.waitForTimeout(300)
  await p.locator('input[type="file"][accept*="pdf"]').setInputFiles(PDF)
  await p.getByRole('button', { name: /Importar 7 unidades/ }).waitFor({ timeout: 20000 })
  await p.getByRole('button', { name: /Importar 7 unidades/ }).click()
  await p.getByText(/Programación importada/).waitFor({ timeout: 15000 })
  ok(await p.getByText(/7 actualizadas/).isVisible(), 'la segunda vez actualiza las siete en vez de crearlas')
  ok(await p.getByText(/2 reutilizados/).isVisible(), 'y reutiliza los dos instrumentos')
  const n2 = await p.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
    const leer = (tabla) => new Promise((res) => {
      const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
      tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
    })
    return { unidades: (await leer('unidades')).length, ucs: (await leer('unidad_criterios')).length, cis: (await leer('criterio_instrumentos')).length, ins: (await leer('instrumentos')).length }
  })
  ok(n2.unidades === 7 && n2.ucs === 56 && n2.cis === 55 && n2.ins === 2, 'los mismos registros que antes', JSON.stringify(n2))

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('proens-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
