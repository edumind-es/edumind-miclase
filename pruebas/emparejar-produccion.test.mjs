/**
 * Comprobación del emparejamiento contra PRODUCCIÓN.
 *
 * No repite lo que ya cubren las otras pruebas: aquí lo que se verifica es que
 * el paquete compilado funciona sirviéndose desde https://miclase.edumind.es
 * con sus cabeceras reales —la CSP, la Permissions-Policy— y que el canal
 * WebRTC llega a abrirse.
 *
 * No escribe nada en el buzón del servidor: los dos navegadores son efímeros y
 * todo el trasiego va de uno a otro.
 *
 *   node pruebas/emparejar-produccion.test.mjs
 */
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()

const BASE = process.env.BASE || 'https://miclase.edumind.es'

let fallos = 0
const ok = (c, m, extra = '') => {
  console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!c) fallos++
}

const navegador = await chromium.launch()
const problemasCSP = []

async function pestana(nombre) {
  const ctx = await navegador.newContext({ viewport: { width: 1100, height: 900 } })
  const p = await ctx.newPage()
  // Una CSP mal puesta se nota aquí: el navegador lo dice por consola.
  p.on('console', (m) => {
    const t = m.text()
    if (/Content Security Policy|Refused to/i.test(t)) problemasCSP.push(`[${nombre}] ${t}`)
  })
  p.on('pageerror', (e) => problemasCSP.push(`[${nombre}] ${e.message}`))
  await p.goto(`${BASE}/sincronizar`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Sincronizar con otro dispositivo', { timeout: 25000 })
  return p
}

console.log(`\n1. La app compilada carga desde ${BASE}`)
const A = await pestana('A')
const B = await pestana('B')
ok(true, 'la sección de emparejamiento se dibuja en producción')

console.log('\n2. WebRTC arranca con la CSP de producción puesta')
await A.getByRole('button', { name: 'Invitar al otro dispositivo' }).click()
await A.waitForSelector('img[alt="Código de emparejamiento"]', { timeout: 25000 })
await A.getByText('¿La cámara no lee el código?').click()
const invitacion = await A.locator('textarea[aria-label="Código de emparejamiento en texto"]').inputValue()
ok(invitacion.startsWith('MICLASE1O'), 'la invitación se genera', `${invitacion.length} caracteres`)

console.log('\n3. El segundo dispositivo responde y el canal se abre')
await B.getByRole('button', { name: 'Escanear una invitación' }).click()
await B.getByText('Pegar el código a mano').click()
await B.locator('textarea[aria-label="Pegar el código de emparejamiento"]').fill(invitacion)
await B.getByRole('button', { name: 'Usar este código' }).click()
await B.waitForSelector('img[alt="Código de emparejamiento"]', { timeout: 25000 })
await B.getByText('¿La cámara no lee el código?').click()
const respuesta = await B.locator('textarea[aria-label="Código de emparejamiento en texto"]').inputValue()
ok(respuesta.startsWith('MICLASE1R'), 'la respuesta se genera', `${respuesta.length} caracteres`)

await A.getByRole('button', { name: /Ya lo ha escaneado/ }).click()
await A.getByText('Pegar el código a mano').click()
await A.locator('textarea[aria-label="Pegar el código de emparejamiento"]').fill(respuesta)
await A.getByRole('button', { name: 'Usar este código' }).click()

// Los dos están sin estrenar, así que al conectar deben pedir contraseña nueva.
// Que lleguen ahí demuestra que el canal se abrió y que se hablaron.
await B.waitForSelector('text=Ninguno de los dos dispositivos tiene todavía contraseña', { timeout: 40000 })
ok(true, 'el canal directo se abre y los dos aparatos se entienden')

console.log('\n4. Sin quejas del navegador')
ok(problemasCSP.length === 0, 'ni la CSP ni ningún error de página han estorbado',
  problemasCSP.slice(0, 3).join(' | ') || 'ninguna')

await navegador.close()
console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ PRODUCCIÓN CORRECTA')
process.exit(fallos ? 1 : 0)
