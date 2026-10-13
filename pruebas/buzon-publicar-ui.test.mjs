/**
 * Contraseña creada sin buzón (AirDrop / enlace directo) y después cuenta
 * EDUmind: la pantalla de Sincronizar no debe intentar sincronizar contra un
 * buzón sin configurar; debe ofrecer publicar la contraseña que ya tiene, y
 * tras publicarla todo funciona y el otro aparato desbloquea con la misma.
 */
import { mkdirSync } from 'node:fs'
import { moduloDe, navegadorChromium } from './lib/entorno.mjs'

const { SignJWT } = await moduloDe('backend', 'jose/dist/webapi/index.js')
const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const API = process.env.API || 'http://127.0.0.1:3999'
const SECRETO = 'clave_de_pruebas_de_al_menos_32_caracteres'
const CONTRASENA = 'melocoton-bicicleta-42'

let fallos = 0
const ok = (c, m, extra = '') => { console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`); if (!c) fallos++ }

const token = await new SignJWT({ docente_id: 2, sub: 'authentik-sub-de-prueba', nombre: 'Luis Vilela' })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('2h')
  .sign(new TextEncoder().encode(SECRETO))
await fetch(`${API}/api/sync`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })

const navegador = await chromium.launch()
const errores = []
async function dispositivo(nombre) {
  const ctx = await navegador.newContext({ viewport: { width: 1400, height: 950 } })
  await ctx.addInitScript(([t, n]) => {
    sessionStorage.setItem('miclase_session_token', t)
    sessionStorage.setItem('miclase_nombre', n)
  }, [token, 'Luis Vilela'])
  const p = await ctx.newPage()
  p.on('pageerror', e => errores.push(`[${nombre}] ${e.message}`))
  return { ctx, p }
}

try {
  const A = await dispositivo('A')
  await A.p.goto(BASE + '/', { waitUntil: 'networkidle' })

  console.log('\n1. A estrena la contraseña sin buzón (como para AirDrop) y crea una clase')
  await A.p.evaluate(async (c) => {
    const m = await import('/src/db/sync.ts')
    await m.estrenarSincronizacionLocal(c)
  }, CONTRASENA)
  await A.p.goto(BASE + '/grupos/nuevo', { waitUntil: 'networkidle' })
  await A.p.getByPlaceholder('Ej: 3ºA, 5ºB…').fill('4ºC')
  await A.p.locator('select').first().selectOption('primaria')
  await A.p.locator('select').nth(1).selectOption('4')
  await A.p.locator('select').nth(2).selectOption('Galicia')
  await A.p.getByRole('button', { name: /Crear grupo/ }).click()
  await A.p.waitForURL(/\/grupos\/\d+/)

  console.log('\n2. En Sincronizar: desbloqueado, buzón sin configurar, y se ofrece publicar')
  await A.p.getByRole('link', { name: 'Sincronizar', exact: true }).click()
  await A.p.locator('[data-publicar-buzon]').waitFor({ timeout: 8000 })
  ok(await A.p.getByText('Desbloqueado').count() === 1, 'el aparato está desbloqueado')
  ok(await A.p.getByText('Sin configurar').count() === 1, 'y el buzón sin configurar')
  ok(await A.p.getByRole('button', { name: /Sincronizar ahora/ }).count() === 0, 'no se ofrece «Sincronizar ahora» contra un buzón vacío')
  ok(await A.p.getByText(/registro\(s\) con problemas/).count() === 0, 'ni hay errores de tandas rechazadas')
  await A.p.screenshot({ path: process.env.SCRATCH + '/tiros/buzon-01-publicar.png' })

  console.log('\n3. Publicar la contraseña en el buzón')
  await A.p.getByRole('button', { name: /Publicar mi contraseña en el buzón/ }).click()
  await A.p.getByText(/Contraseña publicada en el buzón/).waitFor({ timeout: 8000 })
  const cfg = await (await fetch(`${API}/api/sync/config`, { headers: { Authorization: `Bearer ${token}` } })).json()
  ok(cfg.iniciado === true && typeof cfg.salt === 'string' && cfg.salt.length > 0, 'el servidor tiene ya sal y verificador', JSON.stringify(cfg).slice(0, 80))
  await A.p.getByRole('button', { name: /Sincronizar ahora/ }).waitFor({ timeout: 8000 })
  await A.p.getByRole('button', { name: /Sincronizar ahora/ }).click()
  await A.p.waitForTimeout(4000)
  const resumen = await A.p.locator('text=/Enviados \\d+/').first().innerText().catch(() => '')
  ok(/Enviados [1-9]/.test(resumen), 'y A envía sus datos al buzón', resumen)

  console.log('\n4. B desbloquea con la misma contraseña y recibe la clase')
  const B = await dispositivo('B')
  await B.p.goto(BASE + '/sincronizar', { waitUntil: 'networkidle' })
  await B.p.waitForTimeout(1200)
  await B.p.getByPlaceholder('Contraseña de sincronización', { exact: true }).fill(CONTRASENA)
  await B.p.getByRole('button', { name: /Desbloquear/ }).click()
  await B.p.getByText(/Dispositivo desbloqueado/).waitFor({ timeout: 8000 })
  await B.p.getByRole('button', { name: /Sincronizar ahora/ }).click()
  await B.p.waitForTimeout(4000)
  await B.p.getByRole('link', { name: 'Mis clases', exact: true }).click()
  await B.p.waitForTimeout(1200)
  ok(await B.p.getByText('4ºC').count() >= 1, 'B ve la clase de A')

  ok(errores.length === 0, 'sin errores de página', errores.join(' | '))
} catch (e) {
  console.log('  ✗ EXCEPCIÓN', e.message); fallos++
} finally { await navegador.close() }

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
