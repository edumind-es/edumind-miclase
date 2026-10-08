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
import { useState } from 'react'
import { getInstrConfig, abreviatura } from '@/ia/instrumentosConfig'
import { etiquetaAgregacion, miniTendencia } from '@/db/diario'
import { faltaHerramienta } from './ElegirHerramienta'
import type { CeldaInstrumento, MatrizEvaluacion } from '@/db/queries'
import type { Alumno } from '@/db/localDb'

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
}

export default function MatrizInstrumentos({ matriz, columnas, alumnos, trimestre, onCelda, onSesion, onCorregir, onPegar, onDefinir }: Props) {
  const grupos = gruposPorFamilia(columnas)
  const hayFamilias = grupos.some(g => !g.sola)
  const [detalles, setDetalles] = useState(cabecerasGuardadas)
  const alternarDetalles = () => {
    const v = !detalles
    setDetalles(v)
    try { localStorage.setItem(CLAVE_CABECERAS, v ? 'completas' : 'compactas') } catch { /* sin almacenamiento: no pasa nada */ }
  }
  const botonDetalles = (
    <button type="button" className="cabeceras-toggle" data-cabeceras-toggle aria-pressed={detalles}
      onClick={alternarDetalles}
      title={detalles ? 'Plegar las cabeceras: solo el nombre y el botón de calificar' : 'Ver tipo, peso, criterios y «Pegar columna» de cada instrumento'}>
      {detalles ? '▴ menos' : '▾ detalles'}
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
              return (
                <th key={col.ins.instrumento_id} scope="col" className="instr-th"
                  data-instr-th data-nombre={col.ins.nombre} data-tipo={col.ins.tipo} data-con-examen={col.ins.tiene_prueba || undefined}
                  data-familia={col.ins.familia_id ?? undefined}
                  style={{ borderTop: hayFamilias ? 'none' : `4px solid ${col.ins.color}`, boxShadow: `inset 4px 0 0 ${col.ins.color}` }}
                  title={col.criterios.map(c => `${c.id} — ${c.descripcion}`).join('\n')}>
                  <div className="instr-th-nombre">
                    <span className="abrev" style={{ background: col.ins.color }}>{abreviatura(col.ins.nombre)}</span>
                    <span aria-hidden="true">{cfg.icon}</span> {col.ins.nombre}
                  </div>
                  <div className="instr-th-tipo instr-th-detalle">
                    {cfg.label}{esHijo ? ` · peso ${col.ins.peso}` : ` · ${col.ins.peso}%`}
                    {col.ins.tiene_prueba ? ' · examen' : esExamen ? ' · examen sin definir' : col.ins.tiene_rubrica ? ' · rúbrica' : sinHerramienta ? ' · sin herramienta' : ` · diario (${etiquetaAgregacion(col.ins.agregacion).toLowerCase()})`}
                  </div>
                  <div className="instr-th-criterios instr-th-detalle">
                    {ids.length} criterio{ids.length !== 1 ? 's' : ''}: {ids.join(' · ')}
                  </div>
                  {esExamen ? (
                    <button type="button" className="instr-th-accion" data-corregir-abrir
                      onClick={() => onCorregir(col)}
                      title={col.ins.tiene_prueba
                        ? 'Corregir el examen alumno a alumno, pregunta a pregunta'
                        : 'Definir el examen y corregirlo alumno a alumno'}>
                      {col.ins.tiene_prueba ? '📝 Corregir' : '📝 Definir y corregir'}
                    </button>
                  ) : (<>
                    {sinHerramienta && (
                      <button type="button" className="instr-th-accion" data-herramienta-definir
                        onClick={() => onDefinir(col)}
                        title="Elegir con qué se evalúa: rúbrica, lista de control o escala de estimación">
                        📊 Definir herramienta
                      </button>
                    )}
                    <button type="button" className={`instr-th-accion${sinHerramienta ? ' secundaria' : ''}`} data-sesion-abrir
                      onClick={() => onSesion(col)}
                      title={col.ins.tiene_rubrica
                        ? 'Pasar por toda la clase con la rúbrica a la vista: un nivel por alumno'
                        : 'Pasar por toda la clase hoy: un nivel por alumno, en el diario'}>
                      {col.ins.tiene_rubrica ? '📊 Calificar con la rúbrica' : '✓ Evaluar hoy'}
                    </button>
                  </>)}
                  <button type="button" className="instr-th-accion secundaria instr-th-detalle" data-pegar-abrir
                    onClick={() => onPegar(col)}
                    title="Pegar una columna de notas copiada de tu hoja de cálculo">
                    📋 Pegar columna
                  </button>
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
                {al.neae ? <span style={{ marginLeft: 6, fontSize: 9.5, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
              </td>
              {columnas.map(col => {
                const r = resumenCelda(matriz, al.id!, col, trimestre)
                const parcial = r.conNota > 0 && r.conNota < r.total
                return (
                  <td key={col.ins.instrumento_id} className="celda">
                    <button type="button" className={`celda-btn ${claseNota(r.valor)}`} data-celda-instr
                      onClick={() => onCelda(idx, col)}
                      title={`${al.apellidos}, ${al.nombre} · ${col.ins.nombre}\n${r.valor == null ? 'Sin calificar' : `Media: ${r.valor} (${r.conNota} de ${r.total} criterios con nota)`}${r.diario ? `\nDiario: ${r.diario.join(' · ')}` : ''}`}>
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
