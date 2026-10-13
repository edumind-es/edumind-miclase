/**
 * Copia automática en carpeta, de punta a punta: activar, copiar, perder el
 * almacén y restaurar.
 *
 * La carpeta de verdad la elige el docente en un diálogo del sistema que no
 * se puede automatizar; aquí `showDirectoryPicker` devuelve el sistema de
 * ficheros privado del navegador (OPFS), que es un `FileSystemDirectoryHandle`
 * real: se escribe, se lista, se guarda en IndexedDB y sobrevive al borrado
 * de la base de datos de la app. Es decir, el mismo camino que recorre la
 * app, con la única diferencia de quién elige la carpeta.
 */
import { mkdirSync } from 'node:fs'
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const CONTRASENA = 'copia-de-prueba-2026'

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1400, height: 950 } })
await ctx.addInitScript(() => {
  // La «carpeta elegida» es el OPFS: un handle real sin diálogo.
  window.showDirectoryPicker = () => navigator.storage.getDirectory()
})
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
// Solo errores: el aviso de Dexie al borrar la base lo provoca la propia prueba en el paso 4.
p.on('console', m => { if (m.type() === 'error') erroresConsola.push(`CONSOLE error: ${m.text().slice(0, 300)}`) })
const foto = n => p.screenshot({ path: `${process.env.SCRATCH}/tiros/${n}.png`, fullPage: true })

/** Qué hay en la carpeta: nombres y el manifiesto. */
const carpeta = () => p.evaluate(async () => {
  const dir = await navigator.storage.getDirectory()
  const nombres = []
  for await (const [n, h] of dir.entries()) if (h.kind === 'file') nombres.push(n)
  let manifiesto = null
  try { manifiesto = JSON.parse(await (await (await dir.getFileHandle('MiClase.copia.json')).getFile()).text()) } catch {}
  return { nombres: nombres.sort(), manifiesto }
})
const tablas = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const leer = (tabla) => new Promise((res) => {
    const tx = db.transaction(tabla, 'readonly').objectStore(tabla).getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  return { grupos: (await leer('grupos')).map(g => g.nombre), alumnos: (await leer('alumnos')).map(a => a.apellidos).sort() }
})
const ponerMeta = (pares) => p.evaluate(async (pares) => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  await new Promise((res) => {
    const tx = db.transaction('meta', 'readwrite')
    for (const [clave, valor] of pares) tx.objectStore('meta').put({ clave, valor })
    tx.oncomplete = res
  })
}, pares)

const tarjeta = p.locator('[data-copia-carpeta]')
const msg = (re) => tarjeta.locator('[data-copia-msg]').getByText(re).waitFor({ timeout: 8000 }).then(() => true, () => false)

