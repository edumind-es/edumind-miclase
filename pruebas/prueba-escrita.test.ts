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
  notaDePrueba, normalizarPrueba, puntosTotales, unidadesDelExamen, criteriosSinDestino, preguntasIguales,
  idDePreguntaNueva, ACIERTO, FALLO, EN_BLANCO, respuestaDeMarca, tieneClave, preguntasSinClave, escalonesDePregunta, reasignarCriterio, type PruebaDef,
} from '../frontend/src/db/prueba'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  importarPrueba, pruebaDeFilas, pruebaDeJson, pruebaAXlsx, pruebaAMarkdown, pruebaAJson, PRUEBA_EJEMPLO,
  pruebaDeExamenMarkdown, pareceExamenMarkdown, examenAMarkdown, letraAIndice, pruebaDeTexto, pareceCsv,
} from '../frontend/src/ia/pruebaImportar'
import { generarPromptTest, generarPromptPlanilla } from '../frontend/src/ia/pruebaPrompt'

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

console.log('\n8. Test con opciones y correcta: el examen escrito como examen')
{
  const md = `# Os ríos de Galicia

1. ¿Onde nace o río Miño?
   Criterio: CE1.2
   a) Na serra de Meira *
   b) Nos Ancares
   c) No Courel
   d) Na Terra Chá

2. **¿Cal é o afluente máis longo do Miño?**
   - a) O Avia
   - b) **O Sil**
   - c) O Arnoia
   Puntos: 2

3. ¿En que provincia desemboca?
   a) Lugo
   b) Ourense
   c) [x] Pontevedra
   d) A Coruña
`
  ok(pareceExamenMarkdown(md), 'se reconoce como examen escrito, no como tabla')
  const { prueba: t, avisos } = pruebaDeExamenMarkdown(md, 'x')
  ok(t.titulo === 'Os ríos de Galicia' && t.tipo === 'test' && t.preguntas.length === 3, 'título, tipo test y tres preguntas', `${t.titulo} · ${t.tipo} · ${t.preguntas.length}`)
  ok(t.preguntas[0].opciones?.length === 4 && t.preguntas[0].correcta === 0, 'asterisco al final: la a) es la correcta', JSON.stringify(t.preguntas[0]))
  ok(t.preguntas[0].criterio_id === 'CE1.2' && t.reparto === 'criterios', 'el criterio bajo la pregunta cuenta y el reparto pasa a ser por criterios')
  ok(t.preguntas[1].correcta === 1 && t.preguntas[1].opciones?.[1] === 'O Sil' && t.preguntas[1].enunciado === '¿Cal é o afluente máis longo do Miño?', 'negrita en la opción: correcta, y sin asteriscos en el texto', JSON.stringify(t.preguntas[1]))
  ok(t.preguntas[1].max === 2, '«Puntos: 2» bajo la pregunta')
  ok(t.preguntas[2].correcta === 2 && t.preguntas[2].opciones?.[2] === 'Pontevedra', '«[x]» marca la correcta')
  ok(avisos.length === 0, 'sin avisos', avisos.join(' | '))
  ok(tieneClave(t) && preguntasSinClave(t).length === 0, 'el test tiene clave completa')

  const conClave = `1. Uno\n a) x\n b) y\n2. Dos\n a) p\n b) q\n c) r\n\nRespuestas: 1-b, 2-c`
  const t2 = pruebaDeExamenMarkdown(conClave, 'Clave').prueba
  ok(t2.preguntas[0].correcta === 1 && t2.preguntas[1].correcta === 2, 'la línea «Respuestas:» del final pone las correctas')
  const sinCorrecta = pruebaDeExamenMarkdown('1. Uno\n a) x\n b) y', 'z')
  ok(sinCorrecta.prueba.preguntas[0].correcta == null && sinCorrecta.avisos.some(a => a.includes('sin marcar la correcta')), 'sin correcta se avisa, no se inventa')
  ok(!tieneClave(sinCorrecta.prueba) && preguntasSinClave(sinCorrecta.prueba).length === 1, 'y el test no tiene clave')
  ok((await falla(() => pruebaDeExamenMarkdown('1. Uno\n2. Dos', 'z'))).includes('opciones'), 'preguntas sin opciones: lo dice')

  ok(respuestaDeMarca(t.preguntas[0], 0) === ACIERTO && respuestaDeMarca(t.preguntas[0], 2) === FALLO && respuestaDeMarca(t.preguntas[0], null) === EN_BLANCO,
     'una marca se traduce a acierto, fallo o en blanco contra la correcta')
  ok((await falla(() => respuestaDeMarca(sinCorrecta.prueba.preguntas[0], 0))).includes('correcta'), 'sin correcta no se puede corregir una marca')
  ok(letraAIndice('b)') === 1 && letraAIndice('C') === 2 && letraAIndice('3') === 2 && letraAIndice('z') === null, 'letras y números a índice')

  // Los tres formatos conservan opciones y correcta; el .md del alumnado se vuelve a leer sin la clave.
  const canon = (d: PruebaDef) => JSON.stringify(normalizarPrueba(d))
  const x = (await importarPrueba('e.xlsx', pruebaAXlsx(t).buffer)).prueba
  const m = (await importarPrueba('e.md', bytes(pruebaAMarkdown(t)))).prueba
  const j = (await importarPrueba('e.json', bytes(pruebaAJson(t)))).prueba
  ok(canon(x) === canon(t), 'opciones y correcta por .xlsx', canon(x) === canon(t) ? '' : canon(x))
  ok(canon(m) === canon(t), 'opciones y correcta por .md (tabla)', canon(m) === canon(t) ? '' : canon(m))
  ok(canon(j) === canon(t), 'opciones y correcta por .json')
  const alumnado = examenAMarkdown(t)
  ok(!alumnado.includes('*') && !alumnado.includes('Respuestas'), 'el examen del alumnado no lleva la clave')
  const releido = (await importarPrueba('alumnado.md', bytes(alumnado))).prueba
  ok(releido.preguntas.every(p => p.correcta == null) && releido.preguntas[2].opciones?.[3] === 'A Coruña', 'y se vuelve a leer: opciones sí, correcta no')
  const completo = (await importarPrueba('docente.md', bytes(examenAMarkdown(t, { conClave: true })))).prueba
  ok(canon(completo) === canon(t), 'con clave, el examen escrito se lee igual que se exportó', canon(completo) === canon(t) ? '' : canon(completo))

  // Un examen de puntos no arrastra opciones.
  const puntos = normalizarPrueba({ ...t, tipo: 'puntos' })
  ok(puntos.preguntas.every(p => !p.opciones && p.correcta == null), 'cambiar a puntos descarta opciones y correcta')

  const prompt = generarPromptTest({ asignatura: 'Ciencias Sociais', nivel: '6º Primaria', contexto: 'Os ríos', nPreguntas: 5, nOpciones: 4, criterios: [{ id: 'CE1.2', descripcion: 'Localizar' }] })
  ok(prompt.includes('5 preguntas') && prompt.includes('CE1.2') && prompt.includes('a) [opción]') && prompt.includes('*'), 'el prompt pide el formato que se sabe leer')
}


