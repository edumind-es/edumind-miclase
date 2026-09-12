import {
  calcularNotaArea, calificativo, nivelANota, notaDeRubrica, pesosAPartesIguales,
  parsearPesosTrimestres,
  parsearTrimestresInstrumento, aplicaEnTrimestre, trimestreDeFecha, trimestreDeMes,
  pesosVinculoDeUnidades,
} from '../frontend/src/db/calculo'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const instr = (id: number, nombre: string, peso: number) =>
  ({ id, asignatura_id: 1, nombre, tipo: 'prueba-escrita', peso, trimestres: '[1,2,3]', orden: 0 } as any)

const cal = (alumno: number, instrumento: number, criterio: string, trimestre: number, valor: number) =>
  ({ alumno_id: alumno, instrumento_id: instrumento, criterio_id: criterio, trimestre, valor,
     asignatura: 'x', curso: '3', etapa: 'primaria', comunidad: 'Galicia' } as any)

console.log('\n1. Ponderación por peso de instrumento')
{
  // Examen 70% con un 10, observación 30% con un 5 → 8.5, no 7.5 (que sería la media simple)
  const r = calcularNotaArea(1,
    [cal(1, 10, 'CE1.1', 1, 10), cal(1, 20, 'CE1.1', 1, 5)],
    [instr(10, 'Examen', 70), instr(20, 'Observación', 30)],
    '{"1":100,"2":0,"3":0}')
  ok(r.criterios[0].trimestres[1] === 8.5, 'pondera 70/30 correctamente', `da ${r.criterios[0].trimestres[1]} (media simple daría 7.5)`)
}

console.log('\n1b. Reparto propio del criterio, por encima del peso global')
{
  // El caso real que lo motiva: un criterio de investigación evaluado con
  // prueba escrita, cuaderno y lista de control. Con los pesos globales del
  // área (50/30/20) la prueba arrastraría la nota. El docente quiere que las
  // tres cuenten por igual EN ESTE criterio, sin tocar el resto del área.
  const instrs = [instr(10, 'Prueba escrita', 50), instr(20, 'Cuaderno', 30), instr(30, 'Lista de control', 20)]
  const cals = [
    cal(1, 10, 'CE1.2', 1, 10), cal(1, 20, 'CE1.2', 1, 7), cal(1, 30, 'CE1.2', 1, 4),
  ]

  const global = calcularNotaArea(1, cals, instrs, '{"1":100,"2":0,"3":0}')
  // (10·50 + 7·30 + 4·20) / 100 = 7.9
  ok(global.criterios[0].trimestres[1] === 7.9,
    'sin declarar nada, sigue mandando el peso global del instrumento', String(global.criterios[0].trimestres[1]))

  const aPartesIguales = pesosVinculoDeUnidades([{
    id: 5,
    criterios: [{ criterio_id: 'CE1.2', instrumentos: [
      { instrumento_id: 10, peso_criterio: 33.4 },
      { instrumento_id: 20, peso_criterio: 33.3 },
      { instrumento_id: 30, peso_criterio: 33.3 },
    ] }],
  }])
  const medio = calcularNotaArea(1, cals, instrs, '{"1":100,"2":0,"3":0}', new Map(), aPartesIguales)
  // Media aritmética de 10, 7 y 4 = 7
  ok(medio.criterios[0].trimestres[1] === 7,
    'declarado a partes iguales, sale la media aritmética', String(medio.criterios[0].trimestres[1]))

  // Y el peso global de esos mismos instrumentos sigue mandando en OTRO criterio
  const otro = calcularNotaArea(1,
    [...cals, cal(1, 10, 'CE1.5', 1, 10), cal(1, 20, 'CE1.5', 1, 5)],
    instrs, '{"1":100,"2":0,"3":0}', new Map(), aPartesIguales)
  const ce15 = otro.criterios.find(c => c.criterio_id === 'CE1.5')
  // (10·50 + 5·30) / 80 = 8.125 → 8.13
  ok(ce15?.trimestres[1] === 8.13,
    'y el criterio de al lado conserva el reparto global', String(ce15?.trimestres[1]))
}

