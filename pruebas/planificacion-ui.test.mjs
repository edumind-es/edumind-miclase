/**
 * Planificación semanal y calendario de punta a punta: volcar el .md real de
 * Luis en una clase con tres áreas (vista previa con lo que no casa), que
 * volcar otra vez la misma semana pregunte y sustituya en vez de duplicar,
 * el detalle de una sesión, el salto al Calificador en su unidad, borrar,
 * mover y crear sesiones a mano, un evento, y la vista de mes.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { navegadorChromium, aceptarConfirmaciones } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const TIROS = process.env.SCRATCH + '/tiros'
const MD = join(process.cwd(), 'pruebas/fixtures/planificacion_semanal_6A.md')

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1400, height: 1000 } })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
const dialogos = []
await aceptarConfirmaciones(p, t => dialogos.push(t))
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })

/** Filas de una tabla de IndexedDB (con las borradas, para contar). */
const tabla = (nombre) => p.evaluate(async (nombre) => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const tx = db.transaction(nombre, 'readonly').objectStore(nombre).getAll()
  const filas = await new Promise((res) => { tx.onsuccess = () => res(tx.result) })
  db.close()
  return filas
}, nombre)

const volcar = async () => {
  await p.locator('[data-volcar-abrir]').click()
  await p.locator('[data-volcar-fichero]').setInputFiles(MD)
  await p.locator('[data-volcar-resumen]').waitFor({ timeout: 8000 })
  await p.locator('[data-volcar-guardar]:not([disabled])').waitFor({ timeout: 15000 })
}

const sesion = (fecha, franja) => p.locator(`[data-sesion-plan][data-fecha="${fecha}"][data-franja="${franja}"]`)
const detalle = p.locator('[data-sesion-detalle]')

