/**
 * Informe de una prueba corregida.
 *
 * Lo que se vigila: que cada pregunta cuente aciertos, fallos y en blanco
 * como lo que son; que el orden por dificultad ponga primero lo más fallado;
 * que la nota por criterio sea la misma que puso `notaDePrueba`; que los
 * aspectos manden sobre los criterios como ejes y que el criterio sirva
 * cuando no hay aspectos; que la lectura diga lo que dicen los números; y
 * que el documento y el gráfico se compongan sin librerías.
 */
import { informeDePrueba, radialSVG } from '../frontend/src/db/informePrueba'
import { normalizarPrueba, notaDePrueba, ACIERTO, FALLO, EN_BLANCO, preguntasIguales } from '../frontend/src/db/prueba'
import { documentoInformePrueba } from '../frontend/src/informes/informePrueba'
import { pruebaDeFilas, pruebaAMarkdown, pruebaDeJson, pruebaAJson, pruebaDeExamenMarkdown, examenAMarkdown } from '../frontend/src/ia/pruebaImportar'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

console.log('\n1. Un test corregido a cuatro alumnos')
const test = normalizarPrueba({
  titulo: 'Os ríos', tipo: 'test', reparto: 'criterios', penalizacion: 0.25,
  preguntas: [
    { id: 'p1', enunciado: 'Nace o Miño', max: 1, criterio_id: 'CE1', aspecto: 'Ríos' },
    { id: 'p2', enunciado: 'Afluentes', max: 1, criterio_id: 'CE1', aspecto: 'Ríos' },
    { id: 'p3', enunciado: 'Clima costa', max: 1, criterio_id: 'CE2', aspecto: 'Clima' },
    { id: 'p4', enunciado: 'Presentación', max: 1, criterio_id: null, aspecto: 'Clima' },
  ],
})
const A = ACIERTO, F = FALLO, B = EN_BLANCO
const alumnos = [
  { alumno_id: 1, nombre: 'Ana', respuestas: { p1: A, p2: A, p3: A, p4: A } },
  { alumno_id: 2, nombre: 'Bruno', respuestas: { p1: A, p2: F, p3: F, p4: A } },
  { alumno_id: 3, nombre: 'Carla', respuestas: { p1: A, p2: B, p3: F, p4: F } },
  { alumno_id: 4, nombre: 'Dani', respuestas: { p1: A, p2: B, p3: B, p4: F } },
  { alumno_id: 5, nombre: 'Sin corregir', respuestas: {} },
]
{
  const inf = informeDePrueba(test, alumnos, ['CE1', 'CE2'])
  ok(inf.alumnos === 4, 'cuenta solo los corregidos', String(inf.alumnos))
  const p2 = inf.preguntas[1], p3 = inf.preguntas[2]
  ok(p2.aciertos === 1 && p2.fallos === 1 && p2.enBlanco === 2 && p2.pctAcierto === 25, 'la 2: 1 acierto, 1 fallo, 2 en blanco → 25 %', JSON.stringify(p2))
  ok(p3.pctAcierto === 25 && inf.preguntas[0].pctAcierto === 100, 'la 3 al 25 %, la 1 al 100 %')
  ok(inf.porDificultad.map(p => p.numero).join(',') === '2,3,4,1', 'por dificultad: más fallada primero, desempate por número', inf.porDificultad.map(p => p.numero).join(','))
  // La nota media es la media de las notas que puso notaDePrueba a los corregidos: Ana aprueba, los demás no.
  const notas = alumnos.slice(0, 4).map(a => notaDePrueba(test, a.respuestas, ['CE1', 'CE2']).nota!)
  const mediaEsperada = Math.round((notas.reduce((t, n) => t + n, 0) / 4) * 100) / 100
  ok(inf.notaMedia === mediaEsperada && inf.aprobados === 1 && inf.suspensos === 3, 'media de las notas del alumno, un aprobado, tres suspensos', `${inf.notaMedia} · ${inf.aprobados}/${inf.suspensos}`)
  // CE1 recibe p1, p2 y p4 (común); CE2, p3 y p4.
  const ce1 = inf.porCriterio.find(c => c.criterio_id === 'CE1')!, ce2 = inf.porCriterio.find(c => c.criterio_id === 'CE2')!
  ok(ce1.n === 4 && ce2.n === 4 && ce1.media! > ce2.media!, 'nota media por criterio con la misma función que la nota del alumno', `${ce1.media} · ${ce2.media}`)
  ok(inf.ejesPor === 'aspecto' && inf.ejes.map(e => e.nombre).join('|') === 'Ríos|Clima', 'con aspectos, los ejes son los aspectos')
  ok(inf.ejes[0].pctAcierto === 62.5 && inf.ejes[1].pctAcierto === 37.5, 'el índice del aspecto pondera sus preguntas', inf.ejes.map(e => e.pctAcierto).join(' · '))
  ok(inf.porCriterioGrupo.some(g => g.nombre === 'Todos' && g.preguntas.join() === '4'), 'la pregunta sin criterio forma su grupo')
  const texto = inf.lectura.join(' ')
  ok(/falla la clase: «Clima» \(37\.5 % de acierto en las preguntas 3, 4\)/.test(texto), 'la lectura nombra el aspecto que peor sale', texto)
  ok(/falladas por más de la mitad de la clase: las 2 y 3/.test(texto), 'y las preguntas que fallan más de la mitad', texto)
  ok(/deja en blanco la 2/.test(texto), 'y lo que se deja en blanco', texto)
  ok(new RegExp(`Nota media ${mediaEsperada.toFixed(1).replace('.', ',')}: 1 de 4 alumnos aprueban y 3 suspenden`).test(texto), 'y el conjunto', texto)
  ok(/Casi todos aciertan la 1/.test(texto), 'y lo que ya está aprendido', texto)
}

