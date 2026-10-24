/**
 * Editor de una prueba escrita: tipo de examen, preguntas y lo que vale cada una.
 *
 * Hermano del editor de rúbricas. El examen se define una vez —a mano o desde
 * un fichero— y después, al abrir a cada alumno, se anota pregunta a pregunta
 * y la nota sale sola.
 *
 * Un mismo instrumento («Prueba escrita») suele usarse en varias unidades, y
 * cada una tiene su examen: por eso el examen se guarda para una unidad, o
 * como general del instrumento si vale para todas.
 */
import { useEffect, useRef, useState } from 'react'
import {
  getPruebasDeInstrumento, guardarPrueba, eliminarPrueba,
  contarCorregidosDeExamen, recalcularNotasDeExamen, getBancoPruebas, guardarPruebaEnBanco,
  getUnidades, getInstrumentos, criteriosQueEvalua,
  type PruebaGuardada, type PruebaDeBanco,
} from '@/db/queries'
import type { Instrumento, Unidad } from '@/db/localDb'
import {
  pruebaVacia, normalizarPrueba, puntosTotales, criteriosSinDestino, idDePreguntaNueva, preguntasSinClave,
  TIPOS_PRUEBA, ESCALA_POR_DEFECTO, LETRAS, MAX_OPCIONES,
  type PruebaDef, type PreguntaPrueba, type TipoPrueba, type RepartoPrueba,
} from '@/db/prueba'
import {
  importarPrueba, pruebaAXlsx, pruebaAMarkdown, pruebaAJson, PRUEBA_EJEMPLO,
  pruebaDeTexto, examenAMarkdown,
} from '@/ia/pruebaImportar'
import { generarPromptTest, generarPromptPlanilla } from '@/ia/pruebaPrompt'
import { useLocalAI, hasWebGPU } from '@/ia/useLocalAI'
import { TIPO_XLSX } from './AyudaImportarRubrica'
import { descargarFichero } from '@/utils/compartir'
import BancoPruebas from './BancoPruebas'

interface Props {
  instrumentoId: number
  instrumentoNombre: string
  /** Área del instrumento: de ella salen las unidades e instrumentos a los que se puede mover el examen. */
  asignaturaId: number
  /** Unidad desde la que se abre, o null si se abre desde el gestor de instrumentos. */
  unidadId: number | null
  unidadNombre?: string
  /** Criterios que el instrumento evalúa aquí: los que se pueden asignar a las preguntas. */
  criterios: { id: string; descripcion: string }[]
  /** Área y curso, para que el prompt de la IA no sea genérico. */
  asignaturaNombre?: string
  nivel?: string
  onCerrar: () => void
  capa?: string
}

/** Dónde vive el examen: instrumento y unidad (null = general del instrumento). */
type Destino = { instrumentoId: number; unidadId: number | null }
const mismoDestino = (a: Destino, b: Destino) => a.instrumentoId === b.instrumentoId && a.unidadId === b.unidadId

// Por `descargarFichero`, nunca por un `<a download>`: en la app nativa ese
// enlace no hace nada y el examen exportado no saldría.
function descargar(nombre: string, contenido: BlobPart, tipo: string) {
  descargarFichero(nombre, new Blob([contenido], { type: tipo }), tipo, nombre).catch(() => {})
}

const PENALIZACIONES = [
  { valor: 0, texto: 'No resta' },
  { valor: 0.25, texto: 'Resta 1/4 de la pregunta' },
  { valor: 1 / 3, texto: 'Resta 1/3 de la pregunta' },
  { valor: 0.5, texto: 'Resta 1/2 de la pregunta' },
  { valor: 1, texto: 'Resta la pregunta entera' },
]

