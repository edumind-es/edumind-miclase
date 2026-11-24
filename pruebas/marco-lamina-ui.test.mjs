/**
 * El marco de la app con el aspecto Lámina (fase 1): menú en tres formas,
 * barra superior con la clase, «Acerca de» y la lista propia.
 *
 * Lo que se vigila es lo que se decidió sobre la maqueta: que el menú se vea
 * entero en escritorio, plegado con nombre corto en tablet y como barra
 * inferior con «Más» en el móvil; que la cabecera del menú y la barra superior
 * midan lo mismo; que todo lo que se toca en el marco llegue a 44 px; que la
 * lista se maneje con el teclado; y que «Acerca de» diga la versión de verdad
 * y devuelva al aspecto de siempre.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { navegadorChromium, RAIZ } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const TIROS = process.env.SCRATCH + '/tiros'
const VERSION = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const errores = []

async function abrir(viewport, tactil = false) {
  const ctx = await navegador.newContext({ viewport, hasTouch: tactil })
  const p = await ctx.newPage()
  p.on('pageerror', e => errores.push(e.message))
  await p.goto(BASE + '/?aspecto=lamina', { waitUntil: 'networkidle' })
  await p.evaluate(async () => {
    const q = await import('/src/db/queries.ts')
    const a = await q.crearGrupo({ nombre: '6ºA', etapa: 'primaria', curso: '6', comunidad: 'Galicia', curso_escolar: '2026-2027', color: '#1a4a7a' })
    await q.crearGrupo({ nombre: '5ºB', etapa: 'primaria', curso: '5', comunidad: 'Galicia', curso_escolar: '2026-2027', color: '#1a4a7a' })
    await q.crearAlumno({ nombre: 'Uxía', apellidos: 'Ferreiro', neae: 0 }, a)
    localStorage.setItem('miclase_clase_activa', String(a))
    localStorage.setItem('miclase.idioma', 'es')
  })
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.evaluate(() => document.fonts.ready)
  await p.locator('[data-marco-lamina]').waitFor({ timeout: 8000 })
  return { ctx, p }
}
const forma = p => p.locator('[data-marco-lamina]').getAttribute('data-forma')
/** Lo que se toca dentro del marco (no de la pantalla) y mide menos de 44 px. */
const bajosDelMarco = p => p.evaluate(() => [...document.querySelectorAll('.ml-menu a, .ml-menu button, .ml-superior a, .ml-superior button, .ml-inferior a, .ml-inferior button')]
  .filter(e => { const c = e.getBoundingClientRect(); return c.width && c.height && (c.height < 43.5 || c.width < 43.5) })
  .map(e => `${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)} «${e.textContent.trim().slice(0, 16)}»`))

