import { WebPlugin } from '@capacitor/core'
import type { ImpresoraPlugin, OpcionesImpresion } from './impresora'
import { esWebKit, esAppInstalada } from './webkit'
import { compartirFichero, puedeCompartirFicheros } from '@/utils/compartir'

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
 * hoja desde un iframe visible y una pulsación—, «Compartir» (la hoja del
 * sistema: Guardar en Archivos, AirDrop) y «Abrir en Safari», que en la app
 * instalada del iPad es el camino para imprimir o guardar en PDF, porque la
 * hoja de compartir no imprime un `.html`. `completado` solo es verdad si el
 * docente pulsó una de ellas: cerrar la vista previa no es haber impreso.
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

/**
 * El documento a la vista, con Imprimir, Compartir y Abrir en el navegador.
 * Resuelve al cerrar.
 *
 * La app se extiende bajo la barra de estado del iPad (`viewport-fit=cover`),
 * así que la barra de botones deja una franja del color del tema para la hora
 * y la batería: sin ella, con iPadOS 26 caían encima del texto y de los
 * botones. Y la hoja de compartir del sistema no trata un `.html` como algo
 * imprimible, así que la app instalada ofrece además abrir el documento en
 * Safari, cuyo botón de compartir sí tiene Imprimir y Guardar en Archivos.
 */
function vistaPrevia({ html, nombre = 'documento' }: OpcionesImpresion): Promise<{ completado: boolean }> {
  return new Promise((resolve) => {
    const instalada = esAppInstalada()
    const conHoja = puedeCompartirFicheros()
    let completado = false
    let urlAbierta: string | null = null

    const capa = document.createElement('div')
    capa.setAttribute('data-vista-impresion', '')
    capa.setAttribute('role', 'dialog')
    capa.setAttribute('aria-modal', 'true')
    capa.setAttribute('aria-label', `Imprimir «${nombre}»`)
    capa.style.cssText = 'position:fixed;inset:0;z-index:3000;background:#0f2d4a;display:flex;flex-direction:column;'
      + 'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'

    const barra = document.createElement('div')
    barra.style.cssText = 'background:#fff;padding:10px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;'
      + 'border-bottom:1px solid #d1d5db;font-size:14px;'
      + 'padding-left:calc(14px + env(safe-area-inset-left));padding-right:calc(14px + env(safe-area-inset-right))'
    const texto = document.createElement('div')
    texto.style.cssText = 'flex:1 1 280px;min-width:0;line-height:1.4;color:#374151'
    texto.innerHTML = instalada
      ? (conHoja
        ? '<strong>Vista previa.</strong> La app instalada no imprime directo: pulsa <strong>Compartir</strong> y, en la hoja, «Guardar en Archivos» o la app de la impresora. Para imprimir o guardar en PDF desde Safari, <strong>Abrir en Safari</strong> y usa su botón de compartir.'
        : '<strong>Vista previa.</strong> La app instalada no imprime directo: pulsa <strong>Abrir en Safari</strong> y usa el botón de compartir de Safari, que tiene «Imprimir» y «Guardar en Archivos».')
      : '<strong>Vista previa.</strong> Pulsa <strong>Imprimir</strong> y elige la impresora o «Guardar como PDF». Sin escalado y sin márgenes, para que las marcas salgan enteras.'
    const estado = document.createElement('div')
    estado.setAttribute('data-vista-estado', '')
    estado.setAttribute('role', 'status')
    estado.style.cssText = 'flex:1 1 100%;font-size:13px;color:#1f2937;min-height:0'
    const boton = (etiqueta: string, clase: string, atributo: string) => {
      const b = document.createElement('button')
      b.type = 'button'; b.className = clase; b.textContent = etiqueta; b.setAttribute(atributo, '')
      // Tamaño de dedo: la docente pulsa en el iPad, no con un ratón.
      b.style.cssText = 'font-size:15px;min-height:44px;padding:8px 14px'
      return b
    }
    const bImprimir = boton('🖨 Imprimir', instalada ? 'btn-secondary' : 'btn-primary', 'data-vista-imprimir')
    const bCompartir = boton('📤 Compartir / guardar', instalada && conHoja ? 'btn-primary' : 'btn-secondary', 'data-vista-compartir')
    const bAbrir = boton(instalada ? '🧭 Abrir en Safari' : '↗ Abrir en una pestaña', instalada && !conHoja ? 'btn-primary' : 'btn-secondary', 'data-vista-abrir')
    const bCerrar = boton('Cerrar', 'btn-secondary', 'data-vista-cerrar')
    // En la app instalada «Imprimir» no abre nada: se retira para no engañar.
    barra.append(texto, ...(instalada ? [] : [bImprimir]), bCompartir, bAbrir, bCerrar, estado)

    const marco = document.createElement('iframe')
    marco.title = nombre
    marco.style.cssText = 'flex:1;width:100%;border:0;background:#fff'
    capa.append(barra, marco)
    document.body.appendChild(capa)

    const cerrar = () => {
      window.removeEventListener('keydown', alPulsar)
      capa.remove()
      // Safari sigue leyendo la URL en la pestaña nueva: se revoca con margen.
      if (urlAbierta) setTimeout(() => URL.revokeObjectURL(urlAbierta!), 60_000)
      resolve({ completado })
    }
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', alPulsar)

    bCerrar.onclick = cerrar
    bImprimir.onclick = () => {
      // Dentro de la pulsación, sin esperas: es lo que Safari exige para abrir la hoja.
      const win = marco.contentWindow
      if (!win) return
      try { win.focus(); win.print(); completado = true } catch { estado.textContent = 'Este navegador no ha abierto la impresión: prueba «Compartir» o «Abrir en una pestaña».' }
    }
    bCompartir.onclick = async () => {
      bCompartir.disabled = true
      estado.textContent = ''
      try {
        const r = await compartirFichero(`${nombre}.html`, html, 'text/html;charset=utf-8', nombre)
        if (r === 'compartido') { completado = true; estado.textContent = 'Enviado a la hoja de compartir.' }
        else if (r === 'descargado') { completado = true; estado.textContent = `Este navegador no tiene hoja de compartir: se ha descargado «${nombre}.html» (en el iPad, en Archivos › Descargas).` }
        else estado.textContent = 'Hoja de compartir cerrada sin elegir nada.'
      } catch (e) {
        estado.textContent = `No se ha podido compartir: ${e instanceof Error ? e.message : String(e)}`
      } finally { bCompartir.disabled = false }
    }
    bAbrir.onclick = () => {
      // Dentro de la pulsación, para que no lo bloquee como ventana emergente.
      // En la app instalada del iPad una URL fuera de la app se abre en Safari.
      urlAbierta ??= URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
      const ventana = window.open(urlAbierta, '_blank', 'noopener')
      if (ventana || instalada) {
        completado = true
        estado.textContent = instalada
          ? 'Abierto en Safari: pulsa allí el botón de compartir y elige «Imprimir» o «Guardar en Archivos».'
          : 'Abierto en una pestaña nueva: imprime desde allí (⌘P o Archivo › Imprimir).'
      } else {
        estado.textContent = 'El navegador ha bloqueado la pestaña nueva: permite las ventanas emergentes para este sitio o usa «Compartir».'
      }
    }

    const doc = marco.contentDocument
    if (!doc) { cerrar(); return }
    doc.open(); doc.write(html); doc.close()
  })
}
