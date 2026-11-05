/**
 * Datos sensibles (NEAE y evidencias): un aparato nuevo los trae apagados, uno
 * que ya los usaba los conserva encendidos al actualizar, y apagarlos esconde
 * sin borrar nada. Ver frontend/src/db/datosSensibles.ts.
 */
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
const BASE = process.env.BASE || 'http://127.0.0.1:5173'

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const erroresConsola = []

/** Un aparato con una clase y dos alumnos; Brais con NEAE si `conNeae`. */
async function aparato({ conNeae }) {
  const ctx = await navegador.newContext({ viewport: { width: 1300, height: 950 } })
  const p = await ctx.newPage()
  p.on('pageerror', e => erroresConsola.push('PAGEERROR: ' + e.message))
  p.on('dialog', d => d.accept())
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  // Lo de un aparato antes de esta versión: sin elección guardada
  await p.evaluate(async (conNeae) => {
    localStorage.removeItem('miclase.sensibles')
    const q = await import('/src/db/queries.ts')
    const g = await q.crearGrupo({
      nombre: '6ºA', etapa: 'primaria', curso: '6',
      comunidad: 'Galicia', curso_escolar: '2026-2027', color: '#1a4a7a',
    })
    await q.crearAlumno({ nombre: 'Uxía', apellidos: 'Ferreiro', neae: 0 }, g)
    await q.crearAlumno({ nombre: 'Brais', apellidos: 'Outeiro', neae: conNeae ? 1 : 0 }, g)
    localStorage.setItem('miclase_clase_activa', String(g))
  }, conNeae)
  await p.goto(BASE + '/alumnos', { waitUntil: 'networkidle' })
  await p.getByText('Outeiro').first().waitFor()
  return { ctx, p }
}

const eleccion = p => p.evaluate(() => JSON.parse(localStorage.getItem('miclase.sensibles') || 'null'))

try {
  console.log('\n1. Aparato nuevo: los dos apagados')
  {
    const { ctx, p } = await aparato({ conNeae: false })
    ok(JSON.stringify(await eleccion(p)) === JSON.stringify({ neae: false, evidencias: false }), 'la elección queda escrita: apagados')
    ok(await p.getByRole('button', { name: /Evidencias de/ }).count() === 0, 'no se ofrece la galería de evidencias')
    await p.getByRole('button', { name: /Editar Brais Outeiro/ }).click()
    ok(await p.getByText(/Necesidades específicas de apoyo educativo/).count() === 0, 'la ficha no ofrece marcar NEAE')
    await p.getByRole('button', { name: /Cancelar|Cerrar/ }).first().click()

    console.log('\n2. Encenderlos desde la tarjeta')
    await p.locator('[data-datos-sensibles-toggle]').click()
    await p.locator('[data-sensible="neae"]').check()
    await p.locator('[data-sensible="evidencias"]').check()
    ok(JSON.stringify(await eleccion(p)) === JSON.stringify({ neae: true, evidencias: true }), 'la elección se guarda')
    ok(await p.getByRole('button', { name: /Evidencias de/ }).count() === 2, 'la galería vuelve en cada alumno')
    await p.getByRole('button', { name: /Editar Brais Outeiro/ }).click()
    ok(await p.getByText(/Necesidades específicas de apoyo educativo/).count() === 1, 'y la ficha ofrece marcar NEAE')
    await ctx.close()
  }

  console.log('\n3. Aparato que ya tenía alumnado con NEAE: lo conserva')
  {
    const { ctx, p } = await aparato({ conNeae: true })
    // La elección se resuelve al arrancar; la clase se creó con la app ya abierta
    await p.evaluate(() => localStorage.removeItem('miclase.sensibles'))
    await p.reload({ waitUntil: 'networkidle' })
    await p.getByText('Outeiro').first().waitFor()
    await p.waitForFunction(() => localStorage.getItem('miclase.sensibles'))
    const e = await eleccion(p)
    ok(e?.neae === true && e?.evidencias === false, 'NEAE encendido (había datos), evidencias apagadas (no había)', JSON.stringify(e))
    ok(await p.getByText('NEAE', { exact: true }).count() === 1, 'el sello NEAE sigue a la vista')

    console.log('\n4. Apagar no borra: esconde')
    await p.locator('[data-datos-sensibles-toggle]').click()
    await p.locator('[data-sensible="neae"]').uncheck()
    ok(await p.getByText('NEAE', { exact: true }).count() === 0, 'apagado, el sello desaparece')
    await p.locator('[data-sensible-guardados="neae"]').waitFor()
    ok(true, 'la tarjeta dice que hay uno guardado que no se muestra')
    // Editar y guardar con el indicador escondido no lo pone a cero
    await p.getByRole('button', { name: /Editar Brais Outeiro/ }).click()
    await p.getByRole('button', { name: /^Guardar/ }).click()
    await p.waitForTimeout(400)
    const neae = await p.evaluate(async () => {
      const q = await import('/src/db/localDb.ts')
      return (await q.db.alumnos.toArray()).find(a => a.apellidos === 'Outeiro')?.neae
    })
    ok(neae === 1, 'guardar la ficha con NEAE apagado conserva el indicador', String(neae))
    await ctx.close()
  }
} catch (e) {
  console.error(e)
  fallos++
} finally {
  await navegador.close()
}

if (erroresConsola.length) { console.log(erroresConsola.join('\n')); fallos++ }
console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ datos sensibles bien')
process.exit(fallos ? 1 : 0)
