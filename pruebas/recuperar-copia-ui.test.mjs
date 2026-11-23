/**
 * Recuperar notas sueltas de una copia de seguridad sin importarla: el caso
 * de Luis (nov 2026). Las notas del examen de la UD1 se pisaron al corregir
 * el de la UD2, y entre la copia y el destrozo el instrumento se convirtió en
 * actividad (las filas cambiaron de `instrumento_id`, no de id). Se comprueba
 * que la pantalla enseña solo la UD1, que devuelve nota y respuestas, que lo
 * que había queda como fantasma, que quita la nota que la copia no tenía y
 * que la UD2 no se toca. Ver frontend/src/db/recuperarDeCopia.ts.
 */
import { mkdirSync } from 'node:fs'
import { navegadorChromium, aceptarConfirmaciones } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH, { recursive: true })

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1300, height: 950 } })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
const preguntas = []
await aceptarConfirmaciones(p, t => preguntas.push(t))

/** Las notas vivas, como [alumno, unidad, criterio] → fila. */
const notas = () => p.evaluate(async () => {
  const { db } = await import('/src/db/localDb.ts')
  return (await db.calificaciones.toArray()).filter(c => !c.deleted_at)
    .map(c => ({ a: c.alumno_id, u: c.unidad_id, c: c.criterio_id, i: c.instrumento_id, valor: c.valor ?? null,
      anterior: c.valor_anterior ?? null, respuestas: JSON.stringify(c.niveles_rubrica ?? null) }))
})
const nota = (lista, a, u, c) => lista.find(n => n.a === a && n.u === u && n.c === c)

