/**
 * Recuperación por criterio (`db/recuperacion.ts`) y su efecto en la nota del
 * área (`calcularNotaArea`).
 *
 * Lo que se comprueba: las tres reglas; que recupera solo lo de su
 * instrumento (el ejemplo de Luis: examen 3 al 80 %, tabla 8 al 20 %,
 * recuperación 6 → criterio 6,4); que solo toca la unidad y el criterio con
 * nota de recuperación; que la recuperación no entra como una actividad más;
 * que sin nada que recuperar cuenta como una actividad; y que sin
 * recuperaciones todo sale como siempre.
 */
import {
  aplicarRecuperaciones, recuperacionesAplicadas, notaRecuperada, notasARecuperar, estaSuspenso,
  reglaDeRecuperacion,
} from '../frontend/src/db/recuperacion'
import { calcularNotaArea } from '../frontend/src/db/calculo'
import type { Calificacion, Instrumento } from '../frontend/src/db/localDb'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const casi = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) < 0.011

const ins = (id: number, o: Partial<Instrumento>): Instrumento => ({
  id, asignatura_id: 1, nombre: `I${id}`, tipo: 'prueba-escrita', peso: 1, trimestres: '[1,2,3]', orden: id,
  updated_at: '', ...o,
} as Instrumento)

// «Proba escrita» 80 % con examen y recuperación; «Táboa» 20 %, suelta.
const PROBA = 10, EXAMEN = 11, RECU = 12, TABOA = 20, EXAMEN2 = 13
const instrumentos = (regla: string | null = 'mejor', conSegundo = false): Instrumento[] => [
  ins(PROBA, { nombre: 'Proba escrita', peso: 80 }),
  ins(EXAMEN, { nombre: 'Examen', familia_id: PROBA }),
  ...(conSegundo ? [ins(EXAMEN2, { nombre: 'Problemas', familia_id: PROBA })] : []),
  ins(RECU, { nombre: 'Recuperación', familia_id: PROBA, recuperacion: regla }),
  ins(TABOA, { nombre: 'Táboa', peso: 20, tipo: 'observacion' }),
]

let n = 0
const cal = (instrumento_id: number, valor: number | null, o: Partial<Calificacion> = {}): Calificacion => ({
  id: ++n, alumno_id: 1, instrumento_id, criterio_id: 'CE1.1', trimestre: 1, unidad_id: 100, valor,
  updated_at: '', ...o,
} as Calificacion)

const area = (cals: Calificacion[], lista: Instrumento[], reglaArea: 'instrumento' | 'criterio' = 'instrumento') =>
  calcularNotaArea(1, cals, lista, undefined, new Map(), undefined, 'ponderada', reglaArea)

console.log('\n1. Las tres reglas')
{
  ok(notaRecuperada(3, 6, 'mejor') === 6 && notaRecuperada(7, 6, 'mejor') === 7, 'la mejor: sube si saca más, se queda si saca menos')
  ok(notaRecuperada(3, 6, 'sustituir') === 6 && notaRecuperada(7, 4, 'sustituir') === 4, 'la de la recuperación: sustituye también a la baja')
  ok(notaRecuperada(3, 8, 'tope') === 5 && notaRecuperada(3, 4, 'tope') === 4 && notaRecuperada(7, 9, 'tope') === 7,
    'con tope: llega a 5 como mucho, y quien tenía más no baja')
  ok(reglaDeRecuperacion({ recuperacion: 'otra' }) === null && reglaDeRecuperacion({}) === null, 'una regla desconocida no es una recuperación')
  ok(estaSuspenso(4.9) && !estaSuspenso(5) && !estaSuspenso(null), 'suspenso es menos de 5; sin nota no es suspenso')
}

console.log('\n2. El ejemplo de Luis: examen 3 (80 %), tabla 8 (20 %), recuperación 6')
{
  const lista = instrumentos('mejor')
  const cals = [cal(EXAMEN, 3), cal(TABOA, 8), cal(RECU, 6)]
  const sin = area([cal(EXAMEN, 3), cal(TABOA, 8)], lista)
  ok(casi(sin.trimestres[1], 4), 'sin recuperar, un 4', String(sin.trimestres[1]))
  const con = area(cals, lista)
  ok(casi(con.trimestres[1], 6.4), 'recuperado, un 6,4: el examen pasa a 6 y la tabla sigue en 8', String(con.trimestres[1]))
  ok(casi(area(cals, lista, 'criterio').trimestres[1], 6.4), 'lo mismo con la regla del área por criterio')
  const proba = con.instrumentos.find(i => i.instrumento_id === PROBA)
  ok(casi(proba?.trimestres[1], 6), 'la «Proba escrita» resume un 6', String(proba?.trimestres[1]))
  ok(!con.instrumentos.some(i => i.instrumento_id === RECU), 'la recuperación no sale como instrumento aparte')
  const ap = recuperacionesAplicadas(cals, lista)
  ok(ap.length === 1 && ap[0].antes === 3 && ap[0].recuperacion === 6 && ap[0].despues === 6 && ap[0].familia_id === PROBA,
    'y se puede explicar: tenía 3, sacó 6, cuenta 6')
  ok(cals.find(c => c.instrumento_id === EXAMEN)!.valor === 3, 'la nota guardada del examen no se toca')
}

