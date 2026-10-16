/**
 * Lo que enseña «Todo el curso» en la vista por instrumento: las familias
 * del área (instrumentos de primer nivel) con sus hijos dentro, y la media
 * del alumno con cada una en cada trimestre. Puro: trabaja con las tres
 * matrices ya cargadas y se prueba sin pantalla.
 *
 * La familia es lo que pesa en el área, así que es la columna; los hijos
 * (el examen de cada unidad, el billete de salida…) van plegados dentro y
 * se despliegan a petición. La nota de la familia es la virtual que ya
 * funde `getMatrizEvaluacion` (`fundirUnidades` + `fundirHijosEnFamilias`):
 * aquí no se suma nada nuevo, solo se promedia entre los criterios que cubre.
 */
import type { MatrizEvaluacion } from './queries'

export const TRIMESTRES_CURSO = [1, 2, 3]

export type Criterio = { id: string; descripcion: string }

export type HijoCurso = {
  id: number
  nombre: string
  tipo: string
  color: string
  /** Porcentaje dentro de la familia (ya resuelto en la matriz). */
  pct: number | null
  /** trimestre → criterios que evalúa en él */
  criterios: Record<number, Criterio[]>
}

export type FamiliaCurso = {
  id: number
  nombre: string
  tipo: string
  /** Peso en el área. */
  peso: number
  color: string
  /** trimestre → criterios que evalúa (ella o alguno de sus hijos) en él */
  criterios: Record<number, Criterio[]>
  hijos: HijoCurso[]
}

/**
 * Las familias que evalúan algún criterio en algún trimestre, en el orden
 * del gestor, cada una con los criterios que cubre por trimestre y sus hijos.
 */
export function familiasDelCurso(porTrimestre: Record<number, MatrizEvaluacion>, criterios: Criterio[]): FamiliaCurso[] {
  const familias = new Map<number, FamiliaCurso>()
  const anadir = (lista: Record<number, Criterio[]>, t: number, cr: Criterio) => {
    const l = lista[t] ?? (lista[t] = [])
    if (!l.some(c => c.id === cr.id)) l.push(cr)
  }
  for (const t of TRIMESTRES_CURSO) {
    const m = porTrimestre[t]
    if (!m) continue
    for (const cr of criterios) {
      for (const celda of m.porCriterio.get(cr.id) ?? []) {
        const id = celda.familia_id ?? celda.instrumento_id
        const esHijo = celda.familia_id != null
        let f = familias.get(id)
        if (!f) {
          f = {
            id, nombre: celda.familia_nombre ?? celda.nombre, tipo: esHijo ? '' : celda.tipo,
            peso: celda.familia_peso, color: celda.color, criterios: {}, hijos: [],
          }
          familias.set(id, f)
        }
        anadir(f.criterios, t, cr)
        if (!esHijo) { f.tipo = celda.tipo; f.color = celda.color; continue }
        let h = f.hijos.find(x => x.id === celda.instrumento_id)
        if (!h) {
          h = { id: celda.instrumento_id, nombre: celda.nombre, tipo: celda.tipo, color: celda.color, pct: celda.pct_familia, criterios: {} }
          f.hijos.push(h)
        }
        anadir(h.criterios, t, cr)
      }
    }
  }
  // El tipo de una familia que solo aparece por sus hijos: el del gestor.
  const instrumentos = (porTrimestre[1] ?? porTrimestre[2] ?? porTrimestre[3])?.instrumentos ?? []
  const orden = new Map(instrumentos.map((i, k) => [i.id!, k]))
  for (const f of familias.values()) {
    if (!f.tipo) f.tipo = instrumentos.find(i => i.id === f.id)?.tipo ?? f.hijos[0]?.tipo ?? 'otro'
    f.hijos.sort((a, b) => (orden.get(a.id) ?? 999) - (orden.get(b.id) ?? 999))
  }
  return [...familias.values()].sort((a, b) => (orden.get(a.id) ?? 999) - (orden.get(b.id) ?? 999))
}

export type MediaCurso = {
  /** Media simple de las notas del alumno con el instrumento en esos criterios (null = ninguna). */
  valor: number | null
  conNota: number
  total: number
}

/**
 * La casilla «alumno × instrumento × trimestre»: la media de lo que el alumno
 * tiene con ese instrumento en los criterios que evalúa ese trimestre. Es la
 * misma cuenta que la casilla por instrumento de una unidad.
 */
export function mediaEnCriterios(
  m: MatrizEvaluacion | undefined, alumnoId: number, instrumentoId: number, criterios: Criterio[], trimestre: number,
): MediaCurso {
  let suma = 0, conNota = 0
  if (m) {
    for (const cr of criterios) {
      const c = m.calificaciones[`${alumnoId}:${cr.id}:${instrumentoId}:${trimestre}`]
      if (c?.valor != null) { suma += c.valor; conNota++ }
    }
  }
  return { valor: conNota ? Math.round((suma / conNota) * 10) / 10 : null, conNota, total: criterios.length }
}

/** Todos los criterios que una familia o un hijo evalúa en el curso, sin repetir. */
export function criteriosDelCurso(porTrimestre: Record<number, Criterio[]>): Criterio[] {
  const vistos = new Map<string, Criterio>()
  for (const t of TRIMESTRES_CURSO) for (const c of porTrimestre[t] ?? []) if (!vistos.has(c.id)) vistos.set(c.id, c)
  return [...vistos.values()]
}
