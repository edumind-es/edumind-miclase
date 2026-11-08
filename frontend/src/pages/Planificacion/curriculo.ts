/**
 * Ids de criterio del currículo de un área, para casar los «CA6.5» de una
 * planificación. Es dato público del servidor; sin conexión devuelve null y
 * la vista previa dice que esos criterios no se han podido comprobar.
 */
import { api } from '@/api'
import type { Asignatura, Grupo } from '@/db/localDb'

const cache = new Map<string, string[] | null>()

export async function idsDeCriterios(
  grupo: Pick<Grupo, 'curso' | 'etapa' | 'comunidad'>, asig: Pick<Asignatura, 'nombre' | 'comunidad'>,
  headers: Record<string, string>,
): Promise<string[] | null> {
  const curso = String(grupo.curso).replace('º', '').replace('ª', '') + 'º'
  const url = `/api/curriculum/criterios?asignatura=${encodeURIComponent(asig.nombre)}&curso=${curso}&etapa=${grupo.etapa}&comunidad=${encodeURIComponent(asig.comunidad || grupo.comunidad)}`
  if (cache.has(url)) return cache.get(url)!
  try {
    const r = await fetch(api(url), { headers })
    if (!r.ok) throw new Error(String(r.status))
    const datos = await r.json()
    const ids = Array.isArray(datos) ? datos.map((c: { id: string }) => c.id) : null
    cache.set(url, ids)
    return ids
  } catch {
    return null
  }
}
