/**
 * Los exámenes con hoja de respuestas, desde «Exámenes y pruebas de evaluación».
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
import { Link } from 'react-router-dom'
import {
  getPruebaConContexto, listarPruebas, getMatrizEvaluacion, getAlumnosByGrupo,
  getGrupos, getAsignaturas, getUnidades, getInstrumentos, getBancoRubricas, getBancoPruebas,
  type PruebaConContexto, type DatosDeArea, type GrupoConCount, type UnidadConCriterios, type MatrizEvaluacion,
} from '@/db/queries'
import { useClaseActiva } from '@/contexto/ClaseActiva'
import Pestanas from './comunes/Pestanas'
import { BotonEditarActividad } from './FichaActividad'
import { herramientaDe } from './QueEvaluoPorUnidad'
import { abreviatura } from '@/ia/instrumentosConfig'
import { unidadesDelExamen } from '@/db/prueba'
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

/** El mensaje de un error cualquiera, para enseñarlo tal cual. */
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'error desconocido'

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
  // Las pestañas son las áreas de la clase activa (decisión de Luis); la
  // elegida aquí no cambia el área de la barra, solo lo que se mira.
  const { grupo, asignaturas, asignaturaId } = useClaseActiva()
  const [areaId, setAreaId] = useState<number | null>(null)
  const [verOtras, setVerOtras] = useState(false)
  const areaElegida = asignaturas.find(a => a.id === areaId) ?? asignaturas.find(a => a.id === asignaturaId) ?? asignaturas[0] ?? null

  useEffect(() => {
    let vigente = true
    listarPruebas()
      .then(l => { if (vigente) setLista(l) })
      // Un examen que no se puede leer no deja la lista en «Cargando…» para siempre.
      .catch(e => { if (vigente) { setLista([]); setAviso(`No se ha podido leer la lista de exámenes: ${mensajeDe(e)}`) } })
    return () => { vigente = false }
  }, [recarga])

  const abrir = async (prueba_id: number, que: 'imprimir' | 'corregir' | 'informe') => {
    setOcupado(prueba_id); setAviso(null)
    try {
      const ctx = await resolverContextoExamen(prueba_id, trimestre, headers)
      if (typeof ctx === 'string') { setAviso(ctx); return }
      if (que === 'imprimir') setImprimir(ctx); else if (que === 'informe') setInforme(ctx); else setCorregir(ctx)
    } catch (e) {
      // Antes un fallo aquí no abría nada y no decía nada: el botón parecía roto.
      setAviso(`No se ha podido abrir el examen: ${mensajeDe(e)}`)
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
    setAviso(null)
    // Los criterios de las preguntas salen de la programación; si no se
    // pueden leer, el editor se abre igual (sin ellos) y se dice.
    let criteriosCol: { id: string; descripcion: string }[] = []
    try {
      const matriz = await getMatrizEvaluacion(asig.id!, unidad?.id ?? null, trimestre)
      const descripciones = matriz ? await criteriosDeArea(matriz.grupo, asig, headers) : new Map<string, string>()
      const criterios = matriz ? [...matriz.porCriterio.keys()].map(id => ({ id, descripcion: descripciones.get(id) ?? '' })) : []
      const col = matriz ? columnasPorInstrumento(matriz, criterios).find(c => c.ins.instrumento_id === instrumento.id) : undefined
      criteriosCol = col?.criterios ?? []
    } catch (e) {
      setAviso(`No se han podido leer los criterios de «${instrumento.nombre}»: ${mensajeDe(e)}. El editor se abre sin ellos.`)
    }
    setNuevo(false)
    setEditar({ instrumento, asig, grupo, unidad, criterios: criteriosCol })
  }

  return (
    <div className="card" data-examenes-hoja>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--azul-700)', margin: 0, flex: 1 }}>
          📝 Con qué evalúo: exámenes y herramientas
        </h2>
        <button className="btn-primary" data-examen-nuevo onClick={() => setNuevo(true)} style={{ fontSize: 13 }}>
          + Nuevo examen
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.5, margin: '0 0 10px' }}>
        Cada área, unidad a unidad, con la herramienta de cada actividad: examen, rúbrica o diario.
        Un test con sus opciones y la correcta se imprime como hoja de respuestas con QR por alumno
        y se corrige apuntando la cámara a cada hoja.
      </p>

      {aviso && <div data-examenes-aviso style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', padding: '8px 10px', borderRadius: 8, marginBottom: 8 }}>{aviso}</div>}

      {lista == null ? (
        <div style={{ fontSize: 12.5, color: 'var(--gris-500)' }}>Cargando…</div>
      ) : !grupo || !areaElegida ? (
        // Sin clase activa (o sin áreas) no hay pestañas que poner: la lista de siempre.
        lista.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--gris-500)' }}>Todavía no hay ningún examen definido. Empieza por «Nuevo examen».</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lista.map(f => <FilaExamen key={f.prueba.id} f={f} ocupado={ocupado === f.prueba.id} conClase onEditar={() => abrirEditor(f.instrumento, f.asig, f.grupo, f.unidad as UnidadConCriterios | null)} onAbrir={que => abrir(f.prueba.id, que)} />)}
          </ul>
        )
      ) : (() => {
        const otras = lista.filter(f => f.grupo.id !== grupo.id)
        return (
          <>
            <div data-examenes-clase style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gris-700)', marginBottom: 4 }}>{grupo.nombre}</div>
            <Pestanas
              pestanas={asignaturas.map(a => ({ id: String(a.id), etiqueta: a.nombre_display }))}
              activa={String(areaElegida.id)} alCambiar={id => setAreaId(Number(id))}
              etiqueta="Área de la que se ven las actividades" aspecto="area" style={{ marginBottom: 10 }}
            />
            <AreaDeExamenes
              key={areaElegida.id} grupo={grupo} asig={areaElegida} recarga={recarga} ocupado={ocupado}
              examenes={lista.filter(f => f.asig.id === areaElegida.id)}
              onEditarExamen={(ins, unidad) => abrirEditor(ins, areaElegida, grupo, unidad)}
              onAbrir={abrir} onCambio={() => setRecarga(n => n + 1)} onError={setAviso}
            />
            {otras.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <button type="button" className="btn-secondary" data-examenes-otras-toggle aria-expanded={verOtras}
                  onClick={() => setVerOtras(v => !v)} style={{ minHeight: 44, fontSize: 13 }}>
                  {verOtras ? 'Ocultar' : 'Ver'} los exámenes de otras clases ({otras.length})
                </button>
                {verOtras && (
                  <ul data-examenes-otras style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {otras.map(f => <FilaExamen key={f.prueba.id} f={f} ocupado={ocupado === f.prueba.id} conClase onEditar={() => abrirEditor(f.instrumento, f.asig, f.grupo, f.unidad as UnidadConCriterios | null)} onAbrir={que => abrir(f.prueba.id, que)} />)}
                  </ul>
                )}
              </div>
            )}
          </>
        )
      })()}

      <Modelos recarga={recarga} />

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
          grupo={informe.fila.grupo}
          asig={informe.fila.asig}
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

