/**
 * Lo que el docente hace DENTRO de una familia de instrumentos.
 *
 * Va debajo de cada familia en ⚙ Instrumentos. Lista sus hijos —speaking,
 * listening, el examen de cada unidad, el billete de salida— con tipo, peso
 * relativo y los criterios que cubren en cada unidad (siempre dentro de los
 * de la familia). Ofrece añadir uno a mano o lanzar el asistente con las
 * plantillas del área.
 *
 * Nada de lo que hay aquí escribe notas: solo instrumentos y sus criterios.
 */
import { useEffect, useState } from 'react'
import {
  getHijos, crearInstrumentoHijo, actualizarInstrumento, eliminarInstrumento, moverInstrumento,
  criteriosDeFamiliaPorUnidad, criteriosDeHijoPorUnidad, fijarCriteriosDeHijo,
  type CriteriosDeFamiliaPorUnidad,
} from '@/db/queries'
import type { Instrumento } from '@/db/localDb'
import { TIPOS_INSTRUMENTO, getInstrConfig } from '@/ia/instrumentosConfig'
import AsistenteFamilia from './AsistenteFamilia'

interface Props {
  familia: Instrumento
  asignaturaNombre: string
  /** Descripciones de los criterios del currículo, para el asistente y las ayudas. */
  criterios: { id: string; descripcion: string }[]
  /** Capa del asistente cuando este gestor ya va anidado. */
  capa?: string
  /** Algo ha cambiado: el gestor relee. */
  onCambio: () => void
}

