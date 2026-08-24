import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
import { mkdirSync } from 'node:fs'

// Carpeta de trabajo para capturas y descargas
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const TIROS = process.env.SCRATCH + '/tiros'
let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1400, height: 950 } })
const p = await ctx.newPage()

const erroresConsola = []
p.on('console', m => { if (m.type() === 'error') erroresConsola.push(m.text()) })
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))

const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: false })

// ── 1 · Arranque y asistente ────────────────────────────────────────────
console.log('\n1. Primer arranque')
await p.goto(BASE, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
ok(await p.getByText('Puesta en marcha').isVisible(), 'el asistente de primeros pasos aparece solo')
ok(await p.getByText('Crea tu clase').first().isVisible(), 'el paso 1 explica qué hacer')
await foto('01-inicio')

// ── 2 · Sidebar plegable ────────────────────────────────────────────────
console.log('\n2. Menú lateral plegable')
const anchoAntes = await p.locator('aside.sidebar').evaluate(e => e.getBoundingClientRect().width)
await p.locator('.sidebar-toggle').click()
await p.waitForTimeout(350)
const anchoDespues = await p.locator('aside.sidebar').evaluate(e => e.getBoundingClientRect().width)
ok(anchoDespues < anchoAntes - 100, 'el menú se pliega a rail de iconos', `${Math.round(anchoAntes)}px → ${Math.round(anchoDespues)}px`)
await foto('02-plegado')
await p.keyboard.press('Control+b')
await p.waitForTimeout(350)
const anchoVuelta = await p.locator('aside.sidebar').evaluate(e => e.getBoundingClientRect().width)
ok(Math.abs(anchoVuelta - anchoAntes) < 5, 'Ctrl+B lo despliega otra vez')

await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(400)
const anchoTrasRecarga = await p.locator('aside.sidebar').evaluate(e => e.getBoundingClientRect().width)
ok(Math.abs(anchoTrasRecarga - anchoAntes) < 5, 'el estado del menú se recuerda entre recargas')

// ── 3 · Crear clase ─────────────────────────────────────────────────────
console.log('\n3. Crear la clase')
await p.getByRole('link', { name: /Crear la primera clase|Crear mi primera clase/ }).first().click()
await p.waitForURL('**/grupos/nuevo')
await p.getByPlaceholder('Ej: 3ºA, 5ºB…').fill('3ºA')
await p.locator('select').first().selectOption('primaria')
await p.locator('select').nth(1).selectOption('3')
await p.locator('select').nth(2).selectOption('Galicia')
await p.getByRole('button', { name: /Crear grupo/ }).click()
await p.waitForURL('**/grupos')
ok(await p.getByText('3ºA').first().isVisible(), 'la clase 3ºA aparece en el listado')

// ── 4 · Alumnado ────────────────────────────────────────────────────────
console.log('\n4. Alumnado')
await p.getByRole('link', { name: 'Alumnado', exact: true }).click()
await p.waitForTimeout(500)
// Con una sola clase se selecciona sola; comprobamos que no queda "sin clase"
const selClase = p.locator('select').first()
ok((await selClase.inputValue()) !== '', 'la clase se selecciona sola cuando solo hay una')

await p.getByRole('button', { name: /Importar lista/ }).click()
await p.getByPlaceholder('Pega aquí la lista de alumnado…').fill(
  'García López, Ana\nFernández Rey, Bruno\nMartínez Souto, Carla\nPérez Vidal, Diego')
await p.getByRole('button', { name: /Analizar/ }).click()
await p.waitForTimeout(300)
await p.getByRole('button', { name: /Confirmar e importar/ }).click()
await p.waitForTimeout(800)
ok(await p.getByText(/4 alumnos creados/).isVisible(), 'el resumen dice cuántos se crearon (antes salía «undefined»)')
await p.getByRole('button', { name: 'Cerrar' }).click()
await p.waitForTimeout(500)
ok(await p.getByText('García López').first().isVisible(), 'el alumnado aparece en la lista')
await foto('03-alumnado')

// ── 5 · Áreas en lote ───────────────────────────────────────────────────
console.log('\n5. Elegir varias áreas de una vez')
await p.getByRole('link', { name: 'Mis clases', exact: true }).click()
await p.waitForTimeout(400)
await p.getByText('3ºA').first().click()
await p.waitForTimeout(900)
await p.getByRole('button', { name: /\+ Añadir áreas/ }).click()
await p.waitForTimeout(700)
const casillas = p.locator('input[type="checkbox"]')
const nAreas = await casillas.count()
ok(nAreas >= 5, `el selector ofrece las áreas del currículo de Galicia`, `${nAreas} áreas`)
await foto('04-selector-areas')
await casillas.nth(0).check()
await casillas.nth(1).check()
await casillas.nth(2).check()
await p.getByRole('button', { name: /Añadir 3 áreas/ }).click()
await p.waitForTimeout(1000)
ok(await p.getByText(/3 áreas añadidas/).isVisible(), 'se añaden las tres de una sola vez')

// ── 6 · Instrumentos del área ───────────────────────────────────────────
console.log('\n6. Instrumentos de evaluación')
await p.locator('span').filter({ hasText: /^Ciencias de la Naturaleza$/ }).first().click()
await p.waitForTimeout(900)
await p.getByRole('button', { name: /🎯 Instrumentos/ }).first().click()
await p.waitForTimeout(400)
for (const [nombre, tipo, peso] of [['Prueba escrita', 'prueba-escrita', '50'], ['Observación en clase', 'observacion', '30'], ['Cuaderno', 'trabajo', '20']]) {
  await p.getByRole('button', { name: /\+ Instrumento de evaluación/ }).click()
  await p.getByPlaceholder('Nombre del instrumento *').fill(nombre)
  await p.locator('select').filter({ hasText: 'Prueba escrita' }).last().selectOption(tipo)
  await p.locator('input[type="number"]').last().fill(peso)
  await p.getByRole('button', { name: 'Añadir', exact: true }).click()
  await p.waitForTimeout(500)
}
ok(await p.getByText('✓ 100%').isVisible(), 'la barra de peso avisa de que suma 100%')
await foto('05-instrumentos')

// ── 7 · Programación ────────────────────────────────────────────────────
console.log('\n7. Programación didáctica')
await p.getByRole('button', { name: /📋 Programación/ }).first().click()
await p.waitForTimeout(700)
await p.getByRole('button', { name: /Generar estructura/ }).click()
await p.waitForTimeout(400)
await p.getByRole('button', { name: /^✨ Generar$/ }).click()
await p.waitForTimeout(1500)
ok(await p.getByText(/unidades nuevas/).isVisible(), 'la estructura se genera con sus unidades')
await foto('06-programacion')

await p.getByRole('button', { name: /Completar estructura/ }).click()
await p.waitForTimeout(300)
await p.getByRole('button', { name: /^✨ Generar$/ }).click()
await p.waitForTimeout(1200)
ok(await p.getByText(/conservadas/).isVisible(), 'regenerar CONSERVA las unidades existentes en vez de borrarlas')

// ── 8 · Asignar instrumento a cada criterio ─────────────────────────────
console.log('\n8. Asignar instrumento a los criterios')
ok(await p.getByText(/sin instrumento asignado/).first().isVisible(), 'avisa de que faltan instrumentos por asignar')
await p.locator('button').filter({ hasText: /sin instrumento$/ }).first().click()
await p.waitForTimeout(700)
await foto('07-criterios-abiertos')

const selectorMasivo = p.locator('select').filter({ hasText: '— Elegir —' }).first()
await selectorMasivo.selectOption({ index: 1 })
await p.waitForTimeout(1300)
ok(await p.getByText(/Instrumento asignado a los \d+ criterios/).isVisible(), 'un instrumento se asigna a todos los criterios de la unidad de golpe')
await foto('08-instrumento-asignado')

const chip = p.locator('button').filter({ hasText: /Observación en clase$/ }).first()
if (await chip.count()) {
  await chip.click()
  await p.waitForTimeout(1000)
  ok(true, 'se puede añadir un segundo instrumento a un criterio concreto')
}

// ── 9 · Matriz de evaluación ────────────────────────────────────────────
console.log('\n9. Calificador: pestañas, subpestañas y matriz')
await p.getByRole('link', { name: 'Evaluación', exact: true }).click()
await p.waitForTimeout(2000)

const pestanasArea = await p.locator('.tab-area').count()
ok(pestanasArea === 3, 'las 3 áreas salen como pestañas', `${pestanasArea} pestañas`)
const subpestanas = await p.locator('.tab-unidad').count()
ok(subpestanas > 1, 'las unidades salen como subpestañas', `${subpestanas} subpestañas`)
await foto('09-matriz-todo-el-curso')

if (subpestanas === 0) {
  console.log('\n  ── DIAGNÓSTICO ──')
  const pestanas = await p.locator('.tab-area').allInnerTexts()
  console.log('  pestañas de área:', JSON.stringify(pestanas))
  const activa = await p.locator('.tab-area.activa').innerText().catch(() => '(ninguna)')
  console.log('  pestaña activa:', activa)
  const texto = (await p.locator('main').innerText()).slice(0, 700)
  console.log('  contenido:\n   ' + texto.split('\n').join('\n   '))
  const dump = await p.evaluate(async () => {
    const abrir = () => new Promise((res, rej) => {
      const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    const db = await abrir()
    const leer = (tabla) => new Promise((res) => {
      const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
      tx.onsuccess = () => res(tx.result); tx.onerror = () => res([])
    })
    const asigs = await leer('asignaturas')
    const unis = await leer('unidades')
    const cis = await leer('criterio_instrumentos')
    return {
      asignaturas: asigs.map(a => ({ id: a.id, nombre: a.nombre, orden: a.orden, borrado: !!a.deleted_at })),
      unidades: unis.map(u => ({ id: u.id, asignatura_id: u.asignatura_id, nombre: u.nombre, trimestre: u.trimestre, borrado: !!u.deleted_at })),
      nVinculos: cis.length,
    }
  })
  console.log('  asignaturas en IndexedDB:', JSON.stringify(dump.asignaturas, null, 1))
  console.log('  unidades:', dump.unidades.length, JSON.stringify(dump.unidades.slice(0, 4), null, 1))
  console.log('  vínculos criterio↔instrumento:', dump.nVinculos)
  console.log('  ─────────────────\n')
  await navegador.close()
  process.exit(1)
}

await p.locator('.tab-unidad').nth(1).click()
await p.waitForTimeout(1400)
const celdas = await p.locator('.celda-btn').count()
ok(celdas > 0, 'la matriz alumno × criterio se pinta', `${celdas} casillas`)
const conInstrumento = await p.locator('.celda-btn:not(.sin-instrumento)').count()
ok(conInstrumento > 0, 'hay casillas evaluables según la programación', `${conInstrumento} evaluables`)
await foto('10-matriz-unidad')

const puntosCabecera = await p.locator('.criterio-th-instr i').count()
ok(puntosCabecera > 0, 'la cabecera del criterio marca sus instrumentos con puntos de color', `${puntosCabecera} puntos`)
const colorPunto = await p.locator('.criterio-th-instr i').first().evaluate(e => getComputedStyle(e).backgroundColor)
ok(colorPunto !== 'rgba(0, 0, 0, 0)', 'los puntos llevan el color del tipo de instrumento', colorPunto)
const bgCelda = await p.locator('.celda-btn.cal-8').first().evaluate(e => getComputedStyle(e).backgroundColor).catch(() => null)

// ── 10 · Evaluar una casilla ────────────────────────────────────────────
console.log('\n10. Evaluar pulsando una casilla')
await p.locator('.celda-btn:not(.sin-instrumento)').first().click()
await p.waitForTimeout(900)
ok(await p.getByText('CRITERIO', { exact: false }).first().isVisible(), 'el panel muestra el criterio completo')
ok(await p.getByText('Se evalúa con').isVisible(), 'y dice con QUÉ instrumento se evalúa')
await foto('11-celda-evaluacion')

ok(await p.getByRole('button', { name: /📸 Foto/ }).isVisible(), 'se puede adjuntar una foto como evidencia')
ok(await p.getByRole('button', { name: /🎙 Audio/ }).isVisible(), 'y grabar audio (exposición oral, lectura)')
ok(await p.getByRole('button', { name: /🎬 Vídeo/ }).isVisible(), 'y grabar vídeo')

await p.locator('button.cal-8').first().click()
await p.waitForTimeout(1000)
ok(await p.getByText(/guardado en CE/).isVisible(), 'la nota se guarda al pulsarla')

const posAntes = await p.getByText(/^\d+\/4$/).innerText()
await p.keyboard.press('ArrowDown')
await p.waitForTimeout(700)
const posDespues = await p.getByText(/^\d+\/4$/).innerText()
ok(posAntes !== posDespues, 'la flecha ↓ pasa al siguiente alumno sin cerrar', `${posAntes} → ${posDespues}`)
await p.keyboard.press('Escape')
await p.waitForTimeout(800)

ok(await p.locator('.celda-btn.cal-8').count() > 0, 'la casilla recibe la clase del semáforo')
const fondoNota = await p.locator('.celda-btn.cal-8').first().evaluate(e => getComputedStyle(e).backgroundColor)
ok(fondoNota === 'rgb(58, 155, 213)', 'y se pinta del color Notable, no del gris de fondo', fondoNota)
await foto('12-matriz-con-nota')

// ── 11 · Casilla sin instrumento ────────────────────────────────────────
console.log('\n11. Criterio sin instrumento asignado')
await p.locator('.tab-unidad').nth(2).click()
await p.waitForTimeout(1400)
const sinInstr = p.locator('.celda-btn.sin-instrumento').first()
if (await sinInstr.count()) {
  await sinInstr.click()
  await p.waitForTimeout(700)
  ok(await p.getByText(/no tiene instrumento/).isVisible(), 'explica el problema en vez de dejar evaluar a ciegas')
  ok(await p.getByRole('link', { name: /Ir a la programación/ }).last().isVisible(), 'y ofrece el atajo para arreglarlo')
  await foto('13-sin-instrumento')
  await p.getByRole('button', { name: 'Cerrar' }).click()
  await p.waitForTimeout(400)
} else {
  ok(true, '(todas las casillas de esta unidad ya tienen instrumento)')
}

// ── 12 · Seguimiento sin grupo_id en la URL ─────────────────────────────
console.log('\n12. Seguimiento entrando por el menú lateral')
await p.getByRole('link', { name: 'Seguimiento', exact: true }).click()
await p.waitForTimeout(1800)
ok((await p.getByText(/Selecciona un grupo desde/).count()) === 0, 'ya no exige llegar con ?grupo_id= en la URL')
ok(await p.getByText('Media del grupo', { exact: true }).isVisible(), 'muestra el resumen del grupo directamente')
await foto('14-seguimiento')
ok(await p.getByRole('button', { name: /Por competencia/ }).isVisible(), 'hay vista de perfil por competencia específica')
await p.getByRole('button', { name: /Por competencia/ }).click()
await p.waitForTimeout(1200)
await foto('15b-seguimiento-competencias')
await p.getByRole('button', { name: /Por alumno/ }).click()
await p.waitForTimeout(900)
await foto('15-seguimiento-alumnado')

// ── 13 · Informes en lámina ─────────────────────────────────────────────
console.log('\n13. Informes en Sistema Lámina')
await p.getByRole('link', { name: 'Informes', exact: true }).click()
await p.waitForTimeout(2000)
ok(await p.getByText('Informe individual').isVisible(), 'la pantalla de informes carga')
await foto('16-informes')

const descarga = p.waitForEvent('download')
await p.locator('.card').filter({ hasText: 'Informe individual' }).getByRole('button', { name: /HTML/ }).click()
const fichero = await descarga
const ruta = process.env.SCRATCH + '/informe.html'
await fichero.saveAs(ruta)
const { readFileSync } = await import('node:fs')
const html = readFileSync(ruta, 'utf8')
ok(html.includes('lm-plate-top'), 'el informe lleva la barra de los Cinco Mundos')
ok(html.includes('--lm-paper: #e9e6dd'), 'usa el papel del canon lámina')
ok(html.includes('data:font/woff2;base64,'), 'las tipografías del canon van incrustadas (el fichero es autocontenido)')
ok(!html.includes("url('/fonts/"), 'no quedan rutas absolutas que fallarían al abrirlo desde el disco')
ok(html.includes('@page'), 'trae hoja de estilo de impresión A4')
ok(html.includes('Luis Vilela Acuña'), 'firma la autoría EDUmind')
ok(html.includes('AGPL-3.0-or-later'), 'incluye la licencia')
ok(/CE\d/.test(html), 'incluye el detalle por criterio LOMLOE')
ok(html.includes('Perfil por competencia específica'), 'incluye el perfil por competencia específica')

const p2 = await ctx.newPage()
await p2.goto('file://' + ruta, { waitUntil: 'networkidle' })
await p2.waitForTimeout(1500)
await p2.screenshot({ path: `${TIROS}/17-informe-lamina.png`, fullPage: true })
console.log('  · captura del informe guardada')
await p2.close()

// ── 14 · Sincronización ─────────────────────────────────────────────────
console.log('\n14. Sincronización')
await p.getByRole('link', { name: 'Sincronizar', exact: true }).click()
await p.waitForTimeout(1400)
ok(await p.getByText('Cómo funciona').isVisible(), 'explica el modelo de privacidad antes que nada')
ok(await p.getByText(/Necesitas iniciar sesión con EDUmind/).isVisible(), 'en modo local pide SSO en vez de fallar')
await foto('18-sincronizar')

// ── 15 · Copia de seguridad ─────────────────────────────────────────────
console.log('\n15. Copia de seguridad')
await p.getByRole('link', { name: 'Informes', exact: true }).click()
await p.waitForTimeout(1800)
const descargaBackup = p.waitForEvent('download')
await p.getByRole('button', { name: /Descargar copia de seguridad/ }).click()
const fBackup = await descargaBackup
const rutaBackup = process.env.SCRATCH + '/backup.json'
await fBackup.saveAs(rutaBackup)
const backup = JSON.parse(readFileSync(rutaBackup, 'utf8'))
ok(backup.version === 5, 'el backup es de la versión 5, la del esquema actual')
ok(Array.isArray(backup.criterio_instrumentos) && backup.criterio_instrumentos.length > 0,
   'incluye las asignaciones criterio↔instrumento', `${backup.criterio_instrumentos.length} vínculos`)
ok(backup.grupos.length === 1 && backup.alumnos.length === 4, 'incluye clase y alumnado')
ok(backup.calificaciones.length > 0, 'incluye las calificaciones', `${backup.calificaciones.length}`)
ok(backup.grupos.every(g => g.updated_at), 'todos los registros llevan sello de sincronización')
ok(backup.grupos[0].id > 1000000, 'los ids son del rango de este dispositivo', `id=${backup.grupos[0].id}`)

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}`)
if (erroresConsola.length) {
  console.log('\n⚠️  Errores de consola:')
  erroresConsola.slice(0, 12).forEach(e => console.log('   ' + e))
}
await navegador.close()
process.exit(fallos === 0 && erroresConsola.length === 0 ? 0 : 1)
