/**
 * Lector de la programación semanal (`planificacion/semanal.ts`), casado con
 * la clase (`planificacion/casar.ts`) y exportación (`exportar.ts`).
 *
 * Fixture: la semana real de Luis (6.º A, 9-13 de noviembre de 2026), sin
 * datos de alumnado, que mezcla castellano y gallego. Lo que se vigila: las
 * fechas salen de la cabecera; cada franja de la «Vista rápida» es una
 * sesión con su título y su ■; el detalle de un bloque de dos sesiones va a
 * las dos franjas; la secuencia lleva fase y minutos en las dos lenguas; los
 * criterios del «Anclaje/Anclaxe» se leen y casan con el currículo (CA → CE);
 * especialistas y actividades de centro se distinguen; la nota del Magosto
 * en cursiva es nota del día; lo que no casa se dice; y el Markdown que
 * exporta la app se vuelve a leer igual.
 */
import { readFileSync } from 'node:fs'
import { leerSemana, claveArea, nombreArea, codigosCriterio } from '../frontend/src/planificacion/semanal'
import { casarArea, casarUnidad, prepararVolcado, codigoCurriculo, criteriosDe, secuenciaDe } from '../frontend/src/planificacion/casar'
import { semanaAMarkdown, tituloSemana, semanaAHtml } from '../frontend/src/planificacion/exportar'
import type { SesionPlan } from '../frontend/src/db/localDb'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const md = readFileSync('pruebas/fixtures/planificacion_semanal_6A.md', 'utf8')
const s = leerSemana(md, new Date(2026, 0, 1))

console.log('\nCabecera y fechas')
ok(s.clase === '6º A de Primaria', 'la clase sale del título', String(s.clase))
ok(s.titulo_semana === 'Semana del 9 al 13 de noviembre de 2026', 'la línea de la semana')
ok(s.desde === '2026-11-09' && s.hasta === '2026-11-13', 'del lunes 9 al viernes 13', `${s.desde} → ${s.hasta}`)
ok(s.avisos.length === 0, 'sin avisos de lectura', s.avisos.join(' | '))

console.log('\nVista rápida')
ok(s.sesiones.length === 25, 'cinco franjas por cinco días = 25 sesiones', String(s.sesiones.length))
const en = (fecha: string, franja: string) => s.sesiones.find(x => x.fecha === fecha && x.franja === franja)!
const lun1 = en('2026-11-09', '1ª'), lun2 = en('2026-11-09', '2ª')
ok(lun1.hora_inicio === '9:00' && lun1.hora_fin === '9:50', 'la 1ª va de 9:00 a 9:50')
ok(lun1.area === 'Lengua Castellana' && lun1.unidad === 'UD3', 'lunes 1ª: Lengua Castellana, UD3')
ok(lun1.titulo === 'Glosario: género, número y acepciones', 'cada franja conserva su título de la tabla', lun1.titulo)
ok(!lun1.evaluable && lun2.evaluable, 'el ■ es de la franja: la 2ª sí, la 1ª no')
ok(en('2026-11-09', '4ª').hora_inicio === '12:20', 'tras el recreo, la 4ª empieza a las 12:20')
ok(en('2026-11-10', '1ª').tipo === 'especialista' && en('2026-11-10', '1ª').area === 'Inglés', 'Inglés · Especialista')
ok(en('2026-11-13', '1ª').tipo === 'centro' && en('2026-11-13', '1ª').area === 'Magosto', 'Magosto · Actividad de centro')
ok(s.sesiones.filter(x => x.evaluable).length === 4, 'cuatro franjas evaluables (■)', String(s.sesiones.filter(x => x.evaluable).length))

console.log('\nDetalle por sesión')
ok(lun1.bloque === '9:00-10:40' && lun2.bloque === '9:00-10:40', 'las dos sesiones de Lengua del lunes son un bloque')
ok(lun1.objetivo.startsWith('Completar en equipo') && lun2.objetivo === lun1.objetivo, 'el objetivo del bloque va a las dos franjas')
ok(lun1.unidad_titulo === 'El poder de las palabras', 'título de la unidad', String(lun1.unidad_titulo))
ok(lun1.secuencia.map(f => `${f.fase}:${f.minutos}`).join(' ') === 'Inicio:15 Desarrollo:75 Cierre:10', 'secuencia en castellano con minutos',
  lun1.secuencia.map(f => `${f.fase}:${f.minutos}`).join(' '))
