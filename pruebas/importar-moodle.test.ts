/**
 * Leer el CSV del libro de calificaciones de Edixgal (Moodle). Lo que importa:
 * que el CSV se parta bien (BOM, comillas, comas dentro de celdas), que las
 * columnas de datos no se confundan con notas, que el casado por nombre no
 * adivine y que la escala 0-100 no cuele como 0-10.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsearCSV, descomponerCabecera, leerCSVMoodle, notasDeColumna, sugerirInstrumento } from '../frontend/src/utils/importarMoodle'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const clase = [
  { id: 1, apellidos: 'Abad Ríos', nombre: 'Ana' },
  { id: 2, apellidos: 'Bello Souto', nombre: 'Bruno' },
  { id: 3, apellidos: 'Casal Vidal', nombre: 'Carla' },
  { id: 4, apellidos: 'Díaz Lema', nombre: 'Darío' },
]
const csv = readFileSync(join(process.cwd(), 'pruebas/fixtures/edixgal_calificacions.csv'), 'utf8')

console.log('\n1. Partir el CSV')
{
  const r = parsearCSV(csv)
  ok(r.separador === ',', 'detecta la coma como separador')
  ok(r.filas[0][0] === 'Nome', 'el BOM no se cuela en la primera cabecera', JSON.stringify(r.filas[0][0]))
  ok(r.filas[0][8] === 'Tarefa:Caderno, tema 1 (Porcentaxe)', 'una coma entre comillas no parte la celda', r.filas[0][8])
  ok(r.filas.length === 5 && r.filas[1].length === 12, 'cinco filas de doce celdas')
  const pc = parsearCSV('a;b\r\n"x;""y""";2\r\n')
  ok(pc.separador === ';' && pc.filas[1][0] === 'x;"y"' && pc.filas[1][1] === '2', 'punto y coma, CRLF y comillas dobladas')
  const tab = parsearCSV('a\tb\n1\t2')
  ok(tab.separador === '\t' && tab.filas[1][1] === '2', 'tabulador')
}

console.log('\n2. Cabeceras de ítem')
{
  const c = descomponerCabecera('Tarefa:Exame UD1 (Real)')
  ok(c.actividad === 'Tarefa' && c.titulo === 'Exame UD1' && c.formato === 'Real', 'actividad, título y formato', JSON.stringify(c))
  const s = descomponerCabecera('Exposición oral')
  ok(s.actividad === null && s.titulo === 'Exposición oral' && s.formato === null, 'sin actividad ni formato')
}

console.log('\n3. Columnas: notas sí, datos no')
{
  const r = leerCSVMoodle(csv, clase)
  ok(r.avisos.length === 0, 'sin avisos', r.avisos.join(' | '))
  ok(r.columnas.map(c => c.titulo).join('|') === 'Exame UD1|Proba tema 2|Caderno, tema 1|Exposición oral', 'solo los ítems calificables', r.columnas.map(c => c.titulo).join('|'))
  const [ud1, tema2, caderno, oral] = r.columnas
  ok(!ud1.escala100 && tema2.escala100 && caderno.escala100, 'escala 0-100 por columna: el examen va en 0-10, la proba y el caderno en 0-100')
  ok(oral.sinNumeros && oral.conNota === 0, 'una columna de letras no tiene números')
  ok(ud1.conNota === 4 && tema2.conNota === 3, 'cuenta las casillas con nota (el guion es sin nota)')
}

console.log('\n4. Alumnos: por nombre, sin adivinar')
{
  const r = leerCSVMoodle(csv, clase)
  const de = (apellidos: string) => r.filas.find(f => f.apellidos === apellidos)!
  ok(de('Abad Ríos').alumno?.id === 1 && de('Bello Souto').alumno?.id === 2, 'nombre y apellidos en columnas separadas casan')
  ok(de('Casal Vidal').alumno?.id === 3, 'un segundo nombre en Moodle («Carla María») no impide casar con «Carla»')
  ok(de('Pérez Pérez').alumno === null && /Ningún alumno/.test(de('Pérez Pérez').aviso ?? ''), 'quien no está en la clase se señala')
  ok(r.sinFila.length === 1 && r.sinFila[0].id === 4, 'y quien no está en el CSV también')
}

console.log('\n5. Notas en 0-10')
{
  const r = leerCSVMoodle(csv, clase)
  const [ud1, tema2, caderno, oral] = r.columnas
  const n = (col: typeof ud1, id: number) => notasDeColumna(r, col).find(x => x.alumno.id === id)?.valor
  ok(n(ud1, 1) === 7.5 && n(ud1, 3) === 5, 'el examen tal cual')
  ok(n(tema2, 1) === 8.5 && n(tema2, 3) === 4 && n(tema2, 2) === undefined, 'la proba dividida entre 10; el guion no da nota')
  ok(n(caderno, 1) === 9 && n(caderno, 2) === 6.5, 'el porcentaje («90,00 %») también')
  ok(notasDeColumna(r, oral).length === 0, 'las letras no dan nota')
  ok(notasDeColumna(r, ud1).every(x => x.alumno.id !== 99) && notasDeColumna(r, ud1).length === 3, 'solo los alumnos casados reciben nota (Pepe no)')
}

console.log('\n6. Sugerir instrumento por nombre')
{
  const r = leerCSVMoodle(csv, clase)
  const instrumentos = [{ nombre: 'Examen UD1' }, { nombre: 'Exame UD1' }, { nombre: 'Caderno' }, { nombre: 'Exposición oral' }]
  ok(sugerirInstrumento(r.columnas[0], instrumentos)?.nombre === 'Exame UD1', 'coincidencia exacta')
  ok(sugerirInstrumento(r.columnas[2], instrumentos)?.nombre === 'Caderno', 'el título contiene el nombre del instrumento')
  ok(sugerirInstrumento(r.columnas[1], instrumentos) === null, 'sin pista, nada')
  ok(sugerirInstrumento(r.columnas[0], [{ nombre: 'UD1' }, { nombre: 'Exame' }]) === null, 'dos candidatos parciales: ninguno, que elija el docente')
}

console.log('\n7. Informe de cuestionario: máximo en la cabecera, tabuladores y «Media xeral»')
{
  const tsv = readFileSync(join(process.cwd(), 'pruebas/fixtures/edixgal_cuestionario.tsv'), 'utf8')
  const c = descomponerCabecera('Cualificación/10,00')
  ok(c.titulo === 'Cualificación' && c.maximo === 10 && !c.pregunta, 'la nota lleva el máximo en la cabecera', JSON.stringify(c))
  const p = descomponerCabecera('P. 1 /0,24')
  ok(p.titulo === 'P. 1' && p.maximo === 0.24 && p.pregunta, 'cada pregunta también, y se marca como pregunta', JSON.stringify(p))
  const r = leerCSVMoodle(tsv, clase)
  ok(r.separador === '\t' && r.avisos.length === 0, 'tabuladores y sin avisos', r.avisos.join(' | '))
  ok(r.columnas.length === 42 && r.columnas[0].titulo === 'Cualificación', 'la nota y las 41 preguntas; estado y tiempos no son notas', r.columnas.map(c => c.titulo).slice(0, 3).join('|'))
  ok(r.columnas.filter(c => c.pregunta).length === 41, 'las 41 preguntas se reconocen')
  ok(r.filas.length === 4 && !r.filas.some(f => /media xeral/i.test(f.nombre)), 'la fila «Media xeral» no es nadie y no cuenta')
  const nota = r.columnas[0]
  ok(!nota.escala100, 'con máximo declarado no se adivina la escala')
  const n = (id: number) => notasDeColumna(r, nota).find(x => x.alumno.id === id)?.valor
  ok(n(1) === 7.5 && n(2) === 9 && n(3) === undefined, 'la nota sobre 10 tal cual; «-» de quien no acabó no da nota')
  const p1 = notasDeColumna(r, r.columnas[1])
  ok(p1.find(x => x.alumno.id === 1)?.valor === 10, 'una pregunta acertada (0,24 de 0,24) vale 10')
  ok(notasDeColumna(r, r.columnas[41]).find(x => x.alumno.id === 1)?.valor === 0, 'y una fallada, 0')
  const sobre20 = leerCSVMoodle('Apelidos\tNome\tCualificación/20,00\nAbad Ríos\tAna\t15,00', clase)
  ok(notasDeColumna(sobre20, sobre20.columnas[0])[0]?.valor === 7.5, 'un cuestionario sobre 20 se escala a 10')
}

console.log('\n8. Informe de respuestas: el texto de cada respuesta no es una nota')
{
  const cab = 'Apelidos\tNome\tCentro educativo\tEstado\tArrancado o\tCompletado\tTempo levado\tCualificación/10,00\tResposta 1\tResposta 2\tResposta correcta 1\tResposta correcta 2'
  const r = leerCSVMoodle(cab + '\nAbad Ríos\tAna\tCEIP\tRematado\t-\t-\t-\t7,50\tO Miño\t3\tO Miño\t4', clase)
  ok(r.columnas.length === 5 && r.columnas[0].titulo === 'Cualificación' && !r.columnas[0].pregunta, 'la nota queda a la vista')
  ok(r.columnas.slice(1).every(c => c.pregunta), '«Resposta N» y «Resposta correcta N» son columnas por pregunta, plegadas')
  ok(notasDeColumna(r, r.columnas[0])[0]?.valor === 7.5, 'y la nota se lee igual')
}

console.log('\n9. Ficheros que no son lo esperado')
{
  const r = leerCSVMoodle('Alumno;Nota\nAbad;7', clase)
  ok(r.columnas.length === 0 && /nombre y apellidos/.test(r.avisos[0] ?? ''), 'sin columnas de nombre y apellidos se dice y no se lee nada')
  const v = leerCSVMoodle('', clase)
  ok(v.filas.length === 0 && v.avisos.length === 1, 'vacío')
  const sinNotas = leerCSVMoodle('Nombre,Apellido(s),Número de ID\nAna,Abad Ríos,1', clase)
  ok(sinNotas.columnas.length === 0 && /ninguna columna de notas/.test(sinNotas.avisos[0] ?? '') && sinNotas.filas[0].alumno?.id === 1, 'cabeceras en castellano, sin ítems: se avisa pero los alumnos se leen')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos ? 1 : 0)
