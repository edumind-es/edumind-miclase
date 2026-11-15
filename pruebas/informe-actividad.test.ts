/**
 * Informe de un alumno en una actividad con rúbrica o con diario.
 *
 * Lo que se vigila: el nivel y el porcentaje de cada indicador frente al del
 * grupo; cuáles salen «a mejorar» y en qué orden; que un indicador sin marcar
 * no cuente como cero; la tendencia de los registros; el grupo de media
 * parecida; y, en el documento, que las cifras de la clase se callen con
 * pocas notas y que las observaciones del docente solo salgan si lo pide.
 */
import { analizarActividad, tendenciaDe, tieneDatos, type ActividadDeUnidad } from '../frontend/src/db/informeActividad'
import { documentoInformeAlumnoActividad } from '../frontend/src/informes/informeAlumnoActividad'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const niveles = [{ nombre: 'Excelente', valor: 4 }, { nombre: 'Bien', valor: 3 }, { nombre: 'Regular', valor: 2 }, { nombre: 'Insuficiente', valor: 1 }]
const indicadores = [
  { nombre: 'Claridad', descriptores: { Insuficiente: 'No se le entiende.' } },
  { nombre: 'Contenido' },
  { nombre: 'Postura' },
  { nombre: 'Tiempo' },
]
const alumno = (alumno_id: number, nota: number | null, marcas: Record<string, number>, registros: ActividadDeUnidad['alumnos'][number]['registros'] = []) =>
  ({ alumno_id, nombre: `Alumno ${alumno_id}`, nota, marcas, registros })

const rubrica: ActividadDeUnidad = {
  instrumento_id: 7, instrumento: 'Exposición oral', unidad_id: 3, unidad: 'UD3', trimestre: 1,
  herramienta: 'rubrica', rubrica: { titulo: 'Rúbrica de exposición', niveles, indicadores }, agregacion: 'media', criterios: ['CE1.1'],
  alumnos: [
    alumno(1, 5, { Claridad: 1, Contenido: 4, Postura: 1 }),
    alumno(2, 10, { Claridad: 4, Contenido: 4, Postura: 4, Tiempo: 4 }),
    alumno(3, 8.1, { Claridad: 4, Contenido: 3, Postura: 2, Tiempo: 4 }),
    alumno(4, 7.5, { Claridad: 3, Contenido: 3, Postura: 2, Tiempo: 4 }),
    alumno(5, 6.9, { Claridad: 4, Contenido: 2, Postura: 1, Tiempo: 4 }),
    alumno(6, null, {}),
  ],
}

console.log('\n1. Rúbrica: indicador a indicador')
{
  const a = analizarActividad(rubrica, 1)!
  ok(a.herramienta === 'rubrica' && a.titulo === 'Rúbrica de exposición' && a.unidad === 'UD3', 'lleva el título de la rúbrica y la unidad')
  ok(a.nota.valor === 5 && a.nota.grupo?.n === 5 && a.nota.grupo.mediana === 7.5 && a.nota.diferencia === -2.5, 'la nota es la guardada, frente a los cinco con nota', JSON.stringify(a.nota))
  const [claridad, contenido, postura, tiempo] = a.indicadores
  ok(claridad.nivel === 'Insuficiente' && claridad.pctAlumno === 25 && claridad.flojo && claridad.descriptor === 'No se le entiende.', 'un nivel 1 de 4 es el 25 %, flojo, con lo que dice la rúbrica', JSON.stringify(claridad))
  ok(claridad.pctGrupo === 80 && claridad.nGrupo === 5, 'el grupo en Claridad: (25+100+100+75+100)/5 = 80 %', JSON.stringify(claridad))
  ok(contenido.nivel === 'Excelente' && contenido.pctAlumno === 100 && !contenido.flojo, 'el nivel máximo es el 100 %')
  ok(postura.pctGrupo === 50 && postura.flojo, 'Postura: él flojo y el grupo al 50 %')
  ok(tiempo.valor === null && tiempo.pctAlumno === null && !tiempo.flojo && tiempo.nGrupo === 4 && tiempo.pctGrupo === 100, 'lo que no se le marcó no cuenta como cero, y el grupo se calcula sin él', JSON.stringify(tiempo))
  ok(a.flojos.map(i => i.nombre).join() === 'Claridad,Postura', 'a mejorar: a igualdad, primero el que mejor lleva el grupo', a.flojos.map(i => i.nombre).join())
  ok(a.logrados.map(i => i.nombre).join() === 'Contenido' && a.sinMarcar === 1, 'un logrado y uno sin marcar')
  ok(a.registros.length === 0 && a.tendencia === null && a.agregacion === null, 'sin registros no hay evolución')
  ok(analizarActividad(rubrica, 6) === null && analizarActividad(rubrica, 99) === null, 'quien no tiene nada marcado no tiene informe')
  ok(!tieneDatos(rubrica.alumnos[5], 'rubrica') && tieneDatos(rubrica.alumnos[0], 'rubrica'), 'tieneDatos lo dice igual')
}

