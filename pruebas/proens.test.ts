/**
 * Lectura de una programación didáctica de PROENS.
 *
 * El fixture es la salida de `pdftotext -layout` sobre un PDF gemelo del de
 * PROENS (pruebas/lib/proens_gemelo.py): mismas tablas, celdas combinadas,
 * marca de agua troceada y cabeceras partidas. Lo que se comprueba es lo que
 * la app necesita: que cada criterio acabe en su unidad, con su mínimo y con
 * el instrumento que le toca, y que el trimestre y los pesos salgan enteros.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsearProens, capitalizar, tipoDeInstrumento, limpiarTexto } from '../frontend/src/programacion/proens'

// La suite se empaqueta y corre desde un directorio temporal: el fixture se
// busca desde la raíz del proyecto, que es donde `npm test` se ejecuta.
const texto = readFileSync(join(process.cwd(), 'pruebas/fixtures/proens_ccss6.txt'), 'utf8')

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const p = parsearProens(texto)
const ud = (n: number) => p.unidades.find(u => u.numero === n)!
const crit = (n: number, codigo: string) => ud(n).criterios.find(c => c.codigo === codigo)

console.log('\n1. Cabecera')
ok(p.area === 'Ciencias Sociais', 'lee el área', String(p.area))
ok(p.curso === '6', 'lee el curso sin ordinal', String(p.curso))
ok(p.etapa === 'primaria', 'lee la etapa', String(p.etapa))
ok(p.centro === 'CEP Campolongo' && p.cursoEscolar === '2026/2027', 'lee centro y curso escolar', `${p.centro} ${p.cursoEscolar}`)
ok(p.sesionesSemanales === 2 && p.sesionesAnuales === 70, 'lee las sesiones', `${p.sesionesSemanales}/${p.sesionesAnuales}`)

console.log('\n2. Limpieza del texto')
{
  const l = limpiarTexto('   Bo\n rra\nCA1.1 - algo\n  do\nr\nXUNTA DE GALICIA | x\n22/09/2026 20:22:24     Páxina 3 de 22\nBorrador\n')
  const conTexto = l.filter(Boolean)
  ok(conTexto.length === 1 && conTexto[0] === 'CA1.1 - algo', 'quita marca de agua, cabecera y pie', JSON.stringify(l))
}

console.log('\n3. Unidades')
ok(p.unidades.length === 7, 'siete unidades', String(p.unidades.length))
ok(p.unidades.map(u => u.numero).join() === '1,2,3,4,5,6,7', 'en orden')
ok(ud(1).titulo === 'O mundo que nos rodea', 'título legible', ud(1).titulo)
ok(ud(2).titulo === 'O clima e a paisaxe', 'sin el ordinal colado en el título', ud(2).titulo)
ok(ud(4).titulo === 'A organización político-territorial da nosa contorna', 'título largo entero', ud(4).titulo)
ok(ud(1).sesiones === 10 && ud(7).sesiones === 20, 'sesiones de la tabla de la unidad', `${ud(1).sesiones}/${ud(7).sesiones}`)
ok(ud(1).peso === 15 && ud(2).peso === 14 && ud(6).peso === 11, 'peso de la tabla 3.1', `${ud(1).peso}/${ud(2).peso}/${ud(6).peso}`)
ok([1, 2, 3].every(n => ud(n).trimestre === 1), 'UD 1-3 en el primer trimestre', p.unidades.map(u => u.trimestre).join())
ok([4, 5].every(n => ud(n).trimestre === 2), 'UD 4-5 en el segundo')
ok([6, 7].every(n => ud(n).trimestre === 3), 'UD 6-7 en el tercero')
ok(ud(1).descripcion.startsWith('Comprender a relación entre a cartografía e a realidade.'), 'descripción (objetivos) de 3.1 con las líneas unidas', ud(1).descripcion.slice(0, 60))
ok(ud(1).descripcion.split('\n').length === 4, 'un objetivo por línea', String(ud(1).descripcion.split('\n').length))

console.log('\n4. Criterios, mínimos e instrumentos')
ok(ud(1).criterios.length === 7, 'UD 1 tiene 7 criterios', ud(1).criterios.map(c => c.codigo).join())
ok(crit(1, 'CA2.1')?.codigoCurriculo === 'CE2.1', 'CA → CE para casar con el currículo')
ok(crit(1, 'CA2.1')?.descripcion.startsWith('Identificar as características, a organización e as propiedades'), 'descripción unida', crit(1, 'CA2.1')?.descripcion.slice(0, 50))
ok(crit(1, 'CA2.1')?.descripcion.endsWith('procesos adecuados.'), 'hasta el final')
ok(crit(1, 'CA2.1')?.minimo === 'Identificar certas características e elementos do medio natural, social e cultural.', 'mínimo separado de la descripción', crit(1, 'CA2.1')?.minimo)
ok(crit(1, 'CA1.4')?.minimo === 'Participar en experimentos guiados e no rexistro dos datos correspondentes.', 'mínimo pese a la marca de agua en medio', crit(1, 'CA1.4')?.minimo)
ok(crit(1, 'CA3.1')?.descripcion.includes('afectivo-sexual'), 'guion de corte reparado', crit(1, 'CA3.1')?.descripcion.slice(-80))

ok(crit(1, 'CA2.1')?.instrumento === 'PE' && crit(1, 'CA2.2')?.instrumento === 'PE', 'UD 1: los dos primeros van a prueba escrita', ud(1).criterios.map(c => `${c.codigo}:${c.instrumento}`).join(' '))
ok(['CA1.1', 'CA1.2', 'CA1.3', 'CA1.4', 'CA3.1'].every(c => crit(1, c)?.instrumento === 'TI'), 'UD 1: los cinco restantes a tabla de indicadores')
ok(crit(1, 'CA2.1')?.porcentaje === 80 && crit(1, 'CA1.1')?.porcentaje === 20, 'con su porcentaje', `${crit(1, 'CA2.1')?.porcentaje}/${crit(1, 'CA1.1')?.porcentaje}`)
ok(['CA2.1', 'CA2.2', 'CA2.3'].every(c => crit(2, c)?.instrumento === 'PE'), 'UD 2: tres a prueba escrita', ud(2).criterios.map(c => `${c.codigo}:${c.instrumento}`).join(' '))
ok(['CA1.1', 'CA1.2', 'CA1.3', 'CA1.4', 'CA2.4'].every(c => crit(2, c)?.instrumento === 'TI'), 'UD 2: cinco a tabla de indicadores')
ok(['CA2.1', 'CA2.2'].every(c => crit(4, c)?.instrumento === 'PE') && ['CA1.1', 'CA1.2', 'CA1.3', 'CA1.4', 'CA2.4', 'CA3.3', 'CA3.4'].every(c => crit(4, c)?.instrumento === 'TI'),
  'UD 4: 2 + 7 bien repartidos', ud(4).criterios.map(c => `${c.codigo}:${c.instrumento}`).join(' '))
ok(['CA2.1', 'CA2.2', 'CA3.1', 'CA4.2', 'CA4.3'].every(c => crit(7, c)?.instrumento === 'PE'), 'UD 7: cinco a prueba escrita', ud(7).criterios.map(c => `${c.codigo}:${c.instrumento}`).join(' '))
ok(['CA1.1', 'CA1.2', 'CA1.3', 'CA1.4'].every(c => crit(7, c)?.instrumento === 'TI'), 'UD 7: cuatro a tabla de indicadores')
ok(crit(7, 'CA4.1')?.instrumento === null && crit(7, 'CA4.1')?.porcentaje === null, 'UD 7: CA4.1 «Baleiro» queda sin instrumento')
ok(crit(7, 'CA4.1')?.minimo === '', 'y sin mínimo')
{
  const total = p.unidades.reduce((s, u) => s + u.criterios.length, 0)
  ok(total === 7 + 8 + 8 + 9 + 7 + 7 + 10, 'los 56 criterios de las siete unidades', String(total))
}

console.log('\n5. Contidos')
ok(ud(1).contenidos.length === 4, 'UD 1: cuatro contidos', String(ud(1).contenidos.length))
ok(ud(1).contenidos[0].startsWith('Fases da investigación científica') && ud(1).contenidos[0].endsWith('Iniciativa emprendedora.'), 'líneas unidas')
ok(ud(7).contenidos.length === 5, 'UD 7: cinco contidos, aunque la tabla salte de página', String(ud(7).contenidos.length))
ok(ud(7).contenidos[4].endsWith('igualdade de xénero.'), 'el último entero', ud(7).contenidos[4].slice(-40))

console.log('\n6. Instrumentos y pesos')
ok(p.instrumentos.length === 2, 'dos instrumentos en la leyenda', p.instrumentos.map(i => i.abrev).join())
{
  const pe = p.instrumentos.find(i => i.abrev === 'PE')!
  const ti = p.instrumentos.find(i => i.abrev === 'TI')!
  ok(pe?.nombre === 'Proba escrita' && ti?.nombre === 'Táboa de indicadores', 'con su nombre', `${pe?.nombre} / ${ti?.nombre}`)
  ok(pe?.tipo === 'prueba-escrita' && ti?.tipo === 'observacion', 'y su tipo de MiClase', `${pe?.tipo} / ${ti?.tipo}`)
  ok(pe?.peso === 80 && ti?.peso === 20, 'peso de la tabla 5.2', `${pe?.peso} / ${ti?.peso}`)
}
ok(tipoDeInstrumento('Rúbrica de exposición') === 'rubrica', 'tipo: rúbrica')
ok(tipoDeInstrumento('Lista de control') === 'observacion', 'tipo: lista de control')
ok(tipoDeInstrumento('Cousa rara') === 'otro', 'tipo desconocido → otro')

console.log('\n7. Avisos')
ok(p.avisos.length === 0, 'sin avisos con un PDF completo', p.avisos.join(' | '))
{
  const vacio = parsearProens('nada que ver')
  ok(vacio.avisos.length > 0 && vacio.unidades.length === 0, 'un texto ajeno avisa y no inventa unidades')
}

console.log('\n8. Títulos')
ok(capitalizar('ºO CLIMA E A PAISAXE') === 'O clima e a paisaxe', 'capitaliza y quita el ordinal')
ok(capitalizar('Xa legible') === 'Xa legible', 'respeta lo que no va en mayúsculas')

console.log('\n9. El PDF real de PROENS (Ciencias Sociais 6º, 22 páginas)')
// Lo que el gemelo no tenía: índice al principio, cabeceras de tabla en dos
// o tres líneas que se repiten en cada página con otras columnas, trozos de
// marca de agua dentro de líneas con texto, título y descripción centrados
// alrededor del número de la unidad, «UD» y «Título da UD» en líneas
// distintas, y la tabla 5.2 partida en dos subtablas (UD 1-7 y Total).
{
  const r = parsearProens(readFileSync(join(process.cwd(), 'pruebas/fixtures/proens_real_ccss6.txt'), 'utf8'))
  const rud = (n: number) => r.unidades.find(u => u.numero === n)!
  const rcrit = (n: number, codigo: string) => rud(n).criterios.find(c => c.codigo === codigo)
  ok(r.area === 'Ciencias Sociais' && r.curso === '6' && r.centro === 'CEP Campolongo', 'cabecera', `${r.area} ${r.curso} ${r.centro}`)
  ok(r.sesionesSemanales === 2 && r.sesionesAnuales === 70, 'sesiones', `${r.sesionesSemanales}/${r.sesionesAnuales}`)
  ok(r.unidades.map(u => u.numero).join() === '1,2,3,4,5,6,7', 'las siete unidades en orden, sin coger el «3.1» del índice', r.unidades.map(u => u.numero).join())
  ok(rud(1).titulo === 'O mundo que nos rodea' && rud(2).titulo === 'O clima e a paisaxe', 'títulos', `${rud(1).titulo} / ${rud(2).titulo}`)
  ok(rud(4).titulo === 'A organización político-territorial da nosa contorna', 'título partido alrededor del número', rud(4).titulo)
  ok(rud(6).titulo === 'A economía e o seu funcionamento', 'título cuyo número va solo en su línea', rud(6).titulo)
  ok(rud(7).titulo === 'Descubrindo a historia', 'UD 7, con «UD» y «Título da UD» en líneas distintas', rud(7).titulo)
  ok(r.unidades.map(u => u.peso).join() === '15,14,15,15,15,11,15', 'pesos de 3.1', r.unidades.map(u => u.peso).join())
  ok(r.unidades.map(u => u.sesiones).join() === '10,10,8,8,8,6,20', 'sesiones', r.unidades.map(u => u.sesiones).join())
  ok(r.unidades.map(u => u.trimestre).join() === '1,1,1,2,2,3,3', 'trimestres', r.unidades.map(u => u.trimestre).join())
  ok(rud(1).descripcion.startsWith('Comprender a relación entre a cartografía e a realidade.'), 'descripción de UD 1 desde la primera línea, que va antes del número', rud(1).descripcion.slice(0, 60))
  ok(rud(1).descripcion.endsWith('coa axuda de ferramentas dixitais.') && rud(2).descripcion.startsWith('Diferenciar entre clima e tempo atmosférico.'),
    'el límite entre UD 1 y UD 2 cae en un final de frase', rud(1).descripcion.slice(-40) + ' || ' + rud(2).descripcion.slice(0, 40))
  ok(rud(1).descripcion.split('\n').length === 6 && rud(2).descripcion.split('\n').length === 8, 'un objetivo por línea', `${rud(1).descripcion.split('\n').length}/${rud(2).descripcion.split('\n').length}`)
  ok(!/\b(Bo|rra)\b/.test(rud(2).descripcion) && !/\s(do|ra|r)\s{2}/.test(rud(2).descripcion), 'sin trozos de marca de agua en la descripción')
  const total = r.unidades.reduce((s, u) => s + u.criterios.length, 0)
  ok(total === 56, 'los 56 criterios', String(total))
  ok(rcrit(1, 'CA2.1')?.minimo === 'Identificar certas características e elementos do medio natural, social e cultural.', 'mínimo separado aunque empiece antes que el rótulo de la cabecera', rcrit(1, 'CA2.1')?.minimo)
  ok(rcrit(1, 'CA2.1')?.descripcion.endsWith('procesos adecuados.'), 'descripción del criterio entera', rcrit(1, 'CA2.1')?.descripcion.slice(-30))
  ok(rcrit(2, 'CA2.4')?.descripcion.endsWith('humana na contorna.') && rcrit(2, 'CA2.4')?.minimo.includes('buscar solucións'),
    'criterio y mínimo pegados con un solo espacio se separan sin partir palabras', rcrit(2, 'CA2.4')?.minimo)
  const reparto = (n: number) => rud(n).criterios.map(c => `${c.codigo}:${c.instrumento ?? '-'}`).join(' ')
  ok(reparto(1) === 'CA2.1:PE CA2.2:PE CA1.1:TI CA1.2:TI CA1.3:TI CA1.4:TI CA3.1:TI', 'UD 1: 2 + 5', reparto(1))
  ok(reparto(4) === 'CA2.1:PE CA2.2:PE CA1.1:TI CA1.2:TI CA1.3:TI CA1.4:TI CA2.4:TI CA3.3:TI CA3.4:TI', 'UD 4: 2 + 7 aunque la tabla salte de página y «TI» vaya centrado solo en su trozo', reparto(4))
  ok(reparto(5) === 'CA3.1:PE CA3.4:PE CA1.1:TI CA1.2:TI CA1.3:TI CA1.4:TI CA4.4:TI', 'UD 5: cabecera seguida de salto de página', reparto(5))
  ok(reparto(7) === 'CA2.1:PE CA2.2:PE CA3.1:PE CA4.2:PE CA4.3:PE CA1.1:TI CA1.2:TI CA1.3:TI CA1.4:TI CA4.1:-', 'UD 7: 5 + 4 y un «Baleiro»', reparto(7))
  ok(rcrit(1, 'CA2.1')?.porcentaje === 80 && rcrit(1, 'CA1.1')?.porcentaje === 20, 'porcentajes')
  ok(rud(1).contenidos.length === 7 && rud(1).contenidos[0].startsWith('Fases da investigación científica'), 'contidos', String(rud(1).contenidos.length))
  const pe = r.instrumentos.find(i => i.abrev === 'PE'), ti = r.instrumentos.find(i => i.abrev === 'TI')
  ok(r.instrumentos.length === 2 && pe?.peso === 80 && ti?.peso === 20, 'pesos de la 5.2 partida en subtablas', `${pe?.peso}/${ti?.peso}`)
  ok(r.avisos.length === 0, 'sin avisos', r.avisos.join(' | '))
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