type Accion = 'imprimir' | 'corregir' | 'informe'
const accion = { minHeight: 44, fontSize: 13 } as const

/** Los cuatro botones de un examen: editar, imprimir, informe y corregir por cámara. */
function BotonesExamen({ f, ocupado, onEditar, onAbrir }: { f: PruebaConContexto; ocupado: boolean; onEditar: () => void; onAbrir: (que: Accion) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {/* Con la unidad del examen desde el principio, igual que «Nuevo
          examen»: antes se abría sin unidad —la matriz de toda el área— y
          se le ponía la unidad después, y a Luis ese botón no le abría nada. */}
      <button className="btn-secondary" data-examen-editar style={accion} disabled={ocupado} onClick={onEditar}
        title="Ver o cambiar el examen">✏️ Editar</button>
      <button className="btn-secondary" data-examen-imprimir style={accion} disabled={ocupado || !f.conClave}
        onClick={() => onAbrir('imprimir')}
        title={f.conClave ? 'Imprimir la hoja de respuestas de cada alumno y el examen' : 'Completa opciones y correcta en todas las preguntas para poder imprimir'}>🖨 Imprimir hojas</button>
      <button className="btn-secondary" data-examen-informe style={accion} disabled={ocupado}
        onClick={() => onAbrir('informe')}
        title="Qué preguntas, criterios y aspectos falla la clase con este examen">📈 Informe</button>
      <button className="btn-primary" data-examen-corregir style={accion} disabled={ocupado || !f.conClave}
        onClick={() => onAbrir('corregir')}
        title={f.conClave ? 'Corregir las hojas con la cámara, una tras otra' : 'Completa la clave del examen para corregir por cámara'}>📷 Corregir por cámara</button>
    </div>
  )
}

