/**
 * Prueba escrita con preguntas: cálculo de la nota e importación desde fichero.
 *
 * Lo que se vigila: que cada tipo de examen puntúe como dice (puntos, test con
 * penalización, niveles), que el reparto por criterios dé a cada uno la nota
 * de SUS preguntas, que un criterio que la programación no asigna al
 * instrumento no reciba nota, y que el examen que se exporta se vuelva a leer
 * igual en los tres formatos.
 */
import {
  notaDePrueba, normalizarPrueba, puntosTotales, criteriosSinDestino, preguntasIguales,
  idDePreguntaNueva, ACIERTO, FALLO, EN_BLANCO, type PruebaDef,
} from '../frontend/src/db/prueba'
import {
  importarPrueba, pruebaDeFilas, pruebaDeJson, pruebaAXlsx, pruebaAMarkdown, pruebaAJson, PRUEBA_EJEMPLO,
} from '../frontend/src/ia/pruebaImportar'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const bytes = (texto: string) => new TextEncoder().encode(texto).buffer as ArrayBuffer
const falla = async (fn: () => unknown): Promise<string> => {
  try { await fn(); return '' } catch (e: any) { return e.message || 'error' }
}

console.log('\n1. Puntos por pregunta')
{
  const d = normalizarPrueba({ titulo: 'T', tipo: 'puntos', reparto: 'unica', preguntas: [
    { id: 'p1', enunciado: '', max: 2 }, { id: 'p2', enunciado: '', max: 3 }, { id: 'p3', enunciado: '', max: 5 } ] })
  ok(puntosTotales(d) === 10, 'el examen suma 10')
  const r = notaDePrueba(d, { p1: 2, p2: 1.5, p3: 3.25 }, ['CE1'])
  ok(r.nota === 6.75 && r.obtenido === 6.75, 'la nota es la suma sobre el total, con dos decimales', String(r.nota))
  ok(r.anotadas === 3 && r.total === 3, 'cuenta las preguntas anotadas')
  ok(notaDePrueba(d, {}, ['CE1']).nota === null, 'sin ninguna pregunta anotada no hay nota')
  const medio = notaDePrueba(d, { p1: 2 }, ['CE1'])
  ok(medio.nota === 2 && medio.anotadas === 1, 'a medio corregir, lo que falta cuenta cero y se dice cuántas van', `${medio.nota} · ${medio.anotadas}/3`)
  ok(notaDePrueba(d, { p1: 9 }, ['CE1']).obtenido === 2, 'más puntos de los que vale la pregunta se quedan en su máximo')
  const sobre20 = normalizarPrueba({ ...d, preguntas: d.preguntas.map(p => ({ ...p, max: p.max * 2 })) })
  ok(notaDePrueba(sobre20, { p1: 4, p2: 3, p3: 6.5 }, ['CE1']).nota === 6.75, 'un examen sobre 20 da la misma nota sobre 10')
  ok(r.porCriterio['CE1'] === 6.75, 'nota única: el criterio recibe la del examen')
}

console.log('\n2. Test con penalización')
{
  const d = normalizarPrueba({ titulo: 'T', tipo: 'test', reparto: 'unica', penalizacion: 0.25, preguntas: preguntasIguales(10, 10) })
  const resp = (a: number, f: number) => Object.fromEntries(d.preguntas.map((p, i) => [p.id, i < a ? ACIERTO : i < a + f ? FALLO : EN_BLANCO]))
  ok(notaDePrueba(d, resp(10, 0), ['C']).nota === 10, 'todo aciertos: 10')
  ok(notaDePrueba(d, resp(6, 4), ['C']).nota === 5, '6 aciertos y 4 fallos a −0,25: 5', String(notaDePrueba(d, resp(6, 4), ['C']).nota))
  ok(notaDePrueba(d, resp(6, 0), ['C']).nota === 6, 'en blanco ni suma ni resta')
  ok(notaDePrueba(d, resp(0, 10), ['C']).nota === 0, 'la nota no baja de cero')
  const sin = normalizarPrueba({ ...d, penalizacion: 0 })
  ok(notaDePrueba(sin, resp(6, 4), ['C']).nota === 6, 'sin penalización, el fallo vale cero')
}

