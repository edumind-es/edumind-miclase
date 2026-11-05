/**
 * Nombre largo de cada comunidad, por el valor que escribe su JSON en
 * `meta.comunidad`. Las comunidades disponibles salen del índice del
 * currículo (`comunidades()`), no de aquí: una comunidad nueva aparece sola
 * con su valor en crudo, y una línea aquí le pone el nombre bonito.
 */
const NOMBRES: Record<string, string> = {
  Galicia: 'Galicia',
  MADRID: 'Comunidad de Madrid',
  Aragon: 'Aragón',
  Canarias: 'Canarias',
  CyL: 'Castilla y León',
  CLM: 'Castilla-La Mancha',
  Valencia: 'Comunitat Valenciana',
  Asturias: 'Principado de Asturias',
  Extremadura: 'Extremadura',
  Murcia: 'Región de Murcia',
}

export function nombreDeComunidad(valor: string): string {
  return NOMBRES[valor] ?? valor
}

/**
 * Las comunidades ordenadas por su nombre largo, con la elegida siempre
 * dentro. Sin índice (vacío), las conocidas de aquí: mejor un selector de
 * siempre que uno con una sola opción.
 */
export function opcionesDeComunidad(disponibles: string[], elegida?: string): { value: string; label: string }[] {
  const valores = new Set(disponibles.length ? disponibles : Object.keys(NOMBRES))
  if (elegida) valores.add(elegida)
  return [...valores]
    .map(value => ({ value, label: nombreDeComunidad(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
}
