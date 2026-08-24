/**
 * El emparejamiento directo, desde la pantalla y no desde los módulos.
 *
 * Dos pestañas hacen de portátil y de tablet y recorren el flujo tal cual lo
 * haría el docente. Se usa la vía de «pegar el código a mano» en vez del QR
 * porque una cámara no puede leer la pantalla de otra pestaña; el código que
 * se pega es exactamente el mismo que va dentro del QR.
 *
 * La tablet tiene /api/ cortado: si la pantalla necesitara el servidor para
 * algo de esto, la prueba fallaría.
 *
 * Requiere vite en :5173 (el backend solo hace falta para que arranque la app).
 */
import { chromium } from '/var/www/pasos_v2/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:5173'
const CONTRASENA = 'melocoton-bicicleta-42'

let fallos = 0
const ok = (c, m, extra = '') => {
  console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!c) fallos++
}

const navegador = await chromium.launch()
const llamadasAlApi = []

async function dispositivo(sinServidor = false) {
  const ctx = await navegador.newContext({ viewport: { width: 1100, height: 900 } })
  if (sinServidor) {
    await ctx.route('**/api/**', (r) => {
      llamadasAlApi.push(new URL(r.request().url()).pathname)
      return r.abort()
    })
  }
  const p = await ctx.newPage()
  await p.goto(`${BASE}/sincronizar`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Sincronizar con otro dispositivo', { timeout: 15000 })
  return p
}

const A = await dispositivo()
const B = await dispositivo(true)

console.log('\n1. La sección aparece sin haber iniciado sesión')
ok(await B.getByRole('button', { name: 'Invitar al otro dispositivo' }).isVisible(),
  'la tablet, sin sesión y sin servidor, puede emparejar igualmente')

console.log('\n2. El portátil crea una clase y estrena la contraseña')
await A.evaluate(async (pass) => {
  const sync = await import('/src/db/sync.ts')
  const q = await import('/src/db/queries.ts')
  await sync.estrenarSincronizacionLocal(pass)
  const g = await q.crearGrupo({
    nombre: '6ºA', etapa: 'primaria', curso: '6',
    comunidad: 'Galicia', curso_escolar: '2025-2026', color: '#1a4a7a',
  })
  await q.crearAlumno({ nombre: 'Xoán', apellidos: 'Lema', neae: 0 }, g)
}, CONTRASENA)
ok(true, 'contraseña creada sin pasar por el servidor')

console.log('\n3. Emparejamiento por la pantalla')

await A.getByRole('button', { name: 'Invitar al otro dispositivo' }).click()
await A.waitForSelector('img[alt="Código de emparejamiento"]', { timeout: 15000 })
ok(true, 'el portátil enseña su QR')

await A.getByText('¿La cámara no lee el código?').click()
const invitacion = await A.locator('textarea[aria-label="Código de emparejamiento en texto"]').inputValue()
ok(invitacion.startsWith('MICLASE1O'), 'y ofrece el mismo código en texto', `${invitacion.length} caracteres`)

await B.getByRole('button', { name: 'Escanear una invitación' }).click()
await B.getByText('Pegar el código a mano').click()
await B.locator('textarea[aria-label="Pegar el código de emparejamiento"]').fill(invitacion)
await B.getByRole('button', { name: 'Usar este código' }).click()

await B.waitForSelector('img[alt="Código de emparejamiento"]', { timeout: 15000 })
await B.getByText('¿La cámara no lee el código?').click()
const respuesta = await B.locator('textarea[aria-label="Código de emparejamiento en texto"]').inputValue()
ok(respuesta.startsWith('MICLASE1R'), 'la tablet responde con el suyo', `${respuesta.length} caracteres`)

await A.getByRole('button', { name: /Ya lo ha escaneado/ }).click()
await A.getByText('Pegar el código a mano').click()
await A.locator('textarea[aria-label="Pegar el código de emparejamiento"]').fill(respuesta)
await A.getByRole('button', { name: 'Usar este código' }).click()

console.log('\n4. La tablet pide la contraseña al otro aparato, no al servidor')
await B.waitForSelector('text=Este dispositivo todavía no está desbloqueado', { timeout: 20000 })
ok(true, 'sabe que el portátil ya tenía contraseña y la pide para desbloquear')

await B.locator('input[aria-label="Contraseña de sincronización"]').fill(CONTRASENA)
await B.getByRole('button', { name: 'Desbloquear y sincronizar' }).click()

console.log('\n5. Los datos viajan')
await B.waitForSelector('text=Listo:', { timeout: 30000 })
// El contador vive en el div que envuelve al <strong>Listo:</strong>
const resumen = (await B.locator('strong', { hasText: 'Listo:' }).first()
  .locator('xpath=..').textContent() || '').replace(/\s+/g, ' ').trim()
ok(/recibidos/.test(resumen), 'la tablet informa del resultado', resumen.slice(0, 90))

const enB = await B.evaluate(async () => {
  const { db } = await import('/src/db/localDb.ts')
  return {
    grupos: (await db.grupos.toArray()).map((g) => g.nombre),
    alumnos: (await db.alumnos.toArray()).map((a) => `${a.nombre} ${a.apellidos}`),
  }
})
ok(enB.grupos.includes('6ºA'), 'la clase está en la tablet', enB.grupos.join(', '))
ok(enB.alumnos.includes('Xoán Lema'), 'y el alumnado también', enB.alumnos.join(', '))

console.log('\n6. Nada de esto ha tocado el buzón')
const deSync = llamadasAlApi.filter((u) => u.startsWith('/api/sync'))
ok(deSync.length === 0, 'la tablet no ha llamado al buzón ni una vez', deSync.join(', ') || 'ninguna')

await navegador.close()
console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ EMPAREJAMIENTO POR PANTALLA CORRECTO')
process.exit(fallos ? 1 : 0)
