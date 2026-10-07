/**
 * Soltar un paquete de sincronización (.miclasesync.json) en «Importar backup»
 * no debe decir «no es válido»: debe explicar qué es y llevar a Sincronizar.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })
const BASE = process.env.BASE || 'http://127.0.0.1:5173'

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const navegador = await chromium.launch()
const p = await (await navegador.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
const errores = []
p.on('pageerror', e => errores.push(e.message))

try {
  const paquete = process.env.SCRATCH + '/miclase-2026-10-07.miclasesync.json'
  writeFileSync(paquete, JSON.stringify({ formato: 'miclase-sync', version: 1, sal: 'x', verificador: 'y', sobres: [] }))
  const falso = process.env.SCRATCH + '/cualquiera.json'
  writeFileSync(falso, JSON.stringify({ hola: 1 }))

  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: /Exportar \/ Importar/ }).first().click()
  await p.getByRole('button', { name: /Importar backup existente/ }).click()
  const entrada = p.locator('input[type="file"]')

  console.log('\n1. Un paquete de sincronización')
  await entrada.setInputFiles(paquete)
  await p.locator('[data-es-paquete]').waitFor({ timeout: 5000 })
  ok(true, 'se reconoce como paquete, no como copia')
  ok(await p.getByText(/no es un backup válido/).count() === 0, 'y no se tacha de inválido')
  const enlace = p.getByRole('link', { name: /Recibir un paquete/ })
  ok(await enlace.count() === 1, 'ofrece el enlace a Sincronizar')

  console.log('\n2. Un JSON cualquiera')
  await entrada.setInputFiles(falso)
  await p.getByText(/no es un backup válido/).waitFor({ timeout: 5000 })
  ok(await p.locator('[data-es-paquete]').count() === 0, 'lo que no es ni copia ni paquete sigue siendo «no válido», sin el aviso de paquete')

  console.log('\n3. El enlace lleva a Sincronizar y cierra el cuadro')
  await entrada.setInputFiles(paquete)
  await p.getByRole('link', { name: /Recibir un paquete/ }).click()
  await p.waitForURL(/\/sincronizar/, { timeout: 5000 })
  ok(await p.getByRole('dialog', { name: /Exportar|Importar/ }).count() === 0, 'el cuadro se ha cerrado')
  await p.getByText(/Recibir un paquete/).first().waitFor({ timeout: 8000 })
  ok(true, 'y en Sincronizar se habla de «Recibir un paquete»')

  ok(errores.length === 0, 'sin errores de página', errores.join(' | '))
} catch (e) {
  console.log('  ✗ EXCEPCIÓN', e.message); fallos++
} finally { await navegador.close() }

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
