/**
 * «Calificar con la rúbrica»: una pasada por toda la clase con un instrumento
 * que tiene rúbrica.
 *
 * Es lo que «Evaluar hoy» no podía dar: la rúbrica entera a la vista —cada
 * indicador con sus niveles y descriptores— y una fila por alumno para
 * elegir el nivel. Pulsar un nivel en la fila lo marca en todos los
 * indicadores; desplegar la fila permite afinar indicador a indicador. La
 * nota no se pide: sale de la rúbrica (`notaDeRubrica`), igual que en el
 * panel de la casilla, y se guarda con las marcas en todos los criterios
 * que la programación asigna al instrumento, como «Pegar columna».
 *
 * No escribe en el diario: una rúbrica es una calificación del trimestre,
 * no una observación fechada. Volver a pulsar el nivel ya marcado en toda la
 * fila la deja sin nota; en un indicador, lo desmarca.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  getCalificacionUnica, saveCalificaciones,
  type CeldaInstrumento, type DatosDeArea,
} from '@/db/queries'
import { calificativo, nivelANota, notaDeRubrica } from '@/db/calculo'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import type { Alumno } from '@/db/localDb'

export type NivelRubrica = { nombre: string; valor: number; descripcion?: string }
export type IndicadorRubrica = { nombre: string; peso?: number; descriptores?: Record<string, string> }

interface Props {
  instrumento: CeldaInstrumento
  niveles: NivelRubrica[]
  indicadores: IndicadorRubrica[]
  criterios: { id: string; descripcion: string }[]
  alumnos: Alumno[]
  trimestre: number
  unidadId: number | null
  unidadNombre?: string
  area: DatosDeArea
  /** Algo se ha guardado: la matriz tiene que releerse. */
  onCambio: () => void
  onCerrar: () => void
}

type Marcas = Record<string, number>

