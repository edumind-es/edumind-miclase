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
import { getInstrConfig } from '@/ia/instrumentosConfig'
import { etiquetaAgregacion, miniTendencia } from '@/db/diario'
import type { CeldaInstrumento, MatrizEvaluacion } from '@/db/queries'
import type { Alumno } from '@/db/localDb'

export type Criterio = { id: string; descripcion: string }

/** Un instrumento con los criterios que evalúa en lo que se está viendo. */
export type ColumnaInstrumento = {
  ins: CeldaInstrumento
  criterios: Criterio[]
}

/**
 * Invierte el mapa criterio → instrumentos de la matriz. Los instrumentos
 * salen en el orden del gestor (`orden`), que es el que el docente ha elegido.
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
  return [...porId.values()].sort((a, b) =>
    (orden.get(a.ins.instrumento_id) ?? 999) - (orden.get(b.ins.instrumento_id) ?? 999))
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
}

export default function MatrizInstrumentos({ matriz, columnas, alumnos, trimestre, onCelda, onSesion, onCorregir }: Props) {
  return (
    <div className="matriz-wrap">
      <table className="matriz matriz-instrumentos">
        <thead>
          <tr>
            <th className="col-alumno" scope="col">
              Alumno
              <div style={{ fontSize: 10, fontWeight: 400, opacity: .7, marginTop: 2 }}>
                {alumnos.length} · {columnas.length} instrumento{columnas.length !== 1 ? 's' : ''}
              </div>
            </th>
            {columnas.map(col => {
              const cfg = getInstrConfig(col.ins.tipo)
              const esExamen = col.ins.tipo === 'prueba-escrita'
              const ids = col.criterios.map(c => c.id)
              return (
                <th key={col.ins.instrumento_id} scope="col" className="instr-th"
                  data-instr-th data-nombre={col.ins.nombre} data-tipo={col.ins.tipo} data-con-examen={col.ins.tiene_prueba || undefined}
                  style={{ borderTop: `4px solid ${cfg.color}` }}
                  title={col.criterios.map(c => `${c.id} — ${c.descripcion}`).join('\n')}>
                  <div className="instr-th-nombre">
                    <span aria-hidden="true">{cfg.icon}</span> {col.ins.nombre}
                  </div>
                  <div className="instr-th-tipo">
                    {cfg.label} · {col.ins.peso}%
                    {col.ins.tiene_prueba ? ' · examen' : esExamen ? ' · examen sin definir' : col.ins.tiene_rubrica ? ' · rúbrica' : ` · diario (${etiquetaAgregacion(col.ins.agregacion).toLowerCase()})`}
                  </div>
                  <div className="instr-th-criterios">
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
                  ) : (
                    <button type="button" className="instr-th-accion" data-sesion-abrir
                      onClick={() => onSesion(col)}
                      title="Pasar por toda la clase hoy: un nivel por alumno, en el diario">
                      ✓ Evaluar hoy
                    </button>
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
