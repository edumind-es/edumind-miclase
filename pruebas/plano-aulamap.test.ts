/**
 * Plano de clase con AulaMap: la traducción entre el grupo de MiClase y la
 * clase de AulaMap (frontend/src/db/planoAulaMap.ts). Lo que importa: que el
 * plano de cuadrícula que ya había no se pierda, que lo guardado no lleve
 * nombres, y que el alumnado lo mande siempre MiClase.
 */
import {
  claseParaAulaMap, claseParaGuardar, claseDesdeCuadricula, alumnoDeIdAulaMap, resumenPlano,
  leerPlanoGuardado,
} from '../frontend/src/db/planoAulaMap'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const alumnos = [
  { id: 11, nombre: 'Ferreiro, Uxía' },
  { id: 12, nombre: 'Outeiro, Brais' },
  { id: 13, nombre: 'Vidal, Antía' },
]

console.log('\n1. Ids de alumnado')
ok(alumnoDeIdAulaMap('a12') === 12, 'a12 es el alumno 12')
ok(alumnoDeIdAulaMap('k3x9') === null && alumnoDeIdAulaMap(null) === null && alumnoDeIdAulaMap('a0') === null,
  'lo que no es de MiClase no es nadie')

console.log('\n2. Sin plano de AulaMap: se estrena con la cuadrícula de siempre')
{
  const c = claseParaAulaMap({
    grupoId: 7, nombreGrupo: '6ºA', guardado: null, alumnos,
    filas: 2, cols: 3,
    asientos: [{ alumno_id: 11, fila: 0, col: 0 }, { alumno_id: 12, fila: 1, col: 2 }, { alumno_id: 99, fila: 1, col: 1 }],
  })
  const mesas = c.objects.filter(o => o.type === 'desk1')
  ok(mesas.length === 6, 'una mesa individual por casilla', String(mesas.length))
  ok(mesas.find(m => m.id === 'mesa-0-0')?.seats?.[0] === 'a11', 'Uxía sigue en la primera mesa')
  ok(mesas.find(m => m.id === 'mesa-1-2')?.seats?.[0] === 'a12', 'Brais, en la última de la segunda fila')
  ok(mesas.find(m => m.id === 'mesa-1-1')?.seats?.[0] === null, 'quien ya no está en el grupo no ocupa mesa')
  ok(c.students.length === 3 && c.students[0].name === 'Ferreiro, Uxía', 'el alumnado y sus nombres vienen de MiClase')
  ok(c.objects.some(o => o.type === 'screen') && c.objects.some(o => o.type === 'teacher'), 'con pantalla y mesa del docente')
  // Mesas dentro del aula
  ok(mesas.every(m => m.x > 0 && m.x < c.room.w && m.y > 0 && m.y < c.room.h), 'todas las mesas caben en el aula')
}

console.log('\n3. Lo guardado no lleva nombres y vuelve igual')
{
  const c = claseDesdeCuadricula(7, '6ºA', 1, 2, [{ alumno_id: 11, fila: 0, col: 1 }])
  c.students = [
    { id: 'a11', name: 'Ferreiro, Uxía', team: 2, type: 'A' },
    { id: 'zz', name: 'Pegado a mano' }, // alumno ajeno a MiClase
  ]
  c.objects[c.objects.length - 2].seats = ['zz']
  c.incompatible = [['a11', 'zz']]
  const json = claseParaGuardar(c)
  ok(!json.includes('Ferreiro') && !json.includes('Pegado'), 'ni un nombre en lo guardado', json.slice(0, 80))
  ok(!json.includes('"zz"'), 'el alumno ajeno no se guarda ni queda sentado')
  ok(json === claseParaGuardar(JSON.parse(JSON.stringify(c))), 'mismo plano, mismo texto (no se reescribe para nada)')

  const otra = claseParaAulaMap({
    grupoId: 7, nombreGrupo: '6ºA (renombrado)', guardado: json,
    alumnos: [{ id: 11, nombre: 'Ferreiro Lago, Uxía' }, { id: 14, nombre: 'Nova, Iria' }],
    filas: 5, cols: 6, asientos: [],
  })
  const s11 = otra.students.find(s => s.id === 'a11')
  ok(s11?.name === 'Ferreiro Lago, Uxía', 'el nombre sale del alumnado de hoy')
  ok(s11?.team === 2 && s11?.type === 'A', 'equipo y tipología se conservan')
  ok(otra.students.some(s => s.id === 'a14' && s.name === 'Nova, Iria'), 'la alumna nueva aparece en la lista')
  ok(otra.objects.filter(o => o.type === 'desk1').length === 2, 'el aula guardada manda sobre la cuadrícula')
  ok(otra.name === '6ºA (renombrado)', 'la clase se llama como el grupo')
  ok(resumenPlano(otra).sentados.join() === '11', 'Uxía sigue sentada', resumenPlano(otra).sentados.join())
}

console.log('\n4. El alumnado lo manda MiClase')
{
  const guardado = JSON.stringify({
    id: 'x', room: { w: 800, h: 700 }, nameFormat: 'full',
    objects: [
      { id: 'm1', type: 'desk2', x: 100, y: 200, w: 140, h: 50, rot: 0, cols: 2, rows: 1, seats: ['a11', 'a12'] },
      { id: 'm2', type: 'desk1', x: 300, y: 200, w: 70, h: 50, rot: 0, cols: 1, rows: 1, seats: ['a11'] },
    ],
    students: [{ id: 'a11' }, { id: 'a12' }],
    incompatible: [['a11', 'a12'], ['a11', 'a13']],
  })
  const c = claseParaAulaMap({
    grupoId: 7, nombreGrupo: '6ºA', guardado,
    alumnos: [{ id: 11, nombre: 'Ferreiro, Uxía' }, { id: 13, nombre: 'Vidal, Antía' }],
    filas: 5, cols: 6, asientos: [],
  })
  const m1 = c.objects.find(o => o.id === 'm1')!
  const m2 = c.objects.find(o => o.id === 'm2')!
  ok(m1.seats?.[1] === null, 'quien se dio de baja se levanta de su mesa')
  ok(m1.seats?.[0] === 'a11' && m2.seats?.[0] === null, 'nadie ocupa dos puestos')
  ok(JSON.stringify(c.incompatible) === JSON.stringify([['a11', 'a13']]), 'los incompatibles se limpian', JSON.stringify(c.incompatible))
  ok(c.nameFormat === 'full', 'lo demás de AulaMap viaja tal cual')
  const r = resumenPlano(c)
  ok(r.puestos === 3 && r.sentados.length === 1, 'resumen: 3 puestos, 1 sentada')
}

console.log('\n5. Un plano roto no tumba la pantalla')
ok(leerPlanoGuardado('{no es json') === null && leerPlanoGuardado('{"a":1}') === null, 'se ignora y se estrena uno')
{
  const c = claseParaAulaMap({ grupoId: 1, nombreGrupo: 'X', guardado: '{roto', alumnos, filas: 1, cols: 1, asientos: [] })
  ok(c.objects.filter(o => o.type === 'desk1').length === 1, 'cae a la cuadrícula')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos ? 1 : 0)
