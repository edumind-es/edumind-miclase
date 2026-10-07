/**
 * Diario de evaluación: cómo varios registros se funden en una nota.
 *
 * Lo que importa aquí es el determinismo: dos aparatos con los mismos
 * registros, en cualquier orden, tienen que derivar la misma nota.
 */
import {
  agregarNiveles, criteriosDe, derivarNotas, miniTendencia,
  nivelDiarioANota, notaDeDiario, ordenarRegistros,
} from '../frontend/src/db/diario'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const cerca = (a: number | null, b: number) => a != null && Math.abs(a - b) < 0.051

let siguienteId = 1
const r = (valor: number, fecha: string, criterios: string[] = ['CE1.1'], id = siguienteId++) =>
  ({ id, valor, fecha, criterios_json: JSON.stringify(criterios), deleted_at: null as string | null })

console.log('\n1. Conversión de nivel a nota')
{
  ok(nivelDiarioANota(1) === 2.5, '1 → 2,5')
  ok(nivelDiarioANota(2) === 5, '2 → 5')
  ok(nivelDiarioANota(3) === 7.5, '3 → 7,5')
  ok(nivelDiarioANota(4) === 10, '4 → 10')
  ok(nivelDiarioANota(0) === 2.5 && nivelDiarioANota(9) === 10, 'fuera de rango se acota')
}

console.log('\n2. Agregaciones')
{
  ok(agregarNiveles([], 'media') === null, 'sin registros no hay nota')
  ok(agregarNiveles([2, 3, 3, 4], 'media') === 3, 'media')
  ok(agregarNiveles([2, 3, 3, 4], 'ultima') === 4, 'última')
  ok(cerca(agregarNiveles([1, 2, 3, 3, 4], 'tendencia'), 3.333), 'tendencia = media de los 3 últimos')
  ok(agregarNiveles([1, 4], 'tendencia') === 2.5, 'tendencia con menos de 3 usa los que hay')
  ok(agregarNiveles([1, 2, 4], 'mediana') === 2, 'mediana impar')
  ok(agregarNiveles([2, 4], 'mediana') === 3, 'mediana par = media de los centrales')
  ok(agregarNiveles([2, 4], undefined) === 3 && agregarNiveles([2, 4], null) === 3, 'sin regla ⇒ media')
}

console.log('\n3. Nota de diario')
{
  ok(cerca(notaDeDiario([r(2, '2026-10-03'), r(3, '2026-10-10'), r(3, '2026-10-17'), r(4, '2026-10-24')], 'media'), 7.5), 'media [2,3,3,4] → 7,5')
  ok(cerca(notaDeDiario([r(3, '2026-10-03'), r(4, '2026-10-10')], 'media'), 8.8), 'media [3,4] → 8,8')
  ok(cerca(notaDeDiario([r(1, '2026-10-03'), r(2, '2026-10-04'), r(3, '2026-10-05'), r(3, '2026-10-06'), r(4, '2026-10-07')], 'tendencia'), 8.3), 'tendencia → 8,3')
  ok(notaDeDiario([], 'media') === null, 'vacío → null')
}

console.log('\n4. Orden y desempate')
{
  const desordenados = [r(4, '2026-10-20'), r(1, '2026-10-01'), r(3, '2026-10-10')]
  ok(ordenarRegistros(desordenados).map(x => x.valor).join() === '1,3,4', 'ordena por fecha')
  ok(desordenados[0].valor === 4, 'no muta la entrada')
  const mismaFecha = [r(2, '2026-10-01T10:00:00Z', ['A'], 50), r(4, '2026-10-01T10:00:00Z', ['A'], 7)]
  ok(notaDeDiario(mismaFecha, 'ultima') === 5, 'misma fecha: «última» es la de id mayor', String(notaDeDiario(mismaFecha, 'ultima')))
}

console.log('\n5. Reparto por criterios')
{
  const regs = [r(4, '2026-10-01', ['CE1.1', 'CE1.2']), r(2, '2026-10-08', ['CE1.1'])]
  const notas = derivarNotas(regs, 'media')
  ok(notas.get('CE1.1')?.valor === 7.5 && notas.get('CE1.1')?.n === 2, 'un registro con dos criterios puntúa en los dos; CE1.1 media de 2')
  ok(notas.get('CE1.2')?.valor === 10 && notas.get('CE1.2')?.n === 1, 'el subconjunto solo puntúa en el suyo')
  ok(notas.get('CE1.1')?.niveles.join() === '4,2', 'niveles en orden cronológico')
  ok(derivarNotas([r(3, '2026-10-01', ['X']), r(4, '2026-10-02', ['Y'])], 'media').get('X')?.valor === 7.5,
     'un criterio que solo nombra un registro antiguo sigue con nota')
  const corrupto = { id: 99, valor: 3, fecha: '2026-10-01', criterios_json: '{no es json', deleted_at: null }
  ok(criteriosDe(corrupto).length === 0, 'JSON corrupto → ningún criterio')
  ok(derivarNotas([corrupto], 'media').size === 0, 'y no revienta')
  const borrado = { ...r(1, '2026-10-09', ['CE1.1']), deleted_at: '2026-10-10' }
  ok(derivarNotas([...regs, borrado], 'media').get('CE1.1')?.n === 2, 'un registro borrado no cuenta')
}

console.log('\n6. Determinismo')
{
  const regs = [r(1, '2026-10-01', ['A', 'B']), r(3, '2026-10-02', ['A']), r(4, '2026-10-03', ['B']), r(2, '2026-10-04', ['A', 'B'])]
  const a = derivarNotas(regs, 'tendencia')
  const b = derivarNotas([...regs].reverse(), 'tendencia')
  const c = derivarNotas([regs[2], regs[0], regs[3], regs[1]], 'tendencia')
  const firma = (m: Map<string, { valor: number; niveles: number[] }>) =>
    [...m.entries()].sort().map(([k, v]) => `${k}:${v.valor}:${v.niveles.join('')}`).join('|')
  ok(firma(a) === firma(b) && firma(a) === firma(c), 'barajar la entrada no cambia nada', firma(a))
}

console.log('\n7. Mini-tendencia')
{
  ok(miniTendencia([1, 2, 3, 3, 4]) === '2·3·3·4', 'enseña los 4 últimos')
  ok(miniTendencia([3]) === '3', 'uno solo')
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
