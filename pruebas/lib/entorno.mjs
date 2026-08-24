/**
 * Lo común a todas las pruebas: navegador, puertos y procesos.
 *
 * Antes cada fichero traía cableada la ruta de Playwright al node_modules de
 * otro proyecto (`/var/www/pasos_v2`) y los puertos 3999 y 5173 a pelo. Eso
 * hacía que las pruebas de MiClase se rompieran al tocar un proyecto ajeno, y
 * que dos tandas a la vez —o un servidor viejo que se quedó vivo— se pisaran
 * sin avisar. Ya pasó: una tanda dio «todo correcto» contra un backend
 * anterior a los cambios.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// ─── Navegador ───────────────────────────────────────────────────────────

/**
 * Playwright es dependencia de desarrollo del proyecto. Se busca también en
 * los sitios donde vivía antes, para que una copia del repo sin `npm install`
 * lo diga con claridad en vez de reventar con un error de módulo no
 * encontrado.
 */
export async function navegadorChromium() {
  const candidatos = [
    'playwright',
    resolve(RAIZ, 'node_modules/playwright/index.mjs'),
    '/var/www/pasos_v2/node_modules/playwright/index.mjs',
  ]
  for (const c of candidatos) {
    try {
      const mod = await import(c)
      return mod.chromium
    } catch { /* siguiente */ }
  }
  throw new Error(
    'No se encuentra Playwright. Ejecuta `npm install` en la raíz del proyecto.')
}

// ─── Puertos ─────────────────────────────────────────────────────────────

/**
 * Un puerto que el sistema da por libre en este instante.
 * Con puertos fijos, dos tandas simultáneas —o un proceso que sobrevivió a la
 * anterior— se estorban y el resultado no significa nada.
 */
export function puertoLibre() {
  return new Promise((listo, fallo) => {
    const s = createServer()
    s.on('error', fallo)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => listo(port))
    })
  })
}

// ─── Procesos ────────────────────────────────────────────────────────────

const enMarcha = []

/** Arranca un proceso hijo y lo apunta para poder pararlo al terminar. */
export function arrancar(nombre, comando, args, opciones = {}) {
  const hijo = spawn(comando, args, {
    cwd: opciones.cwd ? resolve(RAIZ, opciones.cwd) : RAIZ,
    env: { ...process.env, ...(opciones.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const registro = { nombre, hijo, salida: [] }
  const guardar = (b) => {
    registro.salida.push(b.toString())
    if (registro.salida.length > 200) registro.salida.shift()
  }
  hijo.stdout.on('data', guardar)
  hijo.stderr.on('data', guardar)
  enMarcha.push(registro)
  return registro
}

/** Para todo lo arrancado. Se llama pase lo que pase. */
export async function pararTodo() {
  for (const { hijo } of enMarcha) {
    try { process.kill(-hijo.pid, 'SIGTERM') } catch { /* ya no está */ }
    try { hijo.kill('SIGTERM') } catch { /* ídem */ }
  }
  enMarcha.length = 0
  await new Promise((r) => setTimeout(r, 300))
}

/** Espera a que una URL conteste, o se rinde con la salida del proceso. */
export async function esperarA(url, { intentos = 60, cada = 500, proceso = null } = {}) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (r.ok || r.status === 404) return true
    } catch { /* todavía no */ }
    if (proceso?.hijo.exitCode != null) {
      throw new Error(
        `${proceso.nombre} se ha muerto (código ${proceso.hijo.exitCode}):\n` +
        proceso.salida.slice(-15).join(''))
    }
    await new Promise((r) => setTimeout(r, cada))
  }
  throw new Error(`${url} no responde después de ${(intentos * cada) / 1000} s`)
}
