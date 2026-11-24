/**
 * Sigla y color de cada área: que las áreas corrientes salgan con su sigla de
 * siempre en castellano y en galego, que dos áreas no compartan sigla, que el
 * color se reparta por orden y que los diez tonos se lean con la sigla en blanco.
 */
import { PALETA_AREAS, identidadDeAreas, siglaDeNombre, tenir } from '../frontend/src/db/areas'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const lum = (h: string) => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2] }
const contraste = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

console.log('\n── Siglas ──')
const casos: [string, string][] = [
  ['Matemáticas', 'MAT'], ['Lingua Galega e Literatura', 'LG'], ['Lengua Castellana y Literatura', 'LC'], ['Lingua Castelá e Literatura', 'LC'],
  ['Ciencias da Natureza', 'CN'], ['Ciencias Sociales', 'CS'], ['Ciencias Sociais', 'CS'], ['Lingua Estranxeira: Inglés', 'ING'],
  ['Educación Física', 'EF'], ['Educación Plástica e Visual', 'EPV'], ['Música e Danza', 'MUS'], ['Educación en Valores Cívicos e Éticos', 'VAL'],
]
const mal = casos.filter(([n, s]) => siglaDeNombre(n) !== s)
ok(mal.length === 0, `las ${casos.length} áreas corrientes, con su sigla de siempre`, mal.map(([n]) => `${n} → ${siglaDeNombre(n)}`).join(' · '))
ok(siglaDeNombre('Robótica') === 'ROB' && siglaDeNombre('Proyecto de centro') === 'PC', 'un área que no se conoce saca sus iniciales', `${siglaDeNombre('Robótica')} ${siglaDeNombre('Proyecto de centro')}`)
ok(siglaDeNombre('') === '?', 'sin nombre no revienta')

console.log('\n── Identidad dentro de la clase ──')
const clase = [{ id: 1, nombre_display: 'Matemáticas' }, { id: 2, nombre_display: 'Ciencias Sociales' }, { id: 3, nombre_display: 'Ciencias Sociais' }, { id: 4, nombre_display: 'Música', color: '#123456', sigla: 'mu' }]
const id = identidadDeAreas(clase)
ok(id.get(1)!.color === PALETA_AREAS[0] && id.get(2)!.color === PALETA_AREAS[1], 'sin color propio, el que toca por orden')
ok(id.get(2)!.sigla === 'CS' && id.get(3)!.sigla === 'CS2', 'dos áreas no comparten sigla', `${id.get(2)!.sigla} y ${id.get(3)!.sigla}`)
ok(id.get(4)!.color === '#123456' && id.get(4)!.sigla === 'MU', 'el color y la sigla propios mandan')
ok(identidadDeAreas([{ id: 9, nombre_display: 'Inglés', color: 'rojo' }]).get(9)!.color === PALETA_AREAS[0], 'un color que no es un color se ignora')
const once = identidadDeAreas(Array.from({ length: 11 }, (_, i) => ({ id: i + 1, nombre_display: `Área ${i}` })))
ok(once.get(11)!.color === PALETA_AREAS[0], 'con más de diez áreas, la paleta da la vuelta')

console.log('\n── Los diez tonos se leen ──')
const flojos = PALETA_AREAS.filter(c => contraste(c, '#ffffff') < 4.5 || contraste(c, '#ece9e1') < 3)
ok(flojos.length === 0, '4,5:1 o más con la sigla en blanco y 3:1 o más sobre el papel', flojos.join(' '))
ok(new Set(PALETA_AREAS).size === 10, 'son diez y distintos')
ok(tenir('#000000', 0) === '#ece9e1' && contraste('#17181a', tenir(PALETA_AREAS[0])) > 12, 'el papel teñido sigue siendo papel: la tinta se lee igual')

console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
