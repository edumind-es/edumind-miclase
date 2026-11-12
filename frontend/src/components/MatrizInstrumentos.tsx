/**
 * Calificador por instrumento: matriz alumno × instrumento.
 *
 * Es la otra cara de la matriz por criterios. El docente no corrige «el
 * CE2.3»: corrige el examen, revisa los apuntes, recoge el billete de salida.
 * Aquí cada columna es uno de esos instrumentos y dice qué criterios cubre
 * según la programación; la casilla enseña la nota media del alumno con él.
 * Nada se guarda aquí: pulsar una casilla abre el mismo panel de siempre, y
 * «Evaluar hoy» abre la pasada de clase del diario.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getInstrConfig, abreviatura } from '@/ia/instrumentosConfig'
import { etiquetaAgregacion, miniTendencia } from '@/db/diario'
import { faltaHerramienta } from './ElegirHerramienta'
import { aplicaEnTrimestre } from '@/db/calculo'
import type { CeldaInstrumento, MatrizEvaluacion } from '@/db/queries'
import type { Alumno } from '@/db/localDb'
import { verNeae } from '@/db/datosSensibles'
import { estadoCasilla } from '@/db/medidasVista'
import SelloMedida from './SelloMedida'

export type Criterio = { id: string; descripcion: string }

/** Un instrumento con los criterios que evalúa en lo que se está viendo. */
export type ColumnaInstrumento = {
  ins: CeldaInstrumento
  criterios: Criterio[]
}

/** Un grupo de columnas: la familia y lo que hay dentro (o ella sola). */
export type GrupoFamilia = {
  id: number
  nombre: string
  peso: number
  columnas: ColumnaInstrumento[]
  /** La familia no tiene hijos aquí: la única columna es ella misma. */
  sola: boolean
}

/**
 * Invierte el mapa criterio → instrumentos de la matriz. Los instrumentos
 * salen en el orden del gestor (`orden`), que es el que el docente ha elegido;
 * los hijos, detrás de su familia.
 */
export function columnasPorInstrumento(matriz: MatrizEvaluacion, criterios: Criterio[]): ColumnaInstrumento[] {
  const porId = new Map<number, ColumnaInstrumento>()
  for (const cr of criterios) {
    for (const ins of matriz.porCriterio.get(cr.id) ?? []) {
      const col = porId.get(ins.instrumento_id) ?? { ins, criterios: [] }
      col.criterios.push(cr)
      porId.set(ins.instrumento_id, col)
    }
  }
  const orden = new Map(matriz.instrumentos.map((i, k) => [i.id!, k]))
  const clave = (c: ColumnaInstrumento) => [
    orden.get(c.ins.familia_id ?? c.ins.instrumento_id) ?? 999,
    c.ins.familia_id == null ? -1 : (orden.get(c.ins.instrumento_id) ?? 999),
  ]
  return [...porId.values()].sort((a, b) => {
    const [fa, ha] = clave(a), [fb, hb] = clave(b)
    return fa - fb || ha - hb
  })
}

/** Agrupa las columnas por familia, en el mismo orden. */
export function gruposPorFamilia(columnas: ColumnaInstrumento[]): GrupoFamilia[] {
  const grupos: GrupoFamilia[] = []
  for (const col of columnas) {
    const id = col.ins.familia_id ?? col.ins.instrumento_id
    let g = grupos.find(x => x.id === id)
    if (!g) {
      g = { id, nombre: col.ins.familia_nombre ?? col.ins.nombre, peso: col.ins.familia_peso, columnas: [], sola: col.ins.familia_id == null }
      grupos.push(g)
    }
    g.columnas.push(col)
    if (col.ins.familia_id != null) g.sola = false
  }
  return grupos
}

/** Una familia con peso en el área que no evalúa ningún criterio aquí. */
export type FamiliaSinCriterio = { id: number; nombre: string; peso: number }

/**
 * Familias que pesan en el área pero no tienen columna en lo que se mira:
 * ni ellas ni ninguno de sus hijos evalúan un criterio de esta unidad en
 * este trimestre. El porcentaje del gestor no crea columnas —la programación
 * manda—, así que sin este aviso parece que el cambio «no ha hecho nada»:
 * Luis puso un 20 % a «Proba escrita» y la matriz siguió igual. Las que no
 * aplican en el trimestre no cuentan: ese caso ya tiene su propio aviso.
 * Puro: se prueba sin pantalla.
 */
