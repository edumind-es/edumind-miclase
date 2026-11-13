/**
 * Análisis de un alumno frente a su grupo.
 *
 * Lo que se vigila: mediana con número par e impar; la moda sobre el
 * calificativo, con empate y sin moda; que la nota adaptada (ACI) de un
 * alumno no entre en la estadística del criterio ni se le compare ahí; los
 * puntos débiles en su orden; y, en un examen, las preguntas que él falla y
 * la mayoría acierta.
 */
import { mediana, modaDeCalificativos, resumenEstadistico, textoDeModa } from '../frontend/src/db/estadistica'
import { analizarAlumno, analizarExamen, alumnosDeMediaParecida, grupoPublicable, MINIMO_GRUPO, type ExamenDeArea } from '../frontend/src/db/analisisAlumno'
import { documentoAnalisisAlumno } from '../frontend/src/informes/analisisAlumno'
import { documentoInformeAlumnoPrueba } from '../frontend/src/informes/informeAlumnoPrueba'
import { normalizarPrueba, ACIERTO, FALLO, EN_BLANCO } from '../frontend/src/db/prueba'
import type { NotaArea } from '../frontend/src/db/calculo'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

console.log('\n1. Mediana, moda y resumen')
ok(mediana([7, 3, 9]) === 7 && mediana([4, 8, 6, 10]) === 7 && mediana([]) === null, 'mediana con número impar, par y vacío')
{
  const m = modaDeCalificativos([7.2, 8.9, 7, 5.5, 3])!
  ok(m.siglas.join() === 'NT' && m.veces === 3, 'la moda es el calificativo más frecuente: tres notables', JSON.stringify(m))
  const empate = modaDeCalificativos([7, 8, 5, 5.5, 9.5])!
  ok(empate.siglas.join() === 'SU,NT' && empate.veces === 2, 'con empate salen los dos, de IN a SB', JSON.stringify(empate))
  ok(modaDeCalificativos([3, 5, 6, 7, 9]) === null, 'si ninguno destaca, no hay moda')
  ok(modaDeCalificativos([7.5])!.siglas.join() === 'NT' && modaDeCalificativos([]) === null, 'una sola nota tiene moda; ninguna, no')
  const r = resumenEstadistico([4, null, 8, undefined, 6, 10])!
  ok(r.n === 4 && r.media === 7 && r.mediana === 7 && r.min === 4 && r.max === 10, 'el resumen ignora lo que no tiene nota', JSON.stringify(r))
  ok(resumenEstadistico([null, undefined]) === null, 'sin ninguna nota no hay resumen')
  ok(textoDeModa(m, 5) === 'Notable (3 de 5)' && textoDeModa(empate) === 'Suficiente y Notable (2 cada uno)' && textoDeModa(null) === 'sin moda', 'la moda se dice en castellano llano')
}

console.log('\n2. El alumno frente al grupo, por área, instrumento y criterio')
const criterio = (criterio_id: string, t1: number | null, final: number | null = t1) =>
  ({ criterio_id, trimestres: { 1: t1, 2: null, 3: null }, final, aportaciones: [] })
const nota = (t1: number, examen: number, tabla: number, c11: number | null, c12: number | null): NotaArea => ({
  asignatura_id: 1, trimestres: { 1: t1, 2: null, 3: null }, final: t1,
  criterios: [criterio('CE1.1', c11), criterio('CE1.2', c12)],
  instrumentos: [
    { instrumento_id: 10, nombre: 'Proba escrita', peso: 80, pesos: { 1: 80, 2: 80, 3: 80 }, trimestres: { 1: examen, 2: null, 3: null }, criterios: { 1: 2, 2: 0, 3: 0 } },
    { instrumento_id: 20, nombre: 'Táboa de indicadores', peso: 20, pesos: { 1: 20, 2: 20, 3: 20 }, trimestres: { 1: tabla, 2: null, 3: null }, criterios: { 1: 2, 2: 0, 3: 0 } },
  ],
  regla_area: 'instrumento',
})
// Cinco alumnos. Ana (1) va floja en CE1.2; Eva (5) tiene CE1.1 adaptado (ACI) con un 10.
const notas = new Map<number, NotaArea>([
  [1, nota(5.2, 5, 6, 7, 3)],
  [2, nota(7, 7, 7, 6, 8)],
  [3, nota(8, 8, 8, 8, 8)],
  [4, nota(6, 6, 6, 5, 7)],
  [5, nota(9, 9, 9, 10, 9)],
])
const aci = { id: 1, alumno_id: 5, asignatura_id: 1, tipo: 'adaptacion', trimestres: '[1,2,3]',
  criterios_json: JSON.stringify({ 'CE1.1': { codigo: 'CE1.1', descripcion: 'Del curso anterior', curso: '4' } }) } as any
