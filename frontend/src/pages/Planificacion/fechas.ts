/** Fechas de la planificación: siempre YYYY-MM-DD en hora local, nunca UTC. */
import { isoFecha } from '@/planificacion/semanal'

export { isoFecha }

export const deIso = (iso: string) => new Date(iso + 'T12:00')

export function sumarDias(iso: string, n: number): string {
  const d = deIso(iso)
  d.setDate(d.getDate() + n)
  return isoFecha(d)
}

/** Lunes de la semana de esa fecha. */
export function lunesDe(iso: string): string {
  const d = deIso(iso)
  return sumarDias(iso, -((d.getDay() + 6) % 7))
}

export const hoyIso = () => isoFecha(new Date())

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMes = (iso: string) => { const d = deIso(iso); return `${MESES[d.getMonth()]} de ${d.getFullYear()}` }

/** Las seis semanas (de lunes a domingo) que pintan el mes de esa fecha. */
export function cuadriculaMes(iso: string): string[] {
  const d = deIso(iso)
  const primero = isoFecha(new Date(d.getFullYear(), d.getMonth(), 1, 12))
  const inicio = lunesDe(primero)
  return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i))
}

export const mismoMes = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7)
