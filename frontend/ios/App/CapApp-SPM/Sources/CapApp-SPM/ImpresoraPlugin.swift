import Foundation
import UIKit
import WebKit
import Capacitor

/// Impresión de documentos HTML desde la app nativa.
///
/// WKWebView no implementa `window.print()`, así que el botón «Imprimir / PDF»
/// de los informes —y la hoja de QR de mesa— no hacían nada en el iPad. Aquí
/// el HTML se carga en un WKWebView aparte, se pagina en A4 con el formateador
/// de impresión del propio WebKit (respeta la hoja `@page` y `@media print`
/// del documento), se vuelca a un PDF y se abre la hoja de compartir del
/// sistema: AirPrint, «Guardar en Archivos», AirDrop, Mail… El PDF se escribe
/// en el directorio temporal y se retira al cerrar la hoja.
///
/// Las fuentes deben venir incrustadas en el HTML (lo hace `lamina.ts` antes
/// de llamar): el documento se renderiza fuera del origen de la app y una ruta
/// como `/fonts/Outfit-Variable.woff2` no resolvería a nada.
///
/// Se registra en `MiClaseViewController.capacitorDidLoad()`; el lado web está
/// en `frontend/src/nativo/impresora.ts`.
@objc(ImpresoraPlugin)
public class ImpresoraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ImpresoraPlugin"
    public let jsName = "Impresora"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "imprimirHTML", returnType: CAPPluginReturnPromise)
    ]

    /// A4 en puntos (72 ppp): 210 × 297 mm.
    static let a4 = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)

    /// Documentos en curso. Cada uno mantiene vivo su WKWebView hasta que el
    /// PDF está hecho; si no, ARC lo soltaría a mitad de carga.
    private var trabajos: [TrabajoImpresion] = []

    @objc func imprimirHTML(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), !html.isEmpty else {
            call.reject("Falta el documento HTML")
            return
        }
        let nombre = Self.nombreSeguro(call.getString("nombre") ?? "documento")

        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  let presentador = self.bridge?.viewController,
                  let contenedor = presentador.view else {
                call.reject("La vista de la app no está disponible")
                return
            }
            let trabajo = TrabajoImpresion(llamada: call, nombre: nombre) { [weak self] terminado in
                self?.trabajos.removeAll { $0 === terminado }
            }
            self.trabajos.append(trabajo)
            trabajo.empezar(html: html, en: contenedor, presentador: presentador)
        }
    }

    /// Un nombre de fichero que el sistema acepte: sin separadores de ruta ni
    /// caracteres que Archivos o Mail rechacen.
    private static func nombreSeguro(_ s: String) -> String {
        let prohibidos = CharacterSet(charactersIn: "/\\:?%*|\"<>").union(.newlines)
        let limpio = s.components(separatedBy: prohibidos).joined(separator: "-")
            .trimmingCharacters(in: .whitespaces)
        return limpio.isEmpty ? "documento" : String(limpio.prefix(80))
    }
}

/// Un documento de camino al PDF: carga, paginación y hoja de compartir.
private final class TrabajoImpresion: NSObject, WKNavigationDelegate {
    private let llamada: CAPPluginCall
    private let nombre: String
    private let alTerminar: (TrabajoImpresion) -> Void
    private var webView: WKWebView?
    private weak var presentador: UIViewController?
    private var carpetaPDF: URL?

    init(llamada: CAPPluginCall, nombre: String, alTerminar: @escaping (TrabajoImpresion) -> Void) {
        self.llamada = llamada
        self.nombre = nombre
        self.alTerminar = alTerminar
    }