// ── Escritorio ────────────────────────────────────────────────────────
console.log('\n1. Escritorio: el menú entero')
{
  const { ctx, p } = await abrir({ width: 1440, height: 900 })
  await p.screenshot({ path: `${TIROS}/marco-escritorio.png` })
  ok(await forma(p) === 'ancho', 'a 1440 el menú va ancho')
  ok(await p.locator('.sidebar').count() === 0, 'no queda nada del marco de siempre')
  ok(await p.locator('.ml-menu nav a').count() === 10, 'diez entradas en el menú', String(await p.locator('.ml-menu nav a').count()))
  ok(await p.locator('.ml-menu nav a svg.icono').count() === 10, 'cada una con su icono de línea')
  ok(!/\p{Extended_Pictographic}/u.test(await p.locator('.ml-menu').innerText()), 'ni un emoji en el menú')
  const altos = await p.evaluate(() => [document.querySelector('.ml-menu-cab'), document.querySelector('.ml-superior')].map(e => Math.round(e.getBoundingClientRect().bottom)))
  ok(altos[0] === altos[1], 'la cabecera del menú y la barra superior acaban a la misma altura: el filete es continuo', altos.join(' y '))
  ok((await bajosDelMarco(p)).length === 0, 'todo lo que se toca en el marco mide 44 px o más', (await bajosDelMarco(p)).join(' | '))
  ok(await p.locator('.ml-menu a[aria-current="page"]').count() === 1 && await p.locator('.ml-menu a[aria-current="page"]').getAttribute('data-entrada') === 'inicio', 'Inicio marcado como «estás aquí»')
  // Inversión de tinta, y que se lea: una regla general de enlaces la dejó una vez en tinta sobre tinta
  const activa = await p.locator('.ml-menu a[aria-current="page"]').evaluate(e => { const s = getComputedStyle(e); return [s.backgroundColor, s.color] })
  ok(activa[0] === 'rgb(23, 24, 26)' && activa[1] === 'rgb(236, 233, 225)', 'la entrada activa va en papel sobre tinta', activa.join(' / '))

  console.log('\n2. Navegar y plegar')
  await p.locator('.ml-menu [data-entrada="tutorias"]').click()
  await p.waitForURL('**/tutorias')
  await p.locator('.ml-menu a[aria-current="page"][data-entrada="tutorias"]').waitFor({ timeout: 4000 }).catch(() => {})
  ok(await p.locator('.ml-menu a[aria-current="page"]').getAttribute('data-entrada') === 'tutorias', 'el menú lleva a la pantalla y la marca')
  await p.locator('[data-marco-plegar]').click()
  ok(await forma(p) === 'rail', 'el botón pliega el menú')
  ok(await p.locator('.ml-menu [data-entrada="tutorias"] .ml-corto').isVisible() && !(await p.locator('.ml-menu [data-entrada="tutorias"] .ml-largo').isVisible()), 'plegado enseña el nombre corto, no un icono solo')
  await p.reload({ waitUntil: 'networkidle' })
  ok(await forma(p) === 'rail', 'y lo recuerda al recargar')
  await p.locator('[data-marco-plegar]').click()
  ok(await forma(p) === 'ancho', 'el mismo botón lo despliega')
  await p.keyboard.press('Control+b')
  await p.waitForTimeout(200)
  ok(await forma(p) === 'rail', 'Ctrl+B lo pliega, como siempre', await forma(p))
  await p.keyboard.press('Control+b')
  await p.waitForTimeout(200)
  ok(await forma(p) === 'ancho', 'y lo vuelve a desplegar', await forma(p))

  console.log('\n3. La lista de la clase, con ratón y con teclado')
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const clase = p.locator('[data-marco-clase]')
  ok((await clase.innerText()).trim() === '6ºA', 'el campo dice la clase activa', await clase.innerText())
  ok(await p.locator('[data-marco-superior] select').count() === 0, 'la barra no lleva ningún desplegable del sistema')
  await clase.click()
  const capa = p.locator('[data-lista-abierta]')
  ok(await capa.getAttribute('data-forma') === 'campo', 'con ratón, sale bajo su campo')
  ok(await capa.locator('[role="option"]').count() === 2 && await capa.locator('[aria-selected="true"]').innerText() === '6ºA · 6º', 'ofrece las dos clases y marca la activa')
  await p.screenshot({ path: `${TIROS}/marco-lista.png` })
  await p.keyboard.press('Escape')
  ok(await capa.count() === 0 && await clase.evaluate(e => e === document.activeElement), 'Esc la cierra y el foco vuelve al campo')
  await p.keyboard.press('Enter')
  await p.keyboard.press('ArrowDown')
  await p.keyboard.press('Enter')
  ok((await clase.innerText()).trim() === '5ºB', 'Intro, flecha e Intro cambian de clase', await clase.innerText())
  ok(await p.evaluate(() => localStorage.getItem('miclase_clase_activa')) !== null && await capa.count() === 0, 'la clase activa cambia de verdad')
  await clase.click()
  await p.keyboard.type('6')
  await p.keyboard.press('Enter')
  ok((await clase.innerText()).trim() === '6ºA', 'escribir salta a la opción que lo contiene')
  ok(await p.locator('[data-marco-trimestre] button[aria-pressed="true"]').count() === 1, 'el trimestre es un conmutador con uno elegido')

  console.log('\n4. «Acerca de»')
  await p.locator('[data-marco-version]').click()
  const acerca = p.locator('[data-acerca-dialogo]')
  await acerca.waitFor({ timeout: 4000 })
  await p.screenshot({ path: `${TIROS}/marco-acerca.png` })
  ok((await p.locator('[data-marco-version]').innerText()).includes(VERSION), 'la fila del menú dice la versión del package.json', VERSION)
  ok((await acerca.locator('[data-acerca="version"] dd').innerText()).trim() === VERSION, '«Acerca de» también')
  ok((await acerca.locator('[data-acerca="autoria"] dd').innerText()).trim() === 'EDUmind® · Luis Vilela Acuña', 'la autoría, con su fórmula')
  await acerca.locator('[data-idioma="gl"]').click()
  ok((await p.locator('.ml-menu [data-entrada="calificador"] .ml-largo').innerText()) === 'Cualificador', 'cambiar a galego traduce el menú al momento')
  await acerca.locator('[data-idioma="es"]').click()
  await acerca.locator('[data-aspecto-elegir="clasico"]').click()
  await p.locator('.sidebar').waitFor({ timeout: 4000 })
  ok(await p.locator('[data-marco-lamina]').count() === 0 && await p.evaluate(() => document.documentElement.dataset.aspecto === undefined), '«El de siempre» devuelve el marco de antes sin recargar')
  await ctx.close()
}