export function familiasSinCriterio(matriz: MatrizEvaluacion, columnas: ColumnaInstrumento[], trimestre: number): FamiliaSinCriterio[] {
  const ids = new Set(matriz.instrumentos.map(i => i.id!))
  const conColumna = new Set<number>()
  for (const col of columnas) {
    conColumna.add(col.ins.instrumento_id)
    if (col.ins.familia_id != null) conColumna.add(col.ins.familia_id)
  }
  return matriz.instrumentos
    .filter(i => (i.familia_id == null || !ids.has(i.familia_id)) && i.peso > 0)
    .filter(i => aplicaEnTrimestre(i.trimestres, trimestre) && !conColumna.has(i.id!))
    .map(i => ({ id: i.id!, nombre: i.nombre, peso: i.peso }))
}

export type ResumenCelda = {
  /** Media de las notas que el alumno tiene con el instrumento (null = ninguna). */
  valor: number | null
  /** Criterios con nota / criterios que evalúa. */
  conNota: number
  total: number
  /** Últimos niveles del diario, si los hay. */
  diario: number[] | null
}

/** Lo que resume una casilla alumno × instrumento. Puro: se prueba sin pantalla. */
export function resumenCelda(matriz: MatrizEvaluacion, alumnoId: number, col: ColumnaInstrumento, trimestre: number): ResumenCelda {
  let suma = 0, conNota = 0
  let diario: number[] | null = null
  for (const cr of col.criterios) {
    const c = matriz.calificaciones[`${alumnoId}:${cr.id}:${col.ins.instrumento_id}:${trimestre}`]
    if (c?.valor != null) { suma += c.valor; conNota++ }
    const d = matriz.diario[`${alumnoId}:${cr.id}:${col.ins.instrumento_id}`]
    if (d && (!diario || d.niveles.length > diario.length)) diario = d.niveles
  }
  return {
    valor: conNota ? Math.round((suma / conNota) * 10) / 10 : null,
    conNota, total: col.criterios.length, diario,
  }
}

/**
 * Las cabeceras salen plegadas: nombre y el botón de calificar. Tipo, peso,
 * criterios y «Pegar columna» se ven al desplegar. Decisión de Luis: con
 * cinco columnas y treinta criterios cada una, lo que importa —calificar—
 * quedaba enterrado bajo texto. Se recuerda en el aparato: es comodidad,
 * no dato.
 */
const CLAVE_CABECERAS = 'miclase.calificador.cabeceras'
function cabecerasGuardadas(): boolean {
  try { return localStorage.getItem(CLAVE_CABECERAS) === 'completas' } catch { return false }
}

function claseNota(v: number | null) {
  return v == null ? '' : `cal-${Math.round(v)}`
}

