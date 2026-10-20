/**
 * Bloques de lo que una familia guarda a su nombre: unidad y día de anotación.
 *
 * Lo que se comprueba: la fecha que manda en cada tipo de dato (nota: `fecha`;
 * diario: `fecha`; examen: `created_at`), el día local (no el UTC), que lo
 * borrado y las notas sin valor no cuentan, el orden (unidad, luego día) y que
 * `enBloque` deja pasar exactamente lo del bloque y todo si no hay filtro.
 */
import {
  agruparEnBloques, diaDe, enBloque, etiquetaDia, etiquetaHora, describeBloque,
} from '../frontend/src/db/bloquesFamilia'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

// Sellos locales: new Date(año, mes, día, hora) y a ISO, así el día local es el escrito.
const local = (a: number, m: number, d: number, h = 12, mi = 0) => new Date(a, m - 1, d, h, mi).toISOString()

console.log('\n1. El día es el local del aparato')
{
  const madrugada = local(2026, 10, 15, 0, 30)
  ok(diaDe(madrugada) === '2026-10-15', 'las 00:30 del 15 son del 15, aunque en UTC sea la víspera', String(diaDe(madrugada)))
  ok(diaDe(null) === null && diaDe('') === null && diaDe('ayer') === null, 'sin sello o sin sentido → null')
}

console.log('\n2. Agrupar por unidad y día, con la fecha que toca a cada dato')
{
  const d15 = local(2026, 10, 15, 17, 32), d16 = local(2026, 10, 16, 9, 5), d14 = local(2026, 10, 14, 11, 0)
  const cals = [
    { criterio_id: 'CE1.2', unidad_id: 7, valor: 6, fecha: d15, updated_at: d16 },        // manda `fecha`, no updated_at
    { criterio_id: 'CE1.1', unidad_id: 7, valor: 8, fecha: d15, updated_at: d15 },
    { criterio_id: 'CE2.1', unidad_id: 7, valor: null, fecha: d15, updated_at: d15 },      // sin valor: no cuenta
    { criterio_id: 'CE1.1', unidad_id: 7, valor: 5, fecha: d16, updated_at: d16, deleted_at: d16 }, // borrada
    { criterio_id: 'CE3.1', unidad_id: 9, valor: 7, fecha: null, updated_at: d16 },        // sin fecha: updated_at
  ]
  const regs = [
    { unidad_id: 7, fecha: d16, updated_at: d16, criterios_json: '["CE1.3"]' },
    { unidad_id: null, fecha: d14, updated_at: d14, criterios_json: 'roto' },
  ]
  const rubs = [
    { unidad_id: 7, tipo: 'prueba', created_at: d14, updated_at: d16 },                   // examen: manda created_at
    { unidad_id: null, tipo: null, created_at: d14, updated_at: d14 },                    // la rúbrica de la familia
  ]
  const b = agruparEnBloques(cals, regs, rubs)
  ok(b.length === 5, 'cinco bloques: UD7×(14,15,16), UD9×16 y sin unidad×14', JSON.stringify(b.map(x => [x.unidad_id, x.dia])))
  ok(b[0].unidad_id === 7 && b[0].dia === '2026-10-14' && b[0].examenes === 1 && b[0].calificaciones === 0, 'UD7 · 14 oct: solo el examen, fechado por created_at')
  ok(b[1].dia === '2026-10-15' && b[1].calificaciones === 2 && b[1].criterios.join(',') === 'CE1.1,CE1.2', 'UD7 · 15 oct: dos notas con valor, criterios ordenados')
  ok(b[1].ultima === d15, 'la hora del bloque es el sello más reciente de lo que contiene (la fecha de la nota, no su updated_at)')
  ok(b[2].dia === '2026-10-16' && b[2].diario === 1 && b[2].criterios.join() === 'CE1.3', 'UD7 · 16 oct: el registro del diario con sus criterios')
  ok(b[3].unidad_id === 9 && b[3].dia === '2026-10-16' && b[3].calificaciones === 1, 'UD9 · 16 oct: la nota sin fecha cae por updated_at')
  ok(b[4].unidad_id === null && b[4].rubricas === 1 && b[4].diario === 1 && b[4].criterios.length === 0, 'sin unidad al final: la rúbrica y el registro con criterios_json roto')
  ok(agruparEnBloques([], [], []).length === 0, 'sin nada, sin bloques')
}

console.log('\n3. enBloque deja pasar lo justo')
{
  ok(enBloque(undefined, 7, '2026-10-15') && enBloque(undefined, null, null), 'sin filtro pasa todo')
  const f = { unidad_id: 7, dia: '2026-10-15' }
  ok(enBloque(f, 7, '2026-10-15'), 'misma unidad y día')
  ok(!enBloque(f, 7, '2026-10-16') && !enBloque(f, 9, '2026-10-15'), 'otro día u otra unidad, no')
  ok(enBloque({ unidad_id: null, dia: null }, undefined, null), 'sin unidad: undefined y null son lo mismo')
}

console.log('\n4. Etiquetas')
{
  const hoy = new Date(2026, 9, 20)
  ok(etiquetaDia('2026-10-15', hoy) === '15 oct', 'este año, sin año', etiquetaDia('2026-10-15', hoy))
  ok(etiquetaDia('2025-06-03', hoy) === '3 jun 2025', 'otro año, con año', etiquetaDia('2025-06-03', hoy))
  ok(etiquetaDia(null) === 'sin fecha', 'sin día')
  ok(etiquetaHora(local(2026, 10, 15, 17, 32)) === '17:32' && etiquetaHora(null) === '', 'hora local hh:mm')
  ok(describeBloque({ calificaciones: 1, diario: 0, examenes: 1, rubricas: 1 }) === '1 examen, 1 nota, su rúbrica', 'descripción en el orden de siempre')
  ok(describeBloque({ calificaciones: 2, diario: 3, examenes: 0, rubricas: 0 }) === '2 notas, 3 registros del diario', 'plurales')
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