console.log('\n1c. El reparto se busca en la unidad donde se puso la nota')
{
  const instrs = [instr(10, 'Prueba escrita', 50), instr(20, 'Cuaderno', 50)]
  // El mismo criterio en dos unidades del mismo trimestre, con repartos distintos
  const pesos = pesosVinculoDeUnidades([
    { id: 7, criterios: [{ criterio_id: 'CE1.2', instrumentos: [
      { instrumento_id: 10, peso_criterio: 90 }, { instrumento_id: 20, peso_criterio: 10 }] }] },
    { id: 8, criterios: [{ criterio_id: 'CE1.2', instrumentos: [
      { instrumento_id: 10, peso_criterio: 10 }, { instrumento_id: 20, peso_criterio: 90 }] }] },
  ])

  const enSiete = [
    { ...cal(1, 10, 'CE1.2', 1, 10), unidad_id: 7 },
    { ...cal(1, 20, 'CE1.2', 1, 0), unidad_id: 7 },
  ] as any[]
  const r7 = calcularNotaArea(1, enSiete, instrs, '{"1":100,"2":0,"3":0}', new Map(), pesos)
  ok(r7.criterios[0].trimestres[1] === 9,
    'con la nota puesta en la unidad 7 manda el reparto 90/10', String(r7.criterios[0].trimestres[1]))

  const enOcho = [
    { ...cal(1, 10, 'CE1.2', 1, 10), unidad_id: 8 },
    { ...cal(1, 20, 'CE1.2', 1, 0), unidad_id: 8 },
  ] as any[]
  const r8 = calcularNotaArea(1, enOcho, instrs, '{"1":100,"2":0,"3":0}', new Map(), pesos)
  ok(r8.criterios[0].trimestres[1] === 1,
    'y en la unidad 8, el 10/90', String(r8.criterios[0].trimestres[1]))

  // Una unidad que NO declara reparto usa el peso global, no el de la vecina.
  // Heredarlo era peor que no tener ninguno: la nota cambiaba sin que nadie
  // hubiera tocado esa unidad.
  const pesosSoloEnSiete = pesosVinculoDeUnidades([
    { id: 7, criterios: [{ criterio_id: 'CE1.2', instrumentos: [
      { instrumento_id: 10, peso_criterio: 90 }, { instrumento_id: 20, peso_criterio: 10 }] }] },
    { id: 9, criterios: [{ criterio_id: 'CE1.2', instrumentos: [
      { instrumento_id: 10, peso_criterio: null }, { instrumento_id: 20, peso_criterio: null }] }] },
  ])
  const enNueve = [
    { ...cal(1, 10, 'CE1.2', 1, 10), unidad_id: 9 },
    { ...cal(1, 20, 'CE1.2', 1, 0), unidad_id: 9 },
  ] as any[]
  const r9 = calcularNotaArea(1, enNueve, instrs, '{"1":100,"2":0,"3":0}', new Map(), pesosSoloEnSiete)
  ok(r9.criterios[0].trimestres[1] === 5,
    'una unidad sin reparto propio usa el peso global, no hereda el de la vecina',
    `${r9.criterios[0].trimestres[1]} (heredarlo daría 9)`)

  // Una nota antigua, sin unidad anotada, cae en el primero declarado
  const sinUnidad = [cal(1, 10, 'CE1.2', 1, 10), cal(1, 20, 'CE1.2', 1, 0)]
  const rs = calcularNotaArea(1, sinUnidad, instrs, '{"1":100,"2":0,"3":0}', new Map(), pesos)
  ok(rs.criterios[0].trimestres[1] === 9,
    'y una nota sin unidad anotada no rompe: usa el primero declarado', String(rs.criterios[0].trimestres[1]))
}

console.log('\n1d. Un instrumento con peso declarado 0 no cuenta')
{
  const instrs = [instr(10, 'Prueba escrita', 50), instr(20, 'Cuaderno', 50)]
  const pesos = pesosVinculoDeUnidades([{
    id: 1,
    criterios: [{ criterio_id: 'CE1.2', instrumentos: [
      { instrumento_id: 10, peso_criterio: 100 }, { instrumento_id: 20, peso_criterio: 0 }] }],
  }])
  const r = calcularNotaArea(1,
    [cal(1, 10, 'CE1.2', 1, 10), cal(1, 20, 'CE1.2', 1, 0)],
    instrs, '{"1":100,"2":0,"3":0}', new Map(), pesos)
  ok(r.criterios[0].trimestres[1] === 10,
    'el que pesa 0 se queda fuera en vez de hundir la nota', String(r.criterios[0].trimestres[1]))
}

