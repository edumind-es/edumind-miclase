export interface RubricaNivel {
  nombre: string   // e.g. "Excelente"
  valor: number    // e.g. 4
}

export interface RubricaIndicador {
  nombre: string
  descriptores: Record<string, string>  // nivel.nombre → texto descriptor
}

export interface RubricaParsed {
  titulo: string
  niveles: RubricaNivel[]
  indicadores: RubricaIndicador[]
}

export const NIVELES_DEFAULT: RubricaNivel[] = [
  { nombre: 'Excelente',    valor: 4 },
  { nombre: 'Notable',      valor: 3 },
  { nombre: 'Bien',         valor: 2 },
  { nombre: 'Insuficiente', valor: 1 },
]

// Genera el prompt estructurado para pegar en cualquier IA.
//
// El área, la etapa y el curso los sabe ya la app: se meten aquí solos. Antes
// el docente tenía que escribirlos otra vez dentro del texto libre, y si se le
// olvidaba, la IA devolvía una rúbrica genérica sin nivel educativo.
export function generarPromptRubrica(params: {
  asignatura: string
  nivel: string
  /** Para qué es la rúbrica: el nombre del instrumento («Rúbrica de cuaderno»). */
  objetivo?: string
  contexto: string
  nIndicadores?: number
}): string {
  const n = params.nIndicadores ?? 4
  return `Eres experto en evaluación educativa en España (LOMLOE). Crea una rúbrica holística para evaluar la siguiente situación:

**Área/Asignatura**: ${params.asignatura}
**Nivel educativo**: ${params.nivel}${params.objetivo ? `
**Objetivo de la rúbrica**: ${params.objetivo}` : ''}
**Situación o criterio a evaluar**: ${params.contexto}

Genera una rúbrica con exactamente ${n} indicadores observables y concretos, adaptados al nivel y área indicados.
Redacta los descriptores en términos de lo que el alumnado HACE, no de lo que le falta.
Responde ÚNICAMENTE con la tabla markdown, sin texto adicional antes ni después:

| Indicador | Excelente (4) | Notable (3) | Bien (2) | Insuficiente (1) |
|---|---|---|---|---|
| [indicador 1] | [descriptor concreto] | [descriptor concreto] | [descriptor concreto] | [descriptor concreto] |
| [indicador 2] | [descriptor concreto] | [descriptor concreto] | [descriptor concreto] | [descriptor concreto] |`
}

/**
 * Parte una fila de tabla markdown en sus celdas, **por posición**.
 *
 * Descartar las celdas vacías (que es lo que hacía antes un `filter(Boolean)`)
 * parece inofensivo hasta que la IA deja un descriptor en blanco: a partir de
 * ahí todas las columnas de esa fila se corren una a la izquierda y los
 * descriptores acaban en el nivel equivocado. Una celda vacía es un dato.
 */
function celdasDeFila(linea: string): string[] {
  const partes = linea.split('|').map(c => c.trim())
  // El `|` inicial y el final producen dos extremos vacíos que no son celdas.
  if (partes.length && partes[0] === '') partes.shift()
  if (partes.length && partes[partes.length - 1] === '') partes.pop()
  return partes
}

// Parsea una respuesta markdown (de cualquier IA) → estructura de rúbrica editable
export function parsearRespuestaIA(texto: string): RubricaParsed | null {
  const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // Buscar fila de cabecera (contiene "indicador")
  const idxCab = lineas.findIndex(l => l.startsWith('|') && /indicador/i.test(l))
  if (idxCab === -1) return null

  // Parsear niveles desde la cabecera
  const celdas = celdasDeFila(lineas[idxCab])
  const nivelRx = /^(.+?)\s*\((\d+(?:\.\d+)?)\)$/
  const niveles: RubricaNivel[] = celdas.slice(1)
    .filter(c => c.length > 0)   // aquí sí: una columna sin nombre no es un nivel
    .map(c => {
      const m = c.match(nivelRx)
      return m ? { nombre: m[1].trim(), valor: Number(m[2]) } : { nombre: c, valor: 1 }
    })
  if (niveles.length === 0) return null

  // Saltar separador (---|---|...)
  let idx = idxCab + 1
  if (idx < lineas.length && lineas[idx].includes('---')) idx++

  // Parsear filas de indicadores
  const indicadores: RubricaIndicador[] = []
  while (idx < lineas.length && lineas[idx].startsWith('|')) {
    const cols = celdasDeFila(lineas[idx])
    // Una fila sin nombre de indicador no se puede editar después: se ignora.
    if (cols.length >= 2 && cols[0].length > 0 && !cols[0].includes('---')) {
      const descriptores: Record<string, string> = {}
      niveles.forEach((n, i) => { descriptores[n.nombre] = cols[i + 1] || '' })
      indicadores.push({ nombre: cols[0], descriptores })
    }
    idx++
  }
  if (indicadores.length === 0) return null

  // Extraer título (línea # antes de la tabla, si existe)
  let titulo = 'Rúbrica de evaluación'
  for (let i = idxCab - 1; i >= 0; i--) {
    if (lineas[i].startsWith('#')) {
      titulo = lineas[i].replace(/^#+\s*/, '').trim()
      break
    }
  }

  return { titulo, niveles, indicadores }
}

// Convierte estructura → markdown exportable
export function rubricaToMarkdown(r: RubricaParsed): string {
  const header = ['Indicador', ...r.niveles.map(n => `${n.nombre} (${n.valor})`)].join(' | ')
  const sep = Array(r.niveles.length + 1).fill('---').join(' | ')
  const rows = r.indicadores.map(ind => {
    const cols = [ind.nombre, ...r.niveles.map(n => ind.descriptores[n.nombre] || '')]
    return `| ${cols.join(' | ')} |`
  })
  return `# ${r.titulo}\n\n| ${header} |\n| ${sep} |\n${rows.join('\n')}\n`
}

// Crea una rúbrica vacía con los niveles por defecto
export function rubricaVacia(titulo = 'Nueva rúbrica'): RubricaParsed {
  return {
    titulo,
    niveles: [...NIVELES_DEFAULT],
    indicadores: [
      { nombre: 'Indicador 1', descriptores: Object.fromEntries(NIVELES_DEFAULT.map(n => [n.nombre, ''])) },
      { nombre: 'Indicador 2', descriptores: Object.fromEntries(NIVELES_DEFAULT.map(n => [n.nombre, ''])) },
    ],
  }
}