try {
  console.log('\n1. Una clase con dos alumnos y la contraseña de sincronización')
  await p.goto(BASE + '/grupos/nuevo', { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  await p.getByPlaceholder('Ej: 3ºA, 5ºB…').fill('4ºC')
  await p.locator('select').first().selectOption('primaria')
  await p.locator('select').nth(1).selectOption('4')
  await p.locator('select').nth(2).selectOption('Galicia')
  await p.getByRole('button', { name: /Crear grupo/ }).click()
  await p.waitForURL(/\/grupos\/\d+/)
  await p.getByRole('link', { name: 'Alumnado', exact: true }).click()
  await p.waitForTimeout(500)
  await p.getByRole('button', { name: /Importar lista/ }).click()
  await p.getByPlaceholder('Pega aquí la lista de alumnado…').fill('Abad Ríos, Ana\nBello Souto, Bruno')
  await p.getByRole('button', { name: /Analizar/ }).click()
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: /Confirmar e importar/ }).click()
  await p.getByText(/2 alumnos creados/).waitFor({ timeout: 8000 })
  await p.getByRole('button', { name: 'Cerrar' }).click()
  await p.evaluate(async (c) => { const m = await import('/src/db/sync.ts'); await m.estrenarSincronizacionLocal(c) }, CONTRASENA)

  console.log('\n2. Activar la copia en una carpeta: escribe el manifiesto y un paquete')
  await p.goto(BASE + '/sincronizar', { waitUntil: 'networkidle' })
  await tarjeta.waitFor({ timeout: 8000 })
  // Si la tarjeta no llega a cargar su estado, que se vea por qué.
  const sonda = await p.evaluate(async () => {
    const salida = {}
    for (const [n, f] of [
      ['destino', async () => (await import('/src/db/destinoCopia.ts')).destinoGuardado()],
      ['ultima', async () => (await import('/src/db/copia.ts')).ultimaCopia()],
      ['diag', async () => (await import('/src/db/copia.ts')).diagnostico()],
      ['clave', async () => !!(await (await import('/src/db/sync.ts')).claveGuardada())],
    ]) { try { salida[n] = JSON.stringify(await f())?.slice(0, 80) } catch (e) { salida[n] = 'ERROR ' + e.message } }
    return salida
  })
  ok(!Object.values(sonda).some(v => String(v).startsWith('ERROR')), 'la tarjeta puede leer su estado', JSON.stringify(sonda))
  await tarjeta.locator('[data-copia-activar]').first().click()
  ok(await msg(/Copia hecha: \d+ registros nuevos en copia-/), 'dice cuántos registros ha copiado y en qué fichero')
  let c = await carpeta()
  ok(c.nombres.includes('MiClase.copia.json') && c.nombres.filter(n => n.startsWith('copia-')).length === 1, 'la carpeta tiene el manifiesto y un paquete', c.nombres.join(' '))
  ok(c.manifiesto?.ficheros === 1 && typeof c.manifiesto.salt === 'string' && typeof c.manifiesto.ultima === 'string', 'el manifiesto lleva sal, verificador y la última copia', JSON.stringify(c.manifiesto).slice(0, 120))
  ok(/última copia: /.test(await tarjeta.locator('[data-copia-estado]').textContent()), 'y la tarjeta enseña el destino y la hora')
  await foto('copia-01-activada')

  console.log('\n3. Copiar ahora sin cambios no escribe nada; con cambios, un paquete más')
  await tarjeta.locator('[data-copia-ahora]').click()
  ok(await msg(/no había nada nuevo/), 'sin cambios lo dice, y no inventa un fichero')
  c = await carpeta()
  ok(c.manifiesto?.ficheros === 1, 'sigue habiendo un solo paquete')
  await p.goto(BASE + '/alumnos', { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: /Importar lista/ }).click()
  // Dos líneas: con una sola, el analizador no sabe si es «Apellidos, Nombre».
  await p.getByPlaceholder('Pega aquí la lista de alumnado…').fill('Casal Vidal, Carla\nDíaz Pena, Darío')
  await p.getByRole('button', { name: /Analizar/ }).click()
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: /Confirmar e importar/ }).click()
  await p.getByText(/2 alumnos creados/).waitFor({ timeout: 8000 })
  await p.goto(BASE + '/sincronizar', { waitUntil: 'networkidle' })
  await tarjeta.locator('[data-copia-ahora]').click()
  ok(await msg(/Copia hecha: \d+ registro/), 'con alumnos nuevos hay copia')
  c = await carpeta()
  ok(c.manifiesto?.ficheros === 2 && c.nombres.filter(n => n.startsWith('copia-')).length === 2, 'y la carpeta tiene dos paquetes', c.nombres.join(' '))

  console.log('\n4. El navegador vacía el almacén: la app arranca de cero')
  await p.evaluate(async () => {
    localStorage.clear(); sessionStorage.clear()
    await new Promise(res => { const d = indexedDB.deleteDatabase('miclase_db'); d.onsuccess = d.onerror = d.onblocked = () => res() })
  })
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  ok(await p.getByText(/Bienvenido a EDUmind MiClase/).count() === 1, 'sin clases: pantalla de bienvenida')
  c = await carpeta()
  ok(c.manifiesto?.ficheros === 2, 'la carpeta sigue intacta: la copia vive fuera del almacén de la app')

  console.log('\n5. Restaurar desde la carpeta, con la contraseña')
  await p.goto(BASE + '/sincronizar', { waitUntil: 'networkidle' })
  await tarjeta.waitFor({ timeout: 8000 })
  await tarjeta.locator('[data-copia-restaurar]').click()
  const form = tarjeta.locator('[data-copia-restaurar-form]')
  await form.waitFor({ timeout: 8000 })
  ok(/2 ficheros/.test(await form.textContent()), 'dice cuántos ficheros hay en la copia', (await form.textContent()).slice(0, 100))
  ok(await form.locator('input[type="password"]').count() === 1, 'y pide la contraseña: este aparato ya no la tiene')
  await form.locator('input[type="password"]').fill('otra-contrasena-mal')
  await tarjeta.locator('[data-copia-restaurar-confirmar]').click()
  ok(await msg(/❌|no se pudieron descifrar|Contraseña incorrecta|incorrecta/i), 'con otra contraseña no se restaura nada y se dice', await tarjeta.locator('[data-copia-msg]').textContent().catch(() => ''))
  await p.reload({ waitUntil: 'networkidle' })
  await tarjeta.locator('[data-copia-restaurar]').click()
  await form.waitFor({ timeout: 8000 })
  await form.locator('input[type="password"]').fill(CONTRASENA)
  await tarjeta.locator('[data-copia-restaurar-confirmar]').click()
  ok(await msg(/Restaurado desde .*2 ficheros leídos · \d+ registros restaurados/), 'con la buena, restaura y lo cuenta', await tarjeta.locator('[data-copia-msg]').textContent().catch(() => ''))
  const t = await tablas()
  ok(t.grupos.includes('4ºC') && t.alumnos.length === 4, 'la clase y los cuatro alumnos han vuelto', JSON.stringify(t))
  ok(/Destino: /.test(await tarjeta.locator('[data-copia-estado]').textContent()), 'la carpeta queda como destino de la copia automática')
  await foto('copia-02-restaurada')

  console.log('\n6. El aviso de Inicio: solo cuando la copia es vieja')
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  ok(await p.locator('[data-aviso-copia]').count() === 0, 'con copia reciente, Inicio no avisa')
  const hace = (d) => new Date(Date.now() - d * 86_400_000).toISOString()
  await ponerMeta([['copia_ultima', hace(30)], ['copia_primer_uso', hace(60)]])
  await p.reload({ waitUntil: 'networkidle' })
  await p.locator('[data-aviso-copia]').waitFor({ timeout: 8000 })
  ok(/hace 30 días/.test(await p.locator('[data-aviso-copia]').textContent()), 'con la última copia de hace 30 días, avisa y dice cuántos')
  await ponerMeta([['copia_ultima', null]])
  await p.reload({ waitUntil: 'networkidle' })
  await p.locator('[data-aviso-copia]').waitFor({ timeout: 8000 })
  ok(/60 días usando la app sin ninguna copia/.test(await p.locator('[data-aviso-copia]').textContent()), 'sin ninguna copia y con uso, avisa')
  await foto('copia-03-aviso')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('copia-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  if (erroresConsola.length) console.log('  consola:', erroresConsola.slice(0, 5).join('\n           '))
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