const cn = en('2026-11-09', '4ª')
ok(cn.secuencia.map(f => f.fase).join(' ') === 'Inicio Desenvolvemento Peche', 'secuencia en gallego', cn.secuencia.map(f => f.fase).join(' '))
ok(cn.area === 'Ciencias da Natureza' && cn.unidad_titulo === 'Os alimentos', 'Ciencias da Natureza, UD2 Os alimentos')
ok(lun1.recursos.startsWith('Plantilla del glosario'), 'recursos')
ok(lun1.criterios.join(',') === 'CA6.5,CA6.6,CA6.7' && lun1.sigla_criterios === 'LCL', 'Anclaje: LCL CA6.5, CA6.6 y CA6.7')
ok(cn.criterios.join(',') === 'CA1.1,CA1.4,CA2.2' && cn.sigla_criterios === 'CN', 'Anclaxe en gallego: CN CA1.1, CA1.4 e CA2.2')
const mie3 = en('2026-11-11', '3ª')
ok(mie3.unidad === 'UD3' && mie3.bloque === null, 'una celda sin «UD3» la toma del detalle; una sesión sola no es bloque')
const proyecto = en('2026-11-12', '2ª')
ok(proyecto.unidad === null && proyecto.unidad_titulo === 'Reto: un parque inclusivo' && proyecto.criterios.length === 0,
  'el proyecto no tiene UD ni códigos: el anclaje se queda en texto', proyecto.anclaje)
ok(en('2026-11-10', '1ª').objetivo === '', 'el especialista no trae detalle')

console.log('\nNotas del día')
ok(s.notas.length === 1 && s.notas[0].fecha === '2026-11-13' && s.notas[0].texto.startsWith('Magosto'), 'la cursiva del viernes es nota del día')

console.log('\nPiezas sueltas')
ok(nombreArea('LINGUA GALEGA (dos sesiones)') === 'Lingua Galega', 'quita «(dos sesiones)» y baja las mayúsculas')
ok(nombreArea('CIENCIAS DA NATUREZA (dúas sesións)') === 'Ciencias da Natureza', '«dúas sesións» en gallego')
ok(claveArea('Ciencias da Natureza') === claveArea('ciencias-naturales'), 'Ciencias da Natureza = ciencias-naturales')
ok(claveArea('Ciencias Sociais') === claveArea('ciencias-sociales'), 'Ciencias Sociais = ciencias-sociales')
ok(claveArea('Inglés') === claveArea('lengua-extranjera'), 'Inglés = lengua-extranjera')
ok(claveArea('Lingua Galega') !== claveArea('Lengua Castellana'), 'las dos lenguas no se confunden')
ok(codigosCriterio('LCL CA6.5, CA6.6 y CE 2.1').join(',') === 'CA6.5,CA6.6,CE2.1', 'códigos con y sin espacio')
ok(codigoCurriculo('CA6.5') === 'CE6.5', 'CA del gallego → CE del currículo')

const otra = leerSemana(`# Programación semanal · 5º B
Semana do 30 de novembro ao 4 de decembro de 2026

### Xoves, 3 de decembro

**10:00-11:00 · MATEMÁTICAS**

UD4 · Fraccións · Sumar fraccións

**OBXECTIVO.** Sumar fraccións.

**AVALIACIÓN FORMATIVA.** Ficha. Anclaxe: MAT CA2.1.
`)
ok(otra.desde === '2026-11-30' && otra.hasta === '2026-12-04', 'una semana entre dos meses, en gallego', `${otra.desde} → ${otra.hasta}`)
ok(otra.sesiones.length === 1 && otra.sesiones[0].fecha === '2026-12-03' && otra.sesiones[0].franja === null,
  'sin tabla, el bloque es la sesión con su hora')
ok(otra.sesiones[0].objetivo === 'Sumar fraccións.' && otra.sesiones[0].criterios[0] === 'CA2.1', 'OBXECTIVO y AVALIACIÓN en gallego')
ok(leerSemana('hola').avisos.length > 0, 'un texto sin sesiones lo dice')

console.log('\nCasar con la clase')
const asignaturas = [
  { id: 1, nombre: 'lengua-castellana', nombre_display: 'Lengua Castellana' },
  { id: 2, nombre: 'lingua-galega', nombre_display: 'Lingua Galega' },
  { id: 3, nombre: 'matematicas', nombre_display: 'Matemáticas' },
  { id: 4, nombre: 'ciencias-naturales', nombre_display: 'Ciencias de la Naturaleza' },
  { id: 5, nombre: 'ciencias-sociales', nombre_display: 'Ciencias Sociales' },
]
const unidades = [
  { id: 11, asignatura_id: 1, nombre: 'UD3 · El poder de las palabras' },
  { id: 12, asignatura_id: 2, nombre: 'Unidade 3. Crinas ao vento' },
  { id: 13, asignatura_id: 3, nombre: 'Potencias' },
  { id: 14, asignatura_id: 4, nombre: 'UD1 · O corpo humano' },
  { id: 15, asignatura_id: 5, nombre: '2. O clima e a paisaxe' },
]
ok(casarArea('Ciencias da Natureza', asignaturas)?.id === 4, 'Ciencias da Natureza casa con Ciencias de la Naturaleza')
ok(casarArea('Inglés', asignaturas) === null, 'Inglés no casa si la clase no tiene esa área')
ok(casarUnidad('UD3', 'Crinas ao vento', unidades.filter(u => u.asignatura_id === 2))?.id === 12, 'unidad por título')
ok(casarUnidad('UD3', 'Potencias', unidades.filter(u => u.asignatura_id === 3))?.id === 13, 'unidad por título sin número')
ok(casarUnidad('UD2', 'Otro título', unidades.filter(u => u.asignatura_id === 5))?.id === 15, 'unidad por número («2. …»)')
ok(casarUnidad('UD2', 'Os alimentos', unidades.filter(u => u.asignatura_id === 4)) === null, 'UD2 no casa con la UD1')