export default function PruebaEditor({
  instrumentoId, instrumentoNombre, asignaturaId, unidadId, unidadNombre, criterios, asignaturaNombre, nivel, onCerrar, capa = 'var(--z-modal-anidado)',
}: Props) {
  const [cargando, setCargando] = useState(true)
  const [def, setDef] = useState<PruebaDef>(pruebaVacia(instrumentoNombre))
  const [guardadas, setGuardadas] = useState<PruebaGuardada[]>([])
  /** Fila de la que salió lo que hay en pantalla, si salió de alguna, y dónde vive. */
  const [cargadaId, setCargadaId] = useState<number | null>(null)
  const [cargadaEn, setCargadaEn] = useState<Destino>({ instrumentoId, unidadId })
  // Destino del examen: desde donde se abrió, salvo que el docente lo mueva.
  const [destino, setDestino] = useState<Destino>({ instrumentoId, unidadId })
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  /** Criterios del destino elegido cuando no es el de apertura: se leen de la programación. */
  const [criteriosDeDestino, setCriteriosDeDestino] = useState<{ id: string; descripcion: string }[] | null>(null)
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [ayuda, setAyuda] = useState(false)
  // Generador: cuántas preguntas y cuánto suma el examen.
  const [genN, setGenN] = useState(10)
  const [genTotal, setGenTotal] = useState(10)
  const importRef = useRef<HTMLInputElement>(null)
  // Generar el test con IA: contexto, tamaño, y la respuesta pegada o generada aquí.
  const [iaAbierta, setIaAbierta] = useState(false)
  const [iaContexto, setIaContexto] = useState(unidadNombre ?? '')
  const [iaN, setIaN] = useState(10)
  const [iaOpciones, setIaOpciones] = useState(4)
  const [iaRespuesta, setIaRespuesta] = useState('')
  const [iaError, setIaError] = useState('')
  const [promptCopiado, setPromptCopiado] = useState(false)
  const ai = useLocalAI()
  /** Preguntas del test con las opciones desplegadas. */
  const [opcionesAbiertas, setOpcionesAbiertas] = useState<Set<string>>(new Set())
  // La columna «Aspecto» (bloque o tema de cada pregunta, para el informe): a
  // la vista si alguna pregunta lo trae; si no, tras un botón, que no estorbe.
  const [conAspectos, setConAspectos] = useState(false)
  // Las columnas «Clave» y «Corrección» (la planilla de corrección): a la vista
  // si alguna pregunta las trae; si no, tras un botón.
  const [conPlanilla, setConPlanilla] = useState(false)
  const tienePlanilla = (d: PruebaDef) => d.preguntas.some(p => p.clave || p.correccion)
  // El banco de pruebas: los exámenes de todas las clases, para copiar uno aquí.
  const [bancoAbierto, setBancoAbierto] = useState(false)
  const [refrescoBanco, setRefrescoBanco] = useState(0)

  const cerrar = () => {
    if (sucio && !confirm('Tienes cambios sin guardar en este examen. Si sales ahora se pierden.\n\n¿Salir de todos modos?')) return
    onCerrar()
  }

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [onCerrar, sucio])

  // Se abre el examen de la unidad si lo tiene; si no, el general; si no, uno nuevo.
  useEffect(() => {
    getPruebasDeInstrumento(instrumentoId).then(todas => {
      setGuardadas(todas)
      const suya = unidadId != null ? todas.find(p => p.unidad_id === unidadId) : undefined
      const elegida = suya ?? todas.find(p => p.unidad_id == null)
      if (elegida) {
        setDef(elegida.def)
        setConAspectos(elegida.def.preguntas.some(p => p.aspecto))
        setConPlanilla(tienePlanilla(elegida.def))
        setCargadaId(elegida.id)
        setCargadaEn({ instrumentoId, unidadId: elegida.unidad_id })
        setDestino({ instrumentoId, unidadId: elegida.unidad_id })
        setGenN(elegida.def.preguntas.length)
        setGenTotal(puntosTotales(elegida.def))
        setCargando(false)
        return
      }
      // Sin examen aquí todavía: si el banco tiene alguno, elegirlo es lo
      // primero que se ofrece, antes que definir uno de cero.
      getBancoPruebas()
        .then(banco => setBancoAbierto(banco.some(b => b.enBanco || b.instrumentoIds.some(id => id !== instrumentoId))))
        .catch(() => {})
        .finally(() => setCargando(false))
    }).catch((e: unknown) => {
      // Antes se callaba: el editor abría vacío sin decir que el examen guardado no se había podido leer.
      setCargando(false)
      setMsg({ tipo: 'error', texto: `No se ha podido leer el examen guardado: ${e instanceof Error ? e.message : String(e)}. Lo que guardes ahora lo sustituirá.` })
    })
  }, [instrumentoId, unidadId])

  // Unidades e instrumentos de prueba escrita del área: adonde se puede mover el examen.
  useEffect(() => {
    getUnidades(asignaturaId).then(setUnidades).catch(() => {})
    getInstrumentos(asignaturaId).then(l => setInstrumentos(l.filter(i => i.tipo === 'prueba-escrita'))).catch(() => {})
  }, [asignaturaId])

  // Con otro destino, los criterios que se pueden asignar a las preguntas son
  // los que ESE instrumento evalúa en ESA unidad, no los de apertura.
  const abiertoEn: Destino = { instrumentoId, unidadId }
  useEffect(() => {
    if (mismoDestino(destino, abiertoEn)) { setCriteriosDeDestino(null); return }
    let vigente = true
    const descripciones = new Map(criterios.map(c => [c.id, c.descripcion]))
    criteriosQueEvalua(destino.instrumentoId, destino.unidadId)
      .then(ids => { if (vigente) setCriteriosDeDestino(ids.map(id => ({ id, descripcion: descripciones.get(id) ?? '' }))) })
      .catch(() => {})
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino.instrumentoId, destino.unidadId, instrumentoId, unidadId])
  const criteriosActivos = criteriosDeDestino ?? criterios
  const instrumentoDestino = instrumentos.find(i => i.id === destino.instrumentoId)
  const nombreInstrumento = instrumentoDestino?.nombre ?? instrumentoNombre
  const unidadDestinoObj = destino.unidadId != null ? unidades.find(u => u.id === destino.unidadId) : undefined
  const nombreUnidad = unidadDestinoObj?.nombre ?? (destino.unidadId === unidadId ? unidadNombre : undefined)
  const seMueve = cargadaId != null && !mismoDestino(destino, cargadaEn)

  const editar = (fn: (d: PruebaDef) => PruebaDef) => { setSucio(true); setDef(fn) }

  const setTipo = (tipo: TipoPrueba) => editar(d => ({
    ...d, tipo,
    penalizacion: tipo === 'test' ? d.penalizacion ?? 0 : undefined,
    escala: tipo === 'niveles' ? d.escala?.length ? d.escala : ESCALA_POR_DEFECTO : undefined,
  }))
  const setReparto = (reparto: RepartoPrueba) => editar(d => ({ ...d, reparto }))

  const setPregunta = (i: number, cambios: Partial<PreguntaPrueba>) =>
    editar(d => ({ ...d, preguntas: d.preguntas.map((p, j) => j === i ? { ...p, ...cambios } : p) }))
  const addPregunta = () => editar(d => ({
    ...d, preguntas: [...d.preguntas, { id: idDePreguntaNueva(d.preguntas), enunciado: '', max: 1, criterio_id: null }],
  }))
  const removePregunta = (i: number) => editar(d => ({ ...d, preguntas: d.preguntas.filter((_, j) => j !== i) }))

  /**
   * Deja N preguntas que suman el total. Las que ya había conservan su
   * enunciado, su criterio y su id —y con el id, las respuestas ya anotadas—;
   * solo cambian los puntos.
   */
  const repartir = () => editar(d => {
    const n = Math.max(1, Math.min(200, Math.round(genN) || 1))
    const max = Math.round(((genTotal > 0 ? genTotal : n) / n) * 100) / 100
    const preguntas = d.preguntas.slice(0, n).map(p => ({ ...p, max }))
    while (preguntas.length < n) preguntas.push({ id: idDePreguntaNueva(preguntas), enunciado: '', max, criterio_id: null })
    return { ...d, preguntas }
  })

  const setEscala = (i: number, cambios: Partial<{ nombre: string; valor: number }>) =>
    editar(d => ({ ...d, escala: (d.escala ?? []).map((n, j) => j === i ? { ...n, ...cambios } : n) }))

  // ── Opciones del test ──────────────────────────────────────────────────

  const setOpcion = (i: number, j: number, texto: string) => editar(d => ({
    ...d, preguntas: d.preguntas.map((p, k) => {
      if (k !== i) return p
      const opciones = [...(p.opciones ?? [])]
      while (opciones.length <= j) opciones.push('')
      opciones[j] = texto
      return { ...p, opciones }
    }),
  }))
  const addOpcion = (i: number) => editar(d => ({
    ...d, preguntas: d.preguntas.map((p, k) => k !== i || (p.opciones?.length ?? 0) >= MAX_OPCIONES ? p : { ...p, opciones: [...(p.opciones ?? []), ''] }),
  }))
  const quitarOpcion = (i: number, j: number) => editar(d => ({
    ...d, preguntas: d.preguntas.map((p, k) => {
      if (k !== i) return p
      const opciones = (p.opciones ?? []).filter((_, m) => m !== j)
      const correcta = p.correcta == null ? null : p.correcta === j ? null : p.correcta > j ? p.correcta - 1 : p.correcta
      return { ...p, opciones, correcta }
    }),
  }))
  /** Todas las preguntas del test con N opciones vacías, sin tocar las que ya las tienen. */
  const darOpcionesATodas = (n: number) => editar(d => ({
    ...d, preguntas: d.preguntas.map(p => (p.opciones?.length ?? 0) >= 2 ? p : { ...p, opciones: Array.from({ length: n }, (_, j) => p.opciones?.[j] ?? '') }),
  }))
  const alternarOpciones = (id: string) => setOpcionesAbiertas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // ── Generar con IA ─────────────────────────────────────────────────────

  // Un test se GENERA desde un tema; un examen de puntos o niveles ya existe
  // (el docente lo tiene en papel) y lo que se pide es su planilla de corrección.
  const esTest = def.tipo === 'test'
  const prompt = esTest
    ? generarPromptTest({
      asignatura: asignaturaNombre ?? instrumentoNombre, nivel: nivel ?? 'Educación Primaria',
      contexto: iaContexto, nPreguntas: iaN, nOpciones: iaOpciones,
      criterios: def.reparto === 'criterios' ? criteriosActivos : undefined,
    })
    : generarPromptPlanilla({
      asignatura: asignaturaNombre ?? instrumentoNombre, nivel: nivel ?? 'Educación Primaria',
      examen: iaContexto, puntosTotales: genTotal,
      criterios: def.reparto === 'criterios' ? criteriosActivos : undefined,
    })
  const copiarPrompt = async () => {
    await navigator.clipboard.writeText(prompt)
    setPromptCopiado(true)
    setTimeout(() => setPromptCopiado(false), 2000)
  }
  /** La respuesta de la IA —pegada o generada aquí— pasa a ser el examen en pantalla. */
  const cargarRespuesta = (texto: string) => {
    setIaError('')
    try {
      // La respuesta puede venir como test escrito, como tabla o como JSON: se lee lo que sea.
      const { prueba, avisos } = pruebaDeTexto(texto, def.titulo || instrumentoNombre)
      setDef({ ...prueba, titulo: prueba.titulo || def.titulo, penalizacion: prueba.tipo === 'test' ? def.penalizacion ?? prueba.penalizacion : undefined })
      setSucio(true)
      setGenN(prueba.preguntas.length)
      setGenTotal(puntosTotales(prueba))
      setOpcionesAbiertas(new Set())
      if (tienePlanilla(prueba)) setConPlanilla(true)
      if (prueba.preguntas.some(p => p.aspecto)) setConAspectos(true)
      setMsg({ tipo: 'ok', texto: `${prueba.tipo === 'test' ? 'Test' : 'Examen'} cargado: ${prueba.preguntas.length} preguntas, ${puntosTotales(prueba)} puntos.${avisos.length ? ` Ojo: ${avisos.join(' ')}` : ''} Revísalo y pulsa «Guardar examen».` })
    } catch (e: any) {
      setIaError(e.message || 'No se reconoce el examen en la respuesta.')
    }
  }
  const generarConIA = async () => {
    if (!iaContexto.trim()) { setIaError('Di de qué va el examen: la unidad, el tema o el texto.'); return }
    setIaError('')
    setIaRespuesta('')
    try {
      const respuesta = await ai.generate(prompt, setIaRespuesta)
      if (!respuesta.trim()) { setIaError('Generación detenida: no dio tiempo a escribir nada.'); return }
      cargarRespuesta(respuesta)
    } catch (e: any) {
      setIaError(e.message || 'La IA local no ha podido generar el test.')
    }
  }

  // ── Banco de pruebas ───────────────────────────────────────────────────

  /**
   * Elegir un examen del banco lo COPIA aquí: adaptarlo no toca el original.
   * Las preguntas que nombran un criterio que este instrumento no evalúa
   * quedan en «Todos» (si el examen viene de otra área, ninguno casará).
   */
  const cargarDelBanco = (origen: PruebaDeBanco) => {
    if (sucio && !confirm('Tienes cambios sin guardar en este examen. Si cargas otro encima se pierden.\n\n¿Cargarlo de todos modos?')) return
    const conocidos = new Set(criteriosActivos.map(c => c.id))
    let sueltas = 0
    const preguntas = origen.def.preguntas.map(p => {
      if (!p.criterio_id || !criteriosActivos.length || conocidos.has(p.criterio_id)) return p
      sueltas++
      return { ...p, criterio_id: null }
    })
    const prueba = normalizarPrueba({ ...origen.def, preguntas })
    setDef(prueba)
    if (tienePlanilla(prueba)) setConPlanilla(true)
    setSucio(true)
    setGenN(prueba.preguntas.length)
    setGenTotal(puntosTotales(prueba))
    setOpcionesAbiertas(new Set())
    setBancoAbierto(false)
    setMsg({
      tipo: 'ok',
      texto: `«${prueba.titulo}» copiado de tu banco.`
        + (sueltas ? ` ${sueltas} pregunta${sueltas !== 1 ? 's' : ''} nombraba${sueltas !== 1 ? 'n' : ''} un criterio que «${nombreInstrumento}» no evalúa aquí y queda${sueltas !== 1 ? 'n' : ''} en «Todos».` : '')
        + ' Adáptalo si hace falta y pulsa «Guardar examen».',
    })
  }

  /** Copia aparte en el banco. Los exámenes en uso ya salen en él, pero la copia sobrevive al borrado de la clase. */
  const guardarEnMiBanco = async () => {
    if (def.preguntas.length === 0) { setMsg({ tipo: 'error', texto: 'Añade al menos una pregunta.' }); return }
    try {
      const { yaEstaba } = await guardarPruebaEnBanco(normalizarPrueba(def), { area: asignaturaNombre, nivel })
      setRefrescoBanco(n => n + 1)
      setMsg({
        tipo: 'ok',
        texto: yaEstaba
          ? `«${def.titulo}» ya estaba en tu banco, tal cual.`
          : `«${def.titulo}» guardado en tu banco. Seguirá ahí aunque borres este instrumento o la clase.`,
      })
    } catch {
      setMsg({ tipo: 'error', texto: 'No se pudo guardar en el banco.' })
    }
  }

  // ── Guardar ────────────────────────────────────────────────────────────

  const unidadDestino = destino.unidadId
  const idInstrumentoDestino = destino.instrumentoId

  const guardar = async () => {
    if (def.preguntas.length === 0) { setMsg({ tipo: 'error', texto: 'Añade al menos una pregunta.' }); return }
    // Guardar sobre el examen de otro ámbito lo sustituye: se pregunta.
    const enDestino = idInstrumentoDestino === instrumentoId ? guardadas : await getPruebasDeInstrumento(idInstrumentoDestino)
    const yaHay = enDestino.find(p => p.unidad_id === unidadDestino)
    if (yaHay && yaHay.id !== cargadaId && !confirm(
      `Ya hay un examen ${unidadDestino == null ? `general de «${nombreInstrumento}»` : `de «${nombreInstrumento}» para ${nombreUnidad ? `«${nombreUnidad}»` : 'esa unidad'}`} («${yaHay.def.titulo}»).\n\n¿Sustituirlo por este?`)) return
    // Mover un examen ya corregido: las notas se quedan donde se pusieron.
    if (seMueve) {
      const corregidosOrigen = await contarCorregidosDeExamen(cargadaEn.instrumentoId, cargadaEn.unidadId, def)
      if (corregidosOrigen > 0 && !confirm(
        `Este examen ya está corregido para ${corregidosOrigen} alumno${corregidosOrigen !== 1 ? 's' : ''} donde estaba.\n\nAl moverlo, esas notas se quedan en su instrumento y unidad de origen (no se pierden ni se mueven) y en el nuevo sitio el examen empieza sin corregir.\n\n¿Mover el examen?`)) return
    }
    setGuardando(true)
    try {
      const limpia = normalizarPrueba(def)
      const id = await guardarPrueba(idInstrumentoDestino, unidadDestino, limpia, seMueve ? { mover: cargadaId! } : {})
      setDef(limpia)
      setCargadaId(id)
      const movido = seMueve
      setCargadaEn({ instrumentoId: idInstrumentoDestino, unidadId: unidadDestino })
      setGuardadas(await getPruebasDeInstrumento(instrumentoId))
      setSucio(false)
      // Un examen ya corregido que cambia deja notas que no salen del examen
      // nuevo. Se ofrece recalcularlas; no se hace sin preguntar, porque son
      // notas ya puestas.
      const corregidos = await contarCorregidosDeExamen(idInstrumentoDestino, unidadDestino, limpia)
      let recalculo = ''
      if (corregidos > 0) {
        if (confirm(`Este examen ya está corregido para ${corregidos} alumno${corregidos !== 1 ? 's' : ''}.\n\n¿Recalcular sus notas con el examen tal como queda ahora?\n\nNo se pierde nada: lo anotado en cada pregunta no se toca, y cada nota que cambie deja la anterior a la vista, en gris y sin contar.`)) {
          const hoy = new Date().toLocaleDateString('es-ES')
          const r = await recalcularNotasDeExamen(idInstrumentoDestino, unidadDestino, limpia,
            `Nota de «${limpia.titulo}» antes de cambiar el examen el ${hoy}`)
          recalculo = ` Notas recalculadas para ${r.alumnos} alumno${r.alumnos !== 1 ? 's' : ''}.`
            + (r.fantasmas ? ` ${r.fantasmas} nota${r.fantasmas !== 1 ? 's' : ''} anterior${r.fantasmas !== 1 ? 'es quedan' : ' queda'} a la vista en el calificador, sin contar.` : '')
        } else {
          recalculo = ' Las notas ya puestas se quedan como estaban.'
        }
      }
      const donde = movido ? ` Movido a «${nombreInstrumento}»${unidadDestino == null ? ' (general)' : nombreUnidad ? ` · ${nombreUnidad}` : ''}; las notas ya puestas se quedan donde estaban.` : ''
      setMsg({ tipo: 'ok', texto: `Examen guardado.${donde}${recalculo || ' Al abrir a un alumno lo corregirás pregunta a pregunta.'}` })
    } catch {
      setMsg({ tipo: 'error', texto: 'No se pudo guardar el examen.' })
    } finally { setGuardando(false) }
  }

  const borrar = async () => {
    if (cargadaId == null) return
    if (!confirm('¿Eliminar la definición de este examen?\n\nLas notas ya puestas se conservan, pero dejarán de poder corregirse por preguntas.')) return
    await eliminarPrueba(cargadaId)
    setGuardadas(await getPruebasDeInstrumento(instrumentoId))
    setDef(pruebaVacia(instrumentoNombre))
    setCargadaId(null)
    setSucio(false)
    setMsg({ tipo: 'ok', texto: 'Examen eliminado.' })
  }

  // ── Importar / exportar ────────────────────────────────────────────────

  const importar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (sucio && !confirm('Tienes cambios sin guardar en este examen. Si cargas otro encima se pierden.\n\n¿Cargarlo de todos modos?')) return
    try {
      const { prueba, avisos } = await importarPrueba(file.name, await file.arrayBuffer())
      setDef(prueba)
      if (tienePlanilla(prueba)) setConPlanilla(true)
      setSucio(true)
      setAyuda(false)
      setGenN(prueba.preguntas.length)
      setGenTotal(puntosTotales(prueba))
      setMsg({
        tipo: 'ok',
        texto: `Examen «${prueba.titulo}» importado: ${prueba.preguntas.length} preguntas, ${puntosTotales(prueba)} puntos. `
          + (avisos.length ? `Ojo: ${avisos.join(' ')} ` : '') + 'Revísalo y pulsa «Guardar examen».',
      })
    } catch (err: any) {
      setMsg({ tipo: 'error', texto: `${err.message || 'No se pudo leer el fichero.'} Mira «Cómo importar» para ver la forma que debe tener.` })
    }
  }

  const nombreFichero = (def.titulo || instrumentoNombre).replace(/\s+/g, '-').toLowerCase()
  const total = puntosTotales(def)
  const sinDestino = criteriosActivos.length ? criteriosSinDestino(def, criteriosActivos.map(c => c.id)) : []
  const etiqueta = { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--gris-700)' } as const

  return (
    <div role="dialog" aria-modal="true" aria-label={`Examen de ${instrumentoNombre}`}
      onClick={e => { if (e.target === e.currentTarget) cerrar() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: capa,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto',
      }}>
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 820,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ background: 'var(--azul-700)', color: 'white', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 12, opacity: .8, marginBottom: 2 }}>Prueba escrita</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {nombreInstrumento}{nombreUnidad ? ` · ${nombreUnidad}` : ''}
            </div>
          </div>
          <button onClick={cerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <input ref={importRef} type="file" style={{ display: 'none' }} onChange={importar}
          data-uso="examen" accept=".xlsx,.md,.markdown,.txt,.json" />

        {cargando ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--gris-600)', fontSize: 13 }}>Cargando…</div>
        ) : (<>
          <div style={{ padding: 20, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {msg && (
              <div data-mensaje={msg.tipo} style={{
                marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
                background: msg.tipo === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.tipo === 'ok' ? '#166534' : '#991b1b',
              }}>
                {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
              </div>
            )}

            {ayuda && <AyudaImportarPrueba onCerrar={() => setAyuda(false)} />}

            {bancoAbierto && (
              <BancoPruebas instrumentoId={instrumentoId} refresco={refrescoBanco}
                onElegir={cargarDelBanco} onCerrar={() => setBancoAbierto(false)} />
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta}>Título del examen</label>
              <input value={def.titulo} onChange={e => editar(d => ({ ...d, titulo: e.target.value }))}
                aria-label="Título del examen" style={{ width: '100%', fontSize: 15, fontWeight: 600 }} />
            </div>

            {/* Dónde vive el examen. Cambiarlo y guardar lo MUEVE: misma fila,
                otro instrumento o unidad; las notas ya puestas no se mueven. */}
            <div style={{ marginBottom: 14 }} data-destino-examen>
              <span style={etiqueta}>Este examen es de</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 200px', fontSize: 11.5, color: 'var(--gris-600)' }}>
                  Instrumento
                  <select aria-label="Instrumento del examen" value={destino.instrumentoId}
                    onChange={e => { setDestino(d => ({ ...d, instrumentoId: Number(e.target.value) })); setSucio(true) }}
                    style={{ fontSize: 13 }}>
                    {!instrumentos.some(i => i.id === destino.instrumentoId) && <option value={destino.instrumentoId}>{nombreInstrumento}</option>}
                    {instrumentos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 200px', fontSize: 11.5, color: 'var(--gris-600)' }}>
                  Unidad
                  <select aria-label="Unidad del examen" value={destino.unidadId ?? ''}
                    onChange={e => { setDestino(d => ({ ...d, unidadId: e.target.value === '' ? null : Number(e.target.value) })); setSucio(true) }}
                    style={{ fontSize: 13 }}>
                    <option value="">Todas las unidades que usan «{nombreInstrumento}»</option>
                    {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    {destino.unidadId != null && !unidades.some(u => u.id === destino.unidadId) && <option value={destino.unidadId}>{nombreUnidad ?? 'Esta unidad'}</option>}
                  </select>
                </label>
              </div>
              <div style={{ fontSize: 11.5, color: seMueve ? '#92400e' : 'var(--gris-500)', marginTop: 3 }}>
                {seMueve
                  ? <>Al guardar, el examen se <strong>mueve</strong> ahí. Las notas ya puestas se quedan en su sitio de origen.</>
                  : <>Si cada unidad tiene su examen, déjalo en la suya: las demás tendrán el suyo.</>}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={etiqueta}>Tipo de examen</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                {TIPOS_PRUEBA.map(t => (
                  <label key={t.valor} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', padding: '9px 11px', borderRadius: 9,
                    border: `2px solid ${def.tipo === t.valor ? 'var(--azul-700)' : 'var(--gris-300)'}`,
                    background: def.tipo === t.valor ? 'var(--azul-100)' : 'white',
                  }}>
                    <input type="radio" name="tipo-examen" checked={def.tipo === t.valor} onChange={() => setTipo(t.valor)} style={{ marginTop: 3 }} />
                    <span>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: 'var(--azul-900)' }}>{t.nombre}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--gris-600)', lineHeight: 1.45 }}>{t.explicacion}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {def.tipo === 'test' && (
              <div style={{ marginBottom: 14 }}>
                <label style={etiqueta} htmlFor="penalizacion-examen">Cada fallo</label>
                <select id="penalizacion-examen" value={String(PENALIZACIONES.find(p => Math.abs(p.valor - (def.penalizacion ?? 0)) < 0.01)?.valor ?? def.penalizacion ?? 0)}
                  onChange={e => editar(d => ({ ...d, penalizacion: Number(e.target.value) }))} style={{ fontSize: 13 }}>
                  {PENALIZACIONES.map(p => <option key={p.valor} value={String(p.valor)}>{p.texto}</option>)}
                </select>
                <span style={{ fontSize: 11.5, color: 'var(--gris-500)', marginLeft: 8 }}>En blanco ni suma ni resta.</span>
                {/* Con opciones y correcta en todas, el test se imprime y se corrige por cámara. */}
                {def.preguntas.length > 0 && (() => {
                  const faltan = preguntasSinClave(def)
                  return (
                    <div data-estado-clave={faltan.length ? 'incompleta' : 'completa'}
                      style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
                        background: faltan.length ? '#fffbeb' : '#dcfce7', border: `1px solid ${faltan.length ? '#fde68a' : '#86efac'}`, color: faltan.length ? '#92400e' : '#166534' }}>
                      {faltan.length
                        ? <><strong>{faltan.length} de {def.preguntas.length} pregunta{def.preguntas.length !== 1 ? 's' : ''}</strong> sin opciones o sin la correcta. Con todas completas, el test se podrá imprimir y corregir por cámara.{' '}
                            <button className="btn-secondary" style={{ fontSize: 11.5, marginLeft: 4 }} onClick={() => darOpcionesATodas(4)}>Dar 4 opciones a todas</button></>
                        : <><strong>Test con clave completa:</strong> opciones y correcta en las {def.preguntas.length} preguntas.</>}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Con IA: en un test, generarlo desde un tema; en un examen de puntos o
                niveles, volcar el que el docente ya tiene (o su planilla) como
                planilla de corrección: clave y reparto de puntos por pregunta. La
                IA local del navegador o cualquier otra, copiando el prompt. */}
            {(
              <div data-ia-bloque={esTest ? 'test' : 'planilla'} style={{ marginBottom: 14, border: '1px solid var(--azul-300)', borderRadius: 10, background: iaAbierta ? 'var(--azul-100)' : 'white' }}>
                <button type="button" data-ia-toggle aria-expanded={iaAbierta} onClick={() => setIaAbierta(a => !a)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 14px', fontSize: 13, fontWeight: 700, color: 'var(--azul-900)', cursor: 'pointer' }}>
                  {iaAbierta ? '▾' : '▸'} {esTest ? '🤖 Generar el test con IA' : '🤖 Volcar mi examen como planilla de corrección con IA'}
                  <span style={{ fontWeight: 400, color: 'var(--gris-600)', marginLeft: 8 }}>
                    {esTest
                      ? 'desde la unidad, un tema o un texto; con la IA local o pegando la respuesta de otra'
                      : 'pega el examen que ya tienes y vuelve con la clave y el reparto de puntos de cada pregunta'}
                  </span>
                </button>
                {iaAbierta && (
                  <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: esTest ? '1fr 90px 90px' : '1fr', gap: 10 }}>
                      <div>
                        <label style={etiqueta} htmlFor="ia-contexto">{esTest ? 'De qué va el examen *' : 'Tu examen, tal cual *'}</label>
                        <textarea id="ia-contexto" value={iaContexto} onChange={e => setIaContexto(e.target.value)} rows={esTest ? 3 : 7}
                          style={{ width: '100%', fontSize: 13, resize: 'vertical' }}
                          placeholder={esTest
                            ? 'La unidad, el tema o el texto del que salen las preguntas. Ejemplo: «Os ríos de Galicia: nacemento, afluentes e desembocadura. Texto do libro, páxinas 42-47».'
                            : 'Pega aquí las preguntas del examen que ya has hecho, con sus puntos si los tienen; o la planilla de corrección que ya hayas escrito. La IA no inventa nada: ordena lo tuyo en una fila por pregunta con la respuesta correcta y cómo se reparten los puntos.'} />
                      </div>
                      {esTest && <div>
                        <label style={etiqueta} htmlFor="ia-n">Preguntas</label>
                        <input id="ia-n" type="number" min={1} max={60} value={iaN} onChange={e => setIaN(Number(e.target.value))} style={{ width: '100%', fontSize: 13, textAlign: 'center' }} />
                      </div>}
                      {esTest && <div>
                        <label style={etiqueta} htmlFor="ia-opciones">Opciones</label>
                        <select id="ia-opciones" value={iaOpciones} onChange={e => setIaOpciones(Number(e.target.value))} style={{ width: '100%', fontSize: 13 }}>
                          {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button className="btn-secondary" style={{ fontSize: 12.5 }} onClick={copiarPrompt} disabled={!iaContexto.trim()} data-ia-copiar>
                        {promptCopiado ? '✅ Copiado' : '📋 Copiar prompt'}
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--gris-500)' }}>→ pégalo en ChatGPT, Claude o Gemini y trae aquí la respuesta</span>
                      {hasWebGPU() && (
                        <>
                          <div style={{ flex: 1 }} />
                          {ai.isReady || ai.status === 'generando' ? (
                            ai.status === 'generando'
                              ? <button className="btn-secondary" style={{ fontSize: 12.5 }} onClick={ai.cancelar}>✋ Detener</button>
                              : <button className="btn-primary" style={{ fontSize: 12.5 }} onClick={generarConIA} disabled={!iaContexto.trim()}>⚡ Generar con IA local</button>
                          ) : (
                            <button className="btn-primary" style={{ fontSize: 12.5, background: '#166534' }} onClick={ai.cargarModelo}
                              disabled={ai.status === 'descargando' || ai.status === 'cargando'}>
                              {ai.status === 'descargando' && `⬇ Descargando Phi-3.5 (${ai.progress}%)`}
                              {ai.status === 'cargando' && '⏳ Cargando modelo…'}
                              {ai.status === 'idle' && '⬇ Descargar IA local (Phi-3.5 · ~2GB)'}
                              {ai.status === 'error' && 'Error — reintentar'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <div>
                      <label style={etiqueta} htmlFor="ia-respuesta">La respuesta de la IA</label>
                      <textarea id="ia-respuesta" data-ia-respuesta value={iaRespuesta} onChange={e => setIaRespuesta(e.target.value)} rows={6}
                        style={{ width: '100%', fontSize: 12, fontFamily: 'ui-monospace, monospace', resize: 'vertical' }}
                        placeholder={esTest
                          ? 'Pega aquí el test. Formato:\n\n1. ¿Onde nace o río Miño?\n   a) Na serra de Meira *\n   b) Nos Ancares\n   c) No Courel\n\nLa correcta lleva un asterisco, o va al final en «Respuestas: 1-a, 2-c…».'
                          : 'Pega aquí la tabla que devuelve la IA. Formato:\n\n| Pregunta | Puntos | Criterio | Aspecto | Clave | Corrección |\n|---|---|---|---|---|---|\n| 1. Relaciona cada termo | 1 | CE1.1 | Mapas | 1-d · 2-e · 3-a | 0,2 cada acerto |'} />
                    </div>
                    {iaError && <div style={{ color: '#991b1b', fontSize: 12.5 }}>❌ {iaError}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-primary" style={{ fontSize: 12.5 }} onClick={() => cargarRespuesta(iaRespuesta)} disabled={!iaRespuesta.trim()} data-ia-cargar>
                        📥 Cargar como examen
                      </button>
                      <span style={{ fontSize: 11.5, color: 'var(--gris-500)', alignSelf: 'center' }}>Sustituye las preguntas de abajo. Después, revisa y guarda.{esTest ? '' : ' Al corregir, cada pregunta enseña su clave y su reparto.'}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {def.tipo === 'niveles' && (
              <div style={{ marginBottom: 14 }}>
                <span style={etiqueta}>Escala con la que se valora cada pregunta</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(def.escala ?? []).map((n, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input value={n.nombre} onChange={e => setEscala(i, { nombre: e.target.value })}
                        aria-label={`Nombre del nivel ${i + 1}`} style={{ flex: '1 1 160px', fontSize: 13 }} />
                      <input type="number" min={0} step={0.5} value={n.valor} onChange={e => setEscala(i, { valor: Number(e.target.value) })}
                        aria-label={`Puntos del nivel ${n.nombre}`} style={{ width: 64, fontSize: 13, textAlign: 'center' }} />
                      <span style={{ fontSize: 11.5, color: 'var(--gris-500)' }}>pts</span>
                      {(def.escala ?? []).length > 2 && (
                        <button onClick={() => editar(d => ({ ...d, escala: (d.escala ?? []).filter((_, j) => j !== i) }))}
                          aria-label={`Quitar el nivel ${n.nombre}`}
                          style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button className="btn-secondary" style={{ fontSize: 12, marginTop: 6 }}
                  onClick={() => editar(d => ({ ...d, escala: [...(d.escala ?? []), { nombre: `Nivel ${(d.escala ?? []).length + 1}`, valor: 0 }] }))}>
                  + Añadir nivel
                </button>
                <div style={{ fontSize: 11.5, color: 'var(--gris-500)', marginTop: 4 }}>
                  El nivel con más puntos da la pregunta entera; los demás, su parte proporcional.
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <span style={etiqueta}>La nota del examen</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" name="reparto-examen" checked={def.reparto === 'unica'} onChange={() => setReparto('unica')} style={{ marginTop: 3 }} />
                  <span><strong>Es una sola</strong> y va a todos los criterios que evalúa esta prueba.</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" name="reparto-examen" checked={def.reparto === 'criterios'} onChange={() => setReparto('criterios')} style={{ marginTop: 3 }} />
                  <span><strong>Se reparte por criterios</strong>: cada pregunta dice cuál evalúa y cada criterio recibe la nota de las suyas. Una pregunta de «Todos» cuenta para cada criterio del examen.</span>
                </label>
              </div>
            </div>

            {/* Generador: el punto de partida habitual es «10 preguntas de un punto». */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10, padding: '10px 12px', background: 'var(--gris-50)', borderRadius: 9, border: '1px solid var(--gris-200)' }}>
              <div>
                <label style={etiqueta} htmlFor="gen-n">N.º de preguntas</label>
                <input id="gen-n" type="number" min={1} max={200} value={genN} onChange={e => setGenN(Number(e.target.value))} style={{ width: 80, fontSize: 13, textAlign: 'center' }} />
              </div>
              <div>
                <label style={etiqueta} htmlFor="gen-total">Puntos del examen</label>
                <input id="gen-total" type="number" min={1} step={0.5} value={genTotal} onChange={e => setGenTotal(Number(e.target.value))} style={{ width: 80, fontSize: 13, textAlign: 'center' }} />
              </div>
              <button className="btn-secondary" style={{ fontSize: 12.5 }} onClick={repartir}
                title="Deja ese número de preguntas, todas con los mismos puntos. Las que ya hay conservan su texto y su criterio.">
                ⚖ Repartir a partes iguales
              </button>
              <button className="btn-secondary" style={{ fontSize: 12.5 }} data-aspectos-toggle aria-pressed={conAspectos}
                onClick={() => setConAspectos(v => !v)}
                title="Un aspecto por pregunta («Ríos», «Cálculo»…): el informe de la prueba dirá qué aspectos falla la clase. No cuenta para la nota.">
                🏷 Aspectos
              </button>
              <button className="btn-secondary" style={{ fontSize: 12.5 }} data-planilla-toggle aria-pressed={conPlanilla}
                onClick={() => setConPlanilla(v => !v)}
                title="La planilla de corrección: la respuesta correcta de cada pregunta y cómo se reparten sus puntos. Se enseña al corregir; no cuenta para la nota.">
                🔑 Clave y corrección
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--azul-900)' }}>
                {def.preguntas.length} pregunta{def.preguntas.length !== 1 ? 's' : ''} · suman {total} puntos
              </span>
            </div>

            {/* Los aspectos ya escritos se ofrecen al teclear, para repetirlos igual. */}
            {conAspectos && (
              <datalist id={`aspectos-${instrumentoId}`}>
                {[...new Set(def.preguntas.map(p => p.aspecto).filter((a): a is string => !!a))].map(a => <option key={a} value={a} />)}
              </datalist>
            )}
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--azul-700)', color: 'white' }}>
                    <th style={{ padding: '7px 8px', textAlign: 'center', width: 34 }}>N.º</th>
                    <th style={{ padding: '7px 8px', textAlign: 'left' }}>Pregunta <span style={{ fontWeight: 400, opacity: .8 }}>(opcional: para reconocerla al corregir)</span></th>
                    <th style={{ padding: '7px 8px', textAlign: 'center', width: 84 }}>{def.tipo === 'niveles' ? 'Vale' : 'Puntos'}</th>
                    {def.reparto === 'criterios' && <th style={{ padding: '7px 8px', textAlign: 'left', width: 170 }}>Criterio</th>}
                    {conAspectos && <th style={{ padding: '7px 8px', textAlign: 'left', width: 150 }}>Aspecto</th>}
                    {conPlanilla && <th style={{ padding: '7px 8px', textAlign: 'left', minWidth: 160 }}>Clave <span style={{ fontWeight: 400, opacity: .8 }}>(respuesta correcta)</span></th>}
                    {conPlanilla && <th style={{ padding: '7px 8px', textAlign: 'left', minWidth: 160 }}>Corrección <span style={{ fontWeight: 400, opacity: .8 }}>(cómo se puntúa)</span></th>}
                    <th style={{ width: 30 }} />
                  </tr>
                </thead>
                <tbody>
                  {def.preguntas.map((p, i) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                      <td style={{ padding: 5, textAlign: 'center', color: 'var(--gris-600)', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: 5 }}>
                        <input value={p.enunciado} onChange={e => setPregunta(i, { enunciado: e.target.value })}
                          aria-label={`Enunciado de la pregunta ${i + 1}`} placeholder={`Pregunta ${i + 1}`}
                          style={{ width: '100%', fontSize: 12.5 }} />
                      </td>
                      <td style={{ padding: 5 }}>
                        <input type="number" min={0.05} step={0.25} value={p.max}
                          onChange={e => setPregunta(i, { max: Number(e.target.value) })}
                          aria-label={`Puntos de la pregunta ${i + 1}`}
                          style={{ width: '100%', fontSize: 12.5, fontWeight: 700, textAlign: 'center' }} />
                      </td>
                      {def.reparto === 'criterios' && (
                        <td style={{ padding: 5 }}>
                          {criteriosActivos.length ? (
                            <select value={p.criterio_id ?? ''} onChange={e => setPregunta(i, { criterio_id: e.target.value || null })}
                              aria-label={`Criterio de la pregunta ${i + 1}`} style={{ width: '100%', fontSize: 12 }}>
                              <option value="">Todos</option>
                              {criteriosActivos.map(c => <option key={c.id} value={c.id} title={c.descripcion}>{c.id}</option>)}
                              {p.criterio_id && !criteriosActivos.some(c => c.id === p.criterio_id) && (
                                <option value={p.criterio_id}>{p.criterio_id} (no asignado)</option>
                              )}
                            </select>
                          ) : (
                            <input value={p.criterio_id ?? ''} onChange={e => setPregunta(i, { criterio_id: e.target.value.trim() || null })}
                              aria-label={`Criterio de la pregunta ${i + 1}`} placeholder="CE1.1 (vacío = todos)"
                              style={{ width: '100%', fontSize: 12 }} />
                          )}
                        </td>
                      )}
                      {conAspectos && (
                        <td style={{ padding: 5 }}>
                          <input value={p.aspecto ?? ''} onChange={e => setPregunta(i, { aspecto: e.target.value || null })}
                            aria-label={`Aspecto de la pregunta ${i + 1}`} placeholder="Ríos, cálculo…" list={`aspectos-${instrumentoId}`}
                            style={{ width: '100%', fontSize: 12 }} />
                        </td>
                      )}
                      {conPlanilla && (
                        <td style={{ padding: 5 }}>
                          <textarea value={p.clave ?? ''} onChange={e => setPregunta(i, { clave: e.target.value || null })} rows={2}
                            aria-label={`Clave de la pregunta ${i + 1}`} placeholder="1-d · 2-e · 3-a"
                            style={{ width: '100%', fontSize: 12, resize: 'vertical', lineHeight: 1.35 }} />
                        </td>
                      )}
                      {conPlanilla && (
                        <td style={{ padding: 5 }}>
                          <textarea value={p.correccion ?? ''} onChange={e => setPregunta(i, { correccion: e.target.value || null })} rows={2}
                            aria-label={`Corrección de la pregunta ${i + 1}`} placeholder="0,25 cada acierto · parcial 0,1"
                            style={{ width: '100%', fontSize: 12, resize: 'vertical', lineHeight: 1.35 }} />
                        </td>
                      )}
                      <td style={{ padding: 3, textAlign: 'center' }}>
                        <button onClick={() => removePregunta(i)} title="Eliminar pregunta" aria-label={`Eliminar la pregunta ${i + 1}`}
                          style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                      </td>
                    </tr>
                  )).flatMap((fila, i) => {
                    if (def.tipo !== 'test') return [fila]
                    const p = def.preguntas[i]
                    const opciones = p.opciones ?? []
                    const abierta = opcionesAbiertas.has(p.id) || opciones.length === 0
                    const resumen = opciones.length
                      ? `${opciones.length} opciones · correcta: ${p.correcta != null ? LETRAS[p.correcta] : '—'}`
                      : 'sin opciones'
                    return [fila, (
                      <tr key={`${p.id}-opciones`} data-opciones-de={p.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                        <td />
                        <td colSpan={(def.reparto === 'criterios' ? 4 : 3) + (conAspectos ? 1 : 0) + (conPlanilla ? 2 : 0)} style={{ padding: '0 5px 8px' }}>
                          <button type="button" onClick={() => alternarOpciones(p.id)} aria-expanded={abierta}
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: p.correcta != null ? 'var(--verde-500)' : '#92400e', cursor: 'pointer', fontWeight: 600 }}>
                            {abierta ? '▾' : '▸'} {resumen}
                          </button>
                          {abierta && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                              {opciones.map((o, j) => (
                                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input type="radio" name={`correcta-${p.id}`} checked={p.correcta === j} onChange={() => setPregunta(i, { correcta: j })}
                                    aria-label={`Opción ${LETRAS[j]} de la pregunta ${i + 1} es la correcta`} title="Marcar como correcta" />
                                  <span style={{ fontSize: 12, fontWeight: 800, width: 16, color: p.correcta === j ? 'var(--verde-500)' : 'var(--gris-600)' }}>{LETRAS[j]}</span>
                                  <input value={o} onChange={e => setOpcion(i, j, e.target.value)} aria-label={`Opción ${LETRAS[j]} de la pregunta ${i + 1}`}
                                    placeholder={`Opción ${LETRAS[j]}`} style={{ flex: 1, fontSize: 12 }} />
                                  <button onClick={() => quitarOpcion(i, j)} aria-label={`Quitar la opción ${LETRAS[j]} de la pregunta ${i + 1}`}
                                    style={{ background: 'none', border: 'none', color: 'var(--gris-500)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                                </div>
                              ))}
                              {opciones.length < MAX_OPCIONES && (
                                <button className="btn-secondary" style={{ fontSize: 11, alignSelf: 'flex-start' }} onClick={() => addOpcion(i)}>
                                  + opción{opciones.length === 0 ? ' (marca la correcta con el redondel)' : ''}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )]
                  })}
                </tbody>
              </table>
            </div>

            {sinDestino.length > 0 && (
              <div style={{ padding: '9px 13px', borderRadius: 8, fontSize: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 10 }}>
                <strong>{sinDestino.join(', ')}</strong> {sinDestino.length === 1 ? 'no está asignado' : 'no están asignados'} a «{nombreInstrumento}» en la
                programación{nombreUnidad ? ` de «${nombreUnidad}»` : ''}: sus preguntas no pondrán nota en ningún sitio. Asígnale el instrumento en 📋 Programación o cambia el criterio de esas preguntas.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={addPregunta}>+ Añadir pregunta</button>
              <div style={{ flex: 1 }} />
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setBancoAbierto(v => !v)} aria-expanded={bancoAbierto}
                title="Elegir un examen ya definido en cualquiera de tus clases: se copia aquí">
                📚 Mi banco
              </button>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={guardarEnMiBanco} disabled={def.preguntas.length === 0}
                title="Guardar una copia en tu banco, que no desaparece si borras el instrumento o la clase">
                ⭐ Guardar en mi banco
              </button>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => importRef.current?.click()}
                title="Definir el examen desde una hoja de cálculo (.xlsx), un Markdown (.md) o un JSON (.json)">
                📥 Importar
              </button>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setAyuda(v => !v)} aria-expanded={ayuda}
                title="Qué forma debe tener el fichero, con plantillas para descargar">
                ❓ Cómo importar
              </button>
              <button className="btn-secondary" style={{ fontSize: 12 }} disabled={def.preguntas.length === 0}
                onClick={() => descargar(`examen-${nombreFichero}.xlsx`, pruebaAXlsx(normalizarPrueba(def)), TIPO_XLSX)}
                title="Descargar el examen como hoja de cálculo">
                ⬇ .xlsx
              </button>
              <button className="btn-secondary" style={{ fontSize: 12 }} disabled={def.preguntas.length === 0}
                onClick={() => descargar(`examen-${nombreFichero}.md`, pruebaAMarkdown(normalizarPrueba(def)), 'text/markdown;charset=utf-8')}>
                ⬇ .md
              </button>
              {def.tipo === 'test' && def.preguntas.some(p => p.opciones?.length) && (
                <button className="btn-secondary" style={{ fontSize: 12 }}
                  onClick={() => descargar(`examen-${nombreFichero}-alumnado.md`, examenAMarkdown(normalizarPrueba(def)), 'text/markdown;charset=utf-8')}
                  title="El examen con sus opciones, sin la clave, para el alumnado">
                  ⬇ Para el alumnado
                </button>
              )}
              <button className="btn-secondary" style={{ fontSize: 12 }} disabled={def.preguntas.length === 0}
                onClick={() => descargar(`${nombreFichero}.eduprueba.json`, pruebaAJson(normalizarPrueba(def)), 'application/json')}
                title="Guardar el examen en un fichero para compartirlo con otro docente">
                📤 Compartir
              </button>
            </div>
          </div>

          <div style={{
            flexShrink: 0, borderTop: '1px solid var(--gris-200)', background: 'var(--gris-50)',
            padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 140, fontSize: 12, color: sucio ? '#92400e' : 'var(--gris-500)', fontWeight: sucio ? 700 : 400 }}>
              {sucio ? '● Cambios sin guardar' : cargadaId != null ? '✅ Guardado en este dispositivo' : 'Todavía sin guardar'}
            </div>
            {cargadaId != null && (
              <button onClick={borrar}
                style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', fontWeight: 600 }}>
                Eliminar examen
              </button>
            )}
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={cerrar}>Cerrar</button>
            <button className="btn-primary" style={{ fontSize: 13, padding: '8px 20px' }}
              onClick={guardar} disabled={guardando || def.preguntas.length === 0}>
              {guardando ? 'Guardando…' : '💾 Guardar examen'}
            </button>
          </div>
        </>)}
      </div>
    </div>
  )
}

/** Qué forma debe tener el fichero de un examen, con plantillas. */
function AyudaImportarPrueba({ onCerrar }: { onCerrar: () => void }) {
  const celda = { border: '1px solid var(--gris-300)', padding: '4px 7px', fontSize: 11, textAlign: 'left' as const }
  const cab = { ...celda, background: 'var(--gris-100)', fontWeight: 700 }
  return (
    <div style={{ border: '1px solid var(--azul-300)', background: 'var(--azul-100)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 13.5, color: 'var(--azul-900)', flex: 1 }}>Cómo preparar el fichero del examen</strong>
        <button onClick={onCerrar} aria-label="Cerrar la ayuda"
          style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--gris-600)', lineHeight: 1 }}>×</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--gris-700)', lineHeight: 1.55, marginBottom: 10 }}>
        El examen es <strong>una tabla con una fila por pregunta</strong>, en una hoja de cálculo (.xlsx) o en Markdown (.md).
        Se lee en este dispositivo y no se sube a ningún sitio.
      </p>
      <div style={{ overflowX: 'auto', marginBottom: 10 }}>
        <table style={{ borderCollapse: 'collapse', background: 'white' }}>
          <tbody>
            <tr><td style={celda}>Prueba de la unidad 1</td><td style={celda} /><td style={celda} /></tr>
            <tr><td style={celda}>Tipo</td><td style={celda}>puntos</td><td style={celda} /></tr>
            <tr><td style={cab}>Pregunta</td><td style={cab}>Puntos</td><td style={cab}>Criterio</td></tr>
            <tr><td style={celda}>1. Define relieve</td><td style={celda}>2</td><td style={celda}>CE1.1</td></tr>
            <tr><td style={celda}>2. Sitúa los ríos</td><td style={celda}>3</td><td style={celda}>CE1.1</td></tr>
            <tr><td style={celda}>3. Presentación</td><td style={celda}>1</td><td style={celda} /></tr>
          </tbody>
        </table>
      </div>
      <ul style={{ fontSize: 12, color: 'var(--gris-700)', lineHeight: 1.6, margin: '0 0 12px 18px', padding: 0 }}>
        <li>La cabecera lleva <strong>Pregunta</strong> y <strong>Puntos</strong>. Los puntos pueden sumar lo que quieras (10, 20, 100…): la nota se pasa sola a 0–10.</li>
        <li><strong>Criterio</strong> es opcional. Si lo rellenas, cada criterio recibe la nota de sus preguntas; una pregunta sin criterio cuenta para todos los criterios del examen.</li>
        <li>Encima de la tabla, cada uno en su fila y todos opcionales: <strong>Tipo</strong> (puntos, test o niveles), <strong>Reparto</strong> (nota única o por criterios),
          {' '}<strong>Penalización</strong> para el test (0,25 o 1/3) y <strong>Escala</strong> para los niveles («Correcta (2)», «Parcial (1)», «En blanco (0)», una por celda).</li>
        <li>Una celda suelta arriba del todo es el título del examen.</li>
        <li>Un <strong>test con clave</strong> lleva además <strong>Opciones</strong> (separadas por «;») y <strong>Correcta</strong> (la letra). O se escribe como examen en un .md: «1. Pregunta», debajo «a) …», «b) …», y la correcta con un asterisco al final o en una línea «Respuestas: 1-b, 2-c».</li>
      </ul>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-secondary" style={{ fontSize: 11.5 }}
          onClick={() => descargar('plantilla-examen.xlsx', pruebaAXlsx(PRUEBA_EJEMPLO), TIPO_XLSX)}>⬇ Plantilla .xlsx</button>
        <button className="btn-secondary" style={{ fontSize: 11.5 }}
          onClick={() => descargar('plantilla-examen.md', pruebaAMarkdown(PRUEBA_EJEMPLO), 'text/markdown;charset=utf-8')}>⬇ Plantilla .md</button>
        <button className="btn-secondary" style={{ fontSize: 11.5 }}
          onClick={() => descargar('ejemplo.eduprueba.json', pruebaAJson(PRUEBA_EJEMPLO), 'application/json')}>⬇ Ejemplo .json</button>
      </div>
    </div>
  )
}
