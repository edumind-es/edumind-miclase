/**
 * Vaciar y mover una columna del Calificador, SOLO en una unidad, y el gestor
 * diciendo qué se borra y de qué unidad.
 *
 * El caso de Luis: puso toda una prueba del 20 % en la columna «Proba
 * escrita» (la familia del 80 %) de la unidad en curso y no tenía forma de
 * quitarla ni de llevarla a «Táboa de indicadores». Sobre la programación
 * gemela de PROENS: se pegan notas en «Proba escrita» en dos unidades, se
 * vacía la columna en una (las notas quedan como fantasma y «Deshacer» las
 * devuelve), se mueven a «Táboa de indicadores» (solo a los criterios que la
 * Táboa evalúa en esa unidad; el resto se queda y se dice) y se mira en
 * IndexedDB que la otra unidad no se ha tocado. Después, en ⚙ Instrumentos,
 * el recuento por instrumento, el confirm que dice «TODAS las unidades» con
 * cifras, y «Retirar de una unidad», que toca la programación y no las notas.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { navegadorChromium, elegirUnidad, aceptarConfirmaciones, rechazarSiguienteConfirmacion, gestorEnPesosDelArea, irAlAlumnado } from './lib/entorno.mjs'

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
await gestorEnPesosDelArea(p)
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
/** Los confirm se aceptan, pero se guarda lo que decían: tienen que nombrar unidad y cifras. */
const dialogos = []
await aceptarConfirmaciones(p, t => dialogos.push(t))
const ultimoDialogo = () => dialogos[dialogos.length - 1] ?? ''
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })

/** Lo que hay en IndexedDB: instrumentos, unidades, programación y notas vivas por instrumento y unidad. */
const bd = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla, conBorradas = false) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(conBorradas ? tx.result : tx.result.filter(r => !r.deleted_at))
  })
  const [instrumentos, unidades, cis, cals, diario] = await Promise.all([
    leer('instrumentos'), leer('unidades'), leer('criterio_instrumentos'), leer('calificaciones'), leer('diario', true)])
  unidades.sort((a, b) => a.orden - b.orden)
  const proba = instrumentos.find(i => i.tipo === 'prueba-escrita')
  const taboa = instrumentos.find(i => i.tipo !== 'prueba-escrita')
  const criteriosDe = (ins, u) => cis.filter(c => c.unidad_id === u.id && c.instrumento_id === ins?.id).map(c => c.criterio_id).sort()
  // La unidad en la que la táboa evalúa parte de lo que evalúa la prueba
  // (pero no todo): así hay notas que encajan en el destino y notas que no.
  const comparte = (u) => criteriosDe(proba, u).filter(c => criteriosDe(taboa, u).includes(c)).length
  const ud = unidades.find(u => comparte(u) > 0 && comparte(u) < criteriosDe(proba, u).length) ?? unidades[0]
  const otra = unidades.find(u => u.id !== ud.id && criteriosDe(proba, u).length)
  const notas = (ins, u) => cals.filter(c => c.instrumento_id === ins?.id && c.unidad_id === u?.id)
    .map(c => ({ alumno: c.alumno_id, criterio: c.criterio_id, valor: c.valor ?? null, anterior: c.valor_anterior ?? null, motivo: c.anterior_motivo ?? null }))
  return {
    proba: proba?.nombre, taboa: taboa?.nombre,
    ud: { id: ud.id, nombre: ud.nombre, pestana: unidades.indexOf(ud) + 1 },
    otra: otra ? { id: otra.id, nombre: otra.nombre, pestana: unidades.indexOf(otra) + 1 } : null,
    criteriosProba: criteriosDe(proba, ud),
    criteriosTaboa: criteriosDe(taboa, ud),
    notasProba: notas(proba, ud),
    notasTaboa: notas(taboa, ud),
    notasProbaOtra: notas(proba, otra),
    diarioVivo: diario.filter(r => !r.deleted_at).length,
    diarioTotal: diario.length,
  }
})

