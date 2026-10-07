export interface TipoInstrumento {
  value: string
  label: string
  icon: string
  color: string
  bg: string
}

export const TIPOS_INSTRUMENTO: TipoInstrumento[] = [
  { value: 'prueba-escrita',  label: 'Prueba escrita',          icon: '📝', color: '#1e40af', bg: '#dbeafe' },
  { value: 'rubrica',         label: 'Rúbrica',                 icon: '📊', color: '#166534', bg: '#dcfce7' },
  { value: 'trabajo',         label: 'Trabajo / Proyecto',      icon: '🗂️', color: '#6b21a8', bg: '#f3e8ff' },
  { value: 'observacion',     label: 'Observación directa',     icon: '👁️', color: '#0e7490', bg: '#cffafe' },
  { value: 'oral',            label: 'Expresión oral',          icon: '🗣️', color: '#c2410c', bg: '#ffedd5' },
  { value: 'autoevaluacion',  label: 'Autoevaluación',          icon: '🔄', color: '#92400e', bg: '#fef3c7' },
  { value: 'actitud',         label: 'Actitud y participación', icon: '⭐', color: '#b45309', bg: '#fffbeb' },
  { value: 'diario',          label: 'Diario de aprendizaje',   icon: '📓', color: '#1d4ed8', bg: '#e0f2fe' },
  { value: 'portfolio',       label: 'Portfolio / Dossier',     icon: '📁', color: '#7c3aed', bg: '#ede9fe' },
  { value: 'otro',            label: 'Otro',                    icon: '📌', color: '#374151', bg: '#f3f4f6' },
]

/**
 * Paleta de identidad de los instrumentos: ocho tonos que se distinguen entre
 * sí también con daltonismo (de la paleta de Okabe-Ito). El color del TIPO
 * no servía: tres azules y dos morados, y dos instrumentos del mismo tipo
 * salían idénticos. Aquí cada instrumento tiene el suyo, por orden, salvo que
 * el docente le ponga otro.
 */
export const PALETA_INSTRUMENTOS = [
  '#0072B2', // azul
  '#D55E00', // bermellón
  '#009E73', // verde azulado
  '#CC79A7', // rosa
  '#E69F00', // naranja
  '#7B3FA0', // morado
  '#56B4E9', // celeste
  '#8C564B', // marrón
] as const

/** El color propio del instrumento, o el que le toca por su posición. */
export function colorDeInstrumento(ins: { color?: string | null }, indice: number): string {
  return ins.color && /^#[0-9a-fA-F]{6}$/.test(ins.color) ? ins.color : PALETA_INSTRUMENTOS[((indice % 8) + 8) % 8]
}

/**
 * Abreviatura legible de un instrumento, para cabeceras estrechas: iniciales
 * de las palabras («Táboa de indicadores» → TI, «Billete de salida» → BS) o
 * las tres primeras letras si es una sola («Speaking» → SPE).
 */
export function abreviatura(nombre: string): string {
  const palabras = nombre.split(/[\s·\-–—]+/).filter(w => w && !/^(de|da|do|del|la|el|los|las|y|e|o|a|en|the|of|and|por|con)$/i.test(w))
  if (palabras.length >= 2) return palabras.slice(0, 3).map(w => w[0]).join('').toUpperCase()
  return (palabras[0] ?? nombre).slice(0, 3).toUpperCase()
}

export function getInstrConfig(tipo: string): TipoInstrumento {
  return TIPOS_INSTRUMENTO.find(t => t.value === tipo) ?? TIPOS_INSTRUMENTO[TIPOS_INSTRUMENTO.length - 1]
}
