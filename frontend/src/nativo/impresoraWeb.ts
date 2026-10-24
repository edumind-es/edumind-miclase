import { WebPlugin } from '@capacitor/core'
import type { ImpresoraPlugin, OpcionesImpresion } from './impresora'
import { esWebKit, esAppInstalada } from './webkit'
import { compartirFichero } from '@/utils/compartir'

/**
 * Impresión en el navegador: desde un iframe oculto.
 *
 * El iframe evita los bloqueadores de ventanas emergentes y garantiza que el
 * documento nunca abandona la pestaña de la app. Es el código que vivía en
 * `informes/lamina.ts`; se movió aquí para que el nativo tenga su propia
 * implementación detrás de la misma puerta.
 *
 * En Safari y en el iPad el iframe oculto no imprime nada (`webkit.ts`): ahí
 * el documento se enseña a la vista, con «Imprimir» —que en Safari sí abre la
 * hoja desde un iframe visible y una pulsación— y «Compartir», que en la app
 * instalada del iPad es el único camino: la hoja del sistema trae Imprimir,
 * Guardar en Archivos y AirDrop. `completado` solo es verdad si el docente
 * pulsó una de las dos: cerrar la vista previa no es haber impreso.
 */
export class ImpresoraWeb extends WebPlugin implements ImpresoraPlugin {
  imprimirHTML(opciones: OpcionesImpresion): Promise<{ completado: boolean }> {
    if (esWebKit()) return vistaPrevia(opciones)
    return imprimirOculto(opciones)
  }
}

function imprimirOculto({ html }: OpcionesImpresion): Promise<{ completado: boolean }> {
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
            resolve({ completado: true })
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

/** El documento a la vista, con Imprimir y Compartir. Resuelve al cerrar. */
function vistaPrevia({ html, nombre = 'documento' }: OpcionesImpresion): Promise<{ completado: boolean }> {
  return new Promise((resolve) => {
    const instalada = esAppInstalada()
    let completado = false

    const capa = document.createElement('div')
    capa.setAttribute('data-vista-impresion', '')
    capa.setAttribute('role', 'dialog')
    capa.setAttribute('aria-modal', 'true')
    capa.setAttribute('aria-label', `Imprimir «${nombre}»`)
    capa.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.72);display:flex;flex-direction:column'

    const barra = document.createElement('div')
    barra.style.cssText = 'background:#fff;padding:10px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #d1d5db;font-size:13px'
    const texto = document.createElement('div')
    texto.style.cssText = 'flex:1 1 260px;min-width:0;line-height:1.4;color:#374151'
    texto.innerHTML = instalada
      ? '<strong>Vista previa.</strong> En la app instalada el iPad no abre la impresión directa: pulsa <strong>Compartir</strong> y elige «Imprimir» o «Guardar en Archivos».'
      : '<strong>Vista previa.</strong> Pulsa <strong>Imprimir</strong> y elige la impresora o «Guardar como PDF». Sin escalado y sin márgenes, para que las marcas salgan enteras.'
    const boton = (etiqueta: string, clase: string, atributo: string) => {
      const b = document.createElement('button')
      b.type = 'button'; b.className = clase; b.textContent = etiqueta; b.setAttribute(atributo, '')
      b.style.fontSize = '13px'
      return b
    }
    const bImprimir = boton('🖨 Imprimir', instalada ? 'btn-secondary' : 'btn-primary', 'data-vista-imprimir')
    const bCompartir = boton('📤 Compartir / guardar', instalada ? 'btn-primary' : 'btn-secondary', 'data-vista-compartir')
    const bCerrar = boton('Cerrar', 'btn-secondary', 'data-vista-cerrar')
    barra.append(texto, bImprimir, bCompartir, bCerrar)

    const marco = document.createElement('iframe')
    marco.title = nombre
    marco.style.cssText = 'flex:1;width:100%;border:0;background:#fff'
    capa.append(barra, marco)
    document.body.appendChild(capa)

    const cerrar = () => {
      window.removeEventListener('keydown', alPulsar)
      capa.remove()
      resolve({ completado })
    }
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', alPulsar)

    bCerrar.onclick = cerrar
    bImprimir.onclick = () => {
      // Dentro de la pulsación, sin esperas: es lo que Safari exige para abrir la hoja.
      const win = marco.contentWindow
      if (!win) return
      try { win.focus(); win.print(); completado = true } catch { /* el aviso de abajo */ }
    }
    bCompartir.onclick = async () => {
      bCompartir.disabled = true
      try {
        const r = await compartirFichero(`${nombre}.html`, html, 'text/html;charset=utf-8', nombre)
        if (r !== 'cancelado') completado = true
      } catch { /* cancelado o sin hoja: no pasa nada */ }
      finally { bCompartir.disabled = false }
    }

    const doc = marco.contentDocument
    if (!doc) { cerrar(); return }
    doc.open(); doc.write(html); doc.close()
  })
}
