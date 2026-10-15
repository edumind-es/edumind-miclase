import { WebPlugin } from '@capacitor/core'
import type { ImpresoraPlugin, OpcionesImpresion } from './impresora'

/**
 * Impresión en el navegador: desde un iframe oculto.
 *
 * El iframe evita los bloqueadores de ventanas emergentes y garantiza que el
 * documento nunca abandona la pestaña de la app. Es el código que vivía en
 * `informes/lamina.ts`; se movió aquí para que el nativo tenga su propia
 * implementación detrás de la misma puerta.
 */
export class ImpresoraWeb extends WebPlugin implements ImpresoraPlugin {
  imprimirHTML({ html }: OpcionesImpresion): Promise<{ completado: boolean }> {
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
}
