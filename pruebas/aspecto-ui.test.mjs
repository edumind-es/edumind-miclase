/**
 * El aspecto Lámina va tras un interruptor apagado: mientras se construye por
 * fases, quien usa la app no ve nada distinto. Aquí se vigilan los dos lados:
 *
 *  · apagado (lo que ve todo el mundo): ni atributo, ni papel, ni fuente nueva,
 *    ni una sola petición de fuentes;
 *  · encendido con `?aspecto=lamina`: papel, tinta, Outfit y cero radios; la
 *    dirección queda limpia y el aparato lo recuerda;
 *  · `?aspecto=clasico` lo apaga y vuelve a ser la app de siempre.
 */
import { mkdirSync } from 'node:fs'
import { navegadorChromium } from './lib/entorno.mjs'

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

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
const p = await ctx.newPage()
const errores = []
p.on('pageerror', e => errores.push(e.message))
const fuentesPedidas = []
p.on('request', r => { if (/\/fonts\/.*\.woff2?/.test(r.url())) fuentesPedidas.push(r.url()) })

// Lo que se mide: la raíz del documento y el peor radio de toda la página
const medir = () => p.evaluate(() => {
  const raiz = getComputedStyle(document.documentElement)
  const radios = [...document.querySelectorAll('body *')].map(e => parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0)
  return {
    atributo: document.documentElement.dataset.aspecto ?? null,
    fondo: raiz.backgroundColor,
    // La de texto: «Emoji Lamina», que con Lámina va delante, solo atiende a los emoji
    fuente: raiz.fontFamily.split(',').map(f => f.replace(/["']/g, '').trim()).find(f => f !== 'Emoji Lamina'),
    radioMayor: Math.max(0, ...radios),
    elementos: radios.length,
    sistema: document.querySelector('meta[name="theme-color"]')?.content,
    recordado: localStorage.getItem('miclase.aspecto'),
    direccion: location.pathname + location.search,
  }
})
// Hasta que la red se calla: el Inicio pinta por tandas y medir a medias da cifras distintas
const abrir = async (ruta) => { await p.goto(BASE + ruta, { waitUntil: 'networkidle' }); await p.waitForSelector('#root > *'); await p.evaluate(() => document.fonts.ready) }

console.log('\n── Apagado: lo que ve todo el mundo ──')
// Dos veces: la primera apertura pasa por la puesta en marcha y la segunda ya
// es la pantalla que se va a comparar al final
// Se pide expresamente el de siempre: esta prueba vale también cuando el
// aspecto por defecto sea Lámina, y entonces «/» a secas ya no lo sería
await abrir('/?aspecto=clasico')
await abrir('/')
const antes = await medir()
await p.screenshot({ path: `${TIROS}/aspecto-clasico.png` })
ok(antes.atributo === null, 'sin atributo de aspecto en <html>', String(antes.atributo))
ok(antes.fondo === 'rgb(245, 245, 245)', 'el fondo es el gris de siempre', antes.fondo)
ok(antes.fuente === 'Segoe UI', 'la fuente es la de siempre', antes.fuente)
ok(antes.sistema === '#0f2d4a', 'la barra del sistema sigue en azul', antes.sistema)
ok(antes.radioMayor > 0, 'las esquinas redondeadas siguen ahí', `${antes.radioMayor}px en ${antes.elementos} elementos`)
ok(fuentesPedidas.length === 0, 'no se descarga ninguna fuente de Lámina', fuentesPedidas.join(', '))

console.log('\n── Encendido con ?aspecto=lamina ──')
await abrir('/?aspecto=lamina')
const lamina = await medir()
await p.screenshot({ path: `${TIROS}/aspecto-lamina.png` })
ok(lamina.atributo === 'lamina', '<html data-aspecto="lamina">')
ok(lamina.fondo === 'rgb(236, 233, 225)', 'el fondo es papel', lamina.fondo)
ok(lamina.fuente === 'Outfit Lamina', 'la fuente es Outfit', lamina.fuente)
ok(await p.evaluate(() => document.fonts.check('16px "Outfit Lamina"')), 'Outfit está cargada, no es la de reserva')

console.log('\n── Los emoji, como iconos de línea ──')
// Se pinta cada emoji en un lienzo con la pila de Lámina y se miran los píxeles:
// el del sistema trae color; el icono de línea, solo la tinta con que se pinta
const pintado = (texto) => p.evaluate(async (t) => {
  await document.fonts.load('40px "Emoji Lamina"', t)
  const c = document.createElement('canvas'); c.width = 80; c.height = 80
  const x = c.getContext('2d')
  x.font = getComputedStyle(document.documentElement).fontFamily.replace(/^/, '40px ')
  x.fillStyle = '#17181a'; x.textBaseline = 'middle'; x.fillText(t, 10, 40)
  const d = x.getImageData(0, 0, 80, 80).data
  let tinta = 0, color = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) continue
    tinta++
    if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 24) color++
  }
  return { tinta, color }
}, texto)
// Con selector de variación (U+FE0F) es donde falla si la fuente no declara la
// secuencia: donde hay emoji de color instalados —el CI, cualquier aparato real—
// el navegador se va a la fuente del sistema. Aquí, sin fuente de color, no se ve.
const muestras = { portapapeles: await pintado('📋'), camara: await pintado('📷'), aviso: await pintado('⚠'),
  engranajeConSelector: await pintado('⚙️'), avisoConSelector: await pintado('⚠️'), bajarConSelector: await pintado('⬇️'), lapizConSelector: await pintado('✏️') }
