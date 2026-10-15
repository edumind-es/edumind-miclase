import UIKit
import Capacitor

/// Controlador del WebView de la app.
///
/// Existe para registrar los plugins propios —los que no vienen de npm— en el
/// puente de Capacitor. Es la única forma que da Capacitor de añadir un plugin
/// local: una subclase de `CAPBridgeViewController` que lo inscriba en
/// `capacitorDidLoad()`. La usan `SceneDelegate.swift` y `Main.storyboard`
/// del target App.
///
/// Vive en el paquete local `CapApp-SPM` (del que el target App ya depende) y
/// no en el propio target porque así no hace falta tocar `project.pbxproj`
/// para añadir ficheros: lo que haya en este directorio se compila solo.
public class MiClaseViewController: CAPBridgeViewController {

    public override func capacitorDidLoad() {
        // Impresión y PDF de informes y hojas de QR (ver ImpresoraPlugin.swift)
        bridge?.registerPluginInstance(ImpresoraPlugin())
    }
}
