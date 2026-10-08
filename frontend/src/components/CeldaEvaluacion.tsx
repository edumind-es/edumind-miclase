/**
 * Panel de una celda de la matriz: alumno × criterio.
 *
 * Es la respuesta a «al pulsar la casilla quiero saber con qué se evalúa».
 * No pide una nota en abstracto: muestra el criterio completo, el instrumento
 * (o instrumentos) que la programación le ha asignado, su rúbrica si la tiene,
 * y solo entonces la nota. Además deja adjuntar la evidencia en el momento.
 */
import { useEffect, useRef, useState } from 'react'
import {
  getRubrica, getCalificacionUnica, saveCalificaciones,
  crearEvidencia, getEvidenciasAlumno, eliminarEvidencia,
  getPrueba, getPruebasDeInstrumento, guardarExamenDeAlumno, getRespuestasDeExamen,
  recuperarNotaAnterior, descartarNotaAnterior, getRegistrosDeCelda,
  type CeldaInstrumento, type PruebaGuardada,
} from '@/db/queries'
import PruebaEditor from './PruebaEditor'
import CorregirPrueba from './CorregirPrueba'
import CapturaEvidencia, { type EvidenciaCapturada } from './CapturaEvidencia'
import MiniaturaEvidencia from './MiniaturaEvidencia'
import InstrumentosManager from './InstrumentosManager'
import RubricaEditor from './RubricaEditor'
import CriteriosHermanos from './CriteriosHermanos'
import DiarioCelda from './DiarioCelda'
import { etiquetaAgregacion } from '@/db/diario'
import { notaDeRubrica, nivelANota, calificativo } from '@/db/calculo'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import type { Alumno, Asignatura, Grupo, Evidencia, RegistroDiario } from '@/db/localDb'

type NivelRubrica = { nombre: string; valor: number; descripcion?: string }

/** Los instrumentos de la casilla, agrupados por familia y en su orden. */
function gruposDeInstrumentos(lista: CeldaInstrumento[]) {
  const grupos: { id: number; rotulo: string | null; peso: number; miembros: CeldaInstrumento[] }[] = []
  for (const ins of lista) {
    const id = ins.familia_id ?? ins.instrumento_id
    let g = grupos.find(x => x.id === id)
    if (!g) {
      g = { id, rotulo: ins.familia_id != null ? ins.familia_nombre : null, peso: ins.familia_peso, miembros: [] }
      grupos.push(g)
    }
    g.miembros.push(ins)
  }
  return grupos
}
type IndicadorRubrica = { nombre: string; peso?: number; descriptores?: Record<string, string> }

interface Props {
  alumno: Alumno
  criterio: { id: string; descripcion: string }
  instrumentos: CeldaInstrumento[]
  grupo: Grupo
  asig: Asignatura
  trimestre: number
  unidadId: number | null
  unidadNombre?: string
  onGuardado: () => void
  onCerrar: () => void
  /** Navegación entre alumnos sin cerrar el panel */
  onAnterior?: () => void
  onSiguiente?: () => void
  posicion?: string
  /**
   * Los otros criterios que un instrumento evalúa en lo que se está viendo.
   * Con ellos se ofrece copiar la nota o vincularlos; sin la función, nada.
   */
  hermanosDe?: (instrumentoId: number) => { id: string; descripcion: string }[]
  /** Toda la clase, para copiar una columna entera. */
  alumnoIds?: number[]
  /**
   * Desde dónde se ha entrado. Por criterio (lo de siempre) la cabecera es
   * el criterio y debajo van sus instrumentos; por instrumento la cabecera es
   * el instrumento con todos los criterios que cubre, y se puede saltar de
   * uno a otro sin cerrar el panel.
   */
  enfoque?: 'criterio' | 'instrumento'
  /** Con enfoque de instrumento: pasar a otro de sus criterios. */
  onElegirCriterio?: (criterio: { id: string; descripcion: string }) => void
}

