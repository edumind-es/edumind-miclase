/**
 * Informe de una prueba corregida: dónde falla la clase y dónde acierta.
 *
 * Después de corregir un examen, la nota de cada alumno ya está puesta;
 * lo que falta es la lectura del grupo: qué preguntas se fallan más, qué
 * criterios salen peor, y —agrupando las preguntas por el aspecto que
 * trabajan o, si no lo traen, por su criterio— qué ASPECTOS fallan. Es lo
 * que un docente mira para decidir qué repasa al día siguiente.
 *
 * Puro: recibe la definición del examen y las respuestas de cada alumno
 * (lo que ya guarda `Calificacion.niveles_rubrica`) y devuelve números y
 * frases. Nada sale del aparato. La lectura es heurística —reglas sobre los
 * porcentajes—, no una IA: cada frase se puede comprobar en la tabla.
 */
import { notaDePrueba, puntosDePregunta, ACIERTO, FALLO, EN_BLANCO, type PruebaDef } from './prueba'

export type RespuestasAlumno = {
  alumno_id: number
  nombre: string
  /** Pregunta → lo anotado (puntos, nivel o ACIERTO/FALLO/EN_BLANCO). */
  respuestas: Record<string, number>
}

export type EstadisticaPregunta = {
  id: string
  /** Posición en el examen, desde 1. */
  numero: number
  enunciado: string
  criterio_id: string | null
  aspecto: string | null
  max: number
  /** Alumnos que tienen el examen corregido (con esta pregunta anotada o no). */
  n: number
  /** Solo test: cuántos aciertan, fallan o dejan en blanco. */
  aciertos: number
  fallos: number
  enBlanco: number
  /** Alumnos corregidos a los que esta pregunta no se les anotó (cuenta como cero). */
  sinAnotar: number
  /** Puntos medios obtenidos sobre `max`. */
  media: number
  /**
   * Índice de acierto 0-100: en un test, % de alumnos que aciertan; en
   * puntos o niveles, % de los puntos posibles que consigue la clase.
   */
  pctAcierto: number
}

export type EstadisticaGrupo = {
  clave: string
  nombre: string
  /** Números de las preguntas que lo componen. */
  preguntas: number[]
  /** Índice de acierto 0-100 ponderado por lo que vale cada pregunta. */
  pctAcierto: number
}

export type NotaCriterio = { criterio_id: string; media: number | null; n: number }

export type InformePrueba = {
  alumnos: number
  notaMedia: number | null
  aprobados: number
  suspensos: number
  /** En el orden del examen. */
  preguntas: EstadisticaPregunta[]
  /** De más fallada a más acertada (desempate: número de pregunta). */
  porDificultad: EstadisticaPregunta[]
  porCriterio: NotaCriterio[]
  /** Solo si alguna pregunta trae aspecto. */
  porAspecto: EstadisticaGrupo[]
  /** Las preguntas agrupadas por criterio (las de «Todos» van juntas). */
  porCriterioGrupo: EstadisticaGrupo[]
  /** Ejes del gráfico radial: los aspectos si los hay; si no, los criterios. */
  ejes: EstadisticaGrupo[]
  ejesPor: 'aspecto' | 'criterio'
  /** La lectura heurística, frase a frase. */
  lectura: string[]
}

const r1 = (n: number) => Math.round(n * 10) / 10
const pct = (parte: number, total: number) => total > 0 ? r1((parte / total) * 100) : 0

/** Los alumnos que tienen algo anotado del examen: los demás no están corregidos. */
function corregidos(def: PruebaDef, alumnos: RespuestasAlumno[]): RespuestasAlumno[] {
  return alumnos.filter(a => def.preguntas.some(p => typeof a.respuestas?.[p.id] === 'number'))
}

