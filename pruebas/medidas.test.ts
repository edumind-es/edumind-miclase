/**
 * Medidas de atención a la diversidad: adaptación curricular y refuerzo.
 *
 * Lo que se vigila: que sin medidas el cálculo sea exactamente el de siempre;
 * que un refuerzo cambie los pesos solo en sus trimestres; que excluir un
 * instrumento reparta entre los demás (también un hijo dentro de su familia);
 * que un instrumento propio (`solo_medidas`) pese 0 para quien no lo incluye;
 * que un criterio excluido no cuente y uno sustituido conserve nota y pesos;
 * que con dos filas del mismo tipo gane la más reciente; y que las etiquetas
 * digan tipo y trimestres.
 */
import { calcularNotaArea } from '../frontend/src/db/calculo'
import {
  instrumentosParaAlumno, instrumentoCuenta, criteriosExcluidos, criterioAdaptado,
  medidaDe, etiquetaMedida, medidasDelAlumno, parsearPesos, parsearCriterios, trimestresDeMedida,
} from '../frontend/src/db/medidas'
import type { Calificacion, Instrumento, Medida } from '../frontend/src/db/localDb'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const ins = (id: number, nombre: string, peso: number, extra: Partial<Instrumento> = {}): Instrumento => ({
  id, asignatura_id: 1, nombre, tipo: 'prueba', peso, trimestres: '[1,2,3]', orden: id, ...extra,
})
const nota = (instrumento_id: number, criterio_id: string, trimestre: number, valor: number, alumno_id = 1): Calificacion => ({
  id: Math.round(Math.random() * 1e9), alumno_id, instrumento_id, criterio_id, trimestre, valor,
  asignatura: 'mates', curso: '6º', etapa: 'primaria', comunidad: 'Galicia', unidad_id: 10,
})
const medida = (tipo: Medida['tipo'], extra: Partial<Medida> = {}): Medida => ({
  id: 1, alumno_id: 1, asignatura_id: 1, tipo, trimestres: '[1,2,3]', updated_at: '2026-11-01T00:00:00Z', deleted_at: null, ...extra,
})

// Programación de la clase: prueba escrita 80 % y táboa 20 %.
const prueba = ins(1, 'Proba escrita', 80)
const taboa = ins(2, 'Táboa de indicadores', 20)
const instrumentos = [prueba, taboa]
// El alumno saca 4 en la prueba y 10 en la táboa, en los tres trimestres.
const notas = [1, 2, 3].flatMap(t => [nota(1, 'CE1.1', t, 4), nota(2, 'CE1.1', t, 10)])

console.log('\n1. Sin medidas, el cálculo de siempre')
{
  const sin = calcularNotaArea(1, notas, instrumentos, undefined)
  const vacio = calcularNotaArea(1, notas, instrumentos, undefined, undefined, undefined, 'ponderada', { medidas: [] })
  ok(sin.trimestres[1] === 5.2, 'prueba 80 % y táboa 20 %: 4·0,8 + 10·0,2 = 5,2', String(sin.trimestres[1]))
  ok(JSON.stringify(sin) === JSON.stringify(vacio), 'con la lista de medidas vacía sale exactamente lo mismo')
  ok(instrumentosParaAlumno(instrumentos, [], 1) === instrumentos, 'sin medida, la lista de instrumentos es la misma referencia')
}

console.log('\n2. Un refuerzo cambia los porcentajes solo en sus trimestres')
{
  const re = medida('refuerzo', { trimestres: '[1,2]', pesos_json: JSON.stringify({ 1: 50, 2: 50 }) })
  const n = calcularNotaArea(1, notas, instrumentos, undefined, undefined, undefined, 'ponderada', { medidas: [re] })
  ok(n.trimestres[1] === 7, '1T con 50/50: 7', String(n.trimestres[1]))
  ok(n.trimestres[2] === 7, '2T con 50/50: 7', String(n.trimestres[2]))
  ok(n.trimestres[3] === 5.2, '3T sin medida: 5,2 como el resto', String(n.trimestres[3]))
  const ap = n.criterios[0].aportaciones.filter(a => a.trimestre === 1)
  ok(ap.every(a => a.peso === 50), 'las aportaciones llevan el peso que se ha usado de verdad', ap.map(a => a.peso).join(','))
  const ajustados = instrumentosParaAlumno(instrumentos, [re], 1)
  ok(ajustados !== instrumentos && ajustados[0].peso === 50 && ajustados[1].peso === 50, 'instrumentosParaAlumno devuelve una copia con los pesos del refuerzo')
  ok(instrumentosParaAlumno(instrumentos, [re], 3) === instrumentos, 'fuera de sus trimestres, la lista de siempre')
  ok(instrumentos[0].peso === 80, 'la programación de la clase no se toca')
}

