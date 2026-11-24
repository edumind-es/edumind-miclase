/**
 * La fuente «Emoji Lamina» cubre todos los emoji de la interfaz.
 *
 * Con el aspecto Lámina, cada emoji del código se ve como un icono de línea
 * porque una fuente propia lo dibuja así (scripts/generar_fuente_emoji.py). Si
 * alguien añade un emoji que la fuente no tiene, en Lámina saldría el del
 * sistema, en color, entre los iconos de línea. Esta prueba falla antes:
 *
 *  · todo emoji de `frontend/src` tiene dibujo en scripts/emoji_lamina.json;
 *  · la hoja generada (`emoji-lamina.css`) los nombra todos en `unicode-range`;
 *  · el fichero de la fuente existe y no está vacío.
 *
 * Arreglo: darle dibujo en el JSON y lanzar `python3 scripts/generar_fuente_emoji.py`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { RAIZ } from './lib/entorno.mjs'

let fallos = 0
const ok = (c, m, extra = '') => { console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`); if (!c) fallos++ }

const FUENTES = join(RAIZ, 'frontend/src')
const datos = JSON.parse(readFileSync(join(RAIZ, 'scripts/emoji_lamina.json'), 'utf8'))
const hoja = readFileSync(join(FUENTES, 'emoji-lamina.css'), 'utf8')

// Los informes van aparte: son documentos con su propia hoja, y no usan esta fuente
function ficheros(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) return relative(FUENTES, ruta) === 'informes' ? [] : ficheros(ruta)
    return /\.(tsx|ts)$/.test(e.name) ? [ruta] : []
  })
}
const enUso = new Map()
for (const f of ficheros(FUENTES))
  for (const e of readFileSync(f, 'utf8').match(/(?![©®™])\p{Extended_Pictographic}/gu) ?? [])
    enUso.set(e, [...(enUso.get(e) ?? []), relative(FUENTES, f)])

const sinDibujo = [...enUso.keys()].filter((e) => !datos.emoji[e])
ok(sinDibujo.length === 0, `los ${enUso.size} emoji de la interfaz tienen icono de línea`,
  sinDibujo.map((e) => `${e} (${[...new Set(enUso.get(e))].slice(0, 2).join(', ')})`).join(' · '))

const rango = new Set((hoja.match(/U\+[0-9A-F]+/g) ?? []).map((u) => parseInt(u.slice(2), 16)))
const fueraDeRango = Object.keys(datos.emoji).filter((e) => !rango.has(e.codePointAt(0)))
ok(fueraDeRango.length === 0, 'la hoja generada los nombra todos en unicode-range', fueraDeRango.join(' '))
ok(rango.has(0xFE0F), 'y el selector de variación que suele seguirles, para que no pida el emoji de color')

const sinDefinir = [...new Set(Object.values(datos.emoji))].filter((d) => !datos.dibujos[d])
ok(sinDefinir.length === 0, 'cada emoji apunta a un dibujo que existe', sinDefinir.join(' '))
const conArcos = Object.entries(datos.dibujos).filter(([, piezas]) => piezas.some((p) => typeof p === 'string' && /[AaQqTt]/.test(p))).map(([n]) => n)
ok(conArcos.length === 0, 'los dibujos solo usan lo que el generador sabe trazar (M L H V Z C S)', conArcos.join(' '))

const fuente = join(RAIZ, 'frontend/public/fonts/EmojiLamina.woff')
ok(statSync(fuente).size > 2000 && readFileSync(fuente).subarray(0, 4).toString() === 'wOFF', 'la fuente está generada y es un WOFF', `${statSync(fuente).size} bytes`)
ok(/font-family: 'Emoji Lamina'/.test(hoja) && /--f-display: 'Emoji Lamina'/.test(readFileSync(join(FUENTES, 'lamina.css'), 'utf8')), 'y va la primera en la pila tipográfica de Lámina')

console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
