/**
 * El banco de pruebas, de punta a punta.
 *
 * Un examen definido en un instrumento tiene que poder elegirse desde otro
 * —de la misma clase o de otra— sin pasar por un fichero. Se comprueba lo
 * que haría del banco una lista inservible si fallara: que el mismo examen
 * en dos sitios salga una sola vez, que elegirlo sea una copia, que guardarlo
 * dos veces no lo duplique, que las rúbricas no lo vean (`esRubrica`) y que
 * la copia del banco sobreviva al borrado del instrumento.
 */
import { mkdirSync } from 'node:fs'
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const TIROS = process.env.SCRATCH + '/tiros'

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1400, height: 1000 } })
const p = await ctx.newPage()
const erroresConsola = []
p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
// Las confirmaciones (cargar encima, quitar del banco, borrar instrumento) se aceptan.
p.on('dialog', d => d.accept())
const foto = async n => p.screenshot({ path: `${TIROS}/${n}.png`, fullPage: true })
const aparece = (loc) => loc.waitFor({ timeout: 5000 }).then(() => true, () => false)

const gestor = p.getByRole('dialog', { name: /Gestionar instrumentos/ })
const editorDe = nombre => p.getByRole('dialog', { name: new RegExp(`Examen de ${nombre}`) })

/** Crea un instrumento de prueba escrita y abre su examen general desde el gestor. */
const nuevaPrueba = async (nombre) => {
  await gestor.getByRole('button', { name: /\+ Nuevo instrumento/ }).click()
  await gestor.getByPlaceholder('Nombre del instrumento *').fill(nombre)
  await gestor.locator('select').last().selectOption('prueba-escrita')
  await gestor.getByRole('button', { name: 'Crear', exact: true }).click()
  await p.waitForTimeout(400)
  // La fila del instrumento es el div más interno que tiene su nombre y su botón «Examen».
  await gestor.locator('div').filter({ has: p.locator(`input[value="${nombre}"]`) })
    .filter({ has: p.getByRole('button', { name: '📝 Examen' }) }).last()
    .getByRole('button', { name: '📝 Examen' }).click()
  const editor = editorDe(nombre)
  await editor.waitFor({ timeout: 8000 })
  await editor.getByText('Cargando…').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
  return editor
}

const examenesEnBD = () => p.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result) })
  const filas = await new Promise((res) => {
    const tx = db.transaction('rubricas', 'readonly').objectStore('rubricas').getAll()
    tx.onsuccess = () => res(tx.result.filter(r => !r.deleted_at))
  })
  return filas.map(r => ({ titulo: r.titulo, tipo: r.tipo ?? null, instrumento_id: r.instrumento_id, area: r.area, nivel: r.nivel, n: r.prueba_json ? JSON.parse(r.prueba_json).preguntas.length : 0 }))
})

