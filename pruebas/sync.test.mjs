import { SignJWT } from '/var/www/edumind_miclase/backend/node_modules/jose/dist/webapi/index.js'

const BASE = process.env.SYNC_API || 'http://127.0.0.1:3999/api/sync'
// El mismo secreto con el que se arranca el backend de prueba
const key = new TextEncoder().encode(
  process.env.JWT_SECRET || 'clave_de_pruebas_de_al_menos_32_caracteres')

async function token(docenteId) {
  return new SignJWT({ docente_id: docenteId, sub: `u${docenteId}`, nombre: `Docente ${docenteId}` })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(key)
}

async function api(t, ruta, init = {}) {
  const r = await fetch(BASE + ruta, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...(init.headers || {}) },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const t2 = await token(2)   // docente A
const t3 = await token(3)   // docente B (aislamiento)

// Partir de cero: otras pruebas pueden haber dejado buzón montado
await api(t2, '', { method: 'DELETE' })
await api(t3, '', { method: 'DELETE' })

console.log('\n1. Configuración del buzón')
let r = await api(t2, '/config')
ok(r.status === 200 && r.body.iniciado === false, 'buzón vacío al principio', JSON.stringify(r.body))

r = await api(t2, '/config', { method: 'POST', body: JSON.stringify({ salt: 'U0FMVA==', verificador: 'aXY=.Y2lmcmFkbw==' }) })
ok(r.status === 200, 'se publica sal y verificador')

r = await api(t2, '/config', { method: 'POST', body: JSON.stringify({ salt: 'T1RSTw==', verificador: 'eA==.eQ==' }) })
ok(r.status === 409 && r.body.codigo === 'YA_INICIADO', 'no se puede pisar la sal a ciegas')

r = await api(t2, '/config')
ok(r.body.iniciado === true && r.body.salt === 'U0FMVA==', 'la sal original se conserva')

console.log('\n2. Empuje desde el dispositivo A')
r = await api(t2, '/push', { method: 'POST', body: JSON.stringify({
  device_id: 'disp-A',
  registros: [
    { tabla: 'grupos',         registro_id: '1000001', updated_at: '2026-08-19T10:00:00.000Z', iv: 'aXYx', payload: 'Y2lmcmFkbzE=' },
    { tabla: 'alumnos',        registro_id: '1000002', updated_at: '2026-08-19T10:00:01.000Z', iv: 'aXYy', payload: 'Y2lmcmFkbzI=' },
    { tabla: 'calificaciones', registro_id: '1000003', updated_at: '2026-08-19T10:00:02.000Z', iv: 'aXYz', payload: 'Y2lmcmFkbzM=' },
  ],
})})
ok(r.status === 200 && r.body.escritos === 3, '3 registros aceptados', JSON.stringify(r.body))

console.log('\n3. Descarga desde el dispositivo B (mismo docente)')
r = await api(t2, '/pull?desde=0&excluir_device=disp-B')
ok(r.body.registros.length === 3, 'B recibe los 3 registros de A')
ok(r.body.registros[0].payload === 'Y2lmcmFkbzE=', 'el payload cifrado llega intacto')
const cursor = r.body.seq

r = await api(t2, '/pull?desde=' + cursor + '&excluir_device=disp-B')
ok(r.body.registros.length === 0, 'con el cursor al día no se repite nada')

console.log('\n4. El dispositivo que envió no se descarga a sí mismo')
r = await api(t2, '/pull?desde=0&excluir_device=disp-A')
ok(r.body.registros.length === 0, 'A no recibe de vuelta lo suyo')

console.log('\n5. Last-write-wins')
r = await api(t2, '/push', { method: 'POST', body: JSON.stringify({
  device_id: 'disp-B',
  registros: [{ tabla: 'grupos', registro_id: '1000001', updated_at: '2026-08-19T09:00:00.000Z', iv: 'dmllam8=', payload: 'dmllam8=' }],
})})
ok(r.body.escritos === 0 && r.body.descartados === 1, 'una versión más antigua se descarta')

r = await api(t2, '/push', { method: 'POST', body: JSON.stringify({
  device_id: 'disp-B',
  registros: [{ tabla: 'grupos', registro_id: '1000001', updated_at: '2026-08-19T11:00:00.000Z', iv: 'bnVldm8=', payload: 'bnVldm8=' }],
})})
ok(r.body.escritos === 1, 'una versión más nueva sí gana')

// El último que escribió fue disp-B, así que quien debe recibirla es disp-A
r = await api(t2, '/pull?desde=0&excluir_device=disp-A')
const g = r.body.registros.find(x => x.registro_id === '1000001')
ok(g && g.payload === 'bnVldm8=', 'la versión ganadora se reparte al otro dispositivo')
r = await api(t2, '/pull?desde=0&excluir_device=disp-B')
ok(!r.body.registros.find(x => x.registro_id === '1000001'),
   'el dispositivo que la escribió no la recibe de vuelta')

// Paginación: no debe quedarse en bucle aunque todo se filtre
r = await api(t2, '/pull?desde=0&limite=1&excluir_device=disp-A')
ok(r.body.seq > 0 && typeof r.body.hay_mas === 'boolean', 'la paginación avanza el cursor', JSON.stringify({seq:r.body.seq, hay_mas:r.body.hay_mas}))

console.log('\n6. Rechazo de tablas desconocidas')
r = await api(t2, '/push', { method: 'POST', body: JSON.stringify({
  device_id: 'disp-A',
  registros: [{ tabla: 'docentes', registro_id: '9', updated_at: '2026-08-19T12:00:00.000Z', iv: 'eA==', payload: 'eA==' }],
})})
ok(r.body.escritos === 0 && r.body.descartados === 1, 'no se acepta escribir en una tabla que no es de aula')

console.log('\n7. Aislamiento entre docentes')
r = await api(t3, '/config')
ok(r.body.iniciado === false && r.body.registros === 0, 'el docente 3 no ve nada del docente 2')
r = await api(t3, '/pull?desde=0')
ok(r.body.registros.length === 0, 'el pull del docente 3 sale vacío')

console.log('\n8. Borrado del buzón')
r = await api(t2, '', { method: 'DELETE' })
ok(r.status === 200 && r.body.borrados === 3, 'se borran los 3 sobres', JSON.stringify(r.body))
r = await api(t2, '/config')
ok(r.body.iniciado === false && r.body.registros === 0, 'el buzón queda limpio')

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