console.log('\n1b. Con todo flojo, el documento no repite la tabla')
{
  const act: ActividadDeUnidad = { ...rubrica, alumnos: [alumno(1, 2.5, { Claridad: 1, Contenido: 1, Postura: 1, Tiempo: 1 })] }
  const html = documentoInformeAlumnoActividad({ alumno: 'Ana', clase: '6.º A', area: 'CCSS', trimestre: 1, analisis: analizarActividad(act, 1)! })
  ok(html.includes('Todos los indicadores quedan por debajo de la mitad') && html.split('data-indicador="Claridad"').length === 2, 'cada indicador sale una sola vez')
}

console.log('\n2. Frente a los de media parecida')
{
  const a = analizarActividad(rubrica, 1, { solo: [4, 5] })!
  ok(a.nota.grupo?.n === 3 && a.nota.grupo.mediana === 6.9, 'el grupo son esos dos y él', JSON.stringify(a.nota.grupo))
  ok(a.indicadores[0].nGrupo === 3 && a.indicadores[0].pctGrupo === 67, 'y cada indicador se compara solo con ellos: (25+75+100)/3', JSON.stringify(a.indicadores[0]))
  ok(a.indicadores[0].pctAlumno === 25, 'lo suyo no cambia')
}

console.log('\n3. Diario: registro a registro')
const diario: ActividadDeUnidad = {
  instrumento_id: 9, instrumento: 'Billete de salida', unidad_id: 3, unidad: 'UD3', trimestre: 1,
  herramienta: 'diario', rubrica: null, agregacion: 'media', criterios: ['CE1.1'],
  alumnos: [
    alumno(1, 7.5, {}, [
      { id: 3, fecha: '2026-10-20T10:00:00.000Z', valor: 4, observacion: 'Muy centrada hoy.' },
      { id: 1, fecha: '2026-10-06T10:00:00.000Z', valor: 2 },
      { id: 2, fecha: '2026-10-13T10:00:00.000Z', valor: 3, observacion: '  ' },
    ]),
    alumno(2, 5, {}, [{ id: 4, fecha: '2026-10-06T10:00:00.000Z', valor: 2 }]),
    alumno(3, 2.5, {}, [{ id: 5, fecha: '2026-10-06T10:00:00.000Z', valor: 4 }, { id: 6, fecha: '2026-10-13T10:00:00.000Z', valor: 1 }]),
  ],
}
{
  const a = analizarActividad(diario, 1)!
  ok(a.herramienta === 'diario' && a.titulo === 'Billete de salida' && a.indicadores.length === 0, 'en el diario no hay indicadores')
  ok(a.registros.map(r => r.nota).join() === '5,7.5,10', 'los registros van del más antiguo al más reciente, en nota', a.registros.map(r => r.nota).join())
  ok(a.registros[0].etiqueta === 'En proceso' && a.registros[2].etiqueta === 'Destacado' && !a.registros[0].conRubrica, 'con el nombre de su nivel')
  ok(a.registros[1].observacion === null && a.registros[2].observacion === 'Muy centrada hoy.', 'una observación en blanco no es una observación')
  ok(a.tendencia === 'sube' && a.agregacion === 'media', 'va a más')
  ok(analizarActividad(diario, 3)!.tendencia === 'baja' && analizarActividad(diario, 2)!.tendencia === null, 'otro va a menos, y con un solo registro no hay tendencia')
  ok(tendenciaDe([5, 5.2]) === 'estable' && tendenciaDe([5, 9, 5.5]) === 'sube' && tendenciaDe([]) === null, 'medio punto entre el primero y el último ya es moverse')
}

