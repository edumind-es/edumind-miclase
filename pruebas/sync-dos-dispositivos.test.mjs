/**
 * Sincronización de extremo a extremo entre DOS dispositivos, de verdad.
 *
 * Es la parte que no se puede comprobar con el backend solo: el cifrado, el
 * descifrado y la fusión ocurren en el navegador. Aquí se levantan dos
 * contextos de Chromium —cada uno con su propio IndexedDB y su propia base de
 * identificadores, como dos aparatos distintos— y se comprueba que lo que
 * escribe uno aparece en el otro, que el servidor no puede leerlo, y que al
 * chocar gana la última escritura.
 *
 * Requiere:
 *   backend de PRUEBA en :3999 con JWT_SECRET=clave_de_pruebas_de_al_menos_32_caracteres
 *   vite en :5173 con VITE_API_TARGET=http://127.0.0.1:3999
 */
import { moduloDe, navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
const { SignJWT } = await moduloDe('backend', 'jose/dist/webapi/index.js')
import { mkdirSync } from 'node:fs'

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

// Dejar el buzón limpio antes de empezar
await fetch(`${API}/api/sync`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })

const navegador = await chromium.launch()
const errores = []

/** Cada contexto es un dispositivo: IndexedDB y localStorage propios. */
async function dispositivo(nombre) {
  const ctx = await navegador.newContext({ viewport: { width: 1400, height: 950 } })
  await ctx.addInitScript(([t, n]) => {
    sessionStorage.setItem('miclase_session_token', t)
    sessionStorage.setItem('miclase_nombre', n)
  }, [token, 'Luis Vilela'])
  const p = await ctx.newPage()
  p.on('pageerror', e => errores.push(`[${nombre}] ${e.message}`))
  p.on('console', m => { if (m.type() === 'error') errores.push(`[${nombre}] ${m.text()}`) })
  return { ctx, p, nombre }
}

const sincronizar = async (p) => {
  await p.getByRole('link', { name: 'Sincronizar', exact: true }).click()
  await p.waitForTimeout(1200)
  await p.getByRole('button', { name: /Sincronizar ahora/ }).click()
  await p.waitForTimeout(3000)
}

// ── Dispositivo A: portátil del aula ────────────────────────────────────
console.log('\n1. Dispositivo A — crear el curso')
const A = await dispositivo('A')
await A.p.goto(BASE, { waitUntil: 'networkidle' })
await A.p.waitForTimeout(1200)
ok(await A.p.getByText('Conectado con EDUmind').isVisible(), 'A entra con sesión EDUmind')

await A.p.getByRole('link', { name: /Crear la primera clase|Crear mi primera clase/ }).first().click()
await A.p.waitForURL('**/grupos/nuevo')
await A.p.getByPlaceholder('Ej: 3ºA, 5ºB…').fill('4ºC')
await A.p.getByRole('button', { name: /Crear grupo/ }).click()
await A.p.waitForURL('**/grupos')

await A.p.getByRole('link', { name: 'Alumnado', exact: true }).click()
await A.p.waitForTimeout(600)
await A.p.getByRole('button', { name: /Importar lista/ }).click()
await A.p.getByPlaceholder('Pega aquí la lista de alumnado…').fill('Rivas Pena, Noa\nSeoane Lois, Iago')
await A.p.getByRole('button', { name: /Analizar/ }).click()
await A.p.waitForTimeout(300)
await A.p.getByRole('button', { name: /Confirmar e importar/ }).click()
await A.p.waitForTimeout(900)
await A.p.getByRole('button', { name: 'Cerrar', exact: true }).click()
ok(true, 'A crea la clase 4ºC con dos alumnas/os')

