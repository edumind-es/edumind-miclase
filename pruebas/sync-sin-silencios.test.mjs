/**
 * Sincronizar sin servidor no puede fallar callado.
 *
 * Los casos de esta suite son los que dejaban al docente delante de una
 * pantalla que no decía nada, con dos aparatos que no se pasaban los datos:
 *
 *  - Ninguno tenía contraseña y cada uno creaba la suya: dos claves distintas.
 *  - Dos aparatos con contraseñas creadas por separado «sincronizaban» sin
 *    poder abrir nada del otro, y después ya no mandaban nada.
 *  - Por fichero: sin contraseña no había forma de empezar, los errores al
 *    recibir no se enseñaban y cancelar la hoja de compartir perdía el envío.
 *
 * Dos pestañas hacen de portátil y de tablet. El código del QR se pega a mano,
 * que es el mismo contenido. Lo que se comprueba al final es lo guardado.
 */
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH, { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'

let fallos = 0
const ok = (c, m, extra = '') => {
  console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!c) fallos++
}
const navegador = await chromium.launch()
const errores = []

/** Un aparato nuevo, con su propia base de datos. `compartir` simula la hoja del sistema. */
async function dispositivo(nombre, { compartir } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1100, height: 1000 }, acceptDownloads: true })
  if (compartir) {
    await ctx.addInitScript((modo) => {
      navigator.canShare = () => true
      navigator.share = async () => {
        if (window.__compartir === 'cancelar' || (modo === 'cancelar' && window.__compartir == null)) {
          throw new DOMException('cancelado', 'AbortError')
        }
      }
    }, compartir)
  }
  const p = await ctx.newPage()
  p.on('pageerror', e => errores.push(`${nombre}: ${e.message}`))
  await p.goto(`${BASE}/sincronizar`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('text=Sincronizar con otro dispositivo', { timeout: 15000 })
  return p
}

const crearClase = (p, nombre, alumno) => p.evaluate(async ([n, a]) => {
  const q = await import('/src/db/queries.ts')
  const g = await q.crearGrupo({ nombre: n, etapa: 'primaria', curso: '6', comunidad: 'Galicia', curso_escolar: '2025-2026', color: '#1a4a7a' })
  await q.crearAlumno({ nombre: a, apellidos: 'Prueba', neae: 0 }, g)
}, [nombre, alumno])
const estrenar = (p, pass) => p.evaluate(async (c) => {
  const sync = await import('/src/db/sync.ts'); await sync.estrenarSincronizacionLocal(c)
}, pass)
const datos = (p) => p.evaluate(async () => {
  const { db } = await import('/src/db/localDb.ts')
  const sync = await import('/src/db/sync.ts')
  return {
    grupos: (await db.grupos.toArray()).map(g => g.nombre).sort(),
    sal: (await sync.configLocal()).salt,
  }
})
const aparece = (loc, ms = 20000) => loc.waitFor({ timeout: ms }).then(() => true, () => false)
const qr = (p) => p.locator('.card').filter({ hasText: 'Sincronizar con otro dispositivo, sin servidor' })
const fichero = (p) => p.locator('.card').filter({ hasText: 'Pasar los datos con un fichero' })

