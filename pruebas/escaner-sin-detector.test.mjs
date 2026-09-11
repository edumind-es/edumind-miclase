/**
 * El escáner de QR en un navegador sin `BarcodeDetector`.
 *
 * Es exactamente la situación del iPad: ni Safari ni el WKWebView en el que
 * corre la app nativa implementan esa API. Antes de tener decodificador de
 * reserva, aquí no aparecía siquiera el botón de cámara y la función estrella
 * de la app —escanear el QR de la mesa— desaparecía justo en el dispositivo
 * para el que se diseñó.
 *
 * Requiere `npm run dev:frontend`.
 */
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
import { mkdirSync } from 'node:fs'

process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
let fallos = 0
const ok = (c, m, e = '') => { console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${e ? ' — ' + e : ''}`); if (!c) fallos++ }

const BASE = process.env.BASE || 'http://127.0.0.1:5173'

const nav = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const ctx = await nav.newContext({ permissions: ['camera'], viewport: { width: 1100, height: 800 } })
// Quitar el detector nativo antes de que cargue nada: así se comporta como WKWebView
await ctx.addInitScript(() => { delete window.BarcodeDetector })
const p = await ctx.newPage()
const errores = []
p.on('pageerror', e => errores.push(e.message))

// Esperas por condición, no por reloj. Arrancar la cámara falsa y descargar
// el fragmento de jsQR tarda lo que tarda la máquina: en el runner del CI, más
// que en este servidor. Con esperas fijas la prueba fallaba de vez en cuando y
// bloqueaba PRs correctos.
// 30 s, no 15: aquí no se mide velocidad sino comportamiento, y arrancar la
// cámara falsa y transformar jsQR en el servidor de desarrollo con cuatro
// navegadores abiertos a la vez no cabe siempre en quince segundos. Con ese
// plazo la suite fallaba una vez de cada cinco dentro de la tanda completa y
// llegó a bloquear PRs correctos. Un fallo de verdad se sigue viendo igual,
// solo que tarda el doble en cantarlo.
const ESPERA = 30000
const visible = async (loc) => {
  try { await loc.waitFor({ state: 'visible', timeout: ESPERA }); return true }
  catch { return false }
}

// Calentar el servidor de desarrollo antes de medir nada.
//
// Vite pre-empaqueta cada dependencia la primera vez que alguien la pide, y
// `jsqr` son 130 KB que hay que transformar. En este servidor tarda un
// suspiro; en el runner del CI, con la tanda completa por medio, no cabía ni
// en treinta segundos, y los dos asertos que dependen de que el decodificador
// esté cargado caducaban. El segundo escenario de este mismo fichero pasaba
// siempre, porque para entonces ya estaba caliente: era arranque en frío
// contaminando la medida, no un fallo de la app.
//
// Se calienta en un contexto aparte y desechable: así el servidor tiene la
// dependencia lista, pero la página que se mide estrena su propio historial de
// recursos y la comprobación de carga diferida sigue siendo válida.
{
  const previo = await nav.newContext()
  const pp = await previo.newPage()
  await pp.goto(`${BASE}/escanear`, { waitUntil: 'domcontentloaded' })
  await pp.evaluate(() => import('jsqr').then(() => true).catch(() => false))
  await previo.close()
}

await p.goto(`${BASE}/escanear`, { waitUntil: 'networkidle' })

ok(await p.evaluate(() => !('BarcodeDetector' in window)), 'el navegador simula no tener detector nativo')

const boton = p.getByRole('button', { name: /Activar cámara/ })
ok(await visible(boton),
   'aun así se ofrece escanear con la cámara (antes decía «no soportado»)')

await boton.click()
ok(await visible(p.locator('video')), 'la cámara arranca')
ok(await visible(p.getByText(/Buscando código QR/)), 'y entra en modo búsqueda')
ok(await visible(p.getByText(/lee más despacio/)),
   'avisa de que este dispositivo usa el decodificador de reserva')
await p.screenshot({ path: process.env.SCRATCH + '/tiros/40-escaner-ios.png' })

// El fragmento de jsQR debe haberse cargado solo ahora, no antes
let cargado = false
try {
  await p.waitForFunction(
    () => performance.getEntriesByType('resource').some(r => /jsQR/i.test(r.name)),
    null, { timeout: ESPERA })
  cargado = true
} catch { /* se queda en false y lo canta el ok() */ }
ok(cargado, 'el decodificador se descarga solo cuando hace falta (carga diferida)')

// ── El vídeo no arranca, pero el escáner sí ──────────────────────────────
//
// Safari y WKWebView rechazan `play()` en cuanto la política de autoarranque
// se mete por medio, justo en el iPad, que es el aparato que necesita el
// decodificador de reserva. El código hacía `await play()` antes de crear el
// lector: con play() rechazado la imagen salía, ponía «Buscando código QR…» y
// no se decodificaba ni un fotograma. Sin error visible, porque el rechazo
// caía fuera del try.
console.log('\n  — con play() rechazado, como en iOS —')
{
  const ctx2 = await nav.newContext({ permissions: ['camera'], viewport: { width: 1100, height: 800 } })
  await ctx2.addInitScript(() => {
    delete window.BarcodeDetector
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('NotAllowedError'))
  })
  const p2 = await ctx2.newPage()
  const visible2 = async (loc) => {
    try { await loc.waitFor({ state: 'visible', timeout: ESPERA }); return true }
    catch { return false }
  }

  await p2.goto(`${BASE}/escanear`, { waitUntil: 'networkidle' })
  await p2.getByRole('button', { name: /Activar cámara/ }).click()

  ok(await visible2(p2.getByText(/lee más despacio/)),
     'el decodificador se monta aunque el vídeo no llegue a reproducirse')

  let cargado2 = false
  try {
    await p2.waitForFunction(
      () => performance.getEntriesByType('resource').some(r => /jsQR/i.test(r.name)),
      null, { timeout: ESPERA })
    cargado2 = true
  } catch { /* lo canta el ok() */ }
  ok(cargado2, 'y jsQR se descarga igual: play() no es requisito para leer')

  await ctx2.close()
}

console.log(`\n${fallos === 0 && errores.length === 0 ? '✅ ESCÁNER OK SIN DETECTOR NATIVO' : `❌ ${fallos} fallo(s)`}`)
if (errores.length) errores.slice(0, 5).forEach(e => console.log('   ' + e))
await nav.close()
process.exit(fallos === 0 && errores.length === 0 ? 0 : 1)