console.log('\n9. Planilla de corrección: clave y reparto de puntos por pregunta')
{
  // La planilla real de Luis (Ciencias Sociais, UD1) no trae columna «Pregunta»:
  // N.º, clave, «Puntuación e indicadores» y «Máx. Puntos», y una fila de total.
  const planilla = `# PLANILLA DE CORRECCIÓN · Ciencias Sociais · UD1

| N.º | Clave | Puntuación e indicadores | Máx. Puntos |
|---|---|---|---|
| 1 | 1-d · 2-e · 3-a · 4-c · 5-b | 0,2 cada acerto. | 1 |
| 2 | 1) a · 2) c · 3) b · 4) a · 5) b | 0,2 cada acerto. | 1 |
| 3 | a) globo: esfera · b) paralelos; latitude · c) orientarnos · d) meridianos; lonxitude | Cada apartado: completo 0,25 · parcial 0,1 · incorrecto 0. | 1 |
| 6 | a) A 40° N 80° O · b) Ecuador e Greenwich · c) F, G, H | a) 0,2 cada punto · b) 0,2 cada liña · c) 0,2 cada punto. | 2 |
| Total da proba (/10) | | | |
`
  const { prueba: pl, avisos } = pruebaDeTexto(planilla, 'x')
  ok(pl.titulo === 'PLANILLA DE CORRECCIÓN · Ciencias Sociais · UD1', 'el título sale de la cabecera', pl.titulo)
  ok(pl.preguntas.length === 4, 'una pregunta por fila, sin la de total', String(pl.preguntas.length))
  ok(pl.tipo === 'puntos' && puntosTotales(pl) === 5, 'puntos por pregunta: «Máx.» son los puntos, no «Puntuación e indicadores»', `${pl.tipo} · ${puntosTotales(pl)}`)
  ok(pl.preguntas[0].clave === '1-d · 2-e · 3-a · 4-c · 5-b', 'la clave es la respuesta esperada', pl.preguntas[0].clave)
  ok(pl.preguntas[0].correccion === '0,2 cada acerto.', 'y la corrección, cómo se reparten los puntos', pl.preguntas[0].correccion)
  ok(pl.preguntas[3].max === 2 && pl.preguntas[3].correccion?.startsWith('a) 0,2'), 'la pregunta 6 vale 2 con su reparto', `${pl.preguntas[3].max}`)
  ok(pl.preguntas.every(p => p.enunciado === '' && p.correcta == null && !p.opciones), 'sin enunciado ni opciones: la clave en texto no es la letra de un test')
  ok(avisos.length === 0, 'sin avisos', avisos.join(' '))

  // La tabla que devuelve la IA con el prompt de planilla: con «Pregunta» y las dos columnas.
  const tablaIA = `# Exame UD1

| Pregunta | Puntos | Criterio | Aspecto | Clave | Corrección |
|---|---|---|---|---|---|
| 1. Relaciona cada termo | 1 | CE1.1 | Mapas | 1-d · 2-e · 3-a | 0,2 cada acerto |
| 2. Elementos dun mapa | 1 | CE1.2 | Mapas | Título · rosa dos ventos · lenda · escala | 0,25 cada elemento |
`
  const ia = pruebaDeTexto(tablaIA, 'x').prueba
  ok(ia.reparto === 'criterios' && ia.preguntas[1].criterio_id === 'CE1.2' && ia.preguntas[1].aspecto === 'Mapas', 'con criterio y aspecto, como siempre')
  ok(ia.preguntas[1].clave === 'Título · rosa dos ventos · lenda · escala' && ia.preguntas[1].correccion === '0,25 cada elemento', 'y la planilla de cada pregunta')

  // Ida y vuelta por los tres formatos, con la planilla dentro.
  const canon = (d: PruebaDef) => JSON.stringify(normalizarPrueba(d))
  const x = (await importarPrueba('p.xlsx', pruebaAXlsx(ia).buffer as ArrayBuffer)).prueba
  const m = (await importarPrueba('p.md', bytes(pruebaAMarkdown(ia)))).prueba
  const j = (await importarPrueba('p.json', bytes(pruebaAJson(ia)))).prueba
  ok(canon(x) === canon(ia), 'clave y corrección por .xlsx', canon(x) === canon(ia) ? '' : canon(x))
  ok(canon(m) === canon(ia), 'clave y corrección por .md (tabla)', canon(m) === canon(ia) ? '' : canon(m))
  ok(canon(j) === canon(ia), 'clave y corrección por .json')

  // En un test con clave, «Clave: …» bajo la pregunta no se confunde con el solucionario «1-b, 2-c».
  const test = normalizarPrueba({ titulo: 'T', tipo: 'test', reparto: 'unica', preguntas: [
    { id: 'p1', enunciado: 'Capital de Galicia', max: 1, opciones: ['Vigo', 'Santiago'], correcta: 1, clave: 'Santiago, sede da Xunta', correccion: 'Só a letra' },
    { id: 'p2', enunciado: 'Río máis longo', max: 1, opciones: ['Miño', 'Sil'], correcta: 0 },
  ] })
  const escrito = examenAMarkdown(test, { conClave: true })
  ok(escrito.includes('Clave: Santiago, sede da Xunta') && escrito.includes('Corrección: Só a letra') && escrito.includes('Respuestas: 1-b, 2-a'), 'el examen escrito lleva la planilla y el solucionario')
  const releido = pruebaDeExamenMarkdown(escrito, 'x').prueba
  ok(canon(releido) === canon(test), 'y se vuelve a leer igual: la correcta sigue siendo la del solucionario', canon(releido) === canon(test) ? '' : canon(releido))
  // Y «Clave» con una letra en la tabla sigue siendo la correcta del test, como antes.
  const viejo = pruebaDeFilas([['Tipo', 'test'], ['Pregunta', 'Puntos', 'Opciones', 'Clave'], ['¿Capital?', 1, 'Vigo ; Santiago', 'B']], 'x').prueba
  ok(viejo.preguntas[0].correcta === 1 && !viejo.preguntas[0].clave, 'una letra en «Clave» es la correcta, no la planilla')

  const prompt = generarPromptPlanilla({ asignatura: 'Ciencias Sociais', nivel: '6º Primaria', examen: '1. Relaciona…\n2. Elementos…', puntosTotales: 10, criterios: [{ id: 'CE1.1', descripcion: 'Mapas' }] })
  ok(prompt.includes('1. Relaciona…') && prompt.includes('CE1.1') && prompt.includes('| Ítem | Pregunta | Criterio | Tipo | Máximo | Clave | Puntuación | Nivel 1 |') && prompt.includes('Nivel 6 | Notas |') && prompt.includes('No inventes preguntas'), 'el prompt lleva el examen del docente y pide la tabla que se sabe leer')
}

