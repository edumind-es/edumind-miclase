/**
 * «Todo el curso»: los tres trimestres a la vez, de solo lectura.
 *
 * El selector de trimestre de la barra no manda aquí —manda en las
 * unidades—: cada criterio (o cada familia) lleva sus columnas 1T · 2T · 3T
 * y la final. Decisión de Luis: en el resumen solo trimestres, nunca
 * unidades, que ya tienen su pestaña; y el nivel que resume es el de la
 * programación, las familias («Táboa de indicadores», «Proba escrita») con
 * los hijos plegados dentro.
 *
 * Nada se calcula aquí. La vista por criterio enseña `calcularNotaArea`
 * (`criterios[].trimestres` y `.final`, lo mismo que el boletín); la vista
 * por familia promedia las notas virtuales que ya funde la matriz. Pulsar una
 * casilla abre «de dónde sale esta nota» con ese trimestre, nunca el panel.
 */
import { Fragment, useState, type ReactNode } from 'react'
import type { ResumenCurso as DatosResumen } from '@/db/queries'
import { agruparPorCompetencia, mediaDe } from '@/db/cobertura'
import { familiasDelCurso, mediaEnCriterios, criteriosDelCurso, TRIMESTRES_CURSO, type Criterio, type FamiliaCurso } from '@/db/resumenCurso'
import { getInstrConfig, abreviatura } from '@/ia/instrumentosConfig'
import type { Alumno } from '@/db/localDb'

/** Lo que pide una casilla al pulsarla: qué nota y de qué trimestre (null = la final). */
export type PeticionExplicacion = {
  alumnoIdx: number
  trimestre: number | null
  criterio?: Criterio
  instrumento?: { id: number; nombre: string; criterios: Criterio[] }
}

interface Props {
  datos: DatosResumen
  /** Criterios del currículo del área, en su orden. */
  criterios: Criterio[]
  vista: 'criterios' | 'instrumentos'
  /** Competencias plegadas a una columna por trimestre (vista por criterio). */
  plegadas: Set<string>
  alternarPlegada: (numero: string) => void
  onExplicar: (p: PeticionExplicacion) => void
  /** Un criterio sin instrumento en ningún trimestre: se explica cómo arreglarlo, como en una unidad. */
  onSinInstrumento: (criterio: Criterio) => void
}

type Columna = number | 'final'
const CON_FINAL: Columna[] = [1, 2, 3, 'final']
const SIN_FINAL: Columna[] = [1, 2, 3]

const r1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10)
const claseNota = (v: number | null) => (v == null ? '' : `cal-${Math.round(v)}`)
const etiqueta = (c: Columna) => (c === 'final' ? 'Final' : `${c}T`)
const trimestreDe = (c: Columna) => (c === 'final' ? null : c)

/** Rótulos de las columnas de un grupo, alineados con sus casillas. */
function Etiquetas({ columnas }: { columnas: Columna[] }) {
  return (
    <div className="th-trimestres" aria-hidden="true">
      {columnas.map(c => <span key={String(c)} className={c === 'final' ? 'final' : ''}>{etiqueta(c)}</span>)}
    </div>
  )
}

