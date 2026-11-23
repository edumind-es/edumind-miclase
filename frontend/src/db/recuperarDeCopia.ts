/**
 * Recuperar notas sueltas de una copia de seguridad, sin importar la copia.
 *
 * Importar una copia sustituye todo lo que hay en el aparato. Cuando algo ha
 * pisado las notas de UNA unidad y desde la copia se ha seguido trabajando,
 * eso no sirve: se llevaría el trabajo nuevo. Aquí la copia solo se lee, se
 * compara casilla a casilla con lo que hay y el docente elige qué grupo de
 * casillas (instrumento, unidad y trimestre) vuelve a como estaba.
 *
 * Las casillas se casan por el `id` de la fila, no por la clave: los ids son
 * los mismos en todos los aparatos, y convertir un instrumento en actividad
 * cambia el `instrumento_id` de la fila pero no su id.
 *
 * Nada se pierde al recuperar: la nota que había queda como fantasma
 * (`valor_anterior`). Nació de que corregir el examen de la UD2 pisó el de la
 * UD1 de Luis (nov 2026) y solo un Mac sin sincronizar lo conservaba.
 */
import { db, type Calificacion } from './localDb'
import { sello } from './ids'

export const MOTIVO_RECUPERADA_DE_COPIA = 'Sustituida al recuperar la nota de una copia de seguridad'
export const MOTIVO_NO_ESTABA_EN_COPIA = 'Quitada al recuperar una copia de seguridad que no la tenía'

/** Lo que se lee de una copia: solo hacen falta sus calificaciones. */
export type CopiaLeida = { calificaciones?: Calificacion[] }

/** Casillas de un instrumento, unidad y trimestre que no están como en la copia. */
export type GrupoRecuperable = {
  clave: string
  clase: string
  area: string
  unidad: string
  instrumento: string
  trimestre: number
  /** Casillas que la copia tiene con otra nota u otras respuestas. */
  distintas: number
  /** Alumnos a los que afectan. */
  alumnos: number
  /** Casillas con nota que la copia no tenía (puestas después). */
  nuevas: number
}

type Par = { actual: Calificacion; copia: Calificacion }
type Comparado = { clave: string; pares: Par[]; nuevas: Calificacion[] }

const claveCasilla = (c: Calificacion) => `${c.alumno_id}:${c.instrumento_id}:${c.criterio_id}:${c.trimestre}:${c.unidad_id}`
const claveGrupo = (c: Calificacion) => `${c.instrumento_id}:${c.unidad_id}:${c.trimestre}`
const respuestas = (c: Calificacion) =>
  JSON.stringify(Object.entries(c.niveles_rubrica ?? {}).sort(([a], [b]) => a.localeCompare(b)))

/** ¿La casilla del aparato guarda algo distinto de lo que guarda la copia? */
export function esDistinta(actual: Calificacion, copia: Calificacion): boolean {
  return !!actual.deleted_at
    || (actual.valor ?? null) !== (copia.valor ?? null)
    || respuestas(actual) !== respuestas(copia)
}

/**
 * Compara (puro): `actuales` son todas las filas del aparato, borradas
 * incluidas. Solo salen los grupos con alguna casilla distinta; las casillas
 * nuevas de un grupo sin ninguna distinta son trabajo posterior a la copia y
 * no se enseñan.
 */
export function compararConCopia(actuales: Calificacion[], copia: CopiaLeida): Comparado[] {
  const porId = new Map(actuales.filter(c => c.id != null).map(c => [c.id!, c]))
  const vivaPorClave = new Map<string, Calificacion>()
  for (const c of actuales) {
    if (c.deleted_at) continue
    const k = claveCasilla(c)
    const otra = vivaPorClave.get(k)
    if (!otra || (c.updated_at ?? '') > (otra.updated_at ?? '')) vivaPorClave.set(k, c)
  }
  const deCopia = (copia.calificaciones ?? []).filter(c => c.id != null)
  const idsDeCopia = new Set(deCopia.map(c => c.id!))
  const grupos = new Map<string, Comparado>()
  const grupo = (k: string) => {
    if (!grupos.has(k)) grupos.set(k, { clave: k, pares: [], nuevas: [] })
    return grupos.get(k)!
  }
  const destinos = new Set<number>()
  for (const c of deCopia) {
    if (c.deleted_at || c.valor == null) continue
    const fila = porId.get(c.id!)
    if (!fila) continue
    // Si la fila se retiró por duplicada, la que cuenta es la viva de su casilla.
    const actual = fila.deleted_at ? vivaPorClave.get(claveCasilla(fila)) ?? fila : fila
    if (actual.id == null || destinos.has(actual.id)) continue
    destinos.add(actual.id)
    if (esDistinta(actual, c)) grupo(claveGrupo(actual)).pares.push({ actual, copia: c })
  }
  for (const c of actuales) {
    if (c.deleted_at || c.valor == null || c.id == null) continue
    if (idsDeCopia.has(c.id) || destinos.has(c.id)) continue
    const g = grupos.get(claveGrupo(c))
    if (g?.pares.length) g.nuevas.push(c)
  }
  return [...grupos.values()].filter(g => g.pares.length)
}

