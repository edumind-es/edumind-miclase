/**
 * El Calificador con el aspecto Lámina (fase 3): la tabla sobre papel y las
 * notas en filete o en relleno, a elección del docente.
 *
 * Se siembra una clase de verdad (pruebas/lib/sembrar.mjs) y se mira la tabla
 * con notas de los cinco tramos:
 *  · filete (por defecto): cifra en tinta, fondo sin color y raya del semáforo;
 *  · relleno, elegido en «Acerca de»: la casilla del color del semáforo;
 *  · la elección se recuerda, y con el aspecto de siempre la tabla no cambia.
 */
import { mkdirSync } from 'node:fs'
import { navegadorChromium, aceptarConfirmaciones } from './lib/entorno.mjs'
import { sembrarClaseConNotas } from './lib/sembrar.mjs'
import { medirCortes } from './lib/nadaCortado.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const TIROS = process.env.SCRATCH + '/tiros'

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const SEMAFORO = { sb: 'rgb(30, 126, 67)', nt: 'rgb(31, 111, 165)', bi: 'rgb(111, 82, 160)', su: 'rgb(168, 90, 0)', in: 'rgb(192, 48, 47)' }
const TINTA = 'rgb(23, 24, 26)', SIN_FONDO = 'rgba(0, 0, 0, 0)'

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const errores = []
p.on('pageerror', e => errores.push(e.message))
await aceptarConfirmaciones(p)

/** Cómo se ve cada casilla con nota: clase de tramo → fondo, tinta y raya. */
const casillas = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.matriz .celda-btn')]
  .map(e => [[...e.classList].find(c => /^cal-\d+$/.test(c)), e]).filter(([c]) => c)
  .map(([c, e]) => { const s = getComputedStyle(e); return [c, { fondo: s.backgroundColor, tinta: s.color, raya: s.borderBottomColor, grosor: s.borderBottomWidth, alto: Math.round(e.getBoundingClientRect().height) }] })))
const abrirCalificador = async (aspecto) => {
  await p.goto(`${BASE}/evaluacion?aspecto=${aspecto}&grupo_id=${base.grupo}&asignatura_id=${base.asig}&unidad_id=${base.unidad}`, { waitUntil: 'networkidle' })
  await p.locator('[data-vista="criterios"]').click()
  await p.locator('.matriz .celda-btn.cal-7').first().waitFor({ timeout: 10000 })
  await p.evaluate(() => document.fonts.ready)
}

console.log('\n1. Una clase con notas de todos los tramos')
const base = await sembrarClaseConNotas(p, BASE)
ok(base.criterios.length === 2, 'el examen evalúa dos criterios en la primera unidad', base.criterios.join(' · '))

console.log('\n2. Con el aspecto de siempre, la tabla es la de siempre')
await abrirCalificador('clasico')
const clasico = await casillas()
ok(clasico['cal-7']?.fondo === SEMAFORO.nt && clasico['cal-3']?.fondo === SEMAFORO.in, 'las casillas van rellenas del color del semáforo', JSON.stringify(clasico['cal-7']))

