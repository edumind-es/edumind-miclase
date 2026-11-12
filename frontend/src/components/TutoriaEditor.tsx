/**
 * Una tutoría, de principio a fin: fecha, tipo, alumnado, asistentes,
 * orden del día, los apartados del modelo, la revisión de los acuerdos
 * pendientes de antes, los acuerdos nuevos y la próxima cita. Desde aquí
 * sale también el acta (Lámina) por `imprimir` y `descargarHTML`.
 *
 * Nada se guarda sin pulsar «Guardar», salvo la revisión de un acuerdo
 * anterior, que escribe en su propia tutoría al marcarlo (`revisarAcuerdo`).
 */
import { useEffect, useMemo, useState } from 'react'
import type { Alumno } from '@/db/localDb'
import {
  TIPOS_TUTORIA, MODALIDADES, ROLES_ASISTENTE, ESTADOS_ACUERDO,
  acuerdosPendientes, fechaLegible, claveNueva, diaLocal,
  type Tutoria, type AcuerdoTutoria, type AcuerdoPendiente, type EstadoAcuerdo,
} from '@/db/tutorias'
import { guardarTutoria, eliminarTutoria, getTutoriasDeAlumno, revisarAcuerdo, getTutoria } from '@/db/queries'
import { documentoActaTutoria, nombreFicheroActa } from '@/informes/actaTutoria'
import { imprimir, descargarHTML } from '@/informes/lamina'

import { confirmar } from '@/utils/confirmar'
export type BorradorTutoria = Omit<Tutoria, 'updated_at' | 'deleted_at' | 'created_at'>

const nombreAlumno = (a: Alumno) => `${a.apellidos}, ${a.nombre}`

/** Lo que el acta necesita y no está en la tutoría: nombres y acuerdos revisados. */
export async function componerActa(t: Tutoria, grupo: { nombre: string; curso_escolar?: string }, alumnos: Alumno[]): Promise<string> {
  const nombres = new Map(alumnos.map(a => [a.id!, nombreAlumno(a)]))
  const revisados: AcuerdoPendiente[] = []
  for (const r of t.revisados ?? []) {
    const origen = await getTutoria(r.tutoria_id)
    const acuerdo = origen?.acuerdos.find(a => a.clave === r.clave)
    if (origen && acuerdo) revisados.push({ tutoria_id: origen.id!, fecha_tutoria: origen.fecha, alumnos: origen.alumnos, acuerdo, vencido: false })
  }
  return documentoActaTutoria(t, { grupo: grupo.nombre, cursoEscolar: grupo.curso_escolar, nombresAlumnos: nombres, revisados })
}