export default function FamiliaHijos({ familia, asignaturaNombre, criterios, capa, onCambio }: Props) {
  const [hijos, setHijos] = useState<Instrumento[]>([])
  const [cobertura, setCobertura] = useState<CriteriosDeFamiliaPorUnidad[]>([])
  const [deHijo, setDeHijo] = useState<Map<number, Map<number, string[]>>>(new Map())
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: string } | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [asistente, setAsistente] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      const [h, cob] = await Promise.all([getHijos(familia.id!), criteriosDeFamiliaPorUnidad(familia.id!)])
      const mapas = new Map<number, Map<number, string[]>>()
      for (const x of h) mapas.set(x.id!, await criteriosDeHijoPorUnidad(x.id!))
      if (!vigente) return
      setHijos(h); setCobertura(cob); setDeHijo(mapas)
    })()
    return () => { vigente = false }
  }, [familia.id, recarga])

  const cambiado = () => { setRecarga(n => n + 1); onCambio() }
  const descripcion = (id: string) => criterios.find(c => c.id === id)?.descripcion ?? ''

  const crear = async () => {
    if (!nuevo?.nombre.trim()) return
    setError(null)
    try {
      const id = await crearInstrumentoHijo(familia.id!, { nombre: nuevo.nombre, tipo: nuevo.tipo })
      // Por defecto cubre todo lo de la familia: luego se recorta.
      for (const u of cobertura) await fijarCriteriosDeHijo(u.unidad_id, id, u.criterios)
      setNuevo(null)
      cambiado()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear') }
  }

  const borrar = async (h: Instrumento) => {
    if (!confirm(`¿Eliminar «${h.nombre}» de «${familia.nombre}» y TODAS sus notas y registros? No se puede deshacer.`)) return
    await eliminarInstrumento(h.id!)
    cambiado()
  }

  const alternarCriterio = async (h: Instrumento, u: CriteriosDeFamiliaPorUnidad, criterio: string) => {
    const actuales = deHijo.get(h.id!)?.get(u.unidad_id) ?? []
    const siguientes = actuales.includes(criterio) ? actuales.filter(c => c !== criterio) : [...actuales, criterio]
    setError(null)
    try {
      await fijarCriteriosDeHijo(u.unidad_id, h.id!, siguientes)
      cambiado()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar') }
  }

  const totalCriterios = (h: Instrumento) => {
    const m = deHijo.get(h.id!)
    if (!m) return 0
    const ids = new Set<string>()
    for (const lista of m.values()) for (const c of lista) ids.add(c)
    return ids.size
  }
  const totalFamilia = new Set(cobertura.flatMap(u => u.criterios)).size
  const sumaPesos = hijos.reduce((s, h) => s + (h.peso > 0 ? h.peso : 1), 0)

  return (
    <div data-familia-hijos style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--gris-300)' }}>
      {asistente && (
        <AsistenteFamilia
          familia={familia}
          asignaturaNombre={asignaturaNombre}
          cobertura={cobertura}
          criterios={criterios}
          yaExisten={hijos.map(h => h.nombre)}
          capa={capa}
          onCerrar={creados => { setAsistente(false); if (creados) cambiado() }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: hijos.length || nuevo ? 8 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
          Dentro de esta familia
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--gris-600)' }}>
          {hijos.length === 0
            ? <>Nada todavía: se califica directamente con «{familia.nombre}».</>
            : <>{hijos.length} instrumento{hijos.length !== 1 ? 's' : ''} · cuentan por su peso relativo y la familia pesa su {familia.peso} % en el área.</>}
        </span>
        <div style={{ flex: 1 }} />
        {totalFamilia > 0 && (
          <button data-asistente-abrir onClick={() => setAsistente(true)} className="btn-secondary" style={{ fontSize: 11.5 }}
            title="Elegir entre lo que suele hacerse en esta área: speaking, listening, un examen por unidad, billete de salida…">
            ✨ ¿Qué haces dentro?
          </button>
        )}
        <button data-hijo-nuevo onClick={() => setNuevo({ nombre: '', tipo: 'observacion' })} className="btn-secondary" style={{ fontSize: 11.5 }}
          disabled={!!nuevo || totalFamilia === 0}
          title={totalFamilia === 0 ? 'Asigna primero esta familia a algún criterio en la programación' : 'Añadir un instrumento dentro de esta familia'}>
          + Añadir
        </button>
      </div>

      {error && <div style={{ color: 'var(--rojo-500)', fontSize: 12, marginBottom: 6 }}>{error}</div>}

      {hijos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {hijos.map((h, idx) => {
            const cfg = getInstrConfig(h.tipo)
            const n = totalCriterios(h)
            const abierto = editando === h.id
            const pct = Math.round(((h.peso > 0 ? h.peso : 1) / sumaPesos) * 100)
            return (
              <div key={h.id} data-hijo data-nombre={h.nombre} style={{ background: 'white', border: `1px solid ${cfg.color}40`, borderLeft: `4px solid ${cfg.color}`, borderRadius: 8, padding: '6px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button onClick={() => moverInstrumento(h.asignatura_id, h.id!, -1).then(cambiado)} disabled={idx === 0} aria-label="Subir"
                      style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 10, padding: 0, opacity: idx === 0 ? .3 : 1, lineHeight: 1.1 }}>▲</button>
                    <button onClick={() => moverInstrumento(h.asignatura_id, h.id!, 1).then(cambiado)} disabled={idx === hijos.length - 1} aria-label="Bajar"
                      style={{ background: 'none', border: 'none', cursor: idx === hijos.length - 1 ? 'default' : 'pointer', fontSize: 10, padding: 0, opacity: idx === hijos.length - 1 ? .3 : 1, lineHeight: 1.1 }}>▼</button>
                  </div>
                  <span aria-hidden="true" style={{ fontSize: 15 }}>{cfg.icon}</span>
                  <input defaultValue={h.nombre} aria-label="Nombre"
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== h.nombre) actualizarInstrumento(h.id!, { nombre: v }).then(cambiado) }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    style={{ flex: '1 1 220px', fontSize: 12.5, fontWeight: 600, padding: '4px 7px', minWidth: 160 }} />
                  <select value={h.tipo} aria-label="Tipo" onChange={e => actualizarInstrumento(h.id!, { tipo: e.target.value }).then(cambiado)} style={{ fontSize: 11.5, padding: '4px 5px' }}>
                    {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                  <label title="Peso relativo dentro de la familia. Con 1 en todos, cuentan igual; un examen final con 3 cuenta el triple que un control con 1."
                    style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--gris-600)', fontWeight: 600 }}>
                    peso
                    <input type="number" min={1} max={99} defaultValue={h.peso > 0 ? h.peso : 1} data-peso-hijo
                      onBlur={e => { const v = Number(e.target.value); if (v >= 1 && v !== h.peso) actualizarInstrumento(h.id!, { peso: v }).then(cambiado) }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      style={{ width: 44, fontSize: 12, fontWeight: 700, textAlign: 'center', padding: '4px 2px' }} />
                    <span style={{ fontWeight: 500 }}>({pct} %)</span>
                  </label>
                  <button data-hijo-criterios onClick={() => setEditando(abierto ? null : h.id!)} aria-expanded={abierto}
                    title="Qué criterios de la familia evalúa este instrumento, unidad por unidad"
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 6, cursor: 'pointer', background: n === 0 ? '#fffbeb' : 'white', color: n === 0 ? '#92400e' : 'var(--gris-600)', border: `1px solid ${n === 0 ? '#fde68a' : 'var(--gris-300)'}` }}>
                    {n} de {totalFamilia} criterios {abierto ? '▴' : '▾'}
                  </button>
                  <button onClick={() => borrar(h)} title="Eliminar" aria-label="Eliminar"
                    style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>×</button>
                </div>

                {abierto && (
                  <div data-hijo-criterios-lista style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cobertura.map(u => {
                      const marcados = deHijo.get(h.id!)?.get(u.unidad_id) ?? []
                      return (
                        <div key={u.unidad_id} style={{ fontSize: 12 }}>
                          <div style={{ fontWeight: 700, color: 'var(--azul-900)', marginBottom: 3 }}>
                            {u.nombre} {u.trimestre ? <span style={{ fontWeight: 500, color: 'var(--gris-500)' }}>T{u.trimestre}</span> : null}
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {u.criterios.map(c => {
                              const activo = marcados.includes(c)
                              return (
                                <button key={c} type="button" aria-pressed={activo} title={descripcion(c)}
                                  onClick={() => alternarCriterio(h, u, c)}
                                  style={{
                                    fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 14, cursor: 'pointer',
                                    border: `1.5px solid ${activo ? cfg.color : 'var(--gris-300)'}`,
                                    background: activo ? cfg.color : 'white', color: activo ? 'white' : 'var(--gris-600)',
                                  }}>{c}</button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {nuevo && (
        <div data-hijo-form style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--gris-100)', borderRadius: 8, padding: 8 }}>
          <input value={nuevo.nombre} autoFocus placeholder="Nombre (Speaking, Cuaderno, Examen tema 3…)" aria-label="Nombre del nuevo instrumento"
            onChange={e => setNuevo(n => n && ({ ...n, nombre: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') crear(); if (e.key === 'Escape') setNuevo(null) }}
            style={{ flex: '1 1 180px', fontSize: 12.5 }} />
          <select value={nuevo.tipo} onChange={e => setNuevo(n => n && ({ ...n, tipo: e.target.value }))} style={{ fontSize: 11.5 }}>
            {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
          <button data-hijo-crear className="btn-primary" style={{ fontSize: 12 }} onClick={crear} disabled={!nuevo.nombre.trim()}>Crear</button>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setNuevo(null)}>Cancelar</button>
          <div style={{ flexBasis: '100%', fontSize: 11, color: 'var(--gris-600)' }}>
            Empieza cubriendo todos los criterios de la familia; después recórtalos con «criterios».
          </div>
        </div>
      )}
    </div>
  )
}
