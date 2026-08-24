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
 *   {t:'fin'}                         no tengo nada más
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

/** Cuánto se espera una respuesta del otro aparato antes de darlo por perdido. */
const ESPERA = 60_000

type Config = { salt: string | null; verificador: string | null }

/**
 * Lo que este dispositivo puede contarle al otro sobre la configuración.
 * Sin esto, un aparato recién estrenado no podría desbloquear sin preguntarle
 * al servidor, y todo el sentido del enlace directo era no necesitarlo.
 */
export type ConfigLocal = () => Promise<Config>

export function transporteDirecto(enlace: Enlace, configLocal: ConfigLocal): Transporte {
  // Sobres que ha ido mandando el otro lado y aún no ha recogido `traer()`
  const buzon: SobreRecibido[] = []
  let elOtroTermino = false
  let caido: string | null = null
  let finEnviado = false
  let seq = 0
  let contador = 0

  /** Respuestas que estamos esperando, por identificador de mensaje. */
  const esperando = new Map<string, (m: any) => void>()
  /** Quien esté dormido en `traer()` esperando que llegue algo. */
  let despertar: (() => void) | null = null

  const mover = () => { despertar?.(); despertar = null }

  enlace.alCerrarse((motivo) => {
    caido = motivo
    elOtroTermino = true
    for (const resolver of esperando.values()) resolver({ error: motivo })
    esperando.clear()
    mover()
  })

  enlace.alRecibir((m: any) => {
    switch (m?.t) {
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
        await enlace.enviar({ t: 'fin' })
      }

      // Esperar a que haya algo que servir, o a que el otro diga que terminó
      while (!buzon.length && !elOtroTermino) {
        await new Promise<void>((listo) => {
          const reloj = setTimeout(() => { despertar = null; listo() }, ESPERA)
          despertar = () => { clearTimeout(reloj); listo() }
        })
        if (!buzon.length && !elOtroTermino) {
          throw new Error('El otro dispositivo dejó de responder a mitad de la sincronización')
        }
      }
      if (caido && !buzon.length) throw new Error(caido)

      const tanda = buzon.splice(0, limite)
      seq += tanda.length
      return { registros: tanda, seq, hay_mas: buzon.length > 0 || !elOtroTermino }
    },

    async vaciar() {
      // Un enlace directo no guarda nada que vaciar.
    },
  }
}
