/**
 * El escáner de hojas de respuestas, contra la hoja que imprime la app.
 *
 * Se imprime la hoja de muestra en el navegador, se rellenan burbujas como lo
 * haría el alumnado (una limpia, una tachada y corregida, una doble, una a
 * medias) y se «fotografía»: la captura se pinta girada, en perspectiva y
 * sobre un fondo oscuro, y eso es lo que lee `leerHoja`. Lo que se vigila:
 * que encuentre las marcas con la hoja torcida y del revés, que lea el QR,
 * que acierte las burbujas limpias, que marque como dudosas las que lo son
 * y que una foto sin hoja no invente nada.
 */
import { createRequire } from 'node:module'
import { navegadorChromium } from './lib/entorno.mjs'

const require = createRequire(import.meta.url)
const { hojaDeMuestra } = require(process.env.HOJA_DEMO)
const BUNDLE = process.env.BUNDLE_LECTOR

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const N = 30, K = 4
// Lo que «rellena» el alumno: pregunta (desde 1) → opciones oscuras.
const RELLENAS = { 1: [0], 2: [2], 3: [3], 7: [1], 12: [1], 25: [0], 26: [3], 30: [2] }
const TACHADA = { pregunta: 5, tachada: 0, buena: 2 }   // tacha la A y rellena la C: las dos oscuras → dudosa
const DOBLE = { pregunta: 9, opciones: [1, 3] }         // dos rellenas → dudosa
const A_MEDIAS = { pregunta: 15, opcion: 2 }           // relleno flojo → dudosa