const detalleExamen = (f: PruebaConContexto) =>
  `${f.prueba.def.preguntas.length} pregunta${f.prueba.def.preguntas.length !== 1 ? 's' : ''}${f.conClave ? '' : f.prueba.def.tipo === 'test' ? ' · falta la clave' : ' · no es un test'}`

/** Un examen suelto, con su contexto escrito: la fila de la lista de siempre. */
function FilaExamen({ f, ocupado, conClase, onEditar, onAbrir }: { f: PruebaConContexto; ocupado: boolean; conClase?: boolean; onEditar: () => void; onAbrir: (que: Accion) => void }) {
  const cfg = getInstrConfig(f.instrumento.tipo)
  return (
    <li data-examen={f.prueba.def.titulo} data-con-clave={f.conClave || undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'var(--gris-100)' }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gris-900)' }}>{f.prueba.def.titulo}</div>
        <div style={{ fontSize: 11.5, color: 'var(--gris-600)' }}>
          {conClase ? `${f.grupo.nombre} · ${f.asig.nombre_display} · ` : ''}{f.unidad ? f.unidad.nombre : 'general'} · <span aria-hidden="true">{cfg.icon}</span> {f.instrumento.nombre}
          {' · '}{detalleExamen(f)}
        </div>
      </div>
      <BotonesExamen f={f} ocupado={ocupado} onEditar={onEditar} onAbrir={onAbrir} />
    </li>
  )
}

type UnidadDeArea = { unidad: UnidadConCriterios; matriz: MatrizEvaluacion | null; columnas: ColumnaInstrumento[] }

/**
 * Un área de la clase activa, unidad a unidad: cada fila es una actividad de
 * esa unidad (la misma columna que pinta el Calificador) con la herramienta
 * con la que se evalúa. Con examen propio lleva los botones del examen; sin
 * él, «Editar» abre la ficha de la actividad, donde se elige la herramienta.
 * Los exámenes del área que no caen en ninguna fila (generales, o de un
 * instrumento sin criterios en su unidad) van al final: ninguno se esconde.
 */
