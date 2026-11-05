/**
 * El currículo empaquetado, leído en puro: sin fetch ni caché.
 *
 * Los ficheros los escribe `scripts/empaquetar_curriculo.mjs` desde
 * `curriculum/` (índice, descriptores por etapa y un paquete de criterios por
 * comunidad y etapa). Esto los convierte en lo mismo que responde
 * `/api/curriculum` del servidor, campo a campo, para que las pantallas no
 * noten de dónde viene; `pruebas/curriculo-vs-servidor.test.mjs` compara los
 * dos. `index.ts` pone encima la carga y la reserva del servidor.
 */

export const VERSION_PAQUETE = 1

export type Indice = {
  version: number
  comunidades: Record<string, {
    /** Carpeta de `curriculum/`, que nombra el paquete: `<carpeta>-<etapa>.json` */
    carpeta: string
    etapas: Record<string, Record<string, string[]>>
  }>
}

export type PaqueteCriterios = {
  version: number
  comunidad: string
  etapa: string
  areas: Record<string, Record<string, {
    criterios: { id: string; objetivo_id: string | null; descripcion: string; peso: number }[]
    objetivos: Record<string, { descriptores: string[]; competencias: string[]; origen: string }>
  }>>
}

export type PaqueteSaberes = {
  version: number
  comunidad: string
  etapa: string
  areas: Record<string, Record<string, {
    bloques: { id: string; titulo: string }[]
    saberes: { id: string; bloque_id: string; descripcion: string; criterios_ids: string[] }[]
  }>>
}

/** Lo que da `/api/curriculum/criterios`. */
export type CriterioCurriculo = {
  id: string
  asignatura: string
  curso: string
  etapa: string
  comunidad: string
  objetivo_id: string | null
  descripcion: string
  peso: number
  descriptores: string[]
  competencias_clave: string[]
  conexion_origen: string
}

export type AsignaturaCurriculo = { asignatura: string; etapa: string; comunidad: string }
export type CursoCurriculo = { curso: string }
export type DescriptoresCurriculo = {
  competencias: { id: string; titulo: string }[]
  descriptores: { id: string; competencia_id: string; descripcion: string }[]
}
export type SaberesCurriculo = {
  bloques: { id: string; asignatura: string; curso: string; etapa: string; comunidad: string; titulo: string }[]
  saberes: {
    id: string; bloque_id: string; asignatura: string; curso: string; etapa: string; comunidad: string
    descripcion: string; criterios_ids_csv: string | null
  }[]
}

/**
 * El curso como lo guarda el currículo: «4» → «4º». La misma regla que el
 * servidor, incluidos sus límites: «4ºA» o «Todos» no casan en ningún lado.
 */
export function normalizarCurso(curso: string | number): string {
  return String(curso).replace('º', '').replace('ª', '') + 'º'
}

/** Nombre del paquete de una comunidad y etapa, o null si el índice no la tiene. */
export function clavePaquete(indice: Indice, comunidad: string, etapa: string): string | null {
  const com = indice.comunidades[comunidad]
  if (!com || !com.etapas[etapa]) return null
  return `${com.carpeta}-${etapa}`
}

export function comunidadesDelIndice(indice: Indice): string[] {
  return Object.keys(indice.comunidades)
}

export function asignaturasDelIndice(indice: Indice, etapa: string, comunidad: string): AsignaturaCurriculo[] {
  const areas = indice.comunidades[comunidad]?.etapas[etapa] ?? {}
  return Object.keys(areas).sort(porCodigo).map(asignatura => ({ asignatura, etapa, comunidad }))
}

export function cursosDelIndice(indice: Indice, asignatura: string, etapa: string, comunidad: string): CursoCurriculo[] {
  const cursos = indice.comunidades[comunidad]?.etapas[etapa]?.[asignatura] ?? []
  return [...cursos].sort(porCodigo).map(curso => ({ curso }))
}

/** Los criterios de un área y curso, como los da el servidor (ordenados por id). */
export function criteriosDelPaquete(
  paquete: PaqueteCriterios, asignatura: string, curso: string | number
): CriterioCurriculo[] {
  const cursoNorm = normalizarCurso(curso)
  const bloque = paquete.areas[asignatura]?.[cursoNorm]
  if (!bloque) return []
  const { comunidad, etapa } = paquete
  return bloque.criterios
    .map(cr => {
      const o = cr.objetivo_id ? bloque.objetivos[cr.objetivo_id] : undefined
      return {
        id: cr.id, asignatura, curso: cursoNorm, etapa, comunidad,
        objetivo_id: cr.objetivo_id, descripcion: cr.descripcion, peso: cr.peso,
        descriptores: o?.descriptores ?? [],
        competencias_clave: o?.competencias ?? [],
        conexion_origen: o?.origen ?? 'ninguna',
      }
    })
    .sort((a, b) => porCodigo(a.id, b.id))
}

export function saberesDelPaquete(
  paquete: PaqueteSaberes, asignatura: string, curso: string | number
): SaberesCurriculo {
  const cursoNorm = normalizarCurso(curso)
  const bloque = paquete.areas[asignatura]?.[cursoNorm]
  if (!bloque) return { bloques: [], saberes: [] }
  const ctx = { asignatura, curso: cursoNorm, etapa: paquete.etapa, comunidad: paquete.comunidad }
  return {
    bloques: [...bloque.bloques].sort((a, b) => porCodigo(a.id, b.id)).map(b => ({ id: b.id, ...ctx, titulo: b.titulo })),
    saberes: [...bloque.saberes].sort((a, b) => porCodigo(a.id, b.id)).map(s => ({
      id: s.id, bloque_id: s.bloque_id, ...ctx, descripcion: s.descripcion,
      criterios_ids_csv: s.criterios_ids.length ? s.criterios_ids.join(',') : null,
    })),
  }
}

/** Orden de SQLite para texto (byte a byte), que es el que da el servidor. */
function porCodigo(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
