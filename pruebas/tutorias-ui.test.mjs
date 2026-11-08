/**
 * Seguimiento de tutorías de punta a punta: la entrada del menú, una tutoría
 * con la familia desde un modelo de serie (alumno, asistente, temas y un
 * acuerdo ya vencido), su fila en IndexedDB con id del aparato, el acuerdo en
 * «pendientes», el acta guardada como .html, un modelo propio que aparece al
 * crear la siguiente, la tutoría de seguimiento que marca el acuerdo
 * anterior como cumplido en SU tutoría, los filtros, el historial en la
 * ficha del alumno y el borrado lógico. Ver frontend/src/db/tutorias.ts.
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { navegadorChromium } from './lib/entorno.mjs'

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
const ctx = await navegador.newContext({ viewport: { width: 1300, height: 950 }, acceptDownloads: true })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
p.on('dialog', d => d.accept())

/** Todas las filas de una tabla, borradas incluidas. */
const filas = (tabla) => p.evaluate(async (tabla) => {
  const q = await import('/src/db/localDb.ts')
  return q.db.table(tabla).toArray()
}, tabla)

const editor = p.locator('[data-tutoria-editor]')

/** Cuántas filas tiene la lista, esperando a que se asiente en `n` (hasta 4 s). */
const filasLista = async (n) => {
  const l = p.locator('[data-tutoria-fila]')
  for (let i = 0; i < 20 && await l.count() !== n; i++) await p.waitForTimeout(200)
  return l.count()
}

