/**
 * Sincronización directa entre dos dispositivos, SIN servidor.
 *
 * Es la prueba del punto 0.b del ROADMAP: que una tablet recién estrenada
 * pueda desbloquear y recibir el curso entero del portátil sin que el buzón de
 * EDUmind participe en nada. Para que no quede duda, a la tablet se le corta
 * el acceso a `/api/` a nivel de red: si algo suyo necesitara el servidor,
 * esta prueba fallaría.
 *
 * El portátil sí usa el servidor al principio, pero solo para estrenar la
 * sincronización como se hace hoy; a partir de ahí ya no se toca.
 *
 * Requiere:
 *   backend de PRUEBA en :3999 con JWT_SECRET=clave_de_pruebas_de_al_menos_32_caracteres
 *   vite en :5173 con VITE_API_TARGET=http://127.0.0.1:3999
 */
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
import { SignJWT } from '/var/www/edumind_miclase/backend/node_modules/jose/dist/webapi/index.js'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const API = process.env.API || 'http://127.0.0.1:3999'
const SECRETO = 'clave_de_pruebas_de_al_menos_32_caracteres'
const CONTRASENA = 'melocoton-bicicleta-42'

let fallos = 0
const ok = (c, m, extra = '') => {
  console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!c) fallos++
}

const token = await new SignJWT({ docente_id: 2, sub: 'authentik-sub-de-prueba', nombre: 'Luis Vilela' })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('2h')
  .sign(new TextEncoder().encode(SECRETO))

await fetch(`${API}/api/sync`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })

const navegador = await chromium.launch()
const errores = []
const apiTocadaPorB = []

