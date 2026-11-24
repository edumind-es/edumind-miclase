/**
 * El trinquete del aspecto Lámina: lo que hay que quitar solo puede bajar.
 *
 * La interfaz llegó aquí con cientos de esquinas redondeadas, sombras, emoji,
 * desplegables del sistema y colores escritos a mano en cada pantalla. Pasarla
 * a Lámina es quitarlos fase a fase, y mientras tanto siguen entrando arreglos
 * y pantallas nuevas por otras ramas. Esta prueba cuenta cada cosa en
 * `frontend/src` y falla si alguna cifra SUBE respecto a `trinquete.json`: lo
 * nuevo no puede traer lo que se está retirando.
 *
 * Si una cifra baja, pasa y lo dice. El tope se baja al cerrar cada fase con
 *
 *     node pruebas/trinquete.test.mjs --fijar
 *
 * y no en cada PR: si cada uno tocase `trinquete.json`, dos PR a la vez
 * chocarían siempre en ese fichero.
 *
 * Solo se EXIGE lo que ya tiene con qué sustituirse: radios, sombras y
 * degradados (tokens de lamina.css) y emoji (pieza Icono). Desplegables,
 * colores a mano y estilos en línea se cuentan y se enseñan, pero no hacen
 * fallar hasta que existan sus piezas (`Lista` y compañía, fase 2): exigirlo
 * antes dejaría sin salida a quien arregla otra cosa. Para empezar a exigir
 * una medida basta quitarle `desde`.
 *
 * No se cuentan los informes (`src/informes/`, documentos con su propia hoja)
 * ni AulaMap (`public/`, código ajeno).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { RAIZ } from './lib/entorno.mjs'

const FUENTES = join(RAIZ, 'frontend/src')
const TOPES = join(RAIZ, 'pruebas/trinquete.json')
const FUERA = ['informes/']

/** Qué se cuenta, en qué ficheros y por qué se quiere a cero. */
const MEDIDAS = {
  radios:       { en: /\.(tsx|css)$/, que: /(?:border-?radius|borderRadius|border(?:Top|Bottom)(?:Left|Right)Radius)(?!\s*:\s*['"]?0\b)/g, nota: 'esquinas redondeadas' },   // «: 0» es quitarlas, no ponerlas
  sombras:      { en: /\.(tsx|css)$/, que: /(?:box-shadow|boxShadow)(?!\s*:\s*['"]?none)/g, nota: 'sombras' },   // «: none» es quitarla
  degradados:   { en: /\.(tsx|css)$/, que: /gradient\(/g, nota: 'degradados' },
  emoji:        { en: /\.(tsx|ts)$/,  que: /(?![©®™])\p{Extended_Pictographic}/gu, nota: 'emoji: cada sistema los dibuja a su manera' },   // ©, ® y ™ son texto, no dibujos
  desplegables: { en: /\.tsx$/,       que: /<select\b/g, nota: 'desplegables del sistema', desde: 'la pieza Lista (fase 2)' },
  coloresAMano: { en: /\.tsx$/,       que: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(/g, nota: 'colores escritos en la pantalla en vez de por nombre', desde: 'las piezas comunes (fase 2)' },
  estilosEnLinea: { en: /\.tsx$/,     que: /style=\{\{/g, nota: 'estilos en línea: los tokens no los alcanzan', desde: 'las piezas comunes (fase 2)' },
}

function ficheros(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name), rel = relative(FUENTES, ruta) + (e.isDirectory() ? '/' : '')
    if (FUERA.some((f) => rel.startsWith(f))) return []
    return e.isDirectory() ? ficheros(ruta) : [ruta]
  })
}

function contar() {
  const cuenta = Object.fromEntries(Object.keys(MEDIDAS).map((m) => [m, { total: 0, porFichero: {} }]))
  for (const f of ficheros(FUENTES)) {
    let texto = null
    for (const [m, { en, que }] of Object.entries(MEDIDAS)) {
      if (!en.test(f)) continue
      texto ??= readFileSync(f, 'utf8')
      const n = texto.match(que)?.length ?? 0
      if (n) { cuenta[m].total += n; cuenta[m].porFichero[relative(FUENTES, f)] = n }
    }
  }
  return cuenta
}

const cuenta = contar()
const ahora = Object.fromEntries(Object.entries(cuenta).map(([m, c]) => [m, c.total]))

if (process.argv.includes('--fijar')) {
  writeFileSync(TOPES, JSON.stringify(ahora, null, 2) + '\n')
  console.log('Topes fijados en pruebas/trinquete.json:')
  for (const [m, n] of Object.entries(ahora)) console.log(`  ${m}: ${n}`)
  process.exit(0)
}

const topes = JSON.parse(readFileSync(TOPES, 'utf8'))
let fallos = 0, bajan = 0
for (const [m, { nota, desde }] of Object.entries(MEDIDAS)) {
  const n = ahora[m], tope = topes[m]
  if (tope == null) { console.log(`  ✗ FALLO ${m}: no tiene tope en trinquete.json`); fallos++; continue }
  if (desde) {
    const d = n - tope
    console.log(`  · ${m}: ${n}${d ? ` (${d > 0 ? '+' : ''}${d} sobre ${tope})` : ''} — se exigirá con ${desde}`)
  } else if (n > tope) {
    fallos++
    console.log(`  ✗ FALLO ${m}: ${n}, y el tope es ${tope} (+${n - tope}) — ${nota}`)
    // Dónde hay más: por ahí habrá entrado
    const peores = Object.entries(cuenta[m].porFichero).sort((a, b) => b[1] - a[1]).slice(0, 5)
    for (const [f, k] of peores) console.log(`      ${String(k).padStart(4)}  ${f}`)
  } else {
    if (n < tope) bajan++
    console.log(`  ✓ ${m}: ${n}${n < tope ? ` (baja ${tope - n} del tope, ${tope})` : ''}`)
  }
}
if (bajan && !fallos) console.log('\n  Hay cifras por debajo del tope. Al cerrar la fase: node pruebas/trinquete.test.mjs --fijar')
if (fallos) console.log('\n  Lo nuevo no puede traer lo que Lámina está retirando: usa los tokens de lamina.css,\n  la pieza Icono en vez de un emoji y las piezas comunes en vez de estilos en línea.')

console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