export default function TutoriaEditor({ inicial, alumnos, grupo, onCerrar, onGuardado }: {
  inicial: BorradorTutoria
  alumnos: Alumno[]
  grupo: { nombre: string; curso_escolar?: string }
  onCerrar: () => void
  onGuardado: (id: number | null) => void
}) {
  const [t, setT] = useState<BorradorTutoria>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [cambios, setCambios] = useState(false)
  const [anteriores, setAnteriores] = useState<AcuerdoPendiente[]>([])
  const [verAnteriores, setVerAnteriores] = useState(!!inicial.con_seguimiento)
  const esGrupo = t.tipo === 'grupo'

  const poner = (c: Partial<BorradorTutoria>) => { setT(v => ({ ...v, ...c })); setCambios(true) }

  // Acuerdos de tutorías ANTERIORES del alumnado elegido: pendientes o ya revisados aquí
  const claveAlumnos = t.alumnos.join(',')
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!t.alumnos.length) { setAnteriores([]); return }
      const todas = new Map<number, Tutoria>()
      for (const id of t.alumnos) for (const x of await getTutoriasDeAlumno(id)) todas.set(x.id!, x)
      const otras = [...todas.values()].filter(x => x.id !== t.id && x.fecha <= t.fecha)
      const pendientes = acuerdosPendientes(otras, t.fecha.slice(0, 10))
      // Los que ya se revisaron en esta tutoría siguen a la vista con su estado
      const revisados = (t.revisados ?? []).flatMap(r => {
        const o = todas.get(r.tutoria_id)
        const a = o?.acuerdos.find(x => x.clave === r.clave)
        return o && a && a.estado !== 'pendiente'
          ? [{ tutoria_id: o.id!, fecha_tutoria: o.fecha, alumnos: o.alumnos, acuerdo: a, vencido: false }] : []
      })
      if (vivo) setAnteriores([...revisados, ...pendientes])
    })()
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveAlumnos, t.id, t.fecha.slice(0, 10)])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  })

  const cerrar = async () => {
    if (cambios && !await confirmar('Hay cambios sin guardar en esta tutoría. ¿Cerrar sin guardar?')) return
    onCerrar()
  }

  const alumnosOrdenados = useMemo(
    () => [...alumnos].sort((a, b) => nombreAlumno(a).localeCompare(nombreAlumno(b), 'es')), [alumnos])

  const alternarAlumno = (id: number) =>
    poner({ alumnos: t.alumnos.includes(id) ? t.alumnos.filter(x => x !== id) : [...t.alumnos, id] })

  const ponerAcuerdo = (i: number, c: Partial<AcuerdoTutoria>) =>
    poner({ acuerdos: t.acuerdos.map((a, j) => j === i ? { ...a, ...c } : a) })

  const revisarAnterior = async (p: AcuerdoPendiente, estado: EstadoAcuerdo) => {
    try {
      await revisarAcuerdo(p.tutoria_id, p.acuerdo.clave, { estado, fecha_revision: t.fecha.slice(0, 10) })
      const marca = { tutoria_id: p.tutoria_id, clave: p.acuerdo.clave }
      const otros = (t.revisados ?? []).filter(r => !(r.tutoria_id === marca.tutoria_id && r.clave === marca.clave))
      poner({ revisados: estado === 'pendiente' ? otros : [...otros, marca] })
      setAnteriores(l => l.map(x => x.tutoria_id === p.tutoria_id && x.acuerdo.clave === p.acuerdo.clave
        ? { ...x, acuerdo: { ...x.acuerdo, estado } } : x))
      setMsg(`Acuerdo marcado como «${ESTADOS_ACUERDO.find(e => e.valor === estado)?.nombre.toLowerCase()}» en su tutoría del ${fechaLegible(p.fecha_tutoria.slice(0, 10))}.`)
    } catch (e: any) { setMsg(e?.message ?? 'No se pudo marcar el acuerdo.') }
  }

  const guardar = async (): Promise<number | null> => {
    if (!t.fecha) { setMsg('Falta la fecha de la tutoría.'); return null }
    if (!esGrupo && !t.alumnos.length) { setMsg('Elige al menos un alumno o alumna, o marca la tutoría como «De grupo».'); return null }
    setGuardando(true)
    try {
      const id = await guardarTutoria({ ...t, alumnos: esGrupo ? [] : t.alumnos })
      setT(v => ({ ...v, id }))
      setCambios(false)
      setMsg('Tutoría guardada en este dispositivo.')
      onGuardado(id)
      return id
    } catch (e: any) {
      setMsg('No se pudo guardar: ' + (e?.message ?? e)); return null
    } finally { setGuardando(false) }
  }

  const acta = async (modo: 'imprimir' | 'guardar') => {
    const id = cambios || !t.id ? await guardar() : t.id
    if (!id) return
    const guardada = await getTutoria(id)
    if (!guardada) return
    const html = await componerActa(guardada, grupo, alumnos)
    try {
      if (modo === 'imprimir') {
        const hecho = await imprimir(html, nombreFicheroActa(guardada))
        setMsg(hecho ? 'Acta enviada a imprimir.' : 'No se ha imprimido nada: la vista previa se cerró sin imprimir ni compartir.')
      } else {
        await descargarHTML(html, nombreFicheroActa(guardada) + '.html')
        setMsg('Acta guardada como .html (se abre en cualquier navegador).')
      }
    } catch { setMsg('No se pudo preparar el acta.') }
  }

  const borrar = async () => {
    if (!t.id) { onCerrar(); return }
    if (!await confirmar('¿Borrar esta tutoría y sus acuerdos? Desaparece de este dispositivo y, al sincronizar, de los demás.')) return
    await eliminarTutoria(t.id)
    onGuardado(null)
    onCerrar()
  }

  const etiqueta = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 } as const
  const bloque = { marginBottom: 16 } as const

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) cerrar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label="Tutoría" data-tutoria-editor
        style={{ width: 'min(760px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{t.id ? 'Tutoría' : 'Nueva tutoría'}</h2>
          {t.modelo_nombre && <span style={{ fontSize: 12, color: 'var(--gris-600)' }}>Modelo: {t.modelo_nombre}</span>}
          <button onClick={cerrar} aria-label="Cerrar" style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--gris-600)', margin: '0 0 14px', lineHeight: 1.45 }} data-aviso-tutoria>
          Lo que escribas aquí se queda en este dispositivo (y en los tuyos si sincronizas, cifrado).
          Anota solo lo necesario: evita diagnósticos o datos de salud que no hagan falta para atender al alumno.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, ...bloque }}>
          <div>
            <label htmlFor="tut-fecha" style={etiqueta}>Fecha y hora</label>
            <input id="tut-fecha" type="datetime-local" value={t.fecha} data-tutoria-fecha
              onChange={e => poner({ fecha: e.target.value })} style={{ width: '100%' }} />
          </div>
          <div>
            <label htmlFor="tut-tipo" style={etiqueta}>Tipo</label>
            <select id="tut-tipo" value={t.tipo} data-tutoria-tipo
              onChange={e => poner({ tipo: e.target.value as Tutoria['tipo'] })} style={{ width: '100%' }}>
              {TIPOS_TUTORIA.map(x => <option key={x.valor} value={x.valor}>{x.nombre}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tut-modalidad" style={etiqueta}>Modalidad</label>
            <select id="tut-modalidad" value={t.modalidad} data-tutoria-modalidad
              onChange={e => poner({ modalidad: e.target.value as Tutoria['modalidad'] })} style={{ width: '100%' }}>
              {MODALIDADES.map(x => <option key={x.valor} value={x.valor}>{x.nombre}</option>)}
            </select>
          </div>
        </div>

        {!esGrupo && (
          <fieldset style={{ ...bloque, border: '1px solid var(--gris-200)', borderRadius: 8, padding: '8px 12px' }} data-tutoria-alumnos>
            <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 4px' }}>Alumnado ({t.alumnos.length})</legend>
            {alumnosOrdenados.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>Esta clase no tiene alumnado todavía.</div>
              : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '2px 12px', maxHeight: 150, overflowY: 'auto' }}>
                  {alumnosOrdenados.map(a => (
                    <label key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                      <input type="checkbox" checked={t.alumnos.includes(a.id!)} onChange={() => alternarAlumno(a.id!)}
                        data-tutoria-alumno={a.id} />
                      {nombreAlumno(a)}
                    </label>
                  ))}
                </div>}
          </fieldset>
        )}

        <div style={bloque} data-tutoria-asistentes>
          <span style={etiqueta}>Asistentes</span>
          <datalist id="tut-roles">{ROLES_ASISTENTE.map(r => <option key={r} value={r} />)}</datalist>
          {t.asistentes.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }} data-asistente>
              <input value={a.nombre} placeholder="Nombre" aria-label={`Nombre del asistente ${i + 1}`} data-asistente-nombre
                onChange={e => poner({ asistentes: t.asistentes.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x) })}
                style={{ flex: 2, minWidth: 0 }} />
              <input value={a.rol} placeholder="Relación o cargo (madre, orientadora…)" list="tut-roles" aria-label={`Rol del asistente ${i + 1}`} data-asistente-rol
                onChange={e => poner({ asistentes: t.asistentes.map((x, j) => j === i ? { ...x, rol: e.target.value } : x) })}
                style={{ flex: 2, minWidth: 0 }} />
              <button className="btn-secondary" aria-label={`Quitar asistente ${i + 1}`} style={{ padding: '2px 10px' }}
                onClick={() => poner({ asistentes: t.asistentes.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button className="btn-secondary" style={{ fontSize: 12.5, padding: '4px 12px' }} data-asistente-anadir
            onClick={() => poner({ asistentes: [...t.asistentes, { nombre: '', rol: '' }] })}>+ Asistente</button>
        </div>

        <div style={bloque} data-tutoria-orden>
          <span style={etiqueta}>Orden del día</span>
          {t.orden_dia.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={p.tratado} title="Tratado" aria-label={`Punto ${i + 1} tratado`}
                onChange={e => poner({ orden_dia: t.orden_dia.map((x, j) => j === i ? { ...x, tratado: e.target.checked } : x) })} />
              <input value={p.texto} aria-label={`Punto ${i + 1} del orden del día`} style={{ flex: 1, minWidth: 0 }}
                onChange={e => poner({ orden_dia: t.orden_dia.map((x, j) => j === i ? { ...x, texto: e.target.value } : x) })} />
              <button className="btn-secondary" aria-label={`Quitar punto ${i + 1}`} style={{ padding: '2px 10px' }}
                onClick={() => poner({ orden_dia: t.orden_dia.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button className="btn-secondary" style={{ fontSize: 12.5, padding: '4px 12px' }}
            onClick={() => poner({ orden_dia: [...t.orden_dia, { texto: '', tratado: false }] })}>+ Punto</button>
        </div>

        {t.apartados.map((a, i) => (
          <div key={a.clave} style={bloque} data-apartado={a.clave}>
            <label htmlFor={`tut-ap-${a.clave}`} style={etiqueta}>{a.titulo}</label>
            <textarea id={`tut-ap-${a.clave}`} value={a.texto} rows={3} style={{ width: '100%' }}
              onChange={e => poner({ apartados: t.apartados.map((x, j) => j === i ? { ...x, texto: e.target.value } : x) })} />
          </div>
        ))}

        {anteriores.length > 0 && (
          <div style={{ ...bloque, background: 'var(--ambar-100, #fef3c7)', borderRadius: 8, padding: '10px 12px' }} data-acuerdos-anteriores>
            <button onClick={() => setVerAnteriores(v => !v)} aria-expanded={verAnteriores} data-acuerdos-anteriores-toggle
              style={{ background: 'none', border: 'none', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', padding: 0 }}>
              {verAnteriores ? '▾' : '▸'} Acuerdos de tutorías anteriores ({anteriores.filter(a => a.acuerdo.estado === 'pendiente').length} pendientes)
            </button>
            {verAnteriores && anteriores.map(p => (
              <div key={`${p.tutoria_id}:${p.acuerdo.clave}`} data-acuerdo-anterior
                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
                <span style={{ flex: '1 1 260px' }}>
                  {p.acuerdo.texto}
                  <span style={{ color: 'var(--gris-600)', fontSize: 12 }}>
                    {' '}· del {fechaLegible(p.fecha_tutoria.slice(0, 10))}
                    {p.acuerdo.fecha_prevista ? ` · previsto ${fechaLegible(p.acuerdo.fecha_prevista)}` : ''}
                    {p.vencido && p.acuerdo.estado === 'pendiente' ? ' · vencido' : ''}
                  </span>
                </span>
                {ESTADOS_ACUERDO.map(e => (
                  <button key={e.valor} className={p.acuerdo.estado === e.valor ? 'btn-primary' : 'btn-secondary'}
                    style={{ fontSize: 12, padding: '3px 10px' }} aria-pressed={p.acuerdo.estado === e.valor}
                    data-revisar={e.valor} onClick={() => revisarAnterior(p, e.valor)}>{e.nombre}</button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={bloque} data-tutoria-acuerdos>
          <span style={etiqueta}>Acuerdos</span>
          {t.acuerdos.map((a, i) => (
            <div key={a.clave} data-acuerdo style={{ border: '1px solid var(--gris-200)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input value={a.texto} placeholder="Qué se acuerda" aria-label={`Acuerdo ${i + 1}`} data-acuerdo-texto
                  onChange={e => ponerAcuerdo(i, { texto: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                <button className="btn-secondary" aria-label={`Quitar acuerdo ${i + 1}`} style={{ padding: '2px 10px' }}
                  onClick={() => poner({ acuerdos: t.acuerdos.filter((_, j) => j !== i) })}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5, alignItems: 'center' }}>
                <input value={a.responsable ?? ''} placeholder="Responsable (familia, tutor/a…)" aria-label={`Responsable del acuerdo ${i + 1}`}
                  onChange={e => ponerAcuerdo(i, { responsable: e.target.value })} style={{ flex: '1 1 160px' }} />
                <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>Fecha prevista
                  <input type="date" value={a.fecha_prevista ?? ''} data-acuerdo-fecha
                    onChange={e => ponerAcuerdo(i, { fecha_prevista: e.target.value || null })} />
                </label>
                <select value={a.estado} aria-label={`Estado del acuerdo ${i + 1}`} data-acuerdo-estado
                  onChange={e => {
                    const estado = e.target.value as EstadoAcuerdo
                    ponerAcuerdo(i, { estado, fecha_revision: estado === 'pendiente' ? null : (a.fecha_revision || diaLocal()) })
                  }}>
                  {ESTADOS_ACUERDO.map(x => <option key={x.valor} value={x.valor}>{x.nombre}</option>)}
                </select>
              </div>
            </div>
          ))}
          <button className="btn-secondary" style={{ fontSize: 12.5, padding: '4px 12px' }} data-acuerdo-anadir
            onClick={() => poner({ acuerdos: [...t.acuerdos, { clave: claveNueva(t.acuerdos.map(a => a.clave), 'a'), texto: '', responsable: '', fecha_prevista: null, estado: 'pendiente' }] })}>
            + Acuerdo
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 240px) 1fr', gap: 12, ...bloque }}>
          <div>
            <label htmlFor="tut-proxima" style={etiqueta}>Próxima cita</label>
            <input id="tut-proxima" type="datetime-local" value={t.proxima_cita ?? ''} data-tutoria-proxima
              onChange={e => poner({ proxima_cita: e.target.value || null })} style={{ width: '100%' }} />
          </div>
          <div>
            <label htmlFor="tut-proxima-nota" style={etiqueta}>Para qué</label>
            <input id="tut-proxima-nota" value={t.proxima_cita_nota ?? ''} placeholder="Revisar los acuerdos…"
              onChange={e => poner({ proxima_cita_nota: e.target.value || null })} style={{ width: '100%' }} />
          </div>
        </div>

        {msg && <div role="status" data-tutoria-msg style={{ fontSize: 13, color: 'var(--azul-700)', marginBottom: 10 }}>{msg}</div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-primary" onClick={guardar} disabled={guardando} data-tutoria-guardar>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button className="btn-secondary" onClick={() => acta('imprimir')} disabled={guardando} data-tutoria-acta>🖨 Imprimir acta</button>
          <button className="btn-secondary" onClick={() => acta('guardar')} disabled={guardando} data-tutoria-acta-guardar>Guardar acta (.html)</button>
          <button onClick={borrar} disabled={guardando} data-tutoria-borrar
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rojo-500, #b91c1c)', fontSize: 13, fontWeight: 600 }}>
            {t.id ? 'Borrar tutoría' : 'Descartar'}
          </button>
        </div>
      </div>
    </div>
  )
}
