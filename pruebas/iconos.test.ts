/**
 * La familia de iconos: que estén los que el marco necesita, que todos sigan
 * las reglas del dibujo (solo línea, dentro de la rejilla de 24) y que la
 * pieza de React y el texto SVG pinten lo mismo.
 */
// React vive en frontend/node_modules: desde pruebas/ hay que ir a buscarlo
import { createElement } from '../frontend/node_modules/react'
import { renderToStaticMarkup } from '../frontend/node_modules/react-dom/server'
import { ICONOS, iconoSVG, type NombreIcono } from '../frontend/src/iconos'
import Icono from '../frontend/src/components/comunes/Icono'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const nombres = Object.keys(ICONOS) as NombreIcono[]

console.log('\n── Están los que hacen falta ──')
// Las diez pantallas del menú del modelo aprobado y lo que usa el marco
const MENU = ['inicio', 'planificacion', 'calificador', 'examenes', 'asistencia', 'seguimiento', 'tutorias', 'informes', 'clases', 'sincronizar']
const MARCO = ['panel', 'mas', 'rejilla', 'anterior', 'siguiente', 'cerrar', 'importar']
const faltan = [...MENU, ...MARCO].filter((n) => !(n in ICONOS))
ok(faltan.length === 0, `las ${MENU.length} pantallas del menú y las ${MARCO.length} piezas del marco tienen icono`, faltan.join(', '))
ok(nombres.every((n) => /^[a-z]+$/.test(n)), 'los nombres son una palabra en minúsculas, sin tildes', nombres.filter((n) => !/^[a-z]+$/.test(n)).join(', '))

console.log('\n── Reglas del dibujo ──')
const fuera: string[] = [], conRelleno: string[] = [], vacios: string[] = []
for (const n of nombres) {
  const trazos = ICONOS[n]
  if (!trazos.length) vacios.push(n)
  for (const t of trazos) {
    if ('d' in t) {
      if (/fill|stroke|style/i.test(t.d)) conRelleno.push(n)
      // Las coordenadas absolutas del trazo (tras M, L, H, V) caben en la rejilla
      const absolutas = [...t.d.matchAll(/[MLHV]\s*([\d.\s,-]+)/g)].flatMap((m) => m[1].trim().split(/[\s,]+/).map(Number))
      if (absolutas.some((v) => Number.isNaN(v) || v < 0 || v > 24)) fuera.push(n)
      if (!/^M/.test(t.d)) fuera.push(n)
    } else if (t.cx - t.r < 0 || t.cx + t.r > 24 || t.cy - t.r < 0 || t.cy + t.r > 24) fuera.push(n)
  }
}
ok(vacios.length === 0, 'ningún icono está vacío', vacios.join(', '))
ok(fuera.length === 0, 'todos caben en la rejilla de 24', [...new Set(fuera)].join(', '))
ok(conRelleno.length === 0, 'ninguno trae color ni relleno propio', conRelleno.join(', '))

console.log('\n── La pieza y el texto pintan lo mismo ──')
const sinEspacios = (s: string) => s.replace(/\s+/g, ' ')
for (const n of ['inicio', 'alumnado', 'camara'] as NombreIcono[]) {
  const pieza = renderToStaticMarkup(createElement(Icono, { nombre: n }))
  const texto = iconoSVG(n)
  const trazos = (s: string) => [...s.matchAll(/<(path|circle)[^>]*>/g)].map((m) => m[0].replace(/\s*\/?>$/, '').replace(/"\s*\/$/, '"')).join('|')
  ok(sinEspacios(trazos(pieza)) === sinEspacios(trazos(texto)), `«${n}»: mismos trazos`, `${trazos(pieza)} ≠ ${trazos(texto)}`)
  for (const s of [pieza, texto])
    ok(/fill="none"/.test(s) && /stroke="currentColor"/.test(s) && /stroke-width="1.5"/.test(s) && /stroke-linecap="square"/.test(s), `«${n}»: solo línea, del color del texto`)
}

console.log('\n── Accesible ──')
const adorno = renderToStaticMarkup(createElement(Icono, { nombre: 'imprimir' }))
ok(/aria-hidden="true"/.test(adorno) && !/role=/.test(adorno), 'junto a su palabra, se esconde a los lectores de pantalla')
const solo = renderToStaticMarkup(createElement(Icono, { nombre: 'cerrar', titulo: 'Cerrar' }))
ok(/role="img"/.test(solo) && /aria-label="Cerrar"/.test(solo) && !/aria-hidden/.test(solo), 'solo, se anuncia con su título')
ok(/width="18"/.test(renderToStaticMarkup(createElement(Icono, { nombre: 'editar', lado: 18 }))), 'el lado se puede cambiar')

console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
