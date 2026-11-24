/**
 * Los equipos de una clase: la pestaña «Equipos» de «Mis clases».
 *
 * Un agrupamiento («Equipos de proyecto», «Parejas de lectura») es de la
 * clase y puede decir para qué área o unidad vale; sin decirlo vale para
 * todas. Aquí se crean, se reparte al alumnado —a mano o al azar— y se ven.
 *
 * No decide nada por su cuenta: repartir, mover y normalizar es de
 * `db/equipos.ts` (puro) y guardar, de `guardarAgrupamiento`. Recibe la clase
 * por `grupoId` y no lee la clase activa, como el alumnado.
 */
import { useEffect, useState } from 'react'
import {
  getAgrupamientos, guardarAgrupamiento, eliminarAgrupamiento,
  getAlumnosByGrupo, getAsignaturas, getUnidades,
} from '@/db/queries'
import type { Agrupamiento, Alumno, Asignatura, Equipo, Unidad } from '@/db/localDb'
import {
  alcanceDeAgrupamiento, equipoNuevo, equiposPorTamano, moverAlumno, repartirAlAzar, sinBajas, sinEquipo,
} from '@/db/equipos'
import { confirmar } from '@/utils/confirmar'
import Boton from './comunes/Boton'

const campo = { minHeight: 44, fontSize: 14 } as const

export default function EquiposClase({ grupoId }: { grupoId: number }) {
  const [lista, setLista] = useState<Agrupamiento[] | null>(null)
  const [alumnos, setAlumnos] = useState<Alumno[]>([])
  const [areas, setAreas] = useState<Asignatura[]>([])
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [aviso, setAviso] = useState<string | null>(null)

  const releer = async () => {
    const als = await getAlumnosByGrupo(grupoId)
    const ids = als.map(a => a.id!)
    setAlumnos(als)
    // Quien ya no es de la clase no sale en ningún equipo (lo guardado no se toca).
    setLista((await getAgrupamientos(grupoId)).map(a => ({ ...a, equipos: sinBajas(a.equipos, ids) })))
  }

  useEffect(() => {
    let vigente = true
    setLista(null)
    ;(async () => {
      const as = await getAsignaturas(grupoId)
      const us = (await Promise.all(as.map(a => getUnidades(a.id!)))).flat()
      if (!vigente) return
      setAreas(as); setUnidades(us)
      await releer()
    })().catch(e => { if (vigente) setAviso(`No se pudieron leer los equipos: ${(e as Error).message}`) })
    return () => { vigente = false }
  }, [grupoId])

  /** Guarda un cambio de un agrupamiento y relee: lo que se ve es lo guardado. */
  const cambiar = async (a: Agrupamiento, cambio: Partial<Agrupamiento>, dicho?: string) => {
    try {
      const { updated_at, deleted_at, created_at, ...datos } = { ...a, ...cambio }
      await guardarAgrupamiento(datos)
      await releer()
      setAviso(dicho ?? null)
    } catch (e) { setAviso(`No se pudo guardar: ${(e as Error).message}`) }
  }

  const crear = async () => {
    const equipos: Equipo[] = []
    for (let i = 0; i < 4; i++) equipos.push(equipoNuevo(equipos))
    const n = (lista?.length ?? 0) + 1
    await guardarAgrupamiento({ grupo_id: grupoId, nombre: n === 1 ? 'Equipos' : `Equipos ${n}`, asignatura_id: null, unidad_id: null, equipos })
    await releer()
    setAviso('Agrupamiento creado con cuatro equipos vacíos. Reparte al alumnado a mano o al azar.')
  }

  const borrar = async (a: Agrupamiento) => {
    const ok = await confirmar({
      titulo: `¿Borrar «${a.nombre}»?`,
      texto: 'Se borran sus equipos. Las notas ya puestas no cambian.',
      aceptar: 'Borrar', peligro: true,
    })
    if (!ok) return
    await eliminarAgrupamiento(a.id!)
    await releer()
    setAviso(`«${a.nombre}» borrado.`)
  }

  if (!lista) return <p>{aviso ?? 'Cargando equipos…'}</p>

  return (
    <div data-equipos-clase>
      <p style={{ fontSize: 13.5, color: 'var(--gris-600)', margin: '0 0 14px', maxWidth: 720 }}>
        Un agrupamiento es una forma de repartir la clase en equipos. Puede valer para todas las áreas o solo
        para un área o una unidad, y puedes tener varios a la vez.
      </p>

      {aviso && <div role="status" data-equipos-aviso style={{ margin: '0 0 14px', fontSize: 13.5 }}>{aviso}</div>}

      {lista.length === 0 && (
        <p data-equipos-vacio style={{ fontSize: 14 }}>Esta clase todavía no tiene equipos.</p>
      )}

      {lista.map(a => (
        <TarjetaAgrupamiento key={a.id} agrupamiento={a} alumnos={alumnos} areas={areas} unidades={unidades}
          onCambiar={(cambio, dicho) => cambiar(a, cambio, dicho)} onBorrar={() => borrar(a)} />
      ))}

      <Boton variante="primario" data-agrupamiento-nuevo onClick={crear} disabled={alumnos.length === 0}>
        + Nuevo agrupamiento
      </Boton>
      {alumnos.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--gris-600)', marginTop: 8 }}>Añade antes al alumnado en la pestaña «Alumnado».</p>
      )}
    </div>
  )
}

