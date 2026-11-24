/**
 * Pestañas que no se cortan: cuáles pasan a «Más» según el hueco que haya.
 */
import { pestanasQueNoCaben } from '../frontend/src/utils/reparto'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const A = [100, 100, 100, 100, 100], MAS = 100
ok(pestanasQueNoCaben(A, 500, 0, MAS).length === 0, 'si caben todas, no se esconde ninguna (ni sale «Más»)')
ok(pestanasQueNoCaben(A, 499, 0, MAS).join() === '3,4', 'si falta un píxel, «Más» ocupa su sitio y salen las últimas', pestanasQueNoCaben(A, 499, 0, MAS).join())
ok(pestanasQueNoCaben(A, 320, 4, MAS).join() === '1,2,3', 'la elegida se queda a la vista aunque sea la última', pestanasQueNoCaben(A, 320, 4, MAS).join())
ok(pestanasQueNoCaben([60, 300, 60, 60], 400, 0, MAS).join() === '1,2,3', 'una vez que una no cabe, las siguientes tampoco entran: no se desordenan', pestanasQueNoCaben([60, 300, 60, 60], 400, 0, MAS).join())
ok(pestanasQueNoCaben(A, 150, 2, MAS).join() === '0,1,3,4', 'en un hueco mínimo queda solo la elegida y «Más»')
ok(pestanasQueNoCaben([], 100, -1, MAS).length === 0, 'sin pestañas no revienta')

console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
