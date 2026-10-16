/**
 * Criterios vinculados: un mismo instrumento que se califica una sola vez y
 * pone la nota en varios criterios.
 *
 * El vínculo se declara en la programación, en la fila criterio ↔ instrumento
 * de cada unidad (`CriterioInstrumento.vinculado`). Las filas marcadas de un
 * mismo instrumento dentro de una unidad forman un grupo.
 *
 * Puro: aquí solo se decide quién va con quién. Leer y escribir es cosa de
 * `queries.ts`.
 */

export type FilaVinculo = { unidad_id: number; criterio_id: string; vinculado?: number | null }

/**
 * Con qué criterios va vinculado `criterio_id`, sin contarlo a él.
 *
 * `filas` son las de UN instrumento, normalmente de la unidad que se está
 * calificando. El vínculo no sale de su unidad: desde la v7 la casilla lleva
 * la unidad en la clave, así que A-B en una unidad y B-C en otra son dos
 * grupos distintos, cada uno con sus casillas. Antes, con la clave sin
 * unidad, había que cerrar por transitividad entre unidades; eso dejó de
 * tener sentido. Si llegan filas de varias unidades (la vista «Todo el
 * curso»), se devuelven los compañeros de `criterio_id` en cualquiera de
 * ellas, sin encadenar.
 */
export function criteriosVinculados(filas: FilaVinculo[], criterio_id: string): string[] {
  const grupos = new Map<number, Set<string>>()
  for (const f of filas) {
    if (!f.vinculado) continue
    let g = grupos.get(f.unidad_id)
    if (!g) grupos.set(f.unidad_id, g = new Set())
    g.add(f.criterio_id)
  }
  const companeros = new Set<string>()
  for (const g of grupos.values()) {
    // Un grupo de uno no vincula nada: es lo que queda cuando se retira de la
    // programación el otro criterio.
    if (g.size < 2 || !g.has(criterio_id)) continue
    for (const c of g) if (c !== criterio_id) companeros.add(c)
  }
  return [...companeros].sort()
}
