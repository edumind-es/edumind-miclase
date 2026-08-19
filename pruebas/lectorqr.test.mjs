/**
 * El decodificador de QR de reserva.
 *
 * Es el que usa el iPad: WKWebView no trae `BarcodeDetector`, así que sin
 * este camino la función estrella —escanear el QR de la mesa— no existiría en
 * la app de iOS. Aquí se comprueba contra los QR que genera la propia app,
 * no contra un QR de ejemplo cualquiera.
 *
 * Se trabaja con el búfer de píxeles directamente: así la prueba corre en
 * Node, sin navegador ni decodificación de PNG de por medio.
 */
import QRCode from '/var/www/edumind_miclase/frontend/node_modules/qrcode/lib/index.js'
import jsQR from '/var/www/edumind_miclase/frontend/node_modules/jsqr/dist/jsQR.js'

let fallos = 0
const ok = (c, m, extra = '') => {
  console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`)
  if (!c) fallos++
}

/** Rasteriza un QR a RGBA, como lo vería la cámara sobre papel blanco. */
function aPixeles(texto, escala = 8, margen = 4) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const datos = qr.modules.data
  const lado = (n + margen * 2) * escala
  const buf = new Uint8ClampedArray(lado * lado * 4).fill(255)

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!datos[y * n + x]) continue           // módulo claro: ya está en blanco
      for (let dy = 0; dy < escala; dy++) {
        for (let dx = 0; dx < escala; dx++) {
          const px = (x + margen) * escala + dx
          const py = (y + margen) * escala + dy
          const i = (py * lado + px) * 4
          buf[i] = buf[i + 1] = buf[i + 2] = 0  // módulo oscuro
        }
      }
    }
  }
  return { buf, lado }
}

const leer = (texto, escala) => {
  const { buf, lado } = aPixeles(texto, escala)
  return jsQR(buf, lado, lado, { inversionAttempts: 'dontInvert' })?.data ?? null
}

// El formato real: el QR de mesa lleva la URL con el código anónimo
const URL_REAL = 'https://miclase.edumind.es/escanear?c=M7KP2'

console.log('\n1. El QR que imprime la app se decodifica')
{
  const leido = leer(URL_REAL, 8)
  ok(leido === URL_REAL, 'la URL del QR de mesa se lee entera', leido ?? 'null')
}

console.log('\n2. El código anónimo se extrae de la URL')
{
  // Misma lógica que `extraerCodigo` en utils/qrSheet.ts
  const extraer = raw => {
    const t = String(raw).trim()
    try {
      const c = new URL(t).searchParams.get('c')
      if (c) return c.toUpperCase()
    } catch { /* no era URL */ }
    return /^[A-Za-z0-9]{4,8}$/.test(t) ? t.toUpperCase() : null
  }
  ok(extraer(leer(URL_REAL, 8)) === 'M7KP2', 'del QR sale el código del alumno, no su nombre')
}

console.log('\n3. Aguanta los tamaños a los que llega la cámara')
{
  // La cámara reduce el fotograma a 640px; un QR de mesa ocupa una fracción
  for (const escala of [3, 4, 6, 10]) {
    const leido = leer(URL_REAL, escala)
    ok(leido === URL_REAL, `se lee a ${escala} px por módulo`, leido ? 'ok' : 'ilegible')
  }
}

console.log('\n4. Códigos de varios alumnos')
{
  let todos = true
  for (const codigo of ['M7KP2', 'R4XT9', 'JHQ23', 'ZWY78', 'ABCDE']) {
    const url = `https://miclase.edumind.es/escanear?c=${codigo}`
    if (leer(url, 8) !== url) todos = false
  }
  ok(todos, 'los cinco códigos de prueba se leen sin error')
}

console.log('\n5. Un fotograma en blanco no inventa lecturas')
{
  const lado = 200
  const blanco = new Uint8ClampedArray(lado * lado * 4).fill(255)
  const r = jsQR(blanco, lado, lado, { inversionAttempts: 'dontInvert' })
  ok(r === null, 'sin QR delante devuelve null, no basura')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
