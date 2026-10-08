/**
 * La hoja de respuestas: geometría en milímetros y el QR que la identifica.
 *
 * Lo que se vigila: que las burbujas caigan dentro del marco de las marcas y
 * no se toquen, que el QR no pise nada, que el texto del QR se lea de vuelta
 * igual y que cualquier otro QR se rechace, y que el documento impreso lleve
 * una página por alumno con su QR.
 */
import {
  geometriaHoja, cabeEnHoja, centroBurbuja, payloadHoja, leerPayloadHoja,
  MARCAS, MARCA, QR, PAGINA, MAX_PREGUNTAS_HOJA, MAX_OPCIONES_HOJA, VERSION_HOJA,
} from '../frontend/src/db/hojaOMR'
import { documentoHojasRespuestas, documentoExamen } from '../frontend/src/informes/hojasTest'
import { normalizarPrueba } from '../frontend/src/db/prueba'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

console.log('\n1. Geometría')
{
  const g = geometriaHoja(50, 5)
  ok(g.burbujas.length === 250 && g.columnas.length === 2, '50 × 5 burbujas en dos columnas')
  const izq = MARCAS[0].cx + MARCA.lado / 2, der = MARCAS[1].cx - MARCA.lado / 2
  const arriba = MARCAS[0].cy + MARCA.lado / 2, abajo = MARCAS[2].cy - MARCA.lado / 2
  ok(g.burbujas.every(b => b.cx - b.r > izq && b.cx + b.r < der && b.cy - b.r > arriba && b.cy + b.r < abajo), 'todas dentro del marco de las marcas')
  ok(g.burbujas.every(b => b.cx + b.r < PAGINA.ancho - 10 && b.cy + b.r < PAGINA.alto - 10), 'y dentro de la página con margen')
  let seTocan = false
  for (let i = 0; i < g.burbujas.length && !seTocan; i++) for (let j = i + 1; j < g.burbujas.length; j++) {
    const a = g.burbujas[i], b = g.burbujas[j]
    if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r + 1.5) { seTocan = true; break }
  }
  ok(!seTocan, 'ninguna burbuja a menos de 1,5 mm de otra')
  ok(g.burbujas.every(b => b.cy - b.r > QR.y + QR.lado || b.cx + b.r < QR.x || b.cx - b.r > QR.x + QR.lado), 'el QR no pisa ninguna burbuja')
  ok(QR.x + QR.lado < MARCAS[1].cx - MARCA.lado / 2 - 2 && QR.y > MARCAS[1].cy + MARCA.lado / 2 + 2, 'el QR no toca la marca de su esquina')
  const g1 = geometriaHoja(10, 4)
  ok(g1.burbujas.length === 40 && g1.columnas.length === 1 && g1.columnas[0].hasta === 9, '10 × 4 en una columna')
  const c = centroBurbuja(25, 0), c0 = centroBurbuja(0, 0)
  ok(c.cy === c0.cy && c.cx > c0.cx, 'la pregunta 26 abre la segunda columna a la misma altura que la 1')
  ok(!cabeEnHoja(51, 4) && !cabeEnHoja(10, 6) && !cabeEnHoja(0, 4) && cabeEnHoja(MAX_PREGUNTAS_HOJA, MAX_OPCIONES_HOJA), 'los topes')
  let error = ''
  try { geometriaHoja(60, 4) } catch (e: any) { error = e.message }
  ok(error.includes('50'), 'fuera de tope: lo dice', error)
}

console.log('\n2. El QR de la hoja')
{
  const texto = payloadHoja({ prueba_id: 123456, alumno_id: 7890, nPreguntas: 20, nOpciones: 4 })
  ok(texto.length < 40, 'texto corto: módulos grandes', texto)
  const p = leerPayloadHoja(texto)
  ok(!!p && p.prueba_id === 123456 && p.alumno_id === 7890 && p.nPreguntas === 20 && p.nOpciones === 4 && p.version === VERSION_HOJA, 'se lee de vuelta igual', JSON.stringify(p))
  ok(leerPayloadHoja('https://miclase.edumind.es/evaluar?grupo_id=3') === null, 'el QR de una mesa no es una hoja')
  ok(leerPayloadHoja('MCT9|1|2|10|4') === null, 'otra versión de hoja se rechaza')
  ok(leerPayloadHoja('MCT1|1|2|99|4') === null, 'una hoja imposible se rechaza')
  ok(leerPayloadHoja(' MCT1|1|2|10|4\n') !== null, 'espacios alrededor no estorban')
}

console.log('\n3. Los documentos')
{
  const def = normalizarPrueba({ titulo: 'Os ríos', tipo: 'test', reparto: 'unica', preguntas: Array.from({ length: 12 }, (_, i) => ({
    id: `p${i + 1}`, enunciado: `Pregunta ${i + 1} <con> & símbolos`, max: 1, opciones: ['Un', 'Dous', 'Tres', 'Catro'], correcta: i % 4,
  })) })
  const alumnos = [{ id: 1, nombre: 'Ana', apellidos: 'Abad' }, { id: 2, nombre: 'Bruno', apellidos: 'Bello & Souto' }]
  const qr = new Map([[1, 'data:image/png;base64,AAA'], [2, 'data:image/png;base64,BBB']])
  const html = documentoHojasRespuestas(def, alumnos, qr, { grupo: '6ºA', area: 'Ciencias Sociais', unidad: 'UD 1' })
  ok((html.match(/class="pagina"/g) ?? []).length === 2, 'una página por alumno')
  ok(html.includes('data-alumno="2"') && html.includes('base64,BBB') && html.includes('Bello &amp; Souto'), 'cada página con su QR y su nombre escapado')
  ok((html.match(/class="burbuja"/g) ?? []).length === 2 * 12 * 4, '12 × 4 burbujas por hoja')
  ok((html.match(/class="marca"/g) ?? []).length === 8, 'cuatro marcas por hoja')
  ok(!html.includes('<con>'), 'nada sin escapar')
  const examen = documentoExamen(def, { grupo: '6ºA', area: 'Ciencias Sociais' })
  const cuerpo = examen.slice(examen.indexOf('<body>'))
  ok((cuerpo.match(/<li><b>/g) ?? []).length === 48 && cuerpo.includes('a)') && !cuerpo.includes('*'), 'el examen lleva las 48 opciones y ninguna marca de correcta')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