const medidas = new Map([[5, [aci]]])
const ana = analizarAlumno(1, notas, medidas)
ok(ana.area.periodos['1'].valor === 5.2 && ana.area.periodos['1'].grupo!.n === 5 && ana.area.periodos['1'].grupo!.mediana === 7 && ana.area.periodos['1'].diferencia === -1.8,
  'área: su 5,2 frente a una mediana de 7 (−1,8)', JSON.stringify(ana.area.periodos['1']))
ok(ana.area.periodos['2'].valor === null && ana.area.periodos['2'].grupo === null, 'un trimestre sin datos no inventa nada')
ok(ana.area.periodos.final.grupo!.media === 7.04, 'la media del grupo en la final', String(ana.area.periodos.final.grupo!.media))
const examen = ana.instrumentos.find(i => i.nombre === 'Proba escrita')!
ok(ana.instrumentos.length === 2 && examen.periodos['1'].valor === 5 && examen.periodos['1'].grupo!.mediana === 7 && examen.periodos['1'].grupo!.moda?.siglas.join() === 'NT',
  'instrumento: su 5 frente a mediana 7 y moda Notable (dos de cinco)', JSON.stringify(examen.periodos['1']))
const c11 = ana.criterios.find(c => c.id === 'CE1.1')!
ok(c11.periodos['1'].grupo!.n === 4 && c11.periodos['1'].grupo!.max === 8 && c11.periodos['1'].grupo!.mediana === 6.5,
  'la nota adaptada de Eva (10) no entra en la estadística de CE1.1: cuatro notas, máximo 8', JSON.stringify(c11.periodos['1'].grupo))
ok(ana.criterios.find(c => c.id === 'CE1.2')!.periodos['1'].grupo!.n === 5, 'en un criterio que no tiene adaptado, Eva sí cuenta')
const eva = analizarAlumno(5, notas, medidas)
const c11Eva = eva.criterios.find(c => c.id === 'CE1.1')!
ok(c11Eva.adaptado === true && c11Eva.periodos['1'].valor === 10 && c11Eva.periodos['1'].grupo === null && c11Eva.periodos['1'].diferencia === null,
  'y a Eva no se la compara con el grupo en su criterio adaptado', JSON.stringify(c11Eva.periodos['1']))
ok(analizarAlumno(1, notas).criterios.find(c => c.id === 'CE1.1')!.periodos['1'].grupo!.n === 5, 'sin medidas, cuentan todos')

console.log('\n3. Puntos débiles y fuertes')
ok(ana.debiles.length === 1 && ana.debiles[0].criterio_id === 'CE1.2' && ana.debiles[0].valor === 3 && ana.debiles[0].diferencia === -5,
  'el punto débil de Ana es CE1.2: un 3 frente a una mediana de 8', JSON.stringify(ana.debiles))
ok(ana.fuertes.length === 0, 'y no destaca en ninguno')
ok(eva.debiles.length === 0 && !eva.fuertes.some(f => f.criterio_id === 'CE1.1') && eva.fuertes[0]?.criterio_id === 'CE1.2',
  'el criterio adaptado no cuenta ni como fuerte ni como débil', JSON.stringify(eva.fuertes))
ok(grupoPublicable(ana.area.periodos['1']) && !grupoPublicable(c11.periodos['1']) && MINIMO_GRUPO === 5,
  'con menos de cinco notas, las cifras del grupo no se dan en un documento')

