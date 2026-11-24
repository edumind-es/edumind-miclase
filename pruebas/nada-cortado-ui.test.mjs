/**
 * Nada cortado, con el aspecto Lámina encendido, en cada pantalla del menú y
 * en cuatro tamaños (pruebas/lib/nadaCortado.mjs).
 *
 * Medido el 24·11·2026 con una clase de ejemplo: ninguna pantalla desborda,
 * nada asoma fuera de la ventana y ningún texto de botón se corta, en ningún
 * tamaño. Eso se exige ya a TODAS: es lo que no puede romper ni Lámina ni un
 * arreglo que entre por otra rama.
 *
 * Lo que la interfaz no cumple es el tamaño de lo que se toca: 691 cosas de
 * menos de 44 px entre todas las pantallas y tamaños (casi todo, el menú). Eso
 * lo arregla Lámina fase a fase, así que solo se exige a las pantallas de
 * HECHAS, que empieza vacía y crece con cada fase. El detalle de las demás se
 * guarda en `nada-cortado.json`, junto a las capturas.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { navegadorChromium } from './lib/entorno.mjs'
import { TAMANOS, medirCortes } from './lib/nadaCortado.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const TIROS = process.env.SCRATCH + '/tiros'

const PANTALLAS = {
  inicio: '/', planificacion: '/planificacion', calificador: '/evaluacion', examenes: '/escanear',
  asistencia: '/sesiones', seguimiento: '/seguimiento', tutorias: '/tutorias', informes: '/informes',
  clases: '/grupos', sincronizar: '/sincronizar', instalar: '/instalar',
}
/** Pantallas ya en Lámina: se les exige todo. Se añaden al cerrar cada fase. */
const HECHAS = []

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const errores = []
const resumen = { sale: 0, corta: 0, bajo: 0 }, detalle = {}

for (const [tamano, viewport] of Object.entries(TAMANOS)) {
  console.log(`\n── ${tamano} (${viewport.width} × ${viewport.height}) ──`)
  const ctx = await navegador.newContext({ viewport, hasTouch: tamano !== 'escritorio' })
  const p = await ctx.newPage()
  p.on('pageerror', e => errores.push(`${tamano}: ${e.message}`))

  // Una clase con alumnado, para que las pantallas no sean solo «crea tu primera clase»
  await p.goto(BASE + '/?aspecto=lamina', { waitUntil: 'networkidle' })
  await p.evaluate(async () => {
    const q = await import('/src/db/queries.ts')
    const g = await q.crearGrupo({ nombre: '6ºA', etapa: 'primaria', curso: '6', comunidad: 'Galicia', curso_escolar: '2026-2027', color: '#1a4a7a' })
    for (const [nombre, apellidos] of [['Uxía', 'Ferreiro Lourido'], ['Brais', 'Outeiro Castro'], ['Antía', 'Barreiro Seoane'], ['Roi', 'Pazos Neira']])
      await q.crearAlumno({ nombre, apellidos, neae: 0 }, g)
    localStorage.setItem('miclase_clase_activa', String(g))
    localStorage.setItem('miclase.idioma', 'es')
  })

  const rotas = []
  for (const [nombre, ruta] of Object.entries(PANTALLAS)) {
    await p.goto(BASE + ruta, { waitUntil: 'networkidle' })
    await p.evaluate(() => document.fonts.ready)
    const clave = `${nombre}@${tamano}`
    const m = await medirCortes(p)
    // Una captura por pantalla en escritorio y en móvil, para mirarlas (--conservar)
    if (tamano === 'escritorio' || tamano === 'movil') await p.screenshot({ path: `${TIROS}/pantalla-${nombre}-${tamano}.png` })
    resumen.sale += m.sale.length; resumen.corta += m.corta.length; resumen.bajo += m.bajo.length
    detalle[clave] = { desborda: m.desborda.length, sale: m.sale.length, corta: m.corta.length, bajo: m.bajo.length }

    // A todas: ni desborde, ni nada fuera, ni texto cortado. A las hechas, además, 44 px
    const exigir = HECHAS.includes(nombre) ? ['desborda', 'sale', 'corta', 'bajo'] : ['desborda', 'sale', 'corta']
    const mal = exigir.filter(que => m[que].length)
    if (mal.length) {
      rotas.push(nombre)
      await p.screenshot({ path: `${TIROS}/cortado-${nombre}-${tamano}.png` })
      for (const que of mal) ok(false, `${nombre}: ${que}`, m[que].slice(0, 4).join(' | '))
    }
  }
  ok(rotas.length === 0, `${Object.keys(PANTALLAS).length} pantallas: nada desborda, nada fuera, ningún texto cortado`, rotas.join(', '))
  await ctx.close()
}

console.log('\n── Resumen ──')
ok(errores.length === 0, 'sin errores en ninguna pantalla', errores.slice(0, 3).join(' | '))
console.log(`  · pantallas en Lámina, con todo exigido: ${HECHAS.length ? HECHAS.join(', ') : 'ninguna todavía (empieza en la fase 1)'}`)
console.log(`  · en todas, hoy: ${resumen.bajo} cosas que se tocan de menos de 44 px (se exigirá pantalla a pantalla)`)

// El detalle por pantalla y tamaño queda junto a las capturas (npm test -- --solo=cortado --conservar)
writeFileSync(process.env.SCRATCH + '/nada-cortado.json', JSON.stringify({ resumen, detalle }, null, 2))

await navegador.close()
console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