console.log('\n3. Excluir un instrumento reparte entre los demás')
{
  const re = medida('refuerzo', { pesos_json: JSON.stringify({ 1: 0 }) })
  const n = calcularNotaArea(1, notas, instrumentos, undefined, undefined, undefined, 'ponderada', { medidas: [re] })
  ok(n.trimestres[1] === 10, 'sin la prueba escrita, solo cuenta la táboa: 10', String(n.trimestres[1]))
  ok(!instrumentoCuenta(instrumentos, [re], 1, 1), 'instrumentoCuenta dice que la prueba no cuenta')
  ok(instrumentoCuenta(instrumentos, [re], 2, 1), 'y que la táboa sí')
  // El refuerzo manda también sobre el reparto propio del criterio.
  const vinculo = { porUnidad: new Map([['CE1.1|1|10', 3]]), porCriterio: new Map([['CE1.1|1', 3]]) }
  const n2 = calcularNotaArea(1, notas, instrumentos, undefined, undefined, vinculo, 'ponderada', { medidas: [re] })
  ok(n2.trimestres[1] === 10, 'el peso fijado por el refuerzo gana al reparto declarado del criterio', String(n2.trimestres[1]))
}

console.log('\n4. Hijos dentro de la familia')
{
  const examen = ins(11, 'Examen', 1, { familia_id: 1 })
  const express = ins(12, 'Express', 1, { familia_id: 1 })
  const conHijos = [prueba, taboa, examen, express]
  const notasH = [nota(11, 'CE1.1', 1, 2), nota(12, 'CE1.1', 1, 6), nota(2, 'CE1.1', 1, 10)]
  const base = calcularNotaArea(1, notasH, conHijos, undefined)
  ok(base.trimestres[1] === 5.2, 'sin medida: familia (2+6)/2 = 4 → 4·0,8 + 10·0,2 = 5,2', String(base.trimestres[1]))
  const re = medida('refuerzo', { pesos_json: JSON.stringify({ 11: 0 }) })
  const n = calcularNotaArea(1, notasH, conHijos, undefined, undefined, undefined, 'ponderada', { medidas: [re] })
  ok(n.trimestres[1] === 6.8, 'sin el examen, la familia es el express: 6·0,8 + 10·0,2 = 6,8', String(n.trimestres[1]))
  const re2 = medida('refuerzo', { pesos_json: JSON.stringify({ 11: 25, 12: 75 }) })
  const n2 = calcularNotaArea(1, notasH, conHijos, undefined, undefined, undefined, 'ponderada', { medidas: [re2] })
  ok(n2.trimestres[1] === 6, 'reparto 25/75 entre hijos: familia 5 → 5·0,8 + 10·0,2 = 6', String(n2.trimestres[1]))
}

console.log('\n5. Un instrumento propio solo cuenta para quien lo incluye')
{
  const oral = ins(3, 'Prueba oral', 80, { solo_medidas: 1 })
  const conPropio = [prueba, taboa, oral]
  const notasP = [nota(1, 'CE1.1', 1, 4), nota(2, 'CE1.1', 1, 10), nota(3, 'CE1.1', 1, 9)]
  const resto = calcularNotaArea(1, notasP, conPropio, undefined)
  ok(resto.trimestres[1] === 5.2, 'para quien no tiene medida la prueba oral pesa 0', String(resto.trimestres[1]))
  ok(!instrumentoCuenta(conPropio, undefined, 3, 1), 'instrumentoCuenta lo dice sin medidas')
  const re = medida('refuerzo', { pesos_json: JSON.stringify({ 1: 0, 3: 80 }) })
  const con = calcularNotaArea(1, notasP, conPropio, undefined, undefined, undefined, 'ponderada', { medidas: [re] })
  ok(con.trimestres[1] === 9.2, 'con la medida, la oral sustituye a la escrita: 9·0,8 + 10·0,2 = 9,2', String(con.trimestres[1]))
}