const columna = nombre => p.locator(`[data-instr-th][data-nombre="${nombre}"]`)
const desplegarCabeceras = async () => {
  const t = p.locator('[data-cabeceras-toggle]')
  if ((await t.getAttribute('aria-pressed')) !== 'true') await t.click()
}
/** Pega una columna de notas (por orden de lista) en un instrumento. */
const pegar = async (nombre, texto) => {
  await desplegarCabeceras()
  await columna(nombre).locator('[data-pegar-abrir]').click()
  const dialogo = p.getByRole('dialog', { name: /^Pegar notas en/ })
  await dialogo.waitFor({ timeout: 5000 })
  await dialogo.locator('[data-pegar-texto]').fill(texto)
  await dialogo.locator('[data-pegar-fila]').first().waitFor({ timeout: 5000 })
  await dialogo.locator('[data-pegar-guardar]').click()
  await dialogo.waitFor({ state: 'hidden', timeout: 8000 })
  await p.waitForTimeout(600)
}
const irAUnidad = async (pestana) => {
  await elegirUnidad(p, pestana)
  await p.locator('[data-instr-th]').first().waitFor({ timeout: 5000 })
  await p.waitForTimeout(600)
}

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
  // En PROENS cada criterio va a un solo instrumento, así que la táboa nunca
  // evaluaría nada de lo que la prueba evalúa y no habría adónde mover. Como
  // haría Luis: en la primera unidad, la táboa evalúa también el primer
  // criterio de la prueba (CE2.1); el otro (CE2.2) sigue solo con la prueba.
  await p.getByRole('button', { name: /▶ \d+ criterios/ }).first().click()
  await p.waitForTimeout(400)
  const botonTaboa = p.getByTitle('Evaluar este criterio con «Táboa de indicadores»')
  await p.locator('div').filter({ has: p.locator('span', { hasText: /^CE2\.1$/ }) }).filter({ has: botonTaboa }).last()
    .getByTitle('Evaluar este criterio con «Táboa de indicadores»').click()
  await p.waitForTimeout(600)
  await p.getByRole('button', { name: 'Cerrar' }).click()
  await irAlAlumnado(p)
  await p.waitForTimeout(500)
  await p.getByRole('button', { name: /Importar lista/ }).click()
  await p.getByPlaceholder('Pega aquí la lista de alumnado…').fill('Abad Ríos, Ana\nBello Souto, Bruno\nCasal Vidal, Carla')
  await p.getByRole('button', { name: /Analizar/ }).click()
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: /Confirmar e importar/ }).click()
  await p.getByText(/3 alumnos creados/).waitFor({ timeout: 8000 })
  await p.getByRole('button', { name: 'Cerrar' }).click()

  console.log('\n2. Notas en «Proba escrita» en dos unidades')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await p.locator('[data-presentacion-entendido]').click({ timeout: 5000 }).catch(() => {})
  await p.locator('[data-vista="instrumentos"]').click().catch(() => {})
  const inicio = await bd()
  ok(inicio.proba && inicio.taboa, 'hay prueba escrita y táboa de indicadores', `${inicio.proba} · ${inicio.taboa}`)
  ok(inicio.criteriosProba.some(c => inicio.criteriosTaboa.includes(c)) && inicio.criteriosProba.some(c => !inicio.criteriosTaboa.includes(c)),
    `en «${inicio.ud.nombre}» la táboa evalúa parte de lo que evalúa la prueba`,
    `prueba: ${inicio.criteriosProba.join(', ')} · táboa: ${inicio.criteriosTaboa.join(', ')}`)
  await irAUnidad(inicio.ud.pestana)
  await pegar(inicio.proba, '7,5\n5\n9')
  if (inicio.otra) {
    await irAUnidad(inicio.otra.pestana)
    await pegar(inicio.proba, '6\n6\n6')
    await irAUnidad(inicio.ud.pestana)
  }
  let d = await bd()
  const esperadas = 3 * inicio.criteriosProba.length
  ok(d.notasProba.filter(n => n.valor != null).length === esperadas, `la prueba tiene ${esperadas} notas en la unidad (3 alumnos × ${inicio.criteriosProba.length} criterios)`, `${d.notasProba.length}`)
  const otrasAntes = d.notasProbaOtra.length
  ok(!inicio.otra || otrasAntes > 0, 'y notas en la otra unidad', `${otrasAntes}`)
  await foto('columna-01-notas')

  console.log('\n2b. Asociar y quitar un criterio desde la propia cabecera')
  await desplegarCabeceras()
  const anadir = columna(inicio.proba).locator('[data-criterio-anadir]')
  ok(await anadir.count() === 1, 'la cabecera ofrece «+ criterio»')
  await anadir.selectOption('CE3.1')
  await columna(inicio.proba).locator('[data-criterio-chip="CE3.1"]').waitFor({ timeout: 8000 })
  d = await bd()
  ok(d.criteriosProba.includes('CE3.1'), 'la prueba evalúa también CE3.1 en la unidad, en la programación', d.criteriosProba.join(', '))
  ok((await p.locator('[data-columna-aviso]').textContent()).includes('CE3.1'), 'y la pantalla lo dice')
  ok((await columna(inicio.proba).getAttribute('data-criterios')) === 'CE2.1 CE2.2 CE3.1', 'y la cabecera publica sus criterios en data-criterios')
  await desplegarCabeceras()
  await columna(inicio.proba).locator('[data-criterio-chip="CE3.1"] [data-criterio-quitar]').click()
  await columna(inicio.proba).locator('[data-criterio-chip="CE3.1"]').waitFor({ state: 'hidden', timeout: 8000 })
  ok(ultimoDialogo().includes(inicio.ud.nombre) && ultimoDialogo().includes('se conservan'), 'el confirm nombra la unidad y dice que las notas se conservan', ultimoDialogo().split('\n')[0])
  d = await bd()
  ok(!d.criteriosProba.includes('CE3.1') && d.notasProba.filter(n => n.valor != null).length === esperadas, 'quitar el criterio no toca las notas')
  await irAUnidad(inicio.ud.pestana)

  console.log('\n3. Vaciar la columna: solo esta unidad, y las notas quedan como fantasma')
  await desplegarCabeceras()
  ok(await columna(inicio.proba).locator('[data-vaciar-columna]').isVisible() && await columna(inicio.proba).locator('[data-mover-columna]').isVisible(),
    'la cabecera desplegada ofrece «Vaciar columna» y «Mover a otro instrumento»')
  await columna(inicio.proba).locator('[data-vaciar-columna]').click()
  // El aviso del paso anterior (quitar un criterio) sigue en pantalla: hay
  // que esperar al del vaciado, o se lee el confirm de antes.
  await p.locator('[data-columna-aviso]', { hasText: 'Vaciada' }).waitFor({ timeout: 8000 })
  const confirmVaciar = ultimoDialogo()
  ok(confirmVaciar.includes(inicio.ud.nombre) && confirmVaciar.includes(inicio.proba) && confirmVaciar.includes(`${esperadas} notas`),
    'el confirm nombra la unidad, el instrumento y cuántas notas', confirmVaciar.split('\n')[0])
  d = await bd()
  ok(d.notasProba.every(n => n.valor == null), 'ninguna nota cuenta ya en la columna')
  ok(d.notasProba.filter(n => n.anterior != null).length === esperadas && d.notasProba.every(n => n.anterior == null || /vaciada/i.test(n.motivo)),
    'todas siguen como nota anterior, con el motivo', JSON.stringify(d.notasProba[0]))
  ok(d.notasProbaOtra.length === otrasAntes && d.notasProbaOtra.every(n => n.valor != null), 'la otra unidad no se ha tocado')
  ok((await p.locator('[data-columna-aviso]').textContent()).includes('Vaciada'), 'y la pantalla lo dice')
  await foto('columna-02-vaciada')

  console.log('\n4. Deshacer devuelve las notas')
  await p.locator('[data-vaciado-deshacer]').click()
  await p.waitForTimeout(800)
  d = await bd()
  ok(d.notasProba.filter(n => n.valor != null).length === esperadas && d.notasProba.every(n => n.anterior == null), 'las notas vuelven a contar y sin fantasma')
  ok(await p.locator('[data-vaciado-deshacer]').count() === 0, 'el botón de deshacer desaparece')

  console.log('\n5. Mover a «Táboa de indicadores»: solo a los criterios que evalúa aquí')
  await desplegarCabeceras()
  await columna(inicio.proba).locator('[data-mover-columna]').click()
  const dialogo = p.locator('[data-mover-columna-dialogo]')
  await dialogo.waitFor({ timeout: 5000 })
  await dialogo.locator('[data-mover-columna-destino]').selectOption({ label: inicio.taboa })
  await dialogo.locator('[data-mover-columna-previa]').waitFor({ timeout: 5000 })
  const previa = await dialogo.locator('[data-mover-columna-previa]').textContent()
  const encajan = inicio.criteriosProba.filter(c => inicio.criteriosTaboa.includes(c))
  const noEncajan = inicio.criteriosProba.filter(c => !inicio.criteriosTaboa.includes(c))
  ok(previa.includes(`${3 * encajan.length} notas`), `la vista previa dice que van ${3 * encajan.length} notas`, previa.slice(0, 120))
  ok(previa.includes(`${3 * noEncajan.length} notas`) && noEncajan.every(c => previa.includes(c)), 'y cuáles se quedan, por criterio', noEncajan.join(', '))
  await foto('columna-03-mover')
  await dialogo.locator('[data-mover-columna-aceptar]').click()
  await dialogo.waitFor({ state: 'hidden', timeout: 8000 })
  await p.waitForTimeout(600)
  ok(ultimoDialogo().includes(inicio.ud.nombre) && ultimoDialogo().includes(inicio.taboa), 'el confirm nombra la unidad y el destino', ultimoDialogo().split('\n')[0])
  d = await bd()
  ok(d.notasTaboa.filter(n => n.valor != null).length === 3 * encajan.length && d.notasTaboa.every(n => encajan.includes(n.criterio)),
    'la táboa tiene las notas movidas, en sus criterios', `${d.notasTaboa.length}`)
  ok(d.notasProba.filter(n => n.valor != null).length === 3 * noEncajan.length && d.notasProba.filter(n => n.valor != null).every(n => noEncajan.includes(n.criterio)),
    'la prueba se queda solo con las que no encajaban', `${d.notasProba.filter(n => n.valor != null).length}`)
  ok(d.notasProbaOtra.length === otrasAntes, 'la otra unidad sigue igual')
  const avisoMover = await p.locator('[data-columna-aviso]').textContent()
  ok(avisoMover.includes('Movidas') && avisoMover.includes(inicio.taboa) && (noEncajan.length === 0 || avisoMover.includes('Se quedan')), 'la pantalla dice qué se ha movido y qué se queda', avisoMover)
  const celdaTaboa = p.locator('tbody tr').first().locator('[data-celda-instr]').nth(await p.locator('[data-instr-th]').evaluateAll((ths, n) => ths.findIndex(t => t.dataset.nombre === n), inicio.taboa))
  ok((await celdaTaboa.textContent()).startsWith('7.5'), 'la casilla de la táboa enseña la nota movida', await celdaTaboa.textContent())
  await foto('columna-04-movida')

  console.log('\n6. El gestor dice dónde se usa cada instrumento y qué borra el «×»')
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()
  const gestor = p.getByRole('dialog', { name: 'Gestionar instrumentos de evaluación' })
  await gestor.waitFor({ timeout: 5000 })
  await gestor.locator('[data-uso-instrumento]').first().waitFor({ timeout: 5000 })
  const usos = await gestor.locator('[data-uso-instrumento]').allTextContents()
  ok(usos.length === 2 && usos.every(t => /\d+ unidades? · \d+ notas?/.test(t)), 'cada familia dice en cuántas unidades se usa y cuántas notas tiene', usos.map(t => t.trim().slice(0, 60)).join(' | '))
  await foto('columna-05-gestor')
  // Retirar de UNA unidad: la programación de esa unidad deja de usarlo; las notas siguen.
  const bloqueProba = gestor.locator(`[data-familia-bloque][data-nombre="${inicio.proba}"]`)
  await bloqueProba.locator('[data-retirar-unidad]').click()
  await bloqueProba.locator('[data-retirar-unidad-select]').selectOption(String(inicio.ud.id))
  await bloqueProba.locator('[data-retirar-unidad-aceptar]').click()
  await gestor.locator('[data-uso-aviso]').waitFor({ timeout: 5000 })
  ok(ultimoDialogo().includes(`solo de «${inicio.ud.nombre}»`), 'el confirm de retirar nombra la unidad', ultimoDialogo().split('\n')[0])
  d = await bd()
  ok(d.criteriosProba.length === 0, 'la prueba ya no evalúa nada en esa unidad')
  ok(d.notasProba.length > 0 && d.notasProbaOtra.length === otrasAntes, 'pero las notas siguen guardadas, en esa unidad y en la otra', `${d.notasProba.length}`)
  // Borrar del todo: el confirm dice TODAS las unidades y cifras. Se cancela: nada cambia.
  const antesDeBorrar = dialogos.length
  await rechazarSiguienteConfirmacion(p)
  await bloqueProba.getByRole('button', { name: 'Eliminar' }).click()
  await p.waitForTimeout(500)
  const textoBorrar = dialogos.slice(antesDeBorrar).join('\n')
  ok(textoBorrar.includes('TODAS las unidades') && /\d+ unidades · \d+ notas/.test(textoBorrar) && textoBorrar.includes('Retirar de una unidad'),
    'el confirm de borrar dice que es de todas las unidades, con cifras, y ofrece la alternativa', textoBorrar.split('\n')[2])
  d = await bd()
  ok(d.proba === inicio.proba, 'cancelar no borra nada')

  console.log('\n7. Las notas que cuentan sin columna se dicen, y calificar en otro trimestre se avisa')
  // Tras retirar la prueba de la unidad, sus notas siguen contando sin columna.
  await gestor.getByRole('button', { name: 'Cerrar' }).first().click()
  await gestor.waitFor({ state: 'hidden', timeout: 5000 })
  const conmutador = p.locator('[data-avisos-toggle]')
  await conmutador.waitFor({ timeout: 6000 })
  if (await conmutador.getAttribute('aria-expanded') !== 'true') await conmutador.click()
  const sinColumna = p.locator('[data-notas-sin-columna]')
  ok(await sinColumna.waitFor({ timeout: 6000 }).then(() => true, () => false), 'el Calificador avisa de las notas que cuentan sin columna en la unidad')
  const textoSinColumna = await sinColumna.textContent().catch(() => '')
  ok(textoSinColumna.includes(`«${inicio.proba}»`) && /\d+ notas? de «/.test(textoSinColumna), 'dice de qué instrumento son y cuántas', textoSinColumna.slice(0, 200))
  // Dos salidas, las dos pedidas. Primera: la programación vuelve a asignar los criterios.
  const conNota = (lista) => lista.filter(n => n.valor != null).length
  const notasAntes = conNota((await bd()).notasProba)
  await sinColumna.locator('[data-sin-columna-asignar]').first().click()
  await p.locator('[data-columna-aviso]').filter({ hasText: /vuelve a evaluar/ }).waitFor({ timeout: 6000 }).catch(() => {})
  d = await bd()
  ok(d.criteriosProba.length > 0 && conNota(d.notasProba) === notasAntes, '«Volver a asignar» devuelve los criterios al instrumento y no toca las notas', `${d.criteriosProba.join(',')} · ${conNota(d.notasProba)}/${notasAntes}`)
  ok(await columna(inicio.proba).waitFor({ timeout: 6000 }).then(() => true, () => false) && await sinColumna.count() === 0, 'las notas vuelven a tener columna y el aviso se va')
  // Segunda: se retira otra vez y se pide que dejen de contar.
  await p.evaluate(async (unidad) => {
    const q = await import('/src/db/queries.ts')
    const { db } = await import('/src/db/localDb.ts')
    const proba = (await db.instrumentos.toArray()).find(i => !i.deleted_at && i.tipo === 'prueba-escrita')
    await q.retirarInstrumentoDeUnidad(proba.id, unidad)
  }, inicio.ud.id)
  // Cambiar de trimestre y volver recarga la matriz.
  const barraT = p.getByLabel('Trimestre')
  const tAhora = await barraT.inputValue()
  await barraT.selectOption(tAhora === '1' ? '2' : '1')
  await p.waitForTimeout(400)
  await barraT.selectOption(tAhora)
  await conmutador.waitFor({ timeout: 6000 })
  if (await conmutador.getAttribute('aria-expanded') !== 'true') await conmutador.click()
  await sinColumna.waitFor({ timeout: 6000 }).catch(() => {})
  const antesDeQuitar = dialogos.length
  await sinColumna.locator('[data-sin-columna-quitar]').first().click()
  await p.locator('[data-columna-aviso]').filter({ hasText: /ya no cuenta/ }).waitFor({ timeout: 6000 }).catch(() => {})
  const preguntaQuitar = dialogos.slice(antesDeQuitar).join('\n')
  ok(preguntaQuitar.includes(`«${inicio.ud.nombre}»`) && /No se borran/.test(preguntaQuitar), 'antes de quitar pregunta, nombra la unidad y dice que no se borran', preguntaQuitar.split('\n')[0])
  d = await bd()
  ok(conNota(d.notasProba) === 0 && d.notasProba.filter(n => n.anterior != null && /Sin columna/.test(n.motivo ?? '')).length === notasAntes,
    '«Que dejen de contar» las deja como nota anterior, sin contar', `${conNota(d.notasProba)} con nota · ${d.notasProba.filter(n => n.anterior != null).length} fantasmas de ${notasAntes}`)
  ok(d.notasProbaOtra.length === otrasAntes && conNota(d.notasProbaOtra) > 0, 'y la otra unidad no se toca')
  ok(await sinColumna.count() === 0, 'el aviso desaparece')
  // La barra en otro trimestre que el de la unidad: se dice a la vista y se ofrece volver.
  const trimestreUnidad = await p.evaluate(async (id) => {
    const { db } = await import('/src/db/localDb.ts')
    return (await db.unidades.get(id))?.trimestre ?? null
  }, inicio.ud.id)
  const barra = p.getByLabel('Trimestre')
  const otroAviso = p.locator('[data-unidad-otro-trimestre]')
  if (trimestreUnidad != null) {
    await barra.selectOption(String(trimestreUnidad))
    await p.waitForTimeout(400)
    ok(await otroAviso.count() === 0, 'con la barra en el trimestre de la unidad no hay aviso')
    await barra.selectOption(String(trimestreUnidad === 1 ? 2 : 1))
    ok(await otroAviso.waitFor({ timeout: 5000 }).then(() => true, () => false), 'con la barra en otro trimestre, avisa de dónde se guardará lo que se califique')
    await otroAviso.locator('[data-ir-al-trimestre]').click()
    await p.waitForTimeout(400)
    ok(await otroAviso.count() === 0 && await barra.inputValue() === String(trimestreUnidad), 'y el botón devuelve la barra al trimestre de la unidad')
  } else {
    ok(await otroAviso.count() === 0, 'una unidad sin trimestre no avisa')
  }

  ok(erroresConsola.length === 0, 'sin errores de JavaScript', erroresConsola.join(' | '))
} catch (e) {
  fallos++
  console.log('  ✗ EXCEPCIÓN:', e.message)
  await foto('columna-error').catch(() => {})
} finally {
  await navegador.close()
}
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
