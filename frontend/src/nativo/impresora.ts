/**
 * Impresión de documentos HTML: informes de Lámina y hoja de QR de mesa.
 *
 * En el navegador basta `window.print()` desde un iframe oculto. En la app
 * nativa no existe: WKWebView no implementa la impresión desde JavaScript y
 * el botón «Imprimir / PDF» no hacía nada en el iPad. El lado nativo
 * (`ios/App/App/ImpresoraPlugin.swift`) compone el HTML en páginas A4, genera
 * el PDF y abre la hoja del sistema, que es donde viven AirPrint, «Guardar en
 * Archivos», AirDrop y Mail.
 *
 * Android no tiene implementación nativa todavía: usa la de la web, que es lo
 * que hacía hasta ahora.
 */
import { registerPlugin } from '@capacitor/core'

export interface OpcionesImpresion {
  /** Documento completo con sus estilos. En nativo, con las fuentes incrustadas. */
  html: string
  /** Nombre del PDF resultante, sin extensión. */
  nombre?: string
}

export interface ImpresoraPlugin {
  imprimirHTML(opciones: OpcionesImpresion): Promise<{ completado: boolean }>
}

const web = () => import('./impresoraWeb').then(m => new m.ImpresoraWeb())

export const Impresora = registerPlugin<ImpresoraPlugin>('Impresora', {
  web,
  android: web,
})