console.log('\n3. Preguntas por niveles')
{
  const d = normalizarPrueba({ titulo: 'T', tipo: 'niveles', reparto: 'unica',
    escala: [{ nombre: 'Correcta', valor: 2 }, { nombre: 'Parcial', valor: 1 }, { nombre: 'En blanco', valor: 0 }],
    preguntas: [{ id: 'p1', enunciado: '', max: 1 }, { id: 'p2', enunciado: '', max: 1 }, { id: 'p3', enunciado: '', max: 2 }] })
  ok(notaDePrueba(d, { p1: 2, p2: 2, p3: 2 }, ['C']).nota === 10, 'todas correctas: 10')
  ok(notaDePrueba(d, { p1: 2, p2: 1, p3: 0 }, ['C']).nota === 3.75, 'cada pregunta pesa lo que vale', String(notaDePrueba(d, { p1: 2, p2: 1, p3: 0 }, ['C']).nota))
  ok(normalizarPrueba({ tipo: 'niveles', preguntas: [] }).escala!.length === 3, 'sin escala, trae una por defecto')
}

console.log('\n4. Reparto por criterios')
{
  const d = PRUEBA_EJEMPLO   // p1 (2) y p2 (3) → CE1.1 · p3 (3) → CE1.2 · p4 (2) → sin criterio
  const r = notaDePrueba(d, { p1: 2, p2: 3, p3: 0, p4: 1 }, ['CE1.1', 'CE1.2', 'CE2.1'])
  ok(r.nota === 6, 'la nota del examen entero', String(r.nota))
  ok(r.porCriterio['CE1.1'] === 8.57, 'CE1.1: sus dos preguntas más la común (6 de 7)', String(r.porCriterio['CE1.1']))
  ok(r.porCriterio['CE1.2'] === 2, 'CE1.2: su pregunta más la común (1 de 5)', String(r.porCriterio['CE1.2']))
  ok(!('CE2.1' in r.porCriterio), 'un criterio que ninguna pregunta nombra no recibe nota, aunque haya preguntas comunes')
  const sinNombrar = normalizarPrueba({ ...d, preguntas: d.preguntas.map(p => ({ ...p, criterio_id: null })) })
  const rs = notaDePrueba(sinNombrar, { p1: 2, p2: 3, p3: 0, p4: 1 }, ['CE1.1', 'CE2.1'])
  ok(rs.porCriterio['CE1.1'] === 6 && rs.porCriterio['CE2.1'] === 6,
     'si ninguna pregunta nombra criterio, el examen da nota única a todos')
  ok(criteriosSinDestino(d, ['CE1.1']).join() === 'CE1.2', 'avisa de los criterios que la programación no asigna al instrumento')
  ok(criteriosSinDestino({ ...d, reparto: 'unica' }, ['CE1.1']).length === 0, 'con nota única no hay nada que avisar')
}

console.log('\n5. Normalizar')
{
  const d = normalizarPrueba({ preguntas: [{ id: 'p2', enunciado: 'a', max: 0 }, { id: 'p2', enunciado: 'b', max: -3 }, { enunciado: 'c', max: 1.005 } as any] })
  ok(new Set(d.preguntas.map(p => p.id)).size === 3, 'ids repetidos o ausentes se sustituyen', d.preguntas.map(p => p.id).join())
  ok(d.preguntas[0].id === 'p2', 'sin quitarle el suyo a la primera')
  ok(d.preguntas.every(p => p.max > 0), 'ninguna pregunta vale cero o menos')
  ok(idDePreguntaNueva([{ id: 'p1', enunciado: '', max: 1 }, { id: 'p7', enunciado: '', max: 1 }]) === 'p8',
     'una pregunta nueva no reutiliza el id de una borrada')
  ok(d.tipo === 'puntos' && d.reparto === 'unica' && d.penalizacion === undefined, 'valores por defecto')
}