console.log('\n4. Un examen: lo que él falla y la mayoría acierta')
{
  const def = normalizarPrueba({
    titulo: 'A nosa saúde', tipo: 'test', reparto: 'unica',
    preguntas: [
      { id: 'p1', enunciado: 'Los huesos', max: 1, aspecto: 'Cuerpo', opciones: ['a', 'b'], correcta: 0 },
      { id: 'p2', enunciado: 'Los músculos', max: 1, aspecto: 'Cuerpo', opciones: ['a', 'b'], correcta: 0 },
      { id: 'p3', enunciado: 'La dieta', max: 1, aspecto: 'Salud', opciones: ['a', 'b'], correcta: 0 },
      { id: 'p4', enunciado: 'La difícil', max: 1, aspecto: 'Salud', opciones: ['a', 'b'], correcta: 0 },
    ],
  })
  const r = (alumno_id: number, p1: number, p2: number, p3: number, p4: number) =>
    ({ alumno_id, nombre: `Alumno ${alumno_id}`, respuestas: { p1, p2, p3, p4 } })
  const ex: ExamenDeArea = {
    instrumento: 'Proba escrita', unidad_id: 3, unidad: 'UD3', def, destinos: ['CE1.1'],
    respuestas: [
      r(1, FALLO, ACIERTO, EN_BLANCO, FALLO),
      r(2, ACIERTO, ACIERTO, ACIERTO, FALLO),
      r(3, ACIERTO, ACIERTO, ACIERTO, ACIERTO),
      r(4, ACIERTO, FALLO, ACIERTO, FALLO),
      r(5, ACIERTO, ACIERTO, ACIERTO, FALLO),
    ],
  }
  const a = analizarExamen(ex, 1)!
  ok(a.nota.valor === 2.5 && a.nota.grupo!.n === 5 && a.nota.grupo!.mediana === 7.5 && a.nota.diferencia === -5, 'su nota (2,5) frente a la mediana del grupo (7,5)', JSON.stringify(a.nota))
  ok(a.fallosDestacados.map(p => p.numero).join() === '1,3', 'falló la 1 y dejó en blanco la 3, que la mayoría acertó', a.fallosDestacados.map(p => `${p.numero}:${p.pctGrupo}`).join(' '))
  ok(!a.preguntas[3].falloDestacado && a.preguntas[3].pctGrupo === 20, 'la 4 la falló casi toda la clase: no es un fallo suyo destacado')
  ok(a.preguntas[1].pctAlumno === 100 && !a.preguntas[1].falloDestacado, 'la que acertó no sale')
  const cuerpo = a.ejes.find(e => e.nombre === 'Cuerpo')!, salud = a.ejes.find(e => e.nombre === 'Salud')!
  ok(a.ejesPor === 'aspecto' && cuerpo.pctAlumno === 50 && cuerpo.pctGrupo === 80 && salud.pctAlumno === 0 && salud.pctGrupo === 50,
    'por aspecto: su acierto frente al del grupo', JSON.stringify(a.ejes))
  ok(analizarExamen(ex, 99) === null, 'un alumno sin el examen corregido no tiene análisis')
  ok(a.falladas.map(p => p.numero).join() === '1,3,4', 'todas las que falló, de la más acertada por el grupo a la menos', a.falladas.map(p => `${p.numero}:${p.pctGrupo}`).join(' '))
  // El documento del alumno: con nombre, y con la clase solo si hay cinco o más.
  const doc = documentoInformeAlumnoPrueba({ alumno: 'Abad <Ríos>, Ana', clase: '6.º A', area: 'CCNN', unidad: 'UD1', def, analisis: a })
  ok(doc.includes('Abad &lt;Ríos&gt;, Ana') && doc.includes('Preguntas falladas') && doc.includes('Media de la clase'), 'el documento del alumno lleva su nombre, lo que falló y, con cinco exámenes, la clase')
  ok(doc.includes('data-eje="Salud"') && doc.includes('Acierto de la clase'), 'y su acierto por etiqueta frente al de la clase')
  const docPocos = documentoInformeAlumnoPrueba({ alumno: 'Ana', clase: '6.º A', area: 'CCNN', def, analisis: analizarExamen({ ...ex, respuestas: ex.respuestas.slice(0, 3) }, 1)! })
  ok(!docPocos.includes('Media de la clase') && !docPocos.includes('Acierto de la clase') && docPocos.includes('no se dan las cifras de la clase'), 'con tres exámenes corregidos no imprime ninguna cifra de la clase')
  // Frente a un grupo más pequeño: solo esos compañeros y él.
  const con23 = analizarExamen(ex, 1, { solo: [2, 3] })!
  ok(con23.nota.grupo!.n === 3 && con23.nota.valor === 2.5, 'con «solo», el grupo son esos compañeros y él', JSON.stringify(con23.nota.grupo))
  // Con preguntas por unidad, en la unidad del examen cuentan las suyas.
  const porUnidad = { ...ex, def: { ...def, preguntas: def.preguntas.map((p, i) => i < 2 ? { ...p, unidad_id: 3 } : { ...p, unidad_id: 4 }) } }
  ok(analizarExamen(porUnidad, 1)!.preguntas.length === 2, 'un examen con preguntas por unidad se analiza con las de su unidad')
}

