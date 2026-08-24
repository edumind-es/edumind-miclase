/**
 * Enlace directo entre dos dispositivos del mismo docente.
 *
 * Los sobres viajan por un canal WebRTC cifrado que va de un aparato al otro
 * sin pasar por ningún servidor. Ni siquiera para presentarse: el saludo
 * inicial —la oferta y la respuesta de WebRTC— se intercambia por código QR,
 * aprovechando que la app ya sabe generarlos y leerlos para los QR de mesa.
 *
 * Cómo se emparejan:
 *   1. El aparato anfitrión crea una oferta y la muestra como QR.
 *   2. El invitado la escanea, crea su respuesta y la muestra como QR.
 *   3. El anfitrión escanea la respuesta y el canal queda abierto.
 *
 * Alcance: **la misma red**. No se usa ningún servidor STUN ni TURN, así que
 * solo se recogen candidatos de la propia red local. Dos aparatos en la misma
 * wifi conectan directamente; a través de internet no, y es deliberado: un
 * servidor de relevo volvería a poner un tercero por medio.
 *
 * Aviso conocido: algunas redes —wifi de invitados, cierto material de
 * centro— aíslan a los clientes entre sí o bloquean mDNS, y entonces los
 * candidatos no se resuelven y la conexión no llega a abrirse. Se distingue de
 * un fallo por el tiempo de espera y se le explica al docente.
 */

const PREFIJO = 'MICLASE1'
const ESPERA_ICE = 4000       // ms recogiendo candidatos antes de dar por cerrado el saludo
const ESPERA_CONEXION = 30000 // ms hasta dar el emparejamiento por fallido

/** Trozo máximo por mensaje. El canal declara 256 KB; se deja margen. */
const TROZO = 48 * 1024
/** A partir de aquí se deja de escribir hasta que el canal se vacíe. */
const BUFER_ALTO = 1 * 1024 * 1024
const BUFER_BAJO = 256 * 1024

export type Enlace = {
  /** Envía un objeto. Se trocea solo si no cabe en un mensaje. */
  enviar(mensaje: unknown): Promise<void>
  /** Se llama con cada objeto completo que llega del otro aparato. */
  alRecibir(cb: (mensaje: any) => void): void
  /** Se llama si el canal se cae antes de tiempo. */
  alCerrarse(cb: (motivo: string) => void): void
  cerrar(): void
}

// ─── Empaquetado del saludo ──────────────────────────────────────────────

async function comprimir(texto: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  const cs = new CompressionStream('gzip')
  const w = cs.writable.getWriter()
  void w.write(new TextEncoder().encode(texto))
  void w.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}

async function descomprimir(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip')
  const w = ds.writable.getWriter()
  void w.write(bytes as unknown as BufferSource)
  void w.close()
  return new Response(ds.readable).text()
}

function aBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function deBase64(texto: string): Uint8Array {
  const bin = atob(texto)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * El SDP en crudo ronda los 700 caracteres, que darían un QR muy denso.
 * Comprimido y en base64 se queda en unos 660 y cabe en un QR de versión 17,
 * cómodo de escanear en pantalla. Si el navegador no trae `CompressionStream`
 * se manda tal cual, con una letra distinta para saberlo al abrirlo.
 */
async function empaquetar(tipo: 'O' | 'R', sdp: string): Promise<string> {
  const comprimido = await comprimir(sdp)
  return comprimido
    ? `${PREFIJO}${tipo}Z:${aBase64(comprimido)}`
    : `${PREFIJO}${tipo}P:${aBase64(new TextEncoder().encode(sdp))}`
}

export type Saludo = { tipo: 'O' | 'R'; sdp: string }

export async function abrirSaludo(codigo: string): Promise<Saludo> {
  const limpio = codigo.trim()
  const m = /^MICLASE1([OR])([ZP]):(.+)$/s.exec(limpio)
  if (!m) throw new Error('Ese código no es un emparejamiento de MiClase')
  const bytes = deBase64(m[3])
  const sdp = m[2] === 'Z'
    ? await descomprimir(bytes)
    : new TextDecoder().decode(bytes)
  return { tipo: m[1] as 'O' | 'R', sdp }
}

// ─── Canal ───────────────────────────────────────────────────────────────

function nuevaConexion(): RTCPeerConnection {
  // Sin STUN ni TURN: solo candidatos de la red local, a propósito.
  return new RTCPeerConnection({ iceServers: [] })
}

/**
 * WebRTC va soltando candidatos poco a poco («trickle»), pero aquí no hay
 * canal por el que ir mandándolos: el QR se saca una sola vez. Así que se
 * espera a tenerlos todos y se mete el SDP completo en el código.
 */
function esperarCandidatos(pc: RTCPeerConnection): Promise<void> {
  return new Promise((listo) => {
    if (pc.iceGatheringState === 'complete') return listo()
    const reloj = setTimeout(listo, ESPERA_ICE)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(reloj)
        listo()
      }
    })
  })
}

/**
 * Envuelve el canal de datos: trocea lo que no cabe en un mensaje, lo vuelve a
 * juntar al otro lado y frena cuando el canal se está atragantando.
 *
 * Sin el troceado, una evidencia de varios MB tumba el canal: el límite por
 * mensaje ronda los 256 KB. Y sin el freno, escribir más rápido de lo que el
 * canal drena lo cierra sin avisar.
 */