try {
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const d = await p.evaluate(async () => {
    const q = await import('/src/db/queries.ts')
    const { db } = await import('/src/db/localDb.ts')
    const { cifrarExport } = await import('/src/auth/crypto.ts')
    const g = await q.crearGrupo({ nombre: '6ºA', etapa: 'primaria', curso: '6', comunidad: 'Galicia', curso_escolar: '2026-2027', color: '#1a4a7a' })
    const ana = await q.crearAlumno({ nombre: 'Ana', apellidos: 'Abad', neae: 0 }, g)
    const bruno = await q.crearAlumno({ nombre: 'Bruno', apellidos: 'Bello', neae: 0 }, g)
    const ahora = new Date().toISOString()
    const AREA = 9001, FAMILIA = 9101, ACTIVIDAD = 9102, UD1 = 9201, UD2 = 9202
    await db.asignaturas.add({ id: AREA, grupo_id: g, nombre: 'matematicas', nombre_display: 'Matemáticas', updated_at: ahora, deleted_at: null })
    await db.instrumentos.add({ id: FAMILIA, asignatura_id: AREA, nombre: 'Proba escrita', tipo: 'prueba-escrita', peso: 80, updated_at: ahora, deleted_at: null })
    await db.unidades.add({ id: UD1, asignatura_id: AREA, nombre: 'UD1 Números', trimestre: 1, orden: 1, updated_at: ahora, deleted_at: null })
    await db.unidades.add({ id: UD2, asignatura_id: AREA, nombre: 'UD2 Problemas', trimestre: 1, orden: 2, updated_at: ahora, deleted_at: null })
    const area = { asignatura: 'matematicas', curso: '6', etapa: 'primaria', comunidad: 'Galicia', trimestre: 1 }
    const poner = (alumno_id, instrumento_id, unidad_id, criterio_id, valor, niveles_rubrica) =>
      q.saveCalificaciones([{ alumno_id, instrumento_id, unidad_id, criterio_id, valor, niveles_rubrica, ...area }], { sinVinculos: true })
    // Lo que había al hacer la copia: el examen de la UD1 de los dos y algo de la UD2.
    await poner(ana, FAMILIA, UD1, 'CE1.1', 8, { p1: 1, p2: 1 })
    await poner(bruno, FAMILIA, UD1, 'CE1.1', 6, { p1: 1, p2: 0 })
    await poner(ana, FAMILIA, UD2, 'CE1.1', 5, null)
    const copia = await cifrarExport(JSON.parse(await q.exportarDatos(db, { sinEvidencias: true })), 'clave-de-la-copia')
    // Después de la copia: el instrumento pasa a ser una actividad (misma fila,
    // otro instrumento_id), el otro examen pisa la UD1, pone una nota donde no
    // la había y se sigue trabajando en la UD2.
    await db.instrumentos.add({ id: ACTIVIDAD, asignatura_id: AREA, familia_id: FAMILIA, nombre: 'Examen de contenidos', tipo: 'prueba-escrita', peso: 1, updated_at: ahora, deleted_at: null })
    await db.calificaciones.where('instrumento_id').equals(FAMILIA).modify({ instrumento_id: ACTIVIDAD, updated_at: new Date().toISOString() })
    await poner(ana, ACTIVIDAD, UD1, 'CE1.1', 2, { p1: 0 })
    await poner(bruno, ACTIVIDAD, UD1, 'CE1.1', 3, { p1: 0 })
    await poner(ana, ACTIVIDAD, UD1, 'CE1.2', 2, { p1: 0 })
    await poner(bruno, ACTIVIDAD, UD2, 'CE1.1', 9, null)
    localStorage.setItem('miclase_clase_activa', String(g))
    return { ana, bruno, UD1, UD2, ACTIVIDAD, copia: JSON.stringify(copia) }
  })
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })

  console.log('\n1. Abrir la copia no cambia nada')
  const antes = await notas()
  await p.getByTitle('Exportar / Importar copia de seguridad').first().click()
  await p.locator('[data-recuperar-abrir]').click()
  await p.locator('[data-recuperar-fichero]').setInputFiles({ name: 'copia.miclase', mimeType: 'application/json', buffer: Buffer.from(d.copia) })
  await p.locator('[data-recuperar-clave]').fill('otra-clave')
  await p.locator('[data-recuperar-comparar]').click()
  ok(await p.getByText(/Contraseña incorrecta/).waitFor({ timeout: 8000 }).then(() => true, () => false), 'con otra contraseña lo dice y no sigue')
  await p.locator('[data-recuperar-clave]').fill('clave-de-la-copia')
  await p.locator('[data-recuperar-comparar]').click()
  const lista = p.locator('[data-recuperar-lista]')
  await lista.waitFor({ timeout: 8000 })
  ok(JSON.stringify(await notas()) === JSON.stringify(antes), 'comparar no escribe nada')

  console.log('\n2. Solo sale lo que se pisó')
  const grupos = lista.locator('[data-recuperar-grupo]')
  ok(await grupos.count() === 1, 'un solo grupo: la UD2, con trabajo nuevo y nada distinto, no sale', String(await grupos.count()))
  const grupo = grupos.first()
  ok(await grupo.getAttribute('data-unidad') === 'UD1 Números' && await grupo.getAttribute('data-instrumento') === 'Examen de contenidos',
    'es la UD1, con el nombre de la actividad que hoy tiene las notas', `${await grupo.getAttribute('data-unidad')} · ${await grupo.getAttribute('data-instrumento')}`)
  ok(/2 notas distintas, de 2 alumnos/.test(await grupo.textContent()), 'dice cuántas notas y de cuántos alumnos', (await grupo.textContent()).slice(0, 160))
  ok(await p.locator('[data-recuperar-aplicar]').isDisabled(), 'sin marcar nada no se puede recuperar')
  await grupo.locator('[data-recuperar-marcar]').check()
  const quitar = grupo.locator('[data-recuperar-quitar]')
  ok(await quitar.count() === 1 && /la nota que la copia no tenía/.test(await grupo.textContent()), 'ofrece quitar la nota que la copia no tenía en esa unidad')
  await quitar.check()

  console.log('\n3. Recuperar')
  await p.locator('[data-recuperar-aplicar]').click()
  ok(await p.getByText(/2 notas recuperadas de la copia y 1 quitada/).waitFor({ timeout: 8000 }).then(() => true, () => false), 'dice lo que ha hecho')
  ok(preguntas.some(t => /Devolver 2 notas/.test(t) && /UD1 Números/.test(t)), 'pregunta antes, con la unidad y la cifra', preguntas.join(' | ').slice(0, 200))
  const n = await notas()
  const a1 = nota(n, d.ana, d.UD1, 'CE1.1'), b1 = nota(n, d.bruno, d.UD1, 'CE1.1')
  ok(a1?.valor === 8 && a1.respuestas === JSON.stringify({ p1: 1, p2: 1 }) && b1?.valor === 6 && b1.respuestas === JSON.stringify({ p1: 1, p2: 0 }),
    'las dos casillas vuelven a su nota y a sus respuestas', JSON.stringify([a1, b1]))
  ok(a1?.anterior === 2 && b1?.anterior === 3, 'y lo que había queda como nota anterior')
  ok(a1?.i === d.ACTIVIDAD, 'la casilla sigue en la actividad de ahora, no vuelve al instrumento de la copia')
  const nueva = nota(n, d.ana, d.UD1, 'CE1.2')
  ok(nueva?.valor === null && nueva.anterior === 2 && nueva.respuestas === 'null', 'la nota que la copia no tenía se quita, también con fantasma', JSON.stringify(nueva))
  ok(nota(n, d.bruno, d.UD2, 'CE1.1')?.valor === 9 && nota(n, d.ana, d.UD2, 'CE1.1')?.valor === 5, 'la UD2 no se toca')
  ok(await p.locator('[data-recuperar-nada]').waitFor({ timeout: 6000 }).then(() => true, () => false), 'y ya no queda nada que recuperar')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await p.screenshot({ path: `${process.env.SCRATCH}/recuperar-copia-error.png`, fullPage: true }).catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
