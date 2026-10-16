/**
 * Criterios vinculados: quién va con quién.
 *
 * Desde la v7 la casilla lleva la unidad en la clave: el vínculo vive y
 * muere dentro de su unidad. Lo que se marca en una no arrastra a otra.
 */
import { criteriosVinculados } from '../frontend/src/db/vinculos'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const f = (unidad_id: number, criterio_id: string, vinculado: number | null = 1) => ({ unidad_id, criterio_id, vinculado })

console.log('\n1. Dentro de una unidad')
{
  const filas = [f(1, 'CE1.1'), f(1, 'CE1.2'), f(1, 'CE2.1', null)]
  ok(criteriosVinculados(filas, 'CE1.1').join() === 'CE1.2', 'los marcados van juntos', criteriosVinculados(filas, 'CE1.1').join())
  ok(criteriosVinculados(filas, 'CE2.1').length === 0, 'el que no está marcado va solo')
  ok(criteriosVinculados(filas, 'CE9.9').length === 0, 'un criterio que el instrumento no evalúa, también')
}

console.log('\n2. Sin vínculo')
{
  ok(criteriosVinculados([f(1, 'CE1.1', null), f(1, 'CE1.2', null)], 'CE1.1').length === 0, 'nada marcado, nada vinculado')
  ok(criteriosVinculados([f(1, 'CE1.1'), f(1, 'CE1.2', null)], 'CE1.1').length === 0,
     'un grupo de uno no vincula (se retiró el otro criterio)')
  ok(criteriosVinculados([], 'CE1.1').length === 0, 'sin programación')
}

console.log('\n3. Entre unidades: cada una lo suyo')
{
  const filas = [f(1, 'A'), f(1, 'B'), f(2, 'B'), f(2, 'C'), f(3, 'X'), f(3, 'Y')]
  ok(criteriosVinculados(filas, 'A').join() === 'B', 'A-B en una y B-C en otra: A solo va con B (no se encadena)', criteriosVinculados(filas, 'A').join())
  ok(criteriosVinculados(filas, 'B').join() === 'A,C', 'B va con A en una unidad y con C en la otra', criteriosVinculados(filas, 'B').join())
  ok(criteriosVinculados(filas, 'C').join() === 'B', 'C solo con B')
  ok(criteriosVinculados(filas, 'X').join() === 'Y', 'un grupo aparte no se mezcla')
  const separadas = [f(1, 'A'), f(2, 'A'), f(2, 'B')]
  ok(criteriosVinculados(separadas, 'A').join() === 'B', 'marcado suelto en una unidad, agrupado en otra')
  ok(criteriosVinculados(filas.filter(x => x.unidad_id === 1), 'B').join() === 'A', 'con las filas de una sola unidad, solo sus compañeros')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
