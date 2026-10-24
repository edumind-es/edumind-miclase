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

/**
 * Prompt para que una IA convierta el examen que el docente ya tiene —sus
 * preguntas, o la planilla de corrección que ya escribió— en la tabla que
 * `pruebaDeFilas` sabe leer: una fila por pregunta con la clave, cómo se
 * reparten los puntos, lo que vale y el criterio. La IA no inventa el examen:
 * ordena lo que el docente le da. Lo que falte (puntos, criterios) lo propone.
 */
export function generarPromptPlanilla(params: {
  asignatura: string
  nivel: string
  /** El examen tal cual, o la planilla que ya tenga: texto pegado. */
  examen: string
  /** Cuánto suma el examen, para repartir los puntos si no vienen. */
  puntosTotales?: number
  /** Criterios que evalúa el instrumento, para que cada pregunta nombre el suyo. */
  criterios?: { id: string; descripcion: string }[]
}): string {
  const total = params.puntosTotales && params.puntosTotales > 0 ? params.puntosTotales : 10
  const conCriterios = (params.criterios?.length ?? 0) > 0
  return `Eres docente experto en ${params.asignatura} en España (LOMLOE), con alumnado de ${params.nivel}. Te paso un examen ya hecho (o su planilla de corrección). Conviértelo en una PLANILLA DE CORRECCIÓN: una fila por pregunta con la respuesta correcta y cómo se reparten sus puntos.

**El examen**:
${params.examen.trim()}
${conCriterios ? `
**Criterios de evaluación del instrumento** (en «Criterio» escribe el id del que evalúa cada pregunta, o déjalo vacío si evalúa todos):
${params.criterios!.map(c => `- ${c.id}: ${c.descripcion}`).join('\n')}
` : ''}
Reglas:
- No inventes preguntas ni cambies su orden: una fila por pregunta del examen, con sus apartados (a, b, c…) dentro de la misma fila.
- «Pregunta»: el enunciado resumido en pocas palabras, para reconocerla al corregir.
- «Clave»: la respuesta correcta, breve. Si la pregunta tiene apartados, sepáralos con « · » («a) Ecuador · b) Greenwich»).
- «Corrección»: cómo se reparten los puntos (completo, parcial, incorrecto), en una frase comprobable («0,25 cada acierto», «completa 0,5 · sin la relación con la realidad 0,25»). Es lo que mira el docente al corregir.
- «Puntos»: lo que vale la pregunta. Si el examen ya trae puntos, respétalos; si no, reparte ${total} puntos entre las preguntas con sentido (coma decimal, p. ej. 0,5).
- «Aspecto»: el bloque o tema de la pregunta en una o dos palabras (opcional).
- Responde ÚNICAMENTE con el título y la tabla, sin texto antes ni después:

# [Título del examen]

| Pregunta | Puntos | Criterio | Aspecto | Clave | Corrección |
|---|---|---|---|---|---|
| 1. [enunciado resumido] | 1 | ${conCriterios ? '[id]' : ''} | [tema] | [respuesta correcta] | [cómo se puntúa] |
| 2. [enunciado resumido] | 0,5 | ${conCriterios ? '[id]' : ''} | [tema] | [respuesta correcta] | [cómo se puntúa] |`
}
