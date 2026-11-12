/**
 * Prompt para pedir a una IA —ChatGPT, Claude, Gemini o la local del
 * navegador— una propuesta de planificación semanal que el volcado sabe leer.
 *
 * Lo que sabe la app va solo: la clase, la semana, el horario, las áreas con
 * sus unidades y los criterios que la programación evalúa en ellas, y lo que
 * hay en el calendario. Nunca alumnado. La plantilla de formato no se escribe
 * a mano: es lo que `semanaAMarkdown` exportaría para una sesión de ejemplo,
 * y lo que exporta se vuelve a leer igual (`planificacion-semanal.test.ts`).
 * Así el prompt y el lector no pueden separarse.
 *
 * Con `soloDia`, la petición es de un único día: es lo que cabe en la IA
 * local (Phi-3.5, 1200 tokens); una semana entera no.
 */
import type { SesionPlan } from '@/db/localDb'
import { diaLargo, diasDeSemana, semanaAMarkdown, tituloSemana, type Franja } from '@/planificacion/exportar'

export interface AreaPrompt {
  nombre: string
  unidades: {
    nombre: string
    trimestre: number | null
    criterios: { id: string; descripcion?: string | null }[]
  }[]
}

export interface DatosPromptSemana {
  clase: string
  /** «6º de Primaria». */
  nivel: string
  /** Lunes y viernes de la semana (YYYY-MM-DD). */
  desde: string
  hasta: string
  franjas: Franja[]
  areas: AreaPrompt[]
  /** Lo que ya hay en el calendario esos días: festivos, salidas, evaluaciones. */
  eventos?: { fecha: string; titulo: string }[]
  /** Lo que el docente quiere que tenga en cuenta. Texto libre, sin alumnado. */
  indicaciones?: string
  /** Pedir solo este día (YYYY-MM-DD), con el mismo formato. */
  soloDia?: string | null
}

/**
 * El horario escrito por el docente, una franja por línea («1ª 9:00-9:50»).
 * La línea que no trae dos horas se ignora.
 */
export function franjasDeTexto(texto: string): Franja[] {
  const out: Franja[] = []
  for (const linea of texto.split('\n')) {
    const m = /^(.*?)(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/.exec(linea.trim())
    if (!m) continue
    out.push({
      franja: m[1].trim().replace(/[·:|]+$/, '').trim() || null,
      hora_inicio: `${Number(m[2])}:${m[3]}`,
      hora_fin: `${Number(m[4])}:${m[5]}`,
    })
  }
  return out
}

export const franjasATexto = (franjas: Franja[]) =>
  franjas.map(f => [f.franja, `${f.hora_inicio}-${f.hora_fin}`].filter(Boolean).join(' ')).join('\n')

const corto = (s: string, max = 150) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t }

/** La sesión de ejemplo con la que se enseña el formato: la primera franja, con marcadores entre corchetes. */
function plantilla(d: DatosPromptSemana, dias: string[]): string {
  const f = d.franjas[0] ?? { franja: '1ª', hora_inicio: '9:00', hora_fin: '9:50' }
  const area = d.areas[0]
  const unidad = area?.unidades[0]
  const ejemplo = {
    grupo_id: 0, fecha: dias[0], franja: f.franja, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin,
    area: area?.nombre ?? '[Área]',
    unidad_texto: unidad ? `${/^UD\s*\d/i.test(unidad.nombre) ? '' : 'UD[n] · '}${unidad.nombre}` : 'UD[n] · [título de la unidad]',
    titulo: '[título breve de la sesión]', tipo: 'clase', evaluable: 1,
    objetivo: '[qué se quiere conseguir en esta sesión, en una frase]',
    secuencia_json: JSON.stringify([
      { fase: 'Inicio', minutos: 10, texto: '[activación]' },
      { fase: 'Desarrollo', minutos: 30, texto: '[actividad principal]' },
      { fase: 'Cierre', minutos: 10, texto: '[síntesis o comprobación]' },
    ]),
    recursos: '[materiales]',
    evaluacion: '[qué se observa o se recoge]',
    criterios_json: JSON.stringify((unidad?.criterios ?? []).slice(0, 2).map(c => ({ codigo: c.id, criterio_id: c.id }))),
    generada_ia: true,
  } as unknown as SesionPlan
  return semanaAMarkdown(d.clase, dias[0], dias[dias.length - 1], [ejemplo])
}

export function generarPromptSemana(d: DatosPromptSemana): string {
  const dias = d.soloDia ? [d.soloDia] : diasDeSemana(d.desde, d.hasta)
  const que = d.soloDia ? `el ${diaLargo(d.soloDia).toLowerCase()}` : 'la semana'
  const areas = d.areas.map(a => {
    if (!a.unidades.length) return `- **${a.nombre}** (sin unidades en la programación: propón tú el contenido)`
    const unidades = a.unidades.map(u => {
      const criterios = u.criterios.map(c => `    - ${c.id}${c.descripcion ? `: ${corto(c.descripcion)}` : ''}`).join('\n')
      return `  - ${u.nombre}${u.trimestre ? ` (trimestre ${u.trimestre})` : ''}${criterios ? `\n${criterios}` : ''}`
    }).join('\n')
    return `- **${a.nombre}**\n${unidades}`
  }).join('\n')
  const eventos = (d.eventos ?? []).filter(e => dias.includes(e.fecha))
  const indicaciones = (d.indicaciones ?? '').trim()

  return `Eres docente experto en programación de aula en España (LOMLOE). Prepara una propuesta de planificación de ${que} para ${d.clase} (${d.nivel}).

**${tituloSemana(d.desde, d.hasta)}**${d.soloDia ? `\n**Día que se pide**: ${diaLargo(d.soloDia)}` : ''}

**Horario** (una sesión por franja y día; usa exactamente estas franjas y horas):
${d.franjas.length ? franjasATexto(d.franjas).split('\n').map(l => `- ${l}`).join('\n') : '- [no hay horario: propón franjas de 50 minutos desde las 9:00]'}

**Áreas, unidades de la programación y criterios de evaluación** (usa estos nombres de área y de unidad tal cual, y solo estos códigos de criterio):
${areas || '- [sin áreas]'}
${eventos.length ? `
**Ya en el calendario** (respétalo; no planifiques clase encima):
${eventos.map(e => `- ${diaLargo(e.fecha)}: ${e.titulo}`).join('\n')}
` : ''}${indicaciones ? `
**Indicaciones del docente**: ${indicaciones}
` : ''}
Reglas:
- Reparte las áreas por las franjas de forma realista para la edad y continúa las unidades indicadas.
- Marca con ■ al final de la celda las sesiones en las que se recoge algo evaluable.
- En el detalle, sé concreto y breve: un objetivo, tres fases con sus minutos, recursos y qué se evalúa.
- Tras «Anclaje:» escribe solo códigos de criterio de la lista de esa área.
- No inventes datos del alumnado ni nombres de personas.
- Responde ÚNICAMENTE con el documento en este formato exacto (mismos títulos, mismas negritas, el separador « · » con espacios y el símbolo ■), sin texto antes ni después y sin bloque de código. Repite el bloque de detalle para cada sesión${d.soloDia ? ' del día' : ' de cada día'}:

${plantilla(d, dias)}`
}