interface Props {
  matriz: MatrizEvaluacion
  /** Pulsar el sello ACI/RE de un alumno abre sus medidas. */
  onMedidas?: (alumno: Alumno) => void
  columnas: ColumnaInstrumento[]
  alumnos: Alumno[]
  trimestre: number
  /** Pulsar una casilla: abre el panel del alumno con ese instrumento. */
  onCelda: (alumnoIdx: number, col: ColumnaInstrumento) => void
  /** «Evaluar hoy»: pasada de clase con el diario. */
  onSesion: (col: ColumnaInstrumento) => void
  /** «Corregir»: el examen, alumno a alumno desde el primero. */
  onCorregir: (col: ColumnaInstrumento) => void
  /** «Pegar columna»: las notas de una hoja de cálculo. */
  onPegar: (col: ColumnaInstrumento) => void
  /** «Definir herramienta»: el instrumento no tiene rúbrica ni examen y no es de observación. */
  onDefinir: (col: ColumnaInstrumento) => void
  /** «Calificar» sin herramienta: la nota directa de toda la clase (`SesionNota`). Solo dentro de una unidad. */
  onNota?: (col: ColumnaInstrumento) => void
  /**
   * Renombrar el instrumento desde su cabecera, sin pasar por ⚙ Instrumentos.
   * Solo el nombre: tipo, peso y criterios siguen en el gestor, porque cambian
   * cómo se calcula la nota y no se tocan de pasada.
   */
  onRenombrar: (col: ColumnaInstrumento, nombre: string) => Promise<void>
  /** «Imprimir»: hojas de respuestas y examen de un test con clave. */
  onImprimir?: (col: ColumnaInstrumento) => void
  /** «Corregir por cámara»: la pila de hojas de respuestas. */
  onEscanear?: (col: ColumnaInstrumento) => void
  /** «Editar examen»: el editor entero (título, preguntas, reparto, unidad e instrumento) sin pasar por una casilla. */
  onEditarExamen?: (col: ColumnaInstrumento) => void
  /** «Informe»: qué preguntas y aspectos falla la clase con este examen. */
  onInforme?: (col: ColumnaInstrumento) => void
  /** «Vaciar columna»: quitar las notas de esta unidad y trimestre (quedan como fantasma). Solo dentro de una unidad. */
  onVaciar?: (col: ColumnaInstrumento) => void
  /** «Mover a otro instrumento»: las notas de esta unidad y trimestre, a otra columna. Solo dentro de una unidad. */
  onMover?: (col: ColumnaInstrumento) => void
  /**
   * Criterios de la unidad que se mira: los que se pueden asociar a una
   * columna desde su cabecera. Sin ellos (o fuera de una unidad) no se ofrece.
   */
  criteriosUnidad?: Criterio[]
  /** «+ criterio»: asociar un criterio de la unidad a este instrumento, aquí mismo. */
  onAsignarCriterio?: (col: ColumnaInstrumento, criterio_id: string) => void
  /** «×» en un criterio de la cabecera: el instrumento deja de evaluarlo en esta unidad (las notas se conservan). */
  onQuitarCriterio?: (col: ColumnaInstrumento, criterio_id: string) => void
}

