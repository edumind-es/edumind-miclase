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
 * `filas` son las de UN instrumento, ya filtradas a las unidades del trimestre
 * que se está calificando.
 *
 * Se cierra por transitividad entre unidades: si en una unidad van juntos A y
 * B y en otra B y C, los tres van juntos. No es un capricho: la nota se guarda
 * por alumno, instrumento, criterio y trimestre —no por unidad—, así que B es
 * la misma casilla en las dos unidades. Replicar solo «los de esta unidad»
 * dejaría A y C distintos de B según desde dónde se calificara.
 */
export function criteriosVinculados(filas: FilaVinculo[], criterio_id: string): string[] {
  const grupos = new Map<number, Set<string>>()
  for (const f of filas) {
    if (!f.vinculado) continue
    let g = grupos.get(f.unidad_id)
    if (!g) grupos.set(f.unidad_id, g = new Set())
    g.add(f.criterio_id)
  }
  // Un grupo de uno no vincula nada: es lo que queda cuando se retira de la
  // programación el otro criterio.
  const validos = [...grupos.values()].filter(g => g.size >= 2)

  const alcanzados = new Set([criterio_id])
  let crecio = true
  while (crecio) {
    crecio = false
    for (const g of validos) {
      if (![...g].some(c => alcanzados.has(c))) continue
      for (const c of g) if (!alcanzados.has(c)) { alcanzados.add(c); crecio = true }
    }
  }
  alcanzados.delete(criterio_id)
  return [...alcanzados].sort()
}