console.log('\n3. La recuperación no cuenta como una actividad más')
{
  const lista = instrumentos('mejor')
  // Si saca menos y la regla es «la mejor», todo queda como estaba: ni baja ni promedia.
  const r = area([cal(EXAMEN, 7), cal(RECU, 2)], lista)
  ok(casi(r.trimestres[1], 7), 'un 2 en la recuperación con un 7 en el examen deja el 7', String(r.trimestres[1]))
  ok(recuperacionesAplicadas([cal(EXAMEN, 7), cal(RECU, 2)], lista)[0].despues === 7, 'aplicada, sin cambio')
  ok(casi(area([cal(EXAMEN, 7), cal(RECU, 2)], instrumentos('sustituir')).trimestres[1], 2), 'con «la de la recuperación», baja a 2')
  ok(casi(area([cal(EXAMEN, 3), cal(RECU, 9)], instrumentos('tope')).trimestres[1], 5), 'con tope, un 9 se queda en 5')
}

console.log('\n4. Solo la unidad y el criterio con nota de recuperación')
{
  const lista = instrumentos('mejor')
  const cals = [
    cal(EXAMEN, 3), cal(RECU, 7),                                  // UD 100, CE1.1: recupera
    cal(EXAMEN, 2, { criterio_id: 'CE1.2' }),                       // UD 100, CE1.2: sin recuperación
    cal(EXAMEN, 4, { unidad_id: 200 }),                             // UD 200, CE1.1: otra unidad
  ]
  const salida = aplicarRecuperaciones(cals, lista)
  const de = (criterio: string, unidad: number) => salida.find(c => c.instrumento_id === EXAMEN && c.criterio_id === criterio && c.unidad_id === unidad)?.valor
  ok(de('CE1.1', 100) === 7, 'el criterio recuperado en su unidad entra con 7')
  ok(de('CE1.2', 100) === 2, 'el otro criterio de la unidad sigue en 2')
  ok(de('CE1.1', 200) === 4, 'el mismo criterio en otra unidad sigue en 4')
  ok(!salida.some(c => c.instrumento_id === RECU), 'la casilla de la recuperación no entra en el cálculo')
  const cr = area(cals, lista).criterios.find(c => c.criterio_id === 'CE1.1')
  ok(casi(cr?.trimestres[1], 5.5), 'el criterio en el trimestre es la media de las dos unidades: 7 y 4', String(cr?.trimestres[1]))
}

console.log('\n5. Varias actividades en el instrumento: se compara con su media')
{
  const lista = instrumentos('mejor', true)
  const cals = [cal(EXAMEN, 3), cal(EXAMEN2, 7), cal(RECU, 6)]
  const ap = recuperacionesAplicadas(cals, lista)
  ok(ap[0].antes === 5 && ap[0].despues === 6, 'tenía un 5 entre las dos (3 y 7) y la recuperación lo deja en 6')
  ok(casi(area(cals, lista).trimestres[1], 6), 'la nota del instrumento en ese criterio es 6', String(area(cals, lista).trimestres[1]))
}

console.log('\n6. Sin nada que recuperar, cuenta como una actividad')
{
  const lista = instrumentos('mejor')
  ok(casi(area([cal(RECU, 6)], lista).trimestres[1], 6), 'un alumno que no hizo el examen y hace la recuperación tiene su 6')
  ok(recuperacionesAplicadas([cal(RECU, 6)], lista).length === 0, 'y no se cuenta como recuperación aplicada')
  ok(casi(area([cal(EXAMEN, 3), cal(RECU, null)], lista).trimestres[1], 3), 'una recuperación sin nota no cambia nada')
}

console.log('\n7. Sin recuperaciones, todo como siempre')
{
  const lista = instrumentos(null)
  const cals = [cal(EXAMEN, 3), cal(RECU, 6), cal(TABOA, 8)]
  ok(aplicarRecuperaciones(cals, lista) === cals, 'sin ninguna recuperación en el área se devuelven las mismas notas')
  ok(casi(area(cals, lista).trimestres[1], 5.2), 'y una actividad sin regla promedia con el examen: (3+6)/2 al 80 % y 8 al 20 %', String(area(cals, lista).trimestres[1]))
}

console.log('\n8. Lo que la pantalla propone recuperar')
{
  const lista = instrumentos('mejor', true)
  const cals = [
    cal(EXAMEN, 3), cal(EXAMEN2, 5),                                  // CE1.1: un 4 → suspenso
    cal(EXAMEN, 8, { criterio_id: 'CE1.2' }),                          // CE1.2: aprobado
    cal(TABOA, 1, { criterio_id: 'CE1.2' }),                           // otro instrumento: no cuenta aquí
    cal(RECU, 9),                                                      // la propia recuperación tampoco
    cal(EXAMEN, 2, { alumno_id: 2, criterio_id: 'CE1.3' }),            // criterio que la columna no lleva
  ]
  const notas = notasARecuperar(cals, lista, RECU, ['CE1.1', 'CE1.2'])
  ok(notas.get(1)?.get('CE1.1') === 4 && estaSuspenso(notas.get(1)?.get('CE1.1')), 'el alumno 1 tiene CE1.1 suspenso con un 4 (antes de recuperar)')
  ok(notas.get(1)?.get('CE1.2') === 8, 'y CE1.2 aprobado con un 8: la tabla no entra')
  ok(!notas.has(2), 'un criterio fuera de la columna no se propone')
}

console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
