/**
 * Buzón cerrado por configuración (`MICLASE_BUZON=cerrado`).
 *
 * El buzón es un añadido opcional: quien aloja el servidor puede cerrarlo
 * sin borrar nada. Lo que se vigila:
 *  - El servidor lo anuncia en `/api/sync/disponible`, sin sesión, y sigue
 *    sirviendo lo demás (salud, currículo).
 *  - Todo `/api/sync` responde 410 con `BUZON_CERRADO`… salvo vaciarlo: el
 *    docente tiene que poder borrar lo que dejó (derecho de supresión).
 *  - El de siempre, sin la variable, sigue abierto: actualizar el servidor
 *    no lo cierra por sorpresa.
 *  - La app, con el buzón cerrado, no ofrece la cuenta y lo dice en
 *    Sincronizar.
 */
import { moduloDe, navegadorChromium } from './lib/entorno.mjs'
const { SignJWT } = await moduloDe('backend', 'jose/dist/webapi/index.js')

const CERRADO = process.env.API_CERRADO
const ABIERTO = process.env.API
const BASE = process.env.BASE
const key = new TextEncoder().encode(process.env.JWT_SECRET || 'clave_de_pruebas_de_al_menos_32_caracteres')
const token = await new SignJWT({ docente_id: 2, sub: 'u2', nombre: 'Docente 2' })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(key)
const conSesion = { Authorization: `Bearer ${token}` }

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const pedir = async (base, ruta, opciones = {}) => {
  const r = await fetch(base + ruta, opciones)
  return { status: r.status, cuerpo: await r.json().catch(() => ({})) }
}

console.log('\n1. Servidor con el buzón cerrado')
{
  const d = await pedir(CERRADO, '/api/sync/disponible')
  ok(d.status === 200 && d.cuerpo.abierto === false, 'anuncia que no hay buzón, sin pedir sesión')
  ok((await pedir(CERRADO, '/api/health')).status === 200, 'lo demás sigue en pie')
  const cfg = await pedir(CERRADO, '/api/sync/config', { headers: conSesion })
  ok(cfg.status === 410 && cfg.cuerpo.codigo === 'BUZON_CERRADO', 'leer el buzón: 410 BUZON_CERRADO', String(cfg.status))
  const push = await pedir(CERRADO, '/api/sync/push', {
    method: 'POST', headers: { ...conSesion, 'Content-Type': 'application/json' }, body: JSON.stringify({ registros: [] }),
  })
  ok(push.status === 410, 'subir sobres: 410', String(push.status))
  ok((await pedir(CERRADO, '/api/sync/pull?desde=0', { headers: conSesion })).status === 410, 'bajar sobres: 410')
  const vaciar = await pedir(CERRADO, '/api/sync/', { method: 'DELETE', headers: conSesion })
  ok(vaciar.status === 200 && vaciar.cuerpo.ok === true, 'vaciarlo sí se puede: el docente borra lo que dejó', String(vaciar.status))
  // Sin token el backend ve al docente local (id 1), que no tiene buzón: 403.
  const sinSesion = await pedir(CERRADO, '/api/sync/', { method: 'DELETE' })
  ok(sinSesion.status === 401 || sinSesion.status === 403, 'pero vaciar sigue exigiendo sesión', String(sinSesion.status))
}

console.log('\n2. Servidor de siempre, sin la variable')
{
  const d = await pedir(ABIERTO, '/api/sync/disponible')
  ok(d.status === 200 && d.cuerpo.abierto === true, 'el buzón sigue abierto por defecto')
}

console.log('\n3. La app ante un buzón cerrado')
{
  const chromium = await navegadorChromium()
  const navegador = await chromium.launch()
  const p = await navegador.newPage()
  // El servidor de desarrollo habla con el backend abierto: se le contesta
  // como contestaría uno cerrado.
  await p.route('**/api/sync/disponible', r => r.fulfill({ json: { abierto: false } }))
  try {
    await p.goto(BASE + '/sincronizar', { waitUntil: 'networkidle' })
    await p.locator('[data-buzon-cerrado]').waitFor({ timeout: 10000 })
    ok(true, 'Sincronizar dice que este servidor no tiene buzón')
    ok(!(await p.getByRole('button', { name: /Conectar EDUmind|Conectar con EDUmind/ }).count()), 'y no ofrece la cuenta en ningún sitio')
    ok(await p.evaluate(() => localStorage.getItem('miclase.buzon.cerrado')) === '1',
      'lo recuerda en el aparato, para que el aviso de copia no cuente el buzón')
    await p.unroute('**/api/sync/disponible')
    await p.reload({ waitUntil: 'networkidle' })
    await p.waitForTimeout(500)
    ok(!(await p.locator('[data-buzon-cerrado]').count()), 'si el servidor lo vuelve a abrir, la tarjeta del buzón vuelve')
    ok(await p.evaluate(() => localStorage.getItem('miclase.buzon.cerrado')) === '0', 'y el recuerdo se actualiza')
  } finally {
    await navegador.close()
  }
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
