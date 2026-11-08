/**
 * PROENS leído en el aparato: pdf.js + `pdfTexto.ts` frente a `pdftotext -layout`.
 *
 * Los dos PDF de `fixtures/` (el gemelo y la programación real de CCSS 6.º)
 * se leen con pdf.js, se maquetan con `textoDeTrozos` y se pasan por
 * `parsearProens`. El resultado tiene que ser el mismo que con el texto de
 * pdftotext guardado al lado, campo a campo: centro, unidades con su peso y
 * trimestre, contenidos y cada criterio con su mínimo, instrumento y %.
 *
 * Única excepción conocida, y es de pdftotext: en la descripción de la UD2
 * del PDF real cambia «clima.» de línea («…do planeta clima. Terra…»). pdf.js
 * la da en su sitio; aquí se comprueba eso en vez de la igualdad.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parsearProens } from '../frontend/src/programacion/proens'
import { textoDeDocumento } from '../frontend/src/programacion/pdfTexto'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

// Ruta calculada: el build de Node de pdf.js se carga de frontend/node_modules
// tal cual, sin pasar por el empaquetador.
const pdfjs: any = await import(pathToFileURL(join(process.cwd(), 'frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href)
const fixtures = join(process.cwd(), 'pruebas/fixtures')
const n = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()

async function leerConPdfjs(fichero: string) {
  const tarea = pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(fixtures, fichero))), verbosity: 0 })
  try { return parsearProens(await textoDeDocumento(await tarea.promise)) } finally { await tarea.destroy() }
}

async function comparar(pdf: string, txt: string, excepciones: Record<string, (a: string, b: string) => boolean> = {}) {
  const ref = parsearProens(readFileSync(join(fixtures, txt), 'utf8'))
  const nuevo = await leerConPdfjs(pdf)
  const distintos: string[] = []
  let total = 0
  const cmp = (que: string, a: unknown, b: unknown) => {
    total++
    const iguales = excepciones[que] ? excepciones[que](n(a), n(b)) : n(a) === n(b)
    if (!iguales) distintos.push(`${que}: «${n(a).slice(0, 80)}» ≠ «${n(b).slice(0, 80)}»`)
  }
  for (const k of ['centro', 'cursoEscolar', 'etapa', 'area', 'curso', 'sesionesSemanales', 'sesionesAnuales'] as const) cmp(k, ref[k], nuevo[k])
  cmp('instrumentos', JSON.stringify(ref.instrumentos), JSON.stringify(nuevo.instrumentos))
  cmp('nº unidades', ref.unidades.length, nuevo.unidades.length)
  ref.unidades.forEach((u, i) => {
    const v = nuevo.unidades[i]
    if (!v) { cmp(`UD${u.numero}`, 'existe', 'falta'); return }
    for (const k of ['numero', 'titulo', 'descripcion', 'peso', 'sesiones', 'trimestre'] as const) cmp(`UD${u.numero}.${k}`, u[k], v[k])
    cmp(`UD${u.numero} contenidos`, u.contenidos.join(' | '), v.contenidos.join(' | '))
    cmp(`UD${u.numero} criterios`, u.criterios.map(c => c.codigo).join(' '), v.criterios.map(c => c.codigo).join(' '))
    for (const c of u.criterios) {
      const d = v.criterios.find(x => x.codigo === c.codigo)
      if (!d) continue
      for (const k of ['descripcion', 'minimo', 'instrumento', 'porcentaje'] as const) cmp(`UD${u.numero} ${c.codigo}.${k}`, c[k], d[k])
    }
  })
  ok(distintos.length === 0, `${pdf}: ${total - distintos.length}/${total} campos iguales que con pdftotext`, distintos.slice(0, 3).join(' · '))
  ok(nuevo.avisos.length === ref.avisos.length, `${pdf}: sin avisos de más`, nuevo.avisos.slice(0, 2).join(' · '))
}

console.log('\n1. Gemelo de PROENS')
await comparar('proens_ccss6.pdf', 'proens_ccss6.txt')

console.log('\n2. Programación real de CCSS 6.º')
await comparar('proens_real_ccss6.pdf', 'proens_real_ccss6.txt', {
  'UD2.descripcion': (_a, b) => b.includes('do planeta Terra en relación coas características do clima. Determinar'),
})

console.log('\n3. Lo que pdftotext pondría y no se quiere')
{
  const r = await leerConPdfjs('proens_real_ccss6.pdf')
  const todo = JSON.stringify(r)
  ok(!/Borrador/.test(todo), 'la marca de agua «Borrador» (texto girado) no se cuela en ningún campo')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