console.log('\n10. La planilla con rúbrica por pregunta (CORRECCION_PRUEBAS.md)')
{
  // El fichero real de Luis para la UD1 de Ciencias da Natureza: cabeceras en
  // gallego, «Ítem» en vez de «N.º», «Columna» con el nombre del cuaderno,
  // «Máximo» aparte de «Puntuación» (el reparto), seis niveles y notas.
  const csv = readFileSync(join(process.cwd(), 'pruebas/fixtures/planilla_clave_rubricas.csv'), 'utf8')
  ok(pareceCsv(csv), 'el CSV se reconoce como CSV')
  const { prueba: p, avisos } = pruebaDeTexto(csv, 'CN UD1')
  ok(p.tipo === 'puntos' && p.reparto === 'criterios' && avisos.length === 0, 'es un examen de puntos repartido por criterios, sin avisos', avisos.join(' / '))
  ok(p.preguntas.length === 11, 'once filas, once preguntas', String(p.preguntas.length))
  const [p1, p2, p3, p4, p51, p52, , , , , p10] = p.preguntas
  ok(p1.enunciado === 'P1 Célula animal' && p51.enunciado === 'P5.1 V/F a-d', 'el nombre sale de «Columna», sin el criterio ni el máximo', `${p1.enunciado} · ${p51.enunciado}`)
  ok(p1.max === 1 && p51.max === 0.4 && p52.max === 0.6, 'el máximo sale de «Máximo»', `${p51.max} · ${p52.max}`)
  ok(p1.criterio_id === 'CA2.1' && p52.criterio_id === 'CA2.2', 'cada pregunta lleva su criterio')
  ok((p2.clave ?? '').startsWith('A: epitelial'), 'la clave se lee aunque la cabecera diga «Resposta correcta / clave»', p2.clave ?? '')
  ok(p2.correccion === '0,25 por cada acerto.', 'la corrección es la «Puntuación» (el reparto), no las notas', p2.correccion ?? '')
  ok((p2.notas ?? '').startsWith('Admítese «sangue»'), 'las «Notas de corrección» van aparte', p2.notas ?? '')
  ok(p1.niveles?.length === 5 && p1.niveles[0].puntos === 1 && p1.niveles[1].puntos === 0.75 && p1.niveles[4].puntos === 0
    && p1.niveles[1].texto.startsWith('Tres dos catro elementos'), 'los seis «Nivel» dan los niveles de corrección, con puntos y texto', JSON.stringify(p1.niveles))
  ok(!p2.niveles, '«Non procede» no es un nivel: una pregunta cerrada no los trae')
  ok(p3.niveles?.length === 6 && p3.niveles[1].puntos === 0.8, 'una pregunta con cinco escalones de 0,2 trae seis niveles')
  ok(JSON.stringify(escalonesDePregunta(p1)) === '[1,0.75,0.5,0.25,0]', 'con niveles, los escalones son los suyos')
  ok(JSON.stringify(escalonesDePregunta(p2)) === '[1,0.75,0.5,0.25,0]', 'sin niveles, «0,25 por cada acerto» da cinco escalones')
  ok(JSON.stringify(escalonesDePregunta(p51)) === '[0.4,0.3,0.2,0.1,0]', '«0,1 por acerto» sobre 0,4 da cinco escalones')
  ok(JSON.stringify(escalonesDePregunta(p4)) === '[1,0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.1,0]', 'la cifra más pequeña del reparto manda cuando divide el máximo')
  ok(JSON.stringify(escalonesDePregunta(p10)) === '[1,0.7,0.6,0.4,0.3,0]', 'apartados con valor propio (0,3 · 0,3 · 0,4): cualquier combinación', JSON.stringify(escalonesDePregunta(p10)))
  ok(escalonesDePregunta({ id: 'x', enunciado: '', max: 1, criterio_id: null, correccion: 'según se vea' }).length === 0, 'sin cifras no hay escalones: queda la casilla')

  // El mismo examen en el .xlsx de tres hojas: la planilla va en la segunda,
  // detrás de la plantilla del cuaderno con el alumnado.
  const b = readFileSync(resolve('pruebas/fixtures/planilla_clave_rubricas.xlsx'))
  const x = await importarPrueba('CN_UD1_planilla.xlsx', b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
  ok(x.prueba.preguntas.length === 11 && x.prueba.preguntas[0].niveles?.length === 5 && x.prueba.preguntas[1].clave === p2.clave,
    'del .xlsx se lee la hoja «Clave e rúbricas», no la primera', String(x.prueba.preguntas.length))
  ok((await falla(() => importarPrueba('vacio.xlsx', b.buffer.slice(0, 4) as ArrayBuffer))).length > 0, 'un zip roto da un error, no una pantalla en blanco')

  // Niveles y notas sobreviven a los tres formatos de exportación.
  const porXlsx = await importarPrueba('x.xlsx', pruebaAXlsx(p).buffer as ArrayBuffer)
  const porMd = pruebaDeTexto(pruebaAMarkdown(p), 't')
  const porJson = pruebaDeJson(pruebaAJson(p), 't')
  for (const [nombre, r] of [['xlsx', porXlsx], ['md', porMd], ['json', porJson]] as const) {
    const q1 = r.prueba.preguntas[0], q2 = r.prueba.preguntas[1]
    ok(JSON.stringify(q1.niveles) === JSON.stringify(p1.niveles) && q2.notas === p2.notas && q2.correccion === p2.correccion && q1.max === 1 && q2.criterio_id === 'CA2.1',
      `niveles, notas y corrección vuelven iguales por ${nombre}`, JSON.stringify(q1.niveles)?.slice(0, 80))
  }
  // Y en el examen escrito como examen, con la clave.
  const md = examenAMarkdown(p, { conClave: true })
  ok(md.includes('   Nivel: 0,75 pt · Tres dos catro elementos') && md.includes('   Notas: Admítese'), 'el examen con clave lista los niveles y las notas bajo la pregunta')
  // Un nivel que vale más que la pregunta no entra; un examen que no es de puntos no lleva niveles.
  const n = normalizarPrueba({ tipo: 'puntos', preguntas: [{ id: 'a', enunciado: '', max: 1, niveles: [{ puntos: 2, texto: 'de más' }, { puntos: 0.5, texto: 'medio' }, { puntos: 1, texto: 'todo' }] }] })
  ok(JSON.stringify(n.preguntas[0].niveles?.map(v => v.puntos)) === '[1,0.5]', 'normalizar quita el nivel que se pasa y ordena de más a menos')
  const t = normalizarPrueba({ tipo: 'test', preguntas: [{ id: 'a', enunciado: '', max: 1, opciones: ['a', 'b'], niveles: [{ puntos: 1, texto: 'x' }] }] })
  ok(!t.preguntas[0].niveles, 'un test no arrastra niveles')

  // El instrumento solo evalúa CA2.1 en la UD1 (lo que trae PROENS): CA2.2 y
  // CA2.3 no pondrían nota. El docente elige adónde van, por criterio.
  ok(JSON.stringify(criteriosSinDestino(p, ['CA2.1'])) === '["CA2.2","CA2.3"]', 'se señalan los criterios del fichero que el instrumento no evalúa')
  const r1 = reasignarCriterio(p, 'CA2.2', 'CA2.1')
  ok(r1.preguntas.filter(q => q.criterio_id === 'CA2.1').length === 9 && !r1.preguntas.some(q => q.criterio_id === 'CA2.2'), 'reasignar CA2.2 a CA2.1 mueve sus tres preguntas de una vez')
  const r2 = reasignarCriterio(r1, 'CA2.3', null)
  ok(r2.preguntas.filter(q => q.criterio_id === null).length === 2 && criteriosSinDestino(r2, ['CA2.1']).length === 0, 'reasignar a «todos» deja las preguntas sin criterio y ya no hay aviso')
  ok(notaDePrueba(r2, Object.fromEntries(r2.preguntas.map(q => [q.id, q.max])), ['CA2.1']).porCriterio['CA2.1'] === 10, 'y el examen completo da 10 en CA2.1')
  ok(p.preguntas.filter(q => q.criterio_id === 'CA2.2').length === 3, 'el examen original no se toca')
}

console.log('\n11. Un examen que también cuenta en otras unidades')
{
  // Las unidades vinculadas van dentro del JSON: se conservan limpias (enteros
  // positivos, sin repetir) y desaparecen si no hay ninguna.
  const d = normalizarPrueba({ titulo: 'UD2', tipo: 'puntos', reparto: 'unica', preguntas: [{ id: 'p1', enunciado: '', max: 1 }],
    unidades_vinculadas: [7, 7, '9' as any, 0, -1, 2.5, 'x' as any] })
  ok(JSON.stringify(d.unidades_vinculadas) === '[7,9]', 'normalizar conserva solo ids de unidad válidos, sin repetir', JSON.stringify(d.unidades_vinculadas))
  ok(!('unidades_vinculadas' in normalizarPrueba({ titulo: 'T', tipo: 'puntos', reparto: 'unica', preguntas: [], unidades_vinculadas: [] })), 'sin vínculos no deja la clave')
  ok(JSON.stringify(unidadesDelExamen(2, d)) === '[2,7,9]', 'el examen de la UD2 corrige en la suya y en las vinculadas')
  ok(JSON.stringify(unidadesDelExamen(7, d)) === '[7,9]', 'y nunca repite la suya si viniera en la lista')
  ok(unidadesDelExamen(null, d).length === 0, 'el examen general no vincula nada: ya vale para todas por separado')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
