/**
 * Lectura de códigos QR con dos motores.
 *
 * Chrome y Android traen `BarcodeDetector` nativo: es el más rápido y el que
 * conviene usar cuando está. Safari y —lo que importa aquí— el WKWebView en el
 * que corre la app de iPad NO lo implementan, así que sin alternativa el
 * escáner se quedaba en «introduce el código a mano». Como escanear el QR de
 * la mesa es justamente el flujo estrella en tablet, hay un segundo motor en
 * JavaScript que se carga solo cuando hace falta.
 *
 * El fotograma se reduce antes de analizarlo: a resolución completa el
 * decodificador en JavaScript no va fluido en un iPad de hace unos años, y
 * para un QR de mesa no aporta nada.
 */

/**
 * Lado al que se reduce el fotograma antes de analizarlo. 640 basta y sobra
 * para un QR de mesa. El de emparejar dos dispositivos es mucho mas denso
 * (unos 660 caracteres, version 17), y a 640 se queda justo de resolucion:
 * por eso se puede subir desde fuera.
 */
const LADO_MAXIMO = 640

export type Lector = {
  /** Cómo se está leyendo, para poder decírselo al docente */
  motor: 'nativo' | 'javascript'
  /** Devuelve el contenido del QR, o null si en este fotograma no hay ninguno */
  leer: (video: HTMLVideoElement) => Promise<string | null>
  liberar: () => void
}

function hayDetectorNativo(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

/** Siempre se puede escanear: o con el detector nativo, o con el de reserva. */
export function sePuedeEscanear(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

async function lectorNativo(): Promise<Lector> {
  const Detector = (window as any).BarcodeDetector
  const detector = new Detector({ formats: ['qr_code'] })
  return {
    motor: 'nativo',
    async leer(video) {
      const codigos = await detector.detect(video)
      return codigos?.[0]?.rawValue ?? null
    },
    liberar() { /* el detector nativo no retiene nada */ },
  }
}

async function lectorJavaScript(ladoMaximo: number): Promise<Lector> {
  // Carga diferida: quien tenga detector nativo no descarga esto nunca
  const { default: jsQR } = await import('jsqr')

  const lienzo = document.createElement('canvas')
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })

  return {
    motor: 'javascript',
    async leer(video) {
      if (!ctx || !video.videoWidth) return null

      const escala = Math.min(1, ladoMaximo / Math.max(video.videoWidth, video.videoHeight))
      const w = Math.round(video.videoWidth * escala)
      const h = Math.round(video.videoHeight * escala)
      if (lienzo.width !== w || lienzo.height !== h) {
        lienzo.width = w
        lienzo.height = h
      }

      ctx.drawImage(video, 0, 0, w, h)
      const datos = ctx.getImageData(0, 0, w, h)
      // `dontInvert`: los QR impresos son oscuros sobre claro, y probar la
      // inversión duplicaría el trabajo por fotograma sin ganar nada
      const codigo = jsQR(datos.data, w, h, { inversionAttempts: 'dontInvert' })
      return codigo?.data ?? null
    },
    liberar() {
      lienzo.width = 0
      lienzo.height = 0
    },
  }
}

export async function crearLector(
  { ladoMaximo = LADO_MAXIMO }: { ladoMaximo?: number } = {}
): Promise<Lector> {
  if (hayDetectorNativo()) {
    try { return await lectorNativo() } catch { /* cae al de reserva */ }
  }
  return lectorJavaScript(ladoMaximo)
}