/** Empareja A (invita) con B (responde) pegando los códigos. */
async function emparejar(A, B) {
  await qr(A).getByRole('button', { name: 'Invitar al otro dispositivo' }).click()
  await A.waitForSelector('img[alt="Código de emparejamiento"]', { timeout: 15000 })
  await A.getByText('¿La cámara no lee el código?').click()
  const invitacion = await A.locator('textarea[aria-label="Código de emparejamiento en texto"]').inputValue()
  await qr(B).getByRole('button', { name: 'Escanear una invitación' }).click()
  await B.getByText('Pegar el código a mano').click()
  await B.locator('textarea[aria-label="Pegar el código de emparejamiento"]').fill(invitacion)
  await B.getByRole('button', { name: 'Usar este código' }).click()
  await B.waitForSelector('img[alt="Código de emparejamiento"]', { timeout: 15000 })
  const espera = await qr(B).getByRole('status').textContent()
  await B.getByText('¿La cámara no lee el código?').click()
  const respuesta = await B.locator('textarea[aria-label="Código de emparejamiento en texto"]').inputValue()
  await A.getByRole('button', { name: /Ya lo ha escaneado/ }).click()
  await A.getByText('Pegar el código a mano').click()
  await A.locator('textarea[aria-label="Pegar el código de emparejamiento"]').fill(respuesta)
  await A.getByRole('button', { name: 'Usar este código' }).click()
  return espera
}
const clave = (p) => qr(p).locator('input[aria-label="Contraseña de sincronización"]')

