/**
 * Enlace directo entre dos dispositivos, sin servidor por medio.
 *
 * Dos pestañas hacen de portátil y de tablet: se emparejan intercambiando los
 * códigos que en la app irían dentro de un QR, y se mandan mensajes por el
 * canal WebRTC. Se comprueba además el troceado, porque una evidencia de
 * varios MB no cabe en un solo mensaje del canal.
 *
 *   npx --prefix frontend esbuild frontend/src/db/enlaceDirecto.ts --bundle \
 *     --format=iife --global-name=Enlace --outfile=/tmp/enlace.js
 *   node pruebas/enlace-directo.test.mjs
 */
import { readFileSync } from 'node:fs'
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()

const BUNDLE = process.env.BUNDLE || '/tmp/enlace.js'

let fallos = 0
const ok = (cond, texto, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${texto}${extra ? ` — ${extra}` : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const codigoEnlace = readFileSync(BUNDLE, 'utf8')

async function pestana(nombre) {
  const p = await navegador.newPage()
  // `about:blank` es contexto seguro (origen opaco), que es lo que WebRTC
  // exige. Antes se intentaba http://localhost primero, y eso solo funcionaba
  // en una maquina donde algo escuchase en el puerto 80.
  await p.goto('about:blank')
  await p.addScriptTag({ content: codigoEnlace })
  p.on('console', (m) => { if (m.type() === 'error') console.log(`    [${nombre}] ${m.text()}`) })
  return p
}

const A = await pestana('A')
const B = await pestana('B')

console.log('\n1. Emparejamiento por código, como lo haría el QR')

const oferta = await A.evaluate(async () => {
  window.anfitrion = await Enlace.invitar()
  return window.anfitrion.codigo
})
ok(oferta.startsWith('MICLASE1O'), 'el anfitrión genera una invitación', `${oferta.length} caracteres`)
ok(oferta.length < 1200, 'y cabe holgadamente en un QR de pantalla')

const respuesta = await B.evaluate(async (cod) => {
  window.invitado = await Enlace.aceptarInvitacion(cod)
  window.canalB = window.invitado.enlace
  return window.invitado.codigo
}, oferta)
ok(respuesta.startsWith('MICLASE1R'), 'el invitado responde', `${respuesta.length} caracteres`)

console.log('\n2. El canal se abre en los dos lados')

const abiertoA = await A.evaluate(async (cod) => {
  window.canalA = await window.anfitrion.aceptarRespuesta(cod)
  window.recibidoA = []
  window.canalA.alRecibir((m) => window.recibidoA.push(m))
  return true
}, respuesta)
ok(abiertoA === true, 'el anfitrión tiene canal')

const abiertoB = await B.evaluate(async () => {
  window.canalB = await window.canalB
  window.recibidoB = []
  window.canalB.alRecibir((m) => window.recibidoB.push(m))
  return true
})
ok(abiertoB === true, 'el invitado tiene canal')

console.log('\n3. Un mensaje de ida y otro de vuelta')

await A.evaluate(() => window.canalA.enviar({ t: 'hola', de: 'portatil' }))
await B.waitForFunction(() => window.recibidoB.length > 0, null, { timeout: 10000 })
const enB = await B.evaluate(() => window.recibidoB[0])
ok(enB?.de === 'portatil', 'lo que manda el portátil llega a la tablet', JSON.stringify(enB))

await B.evaluate(() => window.canalB.enviar({ t: 'hola', de: 'tablet' }))
await A.waitForFunction(() => window.recibidoA.length > 0, null, { timeout: 10000 })
const enA = await A.evaluate(() => window.recibidoA[0])
ok(enA?.de === 'tablet', 'y al revés', JSON.stringify(enA))

console.log('\n4. Una evidencia grande: hay que trocearla')

const TAM = 3 * 1024 * 1024
await B.evaluate((n) => {
  window.grande = 'x'.repeat(n)
  return window.canalB.enviar({ t: 'sobre', payload: window.grande })
}, TAM)
await A.waitForFunction(() => window.recibidoA.length > 1, null, { timeout: 60000 })
const grande = await A.evaluate(() => {
  const m = window.recibidoA[1]
  return { tipo: m.t, largo: m.payload.length, integro: /^x+$/.test(m.payload) }
})
ok(grande.largo === TAM, 'llega entera, sin perder ni un trozo', `${(grande.largo / 1024 / 1024).toFixed(1)} MB`)
ok(grande.integro, 'y se recompone en el orden correcto')

console.log('\n5. Códigos que no valen')

const errores = await A.evaluate(async () => {
  const out = {}
  try { await Enlace.abrirSaludo('esto no es un codigo'); out.basura = 'no falló' }
  catch (e) { out.basura = e.message }
  try { await Enlace.aceptarInvitacion(window.anfitrion.codigo.replace('MICLASE1O', 'MICLASE1R')) ; out.papeles = 'no falló' }
  catch (e) { out.papeles = e.message }
  return out
})
ok(/no es un emparejamiento/i.test(errores.basura), 'un código cualquiera se rechaza con un mensaje claro')
ok(/respuesta, no una invitación/i.test(errores.papeles), 'y confundir los papeles también')

await navegador.close()

console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ ENLACE DIRECTO CORRECTO')
process.exit(fallos ? 1 : 0)