ok(Object.values(muestras).every(m => m.tinta > 60 && m.color === 0), 'un emoji se pinta como icono de una sola tinta, con y sin selector de variación', JSON.stringify(muestras))
ok(await p.evaluate(() => document.fonts.check('40px "Emoji Lamina"', '📋')), 'con la fuente de iconos cargada')
await p.evaluate(() => { const e = document.createElement('p'); e.id = 'muestra-emoji'; document.body.append(e) })
await p.evaluate(() => { document.querySelector('#muestra-emoji').style.cssText = 'font-size:40px;padding:20px;background:#ece9e1'; document.querySelector('#muestra-emoji').textContent = '📋 📝 ⚙️ ⚠ ✅ ❌ ⬇ 📊 🖨 📷 🎙 ⭐ 🔒 🔑 🗑 👥 ⏳ 💾 📚 🤖 🎯 ⚖ 🌐' })
await p.locator('#muestra-emoji').screenshot({ path: `${TIROS}/emoji-lamina.png` })
await p.evaluate(() => document.querySelector('#muestra-emoji')?.remove())
ok(fuentesPedidas.some(u => u.includes('Outfit')), 'la fuente se pide ahora, al encender')
ok(lamina.radioMayor === 0, 'ni una esquina redondeada', `${lamina.radioMayor}px en ${lamina.elementos} elementos`)
ok(lamina.sistema === '#f4f2ec', 'la barra del sistema pasa a papel', lamina.sistema)
ok(lamina.direccion === '/', 'el parámetro no se queda en la dirección', lamina.direccion)
ok(lamina.recordado === 'lamina', 'el aparato lo recuerda')

console.log('\n── Se recuerda al volver a abrir ──')
await abrir('/')
const otraVez = await medir()
ok(otraVez.atributo === 'lamina' && otraVez.fondo === 'rgb(236, 233, 225)', 'sin parámetro, sigue en Lámina')

console.log('\n── ?aspecto=clasico lo apaga ──')
await abrir('/?aspecto=clasico')
const vuelta = await medir()
ok(vuelta.atributo === null && vuelta.recordado === 'clasico', 'vuelve el aspecto de siempre y se recuerda')
// El radio se compara como «vuelve a haber esquinas», no cifra a cifra: cuál es la
// mayor depende de qué tarjetas haya pintado ya el Inicio (falló así en el CI)
ok(vuelta.fondo === antes.fondo && vuelta.fuente === antes.fuente && vuelta.radioMayor > 0 && vuelta.sistema === antes.sistema,
  'la app queda exactamente como antes de encenderlo', JSON.stringify(vuelta))

ok(errores.length === 0, 'sin errores en la página', errores.join(' | '))
await navegador.close()
console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
