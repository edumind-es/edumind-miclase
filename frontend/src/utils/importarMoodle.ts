/**
 * Leer el CSV que exporta el libro de calificaciones de Moodle (Edixgal,
 * eva.edu.xunta.gal) para pasar sus columnas a instrumentos del Calificador.
 *
 * Moodle exporta una fila por alumno con nombre y apellidos en columnas
 * separadas, unas cuantas de datos (número de ID, institución, correo…) y
 * después una columna por ítem calificable —«Tarefa:Exame UD1 (Real)»—, el
 * total del curso y la fecha de descarga. El informe de un cuestionario es
 * parecido pero lleva el máximo en la cabecera —«Cualificación/10,00»,
 * «P. 1 /0,24»— y columnas de estado y tiempos. Aquí solo se interpreta el texto:
 * qué columnas son notas, a qué alumno de la clase corresponde cada fila y
 * cuánto vale cada casilla. Elegir a qué instrumento va cada columna y
 * guardar es cosa de la pantalla.
 *
 * El casado por nombre es el mismo que el de «Pegar columna» (`casaNombre`):
 * dos palabras o más, y lo que no casa se señala, nunca se adivina.
 *
 * Puro, sin dependencias: se prueba con un fixture en pruebas/fixtures/.
 */
import { casaNombre, leerNota, type Alumno } from './pegarNotas'

export type ColumnaMoodle = {
  /** Posición en el CSV. */
  indice: number
  /** Cabecera tal cual viene: «Tarefa:Exame UD1 (Real)». */
  etiqueta: string
  /** Nombre limpio del ítem: «Exame UD1». */
  titulo: string
  /** Tipo de actividad si lo trae («Tarefa», «Cuestionario»…). */
  actividad: string | null
  /** Formato de la nota si lo trae («Real», «Porcentaxe», «Letra»…). */
  formato: string | null
  /** Máximo que declara la cabecera («Cualificación/10,00» → 10), si lo hay. */
  maximo: number | null
  /** Sin máximo declarado, había valores por encima de 10: se toman como escala 0-100. */
  escala100: boolean
  /**
   * Columna por pregunta de un cuestionario: la puntuación («P. 1 /0,24») o,
   * en el informe de respuestas, el texto («Resposta 1», «Resposta correcta 1»).
   * Se pliegan en pantalla: lo que se importa es la nota.
   */
  pregunta: boolean
  /** Cuántas filas traen nota en esta columna. */
  conNota: number
  /** Ninguna celda se ha podido leer como número (letras, vacía…). */
  sinNumeros: boolean
}

export type FilaMoodle = {
  /** Número de fila en el CSV (la cabecera es la 1). */
  fila: number
  nombre: string
  apellidos: string
  /** Alumno de la clase al que corresponde, o null si no se ha podido. */
  alumno: Alumno | null
  /** Por qué no hay alumno, en palabras. */
  aviso: string | null
  /** Valores crudos (ya como número, sin escalar) por columna de `columnas`. */
  valores: (number | null)[]
}

export type LecturaMoodle = {
  columnas: ColumnaMoodle[]
  filas: FilaMoodle[]
  /** Alumnos de la clase que no aparecen en el CSV. */
  sinFila: Alumno[]
  /** Separador detectado, para decirlo en pantalla. */
  separador: ',' | ';' | '\t'
  /** Problemas que impiden o condicionan la lectura, en palabras. */
  avisos: string[]
}

const clave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Cabeceras de nombre y apellidos en gallego, castellano e inglés. */
const CABECERAS_NOMBRE = ['nome', 'nombre', 'first name', 'firstname']
const CABECERAS_APELLIDOS = ['apelidos', 'apelido', 'apellidos', 'apellido s', 'apellido', 'surname', 'last name', 'lastname']
/** Columnas de datos que Moodle exporta y que no son notas. */
const CABECERAS_DATOS = [
  'numero de id', 'id number', 'institucion', 'institution', 'departamento', 'department',
  'enderezo de correo', 'direccion de correo', 'correo electronico', 'email address', 'email',
  'nome de usuario', 'nombre de usuario', 'username', 'grupos', 'groups',
  // Informe de cuestionario
  'centro educativo', 'estado', 'state', 'arrancado o', 'comenzado el', 'started on',
  'completado', 'finalizado', 'completed', 'tempo levado', 'tiempo requerido', 'time taken',
]
/** Columnas por pregunta: puntuación («P. 1») o respuesta («Resposta 1», «Resposta correcta 1», «Right answer 1»). */
const PATRON_PREGUNTA = /^(p \d+|(resposta|respuesta|response|resposta correcta|respuesta correcta|right answer) \d+)$/
/** Fila de resumen que el informe de cuestionario añade al final. */
const PATRON_FILA_RESUMEN = /^(media xeral|media general|overall average)$/
/** Totales y fecha de descarga: tampoco son ítems. */
const PATRON_NO_ITEM = /^(total d[oe]l? curso|course total|ultima descarga|last downloaded)/