export default function CeldaEvaluacion({
  alumno, criterio, instrumentos, grupo, asig, trimestre, unidadId, unidadNombre,
  onGuardado, onCerrar, onAnterior, onSiguiente, posicion, hermanosDe, alumnoIds,
  enfoque = 'criterio', onElegirCriterio,
}: Props) {
  const [instrumentoId, setInstrumentoId] = useState<number | null>(instrumentos[0]?.instrumento_id ?? null)
  const [niveles, setNiveles] = useState<NivelRubrica[]>([])
  const [indicadores, setIndicadores] = useState<IndicadorRubrica[]>([])
  /** nombre del indicador → valor del nivel marcado. */
  const [marcado, setMarcado] = useState<Record<string, number>>({})
  const [valorActual, setValorActual] = useState<number | null>(null)
  const [observacion, setObservacion] = useState('')
  const [evidencias, setEvidencias] = useState<Evidencia[]>([])
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const relojMsg = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * Pone un mensaje; con `ms`, se quita solo. Uno nuevo cancela el borrado
   * pendiente del anterior: si no, el temporizador de «8 guardado» se llevaba
   * por delante el mensaje siguiente —el resumen de una copia— sin dar tiempo
   * a leerlo.
   */
  const avisar = (m: { tipo: 'ok' | 'error'; texto: string } | null, ms?: number) => {
    if (relojMsg.current) { clearTimeout(relojMsg.current); relojMsg.current = null }
    setMsg(m)
    if (m && ms) relojMsg.current = setTimeout(() => setMsg(null), ms)
  }
  useEffect(() => () => { if (relojMsg.current) clearTimeout(relojMsg.current) }, [])
  const [guardando, setGuardando] = useState(false)
  // Atajos: corregir el instrumento o su rúbrica aquí mismo, sin cerrar el
  // panel, salir del calificador y volver a bajar hasta la ficha del área.
  const [instrumentosAbierto, setInstrumentosAbierto] = useState(false)
  const [rubricaAbierta, setRubricaAbierta] = useState(false)
  const [pruebaAbierta, setPruebaAbierta] = useState(false)
  /** El examen con el que se corrige aquí, si el instrumento es una prueba escrita y lo tiene. */
  const [prueba, setPrueba] = useState<PruebaGuardada | null>(null)
  /** Hay exámenes definidos, pero por unidad, y se está mirando «Todo el curso». */
  const [pruebaSoloPorUnidad, setPruebaSoloPorUnidad] = useState(false)
  /** Nota fantasma de esta casilla: la anterior a un recálculo. Visible, pero no cuenta. */
  const [fantasma, setFantasma] = useState<{ id: number; valor: number; motivo: string | null } | null>(null)
  const [recarga, setRecarga] = useState(0)
  /** Registros del diario de esta casilla, en orden cronológico. */
  const [registros, setRegistros] = useState<RegistroDiario[]>([])
  /** 'diario' si la nota actual la deriva el diario y no se puso a mano. */
  const [origenActual, setOrigenActual] = useState<'diario' | null>(null)
  /** La parrilla 0-10 y la rúbrica, plegadas cuando la nota sale del diario. */
  const [manualAbierta, setManualAbierta] = useState(false)
  /** «Más»: lo que no es el instrumento, plegado al final. Abierto, se queda abierto al cambiar de alumno. */
  const [masAbierto, setMasAbierto] = useState(false)
  // Sube uno cada vez que se toca la configuración: obliga a releer la rúbrica
  // del instrumento, que si no se quedaba con los niveles de antes.
  const [refrescoInstr, setRefrescoInstr] = useState(0)

  const instrumentoSel = instrumentos.find(i => i.instrumento_id === instrumentoId) ?? null
  const cfg = instrumentoSel ? getInstrConfig(instrumentoSel.tipo) : null
  /** Criterios que este instrumento evalúa en lo que se está viendo: este y sus hermanos. */
  const hermanos = instrumentoSel && hermanosDe ? hermanosDe(instrumentoSel.instrumento_id) : []
  const destinosPrueba = [criterio.id, ...hermanos.map(h => h.id)]
  /**
   * Desde la vista por instrumento, la casilla es «el alumno con el cuaderno»
   * y enseña la media de todos los criterios que cubre. Si la nota fuera solo
   * a uno de los treinta, la media no se movía y parecía que no se guardaba
   * (le pasó a Luis tras copiar una nota a toda la columna). Así que por
   * defecto la nota va a todos, como «Pegar columna» y «Evaluar hoy», y
   * «solo este criterio» es la excepción que se pide.
   */
  const [soloEsteCriterio, setSoloEsteCriterio] = useState(false)
  const notaATodos = enfoque === 'instrumento' && hermanos.length > 0 && !soloEsteCriterio
  const destinosNota = notaATodos ? destinosPrueba : [criterio.id]

  // Al cambiar de alumno, reiniciar el instrumento al primero disponible
  useEffect(() => {
    setInstrumentoId(prev =>
      prev && instrumentos.some(i => i.instrumento_id === prev)
        ? prev
        : (instrumentos[0]?.instrumento_id ?? null))
    setObservacion('')
    avisar(null)
  }, [alumno.id, criterio.id])

  // Rúbrica del instrumento seleccionado
  useEffect(() => {
    if (!instrumentoId) { setNiveles([]); setIndicadores([]); return }
    getRubrica(instrumentoId).then(r => {
      if (!r) { setNiveles([]); setIndicadores([]); return }
      try {
        const nvs = JSON.parse(r.niveles_json) as NivelRubrica[]
        setNiveles(nvs.filter(n => typeof n.valor === 'number'))
        // Los indicadores existían desde siempre en la rúbrica y no se leían
        // aquí: se calificaba con un único nivel para todo el criterio y el
        // trabajo de redactarlos no servía para nada al evaluar.
        const inds = JSON.parse(r.indicadores_json) as IndicadorRubrica[]
        setIndicadores(Array.isArray(inds) ? inds.filter(i => i?.nombre) : [])
      } catch { setNiveles([]); setIndicadores([]) }
    })
  }, [instrumentoId, refrescoInstr])

  // Examen del instrumento para esta unidad (o el general)
  const esPruebaEscrita = instrumentoSel?.tipo === 'prueba-escrita'
  useEffect(() => {
    if (!instrumentoId || !esPruebaEscrita) { setPrueba(null); setPruebaSoloPorUnidad(false); return }
    let vigente = true
    Promise.all([getPrueba(instrumentoId, unidadId), getPruebasDeInstrumento(instrumentoId)]).then(([p, todas]) => {
      if (!vigente) return
      setPrueba(p)
      setPruebaSoloPorUnidad(!p && todas.length > 0)
    })
    return () => { vigente = false }
  }, [instrumentoId, esPruebaEscrita, unidadId, refrescoInstr])

  // Nota ya registrada + observación guardada
  useEffect(() => {
    if (!instrumentoId) { setValorActual(null); return }
    let vigente = true
    ;(async () => {
      const [c, regs] = await Promise.all([
        getCalificacionUnica(alumno.id!, instrumentoId, criterio.id, trimestre),
        getRegistrosDeCelda(alumno.id!, instrumentoId, trimestre, criterio.id),
      ])
      // Lo marcado en cada indicador la última vez. Una nota puesta antes de
      // que esto existiera no lo trae: se muestra el número y ya.
      let marcas = c?.niveles_rubrica ?? {}
      // Un examen repartido por criterios puede no tener ninguna pregunta de
      // este: entonces aquí no hay nota, pero el examen sí está corregido. Se
      // traen las respuestas de otro de sus criterios, o parecería sin
      // corregir y anotar una pregunta borraría las demás.
      if (prueba && Object.keys(marcas).length === 0) {
        marcas = await getRespuestasDeExamen(alumno.id!, instrumentoId, trimestre, hermanos.map(h => h.id))
      }
      if (!vigente) return
      setValorActual(c?.valor ?? null)
      setOrigenActual(c?.origen === 'diario' ? 'diario' : null)
      setRegistros(regs)
      setManualAbierta(false)
      setObservacion(c?.observacion ?? '')
      setMarcado(marcas)
      setFantasma(c?.id != null && c.valor_anterior != null
        ? { id: c.id, valor: c.valor_anterior, motivo: c.anterior_motivo ?? null } : null)
    })()
    return () => { vigente = false }
  }, [alumno.id, instrumentoId, criterio.id, trimestre, prueba, recarga])

  // Evidencias de este alumno en este criterio
  const recargarEvidencias = () => {
    getEvidenciasAlumno(alumno.id!).then(evs =>
      setEvidencias(evs.filter(e => e.criterio_id === criterio.id)))
  }
  useEffect(recargarEvidencias, [alumno.id, criterio.id])

  // Escape cierra; flechas cambian de alumno
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Con el gestor de instrumentos o el editor de rúbricas abiertos encima,
      // Esc es suyo: cerrar los dos modales de golpe perdería el sitio.
      if (instrumentosAbierto || rubricaAbierta || pruebaAbierta) return
      if (e.key === 'Escape') { onCerrar(); return }
      const enCampo = (e.target as HTMLElement)?.tagName === 'INPUT' ||
                      (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      if (enCampo) return
      if (e.key === 'ArrowDown' && onSiguiente) { e.preventDefault(); onSiguiente() }
      if (e.key === 'ArrowUp' && onAnterior) { e.preventDefault(); onAnterior() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar, onSiguiente, onAnterior, instrumentosAbierto, rubricaAbierta, pruebaAbierta])

  /**
   * Guarda la nota. Con `soloEste`, en este criterio aunque el panel esté en
   * modo «a todos» (la observación es de este criterio, no del instrumento).
   */
  const guardarNota = async (valor: number | null, niveles_rubrica?: Record<string, number> | null, opciones: { soloEste?: boolean } = {}) => {
    if (!instrumentoId) return
    setGuardando(true)
    try {
      const destinos = opciones.soloEste ? [criterio.id] : destinosNota
      const aTodos = destinos.length > 1
      const vinculadas = await saveCalificaciones(destinos.map(criterio_id => ({
        alumno_id: alumno.id!, instrumento_id: instrumentoId, criterio_id,
        asignatura: asig.nombre, curso: grupo.curso, etapa: grupo.etapa,
        comunidad: asig.comunidad || grupo.comunidad, trimestre,
        valor,
        // La observación es de este criterio; a los demás no se les pisa la suya.
        observacion: criterio_id === criterio.id ? observacion.trim() || null : undefined,
        unidad_id: unidadId,
        // `undefined` significa «no lo toques»: al borrar la nota o al
        // escribir una observación no hay que perder lo marcado.
        ...(niveles_rubrica !== undefined ? { niveles_rubrica } : {}),
      })),
      // A todos los criterios del instrumento el reparto ya está decidido,
      // como al pegar una columna: los vínculos no añaden nada.
      { sinVinculos: aTodos })
      // Misma regla que `saveCalificaciones`: otra nota a mano sobre una
      // casilla derivada del diario la vuelve manual.
      if (valor !== valorActual) setOrigenActual(null)
      setValorActual(valor)
      // Si la nota ha ido a más casillas, se dice: que un vínculo escriba en
      // otro criterio sin avisar sería justo lo que no debe pasar.
      const tambien = vinculadas > 0 ? ` y en ${vinculadas} criterio${vinculadas !== 1 ? 's' : ''} vinculado${vinculadas !== 1 ? 's' : ''}` : ''
      const donde = aTodos ? `los ${destinos.length} criterios de ${instrumentoSel?.nombre ?? 'este instrumento'}` : criterio.id
      avisar({ tipo: 'ok', texto: valor == null ? `Nota borrada${aTodos ? ` en ${donde}` : ''}${tambien}` : `${valor} guardado en ${donde}${tambien}` }, 2000)
      onGuardado()
    } catch {
      avisar({ tipo: 'error', texto: 'No se pudo guardar la nota' })
    } finally { setGuardando(false) }
  }

  const guardarEvidencia = async (ev: EvidenciaCapturada) => {
    setGuardando(true)
    try {
      await crearEvidencia({
        alumno_id: alumno.id!, asignatura_id: asig.id, criterio_id: criterio.id,
        instrumento_id: instrumentoId, unidad_id: unidadId, trimestre,
        tipo: ev.tipo, mime: ev.mime, blob: ev.blob, duracion_ms: ev.duracion_ms ?? null,
        descripcion: observacion.trim() || undefined,
      })
      recargarEvidencias()
      const nombre = ev.tipo === 'foto' ? 'Foto' : ev.tipo === 'audio' ? 'Audio' : 'Vídeo'
      avisar({ tipo: 'ok', texto: `${nombre} guardado como evidencia` }, 2200)
      onGuardado()
    } catch {
      avisar({ tipo: 'error', texto: 'No se pudo guardar la evidencia' })
    } finally { setGuardando(false) }
  }

  const borrarEvidencia = async (id: number) => {
    if (!confirm('¿Eliminar esta evidencia?')) return
    await eliminarEvidencia(id)
    recargarEvidencias()
    onGuardado()
  }

  /**
   * Marcar un nivel en un indicador.
   *
   * La nota no se pide: sale de la rúbrica. Se recalcula con todos los
   * indicadores marcados hasta ahora y se guarda junto con las marcas, para
   * que al volver se pueda corregir uno solo sin rehacer el resto.
   *
   * Volver a pulsar el nivel ya marcado lo desmarca: equivocarse no puede
   * obligar a borrar la nota entera y empezar de cero.
   */
  const marcarIndicador = async (nombre: string, valor: number) => {
    const siguiente = { ...marcado }
    if (siguiente[nombre] === valor) delete siguiente[nombre]
    else siguiente[nombre] = valor
    setMarcado(siguiente)
    const { nota } = notaDeRubrica(indicadores, niveles, siguiente)
    await guardarNota(nota, siguiente)
  }

  /** Quitar todas las marcas y la nota que salía de ellas. */
  const limpiarRubrica = async () => {
    setMarcado({})
    await guardarNota(null, {})
  }

  /**
   * Guardar lo anotado en el examen.
   *
   * Un examen se corrige una vez y pone nota en todos los criterios que evalúa
   * —la misma, o a cada uno la de sus preguntas—. En todos se guardan las
   * respuestas completas, para que el examen se vea entero se abra desde el
   * criterio que se abra.
   *
   * No pasa por los vínculos: el reparto ya lo decide el examen.
   */
  const guardarRespuestas = async (respuestas: Record<string, number>) => {
    if (!instrumentoId || !prueba) return
    setMarcado(respuestas)
    setGuardando(true)
    try {
      const r = await guardarExamenDeAlumno({
        alumno_id: alumno.id!, instrumento_id: instrumentoId, trimestre, unidad_id: unidadId,
        def: prueba.def, respuestas, destinos: destinosPrueba,
        area: { asignatura: asig.nombre, curso: grupo.curso, etapa: grupo.etapa, comunidad: asig.comunidad || grupo.comunidad },
        observacion: { criterio_id: criterio.id, texto: observacion.trim() || null },
      })
      const criterios = r.criterios
      const mia = r.porCriterio[criterio.id] ?? null
      setValorActual(criterio.id in r.porCriterio ? mia : valorActual)
      avisar({
        tipo: 'ok',
        texto: r.nota == null
          ? 'Examen sin anotar: nota borrada'
          : `Examen: ${r.nota}${criterios.length > 1 ? ` · nota puesta en ${criterios.join(', ')}` : ` guardado en ${criterio.id}`}`,
      }, 2500)
      onGuardado()
    } catch {
      avisar({ tipo: 'error', texto: 'No se pudo guardar el examen' })
    } finally { setGuardando(false) }
  }

  const resumen = notaDeRubrica(indicadores, niveles, marcado)
  const maxNivel = niveles.length ? Math.max(...niveles.map(n => n.valor)) : 0
  /** Con rúbrica de verdad —niveles e indicadores— la nota la pone ella. */
  const calificaPorPrueba = !!prueba
  /** La nota sale del diario: hay registros, o la casilla aún lleva la marca. */
  const calificaPorDiario = !calificaPorPrueba && (registros.length > 0 || origenActual === 'diario')
  // Con examen definido manda el examen: es lo que el docente ha dicho que corrige.
  const calificaPorRubrica = !calificaPorPrueba && niveles.length > 0 && indicadores.length > 0

  /**
   * Tras tocar instrumentos o rúbrica hay dos vistas que se quedarían viejas:
   * este panel (niveles y nota) y la matriz del calificador, que pinta el peso,
   * el tipo y el punto de «tiene rúbrica» de cada instrumento. `onGuardado()`
   * es justo la señal que el calificador ya usa para releer la matriz.
   */
  const trasEditarConfig = () => {
    setRefrescoInstr(n => n + 1)
    onGuardado()
  }

  const cal = calificativo(valorActual)

  return (
    <>
    {instrumentosAbierto && (
      <InstrumentosManager
        asignaturaId={asig.id!}
        asignaturaNombre={asig.nombre_display}
        nivel={`${grupo.curso}º ${grupo.etapa}`}
        anidado
        onClose={() => { setInstrumentosAbierto(false); trasEditarConfig() }}
      />
    )}

    {pruebaAbierta && instrumentoSel && (
      <PruebaEditor
        instrumentoId={instrumentoSel.instrumento_id}
        instrumentoNombre={instrumentoSel.nombre}
        unidadId={unidadId}
        unidadNombre={unidadNombre}
        criterios={[criterio, ...hermanos]}
        onCerrar={() => { setPruebaAbierta(false); trasEditarConfig() }}
      />
    )}

    {rubricaAbierta && instrumentoSel && (
      <RubricaEditor
        instrumentoId={instrumentoSel.instrumento_id}
        instrumentoNombre={instrumentoSel.nombre}
        asignaturaNombre={asig.nombre_display}
        nivel={`${grupo.curso}º ${grupo.etapa}`}
        onCerrar={() => { setRubricaAbierta(false); trasEditarConfig() }}
      />
    )}

    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true"
        aria-label={`Evaluar ${criterio.id} de ${alumno.nombre}`}
        style={{ width: 'min(900px, 96vw)', maxHeight: '94vh', overflowY: 'auto', padding: 0 }}>

        {/* Cabecera: alumno + navegación */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--azul-900)' }}>
              {alumno.apellidos}, {alumno.nombre}
              {alumno.neae ? <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)' }}>
              {grupo.nombre} · {asig.nombre_display} · {trimestre}º trim.
              {unidadNombre && ` · ${unidadNombre}`}
            </div>
          </div>
          {(onAnterior || onSiguiente) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={onAnterior} disabled={!onAnterior} title="Alumno anterior (↑)"
                className="btn-secondary" style={{ padding: '4px 9px', fontSize: 13 }}>↑</button>
              {posicion && <span style={{ fontSize: 11, color: 'var(--gris-500)', minWidth: 40, textAlign: 'center' }}>{posicion}</span>}
              <button onClick={onSiguiente} disabled={!onSiguiente} title="Alumno siguiente (↓)"
                className="btn-secondary" style={{ padding: '4px 9px', fontSize: 13 }}>↓</button>
            </div>
          )}
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar">✕</button>
        </div>

        <div style={{ padding: '14px 18px 18px' }}>
          {/* 1. Franja del instrumento: qué se corrige y con qué nota va. Lo
              primero que se ve es el instrumento, no el criterio: el docente
              corrige el cuaderno o el examen, y el criterio es la etiqueta. */}
          <div data-franja-instrumento style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', marginBottom: 12, borderRadius: 10, background: 'var(--gris-100)', borderLeft: `6px solid ${instrumentoSel?.color ?? 'var(--azul-700)'}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: instrumentoSel?.color ?? 'var(--azul-900)', lineHeight: 1.2 }}>
                {cfg && <span aria-hidden="true" style={{ marginRight: 6 }}>{cfg.icon}</span>}{instrumentoSel?.nombre ?? 'Sin instrumento'}
                {instrumentoSel?.familia_id != null && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gris-600)', marginLeft: 8 }}>dentro de {instrumentoSel.familia_nombre} · {instrumentoSel.familia_peso}%</span>}
                {instrumentoSel && instrumentoSel.familia_id == null && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gris-600)', marginLeft: 8 }}>{instrumentoSel.peso}% del área</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--azul-700)', letterSpacing: '.03em', whiteSpace: 'nowrap' }}>CRITERIO {criterio.id}</span>
                <span style={{ fontSize: 12.5, color: 'var(--gris-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }} title={criterio.descripcion}>{criterio.descripcion}</span>
                <button type="button" data-ver-criterio onClick={() => setMasAbierto(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--azul-500)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0, whiteSpace: 'nowrap' }}>
                  {hermanos.length > 0 ? `y ${hermanos.length} más` : 'ver entero'}
                </button>
              </div>
              {/* Desde la vista por instrumento se dice a dónde va la nota, y se
                  puede cambiar: a todos es lo normal; a uno, la excepción. */}
              {enfoque === 'instrumento' && hermanos.length > 0 && !calificaPorPrueba && (
                <div data-alcance-nota={notaATodos ? 'instrumento' : 'criterio'} style={{ fontSize: 12, color: 'var(--gris-600)', marginTop: 5 }}>
                  {notaATodos
                    ? <>La nota va a los <strong>{destinosPrueba.length} criterios</strong> de {instrumentoSel?.nombre}.</>
                    : <>La nota va <strong>solo a {criterio.id}</strong>.</>}{' '}
                  <button type="button" data-alcance-toggle onClick={() => setSoloEsteCriterio(v => !v)}
                    style={{ background: 'none', border: 'none', color: 'var(--azul-500)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    {notaATodos ? 'solo este criterio' : 'a todos los criterios'}
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div data-nota-actual style={{
                width: 60, height: 60, borderRadius: 12, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: valorActual == null ? 'white' : cal.color, border: valorActual == null ? '1.5px dashed var(--gris-300)' : 'none',
                color: valorActual == null ? 'var(--gris-500)' : 'white',
              }}>
                <span style={{ fontSize: 23, fontWeight: 800, lineHeight: 1 }}>{valorActual == null ? '—' : valorActual}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, opacity: .9 }}>{cal.sigla}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--gris-600)', lineHeight: 1.4, maxWidth: 150 }}>
                {valorActual == null
                  ? <>Sin calificar con <strong>{instrumentoSel?.nombre ?? 'este instrumento'}</strong>.</>
                  : origenActual === 'diario'
                    ? <>{cal.etiqueta} con <strong>{instrumentoSel?.nombre}</strong> · calculada del diario ({etiquetaAgregacion(instrumentoSel?.agregacion).toLowerCase()} de {registros.length} registro{registros.length !== 1 ? 's' : ''}).</>
                    : <>{cal.etiqueta} con <strong>{instrumentoSel?.nombre}</strong>.</>}
                {valorActual != null && origenActual !== 'diario' && (
                  <button onClick={() => calificaPorPrueba ? guardarRespuestas({}) : calificaPorRubrica ? limpiarRubrica() : guardarNota(null)} disabled={guardando}
                    style={{ display: 'block', background: 'none', border: 'none', color: 'var(--rojo-500)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', padding: 0, marginTop: 2 }}>
                    borrar nota
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. Varios instrumentos para la misma casilla: se elige con qué se corrige. */}
          {instrumentos.length > 1 && (
            <div style={{ marginBottom: 12 }}>
            {/* Agrupados por familia: «Táboa de indicadores · 20 %» y debajo lo
                que hay dentro. Un instrumento suelto es su propio grupo sin rótulo. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gruposDeInstrumentos(instrumentos).map(g => (
                <div key={g.id} data-grupo-familia={g.rotulo ?? undefined}>
                  {g.rotulo && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', marginBottom: 4 }}>
                      {g.rotulo} <span style={{ fontWeight: 500 }}>· {g.peso}% del área · dentro:</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {g.miembros.map(ins => {
                      const c = getInstrConfig(ins.tipo)
                      const activo = ins.instrumento_id === instrumentoId
                      return (
                        <button key={ins.instrumento_id} onClick={() => setInstrumentoId(ins.instrumento_id)} data-instrumento-chip={ins.nombre}
                          data-activo={activo || undefined} aria-current={activo ? 'true' : undefined}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px',
                            borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                            background: activo ? ins.color : 'white',
                            color: activo ? 'white' : 'var(--gris-900)',
                            border: `2px solid ${ins.color}`,
                          }}>
                          <span style={{ fontSize: 15 }}>{c.icon}</span>
                          <span>
                            {ins.nombre}
                            <span style={{ display: 'block', fontSize: 10, fontWeight: 500, opacity: .85 }}>
                              {c.label}{ins.familia_id != null ? ` · peso ${ins.peso} en ${ins.familia_nombre}` : ` · ${ins.peso}%`}{ins.tiene_prueba ? ' · con examen' : ins.tiene_rubrica ? ' · con rúbrica' : ''}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            </div>
          )}

          {/* 3. El instrumento, grande y lo primero: examen, rúbrica o diario. */}
          {/* Con examen definido se corrige pregunta a pregunta. */}
          {calificaPorPrueba && prueba && (
            <CorregirPrueba
              def={prueba.def}
              respuestas={marcado}
              destinos={destinosPrueba}
              criterioActual={criterio.id}
              guardando={guardando}
              onCambio={guardarRespuestas}
            />
          )}

          {/* La rúbrica se califica indicador a indicador. La nota no se pide:
              sale de lo marcado, ponderado por el peso de cada indicador. */}
          {calificaPorRubrica && (!calificaPorDiario || manualAbierta) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  Rúbrica — marca el nivel de cada indicador
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: resumen.evaluados === resumen.total ? 'var(--verde-500)' : 'var(--gris-500)', fontWeight: 600 }}>
                  {resumen.evaluados} de {resumen.total} marcados
                </span>
                {resumen.evaluados > 0 && (
                  <button onClick={limpiarRubrica} disabled={guardando}
                    style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    limpiar
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {indicadores.map((ind, ii) => {
                  const pesoMostrado = ind.peso ?? Math.round((100 / indicadores.length) * 10) / 10
                  return (
                    <div key={ind.nombre + ii} style={{
                      border: '1px solid var(--gris-300)', borderRadius: 10, padding: '9px 11px',
                      background: marcado[ind.nombre] != null ? 'var(--azul-100)' : 'white',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--azul-900)', flex: 1, lineHeight: 1.35 }}>
                          {ind.nombre}
                        </div>
                        <span style={{ fontSize: 10.5, color: 'var(--gris-500)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {pesoMostrado}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {niveles.map(n => {
                          const activo = marcado[ind.nombre] === n.valor
                          // El descriptor es lo que de verdad ayuda a decidir:
                          // se enseña al pasar el ratón y se lee en voz alta.
                          const descriptor = ind.descriptores?.[n.nombre] || n.descripcion
                          return (
                            <button key={n.nombre}
                              onClick={() => marcarIndicador(ind.nombre, n.valor)}
                              disabled={guardando}
                              title={descriptor
                                ? `${n.nombre} (${n.valor} pts): ${descriptor}`
                                : `${n.nombre} — ${n.valor} pts`}
                              aria-pressed={activo}
                              style={{
                                flex: '1 1 150px', minHeight: 64, borderRadius: 10, padding: '8px 10px',
                                fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                                border: `2px solid ${activo ? 'var(--azul-900)' : 'var(--gris-300)'}`,
                                background: activo ? 'var(--azul-700)' : 'white',
                                color: activo ? 'white' : 'var(--gris-900)',
                              }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                                <span>{n.nombre}</span>
                                <span style={{ fontWeight: 500, opacity: .75, whiteSpace: 'nowrap' }}>
                                  {nivelANota(n.valor, maxNivel)}
                                </span>
                              </div>
                              {descriptor && (
                                <div style={{
                                  fontSize: 12, fontWeight: 400, marginTop: 3, lineHeight: 1.35,
                                  opacity: activo ? .9 : .65,
                                  display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                }}>
                                  {descriptor}
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Diario de evaluación: varias observaciones que no se pisan. */}
          {instrumentoSel && !calificaPorPrueba && !calificaPorRubrica && (
            <DiarioCelda
              alumno={alumno}
              instrumento={instrumentoSel}
              criterio={criterio}
              hermanos={hermanos}
              trimestre={trimestre}
              unidadId={unidadId}
              area={{ asignatura: asig.nombre, curso: grupo.curso, etapa: grupo.etapa, comunidad: asig.comunidad || grupo.comunidad }}
              registros={registros}
              guardando={guardando}
              onCambio={texto => { avisar({ tipo: 'ok', texto }, 2500); setRecarga(n => n + 1); onGuardado() }}
              onError={texto => avisar({ tipo: 'error', texto })}
              abiertoPorDefecto
            />
          )}

          {/* Con la nota derivada del diario, poner otra a mano es una decisión:
              se avisa de que el diario deja de contar hasta el próximo registro. */}
          {calificaPorDiario && !manualAbierta && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--gris-600)' }}>
              <button data-diario-manual onClick={() => {
                  if (confirm('Esta nota sale del diario. Si pones una a mano, el diario deja de contar hasta el próximo registro. ¿Seguir?')) setManualAbierta(true)
                }}
                style={{ background: 'none', border: 'none', color: 'var(--azul-700)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                poner la nota a mano
              </button>
            </div>
          )}

          {/* Sin rúbrica que aplicar, la nota se pone a mano. También cuando la
              rúbrica está a medias —con niveles pero sin ningún indicador—, que
              si no el criterio se quedaría sin forma de calificar. */}
          {!calificaPorRubrica && !calificaPorPrueba && (!calificaPorDiario || manualAbierta) && (
            <>
              {esPruebaEscrita && (
                <div style={{ fontSize: 12, color: 'var(--gris-600)', marginBottom: 8, lineHeight: 1.5 }}>
                  {pruebaSoloPorUnidad
                    ? <>Los exámenes de «{instrumentoSel?.nombre}» están definidos por unidad: entra en la pestaña de la unidad para corregir pregunta a pregunta.</>
                    : <>¿Corriges por preguntas? Define el examen y la nota saldrá sola al anotar cada una.{' '}
                        <button onClick={() => setPruebaAbierta(true)} className="btn-secondary" style={{ fontSize: 12, marginLeft: 6 }}>📝 Definir examen</button></>}
                </div>
              )}
              {niveles.length > 0 && indicadores.length === 0 && (
                <div style={{ padding: '9px 13px', borderRadius: 8, fontSize: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 10 }}>
                  Esta rúbrica tiene niveles pero ningún indicador, así que no puede
                  calcular la nota. Añádeselos en <strong>📊 Rúbrica</strong> y se
                  calificará marcando cada uno.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 5, marginBottom: 14 }}>
                {Array.from({ length: 11 }, (_, v) => (
                  <button key={v} onClick={() => guardarNota(v)} disabled={guardando || !instrumentoId}
                    className={`cal-${v}`}
                    style={{
                      minHeight: 46, borderRadius: 9, fontSize: 16, fontWeight: 800, cursor: 'pointer',
                      border: valorActual === v ? '3px solid var(--gris-900)' : '2px solid transparent',
                    }}>
                    {v}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Nota fantasma: la anterior a un recálculo. No se pierde ni cuenta. */}
          {fantasma && (
            <div data-fantasma style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12,
              padding: '9px 12px', borderRadius: 9, border: '1px dashed var(--gris-500)', background: 'var(--gris-50)',
            }}>
              <span style={{
                minWidth: 40, height: 34, padding: '0 8px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 15, color: 'white', background: calificativo(fantasma.valor).color, opacity: .45,
              }}>{fantasma.valor}</span>
              <div style={{ flex: '1 1 200px', fontSize: 12, color: 'var(--gris-600)', lineHeight: 1.45 }}>
                <strong>Nota anterior: no cuenta.</strong>{' '}
                {fantasma.motivo || 'Es la que había antes de recalcular.'}
              </div>
              <button className="btn-secondary" style={{ fontSize: 11.5 }} disabled={guardando}
                title="Esta nota vuelve a ser la que cuenta; la actual pasa a ser la anterior"
                onClick={async () => {
                  await recuperarNotaAnterior(fantasma.id)
                  avisar({ tipo: 'ok', texto: `${fantasma.valor} recuperado como nota de ${criterio.id}` })
                  setRecarga(n => n + 1); onGuardado()
                }}>
                Recuperar
              </button>
              <button className="btn-secondary" style={{ fontSize: 11.5 }} disabled={guardando}
                title="Quitar la nota anterior. La nota que cuenta no se toca."
                onClick={async () => {
                  if (!confirm(`¿Descartar la nota anterior (${fantasma.valor})? Esta sí se pierde.`)) return
                  await descartarNotaAnterior(fantasma.id)
                  setRecarga(n => n + 1); onGuardado()
                }}>
                Descartar
              </button>
            </div>
          )}


          {msg && (
            <div style={{
              padding: '9px 14px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, marginBottom: 10,
              background: msg.tipo === 'ok' ? 'var(--verde-100)' : 'var(--rojo-100)',
              color: msg.tipo === 'ok' ? 'var(--verde-500)' : 'var(--rojo-500)',
            }}>
              {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
            </div>
          )}

          {/* 4. Lo demás, plegado: el criterio entero, los otros criterios, copiar o
              vincular, observación, evidencias y los ajustes del instrumento. Está
              todo, pero no entre el docente y la rúbrica. */}
          <button type="button" data-mas-toggle aria-expanded={masAbierto} onClick={() => setMasAbierto(a => !a)}
            style={{ width: '100%', textAlign: 'left', border: '1px solid var(--gris-300)', borderRadius: 9, background: masAbierto ? 'var(--gris-100)' : 'white', padding: '8px 12px', fontSize: 12.5, color: 'var(--gris-600)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700 }}>{masAbierto ? '▾' : '▸'} Más</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              criterio entero{hermanos.length > 0 ? ` · ${hermanos.length} criterio${hermanos.length !== 1 ? 's' : ''} más · copiar o vincular` : ''} · observación · foto, audio o vídeo{evidencias.length ? ` (${evidencias.length})` : ''} · ajustes
            </span>
          </button>

          {masAbierto && (
            <div data-mas style={{ marginTop: 12 }}>
          {/* Cabecera del panel: el criterio, o el instrumento con sus criterios */}
          {enfoque === 'instrumento' && instrumentoSel ? (
            <div data-enfoque-instrumento style={{ background: 'var(--gris-100)', borderLeft: `6px solid ${instrumentoSel.color}`, borderRadius: 9, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: instrumentoSel.color, letterSpacing: '.03em', marginBottom: 3 }}>
                INSTRUMENTO · {instrumentoSel.nombre}{instrumentoSel.familia_id != null ? <span style={{ fontWeight: 600, color: 'var(--gris-600)' }}> · dentro de {instrumentoSel.familia_nombre} ({instrumentoSel.familia_peso}%)</span> : null}
              </div>
              <div style={{ fontSize: 12, color: 'var(--gris-600)', marginBottom: 8 }}>
                Evalúa {destinosPrueba.length} criterio{destinosPrueba.length !== 1 ? 's' : ''}{unidadNombre ? ` en ${unidadNombre}` : ''}
                {calificaPorPrueba ? ' · el examen pone nota en todos a la vez' : ' · un registro del diario reparte a todos'}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {/* En orden fijo: la ficha pulsada no debe saltar al principio. */}
                {[criterio, ...hermanos].sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true })).map(c => {
                  const activo = c.id === criterio.id
                  return (
                    <button key={c.id} type="button" data-criterio-chip aria-pressed={activo}
                      onClick={() => !activo && onElegirCriterio?.(c)}
                      disabled={!onElegirCriterio && !activo}
                      title={c.descripcion}
                      style={{
                        fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 14, cursor: activo || !onElegirCriterio ? 'default' : 'pointer',
                        border: `1.5px solid ${activo ? instrumentoSel.color : 'var(--gris-300)'}`,
                        background: activo ? instrumentoSel.color : 'white',
                        color: activo ? 'white' : 'var(--gris-900)',
                      }}>
                      {c.id}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 13, color: 'var(--gris-900)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--azul-700)' }}>{criterio.id}</strong> — {criterio.descripcion}
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--azul-100)', borderRadius: 9, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--azul-700)', letterSpacing: '.03em', marginBottom: 3 }}>
                {criterio.id} · criterio completo
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--gris-900)', lineHeight: 1.5 }}>
                {criterio.descripcion}
              </div>
            </div>
          )}

          {/* El mismo instrumento para varios criterios: copiar o vincular */}
          {instrumentoSel && hermanosDe && !calificaPorPrueba && (
            <CriteriosHermanos
              instrumento={instrumentoSel}
              criterio={criterio}
              hermanos={hermanos}
              alumno={alumno}
              alumnoIds={alumnoIds ?? [alumno.id!]}
              trimestre={trimestre}
              unidadId={unidadId}
              tieneNota={valorActual != null}
              valor={valorActual}
              onCambio={texto => { avisar({ tipo: 'ok', texto }); setRecarga(n => n + 1); onGuardado() }}
            />
          )}

          {/* Diario de evaluación: varias observaciones que no se pisan. */}
          {instrumentoSel && !calificaPorPrueba && calificaPorRubrica && (
            <DiarioCelda
              alumno={alumno}
              instrumento={instrumentoSel}
              criterio={criterio}
              hermanos={hermanos}
              trimestre={trimestre}
              unidadId={unidadId}
              area={{ asignatura: asig.nombre, curso: grupo.curso, etapa: grupo.etapa, comunidad: asig.comunidad || grupo.comunidad }}
              registros={registros}
              guardando={guardando}
              onCambio={texto => { avisar({ tipo: 'ok', texto }, 2500); setRecarga(n => n + 1); onGuardado() }}
              onError={texto => avisar({ tipo: 'error', texto })}
            />
          )}

          {/* Observación + evidencia */}
          <div style={{ marginBottom: 12 }}>
            <input value={observacion} onChange={e => setObservacion(e.target.value)}
              placeholder="Observación para este criterio…"
              onBlur={() => { if (valorActual != null) guardarNota(valorActual, undefined, { soloEste: true }) }}
              style={{ width: '100%', minHeight: 42, marginBottom: 8 }} />
            <CapturaEvidencia onCapturada={guardarEvidencia} compacto deshabilitado={guardando} />
          </div>

          {evidencias.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {evidencias.map(ev => (
                <MiniaturaEvidencia key={ev.id} evidencia={ev} onBorrar={() => borrarEvidencia(ev.id!)} />
              ))}
            </div>
          )}


              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--gris-300)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase', marginRight: 4 }}>Ajustes</span>
              <button onClick={() => setInstrumentosAbierto(true)}
                title="Cambiar nombre, tipo, peso o trimestres de los instrumentos de esta área"
                style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: 'white', color: 'var(--gris-600)', border: '1px solid var(--gris-300)' }}>
                ⚙ Instrumentos
              </button>
              {instrumentoSel && esPruebaEscrita && prueba && (
                <button onClick={() => setPruebaAbierta(true)}
                  title={prueba
                    ? `Ver o editar el examen «${prueba.def.titulo}»`
                    : 'Definir el examen: tipo, preguntas y lo que vale cada una. Después se corrige pregunta a pregunta.'}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                    background: prueba ? 'var(--azul-700)' : 'white',
                    color: prueba ? 'white' : 'var(--gris-600)',
                    border: prueba ? 'none' : '1px solid var(--gris-300)',
                  }}>
                  📝 {prueba ? 'Examen' : 'Definir examen'}
                </button>
              )}
              {instrumentoSel && (
                <button onClick={() => setRubricaAbierta(true)}
                  title={`${instrumentoSel.tiene_rubrica ? 'Ver o editar' : 'Crear'} la rúbrica de «${instrumentoSel.nombre}»`}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                    background: instrumentoSel.tiene_rubrica ? '#166534' : 'white',
                    color: instrumentoSel.tiene_rubrica ? 'white' : 'var(--gris-600)',
                    border: instrumentoSel.tiene_rubrica ? 'none' : '1px solid var(--gris-300)',
                  }}>
                  📊 {instrumentoSel.tiene_rubrica ? 'Rúbrica' : 'Crear rúbrica'}
                </button>
              )}

              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--gris-500)', marginTop: 12, textAlign: 'center' }}>
            La nota se guarda al pulsarla · <kbd>↑</kbd> <kbd>↓</kbd> cambian de alumno · <kbd>Esc</kbd> cierra
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