function estadisticaDePregunta(def: PruebaDef, i: number, alumnos: RespuestasAlumno[]): EstadisticaPregunta {
  const p = def.preguntas[i]
  let aciertos = 0, fallos = 0, enBlanco = 0, sinAnotar = 0, puntos = 0
  for (const a of alumnos) {
    const r = a.respuestas?.[p.id]
    if (typeof r !== 'number' || !Number.isFinite(r)) { sinAnotar++; continue }
    if (def.tipo === 'test') {
      if (r === ACIERTO || r > 0) aciertos++
      else if (r === FALLO || r < 0) fallos++
      else if (r === EN_BLANCO) enBlanco++
    }
    puntos += Math.max(0, puntosDePregunta(def, p, r))
  }
  const n = alumnos.length
  const media = n > 0 ? Math.round((puntos / n) * 100) / 100 : 0
  const pctAcierto = def.tipo === 'test' ? pct(aciertos, n) : (n > 0 && p.max > 0 ? r1((puntos / (n * p.max)) * 100) : 0)
  return {
    id: p.id, numero: i + 1, enunciado: p.enunciado, criterio_id: p.criterio_id ?? null, aspecto: p.aspecto ?? null,
    max: p.max, n, aciertos, fallos, enBlanco, sinAnotar, media, pctAcierto,
  }
}

/** Agrupa preguntas por una clave; el índice del grupo pondera por lo que vale cada pregunta. */
function agrupar(preguntas: EstadisticaPregunta[], clave: (p: EstadisticaPregunta) => string | null, nombre: (k: string) => string): EstadisticaGrupo[] {
  const grupos = new Map<string, EstadisticaPregunta[]>()
  for (const p of preguntas) {
    const k = clave(p)
    if (k == null) continue
    grupos.set(k, [...(grupos.get(k) ?? []), p])
  }
  return [...grupos.entries()].map(([k, ps]) => {
    const peso = ps.reduce((t, p) => t + p.max, 0)
    const acierto = peso > 0 ? r1(ps.reduce((t, p) => t + p.pctAcierto * p.max, 0) / peso) : 0
    return { clave: k, nombre: nombre(k), preguntas: ps.map(p => p.numero), pctAcierto: acierto }
  })
}

const lista = (ns: number[]) => ns.length === 1 ? `la ${ns[0]}` : `las ${ns.slice(0, -1).join(', ')} y ${ns[ns.length - 1]}`
const plural = (n: number, uno: string, varios: string) => n === 1 ? uno : varios

/**
 * La lectura: frases cortas y comprobables, de lo más importante a lo menos.
 * Las reglas son fijas y están a la vista; no hay nada que adivinar.
 */
