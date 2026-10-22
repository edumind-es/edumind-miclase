/**
 * Los exámenes con hoja de respuestas, desde «Evaluar con QR y cámara».
 *
 * El corrector por cámara vivía solo en la cabecera de la columna del
 * examen, cuatro clics dentro del Calificador, y Luis creyó que no existía.
 * Aquí está a la vista: la lista de exámenes de todas las clases, cada uno
 * con «Imprimir hojas» y «Corregir por cámara», y «Nuevo examen», que pide
 * clase → área → unidad → instrumento de prueba escrita y abre el mismo
 * editor de siempre con los criterios de ese instrumento. El examen nace
 * ligado a su instrumento (y a su unidad); las preguntas se reparten a los
 * criterios dentro del editor, como en el Calificador.
 *
 * Nada se guarda aquí: imprimir, corregir y editar son `ImprimirTest`,
 * `EscanerHojas` y `PruebaEditor`, los mismos del Calificador. Lo que esta
 * pantalla aporta es resolver el contexto de un examen a partir de su id
 * (`resolverContextoExamen`), que es también lo que hace falta cuando la
 * cámara lee el QR de una hoja.
 */
import { useEffect, useState } from 'react'
import {
  getPruebaConContexto, listarPruebas, getMatrizEvaluacion, getAlumnosByGrupo,
  getGrupos, getAsignaturas, getUnidades, getInstrumentos,
  type PruebaConContexto, type CeldaInstrumento, type DatosDeArea, type GrupoConCount, type UnidadConCriterios,
} from '@/db/queries'
import { columnasPorInstrumento, type ColumnaInstrumento } from './MatrizInstrumentos'
import { criteriosDeArea } from '@/informes/datos'
import { useAppStore } from '@/store/useAppStore'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import ImprimirTest from './ImprimirTest'
import EscanerHojas from './EscanerHojas'
import PruebaEditor from './PruebaEditor'
import InformePrueba from './InformePrueba'
import type { Alumno, Asignatura, Instrumento } from '@/db/localDb'

type Cabeceras = () => Record<string, string>

export type ContextoExamen = {
  fila: PruebaConContexto
  alumnos: Alumno[]
  /** El instrumento tal y como lo ve la matriz, con los criterios que evalúa en esa unidad. */
  col: ColumnaInstrumento
  area: DatosDeArea
}

/**
 * Todo lo que necesitan el corrector y la impresión a partir del id del
 * examen: clase, alumnos, el instrumento como columna de la matriz (con sus
 * criterios en la unidad del examen) y el área. Devuelve un texto si algo
 * falta, para decirlo en vez de abrir una pantalla vacía.
 */
export async function resolverContextoExamen(prueba_id: number, trimestre: number, headers: Cabeceras): Promise<ContextoExamen | string> {
  const fila = await getPruebaConContexto(prueba_id)
  if (!fila) return `No hay ningún examen con el código ${prueba_id} en este aparato. Si es de otro, sincroniza primero.`
  const [alumnos, descripciones, matriz] = await Promise.all([
    getAlumnosByGrupo(fila.grupo.id!),
    criteriosDeArea(fila.grupo, fila.asig, headers),
    getMatrizEvaluacion(fila.asig.id!, fila.prueba.unidad_id, trimestre),
  ])
  if (!matriz) return 'No se ha podido cargar la clase del examen.'
  // Los ids salen de la programación (la matriz); las descripciones, del currículo si hay conexión.
  const criterios = [...matriz.porCriterio.keys()].map(id => ({ id, descripcion: descripciones.get(id) ?? '' }))
  const col = columnasPorInstrumento(matriz, criterios).find(c => c.ins.instrumento_id === fila.instrumento.id)
  if (!col) {
    return `«${fila.instrumento.nombre}» no evalúa ningún criterio${fila.unidad ? ` en ${fila.unidad.nombre}` : ''} en el ${trimestre}º trimestre: asígnale criterios en la programación o cambia de trimestre.`
  }
  const area = { asignatura: fila.asig.nombre, curso: fila.grupo.curso, etapa: fila.grupo.etapa, comunidad: fila.asig.comunidad || fila.grupo.comunidad }
  return { fila, alumnos, col, area }
}