console.log('\n6. Importar desde tabla')
{
  const { prueba: p, avisos } = pruebaDeFilas([
    ['Examen de relieve'],
    ['Tipo', 'Test'],
    ['Penalización', '1/3'],
    [],
    ['Pregunta', 'Puntos', 'Criterio'],
    ['1. Ríos', '1', 'CE1.1'],
    ['2. Montes', '', 'CE1.2'],
    ['3. Clima', '2', ''],
    ['TOTAL', '4', ''],
  ], 't')
  ok(p.titulo === 'Examen de relieve' && p.tipo === 'test', 'título y tipo de las filas de arriba')
  ok(Math.abs(p.penalizacion! - 1 / 3) < 1e-9, 'la penalización admite fracciones')
  ok(p.preguntas.length === 3, 'la fila de totales no es una pregunta', String(p.preguntas.length))
  ok(p.reparto === 'criterios', 'con criterios en las preguntas, el reparto es por criterios')
  ok(p.preguntas[1].max === 1 && avisos.some(a => a.includes('no traían puntos')), 'pregunta sin puntos: vale 1 y se avisa')
  ok(avisos.some(a => a.includes('sin criterio')), 'avisa de la pregunta que cuenta para todos')
  ok((await falla(() => pruebaDeFilas([['Indicador', 'Excelente (4)'], ['a', 'b']], 't'))).includes('rúbrica'),
     'una rúbrica no cuela como examen: lo dice')
  ok((await falla(() => pruebaDeFilas([['Pregunta', 'Puntos']], 't'))).includes('no trae preguntas'), 'cabecera sin filas')
}

console.log('\n7. Los tres formatos dan el mismo examen')
{
  const canon = (d: PruebaDef) => JSON.stringify(normalizarPrueba(d))
  const niveles = normalizarPrueba({ titulo: 'Por niveles', tipo: 'niveles', reparto: 'unica',
    escala: [{ nombre: 'Bien', valor: 3 }, { nombre: 'Regular', valor: 1.5 }, { nombre: 'Mal', valor: 0 }],
    preguntas: [{ id: 'p1', enunciado: 'Una', max: 4 }, { id: 'p2', enunciado: 'Otra', max: 6 }] })
  const test = normalizarPrueba({ titulo: 'Tipo test', tipo: 'test', reparto: 'unica', penalizacion: 0.25,
    preguntas: [{ id: 'p1', enunciado: 'Una', max: 1 }, { id: 'p2', enunciado: 'Otra', max: 1 }] })
  for (const d of [PRUEBA_EJEMPLO, niveles, test]) {
    const x = (await importarPrueba('e.xlsx', pruebaAXlsx(d).buffer)).prueba
    const m = (await importarPrueba('e.md', bytes(pruebaAMarkdown(d)))).prueba
    const j = (await importarPrueba('e.json', bytes(pruebaAJson(d)))).prueba
    ok(canon(x) === canon(d), `«${d.titulo}» por .xlsx`, canon(x) === canon(d) ? '' : canon(x))
    ok(canon(m) === canon(d), `«${d.titulo}» por .md`, canon(m) === canon(d) ? '' : canon(m))
    ok(canon(j) === canon(d), `«${d.titulo}» por .json`)
  }
  ok((await falla(() => pruebaDeJson('{"formato":"edumind-rubrica","niveles":[],"indicadores":[]}', 't'))).includes('rúbrica'),
     'el JSON de una rúbrica se rechaza diciendo qué es')
  ok((await falla(() => importarPrueba('x.txt', bytes('nada')))).includes('No se reconoce'), 'texto sin tabla')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
