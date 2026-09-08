/**
 * Transporte por fichero: un paquete de sobres que viaja como adjunto.
 *
 * Es el tercer camino previsto en `transporte.ts`, y existe por una razón muy
 * concreta: el enlace directo por QR exige que los dos aparatos compartan red
 * wifi, y muchas redes de centro aíslan a los clientes entre sí. Un fichero no
 * necesita red: se manda por AirDrop, por Quick Share, por el cable, o por
 * donde el docente quiera.
 *
 * Los sobres van tal cual salen de `sync.ts`: cifrados uno a uno con la
 * contraseña de sincronización. El fichero deja a la vista exactamente lo
 * mismo que ve el buzón del servidor —tabla, id y fecha— y nada más. Quien no
 * tenga la contraseña no puede abrirlo, así que puede viajar por donde sea.
 *
 * Son dos transportes, no uno, y a propósito:
 *   - el de escritura solo empuja: recoge lo pendiente y lo deja en el paquete.
 *   - el de lectura solo trae: sirve los sobres del paquete recibido.
 * Mezclarlos movería los cursores del lado equivocado: al leer un paquete no
 * se ha enviado nada, y al escribirlo no se ha recibido nada.
 */
import type {
  EstadoSync, RespuestaPull, RespuestaPush, SobreEnvio, SobreRecibido, Transporte,
} from './transporte'

/** Lo que contiene el fichero. `version` para poder cambiarlo sin romper nada. */
export type PaqueteSync = {
  formato: 'miclase-sync'
  version: 1
  /** Quién lo generó, para no fusionar contra uno mismo por error. */
  device_id: string
  creado: string
  /** Sal y verificador: permiten que un aparato nuevo desbloquee sin servidor. */
  salt: string | null
  verificador: string | null
  sobres: SobreEnvio[]
}

export const EXTENSION = '.miclasesync'
export const MIME = 'application/json'

/** Transporte de solo escritura: acumula lo que `empujar()` le vaya dando. */
export function transporteFicheroEscritura(): Transporte & { sobres(): SobreEnvio[] } {
  const acumulado: SobreEnvio[] = []

  return {
    id: 'carpeta',
    nombre: 'Paquete para otro dispositivo',
    esBuzon: false,

    async estado(): Promise<EstadoSync> {
      // No hay nada al otro lado a quien preguntar: el paquete aún no existe.
      return { iniciado: false, salt: null, verificador: null, seq: 0, registros: 0, actualizado: null }
    },

    async configurar() {
      // La sal se escribe en la cabecera del paquete, no aquí.
    },

    async empujar(_deviceId: string, registros: SobreEnvio[]): Promise<RespuestaPush> {
      acumulado.push(...registros)
      // Se acepta todo: un fichero no tiene cuota ni tope por registro. Lo que
      // no quepa en memoria fallará antes, al serializar, y eso se ve.
      return {
        escritos: registros.length,
        descartados: 0,
        aceptados: registros.map(s => ({ tabla: s.tabla, registro_id: s.registro_id })),
        rechazados: [],
      }
    },

    async traer(): Promise<RespuestaPull> {
      // Escribir un paquete no trae nada de vuelta.
      return { registros: [], seq: 0, hay_mas: false }
    },

    async vaciar() {
      acumulado.length = 0
    },

    sobres: () => acumulado,
  }
}

/** Transporte de solo lectura: sirve los sobres de un paquete ya recibido. */
export function transporteFicheroLectura(paquete: PaqueteSync): Transporte {
  let servidos = 0

  return {
    id: 'carpeta',
    nombre: 'Paquete de otro dispositivo',
    esBuzon: false,

    async estado(): Promise<EstadoSync> {
      return {
        iniciado: !!(paquete.salt && paquete.verificador),
        salt: paquete.salt,
        verificador: paquete.verificador,
        seq: paquete.sobres.length,
        registros: paquete.sobres.length,
        actualizado: paquete.creado,
      }
    },

    async configurar() {
      // Un paquete recibido es de solo lectura.
    },

    async empujar(): Promise<RespuestaPush> {
      // Nada que empujar contra un fichero que ya está escrito. Devolver cero
      // aceptados —y no «todo aceptado»— es lo que impide que el cursor de
      // envío avance por un camino por el que no ha salido nada.
      return { escritos: 0, descartados: 0, aceptados: [], rechazados: [] }
    },

    /**
     * Sirve el paquete entero por tandas. El `desde` que lleva `sync.ts` no
     * cuenta aquí: cada fichero es independiente y se aplica completo, y su
     * cursor de lectura se reinicia en cada importación.
     */
    async traer(_desde: number, limite: number): Promise<RespuestaPull> {
      const tanda = paquete.sobres.slice(servidos, servidos + limite)
      servidos += tanda.length
      const registros: SobreRecibido[] = tanda.map(s => ({
        tabla: s.tabla, registro_id: s.registro_id, iv: s.iv, payload: s.payload,
      }))
      return { registros, seq: servidos, hay_mas: servidos < paquete.sobres.length }
    },

    async vaciar() {
      // Borrar el fichero es cosa del docente, no de la app.
    },
  }
}
