/**
 * Transporte por enlace directo entre dos dispositivos.
 *
 * A diferencia del buzón del servidor, aquí no hay depósito: los dos aparatos
 * están hablando a la vez y cada uno le cuenta al otro lo que tiene pendiente.
 * La sesión existe mientras dura la conversación y no deja nada en ninguna
 * parte, que es justo lo que se busca (punto 0.b del ROADMAP).
 *
 * Protocolo, simétrico —los dos lados corren exactamente este mismo código—:
 *
 *   {t:'config?'}                     ¿cuál es la sal de este docente?
 *   {t:'config',  salt, verificador}
 *   {t:'sobres',  id, registros}      aquí van los míos
 *   {t:'recibo',  id, aceptados}      recibidos
 *   {t:'fin'}                         no tengo nada más que enviar
 *   {t:'adios'}                       he terminado del todo, puedes cerrar
 *   {t:'latido'}                      sigo aquí (aunque todavía no sincronice)
 *
 * El `latido` separa dos cosas que el transporte confundía: «no contesta» y
 * «está vivo pero aún no le toca». Los dos aparatos no arrancan a la vez —el
 * anfitrión empieza al leer el QR y el invitado se queda escribiendo la
 * contraseña— así que el primero esperaba un turno que tardaba lo que tardase
 * el docente en teclear, y se rendía a los sesenta segundos con «el otro
 * dispositivo dejó de responder». Mientras lleguen latidos, se espera.
 *
 * El `adios` es lo que evita que el primero que acaba corte el canal con el
 * otro todavía trabajando: cada lado avisa y espera —poco— a que el otro
 * avise también antes de colgar.
 *
 * Encaje con la interfaz `Transporte`, que está pensada para un buzón:
 *   - `empujar()` manda una tanda y espera su recibo.
 *   - `traer()` devuelve lo que el otro lado ha ido mandando por su cuenta.
 *
 * Depende de que `sync.ts` llame primero a `empujar()` tantas veces como haga
 * falta y solo después a `traer()`: la primera llamada a `traer()` es la señal
 * de que ya no queda nada por enviar, y es cuando se manda el `fin`. Si algún
 * día se intercalasen, habría que mandar el `fin` explícitamente.
 */
import type { Enlace } from './enlaceDirecto'
import type {
  EstadoSync, RespuestaPull, RespuestaPush, SobreEnvio, SobreRecibido, Transporte,
} from './transporte'

/** Cuánto silencio del otro aparato se tolera antes de darlo por perdido. */
const ESPERA = 60_000
/** Cada cuánto se manda un latido mientras la sesión está abierta. */
const LATIDO = 5_000
/** Cuánto se espera el adiós del otro antes de colgar igualmente. */
const ESPERA_ADIOS = 15_000

export type OpcionesDirecto = {
  /** Silencio tolerado, en ms. Se baja en las pruebas para no esperar un minuto. */
  espera?: number
  /** Periodo del latido, en ms. */
  latido?: number
}

type Config = { salt: string | null; verificador: string | null }

/**
 * Lo que este dispositivo puede contarle al otro sobre la configuración.
 * Sin esto, un aparato recién estrenado no podría desbloquear sin preguntarle
 * al servidor, y todo el sentido del enlace directo era no necesitarlo.
 */
export type ConfigLocal = () => Promise<Config>

