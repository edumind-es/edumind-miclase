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
import { db, INSTRUMENTO_BANCO, type Calificacion, type Rubrica } from './localDb'
import { guardarPruebaEnBanco } from './queries'
import { sello } from './ids'

export const MOTIVO_RECUPERADA_DE_COPIA = 'Sustituida al recuperar la nota de una copia de seguridad'
export const MOTIVO_NO_ESTABA_EN_COPIA = 'Quitada al recuperar una copia de seguridad que no la tenía'

/** Lo que se lee de una copia: solo hacen falta sus calificaciones. */
export type CopiaLeida = { calificaciones?: Calificacion[]; rubricas?: Rubrica[] }

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
          prueba_id: c.prueba_id ?? null,
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
          valor: null, niveles_rubrica: null, prueba_id: null, origen: null,
          valor_anterior: n.valor, anterior_motivo: MOTIVO_NO_ESTABA_EN_COPIA,
          updated_at: sello(),
        })
        quitadas++
      }
    }
  })
  return { recuperadas, quitadas }
}

// ── Exámenes ────────────────────────────────────────────────────────────
//
// Las notas pueden seguir en su sitio y faltar el examen: sin sus preguntas
// no se ven las respuestas de cada alumno ni sale el informe. Le pasó a Luis
// al reorganizar las pruebas de una unidad (nov 2026): las notas de la UD1
// estaban, el examen no.

/** Un examen de la copia que en el aparato falta, está retirado o es distinto. */
export type ExamenRecuperable = {
  /** Id de la fila, el mismo en la copia y en el aparato. */
  id: number
  titulo: string
  preguntas: number
  clase: string
  area: string
  unidad: string
  /** La actividad o el instrumento donde hoy están las notas de ese examen. */
  instrumento: string
  estado: 'falta' | 'retirado' | 'cambiado' | 'movido'
  /** Con `cambiado`: cuántas preguntas tiene ahora. */
  preguntasAhora: number | null
  /** Otro examen que hoy ocupa ese instrumento y esa unidad. */
  ocupa: { id: number; titulo: string; preguntas: number } | null
}

type ExamenComparado = {
  copia: Rubrica; actual: Rubrica | undefined; destino: number
  estado: ExamenRecuperable['estado']; ocupa: Rubrica | null
}

const numPreguntas = (r: Rubrica | undefined): number => {
  try { return (JSON.parse(r?.prueba_json || 'null')?.preguntas ?? []).length } catch { return 0 }
}
const mismoExamen = (a: Rubrica, b: Rubrica): boolean => {
  try { return JSON.stringify(JSON.parse(a.prueba_json || 'null')) === JSON.stringify(JSON.parse(b.prueba_json || 'null')) }
  catch { return false }
}

