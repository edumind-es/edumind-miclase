/**
 * Qué ocupa cada cosa en el aparato. Puro, para poder probarlo sin navegador.
 *
 * Lo que pesa son las evidencias, y sobre todo los vídeos. Sin este desglose el
 * docente solo veía «812 MB» y no podía decidir nada.
 */
import { LIMITE_EVIDENCIA_SINC } from './limites'
import type { TipoEvidencia } from './localDb'

/** Por encima de esto, una copia completa puede agotar la memoria de un iPad. */
export const COPIA_GRANDE = 250 * 1024 * 1024

type Fila = {
  id?: number
  alumno_id: number
  tipo: TipoEvidencia
  fecha: string
  descripcion?: string
  blob?: { size: number } | null
  deleted_at?: string | null
}

export type Cuenta = { n: number; bytes: number }

export type PesoEvidencia = {
  id: number
  tipo: TipoEvidencia
  bytes: number
  alumno: string
  fecha: string
  descripcion: string
}

export type ResumenEvidencias = {
  /** Solo las vivas. */
  porTipo: Record<TipoEvidencia, Cuenta>
  total: Cuenta
  /** Vivas que caben en un sobre: lo que puede viajar a otro aparato. */
  viajan: Cuenta
  /** Vivas demasiado grandes: se quedan en este aparato. */
  noViajan: Cuenta
  /** Borradas que aún guardan su contenido. */
  borradas: Cuenta
  masPesadas: PesoEvidencia[]
}

const cero = (): Cuenta => ({ n: 0, bytes: 0 })
const sumar = (c: Cuenta, bytes: number) => { c.n++; c.bytes += bytes }

export function resumirEvidencias(
  filas: Fila[], nombreDe: (alumno_id: number) => string, cuantas = 10,
): ResumenEvidencias {
  const r: ResumenEvidencias = {
    porTipo: { foto: cero(), audio: cero(), video: cero() },
    total: cero(), viajan: cero(), noViajan: cero(), borradas: cero(), masPesadas: [],
  }
  for (const f of filas) {
    const bytes = f.blob?.size ?? 0
    if (f.deleted_at) {
      if (bytes > 0) sumar(r.borradas, bytes)
      continue
    }
    sumar(r.porTipo[f.tipo], bytes)
    sumar(r.total, bytes)
    sumar(bytes > LIMITE_EVIDENCIA_SINC ? r.noViajan : r.viajan, bytes)
  }
  r.masPesadas = filas
    .filter((f) => !f.deleted_at && f.id != null)
    .sort((a, b) => (b.blob?.size ?? 0) - (a.blob?.size ?? 0))
    .slice(0, cuantas)
    .map((f) => ({
      id: f.id!, tipo: f.tipo, bytes: f.blob?.size ?? 0,
      alumno: nombreDe(f.alumno_id), fecha: f.fecha, descripcion: f.descripcion ?? '',
    }))
  return r
}

/** «812 MB», «340 KB»: con los pesos pequeños «0,0 MB» no dice nada. */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const mb = bytes / 1024 / 1024
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1).replace('.', ',')} MB`
}
