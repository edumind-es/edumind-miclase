/**
 * El mínimo de consecución de la programación (lo trae PROENS) en el informe
 * individual, bajo la descripción de cada criterio.
 *
 * Lo que se vigila: que salga; que un criterio con mínimos distintos en dos
 * unidades los enseñe con el nombre de cada una; que el mismo texto no se
 * repita; que el informe de un trimestre lleve solo los de ese trimestre; y
 * que un criterio sin mínimo no pinte nada.
 */
import { writeFileSync } from 'node:fs'
import { informeIndividual } from '../frontend/src/informes/documentos'
import type { DatosGrupo } from '../frontend/src/informes/datos'
import { pesosVinculoDeUnidades } from '../frontend/src/db/calculo'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const alumno = { id: 1, grupo_id: 1, nombre: 'Ana', apellidos: 'Abad Ríos' }
const instrumento = { id: 10, asignatura_id: 5, nombre: 'Proba escrita', tipo: 'prueba-escrita', peso: 100, orden: 0 }
const nota = (criterio_id: string, trimestre: number, valor: number, unidad_id: number) => ({
  id: 100 + unidad_id * 10 + trimestre + criterio_id.length, alumno_id: 1, instrumento_id: 10,
  criterio_id, trimestre, unidad_id, valor, observacion: '', fecha: '2026-11-02', deleted_at: null,
})
const datos = {
  grupo: { id: 1, nombre: '6.º A', etapa: 'primaria', curso: '6', comunidad: 'Galicia', curso_escolar: '2026-2027' },
  alumnos: [alumno],
  areas: [{
    asig: { id: 5, grupo_id: 1, nombre: 'ciencias-sociales', nombre_display: 'Ciencias Sociales', pesos_trimestres: '{"1":33,"2":33,"3":34}' },
    instrumentos: [instrumento],
    descripciones: new Map([
      ['CE1.1', 'Localizar información en fuentes diversas.'],
      ['CE1.2', 'Explicar el relieve y los ríos de Galicia.'],
      ['CE2.1', 'Describir la organización del territorio.'],
    ]),
    pesosCriterio: new Map(),
    pesosVinculo: pesosVinculoDeUnidades([]),
    conexiones: new Map(),
    minimos: new Map([
      ['CE1.1', [
        { unidad: 'O mundo que nos rodea', trimestre: 1, minimo: 'Localiza dous datos nun texto e nun mapa.' },
        { unidad: 'A nosa historia', trimestre: 2, minimo: 'Ordena tres feitos nunha liña do tempo.' },
      ]],
      ['CE1.2', [
        { unidad: 'O mundo que nos rodea', trimestre: 1, minimo: 'Nomea tres ríos de Galicia.' },
        { unidad: 'O relevo <de> Galicia', trimestre: 1, minimo: 'Nomea tres ríos de Galicia.' },
      ]],
    ]),
  }],
  calificaciones: [nota('CE1.1', 1, 7, 1), nota('CE1.1', 2, 6, 2), nota('CE1.2', 1, 8, 1), nota('CE2.1', 1, 5, 1)],
  asistencia: new Map(),
  trimestreAsistencia: null,
  descriptores: [],
  medidas: new Map(),
} as unknown as DatosGrupo

console.log('\n1. Informe de todo el curso')
const html = informeIndividual(datos, alumno as never, [])
const minimos = [...html.matchAll(/<span class="minimo"[^>]*>(.*?)<\/span>/g)].map(m => m[1])
ok(minimos.length === 3, 'tres líneas de mínimo: dos de CE1.1 y una de CE1.2', String(minimos.length))
ok(minimos.some(m => m.includes('Mínimo (O mundo que nos rodea):') && m.includes('Localiza dous datos')), 'CE1.1 lleva el de su primera unidad, con su nombre')
ok(minimos.some(m => m.includes('Mínimo (A nosa historia):') && m.includes('Ordena tres feitos')), 'y el de la segunda')
ok(minimos.filter(m => m.includes('Nomea tres ríos')).length === 1, 'el mismo mínimo en dos unidades sale una vez')
ok(minimos.some(m => m.includes('<b>Mínimo:</b> Nomea tres ríos')), 'y entonces va sin el nombre de la unidad')
ok(!html.includes('<de>'), 'el texto de la programación va escapado')
const filaCE21 = html.slice(html.indexOf('Describir la organización'), html.indexOf('</tr>', html.indexOf('Describir la organización')))
ok(!filaCE21.includes('class="minimo"'), 'un criterio sin mínimo no pinta nada')

console.log('\n2. Informe de un trimestre')
const t2 = informeIndividual(datos, alumno as never, [], { trimestre: 2 })
const minimosT2 = [...t2.matchAll(/<span class="minimo"[^>]*>(.*?)<\/span>/g)].map(m => m[1])
ok(minimosT2.length === 1 && minimosT2[0].includes('Ordena tres feitos'), 'solo el mínimo de la unidad de ese trimestre', minimosT2.join(' | '))
ok(minimosT2[0].includes('<b>Mínimo:</b>'), 'y al quedar uno, sin el nombre de la unidad')

console.log('\n3. Sin detalle por criterio no hay mínimos')
ok(!informeIndividual(datos, alumno as never, [], { incluirCriterios: false }).includes('class="minimo"'), 'el informe resumido no los lleva')

if (process.env.INFORME_HTML) writeFileSync(process.env.INFORME_HTML, html)
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
