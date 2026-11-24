/**
 * Equipos y agrupamientos: reglas puras (`db/equipos.ts`).
 *
 * Lo que se vigila: que un alumno no esté nunca en dos equipos del mismo
 * agrupamiento; que el reparto al azar coloque a todos, deje los equipos
 * parejos (uno de diferencia como mucho) y conserve la clave y el nombre de
 * los equipos que ya había; que normalizar no repita claves ni guarde unidad
 * sin área; que las bajas salgan de los equipos; y que para un área y unidad
 * valgan el de la unidad, el del área y los de toda la clase, en ese orden.
 */
import {
  agrupamientosPara, alcanceDeAgrupamiento, equipoDeAlumno, equipoNuevo, equiposPorTamano,
  moverAlumno, normalizarAgrupamiento, repartirAlAzar, sinBajas, sinEquipo,
} from '../frontend/src/db/equipos'
import type { Equipo } from '../frontend/src/db/localDb'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

// Azar fijo: una secuencia que se repite.
const azarFijo = () => { let i = 0; const s = [0.13, 0.71, 0.42, 0.95, 0.27, 0.6]; return () => s[i++ % s.length] }

console.log('\n1. Reparto al azar')
const clase = Array.from({ length: 23 }, (_, i) => i + 1)
const cinco = repartirAlAzar(clase, 5, [], azarFijo())
const todos = cinco.flatMap(e => e.alumnos)
ok(cinco.length === 5, 'hace los equipos pedidos')
ok(todos.length === 23 && new Set(todos).size === 23, 'coloca a todos y a nadie dos veces')
const tam = cinco.map(e => e.alumnos.length)
ok(Math.max(...tam) - Math.min(...tam) <= 1, 'los equipos quedan parejos', tam.join(' '))
ok(new Set(cinco.map(e => e.clave)).size === 5, 'cada equipo con su clave')
const previos: Equipo[] = [{ clave: 'e7', nombre: 'Lobos', alumnos: [1, 2] }, { clave: 'e9', nombre: 'Aguias', alumnos: [3] }]
const otra = repartirAlAzar(clase, 3, previos, azarFijo())
ok(otra[0].clave === 'e7' && otra[0].nombre === 'Lobos' && otra[1].nombre === 'Aguias', 'conserva clave y nombre de los que había')
ok(!['e7', 'e9'].includes(otra[2].clave), 'el equipo nuevo no repite clave', otra[2].clave)
ok(repartirAlAzar([1, 2], 9, [], azarFijo()).length === 2, 'no hace más equipos que alumnos')
ok(repartirAlAzar([], 3).length === 1, 'sin alumnado queda un equipo vacío')
ok(equiposPorTamano(23, 4) === 6 && equiposPorTamano(24, 4) === 6 && equiposPorTamano(0, 4) === 1, 'equipos según el tamaño pedido')

console.log('\n2. Mover a un alumno')
let eq: Equipo[] = [{ clave: 'e1', nombre: 'A', alumnos: [1, 2] }, { clave: 'e2', nombre: 'B', alumnos: [3] }]
eq = moverAlumno(eq, 1, 'e2')
ok(eq[0].alumnos.join() === '2' && eq[1].alumnos.join() === '3,1', 'cambia de equipo y sale del anterior')
eq = moverAlumno(eq, 3, null)
ok(equipoDeAlumno({ equipos: eq }, 3) === null && sinEquipo({ equipos: eq }, [1, 2, 3, 4]).join() === '3,4', 'sin equipo: sale de todos')
ok(equipoDeAlumno({ equipos: eq }, 1)?.clave === 'e2', 'se sabe el equipo de cada uno')
ok(sinBajas(eq, [2])[1].alumnos.length === 0 && sinBajas(eq, [2])[0].alumnos.join() === '2', 'las bajas salen de los equipos')
ok(equipoNuevo(eq).nombre === 'Equipo 3' && equipoNuevo(eq).clave === 'e3', 'el equipo nuevo toma el nombre que le toca')

console.log('\n3. Lo que se guarda')
const n = normalizarAgrupamiento({
  grupo_id: 1, nombre: '  ', asignatura_id: null, unidad_id: 8,
  equipos: [{ clave: 'e1', nombre: ' Lobos ', alumnos: [1, 2, 2] }, { clave: 'e1', nombre: '', alumnos: [2, 3] }],
})
ok(n.nombre === 'Equipos' && n.unidad_id === null, 'nombre por defecto y sin unidad si no hay área')
ok(n.equipos[0].nombre === 'Lobos' && n.equipos[1].nombre === 'Equipo 2', 'nombres recortados o por orden')
ok(n.equipos[0].clave !== n.equipos[1].clave, 'no repite claves')
ok(n.equipos[0].alumnos.join() === '1,2' && n.equipos[1].alumnos.join() === '3', 'un alumno, un solo equipo: el primero que lo nombra')
ok(normalizarAgrupamiento({ grupo_id: 1, nombre: 'P', asignatura_id: 4, unidad_id: 8, equipos: [] }).unidad_id === 8, 'con área, la unidad se guarda')

console.log('\n4. Cuáles valen para un área y una unidad')
const lista = [
  { nombre: 'clase', asignatura_id: null, unidad_id: null },
  { nombre: 'sociales', asignatura_id: 4, unidad_id: null },
  { nombre: 'sociales-ud2', asignatura_id: 4, unidad_id: 8 },
  { nombre: 'mates', asignatura_id: 5, unidad_id: null },
  { nombre: 'sociales-ud3', asignatura_id: 4, unidad_id: 9 },
]
ok(agrupamientosPara(lista, 4, 8).map(a => a.nombre).join() === 'sociales-ud2,sociales,clase', 'unidad, área y clase, en ese orden')
ok(agrupamientosPara(lista, 4, null).map(a => a.nombre).join() === 'sociales,clase', 'en «Todo el curso» no entran los de una unidad')
ok(agrupamientosPara(lista, 6, 1).map(a => a.nombre).join() === 'clase', 'otra área: solo los de la clase')
ok(agrupamientosPara(lista).map(a => a.nombre).join() === 'clase', 'sin área: solo los de la clase')
const areas = [{ id: 4, nombre_display: 'Ciencias Sociais' }]
const uds = [{ id: 8, nombre: 'UD2 A nosa saúde' }]
ok(alcanceDeAgrupamiento(lista[0], areas, uds) === 'Todas las áreas', 'alcance: toda la clase')
ok(alcanceDeAgrupamiento(lista[2], areas, uds) === 'Ciencias Sociais · UD2 A nosa saúde', 'alcance: área y unidad')

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
