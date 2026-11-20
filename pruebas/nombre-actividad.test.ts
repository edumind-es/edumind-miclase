/**
 * El nombre de una actividad, unidad a unidad.
 *
 * Lo que se comprueba: que renombrar dentro de una unidad no toca el nombre
 * general ni el de otras unidades, que sin unidad se lee siempre el general,
 * que volver al nombre general quita el propio y que renombrar «en todas»
 * quita los propios de todas.
 */
import { nombreEnUnidad, tieneNombrePropio, alRenombrar } from '../frontend/src/db/nombreActividad'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

console.log('\n1. Leer el nombre')
{
  const ins = { nombre: 'Billete de salida', nombres_unidad: { '12': 'Billete: fracciones', '13': '   ' } }
  ok(nombreEnUnidad(ins, 12) === 'Billete: fracciones', 'en su unidad, el propio')
  ok(nombreEnUnidad(ins, 14) === 'Billete de salida', 'en otra unidad, el general')
  ok(nombreEnUnidad(ins, 13) === 'Billete de salida', 'un nombre propio en blanco no cuenta')
  ok(nombreEnUnidad(ins, null) === 'Billete de salida' && nombreEnUnidad(ins, 0) === 'Billete de salida', 'sin unidad («Todo el curso»), el general')
  ok(nombreEnUnidad({ nombre: 'Examen' }, 12) === 'Examen', 'un instrumento de antes, sin el campo, se lee igual')
  ok(tieneNombrePropio(ins, 12) && !tieneNombrePropio(ins, 14) && !tieneNombrePropio(ins, null), 'solo tiene nombre propio donde lo tiene')
  ok(!tieneNombrePropio({ nombre: 'Examen', nombres_unidad: { '12': 'Examen' } }, 12), 'el mismo nombre que el general no es propio')
}

console.log('\n2. Renombrar dentro de una unidad')
{
  const ins = { nombre: 'Billete de salida', nombres_unidad: null }
  const c = alRenombrar(ins, '  Billete: fracciones ', 12)!
  ok(c.nombre === 'Billete de salida', 'el nombre general no cambia')
  ok(JSON.stringify(c.nombres_unidad) === '{"12":"Billete: fracciones"}', 'la unidad guarda el suyo, sin espacios de sobra', JSON.stringify(c.nombres_unidad))
  const d = alRenombrar({ ...ins, ...c }, 'Billete: decimales', 13)!
  ok(d.nombres_unidad?.['12'] === 'Billete: fracciones' && d.nombres_unidad?.['13'] === 'Billete: decimales', 'otra unidad añade el suyo sin tocar el primero')
  const e = alRenombrar({ ...ins, ...d }, 'Billete de salida', 12)!
  ok(e.nombres_unidad?.['12'] === undefined && e.nombres_unidad?.['13'] === 'Billete: decimales', 'volver al general quita el propio de esa unidad y deja el de la otra')
  const f = alRenombrar({ ...ins, ...e }, 'Billete de salida', 13)!
  ok(f.nombres_unidad === null, 'sin ningún nombre propio, el campo queda en null')
  ok(alRenombrar(ins, '   ', 12) === null, 'un nombre vacío no se guarda')
}

console.log('\n3. Renombrar en todas las unidades')
{
  const ins = { nombre: 'Billete de salida', nombres_unidad: { '12': 'Billete: fracciones', '13': 'Billete: decimales' } }
  const c = alRenombrar(ins, 'Billete', null)!
  ok(c.nombre === 'Billete' && c.nombres_unidad === null, 'cambia el general y quita los propios')
  ok(nombreEnUnidad({ ...ins, ...c }, 12) === 'Billete' && nombreEnUnidad({ ...ins, ...c }, 13) === 'Billete', 'y todas las unidades lo leen')
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
