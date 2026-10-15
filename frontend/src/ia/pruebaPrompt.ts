/**
 * Prompt para que una IA —la local del navegador o ChatGPT, Claude, Gemini—
 * escriba un test con la forma que `pruebaDeExamenMarkdown` sabe leer:
 * preguntas numeradas, opciones con letra y la correcta marcada con un
 * asterisco al final. Hermano de `generarPromptRubrica`.
 *
 * El área, el curso y los criterios los sabe ya la app: se meten solos, que
 * es lo que convierte una batería genérica en una de SU unidad.
 */
export function generarPromptTest(params: {
  asignatura: string
  nivel: string
  /** De qué va el examen: la unidad, el tema, el texto del que salen las preguntas. */
  contexto: string
  nPreguntas: number
  nOpciones: number
  /** Criterios que evalúa el instrumento, para que cada pregunta nombre el suyo. */
  criterios?: { id: string; descripcion: string }[]
}): string {
  const n = Math.max(1, Math.min(60, Math.round(params.nPreguntas)))
  const k = Math.max(2, Math.min(5, Math.round(params.nOpciones)))
  const letras = ['a', 'b', 'c', 'd', 'e'].slice(0, k)
  const conCriterios = (params.criterios?.length ?? 0) > 0
  const ejemploOpciones = letras.map((l, i) => `${l}) [opción${i === 1 ? ' correcta' : ''}]${i === 1 ? ' *' : ''}`).join('\n')
  return `Eres docente experto en ${params.asignatura} en España (LOMLOE). Escribe un test de ${n} preguntas de opción múltiple para alumnado de ${params.nivel}.

**Tema o unidad**: ${params.contexto}
${conCriterios ? `
**Criterios de evaluación que debe cubrir** (reparte las preguntas entre ellos y escribe bajo cada pregunta cuál evalúa):
${params.criterios!.map(c => `- ${c.id}: ${c.descripcion}`).join('\n')}
` : ''}
Reglas:
- Cada pregunta tiene exactamente ${k} opciones (${letras.join(', ')}) y UNA sola correcta.
- Marca la correcta con un asterisco al final de su línea, como en el ejemplo. No la expliques.
- Opciones del mismo tamaño y plausibles; la correcta no siempre en la misma letra.
- Lenguaje claro para la edad; nada de «todas las anteriores» ni «ninguna de las anteriores».
- Responde ÚNICAMENTE con el examen en este formato, sin texto antes ni después:

# [Título del examen]

1. [Enunciado de la pregunta 1]${conCriterios ? '\n   Criterio: [id del criterio]' : ''}
${ejemploOpciones.split('\n').map(l => `   ${l}`).join('\n')}

2. [Enunciado de la pregunta 2]${conCriterios ? '\n   Criterio: [id del criterio]' : ''}
${letras.map((l, i) => `   ${l}) [opción${i === 0 ? ' correcta' : ''}]${i === 0 ? ' *' : ''}`).join('\n')}`
}
