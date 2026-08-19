/**
 * Informes en el Sistema Lámina EDUmind.
 *
 * Se generan como documento HTML con la hoja de estilo del canon
 * (papel, tinta, barra de Cinco Mundos, tipografías Outfit e IBM Plex Mono)
 * y una hoja @page A4. El docente pulsa imprimir y elige «Guardar como PDF»:
 * sale el documento con la tipografía y el reglado reales, cosa que un
 * generador de PDF con Helvetica no puede dar.
 *
 * Todo se compone en memoria y se imprime desde un iframe oculto: no se
 * abre ninguna ventana emergente y no sale nada del dispositivo.
 */

// ─── Utilidades ──────────────────────────────────────────────────────────

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function nota(v: number | null | undefined, decimales = 1): string {
  if (v == null) return '—'
  return v.toFixed(decimales).replace('.', ',')
}

function fechaLarga(d = new Date()): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Color de tinta por tramo de nota, dentro de la paleta de la lámina. */
export function tinta(v: number | null | undefined): string {
  if (v == null) return 'var(--lm-ink-3)'
  if (v >= 9) return 'var(--lm-interior-deep)'
  if (v >= 7) return 'var(--lm-mental-deep)'
  if (v >= 6) return 'var(--lm-emocional-deep)'
  if (v >= 5) return 'var(--lm-social-deep)'
  return 'var(--lm-fisico-deep)'
}

// ─── Hoja de estilo del documento ────────────────────────────────────────

