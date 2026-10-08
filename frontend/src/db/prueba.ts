/**
 * Prueba escrita con preguntas: definición y cálculo de la nota.
 *
 * Hasta ahora una prueba escrita era un instrumento sin estructura: el docente
 * corregía en papel, sumaba aparte y tecleaba un número del 0 al 10. Aquí el
 * examen se define una vez —tipo, preguntas y lo que vale cada una— y al
 * corregir se anota cada pregunta: la nota sale sola y queda guardado de dónde
 * viene.
 *
 * Puro: ni base de datos ni pantalla. Lo que se guarda por alumno son las
 * respuestas (`Calificacion.niveles_rubrica`, pregunta → número) y la nota ya
 * calculada, igual que con las rúbricas.
 */

/**
 * - `puntos`: cada pregunta vale unos puntos y se anota cuántos saca (con decimales).
 * - `test`: cada pregunta es acierto, fallo o en blanco; el fallo puede restar.
 * - `niveles`: cada pregunta se valora con una escala propia del examen.
 */
export type TipoPrueba = 'puntos' | 'test' | 'niveles'

/**
 * - `unica`: el examen da una nota, que va a todos los criterios que evalúa.
 * - `criterios`: cada pregunta dice qué criterio evalúa y cada criterio recibe
 *   la nota de sus preguntas. Una pregunta sin criterio cuenta para todos los
 *   criterios que el examen nombra.
 */
export type RepartoPrueba = 'unica' | 'criterios'

export interface PreguntaPrueba {
  /** Estable: es la clave de las respuestas guardadas. No se reutiliza al borrar. */
  id: string
  enunciado: string
  /** Lo que vale la pregunta, en puntos del examen. */
  max: number
  criterio_id?: string | null
  /**
   * Solo `test`: las opciones entre las que elige el alumno, en orden (A, B,
   * C…). Con ellas el examen se puede imprimir y corregir por cámara.
   */
  opciones?: string[]
  /** Solo `test`: índice de la opción correcta en `opciones`. Sin ella no hay clave. */
  correcta?: number | null
}

/** Letras de las opciones de un test, en el orden de `opciones`. */
export const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export const MAX_OPCIONES = LETRAS.length

export interface NivelPrueba { nombre: string; valor: number }

export interface PruebaDef {
  titulo: string
  tipo: TipoPrueba
  reparto: RepartoPrueba
  preguntas: PreguntaPrueba[]
  /** Solo `test`: parte del valor de la pregunta que resta un fallo (0,25 = un cuarto). */
  penalizacion?: number
  /** Solo `niveles`: la escala con la que se valora cada pregunta. */
  escala?: NivelPrueba[]
}

/** Respuesta en un test. En blanco no suma ni resta. */
export const ACIERTO = 1
export const FALLO = -1
export const EN_BLANCO = 0

export const ESCALA_POR_DEFECTO: NivelPrueba[] = [
  { nombre: 'Correcta', valor: 2 },
  { nombre: 'Parcial', valor: 1 },
  { nombre: 'Incorrecta o en blanco', valor: 0 },
]

export const TIPOS_PRUEBA: { valor: TipoPrueba; nombre: string; explicacion: string }[] = [
  { valor: 'puntos', nombre: 'Puntos por pregunta', explicacion: 'Cada pregunta vale unos puntos y anotas cuántos saca, con decimales.' },
  { valor: 'test', nombre: 'Test', explicacion: 'Cada pregunta es acierto, fallo o en blanco. El fallo puede restar.' },
  { valor: 'niveles', nombre: 'Preguntas por niveles', explicacion: 'Cada pregunta se valora con una escala propia del examen: correcta, parcial…' },
]

const redondear2 = (n: number) => Math.round(n * 100) / 100

/** Id nuevo para una pregunta: el siguiente número libre, para no pisar respuestas ya guardadas. */
export function idDePreguntaNueva(preguntas: PreguntaPrueba[]): string {
  const usados = preguntas.map(p => Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0))
  return `p${Math.max(0, ...usados) + 1}`
}

/** N preguntas iguales que suman `total` puntos: el punto de partida habitual. */
export function preguntasIguales(n: number, total: number): PreguntaPrueba[] {
  const cuantas = Math.max(1, Math.min(200, Math.round(n)))
  const max = redondear2(total / cuantas)
  return Array.from({ length: cuantas }, (_, i) => ({ id: `p${i + 1}`, enunciado: '', max, criterio_id: null }))
}

