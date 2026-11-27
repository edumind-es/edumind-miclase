/**
 * El prompt de repaso: a partir de lo que más se ha fallado en una prueba,
 * pide a una IA externa tareas de repaso o de refuerzo.
 *
 * Puro. Lleva el examen y cifras del grupo, nunca alumnado: ni nombres ni
 * notas de nadie. Cuando se pide para un alumno, lo que entra son SUS
 * preguntas falladas, sin decir de quién son.
 */

export type PreguntaDeRepaso = {
  numero: number
  enunciado: string
  /** La respuesta esperada, si la planilla la trae. */
  clave?: string | null
  /** El criterio de evaluación, con su texto si se tiene. */
  criterio?: string | null
  /** El aspecto o etiqueta de la pregunta, si la tiene. */
  aspecto?: string | null
  /** Índice de acierto 0-100: del grupo, o del alumno en su caso. */
  pctAcierto: number
}

export type DatosRepaso = {
  titulo: string
  area: string
  /** «6º primaria», si se sabe. */
  nivel?: string | null
  unidad?: string | null
  /** «grupo»: lo que más falló la clase. «alumno»: lo que falló uno. */
  para: 'grupo' | 'alumno'
  /** Ya ordenadas, de la más fallada a la menos. */
  preguntas: PreguntaDeRepaso[]
}

/** Cuántas preguntas entran como mucho: más allá el repaso deja de ser un repaso. */
export const MAXIMO_REPASO = 8
/** Por debajo de este acierto del grupo una pregunta merece repaso. */
export const UMBRAL_REPASO = 60

/** Las preguntas de un informe de grupo que merecen repaso, de la más fallada a la menos. */
export function preguntasParaRepasar<T extends { pctAcierto: number; numero: number }>(porDificultad: T[]): T[] {
  const bajas = porDificultad.filter(p => p.pctAcierto < UMBRAL_REPASO)
  // Si nada baja del umbral, las tres más flojas: siempre hay algo que repasar
  return (bajas.length ? bajas : porDificultad.slice(0, 3)).slice(0, MAXIMO_REPASO)
}

const limpio = (t: string) => t.replace(/\s+/g, ' ').trim()

export function generarPromptRepaso(d: DatosRepaso): string {
  const quien = d.para === 'grupo'
    ? 'el grupo ha fallado más'
    : 'un alumno ha fallado (no se dice quién es)'
  const lineas = d.preguntas.map(p => {
    const extra = [
      p.criterio ? `Criterio: ${limpio(p.criterio)}` : null,
      p.aspecto ? `Aspecto: ${limpio(p.aspecto)}` : null,
      p.clave ? `Respuesta esperada: ${limpio(p.clave)}` : null,
      d.para === 'grupo' ? `Acierto del grupo: ${Math.round(p.pctAcierto)} %` : `Consiguió el ${Math.round(p.pctAcierto)} % de la pregunta`,
    ].filter(Boolean).map(x => `   - ${x}`).join('\n')
    return `${p.numero}. ${limpio(p.enunciado) || '(pregunta sin enunciado escrito)'}\n${extra}`
  }).join('\n')

  return [
    `Eres docente de ${d.area}${d.nivel ? ` de ${d.nivel}` : ''} en España (LOMLOE).`,
    `He corregido la prueba «${d.titulo}»${d.unidad ? ` de la unidad «${d.unidad}»` : ''}. Estas son las preguntas que ${quien}, de la más fallada a la menos:`,
    '',
    lineas,
    '',
    d.para === 'grupo'
      ? 'Prepara una sesión de repaso para toda la clase sobre esos contenidos.'
      : 'Prepara un plan breve de refuerzo individual sobre esos contenidos.',
    'Quiero:',
    '1. En dos o tres líneas, qué idea o procedimiento parece no estar entendido detrás de cada grupo de fallos (es una hipótesis: dilo como tal).',
    '2. Entre 6 y 10 tareas nuevas, de menos a más dificultad, que NO repitan las preguntas del examen: primero con ayuda (ejemplo resuelto, pista), después sin ella.',
    '3. Al menos una tarea manipulativa o de aplicación a una situación real, y una para hacer en pareja o en equipo.',
    '4. Una versión de las tareas con más apoyo y otra de ampliación (DUA).',
    '5. Tres preguntas cortas de comprobación para el final, con su solución.',
    '6. Las soluciones de todas las tareas, aparte, al final.',
    '',
    'Escribe en el mismo idioma que las preguntas del examen. No inventes datos del alumnado: no te he dado ninguno.',
  ].join('\n')
}
