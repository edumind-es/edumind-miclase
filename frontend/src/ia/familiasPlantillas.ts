/**
 * Plantillas de lo que un docente hace DENTRO de una familia de instrumentos.
 *
 * PROENS trae «Táboa de indicadores» o «Proba escrita»; lo que de verdad se
 * hace es speaking, listening, el examen de cada unidad, el billete de salida.
 * Aquí viven las propuestas por área y la asignación aproximada de criterios
 * por palabras del enunciado. Es puro: se prueba sin pantalla.
 *
 * La regla de la casa vale también aquí: mejor callar que acertar con aplomo.
 * Una plantilla cuyas palabras no aparecen en ningún criterio de la familia
 * no sugiere nada, y el docente decide marcando a mano.
 */

export type PlantillaHijo = {
  /** Nombre propuesto, editable antes de crear. */
  nombre: string
  /** Tipo de MiClase (`instrumentosConfig.ts`). */
  tipo: string
  /** Expresiones que delatan un criterio de este hijo. Vacío = todos los de la familia. */
  claves: RegExp[]
  /** Un hijo por unidad («Examen · <unidad>»), no uno general. */
  porUnidad?: boolean
  ayuda: string
}

const LENGUA_EXTRANJERA = /ingl[eé]s|franc[eé]s|portugu[eé]s|alem[aá]n|italiano|lingua estranxeira|lengua extranjera|primeira lingua|segunda lingua|english|fran[cç]ais/i

export function esLenguaExtranjera(nombreArea: string): boolean {
  return LENGUA_EXTRANJERA.test(nombreArea)
}

/** Las cinco destrezas, como las organiza cualquier docente de idioma. */
export const DESTREZAS: PlantillaHijo[] = [
  { nombre: 'Listening', tipo: 'observacion',
    claves: [/comprensi[oó]n.{0,40}oral/i, /textos? orais|textos? orales|textos? oraux/i, /escoit|escuch|listen/i, /audiovisua/i, /mensaxes? orais/i],
    ayuda: 'Comprensión oral: entender lo que se escucha' },
  { nombre: 'Speaking', tipo: 'oral',
    claves: [/producci[oó]n.{0,40}oral/i, /expresi[oó]n.{0,40}oral/i, /\boral(mente)?\b/i, /pronunci/i, /conversa/i, /\bspeak/i],
    ayuda: 'Producción oral: hablar, exponer, pronunciar' },
  { nombre: 'Reading', tipo: 'observacion',
    claves: [/comprensi[oó]n.{0,40}(escrit|lector|lectur)/i, /\bl[ee]r\b|lectura|\bread/i, /textos? escritos?.{0,30}(comprend|entend)/i],
    ayuda: 'Comprensión escrita: entender lo que se lee' },
  { nombre: 'Writing', tipo: 'portfolio',
    claves: [/producci[oó]n.{0,40}escrit/i, /expresi[oó]n.{0,40}escrit/i, /escrib|redact|\bwrit/i, /textos? escritos?.{0,30}(produc|elabor|crear)/i],
    ayuda: 'Producción escrita: redactar textos' },
  { nombre: 'Interacción y mediación', tipo: 'oral',
    claves: [/interac/i, /media(ci[oó]n|r)\b/i, /plurilingü/i, /intercultura/i],
    ayuda: 'Interactuar, mediar entre lenguas, actitud intercultural' },
]

/** Lo que cualquier docente hace, sea el área que sea. */
export const GENERALES: PlantillaHijo[] = [
  { nombre: 'Examen', tipo: 'prueba-escrita', claves: [], porUnidad: true,
    ayuda: 'Un examen por unidad, con los criterios de esa unidad' },
  { nombre: 'Billete de salida', tipo: 'diario', claves: [],
    ayuda: 'Pregunta corta al terminar la sesión; cada día es un registro' },
  { nombre: 'Cuaderno', tipo: 'portfolio', claves: [],
    ayuda: 'Revisión de apuntes y tareas' },
  { nombre: 'Exposición oral', tipo: 'oral', claves: [/\boral/i, /exp[oó]n|exposici/i, /explica|comunica|present/i],
    ayuda: 'Exponer en clase' },
  { nombre: 'Trabajo en equipo', tipo: 'actitud', claves: [/equipo|grupo|coopera|colabor|conxunt|conjunt/i],
    ayuda: 'Cómo trabaja con los demás' },
]

/** Plantillas que encajan con el área, las más probables primero. */
export function plantillasParaArea(nombreArea: string): PlantillaHijo[] {
  return esLenguaExtranjera(nombreArea) ? [...DESTREZAS, ...GENERALES] : GENERALES
}

export type CriterioLite = { id: string; descripcion: string }

/**
 * Qué criterios de la familia le tocan a una plantilla, por sus palabras.
 * Sin claves, todos. Con claves que no casan con ninguno, ninguno: se calla.
 */
export function sugerirCriteriosParaHijo(p: PlantillaHijo, criterios: CriterioLite[]): string[] {
  if (!p.claves.length) return criterios.map(c => c.id)
  return criterios.filter(c => p.claves.some(re => re.test(c.descripcion))).map(c => c.id)
}

/**
 * Criterios de la familia que ninguna de las plantillas elegidas recoge.
 * Se le dicen al docente antes de crear nada: un criterio que no cubre
 * ningún hijo seguiría evaluándose solo con la familia, y mejor saberlo.
 */
export function criteriosSinCubrir(elegidas: PlantillaHijo[], criterios: CriterioLite[]): string[] {
  const cubiertos = new Set(elegidas.flatMap(p => sugerirCriteriosParaHijo(p, criterios)))
  return criterios.map(c => c.id).filter(id => !cubiertos.has(id))
}