export default function SesionRubrica({
  instrumento, niveles, indicadores, criterios, alumnos, trimestre, unidadId, unidadNombre, area, onCambio, onCerrar,
}: Props) {
  /** alumno_id → nivel marcado en cada indicador (lo guardado en la casilla). */
  const [marcas, setMarcas] = useState<Map<number, Marcas>>(new Map())
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set())
  const [tablaAbierta, setTablaAbierta] = useState(true)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  const cfg = getInstrConfig(instrumento.tipo)
  const maxNivel = useMemo(() => Math.max(...niveles.map(n => n.valor)), [niveles])
  const primerCriterio = criterios[0]?.id

  // Las marcas se leen del primer criterio del instrumento: desde aquí se
  // guardan iguales en todos, así que cualquiera vale.
  useEffect(() => {
    if (!primerCriterio) return
    let vigente = true
    Promise.all(alumnos.map(a => getCalificacionUnica(a.id!, instrumento.instrumento_id, primerCriterio, trimestre)))
      .then(cals => {
        if (!vigente) return
        setMarcas(new Map(alumnos.map((a, i) => [a.id!, cals[i]?.valor != null ? (cals[i]?.niveles_rubrica ?? {}) : {}])))
      })
    return () => { vigente = false }
  }, [alumnos, instrumento.instrumento_id, trimestre, primerCriterio, recarga])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const guardar = async (al: Alumno, siguiente: Marcas) => {
    setOcupado(al.id!); setError(null)
    try {
      const { nota } = notaDeRubrica(indicadores, niveles, siguiente)
      // Sin réplica: va a todos los criterios del instrumento, el reparto ya está decidido.
      await saveCalificaciones(criterios.map(c => ({
        ...area, alumno_id: al.id!, instrumento_id: instrumento.instrumento_id, criterio_id: c.id, trimestre,
        valor: nota, unidad_id: unidadId, niveles_rubrica: siguiente,
      })), { sinVinculos: true })
      setMarcas(m => new Map(m).set(al.id!, siguiente))
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la nota')
      setRecarga(n => n + 1)
    } finally { setOcupado(null) }
  }

  /** Toda la fila al mismo nivel; si ya estaba toda en ese nivel, se vacía. */
  const marcarFila = (al: Alumno, nivel: NivelRubrica) => {
    const actual = marcas.get(al.id!) ?? {}
    const yaTodos = indicadores.every(i => actual[i.nombre] === nivel.valor)
    return guardar(al, yaTodos ? {} : Object.fromEntries(indicadores.map(i => [i.nombre, nivel.valor])))
  }

  const marcarIndicador = (al: Alumno, ind: IndicadorRubrica, nivel: NivelRubrica) => {
    const siguiente = { ...(marcas.get(al.id!) ?? {}) }
    if (siguiente[ind.nombre] === nivel.valor) delete siguiente[ind.nombre]
    else siguiente[ind.nombre] = nivel.valor
    return guardar(al, siguiente)
  }

  const alternar = (id: number) => setAbiertos(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const calificados = alumnos.filter(a => notaDeRubrica(indicadores, niveles, marcas.get(a.id!) ?? {}).nota != null).length

  const botonNivel = (n: NivelRubrica, activo: boolean, parcial: boolean, onClick: () => void, bloqueado: boolean, ancho: number, ind?: IndicadorRubrica) => {
    const c = calificativo(nivelANota(n.valor, maxNivel))
    const descriptor = ind ? (ind.descriptores?.[n.nombre] || n.descripcion) : n.descripcion
    return (
      <button key={n.nombre} type="button" data-nivel={n.nombre} aria-pressed={activo} disabled={bloqueado}
        onClick={onClick}
        title={`${n.nombre} (${nivelANota(n.valor, maxNivel)})${descriptor ? `: ${descriptor}` : ''}${activo ? ' · pulsar otra vez lo quita' : ''}`}
        style={{
          minWidth: ancho, height: 36, padding: '0 8px', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 12.5,
          border: `2px solid ${activo ? 'var(--gris-900)' : parcial ? c.color : 'transparent'}`,
          background: activo ? c.color : parcial ? 'white' : c.color,
          color: activo ? 'white' : parcial ? c.color : 'white',
          opacity: activo || parcial ? 1 : .8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120,
        }}>
        {n.nombre}
      </button>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Calificar con la rúbrica: ${instrumento.nombre}`}
        style={{ width: 'min(980px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gris-300)', borderTop: `4px solid ${instrumento.color}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--azul-900)' }}>
              <span aria-hidden="true">{cfg.icon}</span> {instrumento.nombre} · rúbrica
            </div>
            <div style={{ fontSize: 12, color: 'var(--gris-600)', lineHeight: 1.5 }}>
              {cfg.label} · {trimestre}º trim.{unidadNombre ? ` · ${unidadNombre}` : ''} · {indicadores.length} indicador{indicadores.length !== 1 ? 'es' : ''} · {niveles.length} niveles
            </div>
          </div>
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar">✕</button>
        </div>

        <div style={{ padding: '12px 18px 18px' }}>
          {/* La rúbrica entera, para decidir mirándola. Se pliega para hacer sitio a la clase. */}
          <button type="button" data-rubrica-toggle aria-expanded={tablaAbierta} onClick={() => setTablaAbierta(a => !a)}
            style={{ width: '100%', textAlign: 'left', border: '1px solid var(--gris-300)', borderRadius: 9, background: 'white', padding: '7px 12px', fontSize: 12.5, color: 'var(--gris-600)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700 }}>{tablaAbierta ? '▾' : '▸'} La rúbrica</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {indicadores.map(i => i.nombre).join(' · ')}
            </span>
          </button>
          {tablaAbierta && (
            <div data-rubrica-tabla style={{ overflowX: 'auto', margin: '8px 0 12px' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, lineHeight: 1.4 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid var(--gris-300)', fontSize: 11, color: 'var(--gris-600)', minWidth: 140 }}>Indicador</th>
                    {niveles.map(n => {
                      const c = calificativo(nivelANota(n.valor, maxNivel))
                      return (
                        <th key={n.nombre} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `3px solid ${c.color}`, fontSize: 12, color: 'var(--gris-900)', minWidth: 150 }}>
                          {n.nombre} <span style={{ fontWeight: 500, color: 'var(--gris-500)' }}>· {nivelANota(n.valor, maxNivel)}</span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {indicadores.map((ind, ii) => (
                    <tr key={ind.nombre + ii}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--gris-300)', fontWeight: 700, color: 'var(--azul-900)', verticalAlign: 'top' }}>
                        {ind.nombre}
                        {ind.peso != null && <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--gris-500)' }}>{ind.peso}%</div>}
                      </td>
                      {niveles.map(n => (
                        <td key={n.nombre} style={{ padding: '6px 8px', borderBottom: '1px solid var(--gris-300)', color: 'var(--gris-600)', verticalAlign: 'top' }}>
                          {ind.descriptores?.[n.nombre] || n.descripcion || <span style={{ opacity: .5 }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ background: 'var(--azul-100)', borderRadius: 9, padding: '9px 12px', margin: '8px 0 12px', fontSize: 12.5, color: 'var(--gris-900)', lineHeight: 1.5 }}>
            <strong>La nota de cada alumno se guarda en {criterios.length} criterio{criterios.length !== 1 ? 's' : ''}:</strong>{' '}
            {criterios.map(c => <span key={c.id} title={c.descripcion} style={{ fontWeight: 700, color: 'var(--azul-700)', marginRight: 6 }}>{c.id}</span>)}
            <span style={{ color: 'var(--gris-600)' }}>— un nivel en la fila lo marca en todos los indicadores; «por indicador» afina uno a uno.</span>
          </div>

          {error && <div style={{ color: 'var(--rojo-500)', fontSize: 12.5, marginBottom: 8 }}>{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {alumnos.map(al => {
              const m = marcas.get(al.id!) ?? {}
              const r = notaDeRubrica(indicadores, niveles, m)
              const cal = calificativo(r.nota)
              const bloqueado = ocupado === al.id
              const abierto = abiertos.has(al.id!)
              return (
                <div key={al.id} data-sesion-fila style={{
                  display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) auto auto', gap: 8, alignItems: 'center',
                  padding: '6px 8px', borderRadius: 8, background: r.nota != null ? 'var(--verde-100)' : 'transparent',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--gris-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {al.apellidos}, {al.nombre}
                      {al.neae ? <span style={{ marginLeft: 6, fontSize: 9.5, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</span> : null}
                    </div>
                    <div data-sesion-nota style={{ fontSize: 11, color: 'var(--gris-600)' }}>
                      {r.nota == null
                        ? 'Sin calificar'
                        : <>{r.evaluados} de {r.total} indicadores → <strong style={{ color: cal.color }}>{r.nota}</strong></>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {niveles.map(n => {
                      const cuantos = indicadores.filter(i => m[i.nombre] === n.valor).length
                      return botonNivel(n, cuantos === indicadores.length, cuantos > 0 && cuantos < indicadores.length,
                        () => marcarFila(al, n), bloqueado, 64)
                    })}
                  </div>
                  <button type="button" data-sesion-detalle aria-expanded={abierto} onClick={() => alternar(al.id!)}
                    title="Marcar cada indicador por separado" aria-label={`Por indicador: ${al.nombre}`}
                    style={{ background: abierto ? 'var(--azul-100)' : 'none', border: '1px solid var(--gris-300)', borderRadius: 6, height: 30, padding: '0 8px', cursor: 'pointer', fontSize: 11, color: 'var(--azul-700)', whiteSpace: 'nowrap' }}>
                    {abierto ? '▾' : '▸'} por indicador
                  </button>
                  {abierto && (
                    <div data-sesion-indicadores style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0 2px 8px', borderLeft: `3px solid ${instrumento.color}` }}>
                      {indicadores.map((ind, ii) => (
                        <div key={ind.nombre + ii} data-indicador={ind.nombre} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ flex: '1 1 160px', fontSize: 12, fontWeight: 600, color: 'var(--azul-900)' }}>{ind.nombre}</span>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {niveles.map(n => botonNivel(n, m[ind.nombre] === n.valor, false, () => marcarIndicador(al, ind, n), bloqueado, 56, ind))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, fontSize: 12.5, color: 'var(--gris-600)' }}>
            <span data-sesion-resumen><strong>{calificados}</strong> de {alumnos.length} con nota de rúbrica</span>
            <div style={{ flex: 1 }} />
            <button className="btn-primary" onClick={onCerrar} style={{ fontSize: 13 }}>Hecho</button>
          </div>
        </div>
      </div>
    </div>
  )
}