const CSS = `
@font-face {
  font-family: 'Outfit'; font-style: normal; font-weight: 100 900;
  font-display: swap; src: url('/fonts/Outfit-Variable.woff2') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono'; font-style: normal; font-weight: 400;
  font-display: swap; src: url('/fonts/IBMPlexMono-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono'; font-style: normal; font-weight: 600;
  font-display: swap; src: url('/fonts/IBMPlexMono-SemiBold.woff2') format('woff2');
}

:root {
  --lm-fisico: #e8613f; --lm-social: #e8a92e; --lm-emocional: #6ea94a;
  --lm-mental: #3f7d99; --lm-interior: #2c5c66;
  --lm-fisico-deep: #a63a1f; --lm-social-deep: #7d560e; --lm-emocional-deep: #3f6b2a;
  --lm-mental-deep: #2f6076; --lm-interior-deep: #2c5c66;
  --lm-paper: #e9e6dd; --lm-paper-2: #f0ede5;
  --lm-ink: #1c1a16; --lm-ink-2: #4f4a41; --lm-ink-3: #8a8377;
  --lm-rule: #c7c0b1; --lm-rule-strong: #1c1a16;
  --lm-display: 'Outfit', 'Helvetica Neue', Arial, sans-serif;
  --lm-body: 'Outfit', system-ui, sans-serif;
  --lm-mono: 'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--lm-paper);
  color: var(--lm-ink);
  font-family: var(--lm-body);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.hoja {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  background: var(--lm-paper);
  padding: 0 0 16mm;
  position: relative;
  page-break-after: always;
}
.hoja:last-child { page-break-after: auto; }

/* Barra de los Cinco Mundos, a sangre */
.lm-plate-top { display: flex; height: 7mm; }
.lm-plate-top i { flex: 1; }
.lm-plate-top i:nth-child(1) { background: var(--lm-fisico); }
.lm-plate-top i:nth-child(2) { background: var(--lm-social); }
.lm-plate-top i:nth-child(3) { background: var(--lm-emocional); }
.lm-plate-top i:nth-child(4) { background: var(--lm-mental); }
.lm-plate-top i:nth-child(5) { background: var(--lm-interior); }

.wrap { padding: 0 16mm; }

.lm-plate-meta {
  display: flex; justify-content: space-between; align-items: baseline;
  border-bottom: 2px solid var(--lm-rule-strong);
  padding: 5mm 0 2.5mm;
  font-family: var(--lm-mono); font-size: 7.5pt; letter-spacing: .04em;
  color: var(--lm-ink-2); text-transform: uppercase;
}
.lm-plate-meta .fig { color: var(--lm-ink); font-weight: 600; }

.kicker {
  font-weight: 600; font-size: 8.5pt; color: var(--lm-fisico-deep);
  margin: 7mm 0 1.5mm; letter-spacing: .02em; text-transform: uppercase;
}
.display {
  font-family: var(--lm-display); font-weight: 800;
  font-size: 26pt; line-height: 1.02; letter-spacing: -.025em;
}
.subtitulo { font-size: 11pt; color: var(--lm-ink-2); margin-top: 2mm; }

.metas {
  display: flex; flex-wrap: wrap; margin-top: 5mm;
  border-top: 1px solid var(--lm-rule); border-bottom: 1px solid var(--lm-rule);
}
.metas span {
  font-family: var(--lm-mono); font-size: 8pt; color: var(--lm-ink-2);
  padding: 2.5mm 4mm 2.5mm 0; margin-right: 4mm;
  border-right: 1px solid var(--lm-rule);
}
.metas span:last-child { border-right: none; margin-right: 0; }
.metas b { color: var(--lm-ink); font-weight: 600; }

.seccion { display: grid; grid-template-columns: auto 1fr; gap: 5mm; margin-top: 8mm; }
.num {
  font-family: var(--lm-display); font-weight: 800; font-size: 20pt;
  line-height: .8; color: var(--lm-mental-deep); letter-spacing: -.03em;
}
.cuerpo { border-top: 2px solid var(--lm-rule-strong); padding-top: 3mm; }
.cuerpo > h2 {
  font-family: var(--lm-display); font-weight: 700; font-size: 13pt;
  margin: 0 0 3mm; letter-spacing: -.01em;
}

.sub {
  font-family: var(--lm-mono); font-size: 7pt; letter-spacing: .1em;
  text-transform: uppercase; color: var(--lm-ink-2); margin: 5mm 0 2mm;
}

table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th {
  font-family: var(--lm-mono); font-size: 7pt; letter-spacing: .09em;
  text-transform: uppercase; color: var(--lm-ink-2); text-align: left;
  border-bottom: 2px solid var(--lm-rule-strong); padding: 2mm 2mm 1.5mm 0;
  font-weight: 400;
}
td {
  border-bottom: 1px solid var(--lm-rule); padding: 2mm 2mm 2mm 0;
  color: var(--lm-ink); vertical-align: top;
}
th.n, td.n { text-align: right; padding-right: 0; width: 15mm; }
td.n { font-family: var(--lm-mono); font-weight: 600; }
td.criterio-id { font-family: var(--lm-mono); font-weight: 600; font-size: 8pt; white-space: nowrap; width: 20mm; }
td.desc { color: var(--lm-ink-2); font-size: 8pt; line-height: 1.4; }
tr.destacada td { border-bottom: 2px solid var(--lm-rule-strong); font-weight: 600; }

.sello {
  display: inline-block; font-family: var(--lm-mono); font-size: 7.5pt;
  padding: 1mm 2mm; letter-spacing: .04em; text-transform: uppercase;
  border: 1.2px solid currentColor;
}

.barra { display: flex; align-items: center; gap: 2mm; }
.barra .pista { flex: 1; height: 2mm; background: var(--lm-paper-2); border: 1px solid var(--lm-rule); }
.barra .relleno { height: 100%; }

.evidencias { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 3mm; }
.evidencias figure { break-inside: avoid; }
.evidencias img {
  width: 100%; height: 34mm; object-fit: cover;
  border: 1px solid var(--lm-rule); display: block;
}
.evidencias figcaption {
  font-family: var(--lm-mono); font-size: 6.5pt; color: var(--lm-ink-2);
  margin-top: 1mm; line-height: 1.3;
}

.observacion {
  border-left: 2px solid var(--lm-fisico); padding: 1mm 0 1mm 3mm;
  margin-bottom: 2.5mm; font-size: 8.5pt; color: var(--lm-ink-2);
}
.observacion .flag {
  font-family: var(--lm-mono); font-size: 6.5pt; letter-spacing: .08em;
  text-transform: uppercase; color: var(--lm-fisico-deep);
  border: 1px solid var(--lm-fisico-deep); padding: .3mm 1mm; margin-right: 2mm;
}

.pie {
  border-top: 2px solid var(--lm-rule-strong);
  margin-top: 9mm; padding-top: 3mm;
  font-size: 7.5pt; color: var(--lm-ink-2); line-height: 1.6;
  display: flex; justify-content: space-between; gap: 6mm;
}
.pie b { color: var(--lm-ink); }
.firma { margin-top: 10mm; display: flex; gap: 12mm; }
.firma div { flex: 1; border-top: 1px solid var(--lm-rule-strong); padding-top: 2mm;
  font-family: var(--lm-mono); font-size: 7pt; text-transform: uppercase;
  letter-spacing: .08em; color: var(--lm-ink-2); }

.vacio { font-size: 9pt; color: var(--lm-ink-3); font-style: italic; }

@page { size: A4; margin: 0; }

@media print {
  body { background: #fff; }
  .hoja { margin: 0; box-shadow: none; }
  .no-imprimir { display: none !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}

@media screen {
  body { padding: 12px; }
  .hoja { box-shadow: 0 4px 24px rgba(0,0,0,.18); margin-bottom: 16px; }
}
`

