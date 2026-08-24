import {
  calcularNotaArea, calificativo, nivelANota, parsearPesosTrimestres,
  parsearTrimestresInstrumento, aplicaEnTrimestre, trimestreDeFecha, trimestreDeMes,
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
  ok(nivelANota(4, 4) === 10, 'nivel 4 de 4 → 10 (no 4)')
  ok(nivelANota(1, 4) === 2.5, 'nivel 1 de 4 → 2.5')
  ok(nivelANota(3, 5) === 6,   'nivel 3 de 5 → 6')
  ok(nivelANota(2, 0) === 2,   'sin máximo no divide por cero')
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

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