async function dispositivo(nombre, { sinServidor = false } = {}) {
  const ctx = await navegador.newContext()
  await ctx.addInitScript(([t, n]) => {
    sessionStorage.setItem('miclase_session_token', t)
    sessionStorage.setItem('miclase_nombre', n)
  }, [token, 'Luis Vilela'])

  if (sinServidor) {
    // Cualquier intento de hablar con el servidor se corta y se apunta, para
    // poder distinguir despues lo que es arranque de la app de lo que seria
    // sincronizacion.
    await ctx.route('**/api/**', (ruta) => {
      apiTocadaPorB.push(new URL(ruta.request().url()).pathname)
      return ruta.abort()
    })
  }

  const p = await ctx.newPage()
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`))
  await p.goto(BASE, { waitUntil: 'domcontentloaded' })
  // Los módulos se cargan directamente del servidor de desarrollo: así la
  // prueba ataca el código real y no una copia empaquetada aparte.
  await p.evaluate(async () => {
    window.sync = await import('/src/db/sync.ts')
    window.queries = await import('/src/db/queries.ts')
    window.enlace = await import('/src/db/enlaceDirecto.ts')
    window.localDb = await import('/src/db/localDb.ts')
    window.cabeceras = () => ({ Authorization: 'Bearer ' + sessionStorage.getItem('miclase_session_token') })
  })
  return p
}

const A = await dispositivo('portatil')
const B = await dispositivo('tablet', { sinServidor: true })

console.log('\n1. El portátil tiene un curso montado')

await A.evaluate(async (pass) => {
  await window.sync.iniciarSincronizacion(pass, window.cabeceras, true)
  const g = await window.queries.crearGrupo({
    nombre: '5ºB', etapa: 'primaria', curso: '5',
    comunidad: 'Galicia', curso_escolar: '2025-2026', color: '#1a4a7a',
  })
  await window.queries.crearAlumno({ nombre: 'Uxía', apellidos: 'Ferreiro', neae: 0 }, g)
  await window.queries.crearAlumno({ nombre: 'Brais', apellidos: 'Outeiro', neae: 1 }, g)
}, CONTRASENA)

const enA = await A.evaluate(async () => ({
  grupos: await window.localDb.db.grupos.count(),
  alumnos: await window.localDb.db.alumnos.count(),
  salt: !!(await window.sync.configLocal()).salt,
}))
ok(enA.grupos === 1 && enA.alumnos === 2, 'el portátil tiene su clase y su alumnado')
ok(enA.salt, 'y guarda la sal en el propio dispositivo, no solo en el servidor')

console.log('\n2. La tablet está en blanco y sin acceso al servidor')

const enB0 = await B.evaluate(async () => ({
  grupos: await window.localDb.db.grupos.count(),
  clave: !!(await window.sync.claveGuardada()),
}))
ok(enB0.grupos === 0, 'la tablet arranca vacía')
ok(!enB0.clave, 'y sin la sincronización desbloqueada')

console.log('\n3. Se emparejan por código, como haría el QR')

const oferta = await A.evaluate(async () => {
  window.anfitrion = await window.enlace.invitar()
  return window.anfitrion.codigo
})
const respuesta = await B.evaluate(async (cod) => {
  window.invitado = await window.enlace.aceptarInvitacion(cod)
  window.canal = window.invitado.enlace
  return window.invitado.codigo
}, oferta)
ok(oferta.startsWith('MICLASE1O') && respuesta.startsWith('MICLASE1R'),
  'los dos códigos se generan', `${oferta.length} y ${respuesta.length} caracteres`)

await A.evaluate(async (cod) => {
  window.canal = await window.anfitrion.aceptarRespuesta(cod)
  window.sync.atenderEnlace(window.canal)      // a la escucha desde ya
}, respuesta)
await B.evaluate(async () => {
  window.canal = await window.canal
  window.sync.atenderEnlace(window.canal)
})
ok(true, 'el canal directo queda abierto en los dos')

console.log('\n4. La tablet desbloquea preguntándole al portátil, no al servidor')

const malaClave = await B.evaluate(async () => {
  try {
    await window.sync.desbloquearPorEnlace('contraseña-que-no-es', window.canal)
    return 'no falló'
  } catch (e) { return e.message }
})
ok(/incorrecta/i.test(malaClave), 'con la contraseña equivocada no desbloquea', malaClave)

const desbloqueada = await B.evaluate(async (pass) => {
  await window.sync.desbloquearPorEnlace(pass, window.canal)
  return !!(await window.sync.claveGuardada())
}, CONTRASENA)
ok(desbloqueada, 'con la correcta, sí')

console.log('\n5. El curso viaja del portátil a la tablet')

const [resA, resB] = await Promise.all([
  A.evaluate(() => window.sync.sincronizarPorEnlace(window.canal)),
  B.evaluate(() => window.sync.sincronizarPorEnlace(window.canal)),
])

const enB = await B.evaluate(async () => ({
  grupos: await window.localDb.db.grupos.toArray(),
  alumnos: (await window.localDb.db.alumnos.toArray()).map((a) => `${a.nombre} ${a.apellidos}`).sort(),
}))
ok(enB.grupos.length === 1 && enB.grupos[0].nombre === '5ºB',
  'la clase aparece en la tablet', enB.grupos[0]?.nombre)
ok(enB.alumnos.length === 2, 'con su alumnado completo', enB.alumnos.join(', '))
ok(enB.alumnos.includes('Uxía Ferreiro'), 'descifrado correctamente, con acentos incluidos')
ok(resA.errores.length === 0 && resB.errores.length === 0,
  'sin errores por el camino', [...resA.errores, ...resB.errores].join(' | ') || 'ninguno')

console.log('\n6. Y de vuelta: lo que se crea en la tablet llega al portátil')

await B.evaluate(async () => {
  const g = (await window.localDb.db.grupos.toArray())[0]
  await window.queries.crearAlumno({ nombre: 'Antía', apellidos: 'Rial', neae: 0 }, g.id)
})

const oferta2 = await A.evaluate(async () => {
  window.anfitrion2 = await window.enlace.invitar()
  return window.anfitrion2.codigo
})
const respuesta2 = await B.evaluate(async (cod) => {
  window.invitado2 = await window.enlace.aceptarInvitacion(cod)
  window.canal2 = window.invitado2.enlace
  return window.invitado2.codigo
}, oferta2)
await A.evaluate(async (cod) => {
  window.canal2 = await window.anfitrion2.aceptarRespuesta(cod)
  window.sync.atenderEnlace(window.canal2)
}, respuesta2)
await B.evaluate(async () => {
  window.canal2 = await window.canal2
  window.sync.atenderEnlace(window.canal2)
})

await Promise.all([
  A.evaluate(() => window.sync.sincronizarPorEnlace(window.canal2)),
  B.evaluate(() => window.sync.sincronizarPorEnlace(window.canal2)),
])

const alumnosA = await A.evaluate(async () =>
  (await window.localDb.db.alumnos.toArray()).map((a) => `${a.nombre} ${a.apellidos}`).sort())
ok(alumnosA.includes('Antía Rial'), 'la alumna creada en la tablet aparece en el portátil', alumnosA.join(', '))
ok(alumnosA.length === 3, 'y no se ha perdido nada de lo anterior')

console.log('\n7. Los identificadores de los dos aparatos no chocan')
const ids = await A.evaluate(async () => (await window.localDb.db.alumnos.toArray()).map((a) => a.id))
ok(new Set(ids).size === ids.length, 'no hay dos registros con el mismo id', ids.join(', '))

console.log('\n8. El servidor no ha pintado nada en la sincronizacion')
const deSync = apiTocadaPorB.filter((u) => u.startsWith('/api/sync'))
ok(deSync.length === 0, 'la tablet no ha llamado al buzon ni una sola vez',
  deSync.join(', ') || 'ninguna llamada')
// Lo unico que toca el servidor es el arranque de la app (sesion), y en un
// dispositivo sin conexion tampoco impide usarla: aqui se aborto y siguio.
ok(apiTocadaPorB.every((u) => u.startsWith('/api/auth')),
  'lo unico que intento fue la sesion al arrancar, y aun asi funciono todo',
  [...new Set(apiTocadaPorB)].join(', ') || 'nada')

const buzon = await fetch(`${API}/api/sync/pull?desde=0&limite=500&excluir_device=x`,
  { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
ok(buzon.registros.length === 0, 'y el buzón del servidor sigue vacío',
  `${buzon.registros.length} sobres`)

await navegador.close()

if (errores.length) {
  console.log('\nErrores de consola:')
  for (const e of errores.slice(0, 10)) console.log('  ' + e)
}
console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ SINCRONIZACIÓN DIRECTA CORRECTA')
process.exit(fallos ? 1 : 0)