try {
  console.log('\n1. Clase 6ºA con Lengua, Lingua Galega y Matemáticas, y la UD3 de Lengua')
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
  for (const area of ['Lengua Castellana y Literatura', 'Lingua Galega e Literatura', 'Matemáticas']) {
    await p.locator('label').filter({ hasText: new RegExp(`^${area}$`) }).locator('input[type="checkbox"]').check()
  }
  await p.getByRole('button', { name: /Añadir 3 áreas/ }).click()
  await p.waitForTimeout(1000)
  // La unidad se escribe directa: aquí no se prueba el editor de programación.
  const lengua = (await tabla('asignaturas')).find(a => a.nombre === 'lengua-castellana')
  ok(!!lengua, 'el área de Lengua existe')
  await p.evaluate(async (asignatura_id) => {
    const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
    const t = new Date().toISOString()
    await new Promise((res) => {
      const tx = db.transaction('unidades', 'readwrite')
      tx.objectStore('unidades').put({ id: 99000001, asignatura_id, nombre: 'UD3 · El poder de las palabras', tipo: 'UD', orden: 3, trimestre: 1, activa: 1, created_at: t, updated_at: t, deleted_at: null })
      tx.oncomplete = res
    })
    db.close()
  }, lengua.id)

  console.log('\n2. Planificación vacía y volcado con vista previa')
  await p.getByRole('link', { name: 'Planificación', exact: true }).click()
  await p.waitForTimeout(800)
  ok(await p.locator('[data-plan-vacio]').count() === 1, 'sin nada planificado lo dice')
  await volcar()
  const resumen = p.locator('[data-volcar-resumen]')
  ok(/25 sesiones/.test(await resumen.textContent()), 'la vista previa cuenta 25 sesiones')
  ok(await p.locator('[data-no-casa-area="Inglés"]').count() === 1, 'dice que Inglés no casa con la clase')
  ok(await p.locator('[data-no-casa-area="Ciencias da Natureza"]').count() === 1, 'ni Ciencias da Natureza')
  ok(await p.locator('[data-no-casa-area="Lengua Castellana"]').count() === 0, 'Lengua Castellana sí casa')
  ok(await p.locator('[data-no-casa-unidad="UD3 · Crinas ao vento"]').count() === 1, 'la UD3 de Lingua Galega no casa (el área no tiene unidades)')
  ok(await p.locator('[data-no-casa-unidad="UD3 · El poder de las palabras"]').count() === 0, 'la UD3 de Lengua sí casa')
  ok(await p.locator('[data-no-casa-criterio="CA1.1"]').count() === 0, 'los criterios de Natureza no se acusan: ya se dice que el área no casa')
  ok(await p.locator('[data-no-casa-criterio]').count() === 0, 'los de Lengua, Lingua Galega y Matemáticas casan con el currículo',
    await p.locator('[data-no-casa-criterio]').allTextContents().then(t => t.join(' | ')))
  ok((await tabla('planificacion')).length === 0, 'la vista previa no guarda nada')
  await foto('planificacion-01-vista-previa')
  await p.locator('[data-volcar-guardar]').click()
  await p.locator('[data-planificacion-semana]').waitFor({ timeout: 8000 })
  ok(await p.locator('[data-sesion-plan]').count() === 25, 'la semana enseña las 25 sesiones', String(await p.locator('[data-sesion-plan]').count()))
  ok(/9 al 13 de noviembre de 2026/.test(await p.locator('[data-plan-titulo]').textContent()), 'y va a la semana volcada')
  ok(await p.locator('[data-evento="nota"]').filter({ hasText: 'Magosto' }).count() === 1, 'la nota del Magosto sale en la cabecera del viernes')
  let filas = await tabla('planificacion')
  ok(filas.length === 25 && filas.every(f => f.updated_at && f.deleted_at === null && f.id > 0), 'guardadas 25 con id propio y sellos')
  await foto('planificacion-02-semana')

  console.log('\n3. Volcar otra vez la misma semana pregunta y sustituye')
  dialogos.length = 0
  await volcar()
  await p.locator('[data-volcar-guardar]').click()
  await p.locator('[data-plan-aviso]').filter({ hasText: /sustituidas/ }).waitFor({ timeout: 8000 })
  ok(dialogos.some(d => /ya tiene 25 sesión/.test(d)), 'pregunta antes de sustituir', dialogos.join(' | '))
  filas = await tabla('planificacion')
  ok(filas.filter(f => !f.deleted_at).length === 25 && filas.filter(f => f.deleted_at).length === 25,
    'siguen 25 vivas; las 25 anteriores, retiradas con borrado lógico', `${filas.length} filas`)
  ok((await tabla('eventos')).filter(e => !e.deleted_at).length === 1, 'y una sola nota del Magosto')

  console.log('\n4. Detalle y salto al Calificador')
  await sesion('2026-11-09', '1ª').click()
  await detalle.waitFor({ timeout: 5000 })
  const texto = await detalle.textContent()
  ok(/Completar en equipo/.test(texto) && /Inicio \(15 min\)/.test(texto) && /Plantilla del glosario/.test(texto), 'objetivo, secuencia y recursos')
  ok(await detalle.locator('[data-criterio-anclado]').count() === 3, 'los tres criterios anclados')
  ok(await detalle.locator('[data-ir-calificador]').count() === 0, 'la 1ª no es evaluable: no lleva al Calificador')
  await p.keyboard.press('Escape').catch(() => {})
  await detalle.getByRole('button', { name: 'Cerrar' }).click()
  await sesion('2026-11-09', '2ª').click()
  await detalle.waitFor({ timeout: 5000 })
  const ir = detalle.locator('[data-ir-calificador]')
  const href = await ir.getAttribute('href')
  ok(href && href.includes(`asignatura_id=${lengua.id}`) && href.includes('unidad_id=99000001'), 'la 2ª (■) lleva al Calificador en Lengua, UD3', href)
  await ir.click()
  await p.waitForURL(/\/evaluacion/)
  await p.waitForTimeout(1500)
  ok(/unidad_id=99000001/.test(p.url()), 'el Calificador abre con la unidad', p.url())
  ok(await p.locator('[data-unidad-select] option').filter({ hasText: /El poder de las palabras|UD3/ }).first().count() === 1, 'la UD3 está en el selector de unidad')

  console.log('\n5. Borrar, mover y crear a mano')
  await p.goto(BASE + '/planificacion?fecha=2026-11-11', { waitUntil: 'networkidle' })
  await p.locator('[data-planificacion-semana]').waitFor({ timeout: 8000 })
  await sesion('2026-11-13', '3ª').click()
  await detalle.waitFor({ timeout: 5000 })
  await detalle.locator('[data-sesion-borrar]').click()
  await detalle.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(500)
  ok(await sesion('2026-11-13', '3ª').count() === 0, 'la 3ª del viernes (Magosto) se ha borrado')
  ok((await tabla('planificacion')).filter(f => !f.deleted_at).length === 24, 'quedan 24 vivas')

  await sesion('2026-11-13', '2ª').click()
  await detalle.waitFor({ timeout: 5000 })
  await detalle.locator('[data-sesion-editar]').click()
  const form = p.getByRole('dialog', { name: 'Editar sesión' })
  await form.waitFor({ timeout: 5000 })
  await form.locator('[data-campo="franja-elegir"]').selectOption('10:40-11:30')
  await form.locator('[data-sesion-guardar]').click()
  await form.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(500)
  ok(await sesion('2026-11-13', '3ª').filter({ hasText: 'Matemáticas' }).count() === 1, 'Matemáticas del viernes pasa a la 3ª')
  ok(await sesion('2026-11-13', '2ª').count() === 0, 'y la 2ª queda libre')

  await p.getByRole('button', { name: /Añadir sesión el Viernes, 13 de noviembre a las 9:50/ }).click()
  const nueva = p.getByRole('dialog', { name: 'Nueva sesión' })
  await nueva.waitFor({ timeout: 5000 })
  await nueva.locator('[data-campo="asignatura"]').selectOption({ label: 'Lingua Galega e Literatura' })
  await nueva.locator('[data-campo="titulo"]').fill('Lectura do conto do Magosto')
  await nueva.locator('[data-campo="evaluable"]').check()
  await nueva.locator('[data-campo="secuencia"]').fill('Inicio (5 min): Semáforo emocional\nDesenvolvemento (40 min): Lectura en parellas')
  await nueva.locator('[data-sesion-guardar]').click()
  await nueva.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(500)
  const creada = sesion('2026-11-13', '2ª')
  ok(await creada.filter({ hasText: 'Lectura do conto' }).count() === 1, 'la sesión nueva sale en el hueco pulsado')
  const fila = (await tabla('planificacion')).find(f => f.titulo === 'Lectura do conto do Magosto')
  ok(fila && fila.origen === 'manual' && fila.evaluable === 1 && fila.franja === '2ª' && fila.hora_inicio === '9:50'
    && JSON.parse(fila.secuencia_json).length === 2, 'guardada con franja, ■ y secuencia', JSON.stringify(fila && { franja: fila.franja, origen: fila.origen }))

  console.log('\n6. Un evento y la vista de mes')
  await p.locator('[data-evento-nuevo]').click()
  const ev = p.getByRole('dialog', { name: 'Nuevo evento' })
  await ev.waitFor({ timeout: 5000 })
  await ev.locator('[data-evento-campo="titulo"]').fill('Claustro')
  await ev.locator('[data-evento-campo="tipo"]').selectOption('reunion')
  await ev.locator('[data-evento-campo="fecha"]').fill('2026-11-11')
  await ev.locator('[data-evento-guardar]').click()
  await ev.waitFor({ state: 'hidden', timeout: 5000 })
  await p.waitForTimeout(500)
  ok(await p.locator('[data-evento="reunion"]').filter({ hasText: 'Claustro' }).count() === 1, 'el claustro sale el miércoles')

  await p.locator('[data-vista-plan="mes"]').click()
  await p.locator('[data-planificacion-mes]').waitFor({ timeout: 5000 })
  await p.waitForTimeout(500)
  const lunes = p.locator('[data-dia-mes="2026-11-09"]')
  ok(/5 sesiones/.test(await lunes.textContent()), 'el lunes 9 dice 5 sesiones', await lunes.textContent())
  ok(await lunes.locator('[data-ir-calificador]').count() === 1, 'y el ■ de Lengua lleva al Calificador (el de Natureza no: la clase no tiene el área)')
  ok(await p.locator('[data-dia-mes="2026-11-11"] [data-evento="reunion"]').count() === 1, 'el claustro también en el mes')
  ok(await p.locator('[data-dia-mes="2026-11-13"] [data-evento="nota"]').count() === 1, 'y la nota del Magosto')
  await foto('planificacion-03-mes')

  console.log('\n7. Exportar la semana')
  await p.locator('[data-vista-plan="semana"]').click()
  await p.locator('[data-planificacion-semana]').waitFor({ timeout: 5000 })
  const descarga = p.waitForEvent('download')
  await p.locator('[data-plan-exportar]').click()
  const md = await (await descarga).path().then(r => import('node:fs').then(fs => fs.readFileSync(r, 'utf8')))
  ok(/# Programación semanal · 6ºA/.test(md) && /Semana del 9 al 13 de noviembre de 2026/.test(md) && /Lectura do conto do Magosto/.test(md),
    'el .md exportado lleva la clase, la semana y lo editado a mano')

  console.log('\n8. Pedir la semana a una IA y volcar su respuesta, marcada')
  await p.locator('[data-volcar-abrir]').click()
  await p.locator('[data-ia-semana-toggle]').click()
  const promptIA = p.locator('[data-ia-semana-prompt]')
  await p.waitForFunction(() => (document.querySelector('[data-ia-semana-prompt]')?.value || '').includes('# Programación semanal'), null, { timeout: 8000 })
  const textoPrompt = await promptIA.inputValue()
  ok(/6ºA/.test(textoPrompt) && /Semana del 9 al 13 de noviembre de 2026/.test(textoPrompt), 'el prompt lleva la clase y la semana que se mira', textoPrompt.slice(0, 120))
  ok(/El poder de las palabras/.test(textoPrompt) && /9:00-9:50/.test(textoPrompt), 'las unidades de la programación y el horario que ya se conoce')
  ok(await p.locator('[data-ia-semana] [data-aviso-contexto-ia]').count() === 1, 'las indicaciones llevan el aviso de no escribir datos del alumnado')
  await p.locator('[data-ia-semana-indicaciones]').fill('El jueves hay salida.')
  await p.waitForTimeout(200)
  ok((await promptIA.inputValue()).includes('El jueves hay salida.'), 'lo que escribe el docente entra en el prompt')
  ok(!(await p.locator('[data-volcar-de-ia]').isChecked()), 'sin haber pedido nada, el texto no se da por escrito por una IA')
  await p.locator('[data-ia-semana-copiar]').click()
  await p.locator('[role="dialog"] [data-borrador-ia]').waitFor({ timeout: 5000 }).catch(() => {})
  ok(await p.locator('[data-volcar-de-ia]').isChecked() && await p.locator('[role="dialog"] [data-borrador-ia]').count() === 1,
    'tras copiar el prompt, lo que se pegue queda marcado como borrador de IA')
  await p.locator('[data-volcar-fichero]').setInputFiles(MD)
  await p.locator('[data-volcar-guardar]:not([disabled])').waitFor({ timeout: 15000 })
  await p.locator('[data-volcar-guardar]').click()
  await p.locator('[data-plan-aviso]').filter({ hasText: /Volcadas 25 sesiones/ }).waitFor({ timeout: 8000 })
  const deIA = await p.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
    const filas = await new Promise((res) => {
      const tx = db.transaction('planificacion', 'readonly').objectStore('planificacion').getAll()
      tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
    })
    return { total: filas.length, marcadas: filas.filter(f => f.generada_ia === true).length }
  })
  ok(deIA.total === 25 && deIA.marcadas === 25, 'las 25 sesiones volcadas llevan la marca de IA', JSON.stringify(deIA))
  await sesion('2026-11-09', '1ª').click()
  await detalle.waitFor({ timeout: 5000 })
  ok(await detalle.locator('[data-borrador-ia]').count() === 1, 'el detalle de la sesión dice que es un borrador de IA')
  await detalle.getByRole('button', { name: 'Cerrar' }).click()
  const descargaIA = p.waitForEvent('download')
  await p.locator('[data-plan-exportar]').click()
  const mdIA = await (await descargaIA).path().then(r => import('node:fs').then(fs => fs.readFileSync(r, 'utf8')))
  ok(mdIA.includes('<!-- generada-ia -->'), 'y el .md exportado conserva la marca')
} catch (e) {
  ok(false, 'la prueba ha terminado sin excepciones', e.message)
  await foto('planificacion-error').catch(() => {})
} finally {
  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
  await navegador.close()
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien')
process.exit(fallos ? 1 : 0)