console.log('\n3. Lámina: filete por defecto')
await abrirCalificador('lamina')
await p.screenshot({ path: `${TIROS}/calificador-filete.png` })
const filete = await casillas()
const tramos = { 'cal-3': 'in', 'cal-5': 'su', 'cal-6': 'bi', 'cal-7': 'nt' }
ok(Object.keys(tramos).every(c => filete[c]), 'hay casillas de insuficiente, suficiente, bien y notable', Object.keys(filete).join(' '))
ok(Object.values(filete).every(c => c.fondo === SIN_FONDO && c.tinta === TINTA), 'la cifra va en tinta sobre el papel, sin fondo de color', JSON.stringify(Object.values(filete)[0]))
ok(Object.entries(tramos).every(([c, t]) => filete[c].raya === SEMAFORO[t] && filete[c].grosor === '4px'), 'y debajo, la raya del color de su tramo', JSON.stringify(filete['cal-7']))
ok(Object.values(filete).every(c => c.alto >= 44), 'cada casilla mide 44 px o más', Object.values(filete).map(c => c.alto).join(' '))
const fuente = await p.locator('.matriz .celda-btn.cal-7').first().evaluate(e => getComputedStyle(e).fontFamily.split(',').map(f => f.replace(/["']/g, '').trim()).find(f => f !== 'Emoji Lamina'))
ok(fuente === 'Plex Mono Lamina', 'en la letra de máquina', fuente)
const m = await medirCortes(p)
ok(m.desborda.length === 0 && m.sale.length === 0 && m.corta.length === 0, 'nada desborda, nada fuera, ningún texto cortado', [...m.desborda, ...m.sale, ...m.corta].slice(0, 3).join(' | '))

console.log('\n3b. El panel de la casilla')
await p.locator('.matriz .celda-btn.cal-7').first().click()
const panel = p.getByRole('dialog').first()
await panel.waitFor({ timeout: 8000 })
await p.waitForTimeout(500)
await p.screenshot({ path: `${TIROS}/panel-casilla.png` })
const mp = await medirCortes(p)
ok(mp.desborda.length === 0 && mp.sale.length === 0 && mp.corta.length === 0, 'el panel abre y nada desborda, nada fuera, ningún texto cortado', [...mp.sale, ...mp.corta].slice(0, 3).join(' | '))
// La nota grande del panel la pinta el diálogo en línea: también va en filete
const grande = await panel.evaluate(d => { const e = [...d.querySelectorAll('[style*="background: var(--cal-"]')][0]; if (!e) return null; const s = getComputedStyle(e); return { fondo: s.backgroundColor, tinta: s.color, raya: s.borderBottomColor } })
ok(grande && grande.fondo === SIN_FONDO && grande.tinta === TINTA && grande.raya === SEMAFORO.nt, 'la nota que el panel pinta por su cuenta también va en filete', JSON.stringify(grande))
const blancos = await panel.evaluate(d => [...d.querySelectorAll('*')].filter(e => getComputedStyle(e).backgroundColor === 'rgb(255, 255, 255)').length)
ok(blancos === 0, 'sin fondos de blanco puro: todo es papel', `${blancos} elementos en blanco`)
await p.keyboard.press('Escape')
await panel.waitFor({ state: 'detached', timeout: 6000 }).catch(() => {})

console.log('\n4. Relleno, elegido en «Acerca de»')
await p.locator('[data-marco-version]').click()
await p.locator('[data-acerca-dialogo]').waitFor({ timeout: 4000 })
ok(await p.locator('[data-notas-elegir="filete"]').getAttribute('aria-pressed') === 'true', '«Acerca de» dice que las notas van en filete')
await p.locator('[data-notas-elegir="relleno"]').click()
await p.keyboard.press('Escape')
await p.waitForTimeout(400)   // el color cambia en una transición corta
await p.screenshot({ path: `${TIROS}/calificador-relleno.png` })
const relleno = await casillas()
ok(Object.entries(tramos).every(([c, t]) => relleno[c].fondo === SEMAFORO[t] && relleno[c].tinta === 'rgb(255, 255, 255)'), 'la casilla pasa al color del semáforo con la cifra en blanco, sin recargar', JSON.stringify(relleno['cal-7']))
await p.reload({ waitUntil: 'networkidle' })
await p.locator('.matriz .celda-btn.cal-7').first().waitFor({ timeout: 10000 })
ok((await casillas())['cal-7'].fondo === SEMAFORO.nt && await p.evaluate(() => localStorage.getItem('miclase.notas')) === 'relleno', 'y el aparato lo recuerda')

console.log('\n5. El hub de áreas y el color del área')
await p.goto(BASE + '/', { waitUntil: 'networkidle' })
await p.locator('.ml-menu [data-entrada="calificador"]').click()
await p.waitForURL('**/areas')
const hub = p.locator('[data-hub-areas]')
await hub.locator('[data-hub-area]').first().waitFor({ timeout: 8000 })
await p.screenshot({ path: `${TIROS}/hub-areas.png` })
ok(await hub.locator('[data-hub-area]').count() === 1 && await hub.locator('[data-hub-area]').getAttribute('data-sigla') === 'CS', 'el Calificador entra por el hub: una casilla por área, con su sigla', await hub.locator('[data-hub-area]').first().getAttribute('data-sigla'))
ok((await hub.locator('[data-hub-area] .hub-estado').innerText()).includes('5 notas'), 'cuenta las notas puestas en el trimestre', await hub.locator('[data-hub-area] .hub-estado').innerText())
ok(await hub.locator('[data-hub-seguir]').count() === 1, 'y ofrece seguir donde se dejó')
ok(await p.locator('.ml-menu [data-entrada="calificador"]').getAttribute('aria-current') === 'page', 'en el hub, el menú marca «Calificador»')
const mh = await medirCortes(p)
ok(mh.desborda.length === 0 && mh.sale.length === 0 && mh.corta.length === 0 && mh.bajo.length === 0, 'en el hub nada se corta y todo lo que se toca mide 44 px', [...mh.sale, ...mh.corta, ...mh.bajo].slice(0, 3).join(' | '))
await hub.locator('[data-hub-area] .hub-abre').click()
await p.waitForURL('**/evaluacion')
const franja = p.locator('[data-marco-franja]')
await franja.waitFor({ timeout: 6000 })
ok(await franja.getAttribute('data-sigla') === 'CS' && await franja.evaluate(e => getComputedStyle(e).backgroundColor) === 'rgb(91, 74, 138)', 'dentro del área, la franja de su color bajo la barra', await franja.evaluate(e => getComputedStyle(e).backgroundColor))
ok((await p.locator('[data-marco-area] .sigla-area').innerText()) === 'CS', 'y la sigla en el selector de área: el color nunca va solo')
ok(await p.locator('.ml-menu [data-entrada="calificador"]').getAttribute('aria-current') === 'page', 'dentro, el menú sigue marcando «Calificador»')
await p.locator('[data-marco-area]').click()
await p.locator('[data-lista-abierta] [role="option"]').first().click()
await p.waitForURL('**/areas')
await p.locator('[data-hub-areas] [data-hub-area]').first().waitFor({ timeout: 8000 })
ok(await p.locator('[data-marco-franja]').count() === 0, '«Todas las áreas» vuelve al hub, ya sin franja')

console.log('\n6. El docente cambia el color y la sigla del área')
await p.goto(`${BASE}/grupos/${base.grupo}`, { waitUntil: 'networkidle' })
await p.getByRole('tab', { name: 'Áreas y evaluación' }).click()
await p.locator('span').filter({ hasText: /^Ciencias Sociales$/ }).first().click()
const editor = p.locator('[data-color-area]')
await editor.waitFor({ timeout: 6000 })
ok(await editor.locator('[data-color-area-muestra]').count() === 10 && await editor.locator('[aria-pressed="true"]').getAttribute('data-color-area-muestra') === '#5b4a8a', 'ofrece los diez tonos y marca el que el área lleva por orden')
await editor.locator('[data-color-area-muestra="#a23f5c"]').click()
await editor.locator('[data-color-area-sigla]').fill('soc')
await editor.locator('[data-color-area-sigla]').blur()
await p.waitForTimeout(500)
await p.screenshot({ path: `${TIROS}/color-de-area.png` })
const guardada = await p.evaluate(async () => { const l = await import('/src/db/localDb.ts'); const a = (await l.db.asignaturas.toArray()).find(x => !x.deleted_at); return [a.color, a.sigla, !!a.updated_at] })
ok(guardada[0] === '#a23f5c' && guardada[1] === 'SOC' && guardada[2], 'se guardan en el área, con su sello para sincronizar', guardada.join(' '))
await p.goto(BASE + '/areas', { waitUntil: 'networkidle' })
const casilla = p.locator('[data-hub-area]')
await casilla.waitFor({ timeout: 8000 })
ok(await casilla.getAttribute('data-sigla') === 'SOC' && await casilla.evaluate(e => getComputedStyle(e).borderTopColor) === 'rgb(162, 63, 92)', 'y el hub los enseña', await casilla.evaluate(e => getComputedStyle(e).borderTopColor))

console.log('\n7. «Exámenes y pruebas» también entra por un hub de áreas')
await p.locator('.ml-menu [data-entrada="examenes"]').click()
await p.waitForURL('**/escanear')
const hubEx = p.locator('[data-examenes-hub]')
await hubEx.waitFor({ timeout: 10000 })
await p.screenshot({ path: `${TIROS}/examenes-hub.png`, fullPage: false })
ok(await p.locator('[role="tab"]').count() === 0, 'sin pestañas de áreas')
ok(await hubEx.locator('[data-examenes-hub-area]').count() === 1 && await hubEx.locator('[data-examenes-hub-area]').getAttribute('data-sigla') === 'SOC', 'una casilla por área, con la sigla que eligió el docente')
await hubEx.locator('.hub-abre').click()
const dentro = p.locator('[data-examenes-dentro]')
await dentro.waitFor({ timeout: 6000 })
await p.locator('[data-unidad-bloque]').first().waitFor({ timeout: 10000 })
await p.screenshot({ path: `${TIROS}/examenes-area.png` })
ok((await dentro.innerText()).includes('Ciencias Sociales') && await p.locator('[data-unidad-bloque]').count() >= 1, 'dentro del área, sus unidades con sus actividades', String(await p.locator('[data-unidad-bloque]').count()))
ok(await p.locator('[data-fila-actividad][data-nombre="Examen"]').count() >= 1, 'incluida la actividad «Examen» de la siembra')
const me = await medirCortes(p)
ok(me.desborda.length === 0 && me.sale.length === 0 && me.corta.length === 0, 'nada desborda, nada fuera, ningún texto cortado', [...me.desborda, ...me.sale, ...me.corta].slice(0, 3).join(' | '))
await p.locator('[data-examenes-todas]').click()
await hubEx.waitFor({ timeout: 6000 })
ok(await p.locator('[data-examenes-dentro]').count() === 0, '«Todas las áreas» vuelve al hub')
ok(await p.locator('[data-examenes-cola]').count() === 0, 'sin exámenes definidos no hay cola «Por corregir»')

console.log('\n8. La cola «Por corregir»')
// Se define el examen de la primera unidad y se corrige a uno de los tres alumnos
await p.evaluate(async (b) => {
  const q = await import('/src/db/queries.ts')
  const als = await q.getAlumnosByGrupo(b.grupo)
  const def = { titulo: 'Examen del relieve', tipo: 'puntos', reparto: 'unica', preguntas: [{ id: 'p1', enunciado: 'Una', max: 10, criterio_id: null }] }
  await q.guardarPrueba(b.examen, b.unidad, def)
  const guardado = await q.getPrueba(b.examen, b.unidad)
  await q.guardarExamenDeAlumno({ alumno_id: als[0].id, instrumento_id: b.examen, trimestre: b.trimestre, unidad_id: b.unidad, def: guardado.def,
    respuestas: { p1: 8 }, destinos: b.criterios, area: { asignatura: 'ciencias_sociales', curso: '6', etapa: 'primaria', comunidad: 'Galicia' } })
}, base)
await p.reload({ waitUntil: 'networkidle' })
const cola = p.locator('[data-examenes-cola]')
await cola.waitFor({ timeout: 10000 })
await p.screenshot({ path: `${TIROS}/examenes-cola.png` })
ok(await cola.locator('[data-examenes-cola-examen]').count() === 1, 'el examen a medias sale en la cola')
// El dato va en mayúsculas por estilo: se compara sin distinguir
ok(/1 de 3 corregidos/i.test(await cola.innerText()) && (await cola.innerText()).includes('Examen del relieve'), 'con su título y cuántos alumnos lleva corregidos', (await cola.innerText()).replace(/\s+/g, ' ').slice(0, 120))
const mc = await medirCortes(p)
ok(mc.desborda.length === 0 && mc.sale.length === 0 && mc.corta.length === 0, 'nada desborda, nada fuera, ningún texto cortado', [...mc.sale, ...mc.corta].slice(0, 3).join(' | '))
await cola.getByRole('button', { name: 'Corregir' }).click()
await p.getByRole('dialog').first().waitFor({ timeout: 8000 })
ok(await p.getByRole('dialog').count() >= 1, '«Corregir» abre el corrector de ese examen')

ok(errores.length === 0, 'sin errores en la página', errores.slice(0, 3).join(' | '))
await navegador.close()
console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