console.log('\n4. Rúbrica que evoluciona: observaciones con nota')
{
  const act: ActividadDeUnidad = { ...rubrica, alumnos: [alumno(1, 6.5, { Claridad: 3, Contenido: 3, Postura: 3, Tiempo: 3 }, [
    { id: 1, fecha: '2026-10-06T10:00:00.000Z', valor: 2, nota: 5.6, niveles_rubrica: { Claridad: 2 } },
    { id: 2, fecha: '2026-10-20T10:00:00.000Z', valor: 3, nota: 7.5, niveles_rubrica: { Claridad: 3 } },
  ])] }
  const a = analizarActividad(act, 1)!
  ok(a.registros.length === 2 && a.registros[0].conRubrica && a.registros[0].etiqueta === null && a.registros[0].nota === 5.6, 'la observación con rúbrica cuenta con su nota, no con el nivel')
  ok(a.tendencia === 'sube' && a.agregacion === 'media' && a.flojos.length === 0, 'y la rúbrica dice cómo ha evolucionado')
}

console.log('\n5. El documento')
{
  const base = { alumno: 'Abad <Ríos>, Ana', clase: '6.º A', area: 'CCSS', trimestre: 1 }
  const html = documentoInformeAlumnoActividad({ ...base, analisis: analizarActividad(rubrica, 1)! })
  ok(html.startsWith('<!doctype html>') && html.includes('Abad &lt;Ríos&gt;, Ana') && html.includes('Rúbrica de exposición'), 'es una lámina con el nombre, escapado, y la rúbrica')
  ok(html.includes('Media de la clase') && html.includes('A mejorar') && html.includes('Indicador a indicador') && html.includes('No se le entiende.'), 'con cinco notas da las cifras de la clase, lo que hay que mejorar y la rúbrica entera')
  const filaTiempo = html.slice(html.lastIndexOf('data-indicador="Tiempo"'), html.indexOf('</tr>', html.lastIndexOf('data-indicador="Tiempo"')))
  ok(filaTiempo.includes('Sin marcar') && filaTiempo.includes('—') && !filaTiempo.includes('100 %'), 'un indicador con cuatro marcas en el grupo no da su cifra', filaTiempo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
  ok(!html.includes('Media parecida'), 'el grupo de media parecida no se imprime')

  const delDiario = analizarActividad(diario, 1)!
  const sin = documentoInformeAlumnoActividad({ ...base, analisis: delDiario })
  ok(sin.includes('Registro a registro') && sin.includes('Va a más') && sin.includes('Destacado'), 'el del diario lleva sus registros y la evolución')
  ok(!sin.includes('Media de la clase') && sin.includes('no se dan las cifras de la clase'), 'con tres notas calla las cifras de la clase')
  ok(!sin.includes('Muy centrada hoy.') && !sin.includes('Observación'), 'las observaciones del docente no salen si no las pide')
  const con = documentoInformeAlumnoActividad({ ...base, analisis: delDiario, conObservaciones: true })
  ok(con.includes('Muy centrada hoy.') && con.includes('<th>Observación</th>'), 'y salen si marca la casilla')
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