console.log('\n2. Ponderación por trimestre')
{
  const r = calcularNotaArea(1,
    [cal(1, 10, 'CE1.1', 1, 10), cal(1, 10, 'CE1.1', 2, 10), cal(1, 10, 'CE1.1', 3, 4)],
    [instr(10, 'Examen', 100)],
    '{"1":20,"2":20,"3":60}')
  // (10·20 + 10·20 + 4·60) / 100 = 6.4
  ok(r.final === 6.4, 'el 3er trimestre pesa el 60%', `da ${r.final}`)
}

console.log('\n3. Un trimestre sin datos no cuenta como cero')
{
  const r = calcularNotaArea(1,
    [cal(1, 10, 'CE1.1', 1, 8)],
    [instr(10, 'Examen', 100)],
    '{"1":33,"2":33,"3":34}')
  ok(r.final === 8, 'con solo el 1er trimestre la nota es 8, no 2.64', `da ${r.final}`)
  ok(r.trimestres[2] === null && r.trimestres[3] === null, 'los trimestres vacíos quedan a null')
}

console.log('\n4. Peso de criterio en la nota de área')
{
  const pesos = new Map([['CE1.1', 3], ['CE1.2', 1]])
  const r = calcularNotaArea(1,
    [cal(1, 10, 'CE1.1', 1, 10), cal(1, 10, 'CE1.2', 1, 2)],
    [instr(10, 'Examen', 100)],
    '{"1":100,"2":0,"3":0}', pesos)
  // (10·3 + 2·1) / 4 = 8
  ok(r.trimestres[1] === 8, 'un criterio con peso 3 arrastra la nota de área', `da ${r.trimestres[1]}`)
}

console.log('\n5. Instrumento con peso 0 no contamina')
{
  const r = calcularNotaArea(1,
    [cal(1, 10, 'CE1.1', 1, 10), cal(1, 20, 'CE1.1', 1, 0)],
    [instr(10, 'Examen', 100), instr(20, 'Sin peso', 0)],
    '{"1":100,"2":0,"3":0}')
  ok(r.trimestres[1] === 10, 'un instrumento con peso 0 se ignora', `da ${r.trimestres[1]}`)
}

console.log('\n6. Nota de un instrumento ya borrado')
{
  // La nota histórica sobrevive con peso 1 en vez de desaparecer
  const r = calcularNotaArea(1,
    [cal(1, 999, 'CE1.1', 1, 7)],
    [],
    '{"1":100,"2":0,"3":0}')
  ok(r.trimestres[1] === 7, 'la nota de un instrumento retirado se conserva', `da ${r.trimestres[1]}`)
  ok(r.criterios[0].aportaciones[0].nombre === '(instrumento retirado)', 'y se marca como retirado en el informe')
}

console.log('\n7. Sin datos')
{
  const r = calcularNotaArea(1, [], [instr(10, 'Examen', 100)], '{"1":33,"2":33,"3":34}')
  ok(r.final === null && r.criterios.length === 0, 'sin calificaciones la nota es null, no 0')
}

console.log('\n8. Escala cualitativa LOMLOE')
{
  ok(calificativo(9.5).sigla === 'SB', '9.5 → Sobresaliente')
  ok(calificativo(9).sigla   === 'SB', '9 → Sobresaliente')
  ok(calificativo(8.9).sigla === 'NT', '8.9 → Notable')
  ok(calificativo(7).sigla   === 'NT', '7 → Notable')
  ok(calificativo(6).sigla   === 'BI', '6 → Bien')
  ok(calificativo(5).sigla   === 'SU', '5 → Suficiente')
  ok(calificativo(4.9).sigla === 'IN', '4.9 → Insuficiente')
  ok(calificativo(null).sigla === '—', 'sin nota → guion')
}

