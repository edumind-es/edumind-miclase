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

// Genera el prompt estructurado para pegar en cualquier IA
export function generarPromptRubrica(params: {
  asignatura: string
  nivel: string
  contexto: string
  nIndicadores?: number
}): string {
  const n = params.nIndicadores ?? 4
  return `Eres experto en evaluación educativa en España (LOMLOE). Crea una rúbrica holística para evaluar la siguiente situación:

**Área/Asignatura**: ${params.asignatura}
**Nivel educativo**: ${params.nivel}
**Situación o criterio a evaluar**: ${params.contexto}

Genera una rúbrica con exactamente ${n} indicadores observables y concretos, adaptados al nivel y área indicados.
Responde ÚNICAMENTE con la tabla markdown, sin texto adicional antes ni después:

| Indicador | Excelente (4) | Notable (3) | Bien (2) | Insuficiente (1) |
|---|---|---|---|---|
| [indicador 1] | [descriptor concreto] | [descriptor concreto] | [descriptor concreto] | [descriptor concreto] |
| [indicador 2] | [descriptor concreto] | [descriptor concreto] | [descriptor concreto] | [descriptor concreto] |`
}

// Parsea una respuesta markdown (de cualquier IA) → estructura de rúbrica editable
export function parsearRespuestaIA(texto: string): RubricaParsed | null {
  const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // Buscar fila de cabecera (contiene "indicador")
  const idxCab = lineas.findIndex(l => l.startsWith('|') && /indicador/i.test(l))
  if (idxCab === -1) return null

  // Parsear niveles desde la cabecera
  const celdas = lineas[idxCab].split('|').map(c => c.trim()).filter(Boolean)
  const nivelRx = /^(.+?)\s*\((\d+(?:\.\d+)?)\)$/
  const niveles: RubricaNivel[] = celdas.slice(1).map(c => {
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
    const cols = lineas[idx].split('|').map(c => c.trim()).filter(Boolean)
    if (cols.length >= 2 && !cols[0].includes('---')) {
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