function TarjetaAgrupamiento({ agrupamiento: a, alumnos, areas, unidades, onCambiar, onBorrar }: {
  agrupamiento: Agrupamiento
  alumnos: Alumno[]
  areas: Asignatura[]
  unidades: Unidad[]
  onCambiar: (cambio: Partial<Agrupamiento>, dicho?: string) => void
  onBorrar: () => void
}) {
  const [nombre, setNombre] = useState(a.nombre)
  const [cuantos, setCuantos] = useState(String(a.equipos.length || 4))
  useEffect(() => { setNombre(a.nombre) }, [a.nombre])

  const ids = alumnos.map(al => al.id!)
  const porId = new Map(alumnos.map(al => [al.id!, al]))
  const sueltos = sinEquipo(a, ids)
  const colocados = ids.length - sueltos.length
  const delArea = unidades.filter(u => u.asignatura_id === a.asignatura_id)
  const texto = (id: number) => { const al = porId.get(id); return al ? `${al.apellidos}, ${al.nombre}` : `Alumno ${id}` }

  const repartir = async () => {
    const n = Math.max(1, Math.floor(Number(cuantos)) || 1)
    if (colocados > 0) {
      const ok = await confirmar({
        titulo: `¿Repartir de nuevo «${a.nombre}» al azar?`,
        texto: `Los ${colocados} alumnos ya colocados cambian de equipo. Las notas ya puestas no cambian.`,
        aceptar: 'Repartir al azar',
      })
      if (!ok) return
    }
    const equipos = repartirAlAzar(ids, n, a.equipos)
    onCambiar({ equipos }, `Repartidos ${ids.length} alumnos en ${equipos.length} equipos.`)
  }

  const quitarEquipo = async (e: Equipo) => {
    if (e.alumnos.length) {
      const ok = await confirmar({
        titulo: `¿Quitar «${e.nombre}»?`,
        texto: `Sus ${e.alumnos.length} alumnos se quedan sin equipo.`,
        aceptar: 'Quitar el equipo', peligro: true,
      })
      if (!ok) return
    }
    onCambiar({ equipos: a.equipos.filter(x => x.clave !== e.clave) })
  }

  return (
    <section className="card" data-agrupamiento={a.id} data-nombre={a.nombre} style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ flex: '2 1 220px', fontSize: 12, color: 'var(--gris-600)' }}>
          Nombre del agrupamiento
          <input data-agrupamiento-nombre value={nombre} style={{ ...campo, width: '100%', fontWeight: 700 }}
            onChange={e => setNombre(e.target.value)}
            onBlur={() => { if (nombre.trim() && nombre.trim() !== a.nombre) onCambiar({ nombre }) }} />
        </label>
        <label style={{ flex: '1 1 180px', fontSize: 12, color: 'var(--gris-600)' }}>
          Vale para
          <select data-agrupamiento-area value={a.asignatura_id ?? ''} style={{ ...campo, width: '100%' }}
            onChange={e => onCambiar({ asignatura_id: e.target.value ? Number(e.target.value) : null, unidad_id: null })}>
            <option value="">Todas las áreas</option>
            {areas.map(ar => <option key={ar.id} value={ar.id}>{ar.nombre_display}</option>)}
          </select>
        </label>
        {a.asignatura_id != null && delArea.length > 0 && (
          <label style={{ flex: '1 1 180px', fontSize: 12, color: 'var(--gris-600)' }}>
            Unidad
            <select data-agrupamiento-unidad value={a.unidad_id ?? ''} style={{ ...campo, width: '100%' }}
              onChange={e => onCambiar({ unidad_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Todas las unidades</option>
              {delArea.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
        )}
      </div>

      <p data-agrupamiento-resumen style={{ fontSize: 13, color: 'var(--gris-600)', margin: '10px 0' }}>
        {alcanceDeAgrupamiento(a, areas, unidades)} · {a.equipos.length} equipos · {colocados} de {ids.length} alumnos colocados
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <label style={{ fontSize: 13 }}>
          Equipos:{' '}
          <input data-reparto-cuantos type="number" inputMode="numeric" min={1} max={Math.max(1, ids.length)} value={cuantos}
            onChange={e => setCuantos(e.target.value)} style={{ ...campo, width: 72 }} />
        </label>
        <Boton data-reparto-azar onClick={repartir} disabled={ids.length === 0}>Repartir al azar</Boton>
        {[2, 3, 4].map(t => (
          <Boton key={t} variante="enlace" data-reparto-tamano={t} onClick={() => setCuantos(String(equiposPorTamano(ids.length, t)))}>
            de {t}
          </Boton>
        ))}
        <span style={{ flex: 1 }} />
        <Boton data-equipo-nuevo onClick={() => onCambiar({ equipos: [...a.equipos, equipoNuevo(a.equipos)] })}>+ Equipo</Boton>
        <Boton variante="peligro" data-agrupamiento-borrar onClick={onBorrar}>Borrar</Boton>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
        {a.equipos.map(e => (
          <TarjetaEquipo key={e.clave} equipo={e} texto={texto} sueltos={sueltos}
            onNombre={n => onCambiar({ equipos: a.equipos.map(x => x.clave === e.clave ? { ...x, nombre: n } : x) })}
            onPoner={id => onCambiar({ equipos: moverAlumno(a.equipos, id, e.clave) })}
            onSacar={id => onCambiar({ equipos: moverAlumno(a.equipos, id, null) })}
            onQuitar={() => quitarEquipo(e)} />
        ))}
      </div>

      {sueltos.length > 0 && (
        <div data-sin-equipo style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Sin equipo ({sueltos.length})</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6 }}>
            {sueltos.map(id => (
              <li key={id} data-alumno-suelto={id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <span style={{ flex: 1 }}>{texto(id)}</span>
                <select data-alumno-poner={id} aria-label={`Equipo de ${texto(id)}`} value="" style={{ ...campo, maxWidth: 140 }}
                  onChange={ev => { if (ev.target.value) onCambiar({ equipos: moverAlumno(a.equipos, id, ev.target.value) }) }}>
                  <option value="">Poner en…</option>
                  {a.equipos.map(e => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function TarjetaEquipo({ equipo: e, texto, sueltos, onNombre, onPoner, onSacar, onQuitar }: {
  equipo: Equipo
  texto: (id: number) => string
  sueltos: number[]
  onNombre: (nombre: string) => void
  onPoner: (alumno: number) => void
  onSacar: (alumno: number) => void
  onQuitar: () => void
}) {
  const [nombre, setNombre] = useState(e.nombre)
  useEffect(() => { setNombre(e.nombre) }, [e.nombre])

  return (
    <div data-equipo={e.clave} data-nombre={e.nombre} style={{ border: '1px solid var(--gris-300)', borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input data-equipo-nombre value={nombre} aria-label="Nombre del equipo" style={{ ...campo, flex: 1, minWidth: 0, fontWeight: 700 }}
          onChange={ev => setNombre(ev.target.value)}
          onBlur={() => { if (nombre.trim() && nombre.trim() !== e.nombre) onNombre(nombre) }} />
        <button type="button" className="modal-close" data-equipo-quitar aria-label={`Quitar ${e.nombre}`} onClick={onQuitar}>✕</button>
      </div>
      <ul style={{ listStyle: 'none', margin: '8px 0', padding: 0 }}>
        {e.alumnos.map(id => (
          <li key={id} data-equipo-alumno={id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, minHeight: 36 }}>
            <span style={{ flex: 1 }}>{texto(id)}</span>
            <button type="button" className="boton-enlace" data-equipo-sacar={id} aria-label={`Sacar a ${texto(id)} de ${e.nombre}`}
              style={{ minWidth: 44, minHeight: 36 }} onClick={() => onSacar(id)}>×</button>
          </li>
        ))}
        {e.alumnos.length === 0 && <li style={{ fontSize: 13, color: 'var(--gris-600)' }}>Vacío.</li>}
      </ul>
      {sueltos.length > 0 && (
        <select data-equipo-anadir aria-label={`Añadir un alumno a ${e.nombre}`} value="" style={{ ...campo, width: '100%' }}
          onChange={ev => { if (ev.target.value) onPoner(Number(ev.target.value)) }}>
          <option value="">+ alumno…</option>
          {sueltos.map(id => <option key={id} value={id}>{texto(id)}</option>)}
        </select>
      )}
    </div>
  )
}
