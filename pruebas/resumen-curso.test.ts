/**
 * «Todo el curso» por familia: las familias del área con sus hijos dentro,
 * unidas de los tres trimestres, y la media del alumno con cada una. Puro:
 * tres matrices de mentira y ningún navegador.
 */
import { familiasDelCurso, mediaEnCriterios, criteriosDelCurso } from '../frontend/src/db/resumenCurso'
import type { MatrizEvaluacion, CeldaInstrumento } from '../frontend/src/db/queries'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const celda = (o: Partial<CeldaInstrumento> & { instrumento_id: number; nombre: string }): CeldaInstrumento => ({
  tipo: 'otro', peso: 50, tiene_rubrica: false, tiene_prueba: false, vinculados: [], agregacion: 'media',
  familia_id: null, familia_nombre: null, familia_peso: o.peso ?? 50, pct_familia: null, color: '#000', ...o,
})
// Familias: 10 «Proba escrita» (80 %) y 20 «Táboa» (20 %) con los hijos 21 Speaking y 22 Cuaderno.
const instrumentos = [
  { id: 10, nombre: 'Proba escrita', peso: 80, orden: 0, familia_id: null },
  { id: 20, nombre: 'Táboa', peso: 20, orden: 1, familia_id: null },
  { id: 21, nombre: 'Speaking', peso: 1, orden: 0, familia_id: 20 },
  { id: 22, nombre: 'Cuaderno', peso: 1, orden: 1, familia_id: 20 },
] as unknown as MatrizEvaluacion['instrumentos']
const proba = celda({ instrumento_id: 10, nombre: 'Proba escrita', peso: 80, familia_peso: 80, color: '#111' })
const speaking = celda({ instrumento_id: 21, nombre: 'Speaking', tipo: 'oral', familia_id: 20, familia_nombre: 'Táboa', familia_peso: 20, pct_familia: 50, color: '#222' })
const cuaderno = celda({ instrumento_id: 22, nombre: 'Cuaderno', tipo: 'portfolio', familia_id: 20, familia_nombre: 'Táboa', familia_peso: 20, pct_familia: 50, color: '#333' })

const matriz = (porCriterio: [string, CeldaInstrumento[]][], calificaciones: Record<string, number>): MatrizEvaluacion => ({
  instrumentos, porCriterio: new Map(porCriterio),
  calificaciones: Object.fromEntries(Object.entries(calificaciones).map(([k, v]) => [k, { valor: v } as never])),
} as unknown as MatrizEvaluacion)

const criterios = [{ id: 'CE1.1', descripcion: '' }, { id: 'CE1.2', descripcion: '' }, { id: 'CE2.1', descripcion: '' }]
const porTrimestre = {
  // 1T: la proba evalúa CE1.1 y CE1.2; speaking, CE1.1; cuaderno, CE2.1.
  1: matriz([['CE1.1', [proba, speaking]], ['CE1.2', [proba]], ['CE2.1', [cuaderno]]],
    { '1:CE1.1:10:1': 8, '1:CE1.2:10:1': 6, '1:CE1.1:21:1': 5, '1:CE1.1:20:1': 5, '1:CE2.1:22:1': 7.5, '1:CE2.1:20:1': 7.5 }),
  // 2T: solo el cuaderno, en CE1.2 (la táboa sigue siendo la familia).
  2: matriz([['CE1.2', [cuaderno]]], { '1:CE1.2:22:2': 10, '1:CE1.2:20:2': 10 }),
  3: matriz([], {}),
}

console.log('\n1. Las familias del curso, con los hijos dentro')
{
  const fams = familiasDelCurso(porTrimestre, criterios)
  ok(fams.map(f => f.nombre).join(',') === 'Proba escrita,Táboa', 'dos familias, en el orden del gestor', fams.map(f => f.nombre).join(','))
  ok(fams[0].hijos.length === 0 && fams[0].peso === 80, 'la proba va sola, con su peso en el área')
  const taboa = fams[1]
  ok(taboa.hijos.map(h => h.nombre).join(',') === 'Speaking,Cuaderno', 'la táboa trae a sus dos hijos', taboa.hijos.map(h => h.nombre).join(','))
  ok(taboa.hijos[1].pct === 50, 'cada hijo con su porcentaje dentro de la familia')
  ok((taboa.criterios[1] ?? []).map(c => c.id).join() === 'CE1.1,CE2.1', 'en el 1T la táboa cubre lo de sus dos hijos', (taboa.criterios[1] ?? []).map(c => c.id).join())
  ok((taboa.criterios[2] ?? []).map(c => c.id).join() === 'CE1.2', 'en el 2T, solo lo del cuaderno')
  ok(!taboa.criterios[3], 'y nada en el 3T')
  ok(criteriosDelCurso(taboa.criterios).map(c => c.id).join() === 'CE1.1,CE2.1,CE1.2', 'todos los criterios del curso, sin repetir')
  ok(taboa.color === '#222', 'una familia sin columna propia toma el color de su primer hijo')
}

console.log('\n2. La casilla alumno × familia × trimestre')
{
  const fams = familiasDelCurso(porTrimestre, criterios)
  const taboa = fams[1]
  const r1 = mediaEnCriterios(porTrimestre[1], 1, taboa.id, taboa.criterios[1], 1)
  ok(r1.valor === 6.3 && r1.conNota === 2 && r1.total === 2, 'la táboa en el 1T es la media de sus notas virtuales (5 y 7,5 → 6,3)', JSON.stringify(r1))
  const h = mediaEnCriterios(porTrimestre[1], 1, 21, taboa.hijos[0].criterios[1], 1)
  ok(h.valor === 5 && h.total === 1, 'el hijo lee su nota real')
  const p = mediaEnCriterios(porTrimestre[1], 1, fams[0].id, fams[0].criterios[1], 1)
  ok(p.valor === 7, 'la proba, la media de sus dos criterios (8 y 6)')
  const vacio = mediaEnCriterios(porTrimestre[3], 1, taboa.id, taboa.criterios[3] ?? [], 3)
  ok(vacio.valor === null && vacio.total === 0, 'un trimestre sin criterios da casilla vacía, no cero')
  const otro = mediaEnCriterios(porTrimestre[1], 2, taboa.id, taboa.criterios[1], 1)
  ok(otro.valor === null && otro.total === 2, 'otro alumno sin notas: vacía, con los criterios que tocaría')
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