export function pruebaVacia(titulo = 'Prueba escrita'): PruebaDef {
  return { titulo, tipo: 'puntos', reparto: 'unica', preguntas: preguntasIguales(10, 10) }
}

/**
 * Deja una definición en condiciones, venga de un fichero, de otra versión o
 * de la sincronización: ids únicos, puntos positivos, y cada tipo con lo suyo.
 */
export function normalizarPrueba(d: Partial<PruebaDef> | null | undefined): PruebaDef {
  const tipo: TipoPrueba = d?.tipo === 'test' || d?.tipo === 'niveles' ? d.tipo : 'puntos'
  const crudas = Array.isArray(d?.preguntas) ? d!.preguntas! : []
  // Un id que falta o está repetido se sustituye por uno libre, sin quitarle
  // el suyo a ninguna pregunta que venga detrás.
  const reservados = new Set(crudas.map(p => p?.id).filter((id): id is string => typeof id === 'string' && !!id))
  const vistos = new Set<string>()
  let n = 0
  const idLibre = () => { do { n++ } while (reservados.has(`p${n}`) || vistos.has(`p${n}`)); return `p${n}` }
  const preguntas: PreguntaPrueba[] = []
  for (const p of crudas) {
    const id = typeof p?.id === 'string' && p.id && !vistos.has(p.id) ? p.id : idLibre()
    vistos.add(id)
    const max = Number(p?.max)
    // Las opciones solo tienen sentido en un test; en otro tipo se descartan
    // para que un examen de puntos no arrastre una clave que nadie ve.
    const opciones = tipo === 'test' && Array.isArray(p?.opciones)
      ? p.opciones.slice(0, MAX_OPCIONES).map(o => String(o ?? '').trim())
      : []
    // `null` no es «la primera»: Number(null) da 0 y pondría correcta donde no la hay.
    const correcta = p?.correcta == null ? NaN : Number(p.correcta)
    preguntas.push({
      id,
      enunciado: String(p?.enunciado ?? '').trim(),
      max: Number.isFinite(max) && max > 0 ? redondear2(max) : 1,
      criterio_id: typeof p?.criterio_id === 'string' && p.criterio_id.trim() ? p.criterio_id.trim() : null,
      ...(opciones.length ? { opciones } : {}),
      ...(opciones.length && Number.isInteger(correcta) && correcta >= 0 && correcta < opciones.length ? { correcta } : {}),
    })
  }
  const pen = Number(d?.penalizacion)
  const escala = (Array.isArray(d?.escala) ? d!.escala! : [])
    .filter(n => n && String(n.nombre ?? '').trim() && Number.isFinite(Number(n.valor)))
    .map(n => ({ nombre: String(n.nombre).trim(), valor: Number(n.valor) }))
  return {
    titulo: String(d?.titulo ?? '').trim() || 'Prueba escrita',
    tipo,
    reparto: d?.reparto === 'criterios' ? 'criterios' : 'unica',
    preguntas,
    ...(tipo === 'test' ? { penalizacion: Number.isFinite(pen) && pen > 0 ? Math.min(1, pen) : 0 } : {}),
    ...(tipo === 'niveles' ? { escala: escala.some(n => n.valor > 0) ? escala : ESCALA_POR_DEFECTO } : {}),
  }
}

/**
 * Lo que anota una marca en un test con clave: la letra marcada contra la
 * correcta. `null` es dejar la pregunta en blanco. Así la corrección por
 * cámara y la de a mano guardan exactamente lo mismo (`ACIERTO`, `FALLO`,
 * `EN_BLANCO`) y la nota sale por el mismo camino.
 */
export function respuestaDeMarca(p: PreguntaPrueba, marcada: number | null | undefined): number {
  if (marcada == null) return EN_BLANCO
  if (p.correcta == null) throw new Error(`La pregunta «${p.enunciado || p.id}» no tiene opción correcta.`)
  return marcada === p.correcta ? ACIERTO : FALLO
}

/** Un test con opciones y correcta en todas sus preguntas: se puede imprimir y corregir por cámara. */
export function tieneClave(def: PruebaDef): boolean {
  return def.tipo === 'test' && def.preguntas.length > 0
    && def.preguntas.every(p => (p.opciones?.length ?? 0) >= 2 && p.correcta != null)
}

/** Las preguntas de un test a las que les falta algo para tener clave. */
export function preguntasSinClave(def: PruebaDef): number[] {
  if (def.tipo !== 'test') return []
  return def.preguntas.map((p, i) => ((p.opciones?.length ?? 0) >= 2 && p.correcta != null) ? -1 : i).filter(i => i >= 0)
}

