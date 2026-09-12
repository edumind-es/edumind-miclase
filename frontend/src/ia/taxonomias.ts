/**
 * Sugerencia de instrumentos a partir del criterio de evaluación.
 *
 * ── Lo que esto es y lo que NO es ──────────────────────────────────────────
 *
 * Es una **sugerencia** para no partir de cero delante de un criterio en
 * blanco. No es una clasificación del criterio, y no debe convertirse en una.
 *
 * En particular, y esto importa: **el DOK no se deduce del verbo.** El nivel
 * de profundidad depende de la complejidad de lo que se pide, no de la palabra
 * con la que empieza el enunciado. «Describir» es reproducir si se pide
 * describir lo que se acaba de leer, y es pensamiento estratégico si se pide
 * describir por qué un experimento falló. Por eso aquí el DOK **se pregunta al
 * docente**, no se calcula: es él quien sabe qué va a exigir en su aula.
 *
 * El verbo sí da una pista razonable del nivel de Bloom, y esa pista se usa
 * solo para ordenar la sugerencia. Cuando el verbo no dice nada por sí mismo
 * —«participar», «mostrar», «seleccionar»— se dice y se pasa directamente a
 * preguntar por la demanda, en vez de inventar un nivel.
 *
 * ── Procedencia ───────────────────────────────────────────────────────────
 *
 * Los nombres de los seis niveles son los de la taxonomía de Bloom revisada, y
 * los cuatro de profundidad son los de la escala DOK de Webb. Las **listas de
 * verbos, en cambio, son una heurística de este proyecto**: están sacadas de
 * los verbos que de verdad aparecen en el currículo LOMLOE cargado en
 * `c_criterios`, ordenados por frecuencia. No proceden de ninguna fuente
 * publicada y no deben citarse como si lo fueran.
 */
import { TIPOS_INSTRUMENTO } from './instrumentosConfig'

export type NivelBloom = 'recordar' | 'comprender' | 'aplicar' | 'analizar' | 'evaluar' | 'crear'

export const BLOOM: { id: NivelBloom; nombre: string }[] = [
  { id: 'recordar',   nombre: 'Recordar' },
  { id: 'comprender', nombre: 'Comprender' },
  { id: 'aplicar',    nombre: 'Aplicar' },
  { id: 'analizar',   nombre: 'Analizar' },
  { id: 'evaluar',    nombre: 'Evaluar' },
  { id: 'crear',      nombre: 'Crear' },
]

/** Profundidad de la demanda. La elige el docente; no se infiere del verbo. */
export const DOK: { nivel: 1 | 2 | 3 | 4; nombre: string; pregunta: string }[] = [
  { nivel: 1, nombre: 'Reproducir',  pregunta: 'Repetir o localizar algo que ya se ha visto' },
  { nivel: 2, nombre: 'Aplicar',     pregunta: 'Usar una destreza o un concepto en una tarea conocida' },
  { nivel: 3, nombre: 'Razonar',     pregunta: 'Decidir una estrategia y justificarla' },
  { nivel: 4, nombre: 'Investigar',  pregunta: 'Indagación larga, con fuentes y resultado propio' },
]

/**
 * Verbos del currículo agrupados por nivel de Bloom.
 * Heurística del proyecto, no fuente publicada (ver cabecera).
 */
const VERBOS: Record<NivelBloom, string[]> = {
  recordar:   ['identificar', 'reconocer', 'conocer', 'localizar', 'leer', 'escuchar', 'obtener', 'buscar', 'recoger'],
  comprender: ['comprender', 'interpretar', 'describir', 'explicar', 'expresar', 'comparar', 'ordenar', 'extraer'],
  aplicar:    ['aplicar', 'emplear', 'resolver', 'actuar', 'interactuar', 'adoptar', 'incorporar', 'explorar', 'afianzar'],
  analizar:   ['analizar', 'formular', 'establecer', 'revisar', 'reflexionar', 'plantear', 'investigar'],
  evaluar:    ['valorar', 'evaluar', 'rechazar', 'contribuir', 'proteger', 'promover'],
  crear:      ['producir', 'elaborar', 'crear', 'diseñar', 'construir', 'planificar', 'proponer', 'generar', 'comunicar', 'presentar'],
}

/**
 * Verbos que por sí solos NO dicen el nivel: aparecen en el currículo tanto
 * para tareas de reproducción como de indagación larga. Con estos se pregunta
 * por la demanda en vez de arriesgar una etiqueta.
 */
