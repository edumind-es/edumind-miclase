/**
 * La versión de MiClase, en un solo sitio.
 *
 * La fuente es `version` del package.json de la raíz. Este fichero sabe en qué
 * otros sitios está escrita (los otros dos package.json, sus package-lock y el
 * proyecto de Android) y los pone de acuerdo. Lo usan:
 *
 *   npm run version:subir -- parche|menor|mayor    sube el número en todos y
 *                                                  sella «Sin publicar» en el CHANGELOG
 *   pruebas/version.test.mjs                       comprueba que siguen de acuerdo
 *   frontend/vite.config.ts                        la mete en la app al compilar
 *
 * iOS no está: `MARKETING_VERSION` vive en project.pbxproj, que no se edita a
 * mano. Se sube en Xcode, y la prueba avisa cuando no coincide.
 *
 * Regla de subida: mayor = cambia cómo se usa la app o exige actualizar todos
 * los aparatos; menor = función nueva; parche = arreglo.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
export const PAQUETES = ['package.json', 'frontend/package.json', 'backend/package.json']
export const BLOQUEOS = ['package-lock.json', 'frontend/package-lock.json', 'backend/package-lock.json']
export const GRADLE = 'frontend/android/app/build.gradle'
export const PBXPROJ = 'frontend/ios/App/App.xcodeproj/project.pbxproj'
export const CHANGELOG = 'CHANGELOG.md'
export const SIN_PUBLICAR = '## [Sin publicar]'
export const SEMVER = /^\d+\.\d+\.\d+$/

const leer = (f) => readFileSync(join(RAIZ, f), 'utf8')
const escribir = (f, t) => writeFileSync(join(RAIZ, f), t)

/** La versión que manda: la del package.json de la raíz. */
export const versionActual = () => JSON.parse(leer('package.json')).version

/** Dónde está escrita la versión y qué dice cada sitio. */
export function versionesEscritas() {
  const sitios = {}
  for (const f of PAQUETES) sitios[f] = JSON.parse(leer(f)).version
  for (const f of BLOQUEOS) {
    const j = JSON.parse(leer(f))
    sitios[f] = j.version
    sitios[`${f} (paquete raíz)`] = j.packages?.['']?.version
  }
  sitios[GRADLE] = leer(GRADLE).match(/versionName "([^"]+)"/)?.[1]
  return sitios
}

/** Las versiones públicas de iOS (una por configuración de compilación). */
export const versionesIOS = () => [...new Set([...leer(PBXPROJ).matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim()))]

/** Las entradas `## [x.y.z] — fecha` del CHANGELOG, de arriba abajo. */
export const entradasChangelog = () => [...leer(CHANGELOG).matchAll(/^## \[(\d+\.\d+\.\d+)\] — (\d{4}-\d{2}-\d{2})$/gm)].map((m) => ({ version: m[1], fecha: m[2] }))

export function siguiente(version, tipo) {
  const [mayor, menor, parche] = version.split('.').map(Number)
  if (tipo === 'mayor') return `${mayor + 1}.0.0`
  if (tipo === 'menor') return `${mayor}.${menor + 1}.0`
  if (tipo === 'parche') return `${mayor}.${menor}.${parche + 1}`
  throw new Error(`Tipo de subida desconocido: «${tipo}». Usa parche, menor o mayor.`)
}

/** Cambia solo las líneas de versión del paquete raíz: el resto del fichero no se reescribe. */
function cambiarEnJson(fichero, vieja, nueva, veces) {
  let t = leer(fichero), hechas = 0
  t = t.replace(new RegExp(`^(\\s*"version": )"${vieja.replaceAll('.', '\\.')}"`, 'gm'), (linea, antes) => (hechas++ < veces ? `${antes}"${nueva}"` : linea))
  if (hechas < veces) throw new Error(`${fichero}: no se encontró la versión ${vieja}`)
  escribir(fichero, t)
}

function subir(tipo) {
  const vieja = versionActual(), nueva = siguiente(vieja, tipo)
  const log = leer(CHANGELOG)
  if (!log.includes(SIN_PUBLICAR)) throw new Error(`El CHANGELOG no tiene la sección «${SIN_PUBLICAR}».`)
  const cuerpo = log.slice(log.indexOf(SIN_PUBLICAR) + SIN_PUBLICAR.length).split(/^## \[/m)[0].trim()
  if (!cuerpo) throw new Error(`«${SIN_PUBLICAR}» está vacío: anota qué cambia antes de subir la versión.`)

  for (const f of PAQUETES) cambiarEnJson(f, vieja, nueva, 1)
  // En un package-lock la versión del paquete sale dos veces, las dos primeras
  for (const f of BLOQUEOS) cambiarEnJson(f, vieja, nueva, 2)
  escribir(GRADLE, leer(GRADLE).replace(/versionName "[^"]+"/, `versionName "${nueva}"`))
  const hoy = new Date().toLocaleDateString('sv')   // AAAA-MM-DD, en hora local
  escribir(CHANGELOG, log.replace(SIN_PUBLICAR, `${SIN_PUBLICAR}\n\n## [${nueva}] — ${hoy}`))

  console.log(`Versión ${vieja} → ${nueva}`)
  console.log('Queda por hacer:')
  console.log(`  · revisar el CHANGELOG y guardar: git commit -am "Versión ${nueva}"`)
  console.log('  · iOS: subir «Version» y «Build» del target en Xcode (project.pbxproj no se edita a mano)')
  console.log('  · Android: subir versionCode en build.gradle si se va a publicar en la tienda')
}

// Solo actúa cuando se lanza como programa, no cuando se importa
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [orden, tipo] = process.argv.slice(2)
    if (orden === 'subir') subir(tipo)
    else console.log(versionActual())
  } catch (e) {
    console.error(`✗ ${e.message}`)
    process.exit(1)
  }
}
