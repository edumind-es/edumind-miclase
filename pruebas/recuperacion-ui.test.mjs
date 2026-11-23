/**
 * La recuperación por criterio, de punta a punta.
 *
 * Parte de la programación de PROENS (el PDF gemelo), con un «Examen» dentro
 * de la prueba escrita y tres alumnos: Ana suspende los dos criterios, Bruno
 * aprueba los dos y Carla suspende uno. Se comprueba: que «Qué evalúo → Por
 * unidad» crea la recuperación con su regla; que su columna abre la pasada
 * que propone a quien tiene algo suspenso, con los criterios suspensos ya
 * marcados; que la nota va solo a los criterios marcados; que se puede
 * añadir un criterio a mano; y, en la matriz, que el instrumento resume la
 * nota recuperada mientras el examen sigue enseñando la suya.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { navegadorChromium, elegirUnidad, irAlAlumnado, aceptarConfirmaciones } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH, { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const PDF = join(process.cwd(), 'pruebas/fixtures/proens_ccss6.pdf')

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1500, height: 1000 } })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
await aceptarConfirmaciones(p)

/** Notas vivas de un instrumento: alumno (por orden de lista) → criterio → valor. */
const notasDe = (instrumento) => p.evaluate(async (ins) => {
  const l = await import('/src/db/localDb.ts')
  const alumnos = (await l.db.alumnos.toArray()).filter(a => !a.deleted_at).sort((a, b) => a.apellidos.localeCompare(b.apellidos))
  const cals = (await l.db.calificaciones.toArray()).filter(c => !c.deleted_at && c.valor != null && c.instrumento_id === ins)
  return alumnos.map(a => Object.fromEntries(cals.filter(c => c.alumno_id === a.id).map(c => [c.criterio_id, c.valor])))
}, instrumento)

