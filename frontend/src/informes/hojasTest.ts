/**
 * Documentos imprimibles de un test: la hoja de respuestas de cada alumno y
 * el examen para el alumnado.
 *
 * La hoja de respuestas se dibuja en milímetros, posición por posición,
 * siguiendo `db/hojaOMR.ts`: es lo que después lee la cámara. Nada va en
 * flujo —ni márgenes de impresora, ni escalado—: `@page` sin margen y cada
 * elemento absoluto. El QR identifica prueba y alumno; las cuatro marcas de
 * las esquinas, dónde está todo lo demás.
 *
 * El examen del alumnado va en flujo normal: enunciados y opciones, sin la
 * clave. Puro: recibe el QR ya pintado (data URL) por alumno.
 */
import { esc } from './lamina'
import { LETRAS, type PruebaDef } from '../db/prueba'
import { geometriaHoja, MARCAS, MARCA, QR, BURBUJA, PAGINA } from '../db/hojaOMR'

type AlumnoHoja = { id: number; nombre: string; apellidos: string }
type Contexto = { grupo: string; area: string; unidad?: string | null }

const CSS_HOJA = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Outfit, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
.pagina { position: relative; width: ${PAGINA.ancho}mm; height: ${PAGINA.alto}mm; overflow: hidden; page-break-after: always; break-after: page; }
.pagina:last-child { page-break-after: auto; break-after: auto; }
.abs { position: absolute; }
.marca { position: absolute; width: ${MARCA.lado}mm; height: ${MARCA.lado}mm; background: #000; }
.titulo { font-size: 15pt; font-weight: 800; line-height: 1.15; }
.nombre { font-size: 13pt; font-weight: 700; }
.meta { font-size: 9pt; color: #333; }
.aviso { font-size: 8pt; color: #444; line-height: 1.35; }
.qr { position: absolute; width: ${QR.lado}mm; height: ${QR.lado}mm; }
.qr img { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
.burbuja { position: absolute; width: ${BURBUJA.diametro}mm; height: ${BURBUJA.diametro}mm; border: 0.35mm solid #000; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: 6.5pt; color: #999; line-height: 1; }
.numero { position: absolute; width: ${BURBUJA.numeroAncho - 1}mm; height: ${BURBUJA.diametro}mm; display: flex; align-items: center; justify-content: flex-end;
  font-size: 8pt; font-weight: 700; color: #222; font-variant-numeric: tabular-nums; }
.letra { position: absolute; width: ${BURBUJA.diametro}mm; text-align: center; font-size: 7pt; font-weight: 700; color: #555; }
.pie { position: absolute; left: 25mm; right: 25mm; bottom: 8mm; font-size: 6.5pt; color: #777; display: flex; justify-content: space-between; }
@media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
@media screen { body { background: #ddd; padding: 12px; } .pagina { margin: 0 auto 12px; box-shadow: 0 4px 24px rgba(0,0,0,.2); background: #fff; } }
`

const CSS_EXAMEN = `
@page { size: A4; margin: 18mm 20mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #111; font-family: Outfit, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.4; }
h1 { font-size: 16pt; margin: 0 0 2mm; }
.meta { font-size: 9.5pt; color: #333; margin-bottom: 3mm; }
.datos { display: flex; gap: 8mm; font-size: 10pt; margin: 0 0 6mm; }
.datos span { flex: 1; border-bottom: 0.3mm solid #333; padding-bottom: 1mm; }
.aviso { font-size: 9pt; color: #444; border: 0.3mm solid #999; padding: 2mm 3mm; margin-bottom: 5mm; }
ol.preguntas { padding-left: 7mm; margin: 0; }
ol.preguntas > li { margin-bottom: 4mm; break-inside: avoid; }
.enunciado { font-weight: 600; }
.puntos { font-weight: 400; color: #666; font-size: 9pt; }
ol.opciones { list-style: none; padding-left: 4mm; margin: 1mm 0 0; }
ol.opciones li { margin: 0.6mm 0; }
ol.opciones b { display: inline-block; width: 6mm; }
@media screen { body { padding: 20mm; max-width: 180mm; margin: 0 auto; } }
`

function fecha(): string {
  return new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

const mm = (n: number) => `${n.toFixed(2)}mm`

/** Una hoja de respuestas: un alumno. */
export function hojaRespuestas(def: PruebaDef, alumno: AlumnoHoja, qrDataUrl: string, ctx: Contexto): string {
  const nOpciones = Math.max(...def.preguntas.map(p => p.opciones?.length ?? 0))
  const g = geometriaHoja(def.preguntas.length, nOpciones)
  const partes: string[] = []

  for (const m of MARCAS) {
    partes.push(`<div class="marca" style="left:${mm(m.cx - MARCA.lado / 2)};top:${mm(m.cy - MARCA.lado / 2)}"></div>`)
  }
  partes.push(`<div class="abs titulo" style="left:25mm;top:13mm;width:120mm">${esc(def.titulo)}</div>`)
  partes.push(`<div class="abs nombre" style="left:25mm;top:27mm;width:120mm">${esc(alumno.apellidos)}, ${esc(alumno.nombre)}</div>`)
  partes.push(`<div class="abs meta" style="left:25mm;top:34mm;width:120mm">${esc(ctx.grupo)} · ${esc(ctx.area)}${ctx.unidad ? ` · ${esc(ctx.unidad)}` : ''} · ${esc(fecha())}</div>`)
  partes.push(`<div class="abs aviso" style="left:25mm;top:42mm;width:118mm">
    Rellena <b>del todo</b> el círculo de tu respuesta, con bolígrafo o lápiz oscuro. Una sola respuesta por pregunta.
    Si te equivocas, tacha con una X la que no vale y rellena la buena. No dobles la hoja ni escribas sobre los cuadrados negros ni el código.
  </div>`)
  partes.push(`<div class="qr" style="left:${mm(QR.x)};top:${mm(QR.y)}"><img src="${qrDataUrl}" alt=""></div>`)

  for (const col of g.columnas) {
    for (let j = 0; j < nOpciones; j++) {
      const x = col.x + BURBUJA.numeroAncho + j * BURBUJA.paso
      partes.push(`<div class="letra" style="left:${mm(x)};top:${mm(BURBUJA.y0 - 5)}">${LETRAS[j]}</div>`)
    }
    for (let i = col.desde; i <= col.hasta; i++) {
      const y = BURBUJA.y0 + (i % 25) * BURBUJA.paso
      partes.push(`<div class="numero" style="left:${mm(col.x)};top:${mm(y)}">${i + 1}</div>`)
    }
  }
  for (const b of g.burbujas) {
    partes.push(`<div class="burbuja" style="left:${mm(b.cx - b.r)};top:${mm(b.cy - b.r)}">${LETRAS[b.opcion]}</div>`)
  }
  partes.push(`<div class="pie"><span>EDUmind MiClase · hoja de respuestas · ${g.nPreguntas} preguntas · ${nOpciones} opciones</span><span>Se corrige con la cámara del docente; nada sale del aparato.</span></div>`)
  return `<div class="pagina" data-alumno="${alumno.id}">${partes.join('\n')}</div>`
}

/** Todas las hojas de respuestas de la clase, una página por alumno. */
export function documentoHojasRespuestas(def: PruebaDef, alumnos: AlumnoHoja[], qrPorAlumno: Map<number, string>, ctx: Contexto): string {
  const hojas = alumnos.map(a => hojaRespuestas(def, a, qrPorAlumno.get(a.id) ?? '', ctx))
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(def.titulo)} · hojas de respuestas</title><style>${CSS_HOJA}</style></head><body>${hojas.join('\n')}</body></html>`
}

/** El examen para el alumnado: enunciados y opciones, sin la clave. */
export function documentoExamen(def: PruebaDef, ctx: Contexto): string {
  const preguntas = def.preguntas.map(p => `<li>
    <div class="enunciado">${esc(p.enunciado)}${p.max !== 1 ? ` <span class="puntos">(${p.max} pt)</span>` : ''}</div>
    <ol class="opciones">${(p.opciones ?? []).map((o, j) => `<li><b>${LETRAS[j].toLowerCase()})</b> ${esc(o)}</li>`).join('')}</ol>
  </li>`).join('\n')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(def.titulo)}</title><style>${CSS_EXAMEN}</style></head><body>
<h1>${esc(def.titulo)}</h1>
<div class="meta">${esc(ctx.grupo)} · ${esc(ctx.area)}${ctx.unidad ? ` · ${esc(ctx.unidad)}` : ''} · ${def.preguntas.length} preguntas</div>
<div class="datos"><span>Nombre: </span><span>Fecha: </span></div>
<div class="aviso">Marca tus respuestas en la <b>hoja de respuestas</b>, rellenando del todo el círculo de la letra elegida. ${def.penalizacion ? 'Los fallos restan; en blanco no resta.' : 'En blanco no resta.'}</div>
<ol class="preguntas">${preguntas}</ol>
</body></html>`
}