function redactar(inf: Omit<InformePrueba, 'lectura'>): string[] {
  const frases: string[] = []
  if (inf.alumnos === 0) return ['Todavía no hay ningún alumno corregido con este examen.']
  const que = inf.ejesPor === 'aspecto' ? 'aspecto' : 'criterio'

  // Lo que peor y lo que mejor sale, por aspecto o criterio.
  const ejes = [...inf.ejes].sort((a, b) => a.pctAcierto - b.pctAcierto)
  if (ejes.length >= 2) {
    const peor = ejes[0], mejor = ejes[ejes.length - 1]
    if (mejor.pctAcierto - peor.pctAcierto < 15) {
      frases.push(peor.pctAcierto === mejor.pctAcierto
        ? `Rendimiento parejo entre ${que}s: todos al ${peor.pctAcierto} % de acierto.`
        : `Rendimiento parejo entre ${que}s: todos entre el ${peor.pctAcierto} % y el ${mejor.pctAcierto} % de acierto.`)
    } else {
      frases.push(`Donde más falla la clase: «${peor.nombre}» (${peor.pctAcierto} % de acierto en ${plural(peor.preguntas.length, 'la pregunta', 'las preguntas')} ${peor.preguntas.join(', ')}).`)
      if (mejor.pctAcierto >= 70) frases.push(`Lo mejor asentado: «${mejor.nombre}» (${mejor.pctAcierto} %).`)
      const flojos = ejes.filter(e => e !== peor && e.pctAcierto < 50)
      if (flojos.length) frases.push(`También por debajo de la mitad: ${flojos.map(e => `«${e.nombre}» (${e.pctAcierto} %)`).join(', ')}.`)
    }
  } else if (ejes.length === 1) {
    frases.push(`Un solo ${que} en el examen, «${ejes[0].nombre}»: ${ejes[0].pctAcierto} % de acierto.`)
  }

  // Preguntas concretas que se atragantan, y las que todos aciertan.
  const dificiles = inf.porDificultad.filter(p => p.pctAcierto < 40).map(p => p.numero)
  if (dificiles.length) frases.push(`${plural(dificiles.length, 'Pregunta fallada', 'Preguntas falladas')} por más de la mitad de la clase: ${lista(dificiles)}. Merecen repaso.`)
  const faciles = inf.preguntas.filter(p => p.pctAcierto >= 90).map(p => p.numero)
  if (faciles.length && faciles.length < inf.preguntas.length) frases.push(`Casi todos aciertan ${lista(faciles)}: ya está aprendido.`)
  if (faciles.length === inf.preguntas.length) frases.push('Casi todos aciertan todas las preguntas: el examen no discrimina; la próxima puede exigir más.')

  // En un test, lo que se deja en blanco dice otra cosa que lo que se falla.
  const enBlanco = inf.preguntas.filter(p => p.n > 0 && p.enBlanco / p.n > 0.3).map(p => p.numero)
  if (enBlanco.length) frases.push(`Más de un tercio deja en blanco ${lista(enBlanco)}: o no dio tiempo, o no se entendió el enunciado.`)

  // El conjunto.
  if (inf.notaMedia != null) {
    const media = inf.notaMedia.toFixed(1).replace('.', ',')
    frases.push(`Nota media ${media}: ${inf.aprobados} de ${inf.alumnos} ${plural(inf.alumnos, 'alumno aprueba', 'alumnos aprueban')}${inf.suspensos ? ` y ${inf.suspensos} ${plural(inf.suspensos, 'suspende', 'suspenden')}` : ''}.`)
  }
  return frases
}

/**
 * El informe entero. `criteriosDestino` son los criterios que el instrumento
 * evalúa según la programación: la nota por criterio sale de `notaDePrueba`,
 * la misma función que puso la nota a cada alumno.
 */
export function informeDePrueba(def: PruebaDef, todos: RespuestasAlumno[], criteriosDestino: string[]): InformePrueba {
  const alumnos = corregidos(def, todos)
  const preguntas = def.preguntas.map((_, i) => estadisticaDePregunta(def, i, alumnos))
  const porDificultad = [...preguntas].sort((a, b) => a.pctAcierto - b.pctAcierto || a.numero - b.numero)

  // Notas: la misma que ve el alumno, y lo que le toca a cada criterio.
  const resultados = alumnos.map(a => notaDePrueba(def, a.respuestas, criteriosDestino))
  const notas = resultados.map(r => r.nota).filter((n): n is number => n != null)
  const notaMedia = notas.length ? Math.round((notas.reduce((t, n) => t + n, 0) / notas.length) * 100) / 100 : null
  const aprobados = notas.filter(n => n >= 5).length
  const porCriterio: NotaCriterio[] = criteriosDestino.map(c => {
    const valores = resultados.map(r => r.porCriterio[c]).filter((n): n is number => typeof n === 'number')
    return { criterio_id: c, media: valores.length ? Math.round((valores.reduce((t, n) => t + n, 0) / valores.length) * 100) / 100 : null, n: valores.length }
  })

  const porAspecto = agrupar(preguntas, p => p.aspecto, k => k)
  const porCriterioGrupo = agrupar(preguntas, p => p.criterio_id ?? '*', k => k === '*' ? 'Todos' : k)
  const ejesPor: InformePrueba['ejesPor'] = porAspecto.length ? 'aspecto' : 'criterio'
  const ejes = ejesPor === 'aspecto' ? porAspecto : porCriterioGrupo

  const base = {
    alumnos: alumnos.length, notaMedia, aprobados, suspensos: notas.length - aprobados,
    preguntas, porDificultad, porCriterio, porAspecto, porCriterioGrupo, ejes, ejesPor,
  }
  return { ...base, lectura: redactar(base) }
}