console.log('\n6. Adaptación: criterios excluidos y sustituidos')
{
  const notasA = [nota(1, 'CE1.1', 1, 4), nota(1, 'CE1.2', 1, 8)]
  const aci = medida('adaptacion', {
    id: 7, trimestres: '[1]',
    criterios_json: JSON.stringify({ 'CE1.2': null, 'CE1.1': { codigo: 'CE1.1', descripcion: 'Leer números hasta 999', curso: '4º' } }),
    curso_referencia: '4º',
  })
  const n = calcularNotaArea(1, notasA, instrumentos, undefined, undefined, undefined, 'ponderada', { medidas: [aci] })
  ok(n.criterios.length === 1 && n.criterios[0].criterio_id === 'CE1.1', 'el criterio excluido no aparece', n.criterios.map(c => c.criterio_id).join(','))
  ok(n.trimestres[1] === 4, 'la nota del área sale solo del criterio que cuenta', String(n.trimestres[1]))
  ok(criteriosExcluidos([aci], 1).has('CE1.2') && !criteriosExcluidos([aci], 2).has('CE1.2'), 'criteriosExcluidos respeta los trimestres')
  const s = criterioAdaptado([aci], 'CE1.1', 1)
  ok(s?.descripcion === 'Leer números hasta 999' && s.curso === '4º', 'criterioAdaptado devuelve el sustituto')
  ok(criterioAdaptado([aci], 'CE1.1', 2) === null, 'y nada fuera de sus trimestres')
  const n2 = calcularNotaArea(1, notasA, instrumentos, undefined, undefined, undefined, 'ponderada', { medidas: [{ ...aci, trimestres: '[2]' }] })
  ok(n2.trimestres[1] === 6, 'fuera de sus trimestres, los dos criterios cuentan: 6', String(n2.trimestres[1]))
}

console.log('\n7. Dos filas del mismo tipo: gana la más reciente')
{
  const vieja = medida('refuerzo', { id: 1, updated_at: '2026-10-01T00:00:00Z', pesos_json: '{"1":0}' })
  const nueva = medida('refuerzo', { id: 2, updated_at: '2026-11-01T00:00:00Z', pesos_json: '{"2":0}' })
  ok(medidaDe([vieja, nueva], 'refuerzo')?.id === 2, 'medidaDe elige la de updated_at más reciente')
  ok(medidaDe([vieja, { ...nueva, deleted_at: '2026-11-02T00:00:00Z' }], 'refuerzo')?.id === 1, 'una borrada no cuenta')
  ok(medidaDe([vieja], 'adaptacion') === null, 'sin medida de ese tipo, null')
  const n = calcularNotaArea(1, notas, instrumentos, undefined, undefined, undefined, 'ponderada', { medidas: [vieja, nueva] })
  ok(n.trimestres[1] === 4, 'el cálculo usa la nueva (sin táboa): 4', String(n.trimestres[1]))
  const ambas = medidasDelAlumno([vieja, nueva, medida('adaptacion', { id: 3 })])
  ok(ambas.length === 2 && ambas[0].tipo === 'adaptacion' && ambas[1].id === 2, 'medidasDelAlumno: una por tipo, adaptación primero')
}

console.log('\n8. Etiquetas y lectura tolerante')
{
  ok(etiquetaMedida(medida('adaptacion')).sigla === 'ACI', 'adaptación → ACI')
  const e = etiquetaMedida(medida('refuerzo', { trimestres: '[1,3]' }))
  ok(e.sigla === 'RE' && e.texto === 'Refuerzo educativo · 1T 3T', 'refuerzo → RE con sus trimestres', e.texto)
  ok(etiquetaMedida(medida('refuerzo')).texto.endsWith('todo el curso'), 'los tres trimestres son «todo el curso»')
  ok(trimestresDeMedida({ trimestres: 'basura' }).length === 3, 'trimestres ilegibles = todo el curso')
  ok(parsearPesos({ pesos_json: '{"1": -5, "x": 3, "2": "40"}' }).get(2) === 40 && parsearPesos({ pesos_json: '{"1": -5}' }).size === 0, 'parsearPesos descarta lo que no es un peso')
  ok(Object.keys(parsearCriterios({ criterios_json: 'nada' })).length === 0, 'criterios ilegibles = sin adaptación')
  ok(parsearCriterios({ criterios_json: '{"CE1.1": {"descripcion": "x"}}' })['CE1.1']?.codigo === 'CE1.1', 'sin código, el del criterio de la clase')
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
