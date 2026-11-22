/**
 * Los equipos de una clase de punta a punta: la pestaña «Equipos» de «Mis
 * clases», un agrupamiento nuevo, el reparto al azar (todos colocados, en la
 * fila de IndexedDB con id del aparato), mover a un alumno a mano, renombrar
 * un equipo, decir para qué área vale, que salga en la copia de seguridad y
 * el borrado lógico. Ver frontend/src/db/equipos.ts.
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

/** Los agrupamientos guardados, borrados incluidos. */
const filas = () => p.evaluate(async () => {
  const q = await import('/src/db/localDb.ts')
  return q.db.table('agrupamientos').toArray()
})
/** Espera a que lo guardado cumpla la condición (hasta 4 s) y lo devuelve. */
const hasta = async (cond) => {
  let f = await filas()
  for (let i = 0; i < 20 && !cond(f); i++) { await p.waitForTimeout(200); f = await filas() }
  return f
}

try {
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const ids = await p.evaluate(async () => {
    const q = await import('/src/db/queries.ts')
    const g = await q.crearGrupo({
      nombre: '6ºA', etapa: 'primaria', curso: '6',
      comunidad: 'Galicia', curso_escolar: '2026-2027', color: '#1a4a7a',
    })
    const nombres = [['Uxía', 'Ferreiro'], ['Brais', 'Outeiro'], ['Antía', 'Lois'], ['Xoel', 'Varela'], ['Iria', 'Castro'], ['Martiño', 'Rey'], ['Noa', 'Souto']]
    const alumnos = []
    for (const [nombre, apellidos] of nombres) alumnos.push(await q.crearAlumno({ nombre, apellidos, neae: 0 }, g))
    localStorage.setItem('miclase_clase_activa', String(g))
    return { g, alumnos }
  })
  await p.goto(`${BASE}/grupos/${ids.g}?pestana=equipos`, { waitUntil: 'networkidle' })

  console.log('\n1. La pestaña «Equipos» de la clase')
  const pantalla = p.locator('[data-equipos-clase]')
  await pantalla.waitFor({ timeout: 8000 })
  ok(await p.getByRole('tab', { name: 'Equipos', exact: true }).count() === 1, 'la clase tiene la pestaña «Equipos»')
  ok(await p.locator('[data-equipos-vacio]').count() === 1, 'sin equipos, lo dice')

  console.log('\n2. Un agrupamiento nuevo y el reparto al azar')
  await p.locator('[data-agrupamiento-nuevo]').click()
  const tarjeta = p.locator('[data-agrupamiento]').first()
  await tarjeta.waitFor({ timeout: 5000 })
  ok(await tarjeta.locator('[data-equipo]').count() === 4, 'nace con cuatro equipos vacíos')
  ok(await tarjeta.locator('[data-alumno-suelto]').count() === 7, 'y todo el alumnado sin equipo')
  let f = await filas()
  ok(f.length === 1 && f[0].grupo_id === ids.g && f[0].id > 1000 && f[0].updated_at && f[0].deleted_at === null,
     'la fila se guarda con id del aparato y sellos', `id ${f[0]?.id}`)
  await tarjeta.locator('[data-reparto-cuantos]').fill('3')
  await tarjeta.locator('[data-reparto-azar]').click()
  f = await hasta(x => x[0].equipos.length === 3)
  const colocados = f[0].equipos.flatMap(e => e.alumnos)
  ok(f[0].equipos.length === 3 && colocados.length === 7 && new Set(colocados).size === 7, 'tres equipos con los siete, nadie repetido')
  const tam = f[0].equipos.map(e => e.alumnos.length)
  ok(Math.max(...tam) - Math.min(...tam) <= 1, 'parejos', tam.join(' '))
  ok(preguntas.length === 0, 'el primer reparto no pregunta: no había nadie colocado')
  await tarjeta.locator('[data-sin-equipo]').waitFor({ state: 'detached', timeout: 4000 })
  ok((await tarjeta.locator('[data-agrupamiento-resumen]').innerText()).includes('7 de 7'), 'el resumen dice 7 de 7 colocados')
  await tarjeta.locator('[data-reparto-azar]').click()
  for (let i = 0; i < 20 && !preguntas.length; i++) await p.waitForTimeout(100)
  ok(preguntas.some(t => t.includes('Repartir de nuevo')), 'repartir otra vez sí pregunta', preguntas[0]?.slice(0, 60))
  await p.waitForTimeout(400)

  console.log('\n3. A mano: sacar, poner y renombrar')
  f = await filas()
  const quien = f[0].equipos[0].alumnos[0]
  await tarjeta.locator(`[data-equipo-sacar="${quien}"]`).click()
  await tarjeta.locator(`[data-alumno-suelto="${quien}"]`).waitFor({ timeout: 4000 })
  f = await filas()
  ok(!f[0].equipos.some(e => e.alumnos.includes(quien)), 'sacado: no está en ningún equipo')
  const destino = f[0].equipos[2].clave
  await tarjeta.locator(`[data-alumno-poner="${quien}"]`).selectOption(destino)
  f = await hasta(x => x[0].equipos[2].alumnos.includes(quien))
  ok(f[0].equipos[2].alumnos.includes(quien) && f[0].equipos.flatMap(e => e.alumnos).filter(a => a === quien).length === 1,
     'puesto en otro equipo, y solo en ese')
  const nombreEquipo = tarjeta.locator('[data-equipo]').first().locator('[data-equipo-nombre]')
  await nombreEquipo.fill('Lobos')
  await nombreEquipo.blur()
  f = await hasta(x => x[0].equipos[0].nombre === 'Lobos')
  ok(f[0].equipos[0].nombre === 'Lobos', 'el equipo se renombra')
  const nombre = tarjeta.locator('[data-agrupamiento-nombre]')
  await nombre.fill('Equipos de proyecto')
  await nombre.blur()
  f = await hasta(x => x[0].nombre === 'Equipos de proyecto')
  ok(f[0].nombre === 'Equipos de proyecto', 'y el agrupamiento también')

  console.log('\n4. Para qué vale')
  const area = await p.evaluate(async (g) => {
    const q = await import('/src/db/queries.ts')
    const l = await import('/src/db/localDb.ts')
    const id = Date.now()
    await l.db.asignaturas.add({ id, grupo_id: g, nombre_display: 'Ciencias Sociais', updated_at: new Date().toISOString(), deleted_at: null })
    return (await q.getAsignaturas(g)).find(a => a.id === id)?.id ?? null
  }, ids.g)
  ok(area != null, 'hay un área en la clase para elegir')
  await p.reload({ waitUntil: 'networkidle' })
  await tarjeta.waitFor({ timeout: 8000 })
  ok((await tarjeta.locator('[data-agrupamiento-resumen]').innerText()).startsWith('Todas las áreas'), 'sin decir nada vale para todas las áreas')
  await tarjeta.locator('[data-agrupamiento-area]').selectOption(String(area))
  f = await hasta(x => x[0].asignatura_id === area)
  ok(f[0].asignatura_id === area && f[0].unidad_id === null, 'se guarda el área, sin unidad')
  await p.waitForTimeout(300)
  ok((await tarjeta.locator('[data-agrupamiento-resumen]').innerText()).startsWith('Ciencias Sociais'), 'y el resumen la nombra')

  console.log('\n5. Copia de seguridad y borrado')
  const copia = await p.evaluate(async () => {
    const q = await import('/src/db/queries.ts')
    return JSON.parse(await q.exportarDatos())
  })
  ok(copia.agrupamientos?.length === 1 && copia.agrupamientos[0].nombre === 'Equipos de proyecto', 'la copia lleva los equipos')
  await tarjeta.locator('[data-agrupamiento-borrar]').click()
  await p.locator('[data-equipos-vacio]').waitFor({ timeout: 5000 })
  f = await filas()
  ok(f.length === 1 && !!f[0].deleted_at, 'borrado lógico: la fila sigue, con deleted_at')
  ok(preguntas.some(t => t.includes('Borrar «Equipos de proyecto»')), 'borrar pregunta con el nombre')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  console.log('  ✗ FALLO inesperado — ' + e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
