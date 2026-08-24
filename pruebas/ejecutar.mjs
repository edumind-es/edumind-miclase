/**
 * Lanza todas las pruebas de MiClase con un solo comando.
 *
 *   npm test              todo
 *   npm run test:rapido   solo lo que no necesita navegador (unos segundos)
 *   npm run test:prod     comprobación contra https://miclase.edumind.es
 *
 * Qué resuelve, que antes había que hacer a mano y salía mal:
 *  - Monta el backend y el servidor de desarrollo en puertos libres, espera a
 *    que respondan de verdad y los mata al terminar. Con puertos fijos y `&`
 *    quedaban procesos vivos entre tandas: una llegó a dar «todo correcto»
 *    contra un backend anterior a los cambios.
 *  - Copia la base de datos a un directorio temporal y **se niega a arrancar**
 *    si alguien apunta a la de producción.
 *  - Da un resumen al final, no un muro de texto donde el fallo se pierde.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { arrancar, esperarA, pararTodo, puertoLibre, RAIZ } from './lib/entorno.mjs'

const SECRETO = 'clave_de_pruebas_de_al_menos_32_caracteres'
const BD_PRODUCCION = resolve(RAIZ, 'backend/data/miclase.db')

const argumentos = new Set(process.argv.slice(2))
const soloRapidas = argumentos.has('--rapido')
const soloProduccion = argumentos.has('--produccion')

const scratch = mkdtempSync(join(tmpdir(), 'miclase-pruebas-'))
// Algunas pruebas guardan capturas de pantalla ahí
mkdirSync(join(scratch, 'tiros'), { recursive: true })
process.env.SCRATCH = scratch
const resultados = []

const color = (c, t) => (process.stdout.isTTY ? `\x1b[${c}m${t}\x1b[0m` : t)
const verde = (t) => color(32, t)
const rojo = (t) => color(31, t)
const gris = (t) => color(90, t)

/** Ejecuta un comando y devuelve si ha ido bien, guardando la salida. */
function correr(comando, args, env = {}) {
  return new Promise((listo) => {
    const hijo = spawn(comando, args, {
      cwd: RAIZ,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let salida = ''
    hijo.stdout.on('data', (b) => { salida += b })
    hijo.stderr.on('data', (b) => { salida += b })
    hijo.on('close', (codigo) => listo({ bien: codigo === 0, salida }))
  })
}

async function suite(nombre, comando, args, env = {}) {
  process.stdout.write(gris(`  ${nombre}… `))
  const inicio = Date.now()
  const { bien, salida } = await correr(comando, args, env)
  const seg = ((Date.now() - inicio) / 1000).toFixed(1)
  console.log(bien ? verde(`✓ ${seg}s`) : rojo(`✗ ${seg}s`))
  resultados.push({ nombre, bien, salida, seg })
  return bien
}

/** Empaqueta un módulo TypeScript para poder ejecutarlo con node. */
function paquete(entrada, destino, extra = []) {
  return correr('npx', [
    '--prefix', 'frontend', 'esbuild', entrada,
    '--bundle', `--outfile=${destino}`, ...extra,
  ])
}

async function principal() {
  console.log(`\nPruebas de EDUmind MiClase ${gris(`(temporales en ${scratch})`)}\n`)

  // ── Lo que no necesita nada montado ────────────────────────────────
  if (!soloProduccion) {
    console.log('Sin servicios')
    await suite('tipos', 'npx', ['--prefix', 'frontend', 'tsc', '-b', 'frontend'])

    const calculo = join(scratch, 'calculo.mjs')
    await paquete('pruebas/calculo.test.ts', calculo, ['--platform=node', '--format=esm'])
    await suite('cálculo de notas', 'node', [calculo])

    const fusion = join(scratch, 'fusion.mjs')
    await paquete('pruebas/fusion.test.ts', fusion, ['--platform=node', '--format=esm'])
    await suite('fusión a tres bandas', 'node', [fusion])

    await suite('lector de QR', 'node', ['pruebas/lectorqr.test.mjs'])
  }

  // ── Con navegador, pero sin servidor ───────────────────────────────
  if (!soloRapidas && !soloProduccion) {
    console.log('\nCon navegador')
    const enlace = join(scratch, 'enlace.js')
    await paquete('frontend/src/db/enlaceDirecto.ts', enlace,
      ['--format=iife', '--global-name=Enlace'])
    await suite('enlace directo', 'node', ['pruebas/enlace-directo.test.mjs'],
      { BUNDLE: enlace })
  }

  // ── Con backend y servidor de desarrollo ───────────────────────────
  if (!soloRapidas && !soloProduccion) {
    console.log('\nCon backend y servidor de desarrollo')

    const bd = join(scratch, 'prueba.db')
    if (resolve(bd) === BD_PRODUCCION) throw new Error('jamás contra la BD de producción')
    cpSync(BD_PRODUCCION, bd)

    const puertoApi = await puertoLibre()
    const api = `http://127.0.0.1:${puertoApi}`
    const backend = arrancar('backend de pruebas', 'node', ['backend/src/index.js'], {
      env: { PORT: String(puertoApi), DB_PATH: bd, NODE_ENV: 'development', JWT_SECRET: SECRETO },
    })
    await esperarA(`${api}/api/health`, { proceso: backend })

    const puertoWeb = await puertoLibre()
    const base = `http://127.0.0.1:${puertoWeb}`
    // Vite directamente, no por `npm run`: los argumentos que pasan por npm
    // los interpreta npm como configuración suya y el puerto se ignoraba.
    const web = arrancar('servidor de desarrollo', 'npx',
      ['vite', '--port', String(puertoWeb), '--strictPort'],
      { cwd: 'frontend', env: { VITE_API_TARGET: api } })
    await esperarA(base, { proceso: web })
    console.log(gris(`  api ${api} · web ${base}`))

    const entorno = { SYNC_API: `${api}/api/sync`, API: api, BASE: base }
    await suite('buzón del servidor', 'node', ['pruebas/sync.test.mjs'], entorno)
    await suite('interfaz', 'node', ['pruebas/e2e.test.mjs'], entorno)
    await suite('migración de esquema', 'node', ['pruebas/migracion.test.mjs'], entorno)
    await suite('escáner sin detector nativo', 'node', ['pruebas/escaner-sin-detector.test.mjs'], entorno)
    await suite('sync por buzón, dos dispositivos', 'node', ['pruebas/sync-dos-dispositivos.test.mjs'], entorno)
    await suite('sync directa, sin servidor', 'node', ['pruebas/sync-directo.test.mjs'], entorno)
    await suite('emparejamiento por pantalla', 'node', ['pruebas/emparejar-ui.test.mjs'], entorno)
  }

  // ── Contra producción ──────────────────────────────────────────────
  if (soloProduccion) {
    console.log('Contra producción')
    await suite('emparejamiento en producción', 'node', ['pruebas/emparejar-produccion.test.mjs'])
  }
}

let salida = 0
try {
  await principal()
} catch (e) {
  console.log(rojo(`\n✗ No se han podido lanzar las pruebas: ${e.message}`))
  salida = 1
} finally {
  await pararTodo()
}

const fallidas = resultados.filter((r) => !r.bien)

if (fallidas.length) {
  console.log(rojo(`\n${'─'.repeat(60)}`))
  for (const f of fallidas) {
    console.log(rojo(`\n✗ ${f.nombre}`))
    console.log(f.salida.trimEnd().split('\n').slice(-40).join('\n'))
  }
}

const total = resultados.length
const bien = total - fallidas.length
console.log(
  fallidas.length || salida
    ? rojo(`\n${bien}/${total} suites correctas · ${fallidas.map((f) => f.nombre).join(', ')}`)
    : verde(`\n${bien}/${total} suites correctas`))

if (fallidas.length || salida) {
  console.log(gris(`\nCapturas y temporales en ${scratch}`))
} else {
  rmSync(scratch, { recursive: true, force: true })
}
process.exit(fallidas.length || salida ? 1 : 0)