export default function MatrizInstrumentos({ matriz, columnas, alumnos, trimestre, onCelda, onSesion, onCorregir, onPegar, onDefinir, onNota, onRenombrar, onImprimir, onEscanear, onEditarExamen, onInforme, onVaciar, onMover, criteriosUnidad, onAsignarCriterio, onQuitarCriterio, onMedidas }: Props) {
  const grupos = gruposPorFamilia(columnas)
  const hayFamilias = grupos.some(g => !g.sola)
  const [detalles, setDetalles] = useState(cabecerasGuardadas)
  /** Columna cuyo «Más» está abierto: sus acciones suben en una hoja desde abajo,
      que es donde llega el pulgar en una tablet, y la tabla no se mueve. */
  const [hoja, setHoja] = useState<number | null>(null)
  useEffect(() => {
    if (hoja == null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHoja(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hoja])
  /** Columna cuyo nombre se está editando, y el texto que lleva. */
  const [renombrando, setRenombrando] = useState<{ id: number; texto: string } | null>(null)
  const confirmarNombre = async (col: ColumnaInstrumento) => {
    if (!renombrando) return
    const v = renombrando.texto.trim()
    setRenombrando(null)
    if (v && v !== col.ins.nombre) await onRenombrar(col, v)
  }
  const alternarDetalles = () => {
    const v = !detalles
    setDetalles(v)
    try { localStorage.setItem(CLAVE_CABECERAS, v ? 'completas' : 'compactas') } catch { /* sin almacenamiento: no pasa nada */ }
  }
  const botonDetalles = (
    <button type="button" className="cabeceras-toggle" data-cabeceras-toggle aria-pressed={detalles}
      onClick={alternarDetalles}
      title={detalles ? 'Plegar todas las cabeceras: solo el nombre y el botón de calificar' : 'Desplegar «Más» en todas las columnas a la vez'}>
      {detalles ? '▴ Menos en todas' : '▾ Más en todas'}
    </button>
  )
  return (
    <div className="matriz-wrap">
      <table className={`matriz matriz-instrumentos${hayFamilias ? ' con-familias' : ''}${detalles ? '' : ' cabeceras-compactas'}`}>
        <thead>
          {/* Fila de familias: lo que pesa en el área. Solo si alguna tiene hijos;
              si no, sería repetir el nombre de cada columna encima de sí misma. */}
          {hayFamilias && (
            <tr className="fila-familias">
              <th className="col-alumno" scope="col" rowSpan={2}>
                Alumno
                <div style={{ fontSize: 10, fontWeight: 400, opacity: .7, marginTop: 2 }}>
                  {alumnos.length} · {columnas.length} instrumento{columnas.length !== 1 ? 's' : ''}
                </div>
                {botonDetalles}
              </th>
              {grupos.map(g => (
                <th key={g.id} scope="colgroup" colSpan={g.columnas.length} data-familia-th data-nombre={g.nombre}
                  style={{ borderTop: `4px solid ${g.columnas[0].ins.color}` }}
                  title={g.sola ? `${g.nombre} · ${g.peso}% del área` : `${g.nombre} · ${g.peso}% del área · dentro: ${g.columnas.map(c => c.ins.nombre).join(', ')}`}>
                  {g.sola ? <span style={{ opacity: .55 }}>—</span> : g.nombre}
                  <span className="peso">{g.peso}%</span>
                </th>
              ))}
            </tr>
          )}
          <tr className="fila-instrumentos">
            {!hayFamilias && (
              <th className="col-alumno" scope="col">
                Alumno
                <div style={{ fontSize: 10, fontWeight: 400, opacity: .7, marginTop: 2 }}>
                  {alumnos.length} · {columnas.length} instrumento{columnas.length !== 1 ? 's' : ''}
                </div>
                {botonDetalles}
              </th>
            )}
            {columnas.map(col => {
              const cfg = getInstrConfig(col.ins.tipo)
              const esExamen = col.ins.tipo === 'prueba-escrita'
              const ids = col.criterios.map(c => c.id)
              const esHijo = col.ins.familia_id != null
              // Sin rúbrica ni examen, y sin ser de observación, la columna no
              // tiene herramienta: se dice y se ofrece definirla aquí, no en
              // una casilla. «Evaluar hoy» (diario) queda como segunda opción.
              const sinHerramienta = faltaHerramienta(col.ins)
              /** Lo que no es la acción principal: datos de la columna, criterios y el
                  resto de acciones. Va en la hoja de «Más» o, con «Más en todas»,
                  desplegado en la cabecera. */
              const detalle = (enHoja: boolean): ReactNode => {
                const clase = enHoja ? 'hoja-accion' : 'instr-th-accion secundaria instr-th-detalle'
                return (<>
                  <div className="instr-th-tipo instr-th-detalle">
                    {cfg.label}{esHijo ? ` · ${col.ins.pct_familia} % de ${col.ins.familia_nombre}` : ` · ${col.ins.peso}%`}
                    {col.ins.tiene_prueba ? (col.ins.prueba_de_unidad ? ` · examen de «${col.ins.prueba_de_unidad}»` : ' · examen') : esExamen ? ' · examen sin definir' : col.ins.tiene_rubrica ? ' · rúbrica' : sinHerramienta ? ' · sin herramienta' : ` · diario (${etiquetaAgregacion(col.ins.agregacion).toLowerCase()})`}
                  </div>
                  {/* Los criterios que cubre; quien necesite la lista la lee de `data-criterios`
                      en el <th>, no de este texto. Dentro de una unidad cada uno se puede
                      quitar y se puede asociar otro aquí mismo, sin pasar por 📋 Programación:
                      Luis quería hacerlo desde la columna de la prueba y no podía. */}
                  <div className={`instr-th-criterios instr-th-detalle${onQuitarCriterio ? ' editable' : ''}`}>
                    {ids.length} criterio{ids.length !== 1 ? 's' : ''}:{' '}
                    {onQuitarCriterio ? ids.map(id => (
                      <span key={id} className="instr-th-criterio" data-criterio-chip={id}>
                        {id}
                        <button type="button" data-criterio-quitar aria-label={`Que «${col.ins.nombre}» deje de evaluar ${id} en esta unidad`}
                          title={`Quitar ${id} de «${col.ins.nombre}» en esta unidad (las notas se conservan)`}
                          onClick={() => onQuitarCriterio(col, id)}>×</button>
                      </span>
                    )) : ids.join(' · ')}
                    {onAsignarCriterio && criteriosUnidad && criteriosUnidad.some(c => !ids.includes(c.id)) && (
                      <select className="instr-th-criterio-anadir" data-criterio-anadir value="" aria-label={`Asociar un criterio a «${col.ins.nombre}» en esta unidad`}
                        title="Que este instrumento evalúe también otro criterio de la unidad"
                        onChange={e => { const v = e.target.value; e.target.value = ''; if (v) onAsignarCriterio(col, v) }}>
                        <option value="">+ criterio</option>
                        {criteriosUnidad.filter(c => !ids.includes(c.id)).map(c => (
                          <option key={c.id} value={c.id}>{c.id} — {c.descripcion.slice(0, 70)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className={enHoja ? 'hoja-acciones' : undefined} style={enHoja ? undefined : { display: 'contents' }}>
                    {!esExamen && sinHerramienta && onNota && (
                      <button type="button" className={clase} data-herramienta-definir
                        onClick={() => onDefinir(col)}
                        title="Elegir con qué se evalúa: rúbrica, lista de control o escala de estimación">
                        Definir herramienta
                      </button>
                    )}
                    {!esExamen && sinHerramienta && (
                      <button type="button" className={clase} data-sesion-abrir
                        onClick={() => onSesion(col)}
                        title="Pasar por toda la clase hoy: un nivel por alumno, en el diario">
                        Evaluar hoy, sin herramienta
                      </button>
                    )}
                    {/* De observación, el diario es su herramienta y va primero; pero
                        si el docente prefiere una rúbrica, la define aquí, no en una casilla. */}
                    {!esExamen && !sinHerramienta && !col.ins.tiene_rubrica && (
                      <button type="button" className={clase} data-herramienta-definir
                        onClick={() => onDefinir(col)}
                        title="Evaluar este instrumento con rúbrica, lista de control o escala en vez del diario">
                        Definir una rúbrica
                      </button>
                    )}
                  {esExamen && col.ins.tiene_prueba && onEscanear && (
                    <button type="button" className={clase} data-escanear-abrir
                      onClick={() => onEscanear(col)}
                      title="Corregir las hojas de respuestas con la cámara, una tras otra">
                      Corregir por cámara
                    </button>
                  )}
                  {esExamen && col.ins.tiene_prueba && onInforme && (
                    <button type="button" className={clase} data-informe-abrir
                      onClick={() => onInforme(col)}
                      title="Qué preguntas, criterios y aspectos falla la clase con este examen; se imprime o se guarda">
                      Informe de la prueba
                    </button>
                  )}
                  {/* Editar el examen entero es ocasional: plegado, con «Imprimir test». */}
                  {esExamen && col.ins.tiene_prueba && onEditarExamen && (
                    <button type="button" className={clase} data-editar-examen
                      onClick={() => onEditarExamen(col)}
                      title="Cambiar el examen: título, preguntas, reparto por criterios, o moverlo a otra unidad o instrumento">
                      Editar el examen
                    </button>
                  )}
                  {/* Imprimir es previo al examen y ocasional: plegado, con «Pegar columna». */}
                  {esExamen && col.ins.tiene_prueba && onImprimir && (
                    <button type="button" className={clase} data-imprimir-abrir
                      onClick={() => onImprimir(col)}
                      title="Imprimir las hojas de respuestas de la clase y el examen del alumnado">
                      Imprimir el test
                    </button>
                  )}
                  <button type="button" className={clase} data-pegar-abrir
                    onClick={() => onPegar(col)}
                    title="Pegar una columna de notas copiada de tu hoja de cálculo">
                    Pegar notas de Excel
                  </button>
                  {/* Lo que hay en esta columna, en ESTA unidad y trimestre, se puede
                      vaciar (queda como fantasma) o llevar a otro instrumento. Luis puso
                      una prueba del 20 % en la columna del 80 % y no podía deshacerlo. */}
                  {onMover && (
                    <button type="button" className={clase} data-mover-columna
                      onClick={() => onMover(col)}
                      title="Llevar las notas de esta columna, solo en esta unidad y trimestre, a otro instrumento">
                      Mover a otra columna
                    </button>
                  )}
                  {onVaciar && (
                    <button type="button" className={`${clase}${enHoja ? ' peligro' : ''}`} data-vaciar-columna
                      onClick={() => onVaciar(col)}
                      title="Quitar las notas de esta columna, solo en esta unidad y trimestre; quedan como nota anterior, recuperables">
                      Vaciar la columna
                    </button>
                  )}
                  </div>
                </>)
              }
              return (
                <th key={col.ins.instrumento_id} scope="col" className="instr-th"
                  data-instr-th data-nombre={col.ins.nombre} data-tipo={col.ins.tipo} data-con-examen={col.ins.tiene_prueba || undefined}
                  data-familia={col.ins.familia_id ?? undefined} data-criterios={ids.join(' ')}
                  style={{ borderTop: hayFamilias ? 'none' : `4px solid ${col.ins.color}`, boxShadow: `inset 4px 0 0 ${col.ins.color}` }}
                  title={col.criterios.map(c => `${c.id} — ${c.descripcion}`).join('\n')}>
                  {renombrando?.id === col.ins.instrumento_id ? (
                    <input className="instr-th-renombrar" data-renombrar-campo autoFocus aria-label="Nuevo nombre del instrumento"
                      value={renombrando.texto}
                      onChange={e => setRenombrando({ id: col.ins.instrumento_id, texto: e.target.value })}
                      onBlur={() => confirmarNombre(col)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') setRenombrando(null)
                      }} />
                  ) : (
                    <div className="instr-th-nombre">
                      <span className="abrev" style={{ background: col.ins.color }}>{abreviatura(col.ins.nombre)}</span>
                      <span aria-hidden="true">{cfg.icon}</span> {col.ins.nombre}
                      <button type="button" className="instr-th-lapiz" data-renombrar-abrir aria-label={`Renombrar «${col.ins.nombre}»`}
                        title="Cambiar el nombre de este instrumento (el tipo, el peso y los criterios se cambian en ⚙ Instrumentos)"
                        onClick={() => setRenombrando({ id: col.ins.instrumento_id, texto: col.ins.nombre })}>✎</button>
                    </div>
                  )}
                  {esExamen ? (
                    <button type="button" className="instr-th-accion" data-corregir-abrir
                      onClick={() => onCorregir(col)}
                      title={col.ins.tiene_prueba
                        ? 'Corregir el examen alumno a alumno, pregunta a pregunta'
                        : 'Definir el examen y corregirlo alumno a alumno'}>
                      {col.ins.tiene_prueba ? 'Calificar' : 'Definir el examen'}
                    </button>
                  ) : (<>
                    {/* Sin examen ni rúbrica y sin ser de observación: «Calificar» abre la
                        nota directa de toda la clase, que dice que no hay herramienta y
                        ofrece definirla. Definirla desde aquí va en «Más». */}
                    {sinHerramienta && onNota && (
                      <button type="button" className="instr-th-accion" data-nota-abrir
                        onClick={() => onNota(col)}
                        title="Poner la nota a toda la clase, un alumno tras otro: cinco calificativos o la nota exacta">
                        Calificar
                      </button>
                    )}
                    {sinHerramienta && !onNota && (
                      <button type="button" className="instr-th-accion" data-herramienta-definir
                        onClick={() => onDefinir(col)}
                        title="Elegir con qué se evalúa: rúbrica, lista de control o escala de estimación">
                        Definir herramienta
                      </button>
                    )}
                    {!sinHerramienta && (
                      <button type="button" className="instr-th-accion" data-sesion-abrir
                        onClick={() => onSesion(col)}
                        title={col.ins.tiene_rubrica
                          ? 'Pasar por toda la clase con la rúbrica a la vista: un nivel por alumno'
                          : 'Pasar por toda la clase hoy: un nivel por alumno, en el diario'}>
                        Calificar
                      </button>
                    )}
                  </>)}
                  {/* Una sola acción a la vista; lo demás, tras el «Más» de ESTA columna,
                      que sube en una hoja desde abajo. Con «Más en todas» va todo
                      desplegado en la cabecera y este botón sobra. */}
                  <button type="button" className="instr-th-mas" data-columna-mas aria-haspopup="dialog" aria-expanded={detalles || hoja === col.ins.instrumento_id}
                    aria-label={`Más acciones de «${col.ins.nombre}»`} disabled={detalles}
                    title="Tipo, peso y criterios de la columna, y el resto de acciones: cámara, examen, informe, pegar, mover, vaciar"
                    onClick={() => setHoja(col.ins.instrumento_id)}>
                    Más
                  </button>
                  {/* Siempre en la cabecera, aunque plegado no ocupe sitio: lo enseña «Más en todas». */}
                  {detalle(false)}
                  {hoja === col.ins.instrumento_id && !detalles && createPortal(
                    <div className="modal-overlay hoja-velo" onClick={e => { if (e.target === e.currentTarget) setHoja(null) }}>
                      <div className="hoja-columna" role="dialog" aria-modal="true" aria-label={`Más acciones de «${col.ins.nombre}»`}
                        data-hoja-columna data-nombre={col.ins.nombre} style={{ borderTop: `6px solid ${col.ins.color}` }}
                        // Una acción abre su propia pantalla: la hoja se quita de en medio.
                        onClick={e => { if ((e.target as HTMLElement).closest('button.hoja-accion')) setHoja(null) }}>
                        <div className="hoja-cabecera">
                          <div className="hoja-titulo">
                            <span className="abrev" style={{ background: col.ins.color }}>{abreviatura(col.ins.nombre)}</span>
                            {col.ins.nombre}
                          </div>
                          <button type="button" className="modal-close" data-hoja-cerrar aria-label="Cerrar" onClick={() => setHoja(null)}>✕</button>
                        </div>
                        {detalle(true)}
                      </div>
                    </div>,
                    document.body,
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {alumnos.map((al, idx) => (
            <tr key={al.id}>
              <td className="col-alumno">
                {al.apellidos}, {al.nombre}
                {al.neae && verNeae() ? <span style={{ marginLeft: 6, fontSize: 9.5, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
                <SelloMedida medidas={matriz.medidas.get(al.id!)} onClick={onMedidas ? () => onMedidas(al) : undefined} />
              </td>
              {columnas.map(col => {
                const r = resumenCelda(matriz, al.id!, col, trimestre)
                const parcial = r.conNota > 0 && r.conNota < r.total
                // Con una medida, la columna puede no contar para este alumno
                // (instrumento excluido o solo para alumnado con medida). La
                // nota sigue ahí y se puede abrir: solo se avisa.
                const medidasAl = matriz.medidas.get(al.id!)
                const noCuenta = col.criterios.length
                  ? col.criterios.map(cr => estadoCasilla(matriz.instrumentos, medidasAl, cr.id, [col.ins.instrumento_id], trimestre).noCuenta)
                  : []
                const apagada = noCuenta.length > 0 && noCuenta.every(Boolean) ? noCuenta[0]! : null
                return (
                  <td key={col.ins.instrumento_id} className="celda">
                    <button type="button" className={`celda-btn ${claseNota(r.valor)}${apagada ? ' no-cuenta' : ''}`} data-celda-instr
                      data-no-cuenta={apagada ? '' : undefined}
                      onClick={() => onCelda(idx, col)}
                      title={`${al.apellidos}, ${al.nombre} · ${col.ins.nombre}\n${r.valor == null ? 'Sin calificar' : `Media: ${r.valor} (${r.conNota} de ${r.total} criterios con nota)`}${r.diario ? `\nDiario: ${r.diario.join(' · ')}` : ''}${apagada ? `\n${apagada}` : ''}`}>
                      <span>{r.valor == null ? '·' : r.valor}</span>
                      {(parcial || r.diario) && (
                        <span className="celda-instr">
                          {parcial && <b title={`${r.conNota} de ${r.total} criterios con nota`}>{r.conNota}/{r.total}</b>}
                          {r.diario && <small className="celda-diario">{miniTendencia(r.diario)}</small>}
                        </span>
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
