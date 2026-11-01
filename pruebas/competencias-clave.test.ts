/**
 * Competencias clave: nivel por descriptor operativo y por competencia.
 *
 * Lo que se vigila: que cada área cuente igual en el descriptor y que dentro
 * del área mande el peso del criterio; que la competencia sea la media de sus
 * descriptores con datos y que uno sin datos no cuente como cero; que lo
 * conectado solo con la competencia (Valencia) entre como una entrada más;
 * que la conexión del Real Decreto quede marcada; que los cortes de nivel
 * sean los acordados; y que el resumen del grupo cuente por niveles.
 */
import {
  perfilCompetenciasClave, resumenDelGrupo, nivelDesarrollo, conexionesDeCriterios,
  notaEnPeriodo, type AreaCompetencial, type ConexionCriterio,
} from '../frontend/src/db/competenciasClave'
import { calcularNotaArea } from '../frontend/src/db/calculo'
import { documentoCompetenciasAlumnos, documentoCompetenciasGrupo } from '../frontend/src/informes/competenciasClave'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const cr = (criterio_id: string, t1: number | null, t2: number | null = null, t3: number | null = null, final: number | null = null) => ({
  criterio_id, trimestres: { 1: t1, 2: t2, 3: t3 }, final: final ?? t1, aportaciones: [],
})
const con = (descriptores: string[], origen: ConexionCriterio['origen'] = 'comunidad', competencias?: string[]): ConexionCriterio => ({
  descriptores,
  competencias: competencias ?? [...new Set(descriptores.map(d => d.replace(/\d$/, '')))],
  origen,
})

console.log('\n1. Cada área cuenta igual; dentro, el peso del criterio')
const ef: AreaCompetencial = {
  area: 'Educación Física',
  criterios: [cr('CE1.1', 8), cr('CE1.2', 6), cr('CE2.1', 4)],
  pesosCriterio: new Map([['CE1.2', 3]]),
  conexiones: new Map([
    ['CE1.1', con(['CPSAA3', 'STEM5'])],
    ['CE1.2', con(['CPSAA3', 'STEM5'])],
    ['CE2.1', con(['CPSAA1'])],
  ]),
}
const mat: AreaCompetencial = {
  area: 'Matemáticas',
  criterios: Array.from({ length: 6 }, (_, i) => cr(`CE3.${i + 1}`, 10)),
  conexiones: new Map(Array.from({ length: 6 }, (_, i) => [`CE3.${i + 1}`, con(['CPSAA3'])])),
}
const perfil = perfilCompetenciasClave([ef, mat])
const cpsaa3 = perfil.descriptores.find(d => d.id === 'CPSAA3')!
ok(cpsaa3.areas.find(a => a.area === 'Educación Física')!.final === 6.5, 'EF: (8·1 + 6·3) / 4 = 6,5', String(cpsaa3.areas[0].final))
ok(cpsaa3.final === 8.25, 'CPSAA3 = media de EF (6,5) y Mat (10), aunque Mat tenga seis criterios', String(cpsaa3.final))
ok(cpsaa3.aportes.length === 8, 'el rastro lleva los ocho criterios que aportan')
ok(nivelDesarrollo(cpsaa3.final)!.nombre === 'Adquirido', '8,25 es «Adquirido»')

console.log('\n2. La competencia es la media de sus descriptores con datos')
const cpsaa = perfil.competencias.find(c => c.id === 'CPSAA')!
ok(cpsaa.final === 6.13, 'CPSAA = media de CPSAA3 (8,25) y CPSAA1 (4)', String(cpsaa.final))
ok(cpsaa.descriptores.join() === 'CPSAA1,CPSAA3', 'ordenados y solo los que tienen datos', cpsaa.descriptores.join())
ok(!perfil.competencias.some(c => c.id === 'CCL'), 'una competencia sin nada conectado no aparece')
ok(perfil.competencias.map(c => c.id).join() === 'STEM,CPSAA', 'competencias en el orden del Perfil de salida', perfil.competencias.map(c => c.id).join())

console.log('\n3. Trimestres: un trimestre sin datos no cuenta como cero')
const tri = perfilCompetenciasClave([{
  area: 'EF', criterios: [cr('CE1.1', 4, null, 8, 6), cr('CE1.2', null, 10, null, 10)],
  conexiones: new Map([['CE1.1', con(['CC2'])], ['CE1.2', con(['CC2'])]]),
}])
const cc2 = tri.descriptores[0]
ok(cc2.trimestres[1] === 4 && cc2.trimestres[2] === 10 && cc2.trimestres[3] === 8, '1T 4 · 2T 10 · 3T 8',
  JSON.stringify(cc2.trimestres))
ok(cc2.final === 8, 'la final sale de la final de cada criterio (regla del área), no de los trimestres', String(cc2.final))
ok(notaEnPeriodo(cc2, 2) === 10 && notaEnPeriodo(cc2, null) === 8, 'notaEnPeriodo: trimestre o final')

console.log('\n4. Solo competencia (Valencia): cuenta para la competencia, no para un descriptor')
const val = perfilCompetenciasClave([{
  area: 'EF', criterios: [cr('CE1.1', 6), cr('CE2.1', 9)],
  conexiones: new Map([
    ['CE1.1', con([], 'competencia', ['CCL', 'CPSAA'])],
    ['CE2.1', con(['CPSAA4'])],
  ]),
}])
ok(!val.descriptores.some(d => d.id.startsWith('CCL')), 'ningún descriptor de CCL inventado')
const valCcl = val.competencias.find(c => c.id === 'CCL')!
ok(valCcl.final === 6 && valCcl.descriptores.length === 0 && valCcl.directa?.aportes.length === 1,
  'CCL = 6, entera de la conexión directa')