try {
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const ids = await p.evaluate(async () => {
    const q = await import('/src/db/queries.ts')
    const g = await q.crearGrupo({
      nombre: '6ºA', etapa: 'primaria', curso: '6',
      comunidad: 'Galicia', curso_escolar: '2026-2027', color: '#1a4a7a',
    })
    const uxia = await q.crearAlumno({ nombre: 'Uxía', apellidos: 'Ferreiro', neae: 0 }, g)
    const brais = await q.crearAlumno({ nombre: 'Brais', apellidos: 'Outeiro', neae: 0 }, g)
    localStorage.setItem('miclase_clase_activa', String(g))
    return { g, uxia, brais }
  })
  await p.reload({ waitUntil: 'networkidle' })

  console.log('\n1. La entrada del menú')
  const enlace = p.getByRole('link', { name: 'Tutorías', exact: true })
  ok(await enlace.count() === 1, 'el menú lleva «Tutorías» en el bloque Aula')
  await enlace.click()
  await p.locator('[data-tutoria-nueva]').waitFor({ timeout: 8000 })
  ok(await p.getByText('Todavía no hay tutorías en esta clase').count() === 1, 'sin tutorías, lo dice')

  console.log('\n2. Tutoría con la familia desde el modelo de serie')
  await p.locator('[data-tutoria-nueva]').click()
  const modelos = await p.locator('[data-elegir-modelo] [data-modelo]').evaluateAll(els => els.map(e => e.getAttribute('data-modelo')))
  ok(['serie:familia', 'serie:inicial', 'serie:seguimiento'].every(m => modelos.includes(m)), 'ofrece los tres modelos de serie', modelos.join(' '))
  await p.locator('[data-modelo="serie:familia"]').click()
  await editor.waitFor({ timeout: 5000 })
  ok(await editor.locator('[data-apartado="temas"]').count() === 1 && await editor.locator('[data-apartado="familia"]').count() === 1,
     'el editor trae los apartados del modelo')
  ok(await editor.locator('[data-tutoria-orden] input[aria-label$="del orden del día"]').count() === 4, 'y su orden del día')
  ok(await editor.locator('[data-aviso-tutoria]').count() === 1, 'avisa de que se anote solo lo necesario')
  await editor.locator('[data-tutoria-fecha]').fill('2026-10-15T16:30')
  await editor.locator(`[data-tutoria-alumno="${ids.uxia}"]`).check()
  await editor.locator('[data-asistente-anadir]').click()
  await editor.locator('[data-asistente-nombre]').fill('Ana Ferreiro')
  await editor.locator('[data-asistente-rol]').fill('Madre')
  await editor.locator('#tut-ap-temas').fill('Lectura en casa y organización de la agenda.')
  await editor.locator('[data-acuerdo-anadir]').click()
  await editor.locator('[data-acuerdo-texto]').fill('Leer 20 minutos cada día')
  await editor.locator('[data-acuerdo-fecha]').fill('2026-10-30')
  await editor.locator('[data-tutoria-proxima]').fill('2026-12-10T16:30')
  await editor.locator('[data-tutoria-guardar]').click()
  await editor.getByText('Tutoría guardada en este dispositivo.').waitFor({ timeout: 5000 })

  let tut = (await filas('tutorias')).filter(t => !t.deleted_at)
  const primera = tut[0]
  ok(tut.length === 1, 'hay una tutoría guardada')
  ok(primera?.id > 1000000, 'con id del rango del aparato (pasa por nuevo())', `id=${primera?.id}`)
  ok(!!primera?.updated_at && primera?.deleted_at === null, 'con sello de sincronización')
  ok(JSON.stringify(primera?.alumnos) === JSON.stringify([ids.uxia]), 'nombra a Uxía')
  ok(primera?.asistentes?.[0]?.nombre === 'Ana Ferreiro' && primera?.asistentes?.[0]?.rol === 'Madre', 'con su asistente y rol')
  ok(primera?.apartados?.find(a => a.clave === 'temas')?.texto.includes('Lectura en casa'), 'con los temas tratados')
  ok(primera?.acuerdos?.length === 1 && primera.acuerdos[0].estado === 'pendiente' && primera.acuerdos[0].fecha_prevista === '2026-10-30',
     'con el acuerdo pendiente y su fecha prevista')
  ok(primera?.modelo_clave === 'serie:familia' && primera?.proxima_cita === '2026-12-10T16:30', 'recuerda el modelo y la próxima cita')

  console.log('\n3. El acta')
  const descarga = p.waitForEvent('download')
  await editor.locator('[data-tutoria-acta-guardar]').click()
  const fichero = await descarga
  const ruta = process.env.SCRATCH + '/acta-tutoria.html'
  await fichero.saveAs(ruta)
  const acta = readFileSync(ruta, 'utf8')
  ok(fichero.suggestedFilename().startsWith('acta-tutoria-2026-10-15'), 'se llama por la fecha', fichero.suggestedFilename())
  ok(acta.includes('Acta de tutoría') && acta.includes('Ferreiro, Uxía') && acta.includes('Ana Ferreiro · Madre'), 'lleva alumna y asistente')
  ok(acta.includes('Leer 20 minutos cada día') && acta.includes('Tutor/a'), 'lleva el acuerdo y la firma del tutor')
  ok(acta.includes('data:font/woff2'), 'lleva las fuentes dentro (se abre sin la app)')
  await editor.getByRole('button', { name: 'Cerrar' }).click()

  console.log('\n4. La lista y los acuerdos pendientes')
  await p.locator(`[data-tutoria-fila="${primera.id}"]`).waitFor({ timeout: 5000 })
  ok(await p.locator('[data-acuerdo-pendiente]').count() === 1, 'el acuerdo sale en pendientes')
  ok(await p.locator('[data-acuerdo-pendiente][data-vencido="1"]').count() === 1, 'marcado como vencido (la fecha ya pasó)')

  console.log('\n5. Un modelo propio')
  await p.locator('[data-modelos-abrir]').click()
  await p.locator('[data-modelo-nuevo]').click()
  await p.locator('[data-modelo-nombre]').fill('Reunión con orientación')
  await p.locator('[data-modelo-orden]').fill('Valoración del caso\nPlan de trabajo')
  await p.locator('[data-modelo-apartado-anadir]').click()
  await p.locator('[data-modelo-apartado-titulo]').last().fill('Plan de trabajo')
  await p.locator('[data-modelo-guardar]').click()
  await p.locator('[data-modelos-msg]').getByText(/guardado/).waitFor({ timeout: 5000 })
  const mods = (await filas('modelos_tutoria')).filter(m => !m.deleted_at)
  ok(mods.length === 1 && mods[0].id > 1000000 && mods[0].apartados.length === 2 && mods[0].orden_dia.length === 2,
     'el modelo queda guardado con sus apartados y su orden del día', JSON.stringify(mods[0]?.apartados?.map(a => a.titulo)))
  await p.locator('[data-modelos-tutoria]').getByRole('button', { name: 'Cerrar' }).click()

  await p.locator('[data-tutoria-nueva]').click()
  await p.locator(`[data-modelo="propio:${mods[0].id}"]`).click()
  await editor.waitFor()
  ok(await editor.getByText('Plan de trabajo', { exact: true }).count() >= 1, 'al crear la siguiente, el modelo propio pone su apartado')
  await editor.locator('[data-tutoria-tipo]').selectOption('equipo')
  await editor.locator('[data-tutoria-fecha]').fill('2026-10-20T13:00')
  await editor.locator(`[data-tutoria-alumno="${ids.brais}"]`).check()
  await editor.locator('[data-tutoria-guardar]').click()
  await editor.getByText('Tutoría guardada en este dispositivo.').waitFor({ timeout: 5000 })
  await editor.getByRole('button', { name: 'Cerrar' }).click()

  console.log('\n6. Tutoría de seguimiento: el acuerdo anterior, cumplido')
  await p.locator('[data-tutoria-nueva]').click()
  await p.locator('[data-modelo="serie:seguimiento"]').click()
  await editor.waitFor()
  await editor.locator('[data-tutoria-fecha]').fill('2026-11-05T16:30')
  await editor.locator(`[data-tutoria-alumno="${ids.uxia}"]`).check()
  await editor.locator('[data-acuerdo-anterior]').first().waitFor({ timeout: 5000 })
  ok(await editor.locator('[data-acuerdo-anterior]').count() === 1, 'trae a la vista el acuerdo pendiente de la tutoría anterior')
  await editor.locator('[data-acuerdo-anterior] [data-revisar="cumplido"]').click()
  await editor.getByText(/Acuerdo marcado como «cumplido»/).waitFor({ timeout: 5000 })
  await editor.locator('[data-tutoria-guardar]').click()
  await editor.getByText('Tutoría guardada en este dispositivo.').waitFor({ timeout: 5000 })
  tut = (await filas('tutorias')).filter(t => !t.deleted_at)
  const antes = tut.find(t => t.id === primera.id)
  const seguimiento = tut.find(t => t.modelo_clave === 'serie:seguimiento')
  ok(antes?.acuerdos?.[0]?.estado === 'cumplido' && antes.acuerdos[0].fecha_revision === '2026-11-05',
     'el acuerdo queda cumplido en SU tutoría, con el día de la revisión')
  ok(antes?.updated_at > primera.updated_at, 'la tutoría de origen se vuelve a sellar (viaja en el siguiente sync)')
  ok(seguimiento?.revisados?.length === 1 && seguimiento.revisados[0].tutoria_id === primera.id, 'la de seguimiento anota qué revisó, para su acta')
  await editor.getByRole('button', { name: 'Cerrar' }).click()
  ok(await p.locator('[data-acuerdo-pendiente]').count() === 0, 'ya no quedan acuerdos pendientes')

  console.log('\n7. Filtros')
  ok(await filasLista(3) === 3, 'tres tutorías en la lista')
  await p.locator('[data-filtro-alumno]').selectOption(String(ids.uxia))
  ok(await filasLista(2) === 2, 'por alumno: las dos de Uxía')
  await p.locator('[data-filtro-alumno]').selectOption('')
  await p.locator('[data-filtro-tipo]').selectOption('equipo')
  ok(await filasLista(1) === 1, 'por tipo: la del equipo docente')
  await p.locator('[data-filtro-tipo]').selectOption('')
  await p.locator('[data-filtro-desde]').fill('2026-11-01')
  ok(await filasLista(1) === 1, 'por fechas: solo la de noviembre')
  await p.locator('[data-filtro-desde]').fill('')

  console.log('\n8. Historial en la ficha del alumno')
  await p.getByRole('link', { name: 'Alumnado', exact: true }).click()
  await p.getByRole('button', { name: /Editar Uxía Ferreiro/ }).click()
  const historial = p.locator('[data-historial-tutorias]')
  await historial.waitFor({ timeout: 5000 })
  ok(await historial.locator('[data-historial-fila]').count() === 2, 'la ficha de Uxía enseña sus dos tutorías')
  ok(await historial.getByText(/Tutorías \(2\)/).count() === 1, 'con el total')
  await historial.locator(`[data-historial-fila="${primera.id}"]`).click()
  await editor.waitFor({ timeout: 5000 })
  ok(p.url().includes('/tutorias'), 'el historial lleva a la tutoría en su pantalla')
  ok((await editor.locator('#tut-ap-temas').inputValue()).includes('Lectura en casa'), 'y la abre')

  console.log('\n9. Borrado lógico')
  await editor.locator('[data-tutoria-borrar]').click()
  await p.waitForTimeout(500)
  const borrada = (await filas('tutorias')).find(t => t.id === primera.id)
  ok(!!borrada && !!borrada.deleted_at, 'la fila sigue, con deleted_at (el borrado tiene que viajar)')
  await p.locator('[data-filtro-alumno]').selectOption('')
  ok(await p.locator(`[data-tutoria-fila="${primera.id}"]`).count() === 0, 'y desaparece de la lista')
} catch (e) {
  console.error(e)
  fallos++
} finally {
  await navegador.close()
}

if (erroresConsola.length) { console.log(erroresConsola.join('\n')); fallos++ }
console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ tutorías bien')
process.exit(fallos ? 1 : 0)