interface Props {
  trimestre: number
  /** Examen que la cámara ha reconocido en una hoja: se abre su corrector al llegar. */
  abrirCorrectorDe?: number | null
  onCorrectorCerrado?: () => void
}

export default function ExamenesConHoja({ trimestre, abrirCorrectorDe, onCorrectorCerrado }: Props) {
  const headers = useAppStore(s => s._headers)
  const [lista, setLista] = useState<PruebaConContexto[] | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [imprimir, setImprimir] = useState<ContextoExamen | null>(null)
  const [corregir, setCorregir] = useState<ContextoExamen | null>(null)
  const [informe, setInforme] = useState<ContextoExamen | null>(null)
  const [editar, setEditar] = useState<{ instrumento: Instrumento; asig: Asignatura; grupo: GrupoConCount | { nombre: string; curso: string; etapa: string }; unidad: UnidadConCriterios | null; criterios: { id: string; descripcion: string }[] } | null>(null)
  const [nuevo, setNuevo] = useState(false)

  useEffect(() => {
    let vigente = true
    listarPruebas().then(l => { if (vigente) setLista(l) })
    return () => { vigente = false }
  }, [recarga])

  const abrir = async (prueba_id: number, que: 'imprimir' | 'corregir' | 'informe') => {
    setOcupado(prueba_id); setAviso(null)
    try {
      const ctx = await resolverContextoExamen(prueba_id, trimestre, headers)
      if (typeof ctx === 'string') { setAviso(ctx); return }
      if (que === 'imprimir') setImprimir(ctx); else if (que === 'informe') setInforme(ctx); else setCorregir(ctx)
    } finally { setOcupado(null) }
  }

  // La cámara ha leído el QR de una hoja: directo al corrector de ese examen.
  useEffect(() => {
    if (abrirCorrectorDe == null) return
    void abrir(abrirCorrectorDe, 'corregir')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirCorrectorDe])

  const cerrarCorrector = () => { setCorregir(null); setRecarga(n => n + 1); onCorrectorCerrado?.() }

  /** Abrir el editor de un examen de la lista (o de un instrumento recién elegido). */
  const abrirEditor = async (instrumento: Instrumento, asig: Asignatura, grupo: { id?: number; nombre: string; curso: string; etapa: string; comunidad: string }, unidad: UnidadConCriterios | null) => {
    const matriz = await getMatrizEvaluacion(asig.id!, unidad?.id ?? null, trimestre)
    const descripciones = matriz ? await criteriosDeArea(matriz.grupo, asig, headers) : new Map<string, string>()
    const criterios = matriz ? [...matriz.porCriterio.keys()].map(id => ({ id, descripcion: descripciones.get(id) ?? '' })) : []
    const col = matriz ? columnasPorInstrumento(matriz, criterios).find(c => c.ins.instrumento_id === instrumento.id) : undefined
    setNuevo(false)
    setEditar({ instrumento, asig, grupo, unidad, criterios: col?.criterios ?? [] })
  }

  return (
    <div className="card" data-examenes-hoja>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--azul-700)', margin: 0, flex: 1 }}>
          📝 Exámenes con hoja de respuestas
        </h2>
        <button className="btn-primary" data-examen-nuevo onClick={() => setNuevo(true)} style={{ fontSize: 13 }}>
          + Nuevo examen
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.5, margin: '0 0 10px' }}>
        Un test con sus opciones y la correcta se imprime como hoja de respuestas con QR por alumno,
        y se corrige apuntando la cámara a cada hoja. Cada examen va ligado a un instrumento de prueba
        escrita de la programación; las preguntas se reparten a sus criterios en el editor.
      </p>

      {aviso && <div data-examenes-aviso style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', padding: '8px 10px', borderRadius: 8, marginBottom: 8 }}>{aviso}</div>}

      {lista == null ? (
        <div style={{ fontSize: 12.5, color: 'var(--gris-500)' }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--gris-500)' }}>Todavía no hay ningún examen definido. Empieza por «Nuevo examen».</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lista.map(f => {
            const cfg = getInstrConfig(f.instrumento.tipo)
            return (
              <li key={f.prueba.id} data-examen={f.prueba.def.titulo} data-con-clave={f.conClave || undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'var(--gris-100)' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gris-900)' }}>{f.prueba.def.titulo}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--gris-600)' }}>
                    {f.grupo.nombre} · {f.asig.nombre_display} · {f.unidad ? f.unidad.nombre : 'general'} · <span aria-hidden="true">{cfg.icon}</span> {f.instrumento.nombre}
                    {' · '}{f.prueba.def.preguntas.length} pregunta{f.prueba.def.preguntas.length !== 1 ? 's' : ''}
                    {f.conClave ? '' : f.prueba.def.tipo === 'test' ? ' · falta la clave' : ' · no es un test'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn-secondary" data-examen-editar style={{ fontSize: 12 }} disabled={ocupado === f.prueba.id}
                    onClick={() => abrirEditor(f.instrumento, f.asig, f.grupo, null).then(() => setEditar(e => e && ({ ...e, unidad: f.unidad as UnidadConCriterios | null })))}
                    title="Ver o cambiar el examen">✏️ Editar</button>
                  <button className="btn-secondary" data-examen-imprimir style={{ fontSize: 12 }} disabled={ocupado === f.prueba.id || !f.conClave}
                    onClick={() => abrir(f.prueba.id, 'imprimir')}
                    title={f.conClave ? 'Imprimir la hoja de respuestas de cada alumno y el examen' : 'Completa opciones y correcta en todas las preguntas para poder imprimir'}>🖨 Imprimir hojas</button>
                  <button className="btn-secondary" data-examen-informe style={{ fontSize: 12 }} disabled={ocupado === f.prueba.id}
                    onClick={() => abrir(f.prueba.id, 'informe')}
                    title="Qué preguntas, criterios y aspectos falla la clase con este examen">📈 Informe</button>
                  <button className="btn-primary" data-examen-corregir style={{ fontSize: 12 }} disabled={ocupado === f.prueba.id || !f.conClave}
                    onClick={() => abrir(f.prueba.id, 'corregir')}
                    title={f.conClave ? 'Corregir las hojas con la cámara, una tras otra' : 'Completa la clave del examen para corregir por cámara'}>📷 Corregir por cámara</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {nuevo && (
        <ElegirInstrumentoDePrueba
          onElegido={(ins, asig, grupo, unidad) => abrirEditor(ins, asig, grupo, unidad)}
          onCancelar={() => setNuevo(false)}
        />
      )}

      {editar && (
        <PruebaEditor
          instrumentoId={editar.instrumento.id!}
          instrumentoNombre={editar.instrumento.nombre}
          asignaturaId={editar.asig.id!}
          unidadId={editar.unidad?.id ?? null}
          unidadNombre={editar.unidad?.nombre}
          criterios={editar.criterios}
          asignaturaNombre={editar.asig.nombre_display}
          nivel={`${editar.grupo.curso}º ${editar.grupo.etapa}`}
          onCerrar={() => { setEditar(null); setRecarga(n => n + 1) }}
        />
      )}

      {imprimir && (
        <ImprimirTest
          instrumento={imprimir.col.ins}
          unidadId={imprimir.fila.prueba.unidad_id}
          unidadNombre={imprimir.fila.unidad?.nombre}
          alumnos={imprimir.alumnos}
          grupoNombre={imprimir.fila.grupo.nombre}
          areaNombre={imprimir.fila.asig.nombre_display}
          onCerrar={() => setImprimir(null)}
        />
      )}

      {informe && (
        <InformePrueba
          instrumentoId={informe.col.ins.instrumento_id}
          instrumentoNombre={informe.col.ins.nombre}
          unidadId={informe.fila.prueba.unidad_id}
          unidadNombre={informe.fila.unidad?.nombre}
          criterios={informe.col.criterios}
          grupoNombre={informe.fila.grupo.nombre}
          areaNombre={informe.fila.asig.nombre_display}
          onCerrar={() => setInforme(null)}
        />
      )}

      {corregir && (
        <EscanerHojas
          instrumento={corregir.col.ins}
          unidadId={corregir.fila.prueba.unidad_id}
          unidadNombre={corregir.fila.unidad?.nombre}
          trimestre={trimestre}
          alumnos={corregir.alumnos}
          criterios={corregir.col.criterios}
          area={corregir.area}
          onGuardado={() => { /* la matriz no está en pantalla; la lista se relee al cerrar */ }}
          onCerrar={cerrarCorrector}
        />
      )}
    </div>
  )
}

/**
 * «Nuevo examen»: clase → área → unidad → instrumento de prueba escrita.
 * Solo instrumentos de prueba escrita (familias o hijos): un examen de otro
 * tipo no tendría sentido y el Calificador tampoco lo ofrece.
 */
function ElegirInstrumentoDePrueba({ onElegido, onCancelar }: {
  onElegido: (ins: Instrumento, asig: Asignatura, grupo: GrupoConCount, unidad: UnidadConCriterios | null) => void
  onCancelar: () => void
}) {
  const [grupos, setGrupos] = useState<GrupoConCount[]>([])
  const [grupoId, setGrupoId] = useState<number | null>(null)
  const [asigs, setAsigs] = useState<Asignatura[]>([])
  const [asigId, setAsigId] = useState<number | null>(null)
  const [unidades, setUnidades] = useState<UnidadConCriterios[]>([])
  const [unidadId, setUnidadId] = useState<number | null>(null)
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  const [insId, setInsId] = useState<number | null>(null)

  useEffect(() => { getGrupos().then(g => { setGrupos(g); if (g.length === 1) setGrupoId(g[0].id!) }) }, [])
  useEffect(() => {
    setAsigs([]); setAsigId(null)
    if (grupoId != null) getAsignaturas(grupoId).then(a => { setAsigs(a); if (a.length === 1) setAsigId(a[0].id!) })
  }, [grupoId])
  useEffect(() => {
    setUnidades([]); setUnidadId(null); setInstrumentos([]); setInsId(null)
    if (asigId == null) return
    getUnidades(asigId).then(setUnidades)
    getInstrumentos(asigId).then(l => {
      const pruebas = l.filter(i => i.tipo === 'prueba-escrita')
      setInstrumentos(pruebas)
      if (pruebas.length === 1) setInsId(pruebas[0].id!)
    })
  }, [asigId])

  const grupo = grupos.find(g => g.id === grupoId)
  const asig = asigs.find(a => a.id === asigId)
  const ins = instrumentos.find(i => i.id === insId)
  const unidad = unidades.find(u => u.id === unidadId) ?? null
  const sel = (label: string, value: number | null, onChange: (v: number | null) => void, opciones: { id?: number; nombre: string }[], vacio: string, extra?: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--gris-600)' }}>
      {label}
      <select value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} style={{ fontSize: 13.5, padding: '7px 9px' }}>
        <option value="">{opciones.length ? vacio : extra ?? vacio}</option>
        {opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
      </select>
    </label>
  )

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancelar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label="Nuevo examen" data-examen-nuevo-dialogo style={{ width: 'min(520px, 94vw)', padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-900)', margin: '0 0 6px' }}>Nuevo examen</h2>
        <p style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.5, margin: '0 0 14px' }}>
          El examen cuelga de un instrumento de prueba escrita de la programación: así sus notas entran en la media con el peso que les toca.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sel('Clase', grupoId, setGrupoId, grupos, 'Elige la clase', 'No hay clases')}
          {sel('Área', asigId, setAsigId, asigs.map(a => ({ id: a.id, nombre: a.nombre_display })), 'Elige el área', grupoId == null ? 'Elige antes la clase' : 'Esta clase no tiene áreas')}
          {sel('Unidad', unidadId, setUnidadId, unidades, 'Examen general del instrumento (sin unidad)', asigId == null ? 'Elige antes el área' : 'Sin unidades: examen general')}
          {sel('Instrumento de prueba escrita', insId, setInsId, instrumentos, 'Elige el instrumento', asigId == null ? 'Elige antes el área' : 'Esta área no tiene ningún instrumento de prueba escrita: créalo en ⚙ Instrumentos del Calificador')}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-primary" data-examen-nuevo-abrir disabled={!grupo || !asig || !ins} onClick={() => grupo && asig && ins && onElegido(ins, asig, grupo, unidad)} style={{ fontSize: 13 }}>
            Abrir el editor
          </button>
          <button className="btn-secondary" onClick={onCancelar} style={{ fontSize: 13 }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
