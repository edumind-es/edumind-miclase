/**
 * Plano de clase con AulaMap (de Juan José de Haro), desde «Mis clases» →
 * «Plano y QR de mesas». Comprueba que:
 *  - la cita del autor está a la vista, con su enlace;
 *  - el plano de cuadrícula que ya había se convierte en mesas de AulaMap;
 *  - tocar a un alumno en la vista abre su evaluación rápida;
 *  - editar el aula guarda en `planos` (sin nombres) y nunca en localStorage;
 *  - nada sale del origen de la app (local-first, sin scripts de fuera);
 *  - los QR de mesa siguen en su sitio;
 *  - AulaMap abierto suelto funciona como siempre.
 */
import { mkdirSync } from 'node:fs'
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const ORIGEN = new URL(BASE).origin
const TIROS = (process.env.SCRATCH || '/tmp') + '/tiros'
mkdirSync(TIROS, { recursive: true })

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const errores = []
const ajenas = []

try {
  const ctx = await navegador.newContext({ viewport: { width: 1400, height: 1000 } })
  const p = await ctx.newPage()
  p.on('pageerror', e => errores.push('PAGEERROR: ' + e.message))
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource.*\/api\//.test(m.text())) errores.push('CONSOLA: ' + m.text()) })
  p.on('request', r => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && u.origin !== ORIGEN && !/^127\.0\.0\.1$|^localhost$/.test(u.hostname)) ajenas.push(r.url()) })
  p.on('dialog', d => d.accept())
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })

  const { grupo, alumnos } = await p.evaluate(async () => {
    const q = await import('/src/db/queries.ts')
    const g = await q.crearGrupo({
      nombre: '6ºA', etapa: 'primaria', curso: '6',
      comunidad: 'Galicia', curso_escolar: '2026-2027', color: '#1a4a7a',
    })
    const a1 = await q.crearAlumno({ nombre: 'Uxía', apellidos: 'Ferreiro', neae: 0 }, g)
    const a2 = await q.crearAlumno({ nombre: 'Brais', apellidos: 'Outeiro', neae: 0 }, g)
    const a3 = await q.crearAlumno({ nombre: 'Antía', apellidos: 'Vidal', neae: 0 }, g)
    // El plano de cuadrícula de antes: Uxía delante a la izquierda, Brais detrás
    await q.getPlano(g)
    await q.asignarAsiento(g, a1, 0, 0)
    await q.asignarAsiento(g, a2, 2, 3)
    localStorage.setItem('miclase_clase_activa', String(g))
    return { grupo: g, alumnos: [a1, a2, a3] }
  })

  const planoGuardado = () => p.evaluate(async (g) => {
    const { db } = await import('/src/db/localDb.ts')
    const pl = (await db.planos.where('grupo_id').equals(g).toArray()).filter(x => !x.deleted_at)
    return { n: pl.length, aulamap: pl[0]?.aulamap ?? null, updated_at: pl[0]?.updated_at }
  }, grupo)

  console.log('\n1. La pestaña del plano cita a AulaMap y a su autor')
  await p.goto(`${BASE}/grupos/${grupo}?pestana=plano`, { waitUntil: 'networkidle' })
  const credito = p.locator('[data-credito-aulamap]')
  await credito.waitFor()
  const texto = await credito.innerText()
  ok(/Plano basado en AulaMap/.test(texto) && /Juan José de Haro/.test(texto) && /jjdeharo/.test(texto), 'la cita está a la vista', texto)
  ok(await credito.locator('a[href="https://aulamap.github.io"]').count() === 1, 'con enlace a aulamap.github.io')
  ok(await credito.locator('a[href*="github.com/jjdeharo"]').count() === 1, 'y al autor')
  ok(await p.getByRole('button', { name: /Imprimir QR de mesas/ }).count() === 1, 'los QR de mesa siguen en la pestaña')

  console.log('\n2. Vista: la cuadrícula de antes, ya en mesas de AulaMap')
  await p.locator('[data-plano-mostrar]').click()
  const marco = p.frameLocator('iframe[data-aulamap="vista"]')
  await marco.locator('#room-svg [data-seat]').first().waitFor({ timeout: 15000 })
  ok(await marco.locator('#room-svg [data-seat]').count() === 30, 'una mesa por casilla (5 × 6)', String(await marco.locator('#room-svg [data-seat]').count()))
  const clases = await marco.locator('html').getAttribute('class')
  ok(/miclase-vista/.test(clases || ''), 'AulaMap sabe que está dentro de MiClase, en vista', clases)
  ok(!(await marco.locator('.sidebar').isVisible()), 'en vista no hay barra de edición')
  const svgTexto = await marco.locator('#room-svg').textContent()
  ok(/Uxía/.test(svgTexto) && /Brais/.test(svgTexto) && !/Antía/.test(svgTexto), 'Uxía y Brais sentados; Antía sin sitio')
  ok(/30 puestos · 2 sentados · 1 sin sitio/.test(await p.locator('[data-plano-ayuda]').innerText()), 'el resumen lo cuenta')
  await p.screenshot({ path: `${TIROS}/plano-vista.png`, fullPage: true })
  const plano0 = await planoGuardado()
  ok(plano0.aulamap === null, 'mirar no escribe nada')

  console.log('\n3. Tocar a un alumno abre su evaluación rápida')
  // Se toca el nombre, que es lo que hace la docente
  await marco.locator('#room-svg text', { hasText: 'Uxía' }).first().click({ force: true }) // el puesto queda debajo del nombre
  await p.waitForURL(/\/escanear/, { timeout: 8000 })
  ok(true, 'se abre /escanear')
  ok(p.url().includes(`alumno=${alumnos[0]}`) || await p.getByText(/Uxía/).count() > 0, 'con Uxía', p.url())

  console.log('\n4. Editar el aula: AulaMap entero, guardado en el plano del grupo')
  await p.goto(`${BASE}/grupos/${grupo}?pestana=plano`, { waitUntil: 'networkidle' })
  await p.locator('[data-plano-mostrar]').click()
  await p.locator('[data-plano-modo="editar"]').click()
  const ed = p.frameLocator('iframe[data-aulamap="editar"]')
  await ed.locator('#palette-desks button').first().waitFor({ timeout: 15000 })
  ok(await ed.locator('.sidebar').isVisible(), 'la barra de AulaMap está')
  for (const sel of ['.class-picker', '#btn-share', '#btn-export', '#btn-import']) {
    ok(!(await ed.locator(sel).isVisible()), `sin ${sel}: las clases y las copias son las de MiClase`)
  }
  ok(await ed.locator('.footer').innerText().then(t => /Juan José de Haro/.test(t)), 'el pie de AulaMap con su autor sigue')
  await ed.locator('#palette-desks button').first().click()
  await p.screenshot({ path: `${TIROS}/plano-editar.png`, fullPage: true })
  await p.waitForTimeout(900)
  const plano1 = await planoGuardado()
  ok(plano1.n === 1 && !!plano1.aulamap, 'se guarda en el registro del plano del grupo')
  const clase1 = JSON.parse(plano1.aulamap || '{}')
  ok((clase1.objects || []).filter(o => Array.isArray(o.seats)).length === 31, 'con la mesa nueva (31)', String((clase1.objects || []).filter(o => Array.isArray(o.seats)).length))
  ok(!/Ferreiro|Outeiro|Vidal|Uxía|Brais|Antía/.test(plano1.aulamap || ''), 'sin un solo nombre del alumnado')
  ok((clase1.students || []).map(s => s.id).sort().join() === alumnos.map(a => `a${a}`).sort().join(), 'el alumnado, por id de MiClase')
  ok(await p.evaluate(() => localStorage.getItem('classe-state-v1')) === null, 'AulaMap no guarda nada en localStorage')

  console.log('\n5. La lista del alumnado viene de MiClase')
  await ed.locator('.tab[data-mode="students"]').click()
  ok(!(await ed.locator('#students-paste').isVisible()) && !(await ed.locator('#btn-delete-students').isVisible()), 'no se pega ni se borra la lista')
  ok(await ed.locator('#student-list li[data-student]').count() === 3, 'los tres del grupo')

  console.log('\n6. Terminar: la vista enseña lo guardado')
  await p.locator('[data-plano-modo="vista"]').click()
  await p.frameLocator('iframe[data-aulamap="vista"]').locator('#room-svg [data-seat]').first().waitFor({ timeout: 15000 })
  ok(/31 puestos · 2 sentados/.test(await p.locator('[data-plano-ayuda]').innerText()), '31 puestos', await p.locator('[data-plano-ayuda]').innerText())
  // Volver a la vista sin tocar nada no reescribe el registro
  const plano2 = await planoGuardado()
  ok(plano2.updated_at === plano1.updated_at, 'mirar después no reescribe (no viaja en el sync)')

  console.log('\n7. AulaMap suelto, sin MiClase alrededor, funciona como siempre')
  const suelto = await ctx.newPage()
  suelto.on('pageerror', e => errores.push('PAGEERROR (suelto): ' + e.message))
  await suelto.goto(BASE + '/aulamap/index.html', { waitUntil: 'networkidle' })
  await suelto.locator('#palette-desks button').first().waitFor()
  ok(!/miclase/.test(await suelto.locator('html').getAttribute('class') || ''), 'sin las clases de MiClase')
  ok(await suelto.locator('.class-picker').isVisible(), 'con su selector de clases')
  await suelto.close()
  await ctx.close()
} catch (e) {
  console.error(e)
  fallos++
} finally {
  await navegador.close()
}

ok(ajenas.length === 0, 'ni una petición fuera del origen de la app', ajenas.slice(0, 3).join(' '))
if (errores.length) { console.log(errores.join('\n')); fallos++ }
console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ plano con AulaMap bien')
process.exit(fallos ? 1 : 0)
