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
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

/**
 * Un módulo instalado en el `node_modules` de un subproyecto.
 *
 * Las pruebas los importaban por ruta absoluta (`/var/www/edumind_miclase/...`),
 * que solo funciona en este servidor. Lo destapó la integración continua en su
 * segunda ejecución.
 *
 *   const { SignJWT } = await moduloDe('backend', 'jose/dist/webapi/index.js')
 */
export function moduloDe(subproyecto, ruta) {
  return import(pathToFileURL(resolve(RAIZ, subproyecto, 'node_modules', ruta)).href)
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
  // Sin la salida del proceso, un plantón aquí no dice nada de por qué.
  const cola = proceso ? `\n${proceso.nombre} dijo:\n${proceso.salida.slice(-15).join('')}` : ''
  throw new Error(`${url} no responde después de ${(intentos * cada) / 1000} s${cola}`)
}

/**
 * Abre en el Calificador la unidad que ocupa la posición `n` del selector de
 * unidad: la 0 es «Todo el curso» y las unidades empiezan en la 1, igual que
 * cuando eran pestañas.
 */
export async function elegirUnidad(p, n) {
  const selector = p.locator('[data-unidad-select]')
  await selector.waitFor({ timeout: 10000 })
  const valores = await selector.locator('option').evaluateAll(os => os.map(o => o.value))
  if (n < 0 || n >= valores.length) throw new Error(`No hay unidad en la posición ${n}: el selector tiene ${valores.length} opciones`)
  await selector.selectOption(valores[n])
}

/** La posición elegida en el selector de unidad (0 = «Todo el curso»). */
export async function unidadElegida(p) {
  return p.locator('[data-unidad-select]').evaluate(s => s.selectedIndex)
}

/**
 * «Qué evalúo» abre «Por unidad» en un área con unidades. Las pruebas que
 * trabajan con lo que es de toda el área (pesos, actividades, borrar) llaman
 * a esto ANTES de navegar y el gestor les abre en «Pesos del área», como si
 * el docente la hubiera elegido la última vez. No pisa una elección ya hecha.
 */
export async function gestorEnPesosDelArea(p) {
  await p.addInitScript(() => {
    try { if (!localStorage.getItem('miclase.queevaluo.vista')) localStorage.setItem('miclase.queevaluo.vista', 'pesos') } catch { /* sin almacenamiento */ }
  })
}

/**
 * Acepta las preguntas de la app: las del navegador (`confirm`, que ya casi
 * no quedan) y el diálogo propio (`utils/confirmar.tsx`, `[data-confirmar]`).
 * Hay que llamarla antes de la primera navegación. `alVer` recibe el texto de
 * cada pregunta. Para rechazar la siguiente: `rechazarSiguienteConfirmacion(p)`.
 */
export async function aceptarConfirmaciones(p, alVer) {
  p.on('dialog', d => { alVer?.(d.message()); d.accept() })
  await p.exposeFunction('__confirmacionVista', t => { alVer?.(t) })
  await p.addInitScript(() => {
    const mirar = () => {
      for (const d of document.querySelectorAll('[data-confirmar]:not([data-visto])')) {
        d.setAttribute('data-visto', '')
        const texto = [d.querySelector('[data-confirmar-titulo]')?.textContent, d.querySelector('[data-confirmar-texto]')?.textContent].filter(Boolean).join('\n\n')
        window.__confirmacionVista?.(texto)
        const rechazar = window.__rechazarSiguiente === true
        window.__rechazarSiguiente = false
        setTimeout(() => d.querySelector(rechazar ? '[data-confirmar-cancelar]' : '[data-confirmar-aceptar]')?.click(), 0)
      }
    }
    new MutationObserver(mirar).observe(document, { childList: true, subtree: true })
  })
}

/** La próxima pregunta de la app se cancela en vez de aceptarse. */
export async function rechazarSiguienteConfirmacion(p) {
  await p.evaluate(() => { window.__rechazarSiguiente = true })
}
