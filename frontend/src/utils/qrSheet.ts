/**
 * Hoja imprimible de códigos QR para las mesas del aula.
 * Cada QR contiene solo el código de anonimización del alumno
 * (nunca el nombre): quien lo escanee sin la app no ve nada personal.
 */
import QRCode from 'qrcode'
import type { Alumno, Grupo } from '@/db/localDb'

// El QR codifica una URL: la cámara nativa del móvil/tablet abre la app
// directamente en el panel de evaluación de ese alumno; el escáner interno
// de la app extrae el parámetro `c`.
export function urlDeCodigo(codigo: string): string {
  return `${window.location.origin}/escanear?c=${encodeURIComponent(codigo)}`
}

// Extrae el código desde cualquier formato aceptado: URL con ?c=, o código pelado
export function extraerCodigo(raw: string): string | null {
  const texto = raw.trim()
  try {
    const url = new URL(texto)
    const c = url.searchParams.get('c')
    if (c) return c.toUpperCase()
  } catch { /* no era una URL */ }
  if (/^[A-Za-z0-9]{4,8}$/.test(texto)) return texto.toUpperCase()
  return null
}

export async function imprimirHojaQR(grupo: Grupo, alumnos: Alumno[], conNombres: boolean): Promise<void> {
  const conCodigo = alumnos.filter(a => a.codigo_cifrado)

  const celdas = await Promise.all(conCodigo.map(async a => {
    const dataUrl = await QRCode.toDataURL(urlDeCodigo(a.codigo_cifrado!), {
      width: 220, margin: 1, color: { dark: '#0f2d4a', light: '#ffffff' },
    })
    return `
      <div class="celda">
        <img src="${dataUrl}" alt="QR" />
        <div class="codigo">${a.codigo_cifrado}</div>
        ${conNombres ? `<div class="nombre">${escapeHtml(a.apellidos)}, ${escapeHtml(a.nombre)}</div>` : ''}
        <div class="grupo">${escapeHtml(grupo.nombre)} · ${escapeHtml(grupo.curso_escolar)}</div>
      </div>`
  }))

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>QR de mesa — ${escapeHtml(grupo.nombre)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 10mm; }
  h1 { font-size: 14px; color: #0f2d4a; margin-bottom: 2mm; }
  p.ayuda { font-size: 10px; color: #666; margin-bottom: 5mm; }
  .hoja { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }
  .celda {
    border: 1px dashed #999; border-radius: 3mm; padding: 4mm;
    text-align: center; page-break-inside: avoid;
  }
  .celda img { width: 34mm; height: 34mm; }
  .codigo { font-family: monospace; font-size: 16px; font-weight: 700; letter-spacing: 2px; color: #0f2d4a; }
  .nombre { font-size: 10px; color: #333; margin-top: 1mm; }
  .grupo  { font-size: 8px; color: #888; margin-top: 1mm; }
  @media print { p.ayuda { display: none; } }
</style>
</head>
<body>
  <h1>EDUmind MiClase — Códigos QR de mesa · ${escapeHtml(grupo.nombre)}</h1>
  <p class="ayuda">Recorta por la línea discontinua y pega cada código en la mesa del alumno. Esta ventana se puede cerrar tras imprimir.</p>
  <div class="hoja">${celdas.join('')}</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300))</script>
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) throw new Error('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para esta web.')
  w.document.write(html)
  w.document.close()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ))
}