export default function ResumenCurso({ datos, criterios, vista, plegadas, alternarPlegada, onExplicar, onSinInstrumento }: Props) {
  const { alumnos, notas, porTrimestre } = datos
  /** Familias con los hijos a la vista (no se recuerda: es un vistazo). */
  const [desplegadas, setDesplegadas] = useState<Set<number>>(new Set())
  const alternarFamilia = (id: number) => setDesplegadas(prev => {
    const s = new Set(prev)
    if (s.has(id)) s.delete(id); else s.add(id)
    return s
  })

  const notaCriterio = (al: Alumno, criterioId: string, c: Columna): number | null => {
    const nc = notas.get(al.id!)?.criterios.find(x => x.criterio_id === criterioId)
    return r1(c === 'final' ? nc?.final : nc?.trimestres[c])
  }
  const notaArea = (al: Alumno, c: Columna): number | null => {
    const n = notas.get(al.id!)
    return r1(c === 'final' ? n?.final : n?.trimestres[c])
  }

  /** Una casilla del resumen: la nota y, al pulsar, su explicación. */
  const casilla = (
    clave: string, valor: number | null, c: Columna, titulo: string, onClick: () => void,
    datosExtra: Record<string, string | undefined> = {}, extra?: ReactNode,
  ) => (
    <td key={clave} className={`celda sub${c === 'final' ? ' final' : ''}`}>
      <button type="button" className={`celda-btn solo-lectura ${claseNota(valor)}`} data-celda-resumen
        data-trimestre={String(c)} {...datosExtra} onClick={onClick}
        title={`${titulo}\n${etiqueta(c) === 'Final' ? 'Nota final del curso' : `${c}º trimestre`}${valor == null ? ' · sin nota' : ` · ${valor}`}\nPulsa para ver de dónde sale`}>
        <span>{valor == null ? '·' : valor}</span>
        {extra}
      </button>
    </td>
  )

  const nombre = (al: Alumno) => `${al.apellidos}, ${al.nombre}`
  const alumnoTd = (al: Alumno) => (
    <td className="col-alumno">
      {nombre(al)}
      {al.neae ? <span style={{ marginLeft: 6, fontSize: 9.5, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
    </td>
  )

  /** El grupo «Área», al final de las dos vistas: la nota del boletín. */
  const thArea = (
    <th scope="col" className="criterio-th area-th grupo-fin" colSpan={CON_FINAL.length} data-area-th>
      <div className="criterio-th-id">Nota del área</div>
      <div className="criterio-th-desc">media de los criterios, ponderada por su peso; la final, por el peso de cada trimestre</div>
      <Etiquetas columnas={CON_FINAL} />
    </th>
  )
  const tdsArea = (al: Alumno, idx: number) => CON_FINAL.map(c =>
    casilla(`area-${c}`, notaArea(al, c), c, `${nombre(al)} · ${datos.asig.nombre_display}`,
      () => onExplicar({ alumnoIdx: idx, trimestre: trimestreDe(c) }), { 'data-area': '' }))

  // ── Vista por criterio ──────────────────────────────────────────────
  if (vista === 'criterios') {
    const competencias = agruparPorCompetencia(criterios).map(g => ({ ...g, plegada: plegadas.has(g.numero) }))
    /** Con qué se evalúa un criterio en algún trimestre (para la franja y el aviso). */
    const cabecerasDe = (cr: Criterio) => {
      const vistos = new Map<number, { nombre: string; peso: number; color: string }>()
      for (const t of TRIMESTRES_CURSO) {
        for (const i of porTrimestre[t]?.porCriterio.get(cr.id) ?? []) {
          const id = i.familia_id ?? i.instrumento_id
          if (!vistos.has(id)) vistos.set(id, { nombre: i.familia_nombre ?? i.nombre, peso: i.familia_peso, color: i.color })
        }
      }
      return [...vistos.values()]
    }
    const sinInstrumento = (cr: Criterio) => cabecerasDe(cr).length === 0
    /** Casilla rayada de un criterio que la programación no evalúa con nada, como en una unidad. */
    const tdSinInstrumento = (cr: Criterio, c: Columna) => (
      <td key={`${cr.id}-${c}`} className={`celda sub${c === 'final' ? ' final' : ''}`}>
        <button type="button" className="celda-btn sin-instrumento" data-celda-resumen data-criterio={cr.id} data-trimestre={String(c)}
          onClick={() => onSinInstrumento(cr)} title={`${cr.id} — sin instrumento asignado. Pulsa para saber cómo arreglarlo.`}>
          <span>sin instr.</span>
        </button>
      </td>
    )
    return (
      <div className="matriz-wrap">
        <table className="matriz matriz-criterios matriz-resumen" data-matriz-resumen="criterios">
          <thead>
            <tr className="fila-competencias">
              <th className="col-alumno" scope="col" rowSpan={2}>
                Alumno
                <div style={{ fontSize: 10, fontWeight: 400, opacity: .7, marginTop: 2 }}>{alumnos.length} · {criterios.length} criterios · 3 trimestres</div>
              </th>
              {competencias.map(g => (
                <th key={g.numero} scope="colgroup" data-competencia-th={g.etiqueta} aria-pressed={g.plegada}
                  colSpan={(g.plegada ? 1 : g.criterios.length) * CON_FINAL.length}
                  onClick={() => alternarPlegada(g.numero)}
                  title={g.plegada ? `Desplegar ${g.etiqueta}: ${g.criterios.map(c => c.id).join(', ')}` : `Plegar ${g.etiqueta} en una sola columna por trimestre, con la media`}>
                  <span className="comp-flecha">{g.plegada ? '▸' : '▾'}</span> {g.etiqueta}
                  <span className="peso">{g.criterios.length}</span>
                </th>
              ))}
              <th scope="colgroup" colSpan={CON_FINAL.length} data-area-grupo>Área</th>
            </tr>
            <tr>
              {competencias.flatMap(g => g.plegada ? [
                <th key={`plegado-${g.numero}`} scope="col" className="criterio-th plegado grupo-fin" colSpan={CON_FINAL.length} data-plegado={g.etiqueta}
                  onClick={() => alternarPlegada(g.numero)} title={`${g.etiqueta}: ${g.criterios.map(c => c.id).join(', ')}. Pulsa para desplegar.`}>
                  <div className="criterio-th-id">{g.etiqueta} ▸</div>
                  <div className="criterio-th-desc">{g.criterios.length} criterios plegados · media por trimestre</div>
                  <Etiquetas columnas={CON_FINAL} />
                </th>,
              ] : g.criterios.map(cr => {
                const cabs = cabecerasDe(cr)
                return (
                  <th key={cr.id} scope="col" className="criterio-th grupo-fin" colSpan={CON_FINAL.length} data-criterio-th={cr.id}
                    title={`${cr.id} — ${cr.descripcion}${cabs.length ? `\nSe evalúa con: ${cabs.map(c => c.nombre).join(', ')}` : '\nSin instrumento en la programación'}`}>
                    {cabs.length > 0 && (
                      <div className="criterio-th-franja" aria-hidden="true">
                        {cabs.map(cab => <span key={cab.nombre} style={{ background: cab.color }} />)}
                      </div>
                    )}
                    <div className="criterio-th-id">{cr.id}</div>
                    <div className="criterio-th-desc">{cr.descripcion}</div>
                    <div className="criterio-th-instr">
                      {cabs.length === 0
                        ? <span className="aviso" title="Sin instrumento asignado en la programación">⚠</span>
                        : cabs.map(cab => <i key={cab.nombre} className="abrev" style={{ background: cab.color }} title={`${cab.nombre} · ${cab.peso}%`}>{abreviatura(cab.nombre)}</i>)}
                    </div>
                    <Etiquetas columnas={CON_FINAL} />
                  </th>
                )
              }))}
              {thArea}
            </tr>
          </thead>
          <tbody>
            {alumnos.map((al, idx) => (
              <tr key={al.id}>
                {alumnoTd(al)}
                {competencias.flatMap(g => g.plegada
                  ? CON_FINAL.map(c => {
                      const { media, conNota } = mediaDe(g.criterios.map(cr => notaCriterio(al, cr.id, c)))
                      if (media == null && g.criterios.every(sinInstrumento)) {
                        return (
                          <td key={`plegado-${g.numero}-${c}`} className={`celda sub plegado${c === 'final' ? ' final' : ''}`}>
                            <button type="button" className="celda-btn sin-instrumento" data-celda-plegada data-trimestre={String(c)}
                              onClick={() => alternarPlegada(g.numero)} title={`${g.etiqueta}: ningún criterio tiene instrumento asignado. Pulsa para desplegar.`}>
                              <span>sin instr.</span>
                            </button>
                          </td>
                        )
                      }
                      return (
                        <td key={`plegado-${g.numero}-${c}`} className={`celda sub plegado${c === 'final' ? ' final' : ''}`}>
                          <button type="button" className={`celda-btn ${claseNota(media)}`} data-celda-plegada data-trimestre={String(c)}
                            onClick={() => alternarPlegada(g.numero)}
                            title={`${nombre(al)} · ${g.etiqueta} · ${etiqueta(c)}: media de ${conNota} de ${g.criterios.length} criterios. Pulsa para desplegar.`}>
                            <span>{media == null ? '·' : media}</span>
                            {conNota > 0 && conNota < g.criterios.length && <span className="celda-instr"><b>{conNota}/{g.criterios.length}</b></span>}
                          </button>
                        </td>
                      )
                    })
                  : g.criterios.flatMap(cr => CON_FINAL.map(c =>
                      sinInstrumento(cr) && notaCriterio(al, cr.id, c) == null
                        ? tdSinInstrumento(cr, c)
                        : casilla(`${cr.id}-${c}`, notaCriterio(al, cr.id, c), c, `${nombre(al)} · ${cr.id}`,
                            () => onExplicar({ alumnoIdx: idx, trimestre: trimestreDe(c), criterio: cr }), { 'data-criterio': cr.id }))))}
                {tdsArea(al, idx)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Vista por familia ───────────────────────────────────────────────
  const familias = familiasDelCurso(porTrimestre, criterios)
  if (familias.length === 0) {
    return (
      <div className="card" style={{ padding: 32, color: 'var(--gris-600)' }}>
        Ningún instrumento evalúa criterios de esta área en ningún trimestre.
        Asigna instrumentos a los criterios en la programación y aparecerán aquí como columnas.
      </div>
    )
  }
  /** Las columnas de un grupo: la familia y, si está desplegada, sus hijos. */
  const columnasDe = (f: FamiliaCurso) => [
    { id: f.id, nombre: f.nombre, tipo: f.tipo, color: f.color, pct: null as number | null, criterios: f.criterios, esFamilia: true },
    ...(desplegadas.has(f.id) ? f.hijos.map(h => ({ ...h, esFamilia: false })) : []),
  ]
  const explicarInstrumento = (idx: number, col: ReturnType<typeof columnasDe>[number], c: Columna) =>
    onExplicar({
      alumnoIdx: idx, trimestre: trimestreDe(c),
      instrumento: { id: col.id, nombre: col.nombre, criterios: c === 'final' ? criteriosDelCurso(col.criterios) : (col.criterios[c] ?? []) },
    })

  return (
    <div className="matriz-wrap">
      <table className="matriz matriz-instrumentos con-familias matriz-resumen" data-matriz-resumen="instrumentos">
        <thead>
          <tr className="fila-familias">
            <th className="col-alumno" scope="col" rowSpan={2}>
              Alumno
              <div style={{ fontSize: 10, fontWeight: 400, opacity: .7, marginTop: 2 }}>
                {alumnos.length} · {familias.length} familia{familias.length !== 1 ? 's' : ''} · 3 trimestres
              </div>
            </th>
            {familias.map(f => (
              <th key={f.id} scope="colgroup" colSpan={columnasDe(f).length * SIN_FINAL.length} data-familia-th data-nombre={f.nombre}
                className={f.hijos.length ? 'con-hijos' : ''} aria-pressed={f.hijos.length ? desplegadas.has(f.id) : undefined}
                style={{ borderTop: `4px solid ${f.color}`, cursor: f.hijos.length ? 'pointer' : 'default' }}
                onClick={f.hijos.length ? () => alternarFamilia(f.id) : undefined}
                title={f.hijos.length
                  ? `${f.nombre} · ${f.peso}% del área · dentro: ${f.hijos.map(h => h.nombre).join(', ')}. Pulsa para ${desplegadas.has(f.id) ? 'plegar' : 'desplegar'} los hijos.`
                  : `${f.nombre} · ${f.peso}% del área`}>
                {f.hijos.length ? <span className="comp-flecha">{desplegadas.has(f.id) ? '▾' : '▸'} </span> : null}
                {f.nombre}
                <span className="peso">{f.peso}%</span>
                {f.hijos.length ? <span className="peso" data-familia-hijos>{f.hijos.length} dentro</span> : null}
              </th>
            ))}
            <th scope="colgroup" colSpan={CON_FINAL.length} data-area-grupo>Área</th>
          </tr>
          <tr className="fila-instrumentos">
            {familias.flatMap(f => columnasDe(f).map(col => {
              const cfg = getInstrConfig(col.tipo)
              const todos = criteriosDelCurso(col.criterios)
              return (
                <th key={`${f.id}-${col.id}`} scope="col" className={`instr-th grupo-fin${col.esFamilia ? '' : ' hijo'}`} colSpan={SIN_FINAL.length}
                  data-instr-th data-nombre={col.nombre} data-tipo={col.tipo} data-familia={col.esFamilia ? undefined : f.id}
                  style={{ boxShadow: `inset 4px 0 0 ${col.color}` }}
                  title={todos.map(c => `${c.id} — ${c.descripcion}`).join('\n')}>
                  <div className="instr-th-nombre">
                    <span className="abrev" style={{ background: col.color }}>{abreviatura(col.nombre)}</span>
                    <span aria-hidden="true">{cfg.icon}</span> {col.esFamilia && f.hijos.length ? 'Resumen' : col.nombre}
                  </div>
                  <div className="instr-th-tipo">
                    {col.esFamilia
                      ? (f.hijos.length ? `media de ${f.hijos.length} hijo${f.hijos.length !== 1 ? 's' : ''}` : cfg.label)
                      : `${cfg.label} · ${col.pct ?? '—'} % de ${f.nombre}`}
                    {' · '}{todos.length} criterio{todos.length !== 1 ? 's' : ''}
                  </div>
                  <Etiquetas columnas={SIN_FINAL} />
                </th>
              )
            }))}
            {thArea}
          </tr>
        </thead>
        <tbody>
          {alumnos.map((al, idx) => (
            <tr key={al.id}>
              {alumnoTd(al)}
              {familias.flatMap(f => columnasDe(f).flatMap(col => SIN_FINAL.map(c => {
                const t = c as number
                const criteriosT = col.criterios[t] ?? []
                const r = mediaEnCriterios(porTrimestre[t], al.id!, col.id, criteriosT, t)
                const parcial = r.conNota > 0 && r.conNota < r.total
                return (
                  <Fragment key={`${f.id}-${col.id}-${t}`}>
                    {casilla(`${f.id}-${col.id}-${t}`, r.valor, c, `${nombre(al)} · ${col.nombre}${criteriosT.length ? ` (${r.conNota} de ${r.total} criterios con nota)` : ' · no evalúa nada este trimestre'}`,
                      () => explicarInstrumento(idx, col, c), { 'data-instrumento': String(col.id) },
                      parcial ? <span className="celda-instr"><b title={`${r.conNota} de ${r.total} criterios con nota`}>{r.conNota}/{r.total}</b></span> : undefined)}
                  </Fragment>
                )
              })))}
              {tdsArea(al, idx)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
