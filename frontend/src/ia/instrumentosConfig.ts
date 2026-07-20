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

export function getInstrConfig(tipo: string): TipoInstrumento {
  return TIPOS_INSTRUMENTO.find(t => t.value === tipo) ?? TIPOS_INSTRUMENTO[TIPOS_INSTRUMENTO.length - 1]
}