try {
  console.log('\n1. Ninguno de los dos tiene contraseña: la crea solo quien invita')
  {
    const A = await dispositivo('A1'), B = await dispositivo('B1')
    await crearClase(A, 'Del portátil', 'Ana')
    await crearClase(B, 'De la tablet', 'Bruno')
    const espera = await emparejar(A, B)
    ok(/No cierres ni cambies de app/.test(espera || ''), 'mientras espera, la tablet dice qué espera y qué no hacer', (espera || '').trim().slice(0, 60))
    ok(await aparece(qr(B).getByText(/Créala en el OTRO dispositivo/)), 'la tablet manda crear la contraseña en el otro')
    ok(await aparece(qr(A).getByText(/Elige una larga que puedas recordar/)), 'el portátil, que invitó, es quien la crea')

    await clave(B).fill('melocoton-bicicleta-42')
    await qr(B).getByRole('button', { name: 'Desbloquear y sincronizar' }).click()
    ok(await aparece(qr(B).getByText(/Crea primero la contraseña en el otro dispositivo/)),
      'si la tablet se adelanta, no crea una segunda contraseña: lo dice')
    ok((await datos(B)).sal == null, 'y no ha guardado ninguna')

    await clave(A).fill('melocoton-bicicleta-42')
    await qr(A).getByRole('button', { name: 'Crear contraseña y sincronizar' }).click()
    await B.waitForTimeout(800)
    await clave(B).fill('otra-cosa-distinta-99')
    await qr(B).getByRole('button', { name: 'Desbloquear y sincronizar' }).click()
    ok(await aparece(qr(B).getByText(/Contraseña de sincronización incorrecta/)), 'una contraseña distinta en la tablet se rechaza')
    await clave(B).fill('melocoton-bicicleta-42')
    await qr(B).getByRole('button', { name: 'Desbloquear y sincronizar' }).click()

    ok(await aparece(qr(B).getByText('Listo:'), 40000) && await aparece(qr(A).getByText('Listo:'), 40000), 'los dos terminan')
    const a = await datos(A), b = await datos(B)
    ok(a.sal && a.sal === b.sal, 'con la MISMA contraseña (misma sal) en los dos')
    ok(a.grupos.join() === 'De la tablet,Del portátil' && b.grupos.join() === a.grupos.join(),
      'y cada uno tiene las dos clases', `${a.grupos.join(' + ')} | ${b.grupos.join(' + ')}`)
    await A.context().close(); await B.context().close()
  }

  console.log('\n2. Contraseñas creadas por separado: se detecta y se unifican')
  {
    const A = await dispositivo('A2'), B = await dispositivo('B2')
    await estrenar(A, 'la-del-portatil-2026'); await crearClase(A, 'Del portátil', 'Ana')
    // Las mismas letras no bastan: cada creación tiene su sal y da otra clave.
    await estrenar(B, 'la-del-portatil-2026'); await crearClase(B, 'De la tablet', 'Bruno')
    ok((await datos(A)).sal !== (await datos(B)).sal, 'dos contraseñas creadas aparte son distintas aunque se escriban igual')
    await emparejar(A, B)
    ok(await aparece(qr(B).getByText(/contraseñas de sincronización distintas/)), 'la tablet lo detecta antes de pasar nada y lo explica')
    ok(await aparece(qr(A).getByText(/escribe allí la contraseña de ESTE dispositivo/)), 'el portátil dice dónde hay que escribirla')
    await clave(B).fill('no-es-esta-contrasena')
    await qr(B).getByRole('button', { name: 'Unificar y sincronizar' }).click()
    ok(await aparece(qr(B).getByText(/Contraseña de sincronización incorrecta/)), 'una contraseña que no es la del portátil se rechaza')
    await clave(B).fill('la-del-portatil-2026')
    await qr(B).getByRole('button', { name: 'Unificar y sincronizar' }).click()
    ok(await aparece(qr(B).getByText('Listo:'), 40000) && await aparece(qr(A).getByText('Listo:'), 40000), 'los dos terminan')
    ok(await qr(B).getByText(/no se han podido abrir/).count() === 0 && await qr(A).getByText(/no se han podido abrir/).count() === 0,
      'sin ningún registro imposible de abrir')
    const a = await datos(A), b = await datos(B)
    ok(a.sal === b.sal, 'la tablet ha adoptado la contraseña del portátil')
    ok(a.grupos.length === 2 && b.grupos.join() === a.grupos.join(), 'y los datos han viajado en los dos sentidos', `${a.grupos.join(' + ')} | ${b.grupos.join(' + ')}`)
    await A.context().close(); await B.context().close()
  }

  console.log('\n3. Por fichero, desde cero y sin QR')
  {
    const A = await dispositivo('A3'), B = await dispositivo('B3')
    await crearClase(A, 'Del portátil', 'Ana')
    ok(await aparece(fichero(A).getByText(/aún no tiene contraseña de sincronización/)), 'sin contraseña, la tarjeta lo dice y ofrece crearla')
    ok(await fichero(A).getByRole('button', { name: /Descargar paquete/ }).isDisabled(), 'y no deja enviar hasta tenerla')
    await fichero(A).getByRole('button', { name: 'Crear la contraseña en este dispositivo' }).click()
    await fichero(A).getByLabel('Contraseña de sincronización nueva').fill('por-fichero-2026-ok')
    await fichero(A).getByLabel('Repetir la contraseña nueva').fill('por-fichero-2026-ok')
    await fichero(A).getByRole('button', { name: 'Crear', exact: true }).click()
    ok(await aparece(fichero(A).getByText(/Contraseña creada en este dispositivo/)), 'la contraseña se crea aquí, sin servidor y sin QR')

    const [descarga] = await Promise.all([A.waitForEvent('download'), fichero(A).getByRole('button', { name: /Descargar paquete/ }).click()])
    const ruta = join(process.env.SCRATCH, 'paquete-a3.json')
    await descarga.saveAs(ruta)
    ok(await aparece(fichero(A).getByText(/Paquete descargado con \d+ registros/)), 'el envío dice cuántos registros lleva')
    const cuantos = async () => Number(/con (\d+) registros/.exec(await fichero(A).getByText(/Paquete descargado con/).textContent())?.[1])
    const primero = await cuantos()

    await B.locator('input[data-uso="paquete"]').setInputFiles(ruta)
    ok(await aparece(fichero(B).getByText(/aún no tiene la sincronización desbloqueada/)), 'la tablet pide la contraseña del paquete')
    await fichero(B).getByLabel('Contraseña del paquete').fill('mal-mal-mal-mal')
    await fichero(B).getByRole('button', { name: 'Desbloquear y aplicar' }).click()
    ok(await aparece(fichero(B).getByText(/Contraseña de sincronización incorrecta/)), 'una contraseña mala se dice')
    await fichero(B).getByLabel('Contraseña del paquete').fill('por-fichero-2026-ok')
    await fichero(B).getByRole('button', { name: 'Desbloquear y aplicar' }).click()
    ok(await aparece(fichero(B).getByText(/Paquete aplicado: \d+ registros nuevos/)), 'al aplicar dice cuántos registros han entrado')
    ok((await datos(B)).grupos.join() === 'Del portátil', 'y la clase está en la tablet')

    await B.locator('input[data-uso="paquete"]').setInputFiles(ruta)
    ok(await aparece(fichero(B).getByText(/ya los tenía todos al día/)), 'recibir el mismo paquete otra vez también dice algo')

    ok(await aparece(fichero(A).getByText(/Enviar todo de nuevo/)), 'el portátil ofrece reenviarlo todo si el paquete se perdió')
    // Sin cambios, el paquete siguiente solo repite el registro del límite
    // (el cursor es inclusivo a propósito, para no saltarse los que comparten sello).
    await Promise.all([A.waitForEvent('download'), fichero(A).getByRole('button', { name: /Descargar paquete/ }).click()])
    await A.waitForTimeout(400)
    const segundo = await cuantos()
    ok(segundo < primero, 'sin cambios, el paquete siguiente lleva solo lo del límite, no todo', `${primero} → ${segundo}`)
    await Promise.all([A.waitForEvent('download'), fichero(A).getByRole('button', { name: 'Enviar todo de nuevo' }).click()])
    await A.waitForTimeout(400)
    const tercero = await cuantos()
    ok(tercero === primero, '«Enviar todo de nuevo» vuelve a sacarlo entero', `${tercero} registros`)

    console.log('\n4. Un paquete cifrado con otra contraseña')
    const C = await dispositivo('C3')
    await estrenar(C, 'la-propia-de-c-2026'); await crearClase(C, 'De C', 'Carla')
    await C.locator('input[data-uso="paquete"]').setInputFiles(ruta)
    ok(await aparece(fichero(C).getByText(/cifrado con una contraseña distinta/)), 'se detecta antes de aplicar nada, en vez de fallar registro a registro')
    await fichero(C).getByLabel('Contraseña del paquete').fill('por-fichero-2026-ok')
    await fichero(C).getByRole('button', { name: 'Unificar y aplicar' }).click()
    ok(await aparece(fichero(C).getByText(/Paquete aplicado/)), 'con la contraseña del paquete se unifica y se aplica')
    const c = await datos(C)
    ok(c.grupos.join() === 'De C,Del portátil' && c.sal === (await datos(A)).sal, 'conserva lo suyo, recibe lo del otro y comparte contraseña', c.grupos.join(' + '))
    await A.context().close(); await B.context().close(); await C.context().close()
  }

  console.log('\n5. Cancelar la hoja de compartir no da el envío por hecho')
  {
    const A = await dispositivo('A5', { compartir: 'cancelar' })
    await estrenar(A, 'con-hoja-de-compartir'); await crearClase(A, 'Del iPad', 'Ana')
    await A.reload(); await A.waitForSelector('text=Pasar los datos con un fichero')
    await fichero(A).getByRole('button', { name: /Enviar a otro dispositivo/ }).click()
    ok(await aparece(fichero(A).getByText(/Envío cancelado: no se ha mandado nada/)), 'al cerrar la hoja lo dice')
    await A.evaluate(() => { window.__compartir = 'ok' })
    await fichero(A).getByRole('button', { name: /Enviar a otro dispositivo/ }).click()
    ok(await aparece(fichero(A).getByText(/Paquete enviado con \d+ registros/)), 'y el siguiente intento manda lo mismo, no «nada nuevo»')
    await A.context().close()
  }

  ok(errores.length === 0, 'sin errores de página', errores.join(' | '))
} catch (e) {
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}
console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ SINCRONIZAR SIN SILENCIOS CORRECTO')
process.exit(fallos ? 1 : 0)
