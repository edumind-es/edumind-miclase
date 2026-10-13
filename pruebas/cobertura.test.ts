/** Agrupar por competencia y medir lo que queda sin evaluar: números que la matriz y el panel comparten. */
import { agruparPorCompetencia, calcularCobertura, mediaDe } from '../frontend/src/db/cobertura'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

console.log('\n1. Agrupar por competencia')
{
  const g = agruparPorCompetencia(['CE1.1', 'CE1.2', 'CE2.1', 'CE2.3', 'CE3.1', 'X'].map(id => ({ id })))
  ok(g.map(x => x.etiqueta).join(',') === 'CE1,CE2,CE3,Otros', 'CE1, CE2, CE3 y «Otros» para lo que no sigue la numeración', g.map(x => x.etiqueta).join(','))
  ok(g[1].criterios.length === 2 && g[1].criterios[1].id === 'CE2.3', 'cada grupo conserva sus criterios en orden')
}

console.log('\n2. Media de un grupo')
ok(mediaDe([7.5, null, 5]).media === 6.3 && mediaDe([7.5, null, 5]).conNota === 2, 'media de lo que hay y cuántas había')
ok(mediaDe([null, undefined]).media === null, 'sin nada, null')

console.log('\n3. Cobertura')
{
  const notas: Record<string, number> = { '1:CE1.1': 7, '2:CE1.1': 5, '1:CE1.2': 8 }
  const c = calcularCobertura([1, 2, 3], ['CE1.1', 'CE1.2', 'CE2.1'], (a, cr) => notas[`${a}:${cr}`] ?? null)
  ok(c.evaluables === 3 && c.conAlgunaNota === 2, 'dos de tres criterios tienen alguna nota')
  ok(c.sinNota.join() === 'CE2.1', 'CE2.1 no tiene ninguna')
  ok(c.aMedias.length === 2 && c.aMedias[0].id === 'CE1.1' && c.aMedias[0].conNota === 2, 'CE1.1 está a medias con dos alumnos')
  ok(c.alumnosSinNota.join() === '3', 'el tercer alumno no tiene nada')
  ok(c.casillas.conNota === 3 && c.casillas.total === 9, 'tres casillas de nueve')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos ? 1 : 0)