try {
  console.log('\n1. Clase con programación de PROENS, un examen y tres alumnos')
  await p.goto(BASE + '/grupos/nuevo', { waitUntil: 'networkidle' })
  await p.waitForTimeout(500)
  await p.getByPlaceholder('Ej: 3ºA, 5ºB…').fill('6ºA')
  await p.locator('select').first().selectOption('primaria')
  await p.locator('select').nth(1).selectOption('6')
  await p.locator('select').nth(2).selectOption('Galicia')
  await p.getByRole('button', { name: /Crear grupo/ }).click()
  await p.waitForURL(/\/grupos\/\d+/)
  await p.waitForTimeout(900)
  await p.getByRole('tab', { name: 'Áreas y evaluación' }).click()
  await p.waitForTimeout(600)
  await p.getByRole('button', { name: /\+ Añadir áreas/ }).click()
  await p.waitForTimeout(700)
  await p.locator('label').filter({ hasText: /^Ciencias Sociales$/ }).locator('input[type="checkbox"]').check()
  await p.getByRole('button', { name: /Añadir 1 área/ }).click()
  await p.waitForTimeout(1000)
  await p.locator('span').filter({ hasText: /^Ciencias Sociales$/ }).first().click()
  await p.waitForTimeout(900)
  await p.getByRole('button', { name: /📋 Programación/ }).first().click()
  await p.waitForTimeout(700)
  await p.getByRole('button', { name: /Importar de PROENS/ }).click()
  await p.waitForTimeout(300)
  await p.locator('input[type="file"][accept*="pdf"]').setInputFiles(PDF)
  await p.getByRole('button', { name: /Importar 7 unidades/ }).click({ timeout: 20000 })
  await p.getByText(/Programación importada/).waitFor({ timeout: 15000 })
  await p.getByRole('button', { name: 'Cerrar' }).click()

  await irAlAlumnado(p)
  await p.waitForTimeout(500)
  await p.getByRole('button', { name: /Importar lista/ }).click()
  await p.getByPlaceholder('Pega aquí la lista de alumnado…').fill('Abad Ríos, Ana\nBello Souto, Bruno\nCasal Vidal, Carla')
  await p.getByRole('button', { name: /Analizar/ }).click()
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: /Confirmar e importar/ }).click()
  await p.getByText(/3 alumnos creados/).waitFor({ timeout: 8000 })
  await p.getByRole('button', { name: 'Cerrar' }).click()

  // El examen dentro de la prueba escrita, con dos criterios en la primera
  // unidad, y sus notas: Ana 3 y 3, Bruno 7 y 7, Carla 3 y 8.
  const base = await p.evaluate(async () => {
    const q = await import('/src/db/queries.ts')
    const l = await import('/src/db/localDb.ts')
    const asig = (await l.db.asignaturas.toArray()).find(a => !a.deleted_at)
    const unidad = (await q.getUnidades(asig.id))[0]
    const proba = (await q.getFamilias(asig.id)).find(f => f.tipo === 'prueba-escrita')
    const criterios = unidad.criterios.filter(c => c.instrumentos.some(v => v.instrumento_id === proba.id)).map(c => c.criterio_id).slice(0, 2)
    const examen = await q.crearInstrumentoHijo(proba.id, { nombre: 'Examen', tipo: 'prueba-escrita' })
    for (const c of criterios) await q.asignarCriterioAColumna(examen, unidad.id, c)
    const als = await q.getAlumnosByGrupo(asig.grupo_id)
    const notas = [[3, 3], [7, 7], [3, 8]]
    await q.saveCalificaciones(als.flatMap((a, i) => criterios.map((criterio_id, k) => ({
      alumno_id: a.id, instrumento_id: examen, criterio_id, asignatura: 'ciencias_sociales',
      curso: '6', etapa: 'primaria', comunidad: 'Galicia', trimestre: unidad.trimestre ?? 1, valor: notas[i][k], unidad_id: unidad.id,
    }))), { sinVinculos: true })
    return { asig: asig.id, unidad: unidad.id, trimestre: unidad.trimestre ?? 1, proba: proba.id, probaNombre: proba.nombre, examen, criterios }
  })
  const [c1, c2] = base.criterios
  ok(base.criterios.length === 2, 'el examen evalúa dos criterios en la primera unidad', base.criterios.join(' · '))

  console.log('\n2. «Qué evalúo → Por unidad» crea la recuperación con su regla')
  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.waitForTimeout(1500)
  await elegirUnidad(p, 1)
  await p.waitForTimeout(1000)
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()
  const gestor = p.getByRole('dialog', { name: 'Gestionar instrumentos de evaluación' })
  const vista = gestor.locator('[data-que-por-unidad]')
  await vista.waitFor({ timeout: 8000 })
  const bloque = vista.locator(`[data-unidad-instrumento][data-nombre="${base.probaNombre}"]`)
  await bloque.locator('[data-unidad-recuperacion]').click()
  const form = bloque.locator('[data-unidad-anadir-form]')
  ok(await form.locator('[data-unidad-anadir-nombre]').inputValue() === 'Recuperación', 'propone el nombre «Recuperación»')
  ok(await form.locator('[data-unidad-anadir-regla]').inputValue() === 'mejor', 'y «la mejor de las dos» como regla')
  ok(await form.locator('[data-unidad-anadir-criterio]:checked').count() === 2, 'con los criterios que el instrumento ya evalúa con sus actividades en la unidad')
  await form.locator('[data-unidad-anadir-aceptar]').click()
  const fila = bloque.locator('[data-unidad-actividad][data-nombre="Recuperación"]')
  await fila.waitFor({ timeout: 8000 })
  ok(await fila.locator('[data-unidad-recuperacion-regla="mejor"]').count() === 1, 'la actividad sale como recuperación, sin porcentaje')
  ok(await fila.locator('[data-unidad-pct]').count() === 0 && await bloque.locator('[data-unidad-actividad][data-nombre="Examen"] [data-unidad-pct]').textContent() === '100 %',
    'y el examen sigue siendo el 100 % del instrumento')
  ok(await bloque.locator('[data-unidad-recuperacion]').count() === 0, 'con una recuperación en la unidad no se ofrece otra')
  const recu = await p.evaluate(async () => {
    const l = await import('/src/db/localDb.ts')
    const r = (await l.db.instrumentos.toArray()).find(i => !i.deleted_at && i.nombre === 'Recuperación')
    return r ? { id: r.id, regla: r.recuperacion, familia: r.familia_id } : null
  })
  ok(recu?.regla === 'mejor' && recu?.familia === base.proba, 'guardada con su regla, dentro de la prueba escrita')
  await gestor.getByRole('button', { name: 'Cerrar' }).click()
  await p.waitForTimeout(800)

  console.log('\n3. La pasada propone a quien tiene algo suspenso, con sus criterios marcados')
  await p.locator('[data-recuperacion-abrir]').first().click()
  const pasada = p.locator('[data-recuperacion]')
  await pasada.waitFor({ timeout: 8000 })
  const filas = pasada.locator('[data-fila-recuperacion]')
  await filas.first().waitFor({ timeout: 8000 })
  ok(await filas.count() === 2, 'salen Ana y Carla; Bruno, que aprobó todo, no', String(await filas.count()))
  const ana = filas.nth(0), carla = filas.nth(1)
  ok(await ana.locator('[data-recuperar-criterio][aria-pressed="true"]').count() === 2, 'Ana trae marcados sus dos criterios suspensos')
  ok(await carla.locator('[data-recuperar-criterio][aria-pressed="true"]').count() === 1
    && await carla.locator(`[data-recuperar-criterio="${c1}"]`).getAttribute('aria-pressed') === 'true', 'Carla, solo el que suspendió')
  ok(/tenía 8/.test(await carla.locator(`[data-recuperar-criterio="${c2}"]`).textContent()), 'y se ve la nota que tenía en el otro')

  console.log('\n4. La nota va solo a los criterios marcados')
  await ana.locator('[data-nota-exacta]').fill('6')
  await ana.locator('[data-nota-exacta]').press('Enter')
  await p.waitForTimeout(700)
  await carla.locator('[data-calificativo="SU"]').click()
  await p.waitForTimeout(700)
  let n = await notasDe(recu.id)
  ok(n[0][c1] === 6 && n[0][c2] === 6, 'Ana tiene un 6 de recuperación en los dos', JSON.stringify(n[0]))
  ok(n[2][c1] === 5 && n[2][c2] === undefined, 'Carla, un 5 solo en el criterio suspenso', JSON.stringify(n[2]))
  ok(Object.keys(n[1]).length === 0, 'Bruno no tiene nada')
  ok(/queda 6/.test(await ana.locator(`[data-recuperar-criterio="${c1}"]`).textContent()), 'la fila dice la nota que queda')

  console.log('\n5. Se añade a mano un criterio que no estaba suspenso, y se quita')
  await carla.locator(`[data-recuperar-criterio="${c2}"]`).click()
  await p.waitForTimeout(700)
  n = await notasDe(recu.id)
  ok(n[2][c2] === 5, 'al marcarlo, la nota de recuperación llega también a ese criterio')
  ok(/queda 8/.test(await carla.locator(`[data-recuperar-criterio="${c2}"]`).textContent()), 'pero con «la mejor» se queda su 8')
  await carla.locator(`[data-recuperar-criterio="${c2}"]`).click()
  await p.waitForTimeout(700)
  n = await notasDe(recu.id)
  ok(n[2][c2] === undefined && n[2][c1] === 5, 'al desmarcarlo se quita, y el otro sigue')
  await pasada.locator('[data-recuperacion-todos]').click()
  ok(await filas.count() === 3, '«Ver toda la clase» enseña también a Bruno')
  await pasada.locator('[data-recuperacion-hecho]').click()
  await p.waitForTimeout(800)

  console.log('\n6. El instrumento resume la nota recuperada; el examen conserva la suya')
  const m = await p.evaluate(async ([asig, unidad, trimestre, proba, examen, criterio]) => {
    const q = await import('/src/db/queries.ts')
    const mat = await q.getMatrizEvaluacion(asig, unidad, trimestre)
    const als = mat.alumnos
    const de = (ins) => als.map(a => mat.calificaciones[`${a.id}:${criterio}:${ins}:${trimestre}`]?.valor ?? null)
    return { proba: de(proba), examen: de(examen), aplicadas: mat.recuperaciones.length }
  }, [base.asig, base.unidad, base.trimestre, base.proba, base.examen, c1]).catch(e => ({ error: e.message }))
  ok(!m.error, 'la matriz se lee', m.error ?? '')
  ok(m.proba?.[0] === 6 && m.proba?.[1] === 7 && m.proba?.[2] === 5, 'la prueba escrita resume 6 · 7 · 5 en el criterio', JSON.stringify(m.proba))
  ok(m.examen?.[0] === 3 && m.examen?.[2] === 3, 'y el examen sigue enseñando el 3 que se puso', JSON.stringify(m.examen))
  const guardadas = await notasDe(base.examen)
  ok(guardadas[0][c1] === 3 && guardadas[2][c1] === 3, 'la nota del examen no se ha tocado en la base')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  console.log('  ✗ FALLO inesperado — ' + e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
