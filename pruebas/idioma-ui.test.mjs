/**
 * Castellano o galego desde la interfaz, y la página «Instalar MiClase».
 *
 * Lo que se vigila: que un aparato sin idioma elegido pregunte al abrir (en
 * los dos idiomas), que elegir galego cambie el menú, el Inicio y `<html
 * lang>` y se recuerde al recargar, que el selector del menú vuelva al
 * castellano sin recargar, y que la página de instalar enseñe las tres formas
 * con la descarga apuntando a la última versión de GitHub.
 *
 * Con BASE apuntando a la versión descargable servida por su lanzador
 * (`MICLASE_PUERTO=8766 python3 servidor.py`) prueba también ese paquete.
 */
import { navegadorChromium, menuPrincipal, elegirIdioma, idiomaMarcado, irAInstalar } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
const BASE = process.env.BASE || 'http://127.0.0.1:5173'

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const errores = []

try {
  console.log('\n1. Aparato nuevo: pregunta el idioma')
  const ctx = await navegador.newContext({ viewport: { width: 1300, height: 900 }, locale: 'gl-ES' })
  // El navegador de pruebas nace con el castellano elegido; aquí se quiere ver la pregunta.
  // Solo en la primera carga: después manda lo que elija la prueba.
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('prueba.idioma')) {
      sessionStorage.setItem('prueba.idioma', '1')
      localStorage.removeItem('miclase.idioma')
    }
  })
  const p = await ctx.newPage()
  p.on('pageerror', e => errores.push(e.message))
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const dialogo = p.locator('[data-elegir-idioma]')
  await dialogo.waitFor({ timeout: 10000 })
  const texto = await dialogo.innerText()
  ok(/Elige el idioma/.test(texto) && /Escolle o idioma/.test(texto), 'la pregunta va en castellano y en galego')
  ok(await dialogo.locator('[data-idioma="gl"].btn-primary').count() === 1, 'con el navegador en galego, propone galego')

  console.log('\n2. Elegir galego')
  await dialogo.locator('[data-idioma="gl"]').click()
  await dialogo.waitFor({ state: 'detached' })
  ok(await p.evaluate(() => localStorage.getItem('miclase.idioma')) === 'gl', 'queda guardado en miclase.idioma')
  ok(await p.evaluate(() => document.documentElement.lang) === 'gl', '<html lang="gl">')
  const menu = await menuPrincipal(p).innerText()
  ok(/Cualificador/.test(menu) && /Titorías/.test(menu) && /As miñas clases/.test(menu), 'el menú sale en galego', menu.replace(/\s+/g, ' ').slice(0, 120))
  ok(await p.getByText('Benvida/o a EDUmind MiClase').count() === 1, 'la bienvenida sale en galego')

  await p.reload({ waitUntil: 'networkidle' })
  ok(await p.locator('[data-elegir-idioma]').count() === 0, 'al recargar no vuelve a preguntar')
  ok(/Cualificador/.test(await menuPrincipal(p).innerText()), 'y sigue en galego')

  console.log('\n3. Volver al castellano desde el menú')
  await elegirIdioma(p, 'es')
  await menuPrincipal(p).filter({ hasText: 'Calificador' }).waitFor()
  ok(await p.evaluate(() => document.documentElement.lang) === 'es', '<html lang="es">')
  ok(await p.getByText('Bienvenido a EDUmind MiClase').count() === 1, 'el Inicio cambia sin recargar')
  ok(await idiomaMarcado(p, 'es'), 'el selector marca el castellano')

  console.log('\n4. Instalar MiClase')
  await irAInstalar(p)
  await p.locator('[data-instalar-pagina]').waitFor()
  for (const o of ['navegador', 'descargable', 'centro']) {
    ok(await p.locator(`[data-instalar-opcion="${o}"]`).count() === 1, `enseña la opción «${o}»`)
  }
  const href = await p.locator('[data-instalar-descargar]').getAttribute('href')
  ok(href === 'https://github.com/edumind-es/edumind-miclase/releases/latest/download/miclase.zip',
    'la descarga apunta a la última versión de GitHub', href)
  await elegirIdioma(p, 'gl')
  await p.getByText('A túa propia copia, para sempre').waitFor()
  ok(true, 'la página de instalar también cambia a galego')

  ok(errores.length === 0, 'sin errores en la página', errores.join(' | '))
  await ctx.close()
} catch (e) {
  console.error(e)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n✗ ${fallos} fallos` : '\n✓ Idioma e instalación: todo bien')
process.exit(fallos ? 1 : 0)
