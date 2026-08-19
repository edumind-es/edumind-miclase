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
import { chromium } from '/var/www/pasos_v2/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'

process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
let fallos = 0
const ok = (c, m, e = '') => { console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${e ? ' — ' + e : ''}`); if (!c) fallos++ }

const nav = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const ctx = await nav.newContext({ permissions: ['camera'], viewport: { width: 1100, height: 800 } })
// Quitar el detector nativo antes de que cargue nada: así se comporta como WKWebView
await ctx.addInitScript(() => { delete window.BarcodeDetector })
const p = await ctx.newPage()
const errores = []
p.on('pageerror', e => errores.push(e.message))

await p.goto('http://127.0.0.1:5173/escanear', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)

ok(await p.evaluate(() => !('BarcodeDetector' in window)), 'el navegador simula no tener detector nativo')
ok(await p.getByRole('button', { name: /Activar cámara/ }).isVisible(),
   'aun así se ofrece escanear con la cámara (antes decía «no soportado»)')

await p.getByRole('button', { name: /Activar cámara/ }).click()
await p.waitForTimeout(3000)
ok(await p.locator('video').isVisible(), 'la cámara arranca')
ok(await p.getByText(/Buscando código QR/).isVisible(), 'y entra en modo búsqueda')
ok(await p.getByText(/lee más despacio/).isVisible(),
   'avisa de que este dispositivo usa el decodificador de reserva')
await p.screenshot({ path: process.env.SCRATCH + '/tiros/40-escaner-ios.png' })

// El fragmento de jsQR debe haberse cargado solo ahora, no antes
const cargado = await p.evaluate(() =>
  performance.getEntriesByType('resource').some(r => /jsQR/i.test(r.name)))
ok(cargado, 'el decodificador se descarga solo cuando hace falta (carga diferida)')

console.log(`\n${fallos === 0 && errores.length === 0 ? '✅ ESCÁNER OK SIN DETECTOR NATIVO' : `❌ ${fallos} fallo(s)`}`)
if (errores.length) errores.slice(0, 5).forEach(e => console.log('   ' + e))
await nav.close()
process.exit(fallos === 0 && errores.length === 0 ? 0 : 1)