/** Compara (puro) los exámenes de la copia con los del aparato. */
export function compararExamenes(rubricas: Rubrica[], calificaciones: Calificacion[], copia: CopiaLeida): ExamenComparado[] {
  const porId = new Map(rubricas.filter(r => r.id != null).map(r => [r.id!, r]))
  const notaPorId = new Map(calificaciones.filter(c => c.id != null && !c.deleted_at).map(c => [c.id!, c]))
  const salida: ExamenComparado[] = []
  for (const e of copia.rubricas ?? []) {
    if (e.tipo !== 'prueba' || e.deleted_at || e.id == null || e.instrumento_id === INSTRUMENTO_BANCO || !numPreguntas(e)) continue
    const actual = porId.get(e.id)
    // Dónde están hoy las notas que ese examen tenía en la copia: si el
    // instrumento se convirtió en actividad, las notas cambiaron de
    // instrumento y el examen tiene que ir con ellas.
    const votos = new Map<number, number>()
    for (const c of copia.calificaciones ?? []) {
      if (c.id == null || c.deleted_at || c.instrumento_id !== e.instrumento_id) continue
      if (e.unidad_id != null && c.unidad_id !== e.unidad_id) continue
      const hoy = notaPorId.get(c.id)
      if (hoy) votos.set(hoy.instrumento_id, (votos.get(hoy.instrumento_id) ?? 0) + 1)
    }
    const masVotado = [...votos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const destino = masVotado ?? (actual && !actual.deleted_at ? actual.instrumento_id : e.instrumento_id)
    const estado: ExamenRecuperable['estado'] | null =
      !actual ? 'falta'
      : actual.deleted_at ? 'retirado'
      : !mismoExamen(actual, e) ? 'cambiado'
      : actual.instrumento_id !== destino || (actual.unidad_id ?? null) !== (e.unidad_id ?? null) ? 'movido'
      : null
    if (!estado) continue
    const ocupa = rubricas.find(r => r.tipo === 'prueba' && !r.deleted_at && r.id !== e.id
      && r.instrumento_id === destino && (r.unidad_id ?? null) === (e.unidad_id ?? null) && numPreguntas(r) > 0) ?? null
    salida.push({ copia: e, actual, destino, estado, ocupa })
  }
  return salida
}

/** Los exámenes que se pueden recuperar de una copia, con nombres. No escribe nada. */
export async function examenesRecuperablesDeCopia(copia: CopiaLeida): Promise<ExamenRecuperable[]> {
  const comparado = compararExamenes(await db.rubricas.toArray(), await db.calificaciones.toArray(), copia)
  const salida: ExamenRecuperable[] = []
  for (const x of comparado) {
    const ins = await db.instrumentos.get(x.destino)
    const asig = ins ? await db.asignaturas.get(ins.asignatura_id) : undefined
    const clase = asig ? await db.grupos.get(asig.grupo_id) : undefined
    const unidad = x.copia.unidad_id != null ? await db.unidades.get(x.copia.unidad_id) : undefined
    salida.push({
      id: x.copia.id!,
      titulo: x.copia.titulo || 'Examen sin título',
      preguntas: numPreguntas(x.copia),
      clase: clase?.nombre ?? 'Clase que ya no existe',
      area: asig?.nombre_display || asig?.nombre || '',
      unidad: x.copia.unidad_id == null ? 'Todas las unidades' : unidad?.nombre ?? 'Unidad que ya no existe',
      instrumento: ins && !ins.deleted_at ? ins.nombre : `${ins?.nombre ?? 'Instrumento'} (retirado)`,
      estado: x.estado,
      preguntasAhora: x.estado === 'cambiado' ? numPreguntas(x.actual) : null,
      ocupa: x.ocupa ? { id: x.ocupa.id!, titulo: x.ocupa.titulo || 'Examen sin título', preguntas: numPreguntas(x.ocupa) } : null,
    })
  }
  return salida.sort((a, b) => `${a.clase}|${a.area}|${a.unidad}`.localeCompare(`${b.clase}|${b.area}|${b.unidad}`, 'es', { numeric: true }))
}

/**
 * Devuelve al aparato los exámenes elegidos tal como estaban en la copia, en
 * el instrumento donde hoy están sus notas. Si otro examen ocupa ese sitio,
 * solo se sustituye con `sustituir`, y antes se guarda una copia suya en el
 * banco de exámenes. No toca ninguna nota.
 */
export async function recuperarExamenesDeCopia(
  copia: CopiaLeida, elegidos: { id: number; sustituir?: boolean }[],
): Promise<{ recuperados: number; sustituidos: number; ocupados: number }> {
  let recuperados = 0, sustituidos = 0, ocupados = 0
  const comparado = compararExamenes(await db.rubricas.toArray(), await db.calificaciones.toArray(), copia)
  for (const e of elegidos) {
    const x = comparado.find(c => c.copia.id === e.id)
    if (!x) continue
    if (x.ocupa) {
      if (!e.sustituir) { ocupados++; continue }
      try { await guardarPruebaEnBanco(JSON.parse(x.ocupa.prueba_json || 'null')) } catch { /* ilegible: nada que guardar */ }
      await db.rubricas.update(x.ocupa.id!, { deleted_at: sello(), updated_at: sello() })
      sustituidos++
    }
    const campos = {
      instrumento_id: x.destino, unidad_id: x.copia.unidad_id ?? null, titulo: x.copia.titulo,
      prueba_json: x.copia.prueba_json, tipo: 'prueba' as const, deleted_at: null, updated_at: sello(),
    }
    if (x.actual) await db.rubricas.update(x.actual.id!, campos)
    else await db.rubricas.add({ ...x.copia, ...campos })
    recuperados++
  }
  return { recuperados, sustituidos, ocupados }
}