function AreaDeExamenes({ grupo, asig, examenes, recarga, ocupado, onEditarExamen, onAbrir, onCambio, onError }: {
  grupo: GrupoConCount
  asig: Asignatura
  examenes: PruebaConContexto[]
  recarga: number
  ocupado: number | null
  onEditarExamen: (ins: Instrumento, unidad: UnidadConCriterios | null) => void
  onAbrir: (prueba_id: number, que: Accion) => void
  onCambio: () => void
  onError: (texto: string) => void
}) {
  const headers = useAppStore(s => s._headers)
  const [unidades, setUnidades] = useState<UnidadDeArea[] | null>(null)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      try {
        const us = await getUnidades(asig.id!)
        // Las descripciones vienen del currículo; sin ellas se pintan los códigos.
        const descripciones = await criteriosDeArea(grupo, asig, headers).catch(() => new Map<string, string>())
        const filas = await Promise.all(us.map(async unidad => {
          const matriz = await getMatrizEvaluacion(asig.id!, unidad.id!, unidad.trimestre ?? 1)
          const criterios = matriz ? [...matriz.porCriterio.keys()].map(id => ({ id, descripcion: descripciones.get(id) ?? '' })) : []
          return { unidad, matriz, columnas: matriz ? columnasPorInstrumento(matriz, criterios) : [] }
        }))
        if (vigente) setUnidades(filas)
      } catch (e) {
        if (vigente) { setUnidades([]); onError(`No se han podido leer las actividades de «${asig.nombre_display}»: ${mensajeDe(e)}`) }
      }
    })()
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asig.id, grupo.id, recarga])

  if (unidades == null) return <div style={{ fontSize: 12.5, color: 'var(--gris-500)' }}>Cargando…</div>

  const area: DatosDeArea = { asignatura: asig.nombre, curso: grupo.curso, etapa: grupo.etapa, comunidad: asig.comunidad || grupo.comunidad }
  const enFila = new Set<number>()
  const propio = (insId: number, unidadId: number) => examenes.find(e => e.instrumento.id === insId && e.prueba.unidad_id === unidadId)
  for (const u of unidades) for (const c of u.columnas) { const e = propio(c.ins.instrumento_id, u.unidad.id!); if (e) enFila.add(e.prueba.id) }
  const sueltos = examenes.filter(e => !enFila.has(e.prueba.id))
  const titulo = { fontSize: 13, fontWeight: 700, color: 'var(--azul-900)', margin: '12px 0 6px' } as const

  return (
    <div data-area-examenes={asig.nombre_display}>
      {unidades.length === 0 && sueltos.length === 0 && (
        <div data-area-vacia style={{ fontSize: 12.5, color: 'var(--gris-600)' }}>
          Esta área no tiene unidades ni exámenes todavía. Las unidades se crean en 📋 Programación; un examen general, con «Nuevo examen».
        </div>
      )}
      {unidades.map(({ unidad, matriz, columnas }) => (
        <section key={unidad.id} data-unidad-bloque={unidad.nombre}>
          <h3 style={titulo}>{unidad.nombre} <span style={{ fontWeight: 400, color: 'var(--gris-600)' }}>· {unidad.trimestre ?? 1}.º trimestre</span></h3>
          {columnas.length === 0 ? (
            <div data-unidad-sin-actividades style={{ fontSize: 12.5, color: 'var(--gris-600)' }}>Ninguna actividad evalúa criterios en esta unidad todavía: se asignan en «Qué evalúo».</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {columnas.map(col => {
                const ins = col.ins
                const examen = propio(ins.instrumento_id, unidad.id!)
                // Sin examen propio pero con examen: el de otra unidad que vincula a esta, o el general.
                const ajeno = !examen && ins.tiene_prueba
                  ? examenes.find(e => e.instrumento.id === ins.instrumento_id && unidadesDelExamen(e.prueba.unidad_id, e.prueba.def).includes(unidad.id!))
                    ?? examenes.find(e => e.instrumento.id === ins.instrumento_id && e.prueba.unidad_id == null)
                  : undefined
                // Con examen propio a la vista manda el examen, aunque la matriz aún no se haya releído.
                const herramienta = examen ? 'examen' : herramientaDe(ins)
                const insCompleto = matriz?.instrumentos.find(i => i.id === ins.instrumento_id)
                return (
                  <li key={ins.instrumento_id} data-fila-actividad data-nombre={ins.nombre} data-herramienta={herramienta}
                    data-examen={examen?.prueba.def.titulo} data-con-clave={examen?.conClave || undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', background: 'var(--gris-100)', borderLeft: `6px solid ${ins.color}` }}>
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gris-900)' }}>
                        <span className="abrev" style={{ background: ins.color, marginRight: 6 }}>{abreviatura(ins.nombre)}</span>
                        {ins.nombre}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gris-700)' }}>
                        <span data-fila-herramienta>{herramienta}</span>
                        {examen ? <> · «{examen.prueba.def.titulo}» · {detalleExamen(examen)}</> : null}
                        {ajeno ? <> · el de {ajeno.unidad ? `«${ajeno.unidad.nombre}»` : 'todas las unidades'}</> : null}
                        {ins.familia_nombre ? <> · {ins.familia_nombre}</> : null}
                        {' · '}{col.criterios.length} criterio{col.criterios.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {examen
                        ? <BotonesExamen f={examen} ocupado={ocupado === examen.prueba.id} onEditar={() => onEditarExamen(examen.instrumento, unidad)} onAbrir={que => onAbrir(examen.prueba.id, que)} />
                        : <BotonEditarActividad instrumento={ins} criterios={col.criterios} unidadNombre={unidad.nombre} area={area} onCambio={onCambio}
                            onExamen={insCompleto ? () => onEditarExamen(insCompleto, unidad) : undefined} />}
                      <Link className="btn-secondary" data-fila-calificar to={`/evaluacion?grupo_id=${grupo.id}&asignatura_id=${asig.id}&unidad_id=${unidad.id}`}
                        style={{ ...accion, display: 'inline-flex', alignItems: 'center', padding: '0 14px', textDecoration: 'none' }}>Calificar</Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
      {sueltos.length > 0 && (
        <section data-examenes-sueltos>
          <h3 style={titulo}>Otros exámenes del área <span style={{ fontWeight: 400, color: 'var(--gris-600)' }}>· generales o sin columna en su unidad</span></h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sueltos.map(f => <FilaExamen key={f.prueba.id} f={f} ocupado={ocupado === f.prueba.id} onEditar={() => onEditarExamen(f.instrumento, f.unidad as UnidadConCriterios | null)} onAbrir={que => onAbrir(f.prueba.id, que)} />)}
          </ul>
        </section>
      )}
    </div>
  )
}

/**
 * Los modelos del docente: lo que tiene guardado en el banco de rúbricas y
 * en el de exámenes, a la vista en un solo sitio. Aquí solo se enseñan; se
 * usan, como hasta ahora, desde el editor de la rúbrica o del examen.
 */
function Modelos({ recarga }: { recarga: number }) {
  const [modelos, setModelos] = useState<{ clave: string; tipo: 'rubrica' | 'examen'; titulo: string; detalle: string }[] | null>(null)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let vigente = true
    Promise.all([getBancoRubricas(), getBancoPruebas()]).then(([rubricas, pruebas]) => {
      if (!vigente) return
      setModelos([
        ...rubricas.filter(r => r.enBanco).map(r => ({ clave: `r${r.id}`, tipo: 'rubrica' as const, titulo: r.titulo || 'Rúbrica sin título', detalle: 'rúbrica' })),
        ...pruebas.filter(p => p.enBanco).map(p => ({ clave: `p${p.id}`, tipo: 'examen' as const, titulo: p.def.titulo || 'Examen sin título', detalle: ['examen', p.area, p.nivel].filter(Boolean).join(' · ') })),
      ])
    }).catch(() => { if (vigente) setModelos([]) })
    return () => { vigente = false }
  }, [recarga])

  if (modelos == null) return null
  return (
    <div data-modelos style={{ marginTop: 16, borderTop: '1px solid var(--gris-300)', paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--azul-900)', margin: 0, flex: 1 }}>Modelos</h3>
        <button type="button" className="btn-secondary" data-modelos-toggle aria-expanded={abierto} disabled={modelos.length === 0}
          onClick={() => setAbierto(v => !v)} style={accion}>
          Mis modelos ({modelos.length})
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.5, margin: '6px 0 0' }}>
        {modelos.length === 0
          ? 'Todavía no has guardado ningún modelo. Se guardan desde el editor de una rúbrica o de un examen, en tu banco.'
          : 'Lo que tienes guardado en el banco de rúbricas y en el de exámenes. Se usan desde el editor de la rúbrica o del examen, y siempre como copia.'}
      </p>
      {abierto && (
        <ul data-modelos-lista style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {modelos.map(m => (
            <li key={m.clave} data-modelo={m.tipo} style={{ fontSize: 13, padding: '8px 10px', background: 'var(--gris-100)' }}>
              <strong>{m.titulo}</strong> <span style={{ color: 'var(--gris-600)' }}>· {m.detalle}</span>
            </li>
          ))}
        </ul>
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