console.log('\n4b. Compañeros de media parecida')
{
  const n = new Map<number, number | null>([[1, 6], [2, 6.5], [3, 5.2], [4, 7], [5, 5], [6, 6.9], [7, 9], [8, 2], [9, null]])
  const todos = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  ok(alumnosDeMediaParecida(1, n, todos).join() === '2,3,6,4,5', 'a un punto o menos, del más cercano al más lejano, sin él', alumnosDeMediaParecida(1, n, todos).join())
  ok(alumnosDeMediaParecida(7, n, todos).length === MINIMO_GRUPO && alumnosDeMediaParecida(7, n, todos)[0] === 4, 'si a un punto hay menos de cinco, los cinco más cercanos', alumnosDeMediaParecida(7, n, todos).join())
  ok(alumnosDeMediaParecida(1, n, [1, 2, 7]).join() === '2,7', 'solo entre los candidatos (los que tienen el examen); si no hay cinco, los que haya')
  ok(alumnosDeMediaParecida(9, n, todos).length === 0 && !alumnosDeMediaParecida(1, n, todos).includes(9), 'sin nota del área no hay grupo, ni se entra en el de otro')
}

console.log('\n5. El informe impreso')
{
  const html = documentoAnalisisAlumno({
    alumno: 'Abad <Ríos>, Ana', clase: '6.º A', area: 'Ciencias Sociales', cursoEscolar: '2026-2027',
    analisis: ana, examenes: [], descripciones: new Map([['CE1.2', 'Explicar el relieve.']]),
  })
  ok(html.startsWith('<!doctype html>') && html.includes('lm-plate-top') && html.includes('Abad &lt;Ríos&gt;, Ana'), 'es una lámina con el nombre del alumno, escapado')
  ok(/media <b>7,0<\/b> · mediana <b>7,0<\/b> · moda <b>Notable \(2 de 5\)<\/b>/.test(html), 'con cinco notas da media, mediana y moda del grupo', (html.match(/Grupo \(nota final[^<]*<b>[^.]*\./) || [''])[0].slice(0, 160))
  ok(html.includes('Dónde necesita más apoyo') && html.includes('Explicar el relieve.'), 'lleva los puntos débiles con su descripción')
  const filaCE11 = html.slice(html.lastIndexOf('>CE1.1<'), html.indexOf('</tr>', html.lastIndexOf('>CE1.1<')))
  ok(filaCE11.includes('7,0') && !filaCE11.includes('med.'), 'en CE1.1 hay cuatro notas del grupo: su nota sale, la mediana no', filaCE11.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 80))
  const filaCE12 = html.slice(html.lastIndexOf('>CE1.2<'), html.indexOf('</tr>', html.lastIndexOf('>CE1.2<')))
  ok(filaCE12.includes('med. 8,0'), 'en CE1.2, con cinco, sí')
  // Un grupo de tres: ninguna cifra del grupo en el papel.
  const pocos = new Map([...notas].slice(0, 3))
  const htmlPocos = documentoAnalisisAlumno({ alumno: 'Ana', clase: '6.º A', area: 'CCSS', analisis: analizarAlumno(1, pocos), examenes: [], descripciones: new Map() })
  ok(!htmlPocos.includes('med. ') && htmlPocos.includes('El grupo es pequeño'), 'con un grupo de tres no se imprime ninguna cifra del grupo')
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
