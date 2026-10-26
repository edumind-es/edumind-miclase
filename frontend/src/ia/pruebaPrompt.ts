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
  const crit = conCriterios ? '[id]' : ''
  return `Eres docente experto en ${params.asignatura} en España (LOMLOE), con alumnado de ${params.nivel}. Te paso un examen ya hecho (o su planilla de corrección). Conviértelo en una PLANILLA DE CORRECCIÓN CON RÚBRICA POR PREGUNTA: una fila por pregunta con la respuesta correcta, cómo se reparten sus puntos y, en las preguntas de desarrollo, los niveles que puede alcanzar la respuesta. Es lo que el docente tendrá delante para corregir pulsando un nivel por pregunta.

**El examen**:
${params.examen.trim()}
${conCriterios ? `
**Criterios de evaluación del instrumento** (en «Criterio» escribe el id del que evalúa cada pregunta, o déjalo vacío si evalúa todos):
${params.criterios!.map(c => `- ${c.id}: ${c.descripcion}`).join('\n')}
` : ''}
Reglas:
- No inventes preguntas ni cambies su orden: una fila por pregunta del examen. Una pregunta con apartados de criterios distintos se parte en dos filas (P5.1 a-d y P5.2 e-j), cada una con sus puntos; si todos los apartados son del mismo criterio, van en la misma fila.
- «Ítem»: el número de la pregunta («1», «5 (a-d)»).
- «Pregunta»: el enunciado resumido en pocas palabras, para reconocerla al corregir («P3 Tabla tejido-órgano»).
- «Tipo»: «Respuesta cerrada» (test, V/F, huecos, relacionar) o «Desarrollo» (definir, explicar, dibujar, enumerar).
- «Máximo»: lo que vale la pregunta. Si el examen ya trae puntos, respétalos; si no, reparte ${total} puntos entre las preguntas con sentido (coma decimal, p. ej. 0,5).
- «Clave»: la respuesta correcta, breve. Con apartados, sepáralos con « · » («a) Ecuador · b) Greenwich»). En una enumeración abierta, una lista de respuestas válidas («Cualquiera cuatro: aislamiento, adicción…»).
- «Puntuación»: cómo se reparten los puntos, en una frase comprobable («0,25 por cada acierto», «4 indicadores × 0,25: define por la causa · por la transmisión · medida 1 · medida 2»).
- «Nivel 1» a «Nivel 6»: SOLO en las de desarrollo, de más a menos puntos, cada celda «[puntos] pt · [cómo se reconoce ese nivel]», desde el máximo hasta «0 pt · Nada correcto o sin respuesta». Los puntos de cada nivel salen de la puntuación (cuatro indicadores de 0,25 dan 1 · 0,75 · 0,5 · 0,25 · 0). En una de respuesta cerrada deja los niveles vacíos: los escalones salen solos de la puntuación.
- «Notas»: lo que se admite y lo que no («se admite "sangre" en C», «dos medidas iguales cuentan como una»), y lo que haya que decidir o comprobar antes de corregir («COMPROBAR CON EL LIBRO si distingue síntoma y signo»). Si no hay nada, vacío.
- Responde ÚNICAMENTE con el título y la tabla, sin texto antes ni después:

# [Título del examen]

| Ítem | Pregunta | Criterio | Tipo | Máximo | Clave | Puntuación | Nivel 1 | Nivel 2 | Nivel 3 | Nivel 4 | Nivel 5 | Nivel 6 | Notas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [enunciado resumido] | ${crit} | Desarrollo | 1 | [respuesta esperada] | 4 indicadores × 0,25: … | 1 pt · [todo] | 0,75 pt · [tres de cuatro] | 0,5 pt · [dos] | 0,25 pt · [uno] | 0 pt · Nada correcto o sin respuesta | | [qué se admite] |
| 2 | [enunciado resumido] | ${crit} | Respuesta cerrada | 1 | a) … · b) … · c) … · d) … | 0,25 por cada acierto | | | | | | | |`
}