console.log('\n9. Conversión de niveles de rúbrica a escala 0-10')
{
  // La escala se ancla en 0: un nivel vale su parte del máximo. Antes se
  // repartía de extremo a extremo, de modo que el nivel más bajo PRESENTE
  // valía 0 — se hizo así porque los niveles no se podían editar y no había
  // otra forma de llegar al cero. Ahora sí se pueden, y el 0 es un nivel que
  // el docente añade cuando quiere decir «no ejecuta».
  ok(nivelANota(4, 4) === 10,  'nivel 4 de 4 → 10')
  ok(nivelANota(3, 4) === 7.5, 'nivel 3 de 4 → 7.5')
  ok(nivelANota(2, 4) === 5,   'nivel 2 de 4 → 5')
  ok(nivelANota(1, 4) === 2.5, 'el nivel más bajo descrito conserva su parte, no cae a 0')
  ok(nivelANota(0, 4) === 0,   'el 0 sí da 0: es un nivel, no el escalón inferior')
  ok(nivelANota(3, 5) === 6,   'nivel 3 de 5 → 6')
  ok(nivelANota(2, 0) === 0,   'un máximo de 0 no divide por cero')
}

console.log('\n9b. Nota de una rúbrica calificada indicador a indicador')
{
  const NIVELES = [
    { nombre: 'Excelente', valor: 4 }, { nombre: 'Notable', valor: 3 },
    { nombre: 'Bien', valor: 2 }, { nombre: 'Insuficiente', valor: 1 },
  ]
  const tres = [{ nombre: 'A' }, { nombre: 'B' }, { nombre: 'C' }]

  // Sin pesos declarados se reparte a partes iguales
  ok(notaDeRubrica(tres, NIVELES, { A: 4, B: 4, C: 4 }).nota === 10, 'todo al máximo → 10')
  ok(notaDeRubrica(tres, NIVELES, { A: 1, B: 1, C: 1 }).nota === 2.5,
     'todo en el nivel más bajo descrito → 2.5, no 0')
  ok(notaDeRubrica(tres, NIVELES, { A: 4, B: 3, C: 2 }).nota === 7.5,
     'media de 4, 3 y 2 sobre 4 → 7.5', String(notaDeRubrica(tres, NIVELES, { A: 4, B: 3, C: 2 }).nota))

  // El peso manda: el mismo reparto de niveles da notas distintas
  const pesados = [{ nombre: 'A', peso: 80 }, { nombre: 'B', peso: 10 }, { nombre: 'C', peso: 10 }]
  const r = notaDeRubrica(pesados, NIVELES, { A: 4, B: 1, C: 1 })
  ok(r.nota === 8.5, 'el indicador que pesa 80% arrastra la nota', String(r.nota))
  const inverso = notaDeRubrica(pesados, NIVELES, { A: 1, B: 4, C: 4 })
  ok(inverso.nota === 4, 'y al revés la hunde, aunque los otros dos estén al máximo', String(inverso.nota))

  // Lo no marcado no cuenta como cero
  const parcial = notaDeRubrica(tres, NIVELES, { A: 4 })
  ok(parcial.nota === 10, 'un solo indicador marcado al máximo → 10, no 3.3')
  ok(parcial.evaluados === 1 && parcial.total === 3, 'y se dice que va 1 de 3')

  // Sin marcar nada no hay nota que poner
  ok(notaDeRubrica(tres, NIVELES, {}).nota === null, 'sin marcar nada la nota es null, no 0')

  // El nivel 0, que es de lo que se trata
  const CON_CERO = [...NIVELES, { nombre: 'No interviene', valor: 0 }]
  ok(notaDeRubrica(tres, CON_CERO, { A: 0, B: 0, C: 0 }).nota === 0,
     'todo en «No interviene» → 0')
  ok(notaDeRubrica(tres, CON_CERO, { A: 1, B: 1, C: 1 }).nota === 2.5,
     'y añadir el nivel 0 no cambia lo que vale el «Insuficiente»')

  // Casos límite
  ok(notaDeRubrica([], NIVELES, {}).nota === null, 'una rúbrica sin indicadores no da nota')
  ok(notaDeRubrica(tres, [], { A: 1 }).nota === null, 'una rúbrica sin niveles tampoco')
  ok(notaDeRubrica(tres, [{ nombre: 'Cero', valor: 0 }], { A: 0 }).nota === null,
     'si el máximo es 0 no hay escala que repartir')
}