ok(val.competencias.find(c => c.id === 'CPSAA')!.final === 7.5, 'CPSAA = media de CPSAA4 (9) y la entrada directa (6)')

console.log('\n5. Conexión del Real Decreto y criterios sin conexión')
const est = perfilCompetenciasClave([{
  area: 'EF', criterios: [cr('CE1.1', 7), cr('CE9.1', 5), cr('CE2.1', null, null, null, null)],
  conexiones: new Map([['CE1.1', con(['CD1'], 'estatal')]]),
}])
ok(est.usaEstatal, 'se sabe que hay una conexión tomada del Real Decreto')
ok(est.descriptores[0].aportes[0].origen === 'estatal', 'y el aporte lo lleva')
ok(est.sinConexion.length === 1 && est.sinConexion[0].criterio_id === 'CE9.1',
  'CE9.1 tiene nota y no conecta con nada: se lista; CE2.1 sin nota no', JSON.stringify(est.sinConexion))

console.log('\n6. Escala de cuatro niveles')
const cortes: [number | null, number | null][] = [[0, 1], [4.99, 1], [5, 2], [6.99, 2], [7, 3], [8.99, 3], [9, 4], [10, 4], [null, null]]
for (const [n, esperado] of cortes) {
  ok((nivelDesarrollo(n)?.nivel ?? null) === esperado, `${n} → nivel ${esperado}`)
}

console.log('\n7. Lo que manda el servidor')
const conex = conexionesDeCriterios([
  { id: 'CE1.1', descriptores: ['CCL1'], competencias_clave: ['CCL'], conexion_origen: 'comunidad' },
  { id: 'CE1.2' },
  { id: 'CE2.1', descriptores: [], competencias_clave: ['CC'], conexion_origen: 'competencia' },
  { id: 'CE3.1', descriptores: ['CD2'], competencias_clave: ['CD'], conexion_origen: 'raro' },
])
ok(conex.size === 3 && !conex.has('CE1.2'), 'un criterio sin campos (servidor antiguo) no conecta')
ok(conex.get('CE2.1')!.origen === 'competencia' && conex.get('CE3.1')!.origen === 'ninguna', 'origen desconocido → ninguna')

console.log('\n8. Desde calcularNotaArea, sin ponderar dos veces')
const ins = [{ id: 1, asignatura_id: 1, nombre: 'Observación', tipo: 'observacion', peso: 1 }] as never[]
const cals = [
  { alumno_id: 1, instrumento_id: 1, criterio_id: 'CE1.1', trimestre: 1, unidad_id: 0, valor: 6 },
  { alumno_id: 1, instrumento_id: 1, criterio_id: 'CE1.2', trimestre: 1, unidad_id: 0, valor: 9 },
] as never[]
const notaArea = calcularNotaArea(1, cals, ins, undefined, new Map())
const desdeArea = perfilCompetenciasClave([{
  area: 'EF', criterios: notaArea.criterios,
  conexiones: new Map([['CE1.1', con(['CE3'])], ['CE1.2', con(['CE3'])]]),
}])
ok(desdeArea.descriptores[0]?.trimestres[1] === 7.5, 'CE3 (emprendedora) = media de 6 y 9', JSON.stringify(desdeArea.descriptores[0]?.trimestres))

console.log('\n9. Resumen del grupo')
const grupo = resumenDelGrupo([perfil, tri, val, est], null)
const g = grupo.competencias.find(c => c.id === 'CPSAA')!
ok(g.conDatos === 2 && g.porNivel[1] === 1 && g.porNivel[2] === 1, 'CPSAA: dos alumnos, uno en desarrollo y otro adquirido',
  JSON.stringify(g))
ok(g.media != null && Math.abs(g.media - 6.82) <= 0.01, 'media del grupo de 6,13 y 7,5', String(g.media))
ok(grupo.competencias[0].id === 'CCL', 'orden del Perfil de salida', grupo.competencias.map(c => c.id).join())

console.log('\n10. Documentos')
const catalogo = [
  { id: 'CPSAA1', competencia_id: 'CPSAA', descripcion: 'Es consciente de las propias emociones' },
  { id: 'CPSAA3', competencia_id: 'CPSAA', descripcion: 'Reconoce y respeta las emociones <de> los demás' },
]
const alumnos = [
  { nombre: 'Ana', apellidos: 'Pérez', perfil },
  { nombre: 'Brais', apellidos: 'Souto', perfil: est },
]
const contexto = { titulo: '5ºA · 5º de Educación Primaria · Curso 2026-2027', etapa: 'primaria' as const, catalogo, periodo: null }
const docAl = documentoCompetenciasAlumnos(alumnos, contexto)
ok((docAl.match(/class="hoja"/g) || []).length === 2, 'una lámina por alumno')
ok(docAl.includes('Reconoce y respeta las emociones &lt;de&gt; los demás'), 'el texto del descriptor va escapado')
ok(docAl.includes('data-nivel="3"') && docAl.includes('Adquirido'), 'el nivel se ve con nombre')
ok(docAl.includes('Real Decreto'), 'con conexión estatal, la lámina lo dice')
ok(docAl.includes('CE9.1'), 'y nombra los criterios con nota que no conectan')
const docGr = documentoCompetenciasGrupo(alumnos, contexto)
ok(docGr.includes('Pérez, Ana') && docGr.includes('Souto, Brais'), 'el resumen del grupo lleva a cada alumno')
ok(docGr.includes('CPSAA3'), 'y los descriptores con datos')

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