// ── Tablet ────────────────────────────────────────────────────────────
console.log('\n5. iPad en vertical: plegado solo')
{
  const { ctx, p } = await abrir({ width: 820, height: 1180 }, true)
  await p.screenshot({ path: `${TIROS}/marco-ipad.png` })
  ok(await forma(p) === 'rail', 'a 820 el menú se pliega sin pedirlo')
  ok((await bajosDelMarco(p)).length === 0, 'todo lo que se toca en el marco mide 44 px o más', (await bajosDelMarco(p)).join(' | '))
  await p.locator('[data-marco-clase]').click()
  ok(await p.locator('[data-lista-abierta]').getAttribute('data-forma') === 'hoja', 'en táctil, la lista sube como hoja desde abajo')
  await p.locator('[data-lista-abierta] [role="option"]').nth(1).tap()
  ok((await p.locator('[data-marco-clase]').innerText()).trim() === '5ºB', 'y se elige con el dedo')
  await ctx.close()
}

// ── Móvil ─────────────────────────────────────────────────────────────
console.log('\n6. Móvil: barra inferior y «Más»')
{
  const { ctx, p } = await abrir({ width: 390, height: 844 }, true)
  await p.screenshot({ path: `${TIROS}/marco-movil.png` })
  ok(await forma(p) === 'movil', 'a 390 el menú lateral desaparece')
  ok(!(await p.locator('.ml-menu').isVisible()) && await p.locator('.ml-inferior').isVisible(), 'y sale la barra inferior')
  ok(await p.locator('.ml-inferior a').count() === 4 && await p.locator('[data-marco-mas]').count() === 1, 'cuatro destinos y «Más»')
  ok((await bajosDelMarco(p)).length === 0, 'todo lo que se toca en el marco mide 44 px o más', (await bajosDelMarco(p)).join(' | '))
  const fuera = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth || [...document.querySelectorAll('.ml-superior *, .ml-inferior *')].some(e => e.getBoundingClientRect().right > innerWidth + 1))
  ok(!fuera, 'nada del marco se sale de la pantalla')
  await p.locator('[data-marco-mas]').tap()
  const capa = p.locator('[data-lista-abierta]')
  await p.screenshot({ path: `${TIROS}/marco-movil-mas.png` })
  const opciones = await capa.locator('[role="option"]').allInnerTexts()
  ok(opciones.length === 8 && opciones.some(o => o.includes('Acerca de MiClase')) && opciones.some(o => o.includes('Tutorías')), '«Más» trae las seis pantallas que no caben, la copia y «Acerca de»', opciones.join(' · '))
  await capa.locator('[role="option"]', { hasText: 'Tutorías' }).tap()
  await p.waitForURL('**/tutorias')
  // La pantalla entra en una transición: se espera a que el marco la marque
  await p.locator('[data-marco-mas][aria-current="page"]').waitFor({ timeout: 4000 }).catch(() => {})
  ok(await p.locator('[data-marco-mas]').getAttribute('aria-current') === 'page', 'en una pantalla de «Más», «Más» queda marcado')
  await p.locator('.ml-inferior [data-entrada="calificador"]').tap()
  await p.waitForURL('**/areas')
  await p.locator('.ml-inferior a[aria-current="page"][data-entrada="calificador"]').waitFor({ timeout: 4000 }).catch(() => {})
  ok(await p.locator('.ml-inferior a[aria-current="page"]').getAttribute('data-entrada') === 'calificador', 'la barra lleva al Calificador, que entra por el hub de áreas, y lo marca')

  console.log('\n7. Pestañas que no se cortan')
  const grupo = await p.evaluate(() => localStorage.getItem('miclase_clase_activa'))
  await p.goto(`${BASE}/grupos/${grupo}`, { waitUntil: 'networkidle' })
  const fila = p.locator('[role="tablist"]').first()
  await fila.waitFor({ timeout: 8000 })
  await p.waitForTimeout(300)
  await p.screenshot({ path: `${TIROS}/marco-movil-pestanas.png` })
  const tabs = await fila.evaluate(el => [...el.querySelectorAll('[role="tab"]')].map(b => ({ oculta: b.hidden, elegida: b.getAttribute('aria-selected') === 'true', dentro: b.hidden || (b.getBoundingClientRect().right <= innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1) })))
  const ocultas = tabs.filter(t => t.oculta).length
  ok(tabs.every(t => t.dentro), 'ninguna pestaña asoma cortada: o cabe entera o no está', JSON.stringify(tabs))
  ok(tabs.find(t => t.elegida)?.oculta === false, 'la elegida sigue a la vista')
  const mas = fila.locator('[data-pestanas-mas]')
  ok(ocultas > 0 && (await mas.innerText()).includes(`Más · ${ocultas}`), 'las que no caben están en «Más · N»', `${ocultas} ocultas`)
  await mas.tap()
  const primera = p.locator('[data-lista-abierta] [role="option"]').first()
  const nombre = (await primera.innerText()).trim()
  await primera.tap()
  await p.waitForTimeout(300)
  ok((await fila.locator('[role="tab"][aria-selected="true"]').innerText()).trim() === nombre && await fila.locator('[role="tab"][aria-selected="true"]').isVisible(), 'elegir una de «Más» la abre y la deja a la vista', nombre)
  await ctx.close()
}

ok(errores.length === 0, 'sin errores en la página', errores.slice(0, 3).join(' | '))
await navegador.close()
console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