console.log('\n9c. Reparto de pesos a partes iguales')
{
  ok(pesosAPartesIguales(4).every(p => p === 25), 'cuatro indicadores → 25 cada uno')
  const tres = pesosAPartesIguales(3)
  ok(Math.round(tres.reduce((a, b) => a + b, 0)) === 100,
     'con tres suma 100 exacto pese al decimal periódico', tres.join(' + '))
  ok(pesosAPartesIguales(0).length === 0, 'sin indicadores no hay nada que repartir')
}

console.log('\n10. Pesos de trimestre mal formados')
{
  ok(parsearPesosTrimestres(undefined)[1] === 33, 'sin JSON usa el reparto por defecto')
  ok(parsearPesosTrimestres('{{roto')[3] === 34, 'un JSON roto no rompe el cálculo')
}

console.log('\n11. Trimestres en los que se usa un instrumento')
{
  // Se configuraba en la pantalla de instrumentos y no lo leía nadie: un
  // examen marcado «solo 1er trimestre» seguía apareciendo en los tres.
  ok(aplicaEnTrimestre('[1]', 1) === true,  'un instrumento de 1er trimestre aplica en el 1º')
  ok(aplicaEnTrimestre('[1]', 2) === false, 'y no aplica en el 2º')
  ok(aplicaEnTrimestre('[2,3]', 3) === true, 'admite varios trimestres')

  ok(parsearTrimestresInstrumento(undefined).length === 3, 'sin dato se entiende que son los tres')
  ok(parsearTrimestresInstrumento('{{roto').length === 3, 'un JSON roto no hace desaparecer la columna')
  ok(parsearTrimestresInstrumento('[]').length === 3, 'una lista vacía tampoco')
  ok(parsearTrimestresInstrumento('[1,7,2]').join(',') === '1,2', 'los trimestres inventados se descartan')
}

console.log('\n12. Trimestre del curso escolar según la fecha')
{
  ok(trimestreDeMes(9) === 1 && trimestreDeMes(12) === 1, 'de septiembre a diciembre, 1º')
  ok(trimestreDeMes(1) === 2 && trimestreDeMes(3) === 2,  'de enero a marzo, 2º')
  ok(trimestreDeMes(4) === 3 && trimestreDeMes(6) === 3,  'de abril en adelante, 3º')
  ok(trimestreDeFecha('2026-11-04') === 1, 'una fecha de noviembre cae en el 1er trimestre')
  ok(trimestreDeFecha('2027-02-10T09:30:00.000Z') === 2, 'y una de febrero en el 2º')
}

console.log('\n13. El redondeo no se acumula escalón a escalón')
{
  // Tres criterios cuyas notas de criterio no son exactas en dos decimales.
  // Antes se redondeaba en cada escalón (instrumento → criterio → área), así
  // que el área partía de valores ya recortados y la desviación crecía con el
  // número de criterios.
  const instrs = [instr(10, 'Examen', 1), instr(20, 'Observación', 2)]
  const cals = [
    cal(1, 10, 'CE1.1', 1, 10), cal(1, 20, 'CE1.1', 1, 9),
    cal(1, 10, 'CE1.2', 1, 8),  cal(1, 20, 'CE1.2', 1, 7),
    cal(1, 10, 'CE1.3', 1, 6),  cal(1, 20, 'CE1.3', 1, 5),
  ]
  const r = calcularNotaArea(1, cals, instrs, '{"1":100,"2":0,"3":0}')

  // Cada criterio: (10·1 + 9·2)/3 = 9.333…, (8+14)/3 = 7.333…, (6+10)/3 = 5.333…
  // Área = media de los tres = 7.333…  → 7.33
  ok(r.trimestres[1] === 7.33, 'la nota de área sale del valor sin recortar', String(r.trimestres[1]))
  ok(r.criterios[0].trimestres[1] === 9.33, 'y cada criterio se enseña ya redondeado', String(r.criterios[0].trimestres[1]))
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
