/**
 * Leer una columna de notas pegada desde una hoja de cálculo.
 *
 * Es la puerta de entrada para quien lleva años con su Excel: copia la
 * columna de notas (sola, o con el nombre al lado) y la pega sobre una
 * columna del calificador. Aquí solo se interpreta el texto; guardar es cosa
 * de la pantalla, que antes enseña la vista previa alumno a alumno.
 *
 * Puro, sin dependencias: se prueba con texto.
 */

export type Alumno = { id: number; nombre: string; apellidos: string }

export type FilaPegada = {
  /** Texto original de la fila, para enseñarlo en la vista previa. */
  texto: string
  /** Nombre que venía en la fila, si venía. */
  nombre: string | null
  /** Nota leída, ya en 0-10, o null si la casilla venía vacía o ilegible. */
  valor: number | null
  /** Alumno al que se asigna, o null si no se ha podido. */
  alumno: Alumno | null
  /** Por qué no hay alumno o nota, en palabras. */
  aviso: string | null
}

export type ResultadoPegado = {
  filas: FilaPegada[]
  /** Las notas venían con nombre y se han casado por él (no por orden). */
  porNombre: boolean
  /** Había valores por encima de 10: se han dividido entre 10 (escala 0-100). */
  escala100: boolean
  /** Alumnos de la clase que no reciben nota. */
  sinNota: Alumno[]
}

const clave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** «7,5» → 7.5; «NP», «—» o vacío → null. Admite «7.50», «8 », «10». */
export function leerNota(texto: string): number | null {
  const t = texto.trim().replace(',', '.').replace(/[^0-9.]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Lo escrito en la fila (dos palabras o más) es parte del nombre del alumno,
 * en cualquier orden: «Bruno Bello» casa con «Bello Souto, Bruno». Una sola
 * palabra no casa nunca: «García» puede ser cualquiera.
 */
function casaNombre(texto: string, a: Alumno): boolean {
  const escritas = clave(texto).split(' ').filter(w => w.length > 1)
  if (escritas.length < 2) return false
  const del = new Set(clave(`${a.apellidos} ${a.nombre}`).split(' ').filter(Boolean))
  return escritas.every(w => del.has(w))
}

/**
 * Interpreta lo pegado. Cada línea es una fila; la última celda numérica es
 * la nota y lo demás, si lo hay, el nombre. Si ninguna fila trae nombre, las
 * notas se asignan por orden de lista (el mismo orden que la matriz, por
 * apellidos). Si alguna trae nombre, se casan por nombre y las que no casan
 * se señalan, nunca se adivinan.
 */
export function interpretarPegado(texto: string, alumnos: Alumno[]): ResultadoPegado {
  const lineas = texto.split(/\r?\n/).map(l => l.replace(/ /g, ' ')).filter(l => l.trim() !== '')
  const crudas = lineas.map(linea => {
    const celdas = linea.split(/\t|;/).map(c => c.trim())
    // La nota es la última celda que parece un número; el nombre, el resto.
    let idxNota = -1
    for (let i = celdas.length - 1; i >= 0; i--) {
      if (/^\s*\d+([.,]\d+)?\s*$/.test(celdas[i])) { idxNota = i; break }
    }
    const valor = idxNota >= 0 ? leerNota(celdas[idxNota]) : null
    const resto = celdas.filter((_, i) => i !== idxNota).join(' ').trim()
    // Una fila que solo es un número no trae nombre; una fila sin número
    // puede ser un nombre con la casilla vacía.
    const nombre = resto && !/^\s*\d+([.,]\d+)?\s*$/.test(resto) ? resto : null
    return { texto: linea, nombre, valor }
  })

  // Cabecera típica («Alumno  Nota»): sin número y sin casar con nadie, se descarta
  const porNombre = crudas.some(c => c.nombre != null && alumnos.some(a => casaNombre(c.nombre!, a)))
  const escala100 = crudas.some(c => c.valor != null && c.valor > 10) && crudas.every(c => c.valor == null || c.valor <= 100)
  const normalizar = (v: number | null) => v == null ? null : Math.round(Math.max(0, Math.min(10, escala100 ? v / 10 : v)) * 10) / 10

  const usados = new Set<number>()
  const filas: FilaPegada[] = []
  if (porNombre) {
    for (const c of crudas) {
      const candidatos = c.nombre ? alumnos.filter(a => casaNombre(c.nombre!, a)) : []
      if (!c.nombre && c.valor == null) continue
      if (candidatos.length === 1 && !usados.has(candidatos[0].id)) {
        usados.add(candidatos[0].id)
        filas.push({ texto: c.texto, nombre: c.nombre, valor: normalizar(c.valor), alumno: candidatos[0],
          aviso: c.valor == null ? 'Sin nota en la hoja: se deja como está' : null })
      } else if (c.nombre && !candidatos.length && c.valor == null) {
        continue   // cabecera o línea decorativa
      } else {
        filas.push({ texto: c.texto, nombre: c.nombre, valor: normalizar(c.valor), alumno: null,
          aviso: !c.nombre ? 'Sin nombre: con la lista por nombre no se asigna por orden'
            : candidatos.length > 1 ? `Varios alumnos encajan: ${candidatos.map(a => a.apellidos).join(', ')}`
            : 'Ningún alumno de la clase se llama así' })
      }
    }
  } else {
    const soloNotas = crudas.filter(c => c.valor != null || c.nombre == null)
    soloNotas.forEach((c, i) => {
      const a = alumnos[i] ?? null
      if (a) usados.add(a.id)
      filas.push({ texto: c.texto, nombre: null, valor: normalizar(c.valor), alumno: a,
        aviso: !a ? 'Sobra: la clase tiene menos alumnos que filas' : c.valor == null ? 'Casilla vacía: se deja como está' : null })
    })
  }
  const sinNota = alumnos.filter(a => !usados.has(a.id) || !filas.some(f => f.alumno?.id === a.id && f.valor != null))
  return { filas, porNombre, escala100, sinNota }
}
