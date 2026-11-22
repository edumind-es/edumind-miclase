/**
 * Un diálogo no se cierra por un gesto que empezó dentro de él.
 *
 * Luis: al seleccionar texto deprisa o al hacer scroll rápido, el diálogo se
 * cerraba y se quedaba en la pantalla de detrás. Todos los diálogos cierran
 * con un clic en el velo, y el navegador cuenta como clic en el velo un
 * arrastre que empieza en la tarjeta y se suelta fuera. Aquí se comprueba, en
 * el diálogo de exportar (que no necesita datos):
 *
 *  1. arrastrar desde un campo hasta el velo NO cierra;
 *  2. arrastrar desde el velo hasta la tarjeta tampoco;
 *  3. pulsar y soltar en el velo sigue cerrando;
 *  4. con un diálogo abierto, el scroll no pasa a la página de detrás ni al
 *     navegador (`overscroll-behavior`).
 */
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
const BASE = process.env.BASE || 'http://127.0.0.1:5173'

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1200, height: 800 } })
const p = await ctx.newPage()
const errores = []
p.on('pageerror', e => errores.push(e.message))

const velo = p.locator('.modal-overlay')
const abrir = async () => {
  if (await velo.count()) return
  await p.getByTitle('Exportar / Importar copia de seguridad').click()
  await velo.waitFor()
  await p.getByRole('button', { name: /Exportar mis datos/ }).click()
  await p.locator('.modal-overlay input').first().waitFor()
}
const centro = async loc => { const c = await loc.boundingBox(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 } }

try {
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(500)

  console.log('\n1. Seleccionar texto y soltar fuera de la tarjeta')
  await abrir()
  const campo = p.locator('.modal-overlay input').first()
  await campo.fill('una contraseña larga')
  const dentro = await centro(campo)
  await p.mouse.move(dentro.x, dentro.y)
  await p.mouse.down()
  await p.mouse.move(40, 40, { steps: 4 })   // deprisa, hasta la esquina del velo
  await p.mouse.up()
  await p.waitForTimeout(200)
  ok(await velo.count() === 1, 'el diálogo sigue abierto tras soltar sobre el velo')
  ok(await campo.inputValue() === 'una contraseña larga', 'y el campo conserva lo escrito')

  console.log('\n2. Empezar en el velo y soltar en la tarjeta')
  await abrir()
  await p.mouse.move(40, 40)
  await p.mouse.down()
  await p.mouse.move(dentro.x, dentro.y, { steps: 4 })
  await p.mouse.up()
  await p.waitForTimeout(200)
  ok(await velo.count() === 1, 'el diálogo sigue abierto')

  console.log('\n3. El scroll no sale del diálogo')
  await abrir()
  const estilos = await p.evaluate(() => {
    const v = document.querySelector('.modal-overlay')
    return {
      velo: getComputedStyle(v).overscrollBehaviorY,
      tarjeta: getComputedStyle(v.firstElementChild).overscrollBehaviorY,
      raizX: getComputedStyle(document.documentElement).overscrollBehaviorX,
    }
  })
  ok(estilos.velo === 'contain', 'el velo retiene el scroll', estilos.velo)
  ok(estilos.tarjeta === 'contain', 'la tarjeta retiene el scroll', estilos.tarjeta)
  ok(estilos.raizX === 'none', 'con un diálogo abierto el gesto lateral no llega al navegador', estilos.raizX)

  console.log('\n4. Pulsar fuera sigue cerrando')
  await abrir()
  await p.mouse.click(40, 40)
  await p.waitForTimeout(200)
  ok(await velo.count() === 0, 'un clic en el velo cierra el diálogo')
  const raizSin = await p.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorX)
  ok(raizSin !== 'none', 'sin diálogo, la página vuelve a su scroll de siempre', raizSin)

  ok(errores.length === 0, 'sin errores en la página', errores.join(' | '))
} catch (e) {
  console.log('  ✗ FALLO inesperado:', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} comprobación(es) fallida(s)` : '\nTodo bien')
process.exit(fallos ? 1 : 0)
