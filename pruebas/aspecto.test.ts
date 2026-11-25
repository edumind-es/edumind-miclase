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

console.log('\n── Lámina por defecto desde la 2.0.0 ──')
ok(normalizarAspecto(null) === 'lamina', 'un aparato que no ha elegido ve Lámina')
ok(normalizarAspecto('clasico') === 'clasico', '«clasico» deja el aspecto de siempre')
ok(normalizarAspecto('Lamina') === 'lamina' && normalizarAspecto('') === 'lamina' && normalizarAspecto(1) === 'lamina', 'cualquier otra cosa es el aspecto por defecto')
ok(normalizarAspecto(null, 'clasico') === 'clasico', 'el aspecto por defecto se puede pasar')

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