export function transporteDirecto(
  enlace: Enlace, configLocal: ConfigLocal, opciones: OpcionesDirecto = {}
): Transporte {
  const espera = opciones.espera ?? ESPERA
  const periodoLatido = opciones.latido ?? LATIDO
  // Sobres que ha ido mandando el otro lado y aún no ha recogido `traer()`
  const buzon: SobreRecibido[] = []
  let elOtroTermino = false
  /** Distinto de `elOtroTermino`: este solo se marca si el otro lo dijo, no
   *  si el canal se cayó. Es lo que separa un final normal de un corte. */
  let finRecibido = false
  let elOtroSeDespidio = false
  let caido: string | null = null
  let finEnviado = false
  let seq = 0
  let contador = 0
  /** Cuándo se supo por última vez del otro aparato. Cualquier mensaje vale. */
  let ultimaSenal = Date.now()

  /** Apunta que se ha sabido del otro, sin dejar que el reloj vaya atrás. */
  const escuchado = (cuando: number) => {
    if (cuando > ultimaSenal) ultimaSenal = cuando
  }

  /** Latido: se manda desde que se abre la sesión, no desde que se empieza a
   *  sincronizar — justo el hueco en el que el otro se quedaba esperando. */
  let relojLatido: ReturnType<typeof setInterval> | null = null
  const dejarDeLatir = () => { if (relojLatido) { clearInterval(relojLatido); relojLatido = null } }

  /** Respuestas que estamos esperando, por identificador de mensaje. */
  const esperando = new Map<string, (m: any) => void>()
  /** Quien esté dormido en `traer()` esperando que llegue algo. */
  let despertar: (() => void) | null = null

  const mover = () => { despertar?.(); despertar = null }

  enlace.alCerrarse((motivo) => {
    dejarDeLatir()
    caido = motivo
    elOtroTermino = true
    // Si el canal se cae ya no va a llegar ningún adiós: quien lo espere debe
    // seguir en vez de agotar los quince segundos para nada.
    elOtroSeDespidio = true
    for (const resolver of esperando.values()) resolver({ error: motivo })
    esperando.clear()
    mover()
  })

  enlace.alRecibir((m: any) => {
    // Cualquier mensaje —hasta un latido— demuestra que el otro sigue ahí.
    escuchado(Date.now())
    switch (m?.t) {
      case 'latido':
        return

      case 'config?':
        // La respuesta lleva el mismo `id` que la pregunta: es lo que permite
        // a `preguntar()` casarlas cuando los dos lados hablan a la vez.
        void configLocal().then((c) =>
          enlace.enviar({ t: 'config', id: m.id, salt: c.salt, verificador: c.verificador }))
        return

      case 'sobres':
        for (const s of m.registros ?? []) buzon.push(s)
        // Se acepta todo: el enlace no tiene cuota ni tope de tamaño, y lo que
        // no se pueda descifrar se dirá al fusionar, igual que con el buzón.
        void enlace.enviar({
          t: 'recibo',
          id: m.id,
          aceptados: (m.registros ?? []).map((s: SobreEnvio) => ({
            tabla: s.tabla, registro_id: s.registro_id,
          })),
        })
        mover()
        return

      case 'fin':
        elOtroTermino = true
        finRecibido = true
        mover()
        return

      case 'adios':
        // El otro ha terminado del todo. También implica `fin`: un aparato que
        // se despide sin haberlo mandado (porque falló antes) no va a enviar
        // ya nada, y sin esto quien esperase en `traer()` se quedaría colgado.
        elOtroTermino = true
        finRecibido = true
        elOtroSeDespidio = true
        mover()
        return

      default: {
        const resolver = m?.id != null ? esperando.get(String(m.id)) : undefined
        if (resolver) {
          esperando.delete(String(m.id))
          resolver(m)
        }
      }
    }
  })

  /** Manda algo y espera la respuesta que lleve el mismo identificador. */
  async function preguntar(mensaje: Record<string, unknown>): Promise<any> {
    if (caido) throw new Error(caido)
    const id = String(++contador)
    const respuesta = new Promise<any>((listo, fallo) => {
      const reloj = setTimeout(() => {
        esperando.delete(id)
        fallo(new Error('El otro dispositivo no ha respondido a tiempo'))
      }, ESPERA)
      esperando.set(id, (m) => { clearTimeout(reloj); listo(m) })
    })
    await enlace.enviar({ ...mensaje, id })
    const m = await respuesta
    if (m?.error) throw new Error(m.error)
    return m
  }

  relojLatido = setInterval(() => { void avisar({ t: 'latido' }) }, periodoLatido)

  /** Manda algo sin esperar respuesta. Un canal ya cerrado no es un fallo:
   *  `fin` y `adios` son avisos de cortesía, no partes de la carga. */
  async function avisar(mensaje: Record<string, unknown>): Promise<void> {
    try { await enlace.enviar(mensaje) } catch { /* el otro ya colgó */ }
  }

  return {
    id: 'directo',
    nombre: 'Otro dispositivo',
    esBuzon: false,

    async estado(): Promise<EstadoSync> {
      // La configuración la tiene quien ya sincronizaba; puede ser cualquiera
      // de los dos. Se pregunta al otro y, si no la tiene, vale la propia.
      let remota: Config = { salt: null, verificador: null }
      try {
        const m = await preguntar({ t: 'config?' })
        remota = { salt: m.salt ?? null, verificador: m.verificador ?? null }
      } catch {
        // Sin respuesta nos quedamos con lo nuestro
      }
      const propia = await configLocal()
      const salt = remota.salt ?? propia.salt
      const verificador = remota.verificador ?? propia.verificador
      return {
        iniciado: !!(salt && verificador),
        salt,
        verificador,
        seq,
        registros: buzon.length,
        actualizado: null,
      }
    },

    async configurar() {
      // No hay nada que publicar: en un enlace directo la sal se guarda en
      // cada aparato y se la piden entre ellos al emparejarse.
    },

    async empujar(_deviceId: string, registros: SobreEnvio[]): Promise<RespuestaPush> {
      const m = await preguntar({ t: 'sobres', registros })
      const aceptados = Array.isArray(m.aceptados) ? m.aceptados : []
      return {
        escritos: aceptados.length,
        descartados: registros.length - aceptados.length,
        aceptados,
        rechazados: [],
      }
    },

    async traer(_desde: number, limite: number): Promise<RespuestaPull> {
      // Primera llamada: ya no vamos a enviar más, y hay que decirlo o el otro
      // lado se quedaría esperando por siempre.
      if (!finEnviado) {
        finEnviado = true
        await avisar({ t: 'fin' })
      }

      // El silencio se cuenta desde que uno se pone a escuchar. Cifrar el lote
      // de salida deja el hilo un buen rato sin atender el canal, y ese atasco
      // es nuestro, no del otro: arrastrarlo hasta aquí hacía que la primera
      // comprobación diese por muerto a un aparato que estaba mandando latidos.
      escuchado(Date.now())

      // Esperar a que haya algo que servir, o a que el otro diga que terminó.
      // Se despierta cada poco para mirar si el otro sigue dando señales: solo
      // se abandona tras `espera` de silencio absoluto, no de mera inactividad.
      // El invitado puede tardar lo que tarde el docente en teclear la
      // contraseña, y eso no es que haya dejado de responder.
      while (!buzon.length && !elOtroTermino) {
        await new Promise<void>((listo) => {
          const reloj = setTimeout(() => { despertar = null; listo() }, periodoLatido)
          despertar = () => { clearTimeout(reloj); listo() }
        })
        if (buzon.length || elOtroTermino) break
        if (Date.now() - ultimaSenal > espera) {
          throw new Error('El otro dispositivo dejó de responder a mitad de la sincronización')
        }
      }
      // Un canal cerrado con sobres aún sin recoger no impide entregarlos: ya
      // están aquí. Y cerrado sin nada pendiente solo es un fallo si el otro no
      // había dicho que terminaba; si lo dijo, esto es el final normal —era
      // justo lo que rompía la sincronización cuando el otro colgaba primero.
      if (caido && !buzon.length && !finRecibido) throw new Error(caido)

      const tanda = buzon.splice(0, limite)
      seq += tanda.length
      return { registros: tanda, seq, hay_mas: buzon.length > 0 || !elOtroTermino }
    },

    async vaciar() {
      // Un enlace directo no guarda nada que vaciar.
    },

    /**
     * Cierre ordenado: aviso de que he terminado y espero a que el otro avise.
     *
     * Sin esto, el aparato que acababa primero cerraba el canal y el otro se
     * encontraba escribiendo sobre un canal muerto: salía «el otro dispositivo
     * cerró la conexión» y la sincronización se abortaba a medias. La espera
     * está acotada para que un aparato que se cuelgue no deje al otro clavado.
     */
    async despedirse() {
      await avisar({ t: 'adios' })
      dejarDeLatir()
      if (elOtroSeDespidio) return
      await new Promise<void>((listo) => {
        const reloj = setTimeout(() => { despertar = null; listo() }, ESPERA_ADIOS)
        despertar = () => { clearTimeout(reloj); listo() }
      })
    },
  }
}
