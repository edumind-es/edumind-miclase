/**
 * Una clase de verdad para las pruebas de aspecto: 6ºA de Galicia con Ciencias
 * Sociales, la programación de PROENS (siete unidades), tres alumnos, un
 * examen dentro de la prueba escrita y notas de los cinco tramos.
 *
 * Se monta por la interfaz, como lo haría un docente, y con el aspecto DE
 * SIEMPRE (que es el que conocen estos pasos); quien quiera mirarla en Lámina
 * la enciende después. Son los mismos pasos que usa recuperacion-ui.test.mjs.
 */
import { join } from 'node:path'
import { irAlAlumnado } from './entorno.mjs'

const PDF = join(process.cwd(), 'pruebas/fixtures/proens_ccss6.pdf')

export async function sembrarClaseConNotas(p, BASE) {
  await p.goto(BASE + '/?aspecto=clasico', { waitUntil: 'networkidle' })
  await p.evaluate(() => localStorage.setItem('miclase.idioma', 'es'))
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

  // Un examen con dos criterios en la primera unidad y notas de todos los tramos:
  // Ana 3 y 9,5 · Bruno 7 y 6 · Carla 5 y sin nota
  return p.evaluate(async () => {
    const q = await import('/src/db/queries.ts')
    const l = await import('/src/db/localDb.ts')
    const asig = (await l.db.asignaturas.toArray()).find(a => !a.deleted_at)
    const unidad = (await q.getUnidades(asig.id))[0]
    const proba = (await q.getFamilias(asig.id)).find(f => f.tipo === 'prueba-escrita')
    const criterios = unidad.criterios.filter(c => c.instrumentos.some(v => v.instrumento_id === proba.id)).map(c => c.criterio_id).slice(0, 2)
    const examen = await q.crearInstrumentoHijo(proba.id, { nombre: 'Examen', tipo: 'prueba-escrita' })
    for (const c of criterios) await q.asignarCriterioAColumna(examen, unidad.id, c)
    const als = await q.getAlumnosByGrupo(asig.grupo_id)
    const notas = [[3, 9.5], [7, 6], [5, null]]
    await q.saveCalificaciones(als.flatMap((a, i) => criterios.map((criterio_id, k) => ({
      alumno_id: a.id, instrumento_id: examen, criterio_id, asignatura: 'ciencias_sociales',
      curso: '6', etapa: 'primaria', comunidad: 'Galicia', trimestre: unidad.trimestre ?? 1, valor: notas[i][k], unidad_id: unidad.id,
    })).filter(n => n.valor != null)), { sinVinculos: true })
    localStorage.setItem('miclase_clase_activa', String(asig.grupo_id))
    return { grupo: asig.grupo_id, asig: asig.id, unidad: unidad.id, trimestre: unidad.trimestre ?? 1, examen, criterios }
  })
}
