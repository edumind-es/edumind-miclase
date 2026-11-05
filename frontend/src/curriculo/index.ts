/**
 * La única puerta al currículo LOMLOE para las pantallas.
 *
 * El currículo viaja dentro de la app: `frontend/public/curriculo/` (índice,
 * descriptores por etapa y un paquete de criterios por comunidad y etapa),
 * generado en cada build por `scripts/empaquetar_curriculo.mjs` y precacheado
 * por el service worker. Así la PWA califica sin red y sin servidor, con
 * cualquier comunidad de `curriculum/`.
 *
 * El servidor (`/api/curriculum`, por `api()`) queda de reserva: solo se le
 * pide algo si la comunidad no está en el índice o un paquete no se puede
 * leer. Sin paquete y sin servidor, cada función devuelve vacío y lanza, para
 * que la pantalla lo diga (`errorCurriculo`).
 *
 * Nadie más hace `fetch` de `/api/curriculum`: una pantalla que lo hiciera
 * volvería a depender de la red.
 */
import { api } from '@/api'
import {
  asignaturasDelIndice, clavePaquete, comunidadesDelIndice, criteriosDelPaquete, cursosDelIndice,
  normalizarCurso, saberesDelPaquete, VERSION_PAQUETE,
  type AsignaturaCurriculo, type CriterioCurriculo, type CursoCurriculo, type DescriptoresCurriculo,
  type Indice, type PaqueteCriterios, type PaqueteSaberes, type SaberesCurriculo,
} from './fuente'

export type {
  AsignaturaCurriculo, CriterioCurriculo, CursoCurriculo, DescriptoresCurriculo, SaberesCurriculo,
} from './fuente'
export { normalizarCurso } from './fuente'

/** Carpeta de los paquetes, relativa al origen de la app (en nativo, dentro del contenedor). */
export const RUTA_PAQUETES = '/curriculo'

/** Leído una vez por sesión: el índice y cada paquete, ya parseados. */
const memoria = new Map<string, Promise<unknown>>()

async function leerJson<T>(ruta: string): Promise<T> {
  const r = await fetch(ruta)
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`)
  return r.json()
}

function recordar<T>(clave: string, cargar: () => Promise<T>): Promise<T> {
  let p = memoria.get(clave) as Promise<T> | undefined
  if (!p) {
    p = cargar()
    memoria.set(clave, p)
    // Un fallo no se recuerda: la siguiente llamada vuelve a intentarlo
    p.catch(() => memoria.delete(clave))
  }
  return p
}

async function indice(): Promise<Indice> {
  return recordar('indice', async () => {
    const i = await leerJson<Indice>(`${RUTA_PAQUETES}/indice.json`)
    if (i?.version !== VERSION_PAQUETE || !i.comunidades) throw new Error('índice del currículo de otra versión')
    return i
  })
}

async function paqueteCriterios(clave: string): Promise<PaqueteCriterios> {
  return recordar(`criterios:${clave}`, () => leerJson<PaqueteCriterios>(`${RUTA_PAQUETES}/criterios/${clave}.json`))
}

async function paqueteSaberes(clave: string): Promise<PaqueteSaberes> {
  return recordar(`saberes:${clave}`, () => leerJson<PaqueteSaberes>(`${RUTA_PAQUETES}/saberes/${clave}.json`))
}

/** Reserva: el servidor, por `api()`. Lanza si no responde. */
async function servidor<T>(ruta: string, q: Record<string, string>): Promise<T> {
  const r = await fetch(api(`/api/curriculum/${ruta}?${new URLSearchParams(q)}`))
  if (!r.ok) throw new Error(`servidor: ${r.status}`)
  return r.json()
}

/**
 * Primero el paquete; si la comunidad no está en el índice o el paquete no
 * llega, el servidor. Si tampoco, el error del paquete, que es el que explica
 * el caso normal (sin red).
 */
async function conReserva<T>(local: (i: Indice) => Promise<T | null>, remoto: () => Promise<T>): Promise<T> {
  let fallo: unknown
  try {
    const r = await local(await indice())
    if (r !== null) return r
  } catch (e) { fallo = e }
  try {
    return await remoto()
  } catch (e) {
    throw fallo ?? e
  }
}

/** Comunidades con currículo empaquetado, como las escribe cada JSON («MADRID», «CyL»…). */
export async function comunidades(): Promise<string[]> {
  try { return comunidadesDelIndice(await indice()) } catch { return [] }
}

/** Áreas con currículo para una etapa y comunidad. */
export function asignaturas(etapa: string, comunidad: string): Promise<AsignaturaCurriculo[]> {
  return conReserva(
    async i => i.comunidades[comunidad] ? asignaturasDelIndice(i, etapa, comunidad) : null,
    () => servidor('asignaturas', { etapa, comunidad }))
}

/** Cursos con currículo para un área. */
export function cursos(asignatura: string, etapa: string, comunidad: string): Promise<CursoCurriculo[]> {
  return conReserva(
    async i => i.comunidades[comunidad] ? cursosDelIndice(i, asignatura, etapa, comunidad) : null,
    () => servidor('cursos', { asignatura, etapa, comunidad }))
}

/**
 * Los criterios de un área y curso, con sus descriptores y competencias
 * clave. El curso se normaliza («4» → «4º»). Lanza si no hay de dónde leer.
 */
export function criterios(
  asignatura: string, curso: string | number, etapa: string, comunidad: string
): Promise<CriterioCurriculo[]> {
  const cursoNorm = normalizarCurso(curso)
  return conReserva(
    async i => {
      const clave = clavePaquete(i, comunidad, etapa)
      return clave ? criteriosDelPaquete(await paqueteCriterios(clave), asignatura, cursoNorm) : null
    },
    () => servidor('criterios', { asignatura, curso: cursoNorm, etapa, comunidad }))
}

/** Competencias clave y descriptores operativos de la etapa. */
export function descriptores(etapa: string, comunidad: string): Promise<DescriptoresCurriculo> {
  return conReserva(
    async () => recordar(`descriptores:${etapa}`,
      () => leerJson<DescriptoresCurriculo>(`${RUTA_PAQUETES}/descriptores/${etapa}.json`)),
    () => servidor('descriptores', { etapa, comunidad }))
}

/** Bloques y saberes de un área y curso. No se precachean: se bajan al pedirlos. */
export function saberes(
  asignatura: string, curso: string | number, etapa: string, comunidad: string
): Promise<SaberesCurriculo> {
  const cursoNorm = normalizarCurso(curso)
  return conReserva(
    async i => {
      const clave = clavePaquete(i, comunidad, etapa)
      return clave ? saberesDelPaquete(await paqueteSaberes(clave), asignatura, cursoNorm) : null
    },
    () => servidor('saberes', { asignatura, curso: cursoNorm, etapa, comunidad }))
}