/**
 * Separa un CSV en celdas respetando comillas («"a, b"», «""» como comilla
 * literal) y saltos de línea dentro de una celda. Detecta el separador por la
 * primera línea: el que más veces aparece fuera de comillas.
 */
export function parsearCSV(texto: string): { filas: string[][]; separador: ',' | ';' | '\t' } {
  const limpio = texto.replace(/^﻿/, '')
  const primera = limpio.split(/\r?\n/)[0] ?? ''
  const cuenta = (sep: string) => {
    let n = 0, dentro = false
    for (const ch of primera) {
      if (ch === '"') dentro = !dentro
      else if (ch === sep && !dentro) n++
    }
    return n
  }
  const candidatos: Array<',' | ';' | '\t'> = [',', ';', '\t']
  const separador = candidatos.reduce((mejor, s) => cuenta(s) > cuenta(mejor) ? s : mejor, ',')

  const filas: string[][] = []
  let fila: string[] = [], celda = '', dentro = false
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]
    if (dentro) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') { celda += '"'; i++ } else dentro = false
      } else celda += ch
    } else if (ch === '"') {
      dentro = true
    } else if (ch === separador) {
      fila.push(celda); celda = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++
      fila.push(celda); filas.push(fila); fila = []; celda = ''
    } else celda += ch
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila) }
  return { filas: filas.filter(f => f.some(c => c.trim() !== '')), separador }
}

/**
 * «Tarefa:Exame UD1 (Real)» → actividad «Tarefa», título «Exame UD1», formato «Real».
 * «Cualificación/10,00» → título «Cualificación», máximo 10. «P. 1 /0,24» → pregunta.
 */
export function descomponerCabecera(etiqueta: string): { actividad: string | null; titulo: string; formato: string | null; maximo: number | null; pregunta: boolean } {
  let resto = etiqueta.trim()
  let formato: string | null = null
  const m = resto.match(/\s*\(([^()]*)\)\s*$/)
  if (m) { formato = m[1].trim(); resto = resto.slice(0, m.index).trim() }
  let maximo: number | null = null
  const mx = resto.match(/\s*\/\s*(\d+(?:[.,]\d+)?)\s*$/)
  if (mx) { maximo = leerNota(mx[1]); resto = resto.slice(0, mx.index).trim() }
  if (maximo != null && maximo <= 0) maximo = null
  let actividad: string | null = null
  const dos = resto.indexOf(':')
  if (dos > 0 && dos < 30) { actividad = resto.slice(0, dos).trim(); resto = resto.slice(dos + 1).trim() }
  const titulo = resto || etiqueta.trim()
  return { actividad, titulo, formato, maximo, pregunta: PATRON_PREGUNTA.test(clave(titulo)) }
}

/**
 * Un alumno de Moodle casa con uno de la clase si todas las palabras de uno
 * están en el otro, en cualquiera de las dos direcciones: Moodle puede traer
 * un segundo nombre que la lista de clase no tiene, o al revés.
 */
function casa(nombre: string, apellidos: string, a: Alumno): boolean {
  const deMoodle = `${apellidos} ${nombre}`
  return casaNombre(deMoodle, a) || casaNombre(`${a.apellidos} ${a.nombre}`, { id: -1, nombre, apellidos })
}

