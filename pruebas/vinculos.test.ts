/**
 * Criterios vinculados: quién va con quién.
 *
 * La nota se guarda por alumno, instrumento, criterio y trimestre —no por
 * unidad—, así que el vínculo tiene que cerrarse entre unidades: si no, el
 * mismo criterio replicaría a sitios distintos según desde dónde se califique.
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

console.log('\n3. Entre unidades')
{
  const filas = [f(1, 'A'), f(1, 'B'), f(2, 'B'), f(2, 'C'), f(3, 'X'), f(3, 'Y')]
  ok(criteriosVinculados(filas, 'A').join() === 'B,C', 'A-B en una y B-C en otra: los tres van juntos', criteriosVinculados(filas, 'A').join())
  ok(criteriosVinculados(filas, 'C').join() === 'A,B', 'desde cualquiera de ellos')
  ok(criteriosVinculados(filas, 'X').join() === 'Y', 'un grupo aparte no se mezcla')
  const separadas = [f(1, 'A'), f(2, 'A'), f(2, 'B')]
  ok(criteriosVinculados(separadas, 'A').join() === 'B', 'marcado suelto en una unidad, agrupado en otra')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