const chromium = await navegadorChromium()
const navegador = await chromium.launch()
try {
  const p = await navegador.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 })
  await p.setContent(await hojaDeMuestra(N, K))
  await p.emulateMedia({ media: 'print' })
  // Relleno de burbujas: el índice de cada burbuja en el documento es pregunta·K + opción.
  await p.evaluate(({ K, RELLENAS, TACHADA, DOBLE, A_MEDIAS }) => {
    const b = [...document.querySelectorAll('.burbuja')]
    const pinta = (q, j, estilo) => Object.assign(b[(q - 1) * K + j].style, estilo)
    for (const [q, js] of Object.entries(RELLENAS)) for (const j of js) pinta(Number(q), j, { background: '#111', color: '#111' })
    pinta(TACHADA.pregunta, TACHADA.buena, { background: '#111', color: '#111' })
    pinta(TACHADA.pregunta, TACHADA.tachada, { background: 'repeating-linear-gradient(45deg, #111 0 0.6mm, transparent 0.6mm 1.4mm), repeating-linear-gradient(-45deg, #111 0 0.6mm, transparent 0.6mm 1.4mm)' })
    for (const j of DOBLE.opciones) pinta(DOBLE.pregunta, j, { background: '#111', color: '#111' })
    pinta(A_MEDIAS.pregunta, A_MEDIAS.opcion, { background: 'radial-gradient(circle, #333 0 1.2mm, transparent 1.3mm)' })
  }, { K, RELLENAS, TACHADA, DOBLE, A_MEDIAS })
  const captura = (await p.screenshot({ fullPage: true })).toString('base64')

  // La «foto»: la hoja girada y en perspectiva sobre un escritorio oscuro, y el lector encima.
  await p.setContent(`<!doctype html><html><body><script>${await (await import('node:fs/promises')).readFile(BUNDLE, 'utf8')}</script></body></html>`)
  const fotografiar = (opciones) => p.evaluate(async ({ captura, opciones }) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + captura
    await img.decode()
    const c = document.createElement('canvas')
    c.width = opciones.ancho; c.height = opciones.alto
    const ctx = c.getContext('2d')
    ctx.fillStyle = opciones.fondo; ctx.fillRect(0, 0, c.width, c.height)
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate(opciones.giro * Math.PI / 180)
    // Perspectiva de andar por casa: un poco más estrecha por arriba.
    ctx.transform(1, 0, opciones.sesgo, 1, 0, 0)
    const esc = opciones.escala
    ctx.drawImage(img, -img.width * esc / 2, -img.height * esc / 2, img.width * esc, img.height * esc)
    const datos = ctx.getImageData(0, 0, c.width, c.height)
    const gris = LectorHoja.aGris(datos.data, c.width, c.height)
    const t0 = performance.now()
    const r = LectorHoja.leerHoja(gris)
    return { r, ms: Math.round(performance.now() - t0) }
  }, { captura, opciones })

  console.log('\n1. Hoja derecha, un poco girada, sobre fondo oscuro')
  {
    const { r, ms } = await fotografiar({ ancho: 1400, alto: 1900, fondo: '#3a3a3a', giro: 4, sesgo: 0.03, escala: 0.78 })
    ok(r.estado === 'leida', 'se lee la hoja', r.estado)
    if (r.estado === 'leida') {
      const l = r.lectura
      ok(l.payload.prueba_id === 4242 && l.payload.alumno_id === 99 && l.payload.nPreguntas === N && l.payload.nOpciones === K, 'el QR dice prueba, alumno y parrilla', JSON.stringify(l.payload))
      const errores = []
      for (const q of l.preguntas) {
        const n = q.pregunta + 1
        const esperada = RELLENAS[n]?.[0] ?? null
        if ([TACHADA.pregunta, DOBLE.pregunta, A_MEDIAS.pregunta].includes(n)) continue
        if (q.marcada !== esperada || q.dudosa) errores.push(`${n}: ${q.marcada} (esperada ${esperada})${q.dudosa ? ' dudosa' : ''} ${q.oscuridad.join('/')}`)
      }
      ok(errores.length === 0, 'las burbujas limpias y las vacías se leen bien', errores.join(' · '))
      const t = l.preguntas[TACHADA.pregunta - 1], d = l.preguntas[DOBLE.pregunta - 1], m = l.preguntas[A_MEDIAS.pregunta - 1]
      ok(t.dudosa, 'tachada y corregida: dudosa', t.oscuridad.join('/'))
      ok(d.dudosa, 'dos rellenas: dudosa', d.oscuridad.join('/'))
      ok(m.dudosa && m.marcada === A_MEDIAS.opcion, 'rellena a medias: dudosa, pero propone la opción', m.oscuridad.join('/'))
      ok(ms < 3000, `tarda lo razonable (${ms} ms)`)
    }
  }

  console.log('\n2. Del revés y apaisada')
  for (const [nombre, giro, ancho, alto] of [['del revés', 182, 1400, 1900], ['apaisada', 92, 1900, 1400]]) {
    const { r } = await fotografiar({ ancho, alto, fondo: '#555', giro, sesgo: 0, escala: 0.72 })
    ok(r.estado === 'leida' && r.lectura.payload.alumno_id === 99, `${nombre}: se lee igual`, r.estado)
    if (r.estado === 'leida') {
      const q1 = r.lectura.preguntas[0], q30 = r.lectura.preguntas[29]
      ok(q1.marcada === 0 && q30.marcada === 2 && !q1.dudosa && !q30.dudosa, `${nombre}: la 1 y la 30 en su sitio`, `${q1.marcada} · ${q30.marcada}`)
    }
  }

  console.log('\n3. Sin hoja')
  {
    const r = await p.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 600
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#777'; ctx.fillRect(0, 0, 800, 600)
      ctx.fillStyle = '#000'; ctx.fillRect(100, 100, 60, 60); ctx.fillRect(600, 400, 40, 40)
      const d = ctx.getImageData(0, 0, 800, 600)
      return LectorHoja.leerHoja(LectorHoja.aGris(d.data, 800, 600))
    })
    ok(r.estado === 'sin-marcas', 'dos cuadrados sueltos no son una hoja', r.estado)
  }
} catch (e) {
  console.log('  ✗ EXCEPCIÓN', e.stack || e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