/** Lo que se puede recuperar de una copia, con nombres para enseñarlo. No escribe nada. */
export async function notasRecuperablesDeCopia(copia: CopiaLeida): Promise<GrupoRecuperable[]> {
  const comparado = compararConCopia(await db.calificaciones.toArray(), copia)
  const salida: GrupoRecuperable[] = []
  for (const g of comparado) {
    const muestra = g.pares[0].actual
    const ins = await db.instrumentos.get(muestra.instrumento_id)
    const asig = ins ? await db.asignaturas.get(ins.asignatura_id) : undefined
    const clase = asig ? await db.grupos.get(asig.grupo_id) : undefined
    const unidad = muestra.unidad_id ? await db.unidades.get(muestra.unidad_id) : undefined
    salida.push({
      clave: g.clave,
      clase: clase?.nombre ?? 'Clase que ya no existe',
      area: asig?.nombre_display || asig?.nombre || muestra.asignatura,
      unidad: unidad?.nombre ?? 'Sin unidad',
      instrumento: ins && !ins.deleted_at ? ins.nombre : `${ins?.nombre ?? 'Instrumento'} (retirado)`,
      trimestre: muestra.trimestre,
      distintas: g.pares.length,
      alumnos: new Set(g.pares.map(p => p.actual.alumno_id)).size,
      nuevas: g.nuevas.length,
    })
  }
  return salida.sort((a, b) => `${a.clase}|${a.area}|${a.unidad}|${a.instrumento}`.localeCompare(`${b.clase}|${b.area}|${b.unidad}|${b.instrumento}`, 'es', { numeric: true }))
}

/**
 * Devuelve a las casillas de los grupos elegidos la nota y las respuestas de
 * la copia. Con `quitarNuevas`, las casillas del grupo que la copia no tenía
 * se quedan sin nota. En los dos casos lo que había queda como fantasma.
 */
export async function recuperarNotasDeCopia(
  copia: CopiaLeida, elegidos: { clave: string; quitarNuevas?: boolean }[],
): Promise<{ recuperadas: number; quitadas: number }> {
  let recuperadas = 0, quitadas = 0
  await db.transaction('rw', db.calificaciones, async () => {
    const comparado = compararConCopia(await db.calificaciones.toArray(), copia)
    for (const e of elegidos) {
      const g = comparado.find(x => x.clave === e.clave)
      if (!g) continue
      for (const { actual, copia: c } of g.pares) {
        const cambia = !actual.deleted_at && actual.valor != null && actual.valor !== c.valor
        await db.calificaciones.update(actual.id!, {
          valor: c.valor ?? null,
          niveles_rubrica: c.niveles_rubrica ?? null,
          origen: c.origen ?? null,
          ...(cambia ? { valor_anterior: actual.valor, anterior_motivo: MOTIVO_RECUPERADA_DE_COPIA } : {}),
          deleted_at: null,
          updated_at: sello(),
        })
        recuperadas++
      }
      if (!e.quitarNuevas) continue
      for (const n of g.nuevas) {
        await db.calificaciones.update(n.id!, {
          valor: null, niveles_rubrica: null, origen: null,
          valor_anterior: n.valor, anterior_motivo: MOTIVO_NO_ESTABA_EN_COPIA,
          updated_at: sello(),
        })
        quitadas++
      }
    }
  })
  return { recuperadas, quitadas }
}
