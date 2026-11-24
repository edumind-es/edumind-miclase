/**
 * Idiomas de la app: castellano y galego.
 *
 * Lo que se vigila: que el galego tenga todas las claves del castellano (el
 * tipo ya lo exige, pero aquí se ve con nombre), que ninguna traducción esté
 * vacía ni pierda o invente una variable `{…}`, que las variables se
 * sustituyan, y que la propuesta de la primera vez siga los idiomas del
 * navegador.
 */
import { TEXTOS, IDIOMAS, traducir, variablesDe, idiomaPropuesto, esIdioma, NOMBRE_IDIOMA } from '../frontend/src/i18n/textos'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

console.log('\n── Diccionarios ──')
const claves = Object.keys(TEXTOS.es)
for (const idioma of IDIOMAS) {
  const faltan = claves.filter(c => !(c in TEXTOS[idioma]))
  ok(faltan.length === 0, `${NOMBRE_IDIOMA[idioma]} tiene las ${claves.length} claves`, faltan.join(', '))
  const sobran = Object.keys(TEXTOS[idioma]).filter(c => !(c in TEXTOS.es))
  ok(sobran.length === 0, `${NOMBRE_IDIOMA[idioma]} no trae claves que no existen`, sobran.join(', '))
  const vacias = claves.filter(c => !(TEXTOS[idioma] as Record<string, string>)[c]?.trim())
  ok(vacias.length === 0, `${NOMBRE_IDIOMA[idioma]} sin textos vacíos`, vacias.join(', '))
  const malas = claves.filter(c =>
    variablesDe((TEXTOS[idioma] as Record<string, string>)[c] ?? '').join() !== variablesDe((TEXTOS.es as Record<string, string>)[c]).join())
  ok(malas.length === 0, `${NOMBRE_IDIOMA[idioma]} con las mismas variables que el castellano`, malas.join(', '))
}
const sinTraducir = claves.filter(c =>
  (TEXTOS.gl as Record<string, string>)[c] === (TEXTOS.es as Record<string, string>)[c] && /[a-záéíóú]{4,}/i.test((TEXTOS.es as Record<string, string>)[c]))
console.log(`  · ${sinTraducir.length} textos iguales en los dos idiomas (normal en «Aula», «Informes»…)`)

console.log('\n── Traducir ──')
ok(traducir('gl', 'menu.calificador') === 'Cualificador', 'galego: Calificador → Cualificador')
ok(traducir('es', 'inicio.alumnos', { n: 24 }) === '24 alumnos', 'sustituye {n}')
ok(traducir('gl', 'marcha.falta', { clase: '6ºA', paso: 2, total: 6 }) === 'Falta configurar 6ºA — paso 2 de 6', 'sustituye varias variables')
ok(traducir('es', 'inicio.alumnos') === '{n} alumnos', 'sin variables deja la plantilla')
ok(traducir('gl', 'marcha.p4.detalle', { unidades: 3 }).includes('{criterios}'), 'una variable que no llega se queda visible, no desaparece')

console.log('\n── Idioma propuesto ──')
ok(idiomaPropuesto(['gl-ES', 'es-ES']) === 'gl', 'gl-ES primero → galego')
ok(idiomaPropuesto(['es-ES', 'gl']) === 'es', 'es-ES primero → castellano')
ok(idiomaPropuesto(['en-GB', 'gl']) === 'gl', 'inglés y luego galego → galego')
ok(idiomaPropuesto(['fr-FR']) === 'es', 'sin ninguno de los dos → castellano')
ok(idiomaPropuesto([]) === 'es', 'sin idiomas → castellano')
ok(esIdioma('gl') && esIdioma('es') && !esIdioma('pt') && !esIdioma(null), 'esIdioma reconoce solo es y gl')

console.log(fallos ? `\n✗ ${fallos} fallos` : '\n✓ Idiomas: todo bien')
process.exit(fallos ? 1 : 0)