console.log('\n2. Puntos por pregunta, sin aspectos')
{
  const puntos = normalizarPrueba({ titulo: 'Control', tipo: 'puntos', reparto: 'criterios', preguntas: [
    { id: 'p1', enunciado: '', max: 4, criterio_id: 'CE1' }, { id: 'p2', enunciado: '', max: 6, criterio_id: 'CE2' } ] })
  const inf = informeDePrueba(puntos, [
    { alumno_id: 1, nombre: 'A', respuestas: { p1: 4, p2: 3 } },
    { alumno_id: 2, nombre: 'B', respuestas: { p1: 2, p2: 6 } },
  ], ['CE1', 'CE2'])
  ok(inf.preguntas[0].pctAcierto === 75 && inf.preguntas[0].media === 3, 'en puntos, el índice es la parte de los puntos posibles que se consigue', JSON.stringify(inf.preguntas[0]))
  ok(inf.ejesPor === 'criterio' && inf.ejes.map(e => e.nombre).join('|') === 'CE1|CE2', 'sin aspectos, los ejes son los criterios')
  ok(inf.lectura.some(f => /Rendimiento parejo entre criterios/.test(f)), 'con todo a la par lo dice', inf.lectura.join(' '))
  const vacio = informeDePrueba(puntos, [], ['CE1'])
  ok(vacio.alumnos === 0 && vacio.notaMedia === null && /ningún alumno corregido/.test(vacio.lectura[0]), 'sin corregidos, lo dice y no divide por cero')
  const sinAnotar = informeDePrueba(puntos, [{ alumno_id: 1, nombre: 'A', respuestas: { p1: 4 } }], ['CE1', 'CE2'])
  ok(sinAnotar.preguntas[1].sinAnotar === 1 && sinAnotar.preguntas[1].pctAcierto === 0, 'una pregunta sin anotar en un alumno corregido cuenta cero y se cuenta')
}

