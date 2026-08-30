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
const ESPERA = 15000
const visible = async (loc) => {
  try { await loc.waitFor({ state: 'visible', timeout: ESPERA }); return true }
  catch { return false }
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

console.log(`\n${fallos === 0 && errores.length === 0 ? '✅ ESCÁNER OK SIN DETECTOR NATIVO' : `❌ ${fallos} fallo(s)`}`)
if (errores.length) errores.slice(0, 5).forEach(e => console.log('   ' + e))
await nav.close()
process.exit(fallos === 0 && errores.length === 0 ? 0 : 1)
