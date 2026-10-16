/**
 * Unidades estancas: qué unidad recibe una nota antigua que no la trae.
 *
 * La regla es la misma en la migración del esquema, al restaurar una copia
 * anterior y al recibir filas de un aparato sin actualizar, así que se prueba
 * una vez, en puro.
 */
import {
  SIN_UNIDAD, claveUnidad, prepararContexto, unidadParaFila, asignarUnidades,
} from '../frontend/src/db/migracionUnidades'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const u = (id: number, asignatura_id: number, trimestre: number | null, orden: number, deleted_at: string | null = null) =>
  ({ id, asignatura_id, trimestre, orden, deleted_at })
const i = (id: number, asignatura_id: number) => ({ id, asignatura_id })
const ci = (unidad_id: number, criterio_id: string, instrumento_id: number) => ({ unidad_id, criterio_id, instrumento_id })

// Área 1: UD1 y UD2 en el primer trimestre, UD3 en el segundo. Área 2: sin unidades.
const ctx = prepararContexto({
  unidades: [u(2, 1, 1, 1), u(1, 1, 1, 0), u(3, 1, 2, 2), u(9, 1, 1, 9, '2026-01-01')],
  instrumentos: [i(10, 1), i(11, 1), i(20, 2)],
  criterio_instrumentos: [ci(1, 'CE1.1', 10), ci(2, 'CE1.2', 10), ci(2, 'CE1.1', 11)],
})

console.log('\n1. La unidad que ya trae la fila manda')
{
  const r = unidadParaFila({ instrumento_id: 10, trimestre: 1, unidad_id: 2, criterios: ['CE1.1'] }, ctx)
  ok(r.unidad_id === 2 && r.motivo === 'propia', 'se respeta aunque otra unidad programe ese criterio', `${r.unidad_id} ${r.motivo}`)
}

console.log('\n2. La unidad del trimestre que programa ese criterio con ese instrumento')
{
  const a = unidadParaFila({ instrumento_id: 10, trimestre: 1, unidad_id: null, criterios: ['CE1.1'] }, ctx)
  ok(a.unidad_id === 1 && a.motivo === 'programada', 'CE1.1 con el 10 lo programa la UD1', `${a.unidad_id} ${a.motivo}`)
  const b = unidadParaFila({ instrumento_id: 10, trimestre: 1, criterios: ['CE1.2'] }, ctx)
  ok(b.unidad_id === 2 && b.motivo === 'programada', 'CE1.2 con el 10 lo programa la UD2', `${b.unidad_id} ${b.motivo}`)
  const c = unidadParaFila({ instrumento_id: 11, trimestre: 1, criterios: ['CE1.1'] }, ctx)
  ok(c.unidad_id === 2 && c.motivo === 'programada', 'el mismo criterio con otro instrumento va a la unidad que lo programa con ese', `${c.unidad_id}`)
  const d = unidadParaFila({ instrumento_id: 10, trimestre: 1, criterios: ['CE9.9', 'CE1.2'] }, ctx)
  ok(d.unidad_id === 2, 'un registro del diario con varios criterios: basta con que programe uno', `${d.unidad_id}`)
}

console.log('\n3. Sin programación que decida')
{
  const unica = unidadParaFila({ instrumento_id: 10, trimestre: 2, criterios: ['CE1.1'] }, ctx)
  ok(unica.unidad_id === 3 && unica.motivo === 'unica', 'la única unidad del trimestre', `${unica.unidad_id} ${unica.motivo}`)
  const primera = unidadParaFila({ instrumento_id: 10, trimestre: 1, criterios: ['CE7.7'] }, ctx)
  ok(primera.unidad_id === 1 && primera.motivo === 'primera', 'varias y ninguna lo programa: la primera por orden (no por id)', `${primera.unidad_id} ${primera.motivo}`)
  const otroTrim = unidadParaFila({ instrumento_id: 10, trimestre: 3, criterios: ['CE1.1'] }, ctx)
  ok(otroTrim.unidad_id === 1 && otroTrim.motivo === 'programada', 'un trimestre sin unidades cae a las del área, y ahí manda la que programa', `${otroTrim.unidad_id} ${otroTrim.motivo}`)
  const otroTrimSuelto = unidadParaFila({ instrumento_id: 10, trimestre: 3, criterios: ['CE7.7'] }, ctx)
  ok(otroTrimSuelto.unidad_id === 1 && otroTrimSuelto.motivo === 'primera', 'y si ninguna lo programa, la primera del área', `${otroTrimSuelto.unidad_id} ${otroTrimSuelto.motivo}`)
  const borrada = unidadParaFila({ instrumento_id: 10, trimestre: 1, criterios: ['CE7.7'] }, ctx)
  ok(borrada.unidad_id !== 9, 'una unidad borrada no recibe nada')
}

console.log('\n4. Un área sin unidades')
{
  const r = unidadParaFila({ instrumento_id: 20, trimestre: 1, criterios: ['CE1.1'] }, ctx)
  ok(r.unidad_id === SIN_UNIDAD && r.motivo === 'ninguna', 'queda en el cajón «sin unidad»', `${r.unidad_id} ${r.motivo}`)
  const huerfano = unidadParaFila({ instrumento_id: 99, trimestre: 1, criterios: ['CE1.1'] }, ctx)
  ok(huerfano.unidad_id === SIN_UNIDAD, 'un instrumento que ya no existe, también')
  ok(claveUnidad(null) === SIN_UNIDAD && claveUnidad(undefined) === SIN_UNIDAD && claveUnidad(5) === 5,
     'la pantalla sin unidad califica en ese cajón; con unidad, en la suya')
}

console.log('\n5. Una copia de seguridad anterior, entera')
{
  const cal = (id: number, instrumento_id: number, criterio_id: string, unidad_id: number | null = null) =>
    ({ id, instrumento_id, trimestre: 1, criterio_id, unidad_id, alumno_id: 1 })
  const r = asignarUnidades(
    [cal(1, 10, 'CE1.1'), cal(2, 10, 'CE1.1', 2), cal(3, 10, 'CE7.7'), cal(4, 20, 'CE1.1')],
    [{ id: 1, instrumento_id: 10, trimestre: 1, unidad_id: null, criterios_json: '["CE1.2"]' },
     { id: 2, instrumento_id: 10, trimestre: 1, unidad_id: null, criterios_json: 'basura' }],
    {
      unidades: [u(1, 1, 1, 0), u(2, 1, 1, 1)],
      instrumentos: [i(10, 1), i(20, 2)],
      criterio_instrumentos: [ci(1, 'CE1.1', 10), ci(2, 'CE1.2', 10)],
    })
  ok(r.calificaciones.map(c => c.unidad_id).join() === '1,2,1,0', 'cada nota a su sitio; la que traía unidad no cambia', r.calificaciones.map(c => c.unidad_id).join())
  ok(r.diario.map(d => d.unidad_id).join() === '2,1', 'el diario igual; un criterios_json roto cae a la primera', r.diario.map(d => d.unidad_id).join())
  ok(r.resumen.asignadas === 5 && r.resumen.primera === 2 && r.resumen.sinUnidad === 1,
     'el resumen cuenta lo asignado, lo que fue a la primera y lo que quedó sin unidad',
     JSON.stringify(r.resumen))
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
