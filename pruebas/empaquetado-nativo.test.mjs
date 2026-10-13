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

// iOS: el destino mínimo lo declara el Package.swift de @capacitor/ios (o su
// podspec, que sigue publicándose). El proyecto va por Swift Package Manager,
// no por CocoaPods: en el Mac no hace falta Ruby ni `pod install`, y lo que
// fija el mínimo de nuestro lado es el Package.swift que `cap sync` escribe en
// CapApp-SPM.
const paqueteCapacitor = existsSync(join(FRONT, 'node_modules/@capacitor/ios/Package.swift'))
  ? leer('node_modules/@capacitor/ios/Package.swift') : ''
const iosExigido = Number(
  sacar(paqueteCapacitor, /\.iOS\(\.v(\d+)\)/)
  ?? sacar(leer('node_modules/@capacitor/ios/Capacitor.podspec'), /deployment_target\s*=\s*'(\d+)/),
)
const paquete = leer('ios/App/CapApp-SPM/Package.swift')
const iosPaquete = Number(sacar(paquete, /\.iOS\(\.v(\d+)\)/))
const pbxproj = leer('ios/App/App.xcodeproj/project.pbxproj')
const destinos = [...pbxproj.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map((m) => Number(m[1]))

ok(!existsSync(join(FRONT, 'ios/App/Podfile')),
  'no queda Podfile: el proyecto iOS va por Swift Package Manager')
ok(iosPaquete >= iosExigido,
  'el Package.swift de CapApp-SPM llega al destino mínimo de Capacitor', `${iosPaquete} ≥ ${iosExigido}`)
ok(destinos.length > 0 && destinos.every((d) => d >= iosExigido),
  'y el proyecto de Xcode también, en todas sus configuraciones',
  `${[...new Set(destinos)].join(', ')} ≥ ${iosExigido}`)

console.log('\n2b. Lo que la app nativa de iOS necesita para funcionar y publicarse')

// Los plugins propios viven en las fuentes del paquete, no en el target:
// project.pbxproj no se edita a mano, y lo que haya en ese directorio se
// compila solo. Si alguien los mueve al target, el escáner no se entera pero
// Xcode sí; aquí se vigila que sigan donde el SceneDelegate los espera.
const fuentesPaquete = 'ios/App/CapApp-SPM/Sources/CapApp-SPM'
ok(existsSync(join(FRONT, fuentesPaquete, 'ImpresoraPlugin.swift'))
  && existsSync(join(FRONT, fuentesPaquete, 'MiClaseViewController.swift')),
  'el plugin de impresión y el controlador que lo registra están en las fuentes de CapApp-SPM')
const sceneDelegate = leer('ios/App/App/SceneDelegate.swift')
ok(/import CapApp_SPM/.test(sceneDelegate) && /MiClaseViewController\(\)/.test(sceneDelegate),
  'SceneDelegate arranca con MiClaseViewController, que registra los plugins propios')

const infoPlist = leer('ios/App/App/Info.plist')
ok(/CFBundleURLSchemes[\s\S]*?<string>es\.edumind\.miclase<\/string>/.test(infoPlist),
  'Info.plist declara el esquema es.edumind.miclase para la vuelta del login')
ok(!/<string>armv7<\/string>/.test(infoPlist),
  'Info.plist no exige armv7 (App Store Connect lo rechaza; debe ser arm64)')
for (const clave of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription']) {
  ok(infoPlist.includes(`<key>${clave}</key>`), `Info.plist explica para qué se pide ${clave}`)
}
ok(existsSync(join(FRONT, 'ios/App/App/PrivacyInfo.xcprivacy')),
  'el manifiesto de privacidad está en el proyecto (añadirlo al target es un paso manual en Xcode)')

// iOS no admite `iosScheme: 'https'`: WKWebView ya gestiona http/https y
// Capacitor lo ignora. Si alguien lo vuelve a poner, el origen que cree tener
// la app y el real (capacitor://localhost) dejan de coincidir.
ok(!/^\s*iosScheme\s*:/m.test(config),
  'capacitor.config.ts no fija iosScheme (en iOS el origen es capacitor://localhost)')

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