/** Suma de lo que valen las preguntas: la escala del propio examen (10, 20, 100…). */
export function puntosTotales(def: PruebaDef): number {
  return redondear2(def.preguntas.reduce((t, p) => t + p.max, 0))
}

/**
 * Puntos que saca el alumno en una pregunta, según el tipo de examen.
 * `respuesta` sin definir es una pregunta todavía sin anotar: vale 0.
 */
export function puntosDePregunta(def: PruebaDef, p: PreguntaPrueba, respuesta: number | undefined): number {
  if (typeof respuesta !== 'number' || !Number.isFinite(respuesta)) return 0
  if (def.tipo === 'test') {
    if (respuesta > 0) return p.max
    if (respuesta < 0) return -(def.penalizacion ?? 0) * p.max
    return 0
  }
  if (def.tipo === 'niveles') {
    const tope = Math.max(0, ...(def.escala ?? []).map(n => n.valor))
    if (tope <= 0) return 0
    return p.max * Math.max(0, Math.min(1, respuesta / tope))
  }
  return Math.max(0, Math.min(p.max, respuesta))
}

export type ResultadoPrueba = {
  /** Nota 0-10 del examen entero. Null mientras no se haya anotado ninguna pregunta. */
  nota: number | null
  obtenido: number
  maximo: number
  anotadas: number
  total: number
  /** Criterio → nota 0-10 que le toca. Solo los criterios de destino que reciben alguna pregunta. */
  porCriterio: Record<string, number | null>
}

/**
 * Nota del examen y lo que le toca a cada criterio.
 *
 *   nota = puntos obtenidos ÷ puntos posibles × 10
 *
 * Una pregunta sin anotar cuenta como cero —al revés que un indicador de
 * rúbrica sin marcar—: en un examen, lo que no está contestado no puntúa. Por
 * eso se devuelve también cuántas van anotadas: a medio corregir, la nota es
 * provisional y hay que poder verlo.
 *
 * En un test la suma puede salir negativa por las penalizaciones; la nota no
 * baja de 0.
 *
 * `criteriosDestino` son los criterios que el instrumento evalúa según la
 * programación. Un criterio que aparece en una pregunta pero no está ahí no
 * recibe nota: la programación manda.
 */
export function notaDePrueba(
  def: PruebaDef,
  respuestas: Record<string, number> | null | undefined,
  criteriosDestino: string[],
): ResultadoPrueba {
  const r = respuestas ?? {}
  const a10 = (obtenido: number, maximo: number) =>
    maximo > 0 ? redondear2(Math.max(0, Math.min(1, obtenido / maximo)) * 10) : null

  let obtenido = 0, maximo = 0, anotadas = 0
  for (const p of def.preguntas) {
    maximo += p.max
    obtenido += puntosDePregunta(def, p, r[p.id])
    if (typeof r[p.id] === 'number') anotadas++
  }
  const nota = anotadas > 0 ? a10(obtenido, maximo) : null

  // Criterios que alguna pregunta nombra. Si ninguna nombra ninguno, el
  // reparto por criterios no tiene con qué repartir y el examen da nota única.
  const nombrados = new Set(def.preguntas.map(p => p.criterio_id).filter(Boolean))
  const unica = def.reparto === 'unica' || nombrados.size === 0

  const porCriterio: Record<string, number | null> = {}
  for (const criterio of criteriosDestino) {
    if (unica) { porCriterio[criterio] = nota; continue }
    // Un criterio que ninguna pregunta nombra no recibe nota: las preguntas
    // comunes («Presentación») acompañan a los criterios del examen, no
    // califican por sí solas a los que el examen no toca.
    if (!nombrados.has(criterio)) continue
    let o = 0, m = 0
    for (const p of def.preguntas) {
      if (p.criterio_id && p.criterio_id !== criterio) continue
      m += p.max
      o += puntosDePregunta(def, p, r[p.id])
    }
    porCriterio[criterio] = anotadas > 0 ? a10(o, m) : null
  }

  return { nota, obtenido: redondear2(obtenido), maximo: redondear2(maximo), anotadas, total: def.preguntas.length, porCriterio }
}

/** Criterios nombrados en las preguntas que el instrumento no evalúa: no recibirán nota. */
export function criteriosSinDestino(def: PruebaDef, criteriosDestino: string[]): string[] {
  if (def.reparto !== 'criterios') return []
  const destino = new Set(criteriosDestino)
  return [...new Set(def.preguntas.map(p => p.criterio_id).filter((c): c is string => !!c && !destino.has(c)))].sort()
}
