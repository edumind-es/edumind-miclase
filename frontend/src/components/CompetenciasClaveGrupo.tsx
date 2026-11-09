/**
 * Competencias clave en Seguimiento: cómo va la clase, o un alumno, en cada
 * competencia y en cada descriptor operativo, por trimestres.
 *
 * Mira todas las áreas de la clase, porque una competencia clave se nutre de
 * todas. Solo compone: las notas de criterio salen de `reunirDatosGrupo`, los
 * niveles de `db/competenciasClave.ts`, igual que en el informe.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import {
  COMPETENCIAS_CLAVE, NOMBRES_COMPETENCIA, NIVELES_DESARROLLO, nivelDesarrollo, notaEnPeriodo, tablaDeCompetencias,
  type FilaCompetencias,
} from '@/db/competenciasClave'
import { competenciasDeAlumno, reunirDatosGrupo, type DatosGrupo } from '@/informes/datos'

const COLOR_NIVEL: Record<number, string> = { 1: 'var(--rojo-500)', 2: 'var(--ambar-500)', 3: 'var(--verde-500)', 4: 'var(--azul-700)' }
const coma = (v: number | null) => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('es-ES')

function Nivel({ nota }: { nota: number | null }) {
  const n = nivelDesarrollo(nota)
  if (!n) return <span style={{ color: 'var(--gris-500)' }}>—</span>
  return <span style={{ fontSize: 11.5, fontWeight: 700, color: COLOR_NIVEL[n.nivel], whiteSpace: 'nowrap' }}>{n.nivel} · {n.nombre}</span>
}

function Notas({ fila }: { fila: FilaCompetencias }) {
  return (
    <>
      {[1, 2, 3].map(t => <td key={t} style={{ padding: '8px', textAlign: 'right', color: 'var(--gris-600)' }}>{coma(fila.trimestres[t])}</td>)}
      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{coma(fila.final)}</td>
      <td style={{ padding: '8px 12px' }}><Nivel nota={fila.final} /></td>
    </>
  )
}

export default function CompetenciasClaveGrupo({ grupoId }: { grupoId: number }) {
  const { headers } = useAuth()
  const [datos, setDatos] = useState<DatosGrupo | null>(null)
  const [error, setError] = useState(false)
  const [sel, setSel] = useState('grupo')
  const [abierta, setAbierta] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    setDatos(null); setError(false); setSel('grupo'); setAbierta(null)
    reunirDatosGrupo(grupoId, headers, null)
      .then(d => { if (vigente) setDatos(d) })
      .catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [grupoId])

  const perfiles = useMemo(() => datos
    ? datos.alumnos.map(alumno => ({ alumno, perfil: competenciasDeAlumno(datos, alumno.id!) }))
    : [], [datos])
  const elegido = perfiles.find(p => String(p.alumno.id) === sel) ?? null
  const tabla = useMemo(
    () => tablaDeCompetencias(elegido ? [elegido.perfil] : perfiles.map(p => p.perfil)),
    [perfiles, elegido])

  if (error) return <div className="card" style={{ padding: 24, color: 'var(--rojo-500)' }}>No se han podido reunir las notas de la clase.</div>
  if (!datos) return <p style={{ color: 'var(--gris-600)' }}>Calculando…</p>
  if (!datos.descriptores.length) {
    return <div className="card" style={{ padding: 24, color: 'var(--gris-600)' }}>No se han podido leer los descriptores operativos del currículo: sin ellos esta vista no puede calcular nada.</div>
  }

  const textoDe = new Map(datos.descriptores.map(d => [d.id, d.descripcion]))
  const columnas = COMPETENCIAS_CLAVE.filter(id => tabla.competencias.some(c => c.id === id))
  const sinConexion = elegido ? elegido.perfil.sinConexion : []
  const cabecera = (primera: string) => (
    <tr style={{ background: 'var(--azul-900)', color: 'white' }}>
      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>{primera}</th>
      {['1T', '2T', '3T', 'Final'].map(t => <th key={t} style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 600, width: 56 }}>{t}</th>)}
      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, width: 130 }}>Nivel</th>
    </tr>
  )

  return (
    <div data-competencias-clave>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <select data-competencias-ver value={sel} onChange={e => { setSel(e.target.value); setAbierta(null) }}
          aria-label="Ver las competencias de" style={{ fontSize: 13.5 }}>
          <option value="grupo">Toda la clase</option>
          {perfiles.map(({ alumno: a }) => <option key={a.id} value={String(a.id)}>{a.apellidos}, {a.nombre}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--gris-600)' }}>
          {NIVELES_DESARROLLO.map(n => `${n.nivel} ${n.nombre}`).join(' · ')}
        </span>
      </div>

      {tabla.competencias.length === 0 ? (
        <div className="card" style={{ padding: 24, color: 'var(--gris-600)' }} data-competencias-vacio>
          Todavía no hay notas de criterio conectadas con las competencias clave.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>{cabecera('Competencia clave')}</thead>
            <tbody>
              {tabla.competencias.flatMap(c => {
                const desplegada = abierta === c.id
                const filas = [(
                  <tr key={c.id} data-competencia={c.id} style={{ borderTop: '1px solid var(--gris-200)', cursor: 'pointer' }}
                    onClick={() => setAbierta(desplegada ? null : c.id)}>
                    <td style={{ padding: '8px 12px' }}>
                      <span aria-hidden="true" style={{ color: 'var(--gris-500)', marginRight: 5 }}>{desplegada ? '▾' : '▸'}</span>
                      <strong>{c.id}</strong> · {NOMBRES_COMPETENCIA[c.id]}
                    </td>
                    <Notas fila={c} />
                  </tr>
                )]
                if (desplegada) {
                  for (const d of tabla.descriptores.filter(x => x.competencia_id === c.id)) {
                    const propio = elegido?.perfil.descriptores.find(x => x.id === d.id)
                    const areas = propio ? [...new Set(propio.aportes.map(a => a.area))] : []
                    filas.push(
                      <tr key={d.id} data-descriptor={d.id} style={{ background: 'var(--gris-50)', borderTop: '1px solid var(--gris-200)' }}>
                        <td style={{ padding: '7px 12px 7px 28px', fontSize: 12, lineHeight: 1.4 }}>
                          <strong>{d.id}</strong> {textoDe.get(d.id)}
                          {areas.map(area => (
                            <div key={area} style={{ fontSize: 11, color: 'var(--gris-600)', marginTop: 2 }}>
                              {area}: {propio!.aportes.filter(a => a.area === area).map(a => a.criterio_id).join(' ')}
                            </div>
                          ))}
                        </td>
                        <Notas fila={d} />
                      </tr>
                    )
                  }
                }
                return filas
              })}
            </tbody>
          </table>
        </div>
      )}

      {!elegido && columnas.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }} data-competencias-alumnado>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--azul-900)', color: 'white' }}>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>Nivel de cada alumno (final)</th>
                {columnas.map(id => <th key={id} style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 600 }}>{id}</th>)}
              </tr>
            </thead>
            <tbody>
              {perfiles.map(({ alumno: a, perfil }) => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--gris-200)' }}>
                  <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>{a.apellidos}, {a.nombre}</td>
                  {columnas.map(id => {
                    const c = perfil.competencias.find(x => x.id === id)
                    const v = c ? notaEnPeriodo(c, 'final') : null
                    const n = nivelDesarrollo(v)
                    return (
                      <td key={id} title={n ? `${n.nombre} · ${coma(v)}` : undefined}
                        style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700, color: n ? COLOR_NIVEL[n.nivel] : 'var(--gris-500)' }}>
                        {n ? n.nivel : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sinConexion.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--gris-600)', marginTop: 10 }} data-competencias-sin-conexion>
          Criterios con nota que no conectan con ninguna competencia: {sinConexion.map(s => `${s.criterio_id} (${s.area})`).join(', ')}.
        </p>
      )}
    </div>
  )
}