console.log('\n2. Dispositivo A — activar la sincronización')
await A.p.getByRole('link', { name: 'Sincronizar', exact: true }).click()
await A.p.waitForTimeout(1400)
await A.p.getByPlaceholder('Contraseña de sincronización', { exact: true }).fill(CONTRASENA)
await A.p.getByPlaceholder('Repite la contraseña', { exact: true }).fill(CONTRASENA)
await A.p.getByRole('button', { name: /Activar sincronización/ }).click()
await A.p.waitForTimeout(2500)
ok(await A.p.getByText(/Sincronización activada/).isVisible(), 'A crea la contraseña de sincronización')

await A.p.getByRole('button', { name: /Sincronizar ahora/ }).click()
await A.p.waitForTimeout(4000)
const resumenA = await A.p.locator('text=/Enviados \\d+/').first().innerText().catch(() => '')
ok(/Enviados [1-9]/.test(resumenA), 'A envía sus datos al buzón', resumenA)
await A.p.screenshot({ path: process.env.SCRATCH + '/tiros/20-sync-A.png' })

console.log('\n3. El servidor NO puede leer nada')
const enBuzon = await fetch(`${API}/api/sync/pull?desde=0&limite=500`, {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json())
ok(enBuzon.registros.length > 0, 'hay sobres en el buzón', `${enBuzon.registros.length} sobres`)
const todo = JSON.stringify(enBuzon)
ok(!todo.includes('Rivas'), 'el apellido «Rivas» NO aparece en lo que guarda el servidor')
ok(!todo.includes('Noa'), 'el nombre «Noa» NO aparece')
ok(!todo.includes('4ºC'), 'el nombre de la clase NO aparece')
ok(enBuzon.registros.every(r => r.iv && r.payload), 'cada sobre lleva su vector de inicialización y su carga cifrada')
ok(enBuzon.registros.every(r => r.tabla && r.updated_at), 'el servidor solo ve tabla y fecha, para poder repartir')

console.log('\n4. Dispositivo B — la tablet, desde cero')
const B = await dispositivo('B')
await B.p.goto(BASE, { waitUntil: 'networkidle' })
await B.p.waitForTimeout(1200)
const clasesEnB = await B.p.locator('text=4ºC').count()
ok(clasesEnB === 0, 'B arranca vacía, sin ninguna clase')

await B.p.getByRole('link', { name: 'Sincronizar', exact: true }).click()
await B.p.waitForTimeout(1500)
await B.p.getByPlaceholder('Contraseña de sincronización', { exact: true }).fill('contrasena-equivocada')
await B.p.getByRole('button', { name: /Desbloquear/ }).click()
await B.p.waitForTimeout(2500)
ok(await B.p.getByText(/Contraseña de sincronización incorrecta/).isVisible(),
   'con la contraseña equivocada B no puede descifrar nada')

await B.p.getByPlaceholder('Contraseña de sincronización', { exact: true }).fill(CONTRASENA)
await B.p.getByRole('button', { name: /Desbloquear/ }).click()
await B.p.waitForTimeout(2500)
ok(await B.p.getByText(/Dispositivo desbloqueado/).isVisible(), 'con la correcta, B se desbloquea')

await B.p.getByRole('button', { name: /Sincronizar ahora/ }).click()
await B.p.waitForTimeout(5000)
await B.p.screenshot({ path: process.env.SCRATCH + '/tiros/21-sync-B.png' })

console.log('\n5. B ha recibido el curso de A')
await B.p.getByRole('link', { name: 'Inicio', exact: true }).click()
await B.p.waitForTimeout(1500)
ok(await B.p.getByText('4ºC').first().isVisible(), 'la clase 4ºC aparece en la tablet')
await B.p.getByRole('link', { name: 'Alumnado', exact: true }).click()
await B.p.waitForTimeout(1200)
ok(await B.p.getByText('Rivas Pena').first().isVisible(), 'el alumnado llegó descifrado correctamente')
ok(await B.p.getByText('Seoane Lois').first().isVisible(), 'los dos alumnos, no solo uno')
await B.p.screenshot({ path: process.env.SCRATCH + '/tiros/22-sync-B-alumnado.png' })

console.log('\n6. B cambia algo y A lo recibe')
await B.p.getByRole('link', { name: 'Mis clases', exact: true }).click()
await B.p.waitForTimeout(900)
await B.p.getByRole('link', { name: /Nueva clase/ }).click()
await B.p.waitForURL('**/grupos/nuevo')
await B.p.getByPlaceholder('Ej: 3ºA, 5ºB…').fill('2ºB desde la tablet')
await B.p.getByRole('button', { name: /Crear grupo/ }).click()
await B.p.waitForURL('**/grupos')
await B.p.waitForTimeout(600)
await sincronizar(B.p)

await sincronizar(A.p)
await A.p.getByRole('link', { name: 'Inicio', exact: true }).click()
await A.p.waitForTimeout(1600)
ok(await A.p.getByText('2ºB desde la tablet').first().isVisible(),
   'lo creado en la tablet aparece en el portátil')
ok(await A.p.getByText('4ºC').first().isVisible(), 'y lo suyo sigue estando')
await A.p.screenshot({ path: process.env.SCRATCH + '/tiros/23-sync-A-fusionado.png' })

console.log('\n7. Los identificadores de los dos dispositivos no chocan')
const idsA = await A.p.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const g = await new Promise(res => { const t = db.transaction('grupos','readonly').objectStore('grupos').getAll(); t.onsuccess = () => res(t.result) })
  db.close()
  return { base: Number(localStorage.getItem('miclase_device_base')), grupos: g.map(x => ({ id: x.id, nombre: x.nombre })) }
})
const idsB = await B.p.evaluate(() => Number(localStorage.getItem('miclase_device_base')))
ok(idsA.base !== idsB, 'cada dispositivo tiene su propia base de identificadores', `A=${idsA.base} B=${idsB}`)
ok(new Set(idsA.grupos.map(g => g.id)).size === idsA.grupos.length,
   'tras fusionar no hay dos clases con el mismo id', JSON.stringify(idsA.grupos))

