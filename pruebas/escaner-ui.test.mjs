/**
 * Corregir por cámara, de punta a punta en la interfaz.
 *
 * Una clase con la programación de PROENS y dos alumnos; el examen de la
 * prueba escrita se define importando un test escrito como examen (con
 * opciones y correcta); se imprime la hoja del primer alumno —con el QR real
 * de la prueba y el alumno que acaban de nacer en IndexedDB—, se rellena y
 * se «fotografía» girada sobre un escritorio; esa foto entra por «Elegir una
 * foto» y se guarda. Lo que se vigila: que el escáner reconozca prueba y
 * alumno, calcule la nota con la clave, deje corregir una duda con el dedo,
 * y que lo guardado sea lo mismo que deja la corrección a mano.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { navegadorChromium } from './lib/entorno.mjs'

const require = createRequire(import.meta.url)
const { hojaDeMuestra } = require(process.env.HOJA_DEMO)
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
const aparece = (loc) => loc.waitFor({ timeout: 8000 }).then(() => true, () => false)

const bd = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  const [alumnos, cals, instrumentos, rubricas] = await Promise.all(['alumnos', 'calificaciones', 'instrumentos', 'rubricas'].map(leer))
  alumnos.sort((a, b) => a.apellidos.localeCompare(b.apellidos))
  const prueba = instrumentos.find(i => i.tipo === 'prueba-escrita')
  const examen = rubricas.find(r => r.tipo === 'prueba')
  return {
    alumnos: alumnos.map(a => ({ id: a.id, nombre: `${a.apellidos}, ${a.nombre}` })),
    examen: examen ? { id: examen.id, def: JSON.parse(examen.prueba_json) } : null,
    notas: alumnos.map(a => cals.filter(c => c.alumno_id === a.id && c.instrumento_id === prueba?.id && c.valor != null)
      .map(c => ({ criterio: c.criterio_id, valor: c.valor, respuestas: c.niveles_rubrica }))),
  }
})

const panel = p.getByRole('dialog', { name: /^Evaluar / })
const editor = p.getByRole('dialog', { name: /^Examen de / })
const escaner = p.getByRole('dialog', { name: /^Corregir por cámara/ })

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

  console.log('\n2. El examen: un test con clave, importado como examen escrito')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('[data-presentacion-entendido]').click({ timeout: 5000 }).catch(() => {})
  await p.locator('[data-instr-th]').first().waitFor({ timeout: 8000 })
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1200)
  const colExamen = p.locator('[data-instr-th][data-tipo="prueba-escrita"]').first()
  ok(await colExamen.count() === 1, 'hay columna de prueba escrita en la unidad')
  ok(await colExamen.locator('[data-escanear-abrir]').count() === 0, 'sin examen definido no se ofrece corregir por cámara')
  await colExamen.locator('[data-corregir-abrir]').click()
  await panel.waitFor({ timeout: 8000 })
  await panel.getByRole('button', { name: /Definir examen/ }).first().click()
  await editor.waitFor({ timeout: 8000 })
  await aparece(editor.getByLabel('Título del examen'))
  const N = 8, K = 4
  const md = '# Test dos ríos\n\n' + Array.from({ length: N }, (_, i) =>
    `${i + 1}. Pregunta ${i + 1}\n` + ['a', 'b', 'c', 'd'].map((l, j) => `   ${l}) Opción ${l}${j === i % K ? ' *' : ''}`).join('\n')).join('\n\n') + '\n'
  await editor.locator('input[data-uso="examen"]').setInputFiles({ name: 'test.md', mimeType: 'text/markdown', buffer: Buffer.from(md) })
  ok(await aparece(editor.getByText(/«Test dos ríos» importado: 8 preguntas/)), 'importa el test de 8 preguntas')
  ok(await aparece(editor.locator('[data-estado-clave="completa"]')), 'con clave completa')
  await editor.getByRole('button', { name: /Guardar examen/ }).click()
  ok(await aparece(editor.getByText('✅ Guardado en este dispositivo')), 'se guarda')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await editor.waitFor({ state: 'hidden', timeout: 5000 })
  await p.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(900)
  const d0 = await bd()
  ok(!!d0.examen && d0.examen.def.preguntas.every(q => q.opciones?.length === K && q.correcta != null), 'el examen guardado lleva opciones y correcta')
  ok(await colExamen.locator('[data-escanear-abrir]').count() === 1 && await colExamen.locator('[data-imprimir-abrir]').count() === 1, 'ahora la columna ofrece imprimir y corregir por cámara')

  console.log('\n3. La hoja del primer alumno, rellena y fotografiada')
  const ana = d0.alumnos[0]
  // Respuestas de Ana: 1-5 bien, la 6 mal, la 7 en blanco, la 8 con dos marcas (duda).
  const marcadas = [0, 1, 2, 3, 0, 0, null, 2]
  const hoja = await ctx.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 })
  await hoja.setContent(await hojaDeMuestra(N, K, d0.examen.id, ana.id))
  await hoja.emulateMedia({ media: 'print' })
  await hoja.evaluate(({ K, marcadas }) => {
    const b = [...document.querySelectorAll('.burbuja')]
    const pinta = (q, j) => Object.assign(b[q * K + j].style, { background: '#111', color: '#111' })
    marcadas.forEach((j, q) => { if (j != null) pinta(q, j) })
    pinta(7, 3)  // la segunda marca de la 8
  }, { K, marcadas })
  const captura = (await hoja.screenshot({ fullPage: true })).toString('base64')
  const png = await hoja.evaluate(async (captura) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + captura; await img.decode()
    const c = document.createElement('canvas'); c.width = 1500; c.height = 2000
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(-5 * Math.PI / 180)
    ctx.drawImage(img, -img.width * 0.8 / 2, -img.height * 0.8 / 2, img.width * 0.8, img.height * 0.8)
    return c.toDataURL('image/png').split(',')[1]
  }, captura)
  await hoja.close()

  console.log('\n4. Corregir por cámara con esa foto')
  await colExamen.locator('[data-escanear-abrir]').click()
  await escaner.waitFor({ timeout: 8000 })
  await escaner.locator('[data-escaner-fichero]').setInputFiles({ name: 'hoja.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  ok(await aparece(escaner.locator('[data-escaner-capturada]')), 'la foto se reconoce como hoja')
  ok((await escaner.locator('[data-escaner-alumno]').textContent()).includes('Abad Ríos, Ana'), 'y es la de Ana')
  // 5 aciertos, 1 fallo, 1 blanco, la 8 con duda (propone una de las dos): nota provisional.
  const dudas = escaner.locator('[data-escaner-pregunta][data-dudosa]')
  ok(await dudas.count() === 1 && await dudas.first().getAttribute('data-escaner-pregunta') === '8', 'la 8 sale como dudosa', `${await dudas.count()}`)
  await foto('escaner-01-capturada')
  const notaAntes = (await escaner.locator('[data-escaner-nota]').textContent()).trim()
  ok(notaAntes === '6.25', 'antes de resolver la duda: 5 aciertos de 8 → 6,25', notaAntes)
  // El docente resuelve la duda con el dedo: la 8 era la D, que es la correcta.
  await dudas.first().getByRole('button', { name: 'D', exact: true }).click()
  await p.waitForTimeout(200)
  const nota = (await escaner.locator('[data-escaner-nota]').textContent()).trim()
  ok(nota === '7.5', 'resuelta la duda, la nota se recalcula: 6 de 8 → 7,5', nota)
  await escaner.locator('[data-escaner-guardar]').click()
  ok(await aparece(escaner.locator('[data-escaner-progreso]').getByText('1 de 2 corregidos')), 'guardada: 1 de 2')
  ok(await escaner.locator('[data-escaner-faltan]').getByText(/Bello Souto/).count() === 1 && await escaner.locator('[data-escaner-faltan]').getByText(/Abad/).count() === 0, 'en «faltan» queda solo Bruno')
  await p.keyboard.press('Escape')
  await escaner.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(900)
  const d1 = await bd()
  ok(d1.notas[0].length >= 1 && d1.notas[0].every(n => n.valor === 7.5), 'Ana tiene 7,5 en los criterios del examen', JSON.stringify(d1.notas[0].map(n => [n.criterio, n.valor])))
  const r = d1.notas[0][0]?.respuestas ?? {}
  ok(r.p1 === 1 && r.p6 === -1 && r.p7 === 0 && r.p8 === 1, 'las respuestas guardadas son acierto, fallo o en blanco, como a mano', JSON.stringify(r))
  ok(d1.notas[1].length === 0, 'Bruno sigue sin nota')
  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('escaner-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
