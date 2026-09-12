/**
 * El empaquetado nativo, sin necesitar un Mac ni Android Studio.
 *
 * No compila nada: comprueba que la configuración del proyecto nativo sigue
 * cuadrando con la versión de Capacitor que está instalada. Es lo que faltaba
 * las dos veces que esto se rompió en silencio:
 *
 *  1. `frontend/dist` es un enlace simbólico —desplegar.sh publica en
 *     `releases/<sello>` y mueve el enlace—. Capacitor copia el enlace en vez
 *     de seguirlo y deja `assets/public` apuntando a una ruta que ahí no
 *     existe; el `copy` siguiente muere con ENOENT. Se resuelve en
 *     `capacitor.config.ts`, y aquí se vigila que siga resuelto.
 *
 *  2. Subir Capacitor de 7 a 8 en el `package.json` no toca los proyectos de
 *     `android/` ni `ios/`, que siguieron pidiendo minSdk 23 y iOS 14 cuando
 *     la librería ya exigía 24 y 15. Eso no lo ve nadie hasta que alguien
 *     intenta compilar en un Mac, que es justo cuando peor viene.
 *
 * Los mínimos no se escriben a mano: se leen de lo que declara el propio
 * Capacitor instalado, para que la próxima subida de versión avise sola.
 */
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ } from './lib/entorno.mjs'

const FRONT = join(RAIZ, 'frontend')
let fallos = 0
const ok = (c, m, extra = '') => {
  console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!c) fallos++
}
const leer = (p) => readFileSync(join(FRONT, p), 'utf8')
/** Primer grupo de la expresión, o null si no casa. */
const sacar = (texto, re) => re.exec(texto)?.[1] ?? null

console.log('\n1. webDir apunta a un directorio de verdad, no a un enlace')

const config = leer('capacitor.config.ts')
ok(/realpathSync\(\s*'dist'\s*\)/.test(config),
  'la configuración resuelve el enlace de dist antes de dárselo a Capacitor')

// Y que de verdad resuelva: se evalúa como lo haría el CLI, desde frontend/.
const dist = join(FRONT, 'dist')
if (existsSync(dist)) {
  ok(statSync(dist).isDirectory(),
    'dist resuelve a un directorio', lstatSync(dist).isSymbolicLink() ? 'es un enlace, y apunta bien' : 'directorio normal')
  ok(existsSync(join(dist, 'index.html')), 'y dentro está el index.html compilado')
} else {
  console.log('  · dist todavía no existe (no se ha compilado): nada que comprobar')
}

// Lo que dejó el último `cap sync`, si se ha llegado a ejecutar.
const publicAndroid = join(FRONT, 'android/app/src/main/assets/public')
if (existsSync(join(FRONT, 'android/app/src/main/assets'))) {
  ok(!lstatSync(publicAndroid, { throwIfNoEntry: false })?.isSymbolicLink(),
    'cap sync no ha dejado assets/public como enlace simbólico')
}

console.log('\n2. Los proyectos nativos van a la par de la versión instalada de Capacitor')

// Mínimos que declara la librería de Android que hay en node_modules
const capAndroid = leer('node_modules/@capacitor/android/capacitor/build.gradle')
const minExigido = Number(sacar(capAndroid, /minSdkVersion.*?:\s*(\d+)/))
const compileExigido = Number(sacar(capAndroid, /compileSdk\s*=.*?:\s*(\d+)/))
const agpExigida = sacar(capAndroid, /com\.android\.tools\.build:gradle:([\d.]+)/)

const variables = leer('android/variables.gradle')
const minNuestro = Number(sacar(variables, /minSdkVersion\s*=\s*(\d+)/))
const compileNuestro = Number(sacar(variables, /compileSdkVersion\s*=\s*(\d+)/))
const targetNuestro = Number(sacar(variables, /targetSdkVersion\s*=\s*(\d+)/))

ok(minNuestro >= minExigido,
  'minSdk llega al que pide la librería de Capacitor', `${minNuestro} ≥ ${minExigido}`)
ok(compileNuestro >= compileExigido,
  'compileSdk llega al que pide la librería', `${compileNuestro} ≥ ${compileExigido}`)
ok(targetNuestro >= compileExigido,
  'targetSdk va con compileSdk', `${targetNuestro} ≥ ${compileExigido}`)

const agpNuestra = sacar(leer('android/build.gradle'), /com\.android\.tools\.build:gradle:([\d.]+)/)
const comoNumero = (v) => v.split('.').map(Number).reduce((a, n) => a * 1000 + n, 0)
ok(agpNuestra && agpExigida && comoNumero(agpNuestra) >= comoNumero(agpExigida),
  'el plugin de Android Gradle no se ha quedado atrás', `${agpNuestra} ≥ ${agpExigida}`)

// iOS: el destino mínimo lo declara el podspec de @capacitor/ios
const podspec = leer('node_modules/@capacitor/ios/Capacitor.podspec')
const iosExigido = Number(sacar(podspec, /deployment_target\s*=\s*'([\d.]+)'/))
const iosPodfile = Number(sacar(leer('ios/App/Podfile'), /platform :ios, '([\d.]+)'/))
const pbxproj = leer('ios/App/App.xcodeproj/project.pbxproj')
const destinos = [...pbxproj.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map((m) => Number(m[1]))

ok(iosPodfile >= iosExigido,
  'el Podfile llega al destino mínimo del podspec de Capacitor', `${iosPodfile} ≥ ${iosExigido}`)
ok(destinos.length > 0 && destinos.every((d) => d >= iosExigido),
  'y el proyecto de Xcode también, en todas sus configuraciones',
  `${[...new Set(destinos)].join(', ')} ≥ ${iosExigido}`)

console.log('\n3. La versión de Capacitor es la misma en todos los paquetes')

const pkg = JSON.parse(leer('package.json'))
const deps = { ...pkg.dependencies, ...pkg.devDependencies }
const mayor = (v) => v.replace(/^[^\d]*/, '').split('.')[0]
const nucleos = ['@capacitor/core', '@capacitor/android', '@capacitor/ios', '@capacitor/cli']
  .filter((n) => deps[n])
const mayores = new Set(nucleos.map((n) => mayor(deps[n])))
ok(mayores.size === 1,
  'core, android, ios y cli comparten versión mayor',
  nucleos.map((n) => `${n}@${deps[n]}`).join(', '))

console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ EMPAQUETADO NATIVO COHERENTE')
process.exit(fallos ? 1 : 0)
