/**
 * Convertir lo que ya hay en una familia en su primer hijo, de punta a punta.
 *
 * El caso de Luis: «Proba escrita - express repaso» (80 %) calificada
 * directamente con la familia. Al añadir dentro «Prueba escrita - oficial»
 * esperaba dos columnas. Aquí: se califica la familia, se renombra como la
 * suya, se añade el primer hijo, el gestor ofrece convertir, se acepta, y
 * la matriz por instrumento enseña dos columnas con las notas antiguas en la
 * primera; la casilla por criterio y Seguimiento dan lo mismo que antes; en
 * IndexedDB todo lo movido lleva el id del hijo y `updated_at` nuevo, para
 * viajar en el siguiente sync; la familia se queda con las filas de la
 * programación y el nombre genérico.
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

const estado = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  return {
    instrumentos: (await leer('instrumentos')).map(i => ({ id: i.id, nombre: i.nombre, tipo: i.tipo, peso: i.peso, familia_id: i.familia_id ?? null })),
    notas: (await leer('calificaciones')).filter(c => c.valor != null).map(c => ({ id: c.id, criterio: c.criterio_id, instrumento_id: c.instrumento_id, valor: c.valor, updated_at: c.updated_at })),
    filas: (await leer('criterio_instrumentos')).map(f => ({ unidad_id: f.unidad_id, criterio_id: f.criterio_id, instrumento_id: f.instrumento_id })),
    examenes: (await leer('rubricas')).filter(r => r.tipo === 'prueba').map(r => ({ id: r.id, instrumento_id: r.instrumento_id, unidad_id: r.unidad_id ?? null, titulo: r.titulo })),
    alumnos: (await leer('alumnos')).map(a => a.id),
  }
})
/** Mete filas tal cual en IndexedDB: el caso que la interfaz ya no deja crear (datos a nombre de una familia con hijos). */
const inyectar = (tabla, filas) => p.evaluate(async ({ tabla, filas }) => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  await new Promise((res, rej) => {
    const tx = db.transaction(tabla, 'readwrite')
    for (const f of filas) tx.objectStore(tabla).put(f)
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
}, { tabla, filas })
/** Notas del área en Seguimiento, como texto, para comparar antes y después. */
const notasSeguimiento = async () => {
  await p.getByRole('link', { name: 'Seguimiento', exact: true }).click()
  await p.waitForTimeout(1800)
  const texto = await p.locator('body').textContent()
  return (texto.match(/\d+[.,]\d+/g) ?? []).join(' ')
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

  console.log('\n2. Se califica la «Proba escrita» directamente, desde la vista por instrumento')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('[data-vista="instrumentos"]').click()
  await p.locator('.tab-unidad').nth(1).click()
  await p.locator('[data-instr-th]').first().waitFor({ timeout: 5000 })
  await p.waitForTimeout(600)
  const idxProba = await p.locator('[data-instr-th]').evaluateAll(ths => ths.findIndex(t => /Proba/.test(t.dataset.nombre)))
  ok(idxProba >= 0, 'la proba es una columna')
  ok(await p.locator('[data-familia-th]').count() === 0, 'sin hijos no hay fila de familias')
  const celdaProba = () => p.locator('tbody tr').first().locator('[data-celda-instr]').nth(idxProba)
  await celdaProba().click()
  const panel = p.getByRole('dialog', { name: /^Evaluar / })
  await panel.waitFor({ timeout: 8000 })
  await panel.locator('button.cal-7').click()
  await panel.getByText(/7 guardado en los \d+ criterios/).waitFor({ timeout: 5000 })
  await p.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(900)
  ok((await celdaProba().textContent()).startsWith('7'), 'la casilla de la proba vale 7', await celdaProba().textContent())
  let e = await estado()
  const famProba = e.instrumentos.find(i => /Proba/.test(i.nombre) && i.familia_id == null)
  const notasAntes = e.notas.filter(n => n.instrumento_id === famProba.id)
  ok(notasAntes.length >= 1 && e.notas.length === notasAntes.length, `las ${notasAntes.length} notas llevan el id de la familia`)
  const filasFamiliaAntes = e.filas.filter(f => f.instrumento_id === famProba.id).length
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('th.criterio-th').first().waitFor({ timeout: 5000 })
  await p.waitForTimeout(600)
  const sietesAntes = await p.locator('.celda-btn.cal-7').count()
  ok(sietesAntes === notasAntes.length, 'por criterio, una casilla con 7 por nota', `${sietesAntes}`)
  const seguimientoAntes = await notasSeguimiento()
  ok(seguimientoAntes.length > 0, 'Seguimiento enseña la nota del área', seguimientoAntes.slice(0, 60))
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('.tab-unidad').nth(1).click()
  await p.waitForTimeout(1000)

  console.log('\n3. La familia se llama como la de Luis y se añade el primer hijo: el gestor ofrece convertir')
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()
  const gestor = p.getByRole('dialog', { name: 'Gestionar instrumentos de evaluación' })
  await gestor.waitFor({ timeout: 5000 })
  const bloque = gestor.locator(`[data-familia-hijos][data-familia-id="${famProba.id}"]`)
  await bloque.waitFor({ timeout: 8000 })
  const nombreFamilia = bloque.locator('xpath=..').locator('input').first()
  await nombreFamilia.fill('Proba escrita - express repaso')
  await nombreFamilia.press('Enter')
  await p.waitForTimeout(700)
  e = await estado()
  ok(e.instrumentos.find(i => i.id === famProba.id)?.nombre === 'Proba escrita - express repaso', 'la familia se ha renombrado')
  const marca = new Date().toISOString()
  await p.waitForTimeout(50)
  await bloque.locator('[data-hijo-nuevo]').click()
  await bloque.locator('[data-hijo-form] input:not([type="checkbox"])').first().fill('Prueba escrita - oficial')
  await bloque.locator('[data-hijo-form] select').selectOption('prueba-escrita')
  await bloque.locator('[data-hijo-crear]').click()
  const dialogo = p.locator('[data-convertir-familia]')
  await dialogo.waitFor({ timeout: 5000 })
  const cabecera = await dialogo.textContent()
  ok(cabecera.includes(`${notasAntes.length} nota`), 'el diálogo dice cuántas notas tiene la familia', cabecera.slice(0, 120))
  ok(await dialogo.locator('[data-convertir-nombre-hijo]').inputValue() === 'Proba escrita - express repaso', 'propone el nombre actual de la familia para el hijo')
  ok(await dialogo.locator('[data-convertir-renombrar]').isChecked(), 'y renombrar la familia')
  ok(await dialogo.locator('[data-convertir-nombre-familia]').inputValue() === 'Proba escrita', 'al nombre genérico, lo que va antes del guion')
  e = await estado()
  ok(e.instrumentos.filter(i => i.familia_id === famProba.id).length === 0, 'mientras no se acepta, no se ha creado nada')
  await foto('convertir-01-dialogo')

  console.log('\n4. Aceptar: dos hijos, lo antiguo en el primero')
  await dialogo.locator('[data-convertir-aceptar]').click()
  await dialogo.waitFor({ state: 'hidden', timeout: 8000 })
  await bloque.locator('[data-hijo][data-nombre="Prueba escrita - oficial"]').waitFor({ timeout: 8000 })
  await p.waitForTimeout(600)
  e = await estado()
  const hijos = e.instrumentos.filter(i => i.familia_id === famProba.id)
  ok(hijos.length === 2, 'la familia tiene dos hijos', hijos.map(h => h.nombre).join(' | '))
  const express = hijos.find(h => h.nombre === 'Proba escrita - express repaso')
  const oficial = hijos.find(h => h.nombre === 'Prueba escrita - oficial')
  ok(!!express && express.tipo === 'prueba-escrita', 'el convertido se llama como la familia y tiene su tipo')
  ok(!!oficial, 'y el nuevo es el que se iba a añadir')
  ok(e.instrumentos.find(i => i.id === famProba.id)?.nombre === 'Proba escrita', 'la familia pasa a llamarse «Proba escrita»')
  const notasDespues = e.notas
  ok(notasDespues.length === notasAntes.length && notasDespues.every(n => n.instrumento_id === express.id), 'todas las notas llevan ahora el id del convertido, sin duplicarse', `${notasDespues.length}`)
  ok(notasDespues.every(n => n.updated_at > marca), 'y un updated_at nuevo: viajarán en el siguiente sync')
  ok(notasDespues.every(n => notasAntes.some(a => a.id === n.id && a.valor === n.valor)), 'misma fila, mismo id, misma nota')
  ok(e.notas.filter(n => n.instrumento_id === famProba.id).length === 0, 'ninguna nota queda con el id de la familia')
  const filasFamilia = e.filas.filter(f => f.instrumento_id === famProba.id)
  const filasExpress = e.filas.filter(f => f.instrumento_id === express.id)
  ok(filasFamilia.length === filasFamiliaAntes, 'la familia conserva sus filas de la programación', `${filasFamilia.length} de ${filasFamiliaAntes}`)
  ok(filasExpress.length === filasFamiliaAntes && filasExpress.every(f => filasFamilia.some(g => g.unidad_id === f.unidad_id && g.criterio_id === f.criterio_id)), 'y el convertido las tiene copiadas, una por una')
  ok(await bloque.locator('[data-hijo]').count() === 2, 'el gestor lista los dos dentro de la familia')
  await foto('convertir-02-gestor')
  await gestor.getByRole('button', { name: 'Cerrar' }).click()
  await gestor.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(1200)

  console.log('\n5. Por criterio nada cambia; por instrumento hay dos columnas y el 7 está en la primera')
  ok(await p.locator('.celda-btn.cal-7').count() === sietesAntes, 'por criterio siguen las mismas casillas con 7', `${await p.locator('.celda-btn.cal-7').count()} vs ${sietesAntes}`)
  await p.locator('[data-vista="instrumentos"]').click()
  await p.locator('[data-familia-th]').first().waitFor({ timeout: 5000 })
  await p.waitForTimeout(600)
  const grupo = p.locator('[data-familia-th]').filter({ hasText: /Proba escrita/ })
  ok(await grupo.getAttribute('colspan') === '2', 'la proba abarca dos columnas', await grupo.getAttribute('colspan'))
  const nombres = await p.locator('[data-instr-th]').evaluateAll(ths => ths.map(t => t.dataset.nombre))
  const iExpress = nombres.indexOf('Proba escrita - express repaso')
  const iOficial = nombres.indexOf('Prueba escrita - oficial')
  ok(iExpress >= 0 && iOficial === iExpress + 1, 'las columnas son el express y, a su lado, la oficial', nombres.join(' | '))
  const fila = p.locator('tbody tr').first().locator('[data-celda-instr]')
  ok((await fila.nth(iExpress).textContent()).startsWith('7'), 'el 7 está en la columna del express', await fila.nth(iExpress).textContent())
  ok((await fila.nth(iOficial).textContent()).trim() === '·', 'y la oficial está vacía', await fila.nth(iOficial).textContent())
  await foto('convertir-03-dos-columnas')

  console.log('\n6. Seguimiento da lo mismo que antes')
  const seguimientoDespues = await notasSeguimiento()
  ok(seguimientoDespues === seguimientoAntes, 'la nota del área no cambia al convertir', `${seguimientoAntes.slice(0, 40)} → ${seguimientoDespues.slice(0, 40)}`)

  console.log('\n7. Con hijos ya dentro, añadir otro no vuelve a preguntar')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()
  await gestor.waitFor({ timeout: 5000 })
  const bloque2 = gestor.locator(`[data-familia-hijos][data-familia-id="${famProba.id}"]`)
  await bloque2.locator('[data-hijo]').nth(1).waitFor({ timeout: 8000 })
  await bloque2.locator('[data-hijo-nuevo]').click()
  await bloque2.locator('[data-hijo-form] input:not([type="checkbox"])').first().fill('Recuperación')
  await bloque2.locator('[data-hijo-crear]').click()
  await bloque2.locator('[data-hijo][data-nombre="Recuperación"]').waitFor({ timeout: 5000 })
  ok(await p.locator('[data-convertir-familia]').count() === 0, 'sin diálogo: solo se ofrece antes del primer hijo')
  await gestor.getByRole('button', { name: 'Cerrar' }).click()
  await gestor.waitFor({ state: 'hidden', timeout: 5000 })

  console.log('\n8. El caso de Luis: la familia con hijos guarda a su nombre un examen y una nota (de antes de tener hijos)')
  e = await estado()
  const notaModelo = e.notas.find(n => n.instrumento_id === express.id)
  const filaModelo = await p.evaluate(async (id) => {
    const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
    return new Promise((res) => { const q = db.transaction('calificaciones').objectStore('calificaciones').get(id); q.onsuccess = () => res(q.result) })
  }, notaModelo.id)
  const otroAlumno = e.alumnos.find(a => a !== filaModelo.alumno_id)
  const ahora = new Date().toISOString()
  // Y un segundo bloque: una nota de la familia puesta tres días antes, en
  // OTRA unidad. No puede ir al mismo hijo que el examen.
  const haceTresDias = new Date(Date.now() - 3 * 86400000).toISOString()
  const otraUnidad = e.filas.map(f => f.unidad_id).find(u => u !== filaModelo.unidad_id)
  ok(otraUnidad != null, 'hay una segunda unidad en la programación para el segundo bloque')
  await inyectar('calificaciones', [
    { ...filaModelo, id: 9000001, alumno_id: otroAlumno, instrumento_id: famProba.id, valor: 5, fecha: ahora, updated_at: ahora, deleted_at: null },
    { ...filaModelo, id: 9000003, alumno_id: otroAlumno, instrumento_id: famProba.id, unidad_id: otraUnidad, valor: 9, fecha: haceTresDias, updated_at: ahora, deleted_at: null },
  ])
  await inyectar('rubricas', [{
    id: 9000002, instrumento_id: famProba.id, unidad_id: filaModelo.unidad_id, tipo: 'prueba', titulo: 'Test de la familia',
    prueba_json: JSON.stringify({ titulo: 'Test de la familia', tipo: 'test', reparto: 'unica', preguntas: [{ id: 'p1', puntos: 1 }] }),
    niveles_json: '[]', indicadores_json: '[]', generada_ia: 0, created_at: ahora, updated_at: ahora, deleted_at: null,
  }])
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  await p.locator('[data-vista="instrumentos"]').click()
  await p.locator('.tab-unidad').nth(1).click()
  const aviso = p.locator('[data-familias-escondidas]')
  await aviso.waitFor({ timeout: 8000 })
  const textoAviso = await aviso.textContent()
  ok(/«Proba escrita» guarda a su nombre 1 examen, 1 nota/.test(textoAviso), 'la matriz avisa de lo que la familia guarda sin columna EN ESTA UNIDAD (la otra nota es de otra)', textoAviso.slice(0, 100))
  await foto('convertir-04-aviso-escondidos')

  console.log('\n9. Desde el aviso se abre el gestor: un bloque por unidad y día, cada uno con su destino')
  await aviso.locator('[data-familias-escondidas-gestor]').click()
  await gestor.waitFor({ timeout: 5000 })
  const bloque3 = gestor.locator(`[data-familia-hijos][data-familia-id="${famProba.id}"]`)
  const franja = bloque3.locator('[data-familia-escondidos]')
  await franja.waitFor({ timeout: 8000 })
  ok(/1 examen, 2 notas/.test(await franja.textContent()), 'el gestor cuenta todas las unidades: 1 examen, 2 notas')
  const bloques = franja.locator('[data-bloque-escondido]')
  ok(await bloques.count() === 2, 'dos bloques: el examen con su nota (hoy) y la nota de la otra unidad (hace tres días)', String(await bloques.count()))
  const bloqueHoy = franja.locator(`[data-bloque-escondido][data-unidad-id="${filaModelo.unidad_id}"]`)
  const bloqueAntes = franja.locator(`[data-bloque-escondido][data-unidad-id="${otraUnidad}"]`)
  ok(/1 examen, 1 nota/.test(await bloqueHoy.locator('[data-bloque-contenido]').textContent()), 'el bloque de hoy lleva el examen y la nota')
  ok(/^1 nota$/.test((await bloqueAntes.locator('[data-bloque-contenido]').textContent()).trim()), 'el otro, solo la nota')
  const diaAntes = await bloqueAntes.getAttribute('data-dia')
  ok(diaAntes === haceTresDias.slice(0, 10) || diaAntes === new Date(Date.now() - 3 * 86400000).toLocaleDateString('sv'), 'con el día en que se anotó, no el de hoy', diaAntes)
  ok((await bloqueAntes.locator('[data-bloque-fecha]').textContent()).match(/\d{2}:\d{2}/), 'y la hora a la vista')
  ok((await bloqueAntes.locator('[data-bloque-unidad]').textContent()).trim().length > 0, 'nombra la unidad')
  await foto('convertir-05-bloques')

  console.log('\n10. El bloque de hoy va a «Prueba escrita - oficial»; el otro se queda hasta que se decida')
  await bloqueHoy.locator('[data-mover-destino]').selectOption(String(oficial.id))
  await bloqueHoy.locator('[data-mover-aceptar]').click()
  await bloque3.locator('[data-mover-resultado]').waitFor({ timeout: 8000 })
  const resultado = await bloque3.locator('[data-mover-resultado]').textContent()
  ok(/Movido a «Prueba escrita - oficial»: 1 nota, 1 examen/.test(resultado), 'dice qué ha movido y adónde', resultado)
  await p.waitForTimeout(800)
  ok(await franja.locator('[data-bloque-escondido]').count() === 1, 'queda un bloque en la franja: el de la otra unidad')
  e = await estado()
  const notaMovida = e.notas.find(n => n.id === 9000001)
  ok(notaMovida?.instrumento_id === oficial.id && notaMovida.valor === 5, 'la nota lleva ahora el id del hijo, misma fila y mismo valor')
  const examenMovido = e.examenes.find(x => x.id === 9000002)
  ok(examenMovido?.instrumento_id === oficial.id && examenMovido.unidad_id === filaModelo.unidad_id, 'el examen también, con su unidad')
  ok(e.notas.find(n => n.id === 9000003)?.instrumento_id === famProba.id, 'la nota del otro bloque sigue a nombre de la familia: nadie la ha movido')

  console.log('\n11. El otro bloque va a «Recuperación»')
  const recuperacion = e.instrumentos.find(i => i.nombre === 'Recuperación')
  const bloqueRestante = franja.locator('[data-bloque-escondido]').first()
  await bloqueRestante.locator('[data-mover-destino]').selectOption(String(recuperacion.id))
  await bloqueRestante.locator('[data-mover-aceptar]').click()
  await p.waitForTimeout(1200)
  ok(/Movido a «Recuperación»: 1 nota/.test(await bloque3.locator('[data-mover-resultado]').textContent()), 'dice que la nota fue a Recuperación')
  ok(await bloque3.locator('[data-familia-escondidos]').count() === 0, 'y la franja desaparece: ya no queda nada a nombre de la familia')
  e = await estado()
  ok(e.notas.find(n => n.id === 9000003)?.instrumento_id === recuperacion.id, 'la nota del segundo bloque lleva el id de Recuperación')
  ok(e.filas.some(f => f.instrumento_id === recuperacion.id && f.unidad_id === otraUnidad && f.criterio_id === filaModelo.criterio_id), 'y Recuperación cubre ese criterio en esa unidad')
  ok(e.notas.every(n => n.instrumento_id !== famProba.id) && e.examenes.every(x => x.instrumento_id !== famProba.id), 'nada queda con el id de la familia')
  await foto('convertir-06-movido')
  await gestor.getByRole('button', { name: 'Cerrar' }).click()
  await gestor.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(1500)
  ok(await p.locator('[data-familias-escondidas]').count() === 0, 'la matriz ya no avisa')
  const nombres2 = await p.locator('[data-instr-th]').evaluateAll(ths => ths.map(t => t.dataset.nombre))
  const iOficial2 = nombres2.indexOf('Prueba escrita - oficial')
  const filas2 = p.locator('tbody tr')
  const textos = []
  for (let i = 0; i < await filas2.count(); i++) textos.push((await filas2.nth(i).locator('[data-celda-instr]').nth(iOficial2).textContent()).trim())
  ok(textos.some(t => t.startsWith('5')), 'la columna de la oficial enseña el 5 movido', textos.join(' | '))
  const thOficial = p.locator('[data-instr-th]').nth(iOficial2)
  ok(await thOficial.getAttribute('data-con-examen') === 'true', 'y su cabecera sabe que el examen es suyo')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('convertir-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