// ─── Envoltorio del documento ────────────────────────────────────────────

export function documento(titulo: string, hojas: string[]): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>${CSS}</style>
</head>
<body>
${hojas.join('\n')}
</body>
</html>`
}

export function hoja(contenido: string): string {
  return `<div class="hoja">
  <div class="lm-plate-top"><i></i><i></i><i></i><i></i><i></i></div>
  <div class="wrap">${contenido}</div>
</div>`
}

export function cabecera(figura: string): string {
  return `<div class="lm-plate-meta">
    <span class="fig">EDUmind · MiClase</span>
    <span>${esc(figura)}</span>
  </div>`
}

export function pie(extra = ''): string {
  return `<div class="pie">
    <div>
      <b>EDUmind MiClase</b> · Documento generado el ${fechaLarga()}<br>
      Los datos de este informe residen únicamente en el dispositivo del docente.
      ${extra ? `<br>${extra}` : ''}
    </div>
    <div style="text-align:right; white-space:nowrap">
      EDUmind® por <b>Luis Vilela Acuña</b><br>
      Software libre AGPL-3.0-or-later / EUPL-1.2
    </div>
  </div>`
}

export function seccion(numero: string, titulo: string, contenido: string): string {
  return `<div class="seccion">
    <div class="num">${esc(numero)}</div>
    <div class="cuerpo">
      <h2>${esc(titulo)}</h2>
      ${contenido}
    </div>
  </div>`
}

export function barraNota(v: number | null | undefined): string {
  const pct = v == null ? 0 : Math.max(0, Math.min(100, v * 10))
  return `<div class="barra">
    <div class="pista"><div class="relleno" style="width:${pct}%;background:${tinta(v)}"></div></div>
  </div>`
}

// ─── Impresión ───────────────────────────────────────────────────────────

/**
 * Imprime un documento HTML desde un iframe oculto.
 * El iframe evita los bloqueadores de ventanas emergentes y garantiza que
 * el documento nunca abandona la pestaña de la app.
 */
export function imprimir(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(iframe)

    const limpiar = () => {
      setTimeout(() => { iframe.remove() }, 1500)
    }

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow
        if (!win) throw new Error('No se pudo preparar el documento')
        // Esperar a que las tipografías estén listas para que el
        // documento no se imprima con la fuente de reserva
        const lanzar = () => {
          win.focus()
          win.print()
          limpiar()
          resolve()
        }
        const docFonts = (win.document as any).fonts
        docFonts?.ready ? docFonts.ready.then(lanzar).catch(lanzar) : lanzar()
      } catch (e) {
        limpiar()
        reject(e)
      }
    }

    const doc = iframe.contentDocument
    if (!doc) { iframe.remove(); reject(new Error('No se pudo preparar el documento')); return }
    doc.open()
    doc.write(html)
    doc.close()
  })
}

// ─── Fuentes incrustadas ─────────────────────────────────────────────────

const FUENTES = [
  '/fonts/Outfit-Variable.woff2',
  '/fonts/IBMPlexMono-Regular.woff2',
  '/fonts/IBMPlexMono-SemiBold.woff2',
]

const cacheFuentes = new Map<string, string>()

async function comoDataURL(ruta: string): Promise<string | null> {
  if (cacheFuentes.has(ruta)) return cacheFuentes.get(ruta)!
  try {
    const res = await fetch(ruta)
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    let bin = ''
    const CHUNK = 0x8000
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode(...buf.subarray(i, i + CHUNK))
    }
    const url = `data:font/woff2;base64,${btoa(bin)}`
    cacheFuentes.set(ruta, url)
    return url
  } catch {
    return null
  }
}

/**
 * Sustituye las rutas de las fuentes por data-URLs.
 *
 * Al imprimir desde la app las rutas absolutas funcionan, pero un fichero
 * .html guardado en el disco resolvería `/fonts/...` contra la raíz del
 * sistema y saldría con la tipografía de reserva. Incrustándolas, el
 * documento archivado conserva el canon aunque se abra dentro de diez años
 * en un ordenador sin la app.
 */
export async function incrustarFuentes(html: string): Promise<string> {
  let salida = html
  for (const ruta of FUENTES) {
    const dataUrl = await comoDataURL(ruta)
    if (dataUrl) salida = salida.split(`url('${ruta}')`).join(`url('${dataUrl}')`)
  }
  return salida
}

/** Descarga el informe como fichero .html autocontenido (archivo o correo). */
export async function descargarHTML(html: string, nombre: string): Promise<void> {
  const autocontenido = await incrustarFuentes(html)
  const blob = new Blob([autocontenido], { type: 'text/html;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