    func empezar(html: String, en contenedor: UIView, presentador: UIViewController) {
        self.presentador = presentador
        // El WebView tiene que estar en la jerarquía de vistas para que WebKit
        // lo pagine; va detrás del de la app, que lo tapa por completo.
        let vista = WKWebView(frame: CGRect(origin: .zero, size: ImpresoraPlugin.a4.size),
                              configuration: WKWebViewConfiguration())
        vista.isUserInteractionEnabled = false
        vista.navigationDelegate = self
        contenedor.insertSubview(vista, at: 0)
        webView = vista
        vista.loadHTMLString(html, baseURL: nil)
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Esperar a las fuentes incrustadas: si no, la primera página puede
        // salir con la tipografía de reserva.
        webView.callAsyncJavaScript(
            "if (document.fonts) { await document.fonts.ready; } return true;",
            arguments: [:], in: nil, in: .page
        ) { [weak self] _ in
            // Un respiro para que el motor recoloque el texto con las fuentes ya cargadas
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self?.generarPDF() }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fallar("No se pudo componer el documento: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fallar("No se pudo componer el documento: \(error.localizedDescription)")
    }

    // MARK: PDF

    private func generarPDF() {
        guard let webView = webView else {
            fallar("El documento se descartó antes de terminar")
            return
        }
        let renderizador = RenderizadorA4(papel: ImpresoraPlugin.a4)
        renderizador.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)

        let datos = NSMutableData()
        let info: [AnyHashable: Any] = [
            kCGPDFContextTitle as String: nombre,
            kCGPDFContextCreator as String: "EDUmind MiClase",
        ]
        UIGraphicsBeginPDFContextToData(datos, ImpresoraPlugin.a4, info)
        let paginas = max(renderizador.numberOfPages, 1)
        for indice in 0..<paginas {
            UIGraphicsBeginPDFPage()
            renderizador.drawPage(at: indice, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()

        let carpeta = FileManager.default.temporaryDirectory
            .appendingPathComponent("impresion-\(UUID().uuidString)", isDirectory: true)
        let url = carpeta.appendingPathComponent("\(nombre).pdf")
        do {
            try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
            try datos.write(to: url, options: .atomic)
        } catch {
            fallar("No se pudo guardar el PDF: \(error.localizedDescription)")
            return
        }
        carpetaPDF = carpeta
        presentar(url)
    }

    private func presentar(_ url: URL) {
        guard let presentador = presentador, let vista = presentador.view else {
            fallar("La vista de la app no está disponible")
            return
        }
        let hoja = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        hoja.completionWithItemsHandler = { [weak self] _, completado, _, error in
            if let error = error {
                self?.fallar(error.localizedDescription)
            } else {
                self?.terminar(completado: completado)
            }
        }
        // En iPad la hoja es un popover y necesita un ancla
        if let popover = hoja.popoverPresentationController {
            popover.sourceView = vista
            popover.sourceRect = CGRect(x: vista.bounds.midX, y: vista.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        presentador.present(hoja, animated: true)
    }

    // MARK: Cierre

    private func terminar(completado: Bool) {
        limpiar()
        llamada.resolve(["completado": completado])
        alTerminar(self)
    }

    private func fallar(_ motivo: String) {
        limpiar()
        llamada.reject(motivo)
        alTerminar(self)
    }

    private func limpiar() {
        webView?.navigationDelegate = nil
        webView?.removeFromSuperview()
        webView = nil
        if let carpetaPDF = carpetaPDF {
            try? FileManager.default.removeItem(at: carpetaPDF)
        }
    }
}

/// `UIPrintPageRenderer` con papel fijo. `paperRect` y `printableRect` son de
/// solo lectura y están pensadas para sobrescribirse en una subclase: así se
/// evita el `setValue(forKey:)` de los ejemplos clásicos, que depende de un
/// detalle interno de UIKit. El área imprimible es la hoja entera porque los
/// documentos de Lámina ya traen `@page { margin: 0 }` y sus propios márgenes.
private final class RenderizadorA4: UIPrintPageRenderer {
    private let papel: CGRect

    init(papel: CGRect) {
        self.papel = papel
        super.init()
    }

    override var paperRect: CGRect { papel }
    override var printableRect: CGRect { papel }
}
