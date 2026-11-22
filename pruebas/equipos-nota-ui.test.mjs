/**
 * Calificar por equipo, de punta a punta: «Poner esta nota a su equipo» en el
 * panel de la casilla.
 *
 * Parte de la programación de PROENS (el PDF gemelo) y tres alumnos: Ana y
 * Bruno en un equipo, Carla sola en otro. Se comprueba en IndexedDB: que la
 * nota de Ana llega a Bruno y no a Carla, que una nota que el compañero ya
 * tenía no se pisa sin preguntar, que al aceptar se sustituye, y que quien no
 * tiene compañeros de equipo no ve la franja.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { navegadorChromium, elegirUnidad, irAlAlumnado, aceptarConfirmaciones, rechazarSiguienteConfirmacion } from './lib/entorno.mjs'

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
const preguntas = []
await aceptarConfirmaciones(p, t => preguntas.push(t))

/** Notas vivas: alumno (por orden de lista) → criterio → valor. */
const notas = () => p.evaluate(async () => {
  const l = await import('/src/db/localDb.ts')
  const alumnos = (await l.db.alumnos.toArray()).filter(a => !a.deleted_at).sort((a, b) => a.apellidos.localeCompare(b.apellidos))
  const cals = (await l.db.calificaciones.toArray()).filter(c => !c.deleted_at && c.valor != null)
  return alumnos.map(a => Object.fromEntries(cals.filter(c => c.alumno_id === a.id).map(c => [c.criterio_id, c.valor])))
})

const panel = p.getByRole('dialog', { name: /^Evaluar / })
const aviso = texto => panel.getByText(texto).waitFor({ timeout: 6000 }).then(() => true, () => false)
const poner = async (n) => { await panel.locator(`button.cal-${n}`).click(); await aviso(new RegExp(`^✅ ${n} guardado`)) }
const franja = panel.locator('[data-equipo-nota]')

try {
  console.log('\n1. Clase con programación de PROENS, tres alumnos y dos equipos')
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

  // Los equipos, por la misma puerta que la pestaña «Equipos».
  const equipos = await p.evaluate(async () => {
    const q = await import('/src/db/queries.ts')
    const l = await import('/src/db/localDb.ts')
    const g = (await l.db.grupos.toArray()).find(x => !x.deleted_at).id
    const als = await q.getAlumnosByGrupo(g)
    await q.guardarAgrupamiento({
      grupo_id: g, nombre: 'Equipos de proyecto', asignatura_id: null, unidad_id: null,
      equipos: [
        { clave: 'e1', nombre: 'Lobos', alumnos: [als[0].id, als[1].id] },
        { clave: 'e2', nombre: 'Aguias', alumnos: [als[2].id] },
      ],
    })
    return (await q.getAgrupamientos(g)).length
  })
  ok(equipos === 1, 'un agrupamiento con Lobos (Ana y Bruno) y Aguias (Carla)')

  await p.getByRole('link', { name: 'Calificador', exact: true }).click()
  await p.locator('[data-vista="criterios"]').click({ timeout: 8000 }).catch(() => {})
  await p.waitForTimeout(1500)
  await elegirUnidad(p, 1)
  await p.waitForTimeout(1200)

  console.log('\n2. La nota de Ana, a su equipo')
  await p.locator('.celda-btn:not(.sin-instrumento)').first().click()
  await panel.waitFor({ timeout: 8000 })
  await franja.waitFor({ timeout: 6000 })
  ok(await franja.getAttribute('data-equipo-nombre') === 'Lobos', 'el panel de Ana nombra a su equipo')
  ok((await franja.innerText()).includes('Bruno') && !(await franja.innerText()).includes('Carla'), 'y a su compañero, no a Carla')
  ok(await franja.locator('[data-equipo-nota-poner]').isDisabled(), 'sin nota todavía, el botón no se puede pulsar')
  await poner(7)
  let n = await notas()
  const criterio = Object.keys(n[0])[0]
  ok(Object.keys(n[1]).length === 0, 'poner la nota a Ana no toca a nadie más')
  await franja.locator('[data-equipo-nota-poner]').click()
  ok(await aviso(/Nota puesta a Lobos: 1 casilla\./), 'dice lo que ha hecho')
  n = await notas()
  ok(n[1][criterio] === 7, 'Bruno recibe el 7 en ese criterio', JSON.stringify(n[1]))
  ok(Object.keys(n[2]).length === 0, 'Carla, de otro equipo, no recibe nada')
  ok(preguntas.length === 0, 'no pregunta: nadie tenía nota')

  console.log('\n3. Una nota que el compañero ya tenía no se pisa sin preguntar')
  await poner(9)
  await rechazarSiguienteConfirmacion(p)
  await franja.locator('[data-equipo-nota-poner]').click()
  ok(await aviso(/ya tenía nota y se ha respetado/), 'al decir que no, lo respeta y lo dice')
  n = await notas()
  ok(n[0][criterio] === 9 && n[1][criterio] === 7, 'Ana tiene 9 y Bruno conserva su 7', JSON.stringify(n.slice(0, 2)))
  await franja.locator('[data-equipo-nota-poner]').click()
  ok(await aviso(/1 sustituida/), 'al aceptar, sustituye y lo dice')
  n = await notas()
  ok(n[1][criterio] === 9, 'Bruno pasa a 9')
  ok(preguntas.some(t => t.includes('Sustituir las notas que Lobos ya tenía')), 'la pregunta nombra al equipo')

  console.log('\n4. Quien no tiene compañeros de equipo no ve la franja')
  await panel.getByRole('button', { name: 'Alumno siguiente' }).click()
  await p.waitForTimeout(600)
  ok(await franja.getAttribute('data-equipo-nombre') === 'Lobos', 'Bruno también ve a su equipo')
  await panel.getByRole('button', { name: 'Alumno siguiente' }).click()
  await p.waitForTimeout(800)
  ok(await franja.count() === 0, 'Carla, sola en su equipo, no la ve')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  console.log('  ✗ FALLO inesperado — ' + e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
