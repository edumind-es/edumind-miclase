/**
 * Qué pestañas no caben. La elegida entra siempre; las demás, por orden,
 * mientras quepan junto al botón «Más». Puro: se prueba sin navegador.
 */
export function pestanasQueNoCaben(anchos: number[], disponible: number, elegida: number, anchoMas: number): number[] {
  if (anchos.reduce((s, a) => s + a, 0) <= disponible) return []
  let libre = disponible - anchoMas - (anchos[elegida] ?? 0)
  const fuera: number[] = []
  anchos.forEach((a, i) => {
    if (i === elegida) return
    if (a <= libre) libre -= a
    else { fuera.push(i); libre = -1 }   // una vez que una no cabe, las siguientes tampoco entran
  })
  return fuera
}
