/**
 * El interruptor del aspecto Lámina, en lo que tiene de puro: qué cuenta como
 * «lamina», qué pide una dirección y cómo queda la dirección una vez leída.
 * Lo que se ve en pantalla lo comprueba aspecto-ui.test.mjs.
 */
import { normalizarAspecto, aspectoDeUrl, sinAspecto, COLOR_SISTEMA } from '../frontend/src/aspecto'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

console.log('\n── Apagado salvo que se pida ──')
ok(normalizarAspecto(null) === 'clasico', 'un aparato que no ha elegido ve el aspecto de siempre')
ok(normalizarAspecto('lamina') === 'lamina', '«lamina» enciende Lámina')
ok(normalizarAspecto('Lamina') === 'clasico' && normalizarAspecto('') === 'clasico' && normalizarAspecto(1) === 'clasico', 'cualquier otra cosa es el aspecto de siempre')

console.log('\n── Lo que pide la dirección ──')
ok(aspectoDeUrl('?aspecto=lamina') === 'lamina', '?aspecto=lamina lo enciende')
ok(aspectoDeUrl('?aspecto=clasico') === 'clasico', '?aspecto=clasico lo apaga')
ok(aspectoDeUrl('?grupo_id=3&aspecto=lamina') === 'lamina', 'vale junto a otros parámetros')
ok(aspectoDeUrl('') === null && aspectoDeUrl('?grupo_id=3') === null, 'sin parámetro no pide nada: manda lo recordado')
ok(aspectoDeUrl('?aspecto=noche') === null, 'un aspecto que no existe no cambia nada')

console.log('\n── La dirección queda limpia ──')
ok(sinAspecto('?aspecto=lamina') === '', 'sin más parámetros no queda ni el interrogante')
ok(sinAspecto('?grupo_id=3&aspecto=lamina&unidad_id=7') === '?grupo_id=3&unidad_id=7', 'los demás parámetros se conservan', sinAspecto('?grupo_id=3&aspecto=lamina&unidad_id=7'))

console.log('\n── Color de la barra del sistema ──')
ok(/^#[0-9a-f]{6}$/.test(COLOR_SISTEMA.clasico) && /^#[0-9a-f]{6}$/.test(COLOR_SISTEMA.lamina) && COLOR_SISTEMA.clasico !== COLOR_SISTEMA.lamina, 'cada aspecto tiene el suyo')

console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
