/**
 * Migración de la base del navegador de la v3 a la v4.
 *
 * Siembra una base v3 con el MISMO Dexie que usa la app (declarar los almacenes
 * a mano no vale: Dexie lleva su propio versionado y sus metadatos) y comprueba
 * que al abrir la app nueva no se pierde nada de un curso real.
 *
 * La página de siembra y la copia de Dexie se crean aquí y se borran al salir:
 * si se quedaran en frontend/public/ acabarían en el build y en el servidor.
 */
import { chromium } from '/var/www/pasos_v2/node_modules/playwright/index.mjs'
import { mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

process.env.SCRATCH ||= '/tmp/miclase-pruebas'
mkdirSync(process.env.SCRATCH + '/tiros', { recursive: true })

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLICO = resolve(RAIZ, 'frontend/public')
const DEXIE_TMP = resolve(PUBLICO, '__dexie-tmp.mjs')
const SIEMBRA = resolve(PUBLICO, '__sembrar-v3.html')

const limpiar = () => {
  rmSync(DEXIE_TMP, { force: true })
  rmSync(SIEMBRA, { force: true })
}
process.on('exit', limpiar)
process.on('SIGINT', () => { limpiar(); process.exit(130) })

copyFileSync(resolve(RAIZ, 'frontend/node_modules/dexie/dist/dexie.mjs'), DEXIE_TMP)
writeFileSync(SIEMBRA, PAGINA_SIEMBRA())

const BASE = 'http://127.0.0.1:5173'
let fallos = 0
const ok = (c, m, extra = '') => { console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`); if (!c) fallos++ }

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1400, height: 950 } })
const p = await ctx.newPage()
const errores = []
p.on('pageerror', e => errores.push('PAGEERROR: ' + e.message))
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()) })

// Cargar una página en blanco del mismo origen para poder tocar IndexedDB

console.log('\n1. Sembrar una base v3 con el mismo Dexie que usa la app')
await p.goto(BASE + '/__sembrar-v3.html', { waitUntil: 'networkidle' })
await p.waitForFunction(() => document.getElementById('estado')?.textContent?.startsWith('LISTO'), null, { timeout: 20000 })
const estado = await p.locator('#estado').innerText()
ok(estado === 'LISTO v3', 'base de datos v3 sembrada con un curso real de Educación Física', estado)

console.log('\n2. Abrir la app nueva (dispara la migración a v4)')
await p.goto(BASE, { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)
ok(errores.length === 0, 'la migración no lanza ningún error', errores.slice(0,3).join(' | '))

const tras = await p.evaluate(async () => {
  const abrir = () => new Promise((res, rej) => {
    const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const db = await abrir()
  const leer = t => new Promise(res => {
    try { const q = db.transaction(t, 'readonly').objectStore(t).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => res([]) }
    catch { res([]) }
  })
  const r = {
    version: db.version,
    tablas: [...db.objectStoreNames],
    grupos: await leer('grupos'), alumnos: await leer('alumnos'),
    calificaciones: await leer('calificaciones'), unidades: await leer('unidades'),
    unidad_criterios: await leer('unidad_criterios'), instrumentos: await leer('instrumentos'),
    evidencias: (await leer('evidencias')).map(e => ({ ...e, blob: undefined, bytes: e.blob?.size ?? 0, mime_blob: e.blob?.type })),
    asistencia: await leer('asistencia'),
    criterio_instrumentos: await leer('criterio_instrumentos'),
  }
  db.close()
  return r
})

ok(tras.version === 40, 'la base pasa a la versión 4 (Dexie numera internamente ×10)', `idb v${tras.version}`)
ok(tras.tablas.includes('criterio_instrumentos'), 'aparece la tabla criterio_instrumentos')
ok(tras.tablas.includes('meta'), 'aparece la tabla meta')

console.log('\n3. Nada se ha perdido')
ok(tras.grupos.length === 1 && tras.grupos[0].nombre === '5ºB', 'la clase sigue ahí')
ok(tras.alumnos.length === 2, 'el alumnado sigue ahí')
ok(tras.alumnos.find(a => a.codigo_cifrado === 'M7KP2'), 'los códigos de anonimización se conservan')
ok(tras.calificaciones.length === 3, 'las 3 calificaciones siguen ahí')
ok(tras.calificaciones.find(c => c.valor === 9 && c.observacion === 'Gran progreso'), 'nota y observación intactas')
ok(tras.unidades.length === 1 && tras.unidad_criterios.length === 2, 'la programación se conserva')
ok(tras.instrumentos.length === 2, 'los instrumentos se conservan')
ok(tras.evidencias.length === 1 && tras.evidencias[0].bytes === 4 && tras.evidencias[0].mime_blob === 'image/jpeg',
   'la evidencia conserva su foto (blob intacto)', `${tras.evidencias[0]?.bytes} bytes ${tras.evidencias[0]?.mime_blob}`)
ok(tras.asistencia.length === 2, 'la asistencia se conserva')

console.log('\n4. Los registros antiguos quedan listos para sincronizar')
ok(tras.grupos.every(g => !!g.updated_at), 'los grupos reciben sello de modificación')
ok(tras.calificaciones.every(c => !!c.updated_at), 'las calificaciones reciben sello')
ok(tras.calificaciones.every(c => c.deleted_at === null), 'y quedan marcadas como no borradas')
ok(tras.grupos[0].updated_at === '2025-09-01T08:00:00.000Z', 'el sello respeta la fecha de creación original cuando existe', tras.grupos[0].updated_at)

console.log('\n5. La app funciona con los datos migrados')
await p.waitForTimeout(500)
ok(await p.getByText('5ºB').first().isVisible(), 'la clase antigua aparece en el inicio')
await p.getByRole('link', { name: 'Evaluación', exact: true }).click()
await p.waitForTimeout(2500)
const celdas = await p.locator('.celda-btn').count()
ok(celdas > 0, 'el calificador nuevo pinta la matriz con los datos antiguos', `${celdas} casillas`)
const sinInstr = await p.locator('.celda-btn.sin-instrumento').count()
ok(sinInstr > 0, 'los criterios antiguos salen «sin instrumento» hasta que se asignen (es lo esperado)', `${sinInstr}`)
await p.screenshot({ path: process.env.SCRATCH + '/tiros/19-migracion.png' })

console.log('\n6. Los ids nuevos no chocan con los heredados (1, 2, 3…)')
// La base del dispositivo se crea de forma perezosa: se comprueba dando de alta algo real
await p.getByRole('link', { name: 'Mis clases', exact: true }).click()
await p.waitForTimeout(700)
await p.getByRole('link', { name: /Nueva clase/ }).click()
await p.waitForURL('**/grupos/nuevo')
await p.getByPlaceholder('Ej: 3ºA, 5ºB…').fill('6ºA')
await p.getByRole('button', { name: /Crear grupo/ }).click()
await p.waitForURL('**/grupos')
await p.waitForTimeout(900)

const ids = await p.evaluate(async () => {
  const abrir = () => new Promise((res, rej) => {
    const r = indexedDB.open('miclase_db'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const db = await abrir()
  const q = await new Promise(res => {
    const t = db.transaction('grupos', 'readonly').objectStore('grupos').getAll()
    t.onsuccess = () => res(t.result)
  })
  db.close()
  return { base: Number(localStorage.getItem('miclase_device_base')), grupos: q.map(g => ({ id: g.id, nombre: g.nombre })) }
})
const heredado = ids.grupos.find(g => g.nombre === '5ºB')
const flamante = ids.grupos.find(g => g.nombre === '6ºA')
ok(ids.base >= 1, 'el dispositivo se reserva su rango al primer alta', `base=${ids.base}`)
ok(heredado && heredado.id === 1, 'la clase heredada conserva su id antiguo', `id=${heredado?.id}`)
ok(flamante && flamante.id > 67108864, 'la clase nueva nace en el rango del dispositivo, sin chocar', `id=${flamante?.id}`)
ok(await p.getByText('5ºB').first().isVisible() && await p.getByText('6ºA').first().isVisible(),
   'ambas conviven en el listado')

console.log(`\n${fallos === 0 && errores.length === 0 ? '✅ MIGRACIÓN CORRECTA' : `❌ ${fallos} FALLO(S)`}`)
if (errores.length) { console.log('\n⚠️  Errores:'); errores.slice(0, 8).forEach(e => console.log('   ' + e)) }
await navegador.close()
process.exit(fallos === 0 && errores.length === 0 ? 0 : 1)

// ─────────────────────────────────────────────────────────────────────────
// Página que siembra la base v3 con el esquema EXACTO de aquella versión
function PAGINA_SIEMBRA() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Sembrar v3</title></head>
<body><p id="estado">sembrando…</p>
<script type="module">
import Dexie from '/__dexie-tmp.mjs'

class V3 extends Dexie {
  constructor() {
    super('miclase_db')
    this.version(1).stores({
      grupos: '++id',
      alumnos: '++id, codigo_cifrado',
      grupo_alumnos: '++id, grupo_id, alumno_id, [grupo_id+alumno_id]',
      asignaturas: '++id, grupo_id',
      instrumentos: '++id, asignatura_id',
      calificaciones: '++id, instrumento_id, alumno_id, [alumno_id+instrumento_id+criterio_id+trimestre]',
      sesiones: '++id, grupo_id, fecha',
      asistencia: '++id, sesion_id, alumno_id, [sesion_id+alumno_id]',
      unidades: '++id, asignatura_id',
      unidad_criterios: '++id, unidad_id, [unidad_id+criterio_id]',
    })
    this.version(2).stores({ rubricas: '++id, instrumento_id' })
    this.version(3).stores({
      evidencias: '++id, alumno_id, criterio_id, [alumno_id+criterio_id]',
      planos: '++id, grupo_id',
      asientos: '++id, grupo_id, [grupo_id+alumno_id], [grupo_id+fila+col]',
    })
  }
}

await new Promise(res => { const d = indexedDB.deleteDatabase('miclase_db'); d.onsuccess = d.onerror = d.onblocked = () => res() })
const db = new V3()
await db.open()

const F = '2025-09-01T08:00:00.000Z'
await db.grupos.bulkAdd([{ id: 1, nombre: '5ºB', etapa: 'primaria', curso: '5', comunidad: 'Galicia',
  curso_escolar: '2025-2026', docente_id: 1, color: '#1a4a7a', created_at: F }])
await db.alumnos.bulkAdd([
  { id: 1, nombre: 'Lucía', apellidos: 'Castro Ríos', neae: 0, etiquetas: '[]', codigo_cifrado: 'M7KP2', created_at: F },
  { id: 2, nombre: 'Mateo', apellidos: 'Nogueira Paz', neae: 1, etiquetas: '[]', codigo_cifrado: 'R4XT9', created_at: F },
])
await db.grupo_alumnos.bulkAdd([
  { id: 1, grupo_id: 1, alumno_id: 1, activo: 1, fecha_alta: F },
  { id: 2, grupo_id: 1, alumno_id: 2, activo: 1, fecha_alta: F },
])
await db.asignaturas.bulkAdd([{ id: 1, grupo_id: 1, nombre: 'educacion-fisica', nombre_display: 'Educación Física',
  comunidad: 'Galicia', pesos_trimestres: '{"1":33,"2":33,"3":34}', created_at: F }])
await db.instrumentos.bulkAdd([
  { id: 1, asignatura_id: 1, nombre: 'Observación', tipo: 'observacion', peso: 60, trimestres: '[1,2,3]', orden: 0, created_at: F },
  { id: 2, asignatura_id: 1, nombre: 'Ficha', tipo: 'trabajo', peso: 40, trimestres: '[1,2,3]', orden: 1, created_at: F },
])
await db.unidades.bulkAdd([{ id: 1, asignatura_id: 1, nombre: 'SA 1 · Cuerpo y movimiento', tipo: 'situacion',
  trimestre: 1, orden: 0, activa: 1, created_at: F }])
await db.unidad_criterios.bulkAdd([
  { id: 1, unidad_id: 1, criterio_id: 'CE1.1', peso: 1 },
  { id: 2, unidad_id: 1, criterio_id: 'CE1.2', peso: 1 },
])
await db.calificaciones.bulkAdd([
  { id: 1, alumno_id: 1, instrumento_id: 1, criterio_id: 'CE1.1', asignatura: 'educacion-fisica', curso: '5',
    etapa: 'primaria', comunidad: 'Galicia', trimestre: 1, valor: 9, fecha: '2025-10-10T10:00:00.000Z', observacion: 'Gran progreso' },
  { id: 2, alumno_id: 2, instrumento_id: 1, criterio_id: 'CE1.1', asignatura: 'educacion-fisica', curso: '5',
    etapa: 'primaria', comunidad: 'Galicia', trimestre: 1, valor: 6, fecha: '2025-10-10T10:00:00.000Z' },
  { id: 3, alumno_id: 1, instrumento_id: 2, criterio_id: 'CE1.1', asignatura: 'educacion-fisica', curso: '5',
    etapa: 'primaria', comunidad: 'Galicia', trimestre: 1, valor: 7, fecha: '2025-10-11T10:00:00.000Z' },
])
await db.sesiones.bulkAdd([{ id: 1, grupo_id: 1, fecha: '2025-10-10', tipo: 'clase', notas: 'Circuito de equilibrio', created_at: '2025-10-10T08:00:00.000Z' }])
await db.asistencia.bulkAdd([
  { id: 1, sesion_id: 1, alumno_id: 1, estado: 'presente' },
  { id: 2, sesion_id: 1, alumno_id: 2, estado: 'ausente' },
])
await db.rubricas.bulkAdd([{ id: 1, instrumento_id: 1, titulo: 'Rúbrica de observación',
  niveles_json: '[{"nombre":"Inicio","valor":1},{"nombre":"Desarrollo","valor":2},{"nombre":"Consolidado","valor":3},{"nombre":"Experto","valor":4}]',
  indicadores_json: '[]', generada_ia: 0, created_at: '2025-09-15T08:00:00.000Z' }])
await db.evidencias.bulkAdd([{ id: 1, alumno_id: 1, asignatura_id: 1, criterio_id: 'CE1.1', trimestre: 1,
  tipo: 'foto', mime: 'image/jpeg', blob: new Blob([new Uint8Array([255,216,255,217])], { type: 'image/jpeg' }),
  descripcion: 'Salto de comba', fecha: '2025-10-10T10:05:00.000Z' }])
await db.planos.bulkAdd([{ id: 1, grupo_id: 1, filas: 4, cols: 5 }])
await db.asientos.bulkAdd([{ id: 1, grupo_id: 1, alumno_id: 1, fila: 0, col: 0 }])

const v = db.verno
db.close()
document.getElementById('estado').textContent = 'LISTO v' + v
<\/script></body></html>`
}