try {
  console.log('\n1. Un examen guardado en un instrumento')
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
  await p.goto(BASE + '/evaluacion', { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: /⚙ Instrumentos/ }).click()

  let editor = await nuevaPrueba('Proba escrita')
  ok(!(await editor.locator('[data-banco-pruebas]').isVisible().catch(() => false)), 'con el banco vacío, el editor no lo abre solo')
  await editor.getByRole('button', { name: '📚 Mi banco' }).click()
  ok(await aparece(editor.getByText(/Todavía no hay exámenes en tu banco/)), 'el banco vacío lo dice y explica cómo se llena')
  await editor.getByRole('button', { name: 'Cerrar el banco' }).click()
  await editor.getByLabel('Título del examen').fill('Os ríos de Galicia')
  // Un test con tres preguntas de 1 punto: «Repartir» deja tres; luego la clave.
  await editor.locator('label').filter({ hasText: /^Test/ }).locator('input[type="radio"]').check()
  await editor.locator('#gen-n').fill('3')
  await editor.locator('#gen-total').fill('3')
  await editor.getByRole('button', { name: /Repartir a partes iguales/ }).click()
  await editor.getByRole('button', { name: 'Dar 4 opciones a todas' }).click()
  for (let i = 1; i <= 3; i++) {
    await editor.getByLabel(`Enunciado de la pregunta ${i}`).fill(`Pregunta ${i} dos ríos`)
    // Las opciones salen plegadas: se despliegan para rellenarlas.
    await editor.locator(`[data-opciones-de="p${i}"] button[aria-expanded="false"]`).click()
    await editor.getByLabel(`Opción A de la pregunta ${i}`, { exact: true }).fill('Miño')
    await editor.getByLabel(`Opción B de la pregunta ${i}`, { exact: true }).fill('Sil')
    await editor.getByLabel(`Opción A de la pregunta ${i} es la correcta`).check()
  }
  ok(await editor.locator('[data-estado-clave="completa"]').isVisible(), 'test con clave completa')
  await editor.getByRole('button', { name: /Guardar examen/ }).click()
  await editor.getByText('✅ Guardado en este dispositivo').waitFor({ timeout: 5000 })
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()

  console.log('\n2. Elegirlo desde otro instrumento')
  editor = await nuevaPrueba('Proba de repaso')
  ok(await aparece(editor.locator('[data-banco-pruebas]')), 'sin examen aquí y con uno en el banco, el editor abre con el banco a la vista')
  const tarjeta = editor.locator('[data-prueba-banco="Os ríos de Galicia"]')
  await tarjeta.waitFor({ timeout: 5000 })
  ok(await tarjeta.getByText(/3 preguntas · 3 puntos · Test · con clave/).isVisible(), 'el banco lo lista con sus preguntas, puntos, tipo y clave')
  ok(await tarjeta.getByText(/En uso en: 6ºA · Ciencias Sociales · Proba escrita/).isVisible(), 'y dice dónde se usa')
  await tarjeta.getByRole('button', { name: 'Ver' }).click()
  ok(await tarjeta.getByText(/Pregunta 2 dos ríos — 1 pt · 4 opciones, correcta A/).isVisible(), '«Ver» enseña las preguntas con puntos y correcta')
  await foto('prueba-banco-01-elegir')
  await tarjeta.getByRole('button', { name: 'Usar este' }).click()
  await editor.getByText(/copiado de tu banco/).waitFor({ timeout: 5000 })
  ok(await editor.getByLabel('Título del examen').inputValue() === 'Os ríos de Galicia', 'se carga en el editor')
  ok(await editor.locator('[data-estado-clave="completa"]').isVisible(), 'con su clave')
  ok(await editor.getByText('● Cambios sin guardar').isVisible(), 'sin guardar todavía')
  await editor.getByRole('button', { name: /Guardar examen/ }).click()
  await editor.getByText('✅ Guardado en este dispositivo').waitFor({ timeout: 5000 })
  let bd = await examenesEnBD()
  ok(bd.length === 2 && bd.every(r => r.tipo === 'prueba') && new Set(bd.map(r => r.instrumento_id)).size === 2,
    'es una copia: dos exámenes, uno por instrumento', JSON.stringify(bd))

  console.log('\n3. El mismo examen en dos sitios sale una vez')
  await editor.getByRole('button', { name: '📚 Mi banco' }).click()
  ok(await aparece(tarjeta.getByText(/Proba escrita — 6ºA · Ciencias Sociales · Proba de repaso/)), 'con sus dos usos')
  ok(await editor.locator('[data-prueba-banco]').count() === 1, 'en una sola tarjeta')

  console.log('\n4. Guardar en el banco')
  await editor.getByRole('button', { name: '⭐ Guardar en mi banco' }).click()
  await editor.getByText(/guardado en tu banco/).waitFor({ timeout: 5000 })
  ok(await aparece(tarjeta.getByText('⭐ En el banco')), 'la tarjeta pasa a «En el banco»')
  bd = await examenesEnBD()
  const copia = bd.find(r => r.instrumento_id === 0)
  ok(bd.length === 3 && copia?.tipo === 'prueba' && copia?.area === 'Ciencias Sociales' && /6/.test(copia?.nivel || '') && copia.n === 3,
    'copia aparte, con su área y su curso', JSON.stringify(copia))
  await editor.getByRole('button', { name: '⭐ Guardar en mi banco' }).click()
  await editor.getByText(/ya estaba en tu banco/).waitFor({ timeout: 5000 })
  ok((await examenesEnBD()).length === 3, 'guardarlo otra vez no lo duplica')
  await foto('prueba-banco-02-lleno')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()

  console.log('\n5. Las rúbricas no ven los exámenes del banco')
  await gestor.getByRole('button', { name: /\+ Nuevo instrumento/ }).click()
  await gestor.getByPlaceholder('Nombre del instrumento *').fill('Exposición')
  await gestor.locator('select').last().selectOption('rubrica')
  await gestor.getByRole('button', { name: 'Crear', exact: true }).click()
  const rubrica = p.getByRole('dialog', { name: /Rúbrica de Exposición/ })
  await rubrica.waitFor({ timeout: 8000 })
  await rubrica.getByRole('button', { name: /Elegir de mi banco/ }).click()
  ok(await aparece(rubrica.getByText(/Todavía no hay rúbricas en tu banco/)), 'el banco de rúbricas sigue vacío')
  ok(await rubrica.locator('[data-rubrica-banco]').count() === 0, 'ningún examen se cuela como rúbrica')
  await rubrica.getByRole('button', { name: 'Cerrar', exact: true }).last().click()

  console.log('\n6. Borrar el instrumento conserva su examen en el banco')
  // Se quita la copia del banco para ver que el borrado deja una nueva.
  editor = await nuevaPrueba('Otra proba')
  await editor.locator('[data-prueba-banco="Os ríos de Galicia"]').getByRole('button', { name: 'Quitar del banco' }).click()
  await editor.getByText(/quitado del banco/).waitFor({ timeout: 5000 })
  ok((await examenesEnBD()).filter(r => r.instrumento_id === 0).length === 0, 'sin copia en el banco')
  ok(await aparece(editor.locator('[data-prueba-banco="Os ríos de Galicia"]').getByText(/En uso en/)), 'pero sigue listado por sus usos')
  await editor.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  // Borrar «Proba escrita» y «Proba de repaso»: los dos primeros de la lista.
  await gestor.getByRole('button', { name: 'Eliminar' }).first().click()
  await p.waitForTimeout(500)
  await gestor.getByRole('button', { name: 'Eliminar' }).first().click()
  await p.waitForTimeout(500)
  bd = await examenesEnBD()
  const salvados = bd.filter(r => r.titulo === 'Os ríos de Galicia' && r.instrumento_id === 0)
  ok(salvados.length === 1 && salvados[0].tipo === 'prueba' && salvados[0].area === 'Ciencias Sociales',
    'al borrar queda UNA copia en el banco (no una por instrumento), con su área', JSON.stringify(bd))
  editor = await nuevaPrueba('Nueva')
  const superviviente = editor.locator('[data-prueba-banco="Os ríos de Galicia"]')
  ok(await aparece(superviviente.getByText('⭐ En el banco')), 'sigue en el banco')
  ok(!(await superviviente.getByText(/En uso en/).isVisible().catch(() => false)), 'ya sin usos')
  await superviviente.getByRole('button', { name: 'Usar este' }).click()
  ok(await aparece(editor.getByText(/copiado de tu banco/)), 'y se puede elegir desde otro instrumento')

  ok(erroresConsola.length === 0, 'sin errores de página', erroresConsola.join(' | '))
} catch (e) {
  await foto('prueba-banco-error').catch(() => {})
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