const AMBIGUOS = new Set([
  'utilizar', 'realizar', 'participar', 'seleccionar', 'mostrar', 'compartir',
  'desarrollar', 'manifestar', 'iniciarse',
])

/** Tipos de instrumento que suelen encajar con cada nivel de Bloom. */
const POR_BLOOM: Record<NivelBloom, string[]> = {
  recordar:   ['prueba-escrita', 'observacion'],
  comprender: ['prueba-escrita', 'oral', 'diario'],
  aplicar:    ['trabajo', 'observacion', 'rubrica'],
  analizar:   ['trabajo', 'rubrica', 'prueba-escrita'],
  evaluar:    ['rubrica', 'oral', 'autoevaluacion', 'portfolio'],
  crear:      ['trabajo', 'portfolio', 'rubrica'],
}

/** Tipos que suelen encajar con cada profundidad de demanda. */
const POR_DOK: Record<1 | 2 | 3 | 4, string[]> = {
  1: ['prueba-escrita', 'observacion'],
  2: ['prueba-escrita', 'trabajo', 'observacion', 'rubrica'],
  3: ['rubrica', 'trabajo', 'oral', 'portfolio'],
  4: ['portfolio', 'trabajo', 'diario', 'rubrica'],
}

const sinTildes = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Primer verbo del criterio y el nivel de Bloom al que apunta.
 *
 * Devuelve `nivel: null` cuando el verbo no lo dice por sí mismo, que no es un
 * fallo: es la respuesta correcta para «participar» o «seleccionar».
 */
export function bloomDeCriterio(
  descripcion: string
): { verbo: string; nivel: NivelBloom | null; ambiguo: boolean } | null {
  const limpio = sinTildes(descripcion).replace(/[^a-z\s]/g, ' ').trim()
  const palabras = limpio.split(/\s+/).filter(Boolean)
  if (!palabras.length) return null

  // Se mira el arranque del enunciado: los criterios LOMLOE empiezan por el
  // verbo de la competencia, y el resto de la frase lo matiza pero no lo manda.
  for (const palabra of palabras.slice(0, 3)) {
    if (AMBIGUOS.has(palabra)) return { verbo: palabra, nivel: null, ambiguo: true }
    for (const nivel of Object.keys(VERBOS) as NivelBloom[]) {
      if (VERBOS[nivel].some(v => sinTildes(v) === palabra)) {
        return { verbo: palabra, nivel, ambiguo: false }
      }
    }
  }
  return { verbo: palabras[0], nivel: null, ambiguo: false }
}

export type Sugerencia = {
  /** El verbo con el que arranca el criterio. */
  verbo: string | null
  /** Nivel de Bloom al que apunta, o null si el verbo no lo dice. */
  bloom: NivelBloom | null
  /** Por qué no se ha podido apuntar un nivel, si es el caso. */
  motivo: 'ambiguo' | 'desconocido' | null
  /** Tipos de instrumento sugeridos, de `TIPOS_INSTRUMENTO`. */
  tipos: string[]
  /** Etiquetas legibles de esos tipos, para la pantalla. */
  etiquetas: { value: string; label: string; icon: string }[]
}

/**
 * Sugiere tipos de instrumento para un criterio.
 *
 * @param descripcion  el enunciado del criterio
 * @param dok          la profundidad que el docente declara, si la ha elegido.
 *                     Cuando viene, manda sobre la pista del verbo: quien sabe
 *                     lo que va a pedir es él, no el enunciado.
 */
export function sugerirInstrumentos(
  descripcion: string, dok?: 1 | 2 | 3 | 4
): Sugerencia {
  const v = bloomDeCriterio(descripcion)
  const bloom = v?.nivel ?? null

  let tipos: string[]
  if (dok) {
    tipos = POR_DOK[dok]
  } else if (bloom) {
    tipos = POR_BLOOM[bloom]
  } else {
    // Sin nivel y sin demanda declarada no se sugiere nada: un listado al azar
    // se leería como una recomendación, y no lo sería.
    tipos = []
  }

  const porValor = new Map(TIPOS_INSTRUMENTO.map(t => [t.value, t]))
  return {
    verbo: v?.verbo ?? null,
    bloom,
    motivo: bloom ? null : v?.ambiguo ? 'ambiguo' : v ? 'desconocido' : null,
    tipos,
    etiquetas: tipos
      .map(t => porValor.get(t))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map(t => ({ value: t.value, label: t.label, icon: t.icon })),
  }
}