const criterios = new Map<number, string[] | null>([
  [1, ['CE6.5', 'CE6.6', 'CE6.2']],   // falta CE6.7
  [2, null],                          // sin conexión con el currículo
  [3, ['CE1.2', 'CE1.3', 'CE1.5', 'CE4.3', 'CE6.5']],
  [4, ['CE1.1', 'CE1.4', 'CE2.2']],
  [5, ['CE1.4', 'CE2.1', 'CE2.2']],
])
const v = prepararVolcado(s, { asignaturas, unidades, criterios })
ok(v.sesiones.length === 25, 'todas las sesiones se preparan, casen o no')
const p1 = v.sesiones.find(x => x.fecha === '2026-11-09' && x.franja === '1ª')!
ok(p1.asignatura_id === 1 && p1.unidad_id === 11, 'Lengua del lunes enlaza área y unidad')
ok(criteriosDe(p1).map(c => c.criterio_id).join(',') === 'CE6.5,CE6.6,', 'CA6.7 no casa y se guarda igual', p1.criterios_json!)
ok(secuenciaDe(p1).length === 3, 'la secuencia se guarda')
ok(v.areasSinCasar.map(a => a.area).sort().join(',') === 'Educación Física,Inglés,Música,Proyecto Competencial',
  'no casan Inglés, Música, Educación Física y el proyecto (el Magosto es de centro)', v.areasSinCasar.map(a => a.area).join(','))
ok(v.areasSinCasar.find(a => a.area === 'Inglés')?.especialista === true, 'se dice que Inglés es de especialista')
ok(v.unidadesSinCasar.length === 1 && v.unidadesSinCasar[0].unidad === 'UD2 · Os alimentos', 'no casa la UD2 de Natureza',
  JSON.stringify(v.unidadesSinCasar))
ok(v.criteriosSinCasar.map(c => c.codigo).join(',') === 'CA6.7', 'solo CA6.7 no está en el currículo', JSON.stringify(v.criteriosSinCasar))
ok(v.criteriosSinComprobar.join(',') === 'Lingua Galega', 'Lingua Galega sin currículo: sus criterios quedan sin comprobar')
ok(v.sesiones.every(x => x.origen === 'volcado'), 'todo lo volcado lleva su origen')
const sinNatureza = prepararVolcado(s, { asignaturas: asignaturas.filter(a => a.id !== 4), unidades, criterios })
ok(!sinNatureza.criteriosSinCasar.some(c => c.area === 'Ciencias da Natureza'),
  'los criterios de un área que la clase no tiene no se acusan uno a uno', JSON.stringify(sinNatureza.criteriosSinCasar))

console.log('\nExportar')
ok(tituloSemana('2026-11-30', '2026-12-04') === 'Semana del 30 de noviembre al 4 de diciembre de 2026', 'título entre dos meses')
const guardadas: SesionPlan[] = v.sesiones.map((x, i) => ({ ...x, id: i + 1, grupo_id: 1 }))
const vuelta = leerSemana(semanaAMarkdown('6º A de Primaria', '2026-11-09', '2026-11-13', guardadas,
  [{ id: 1, grupo_id: 1, fecha: '2026-11-13', tipo: 'nota', titulo: s.notas[0].texto }]))
const firma = (x: { fecha: string; franja: string | null; hora_inicio: string; area: string; unidad: string | null; titulo: string; evaluable: boolean; tipo: string; criterios: string[]; objetivo: string }) =>
  [x.fecha, x.franja, x.hora_inicio, x.area, x.unidad, x.titulo, x.evaluable, x.tipo, x.criterios.join(','), x.objetivo].join('|')
const distintas = s.sesiones.filter((x, i) => firma(x) !== firma(vuelta.sesiones[i] as any))
ok(vuelta.sesiones.length === 25 && distintas.length === 0, 'el Markdown exportado se vuelve a leer igual',
  distintas.slice(0, 2).map(firma).join(' ‖ '))
ok(vuelta.notas.length === 1 && vuelta.clase === '6º A de Primaria', 'con la nota del día y la clase')
const html = semanaAHtml('6º A', '2026-11-09', '2026-11-13', guardadas)
ok(html.includes('Lengua Castellana') && html.includes('■') && !html.includes('undefined'), 'la lámina para imprimir')

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien')
process.exit(fallos ? 1 : 0)