/** Interpreta el CSV de Moodle frente a la lista de la clase. */
export function leerCSVMoodle(texto: string, alumnos: Alumno[]): LecturaMoodle {
  const { filas: crudas, separador } = parsearCSV(texto)
  const avisos: string[] = []
  if (crudas.length < 2) {
    return { columnas: [], filas: [], sinFila: alumnos, separador, avisos: ['El fichero no tiene filas de alumnos: ¿es el CSV exportado desde «Calificacións → Exportar» de Edixgal?'] }
  }
  const cabecera = crudas[0].map(c => c.trim())
  const claves = cabecera.map(clave)
  const idxNombre = claves.findIndex(k => CABECERAS_NOMBRE.includes(k))
  const idxApellidos = claves.findIndex(k => CABECERAS_APELLIDOS.includes(k))
  if (idxNombre < 0 || idxApellidos < 0) {
    return { columnas: [], filas: [], sinFila: alumnos, separador,
      avisos: [`No se reconocen las columnas de nombre y apellidos. Cabeceras leídas: ${cabecera.filter(Boolean).join(' · ')}`] }
  }

  // Columnas de notas: todo lo que no es nombre, dato de alumno, total ni fecha.
  const indicesNota = cabecera
    .map((_, i) => i)
    .filter(i => i !== idxNombre && i !== idxApellidos && cabecera[i] !== ''
      && !CABECERAS_DATOS.includes(claves[i]) && !PATRON_NO_ITEM.test(claves[i]))

  // El informe de cuestionario cierra con una fila «Media xeral»: no es nadie.
  const cuerpo = crudas.slice(1).filter(f => !PATRON_FILA_RESUMEN.test(clave(`${f[idxNombre] ?? ''} ${f[idxApellidos] ?? ''}`)))
  const valoresPorColumna = indicesNota.map(i => cuerpo.map(f => leerNota(f[i] ?? '')))
  const columnas: ColumnaMoodle[] = indicesNota.map((indice, k) => {
    const valores = valoresPorColumna[k]
    const numeros = valores.filter((v): v is number => v != null)
    const cab = descomponerCabecera(cabecera[indice])
    // Con máximo declarado no hay que adivinar la escala.
    const escala100 = cab.maximo == null && numeros.some(v => v > 10) && numeros.every(v => v <= 100)
    return { indice, etiqueta: cabecera[indice], ...cab, escala100, conNota: numeros.length, sinNumeros: numeros.length === 0 }
  })
  if (columnas.length === 0) avisos.push('El CSV no trae ninguna columna de notas.')

  const usados = new Map<number, number>()   // alumno de clase → fila que lo reclamó
  const filas: FilaMoodle[] = cuerpo.map((f, n) => {
    const nombre = (f[idxNombre] ?? '').trim(), apellidos = (f[idxApellidos] ?? '').trim()
    const valores = indicesNota.map((_, k) => valoresPorColumna[k][n])
    const base = { fila: n + 2, nombre, apellidos, valores }
    if (!nombre && !apellidos) return { ...base, alumno: null, aviso: 'Fila sin nombre' }
    const candidatos = alumnos.filter(a => casa(nombre, apellidos, a))
    if (candidatos.length === 1) {
      const a = candidatos[0]
      if (usados.has(a.id)) return { ...base, alumno: null, aviso: `Ya asignado a la fila ${usados.get(a.id)}: ${a.apellidos}, ${a.nombre}` }
      usados.set(a.id, n + 2)
      return { ...base, alumno: a, aviso: null }
    }
    return { ...base, alumno: null,
      aviso: candidatos.length > 1 ? `Varios alumnos encajan: ${candidatos.map(a => a.apellidos).join(', ')}` : 'Ningún alumno de la clase se llama así' }
  })
  const sinFila = alumnos.filter(a => !usados.has(a.id))
  return { columnas, filas, sinFila, separador, avisos }
}

export type NotaImportada = { alumno: Alumno; valor: number }

/**
 * Las notas de una columna ya en 0-10 (por el máximo de la cabecera si lo
 * declara; si no, dividiendo entre 10 cuando la columna va en 0-100), solo
 * de las filas con alumno y con nota.
 */
export function notasDeColumna(lectura: LecturaMoodle, columna: ColumnaMoodle): NotaImportada[] {
  const k = lectura.columnas.indexOf(columna)
  if (k < 0) return []
  const aDiez = (v: number) => columna.maximo != null ? v * 10 / columna.maximo : columna.escala100 ? v / 10 : v
  const normalizar = (v: number) => Math.round(Math.max(0, Math.min(10, aDiez(v))) * 10) / 10
  return lectura.filas.flatMap(f => {
    const v = f.valores[k]
    return f.alumno && v != null ? [{ alumno: f.alumno, valor: normalizar(v) }] : []
  })
}

/**
 * Propone un instrumento para una columna por el nombre: el que coincide
 * entero con el título del ítem, o al que el título contiene (o contiene al
 * título). Si varios encajan, ninguno: la elección es del docente.
 */
export function sugerirInstrumento<T extends { nombre: string }>(columna: ColumnaMoodle, instrumentos: T[]): T | null {
  const t = clave(columna.titulo)
  if (!t) return null
  const exactos = instrumentos.filter(i => clave(i.nombre) === t)
  if (exactos.length === 1) return exactos[0]
  const parciales = instrumentos.filter(i => { const n = clave(i.nombre); return n.length > 2 && (t.includes(n) || n.includes(t)) })
  return parciales.length === 1 ? parciales[0] : null
}