console.log('\n8. Gana la última escritura')
// A renombra la clase; B la renombra después; al sincronizar debe quedar la de B
await A.p.getByRole('link', { name: 'Inicio', exact: true }).click(); await A.p.waitForTimeout(800)
const renombrar = async (p, nombreNuevo) => {
  await p.evaluate(async (nuevo) => {
    const db = await new Promise(res => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
    const st = db.transaction('grupos','readwrite').objectStore('grupos')
    const todos = await new Promise(res => { const t = st.getAll(); t.onsuccess = () => res(t.result) })
    const g = todos.find(x => x.nombre.startsWith('4ºC'))
    g.nombre = nuevo
    g.updated_at = new Date().toISOString()
    await new Promise(res => { const t = db.transaction('grupos','readwrite').objectStore('grupos').put(g); t.onsuccess = () => res() })
    db.close()
  }, nombreNuevo)
}
await renombrar(A.p, '4ºC (renombrada en el portátil)')
await sincronizar(A.p)
await new Promise(r => setTimeout(r, 1200))
await renombrar(B.p, '4ºC (renombrada en la tablet)')
await sincronizar(B.p)
await sincronizar(A.p)

await A.p.getByRole('link', { name: 'Inicio', exact: true }).click()
await A.p.waitForTimeout(1600)
ok(await A.p.getByText('4ºC (renombrada en la tablet)').first().isVisible(),
   'el portátil adopta el nombre que puso la tablet, por ser posterior')
ok((await A.p.getByText('4ºC (renombrada en el portátil)').count()) === 0,
   'y el nombre anterior desaparece')

console.log(`\n${fallos === 0 && errores.length === 0 ? '✅ SINCRONIZACIÓN CORRECTA' : `❌ ${fallos} FALLO(S)`}`)
if (errores.length) { console.log('\n⚠️  Errores de consola:'); errores.slice(0, 10).forEach(e => console.log('   ' + e)) }
await navegador.close()
process.exit(fallos === 0 && errores.length === 0 ? 0 : 1)