function envolver(pc: RTCPeerConnection, canal: RTCDataChannel): Enlace {
  canal.binaryType = 'arraybuffer'
  canal.bufferedAmountLowThreshold = BUFER_BAJO

  let alRecibirCb: ((m: any) => void) | null = null
  let alCerrarseCb: ((motivo: string) => void) | null = null
  const enCurso = new Map<number, string[]>()

  canal.addEventListener('message', (ev) => {
    try {
      const trozo = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data))
      if (trozo.n === 1) {
        alRecibirCb?.(JSON.parse(trozo.d))
        return
      }
      const partes = enCurso.get(trozo.id) ?? new Array(trozo.n).fill('')
      partes[trozo.i] = trozo.d
      enCurso.set(trozo.id, partes)
      if (partes.every((p) => p !== '')) {
        enCurso.delete(trozo.id)
        alRecibirCb?.(JSON.parse(partes.join('')))
      }
    } catch {
      // Un mensaje ilegible no debe tumbar la sesión entera
    }
  })

  const cerrarPor = (motivo: string) => { alCerrarseCb?.(motivo) }
  canal.addEventListener('close', () => cerrarPor('el otro dispositivo cerró la conexión'))
  canal.addEventListener('error', () => cerrarPor('se cortó la conexión con el otro dispositivo'))
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed') cerrarPor('se perdió la conexión con el otro dispositivo')
  })

  const hueco = () =>
    new Promise<void>((listo) => {
      if (canal.bufferedAmount < BUFER_ALTO) return listo()
      const seguir = () => { canal.removeEventListener('bufferedamountlow', seguir); listo() }
      canal.addEventListener('bufferedamountlow', seguir)
    })

  let contador = 0

  return {
    async enviar(mensaje) {
      if (canal.readyState !== 'open') throw new Error('El canal directo no está abierto')
      const texto = JSON.stringify(mensaje)
      const n = Math.max(1, Math.ceil(texto.length / TROZO))
      const id = ++contador
      for (let i = 0; i < n; i++) {
        await hueco()
        canal.send(JSON.stringify({ id, i, n, d: texto.slice(i * TROZO, (i + 1) * TROZO) }))
      }
    },
    alRecibir(cb) { alRecibirCb = cb },
    alCerrarse(cb) { alCerrarseCb = cb },
    cerrar() {
      try { canal.close() } catch { /* ya estaba cerrado */ }
      try { pc.close() } catch { /* ídem */ }
    },
  }
}

function esperarApertura(pc: RTCPeerConnection, canal: RTCDataChannel): Promise<Enlace> {
  return new Promise((listo, fallo) => {
    const reloj = setTimeout(() => {
      pc.close()
      fallo(new Error(
        'No se ha podido conectar con el otro dispositivo. Comprueba que los dos ' +
        'están en la misma red wifi: algunas redes de centro aíslan los aparatos ' +
        'entre sí y no dejan que se vean.'))
    }, ESPERA_CONEXION)

    if (canal.readyState === 'open') {
      clearTimeout(reloj)
      return listo(envolver(pc, canal))
    }
    canal.addEventListener('open', () => {
      clearTimeout(reloj)
      listo(envolver(pc, canal))
    })
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') {
        clearTimeout(reloj)
        fallo(new Error('La conexión directa ha fallado. Los dos dispositivos deben estar en la misma red.'))
      }
    })
  })
}

// ─── Los dos papeles ─────────────────────────────────────────────────────

export type Anfitrion = {
  /** El código que se pinta como QR para que lo lea el otro aparato. */
  codigo: string
  /** Se le pasa el código que devuelve el invitado. Resuelve con el canal ya abierto. */
  aceptarRespuesta(codigoRespuesta: string): Promise<Enlace>
  cancelar(): void
}

/** Aparato que empieza el emparejamiento: crea la oferta y enseña el primer QR. */
export async function invitar(): Promise<Anfitrion> {
  const pc = nuevaConexion()
  const canal = pc.createDataChannel('miclase', { ordered: true })

  await pc.setLocalDescription(await pc.createOffer())
  await esperarCandidatos(pc)

  return {
    codigo: await empaquetar('O', pc.localDescription!.sdp),
    async aceptarRespuesta(codigoRespuesta) {
      const { tipo, sdp } = await abrirSaludo(codigoRespuesta)
      if (tipo !== 'R') {
        throw new Error('Ese código es una invitación, no una respuesta. Escanea el QR del otro dispositivo.')
      }
      await pc.setRemoteDescription({ type: 'answer', sdp })
      return esperarApertura(pc, canal)
    },
    cancelar() { pc.close() },
  }
}

export type Invitado = {
  /** El código que se pinta como QR para que lo lea quien invitó. */
  codigo: string
  /** Resuelve con el canal abierto en cuanto el anfitrión lee la respuesta. */
  enlace: Promise<Enlace>
  cancelar(): void
}

/** Aparato que ha escaneado la invitación: responde y enseña el segundo QR. */
export async function aceptarInvitacion(codigoOferta: string): Promise<Invitado> {
  const { tipo, sdp } = await abrirSaludo(codigoOferta)
  if (tipo !== 'O') {
    throw new Error('Ese código es una respuesta, no una invitación.')
  }

  const pc = nuevaConexion()
  const llega = new Promise<RTCDataChannel>((listo) => {
    pc.addEventListener('datachannel', (ev) => listo(ev.channel))
  })

  await pc.setRemoteDescription({ type: 'offer', sdp })
  await pc.setLocalDescription(await pc.createAnswer())
  await esperarCandidatos(pc)

  return {
    codigo: await empaquetar('R', pc.localDescription!.sdp),
    enlace: llega.then((canal) => esperarApertura(pc, canal)),
    cancelar() { pc.close() },
  }
}
