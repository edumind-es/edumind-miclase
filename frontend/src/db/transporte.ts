/**
 * Transporte de la sincronización.
 *
 * `sync.ts` sabe cifrar, fusionar a tres bandas y llevar los cursores, pero no
 * debe saber *dónde* viven los sobres. Todo eso pasa por esta interfaz, que es
 * el único punto de contacto con el exterior.
 *
 * Hoy hay una sola implementación —el buzón de EDUmind— y se comporta
 * exactamente igual que antes. La razón de separarla es que el buzón deje de
 * ser obligatorio: un docente de un centro público no debería tener que dejar
 * datos de su alumnado en un servidor ajeno, ni siquiera cifrados (ver el
 * punto 0.b del ROADMAP). Las otras dos implementaciones previstas son una
 * carpeta del propio docente y un canal directo entre sus dispositivos.
 *
 * Contrato que cualquier transporte debe cumplir:
 *  - Los sobres son opacos: `iv` y `payload` van cifrados y no se tocan.
 *  - `traer()` es incremental y ordenado por `seq` creciente: un mismo `desde`
 *    devuelve siempre lo mismo, y `seq` solo crece.
 *  - `empujar()` dice qué ha aceptado y qué ha rechazado, registro a registro.
 *    Un contador a secas no vale: sin saber cuál falló, `sync.ts` no puede
 *    decidir si mover el cursor, y una evidencia se perdería en silencio.
 */
import { api } from '@/api'

/** Sobre tal como sale de este dispositivo. */
export type SobreEnvio = {
  tabla: string
  registro_id: string
  updated_at: string
  iv: string
  payload: string
}

/** Sobre tal como llega de otro dispositivo. */
export type SobreRecibido = {
  tabla: string
  registro_id: string
  iv: string
  payload: string
}

export type Rechazo = { tabla: string; registro_id: string; motivo: string }

export type RespuestaPush = {
  escritos: number
  descartados: number
  /** Los que han quedado guardados. Solo con estos se sella la base de fusión. */
  aceptados: Array<{ tabla: string; registro_id: string }>
  rechazados: Rechazo[]
  cuota?: { registros: number; bytes: number; max_registros: number; max_bytes: number }
}

export type RespuestaPull = {
  registros: SobreRecibido[]
  seq: number
  hay_mas: boolean
}

/** Lo que hace falta saber antes de poder sincronizar. */
export type EstadoSync = {
  iniciado: boolean
  salt: string | null
  verificador: string | null
  seq: number
  registros: number
  actualizado: string | null
}

export interface Transporte {
  /** Identificador estable; se guarda en `meta` para recordar la elección. */
  readonly id: 'servidor' | 'carpeta' | 'directo'
  /** Cómo se le llama al docente en la pantalla de sincronización. */
  readonly nombre: string
  /** ¿Guarda los sobres fuera de este dispositivo de forma duradera? */
  readonly esBuzon: boolean

  estado(): Promise<EstadoSync>
  /** Publica sal y verificador. `reiniciar` descarta el buzón anterior. */
  configurar(salt: string, verificador: string, reiniciar: boolean): Promise<void>
  empujar(deviceId: string, registros: SobreEnvio[]): Promise<RespuestaPush>
  traer(desde: number, limite: number, excluirDevice: string): Promise<RespuestaPull>
  /** Vacía el buzón. No toca los datos locales. */
  vaciar(): Promise<void>
}

export type Cabeceras = () => Record<string, string>

// ─── Buzón de EDUmind ────────────────────────────────────────────────────

async function pedir(ruta: string, headers: Cabeceras, init: RequestInit = {}) {
  const res = await fetch(api(`/api/sync${ruta}`), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers(), ...(init.headers || {}) },
  })
  const cuerpo = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err: any = new Error(cuerpo.error || `Error ${res.status}`)
    err.codigo = cuerpo.codigo
    err.status = res.status
    throw err
  }
  return cuerpo
}

/**
 * El buzón alojado en el servidor de EDUmind, que almacena y reparte sobres
 * sin poder abrirlos. Exige sesión EDUmind: de ahí las cabeceras.
 */
export function transporteServidor(headers: Cabeceras): Transporte {
  return {
    id: 'servidor',
    nombre: 'Buzón de EDUmind',
    esBuzon: true,

    estado() {
      return pedir('/config', headers)
    },

    async configurar(salt, verificador, reiniciar) {
      await pedir('/config', headers, {
        method: 'POST',
        body: JSON.stringify({ salt, verificador, reiniciar }),
      })
    },

    async empujar(deviceId, registros) {
      const r = await pedir('/push', headers, {
        method: 'POST',
        body: JSON.stringify({ device_id: deviceId, registros }),
      })
      return {
        escritos: r.escritos ?? 0,
        descartados: r.descartados ?? 0,
        aceptados: Array.isArray(r.aceptados) ? r.aceptados : [],
        rechazados: Array.isArray(r.rechazados) ? r.rechazados : [],
        cuota: r.cuota,
      }
    },

    async traer(desde, limite, excluirDevice) {
      const r = await pedir(
        `/pull?desde=${desde}&limite=${limite}&excluir_device=${encodeURIComponent(excluirDevice)}`,
        headers)
      return {
        registros: Array.isArray(r.registros) ? r.registros : [],
        seq: r.seq ?? desde,
        hay_mas: !!r.hay_mas,
      }
    },

    async vaciar() {
      await pedir('/', headers, { method: 'DELETE' })
    },
  }
}