console.log('\n3. El gráfico radial')
{
  const inf = informeDePrueba(test, alumnos, ['CE1', 'CE2'])
  const svg2 = radialSVG(inf.ejes)
  ok(svg2.startsWith('<svg') && !/polygon/.test(svg2) && /Ríos/.test(svg2) && /62\.5 %/.test(svg2), 'con dos ejes, barras y no polígono')
  const tres = normalizarPrueba({ ...test, preguntas: test.preguntas.map((p, i) => ({ ...p, aspecto: ['Ríos', 'Clima', 'Relieve', 'Ríos'][i] })) })
  const svg3 = radialSVG(informeDePrueba(tres, alumnos, ['CE1', 'CE2']).ejes)
  ok((svg3.match(/<polygon/g) ?? []).length === 5 && /Relieve/.test(svg3) && /<circle/.test(svg3), 'con tres ejes, cuatro anillos y el polígono de la clase')
  ok(!/<script|<image|href=|src=/.test(svg3), 'SVG puro, sin nada externo')
  ok(/&lt;/.test(radialSVG([{ clave: 'a', nombre: '<b>', preguntas: [1], pctAcierto: 50 }, { clave: 'b', nombre: 'x', preguntas: [2], pctAcierto: 50 }])), 'los nombres se escapan')
}

console.log('\n4. El documento')
{
  const inf = informeDePrueba(test, alumnos, ['CE1', 'CE2'])
  const html = documentoInformePrueba(inf, test, { grupo: '6ºA', area: 'Ciencias Sociales', unidad: 'UD3', descripciones: new Map([['CE1', 'Los ríos de Galicia']]) })
  ok(html.startsWith('<!doctype html>') && /Os ríos/.test(html) && /6ºA/.test(html), 'documento Lámina con título y clase')
  ok(/<svg/.test(html) && /Los ríos de Galicia/.test(html), 'lleva el radial y la descripción del criterio')
  ok(/falla la clase/.test(html) && /Presentación/.test(html), 'con la lectura y las preguntas')
  const i2 = html.indexOf('>2<'), i1 = html.indexOf('>1<')
  ok(i2 > 0 && i1 > i2, 'la tabla de preguntas va de más fallada a más acertada')
  ok(!/Ana|Bruno/.test(html), 'sin nombres de alumnos: es un informe de la clase')
}

console.log('\n5. El aspecto viaja con el examen')
{
  const { prueba } = pruebaDeFilas([['Examen'], ['Pregunta', 'Puntos', 'Criterio', 'Aspecto'], ['Uno', 2, 'CE1', 'Ríos'], ['Dos', 1, '', '']], 'X')
  ok(prueba.preguntas[0].aspecto === 'Ríos' && prueba.preguntas[1].aspecto === undefined, 'se lee de la tabla; vacío no se guarda')
  const md = pruebaAMarkdown(prueba)
  ok(/\| Aspecto \|/.test(md) && /Ríos/.test(md), 'y sale en la columna de la tabla exportada')
  const json = pruebaDeJson(pruebaAJson(prueba)).prueba
  ok(json.preguntas[0].aspecto === 'Ríos', 'ida y vuelta por JSON')
  const examen = pruebaDeExamenMarkdown('1. ¿Onde nace o Miño?\n   Aspecto: Ríos\n   a) Meira *\n   b) Ancares\n', 'T').prueba
  ok(examen.preguntas[0].aspecto === 'Ríos' && examen.preguntas[0].correcta === 0, 'y bajo la pregunta en un examen escrito')
  ok(/Aspecto: Ríos/.test(examenAMarkdown(examen, { conClave: true })) && !/Aspecto/.test(examenAMarkdown(examen)), 'con la clave sale; para el alumnado, no')
  ok(normalizarPrueba({ preguntas: [{ id: 'p1', enunciado: '', max: 1, aspecto: '  Ríos   de  Galicia ' }] }).preguntas[0].aspecto === 'Ríos de Galicia', 'normalizar limpia espacios')
  ok(preguntasIguales(2, 2).every(p => p.aspecto === undefined), 'las preguntas generadas nacen sin aspecto')
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
