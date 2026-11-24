/**
 * El candado del protocolo de versiones.
 *
 * MiClase llegó a 130 PR con «0.1.0» en los package.json, «v1.0» escrito a mano
 * en el pie del menú, sin CHANGELOG y sin una sola etiqueta: había protocolo en
 * otros proyectos de EDUmind, pero aquí nada obligaba a seguirlo. Esta prueba
 * corre en cada commit y en cada despliegue, y falla si:
 *
 *  · la versión no está escrita igual en todos sus sitios;
 *  · la versión actual no es la primera entrada del CHANGELOG;
 *  · alguien vuelve a escribir un número de versión a mano en la app.
 *
 * iOS solo avisa: su versión se sube en Xcode, no desde aquí.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CHANGELOG, RAIZ, SEMVER, SIN_PUBLICAR, entradasChangelog, siguiente, versionActual, versionesEscritas, versionesIOS } from '../scripts/version.mjs'

let fallos = 0
const ok = (c, m, extra = '') => {
  console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!c) fallos++
}

const version = versionActual()
ok(SEMVER.test(version), `la versión es mayor.menor.parche`, version)

console.log('\nUn solo número en todos los sitios')
for (const [sitio, v] of Object.entries(versionesEscritas())) ok(v === version, sitio, v === version ? '' : `dice ${v}, debería decir ${version}`)

console.log('\nCHANGELOG')
const log = readFileSync(join(RAIZ, CHANGELOG), 'utf8')
const entradas = entradasChangelog()
ok(log.includes(SIN_PUBLICAR), `tiene la sección «${SIN_PUBLICAR}»`)
ok(entradas[0]?.version === version, `la primera entrada es la ${version}`, entradas[0] ? `es la ${entradas[0].version}` : 'no hay ninguna')
ok(log.indexOf(SIN_PUBLICAR) < log.indexOf(`## [${version}]`), '«Sin publicar» va encima de la versión actual')
const ordenadas = entradas.every((e, i) => i === 0 || comparar(entradas[i - 1].version, e.version) > 0)
ok(ordenadas, 'las entradas van de la más nueva a la más vieja')

console.log('\nLa app la lee, no la escribe')
const config = readFileSync(join(RAIZ, 'frontend/vite.config.ts'), 'utf8')
ok(config.includes('__VERSION__'), 'vite.config.ts define __VERSION__')
ok(readFileSync(join(RAIZ, 'frontend/src/version.ts'), 'utf8').includes('__VERSION__'), 'version.ts la toma de __VERSION__')
const aMano = fuentes(join(RAIZ, 'frontend/src')).filter((f) => /MiClase v\d/.test(readFileSync(f, 'utf8')))
ok(aMano.length === 0, 'ninguna pantalla lleva la versión escrita a mano', aMano.map((f) => f.replace(RAIZ + '/', '')).join(', '))

console.log('\nSubida')
ok(siguiente('1.9.3', 'parche') === '1.9.4' && siguiente('1.9.3', 'menor') === '1.10.0' && siguiente('1.9.3', 'mayor') === '2.0.0', 'parche, menor y mayor suben lo que toca')

// iOS: se dice, no se exige
const ios = versionesIOS()
if (ios.some((v) => v !== version && v !== version.replace(/\.0$/, '')))
  console.log(`\n  ⚠ iOS dice ${ios.join(' y ')} y la app ${version}: súbela en Xcode antes de publicar en la App Store`)

function comparar(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}
function fuentes(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fuentes(join(dir, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [join(dir, e.name)] : [])
}

console.log(fallos ? `\n${fallos} fallos` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