/**
 * Gráfico radial de los ejes (aspectos o criterios), en SVG puro y sin
 * librerías: un radio por eje con su % de acierto, anillos al 25, 50, 75 y
 * 100, y el polígono de la clase. Con menos de tres ejes no hay polígono que
 * dibujar: se devuelve una barra por eje.
 */
export function radialSVG(ejes: EstadisticaGrupo[], opciones: { lado?: number; tinta?: string; relleno?: string; papel?: string } = {}): string {
  const lado = opciones.lado ?? 320
  const tinta = opciones.tinta ?? '#1c1a16'
  const relleno = opciones.relleno ?? '#3f7d99'
  const papel = opciones.papel ?? '#8a8377'
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const corta = (s: string) => s.length > 16 ? s.slice(0, 15) + '…' : s

  if (ejes.length < 3) {
    const alto = 18 + ejes.length * 26
    const filas = ejes.map((e, i) => {
      const y = 12 + i * 26
      const w = Math.round((e.pctAcierto / 100) * (lado - 120))
      return `<text x="0" y="${y + 11}" font-size="11" fill="${tinta}">${esc(corta(e.nombre))}</text>`
        + `<rect x="110" y="${y}" width="${lado - 120}" height="14" fill="none" stroke="${papel}" stroke-width="1"/>`
        + `<rect x="110" y="${y}" width="${w}" height="14" fill="${relleno}"/>`
        + `<text x="${lado - 2}" y="${y + 11}" font-size="11" text-anchor="end" fill="${tinta}">${e.pctAcierto} %</text>`
    }).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${alto}" width="${lado}" height="${alto}" role="img" aria-label="Acierto por eje">${filas}</svg>`
  }

  const cx = lado / 2, cy = lado / 2, R = lado / 2 - 78
  const punto = (i: number, radio: number) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / ejes.length
    return [cx + radio * Math.cos(ang), cy + radio * Math.sin(ang)]
  }
  const poligono = (radio: number) => ejes.map((_, i) => punto(i, radio).map(v => v.toFixed(1)).join(',')).join(' ')
  const anillos = [25, 50, 75, 100].map(p =>
    `<polygon points="${poligono((R * p) / 100)}" fill="none" stroke="${papel}" stroke-width="${p === 100 ? 1.2 : 0.6}" ${p === 50 ? 'stroke-dasharray="3 3"' : ''}/>`).join('')
  const radios = ejes.map((_, i) => { const [x, y] = punto(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${papel}" stroke-width="0.6"/>` }).join('')
  const datos = ejes.map((e, i) => punto(i, (R * Math.max(0, Math.min(100, e.pctAcierto))) / 100).map(v => v.toFixed(1)).join(',')).join(' ')
  const puntos = ejes.map((e, i) => { const [x, y] = punto(i, (R * e.pctAcierto) / 100); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${relleno}"/>` }).join('')
  const etiquetas = ejes.map((e, i) => {
    const [x, y] = punto(i, R + 14)
    const anchor = Math.abs(x - cx) < 4 ? 'middle' : x < cx ? 'end' : 'start'
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="10" text-anchor="${anchor}" dominant-baseline="middle" fill="${tinta}">${esc(corta(e.nombre))} <tspan font-weight="700">${e.pctAcierto} %</tspan></text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="${lado}" height="${lado}" style="overflow:visible" role="img" aria-label="Acierto por eje">`
    + anillos + radios
    + `<polygon points="${datos}" fill="${relleno}" fill-opacity="0.25" stroke="${relleno}" stroke-width="1.8"/>`
    + puntos + etiquetas + '</svg>'
}
