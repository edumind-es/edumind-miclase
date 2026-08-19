/**
 * Fusión a tres bandas de la sincronización.
 * Es la pieza que decide qué se conserva cuando dos dispositivos han tocado
 * el mismo registro, así que conviene tenerla clavada.
 */
import { fusionarTresBandas } from '../frontend/src/db/sync'

let fallos = 0
const ok = (c: boolean, m: string, extra = '') => {
  console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!c) fallos++
}

const T = (n: number) => `2026-08-19T10:0${n}:00.000Z`

console.log('\n1. Cambios en campos distintos: se conservan los dos')
{
  const base   = { id: 1, nombre: 'Lucía', apellidos: 'Castro', neae: 0, updated_at: T(0) }
  const local  = { id: 1, nombre: 'Lucía', apellidos: 'Castro Ríos', neae: 0, updated_at: T(1) }
  const remoto = { id: 1, nombre: 'Lucía', apellidos: 'Castro', neae: 1, updated_at: T(2) }
  const { registro, huboFusion } = fusionarTresBandas(base, local, remoto)
  ok(registro.apellidos === 'Castro Ríos', 'se conserva el apellido corregido en el portátil', registro.apellidos)
  ok(registro.neae === 1, 'y también el NEAE marcado en la tablet', String(registro.neae))
  ok(huboFusion, 'se marca como fusión, para devolver el resultado al servidor')
}

console.log('\n2. Mismo campo tocado por los dos: gana el más reciente')
{
  const base   = { id: 1, nombre: '3ºA', updated_at: T(0) }
  const local  = { id: 1, nombre: '3ºA portátil', updated_at: T(1) }
  const remoto = { id: 1, nombre: '3ºA tablet', updated_at: T(2) }
  const { registro } = fusionarTresBandas(base, local, remoto)
  ok(registro.nombre === '3ºA tablet', 'gana el cambio posterior', registro.nombre)
}

console.log('\n3. Mismo campo, pero el local es el más reciente')
{
  const base   = { id: 1, nombre: '3ºA', updated_at: T(0) }
  const local  = { id: 1, nombre: '3ºA portátil', updated_at: T(3) }
  const remoto = { id: 1, nombre: '3ºA tablet', updated_at: T(2) }
  const { registro, huboFusion } = fusionarTresBandas(base, local, remoto)
  ok(registro.nombre === '3ºA portátil', 'se conserva el cambio local', registro.nombre)
  ok(huboFusion, 'y hay que devolvérselo al servidor, que está desactualizado')
}

console.log('\n4. Solo cambió el remoto: se acepta sin más')
{
  const base   = { id: 1, valor: 7, observacion: null, updated_at: T(0) }
  const local  = { id: 1, valor: 7, observacion: null, updated_at: T(0) }
  const remoto = { id: 1, valor: 9, observacion: null, updated_at: T(2) }
  const { registro, huboFusion } = fusionarTresBandas(base, local, remoto)
  ok(registro.valor === 9, 'se coge la nota del otro dispositivo', String(registro.valor))
  ok(!huboFusion, 'no hace falta devolver nada: coincide con el servidor')
  ok(registro.updated_at === T(2), 'y conserva el sello del remoto', registro.updated_at)
}

console.log('\n5. Solo cambió el local: no se pisa')
{
  const base   = { id: 1, valor: 7, updated_at: T(0) }
  const local  = { id: 1, valor: 10, updated_at: T(3) }
  const remoto = { id: 1, valor: 7, updated_at: T(1) }
  const { registro, huboFusion } = fusionarTresBandas(base, local, remoto)
  ok(registro.valor === 10, 'la nota puesta aquí sobrevive', String(registro.valor))
  ok(huboFusion, 'y se reenvía al servidor')
}

console.log('\n6. Un borrado en un lado y una edición en el otro')
{
  const base   = { id: 1, nombre: 'SA 3', deleted_at: null, updated_at: T(0) }
  const local  = { id: 1, nombre: 'SA 3 revisada', deleted_at: null, updated_at: T(1) }
  const remoto = { id: 1, nombre: 'SA 3', deleted_at: T(2), updated_at: T(2) }
  const { registro } = fusionarTresBandas(base, local, remoto)
  ok(registro.deleted_at === T(2), 'el borrado se propaga (solo lo cambió un lado)', String(registro.deleted_at))
  ok(registro.nombre === 'SA 3 revisada', 'y el nombre editado no se pierde por el camino', registro.nombre)
}

console.log('\n7. Campos JSON: se comparan por contenido, no por referencia')
{
  const base   = { id: 1, trimestres: '[1,2,3]', etiquetas: '[]', updated_at: T(0) }
  const local  = { id: 1, trimestres: '[1,2,3]', etiquetas: '["refuerzo"]', updated_at: T(1) }
  const remoto = { id: 1, trimestres: '[1,2]',   etiquetas: '[]', updated_at: T(2) }
  const { registro } = fusionarTresBandas(base, local, remoto)
  ok(registro.trimestres === '[1,2]', 'se coge el cambio de trimestres del remoto', registro.trimestres)
  ok(registro.etiquetas === '["refuerzo"]', 'y se conserva la etiqueta puesta aquí', registro.etiquetas)
}

console.log('\n8. Sin cambios por ninguna parte')
{
  const base   = { id: 1, nombre: 'igual', updated_at: T(0) }
  const local  = { id: 1, nombre: 'igual', updated_at: T(0) }
  const remoto = { id: 1, nombre: 'igual', updated_at: T(1) }
  const { registro, huboFusion } = fusionarTresBandas(base, local, remoto)
  ok(!huboFusion, 'no se inventa una fusión donde no la hay')
  ok(registro.nombre === 'igual', 'y el registro queda como estaba')
}

console.log('\n9. El blob de una evidencia llega solo si aquí no lo teníamos')
{
  const falso = { size: 10 } as any
  const base   = { id: 1, descripcion: 'a', updated_at: T(0) }
  const local  = { id: 1, descripcion: 'a', updated_at: T(0) }
  const remoto = { id: 1, descripcion: 'a', blob: falso, updated_at: T(1) }
  const { registro } = fusionarTresBandas(base, local, remoto)
  ok(registro.blob === falso, 'se adopta el blob del remoto cuando falta el local')

  const local2 = { id: 1, descripcion: 'a', blob: { size: 99 } as any, updated_at: T(0) }
  const r2 = fusionarTresBandas(base, local2, remoto)
  ok(r2.registro.blob.size === 99, 'pero no se pisa el blob que ya está aquí')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
