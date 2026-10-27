/**
 * Gestor completo de instrumentos de evaluación de una asignatura.
 * Accesible desde el Calificador y la evaluación rápida (no hace falta
 * ir a la ficha del grupo). Cada cambio se guarda al momento en IndexedDB.
 *
 * Configurable por instrumento: nombre, tipo, peso (%), trimestres en los
 * que aplica, orden (▲▼) y rúbrica asociada.
 */
import { useEffect, useState } from 'react'
import {
  getAsignaturaDetalle, crearInstrumento, eliminarInstrumento,
  actualizarInstrumento, moverInstrumento, getGrupo,
  usoDeInstrumento, retirarInstrumentoDeUnidad, type UsoDeInstrumento,
} from '@/db/queries'
import { api } from '@/api'
import { useAppStore } from '@/store/useAppStore'
import FamiliaHijos from './FamiliaHijos'
import type { Instrumento, Agregacion } from '@/db/localDb'
import { TIPOS_INSTRUMENTO, getInstrConfig } from '@/ia/instrumentosConfig'
import { AGREGACIONES } from '@/db/diario'
import RubricaEditor from './RubricaEditor'
import PruebaEditor from './PruebaEditor'

interface Props {
  asignaturaId: number
  asignaturaNombre: string
  nivel: string            // p.ej. "5º primaria" (para el editor de rúbricas)
  onClose: () => void      // el llamante recarga sus datos al cerrar
  /**
   * Se abre desde otro modal (el panel de celda del calificador) y no desde una
   * pantalla. Sin esto empata en capa con quien lo abrió y queda por debajo.
   */
  anidado?: boolean
  /** Unidad abierta en el calificador: la que se propone al retirar un instrumento de una sola unidad. */
  unidadActual?: { id: number; nombre: string } | null
}

/** «3 unidades · 24 notas · 5 registros del diario», para la fila y el confirm. */
export function describeUso(u: UsoDeInstrumento): string {
  const enUso = u.unidades.filter(x => x.criterios > 0).length
  return [
    `${enUso} unidad${enUso !== 1 ? 'es' : ''}`,
    `${u.calificaciones} nota${u.calificaciones !== 1 ? 's' : ''}`,
    u.diario ? `${u.diario} registro${u.diario !== 1 ? 's' : ''} del diario` : '',
  ].filter(Boolean).join(' · ')
}

function parseTrimestres(json: string | undefined): number[] {
  try {
    const t = JSON.parse(json || '[1,2,3]')
    return Array.isArray(t) && t.length ? t : [1, 2, 3]
  } catch { return [1, 2, 3] }
}

export default function InstrumentosManager({ asignaturaId, asignaturaNombre, nivel, onClose, anidado = false, unidadActual = null }: Props) {
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: string; peso: number } | null>(null)
  const [rubricaDe, setRubricaDe] = useState<Instrumento | null>(null)
  const [pruebaDe, setPruebaDe] = useState<Instrumento | null>(null)
  /** Dónde se usa cada familia (con sus hijos) y cuánto guarda: lo que el «×» va a tocar. */
  const [usos, setUsos] = useState<Record<number, UsoDeInstrumento>>({})
  /** Familia a la que se está eligiendo de qué unidad retirar. */
  const [retirando, setRetirando] = useState<{ id: number; unidad: string } | null>(null)
  const [avisoUso, setAvisoUso] = useState<string | null>(null)
  /** Enunciados del currículo, para que el asistente reparta criterios por sus palabras. */
  const [criterios, setCriterios] = useState<{ id: string; descripcion: string }[]>([])
  const headers = useAppStore(s => s._headers)

  const cargar = async () => {
    const det = await getAsignaturaDetalle(asignaturaId)
    // Solo las familias: los hijos no pesan en el área y van dentro de cada una.
    const familias = (det?.instrumentos || []).filter(i => i.familia_id == null)
    setInstrumentos(familias)
    const pares = await Promise.all(familias.map(async f => [f.id!, await usoDeInstrumento(f.id!)] as const))
    setUsos(Object.fromEntries(pares))
  }
  useEffect(() => { cargar() }, [asignaturaId])

  useEffect(() => {
    let vigente = true
    ;(async () => {
      const asig = await getAsignaturaDetalle(asignaturaId)
      const grupo = asig ? await getGrupo(asig.grupo_id) : undefined
      if (!asig || !grupo) return
      const cursoNorm = String(grupo.curso).replace('º', '').replace('ª', '') + 'º'
      const url = `/api/curriculum/criterios?asignatura=${encodeURIComponent(asig.nombre)}&curso=${cursoNorm}&etapa=${grupo.etapa}&comunidad=${encodeURIComponent(asig.comunidad || grupo.comunidad)}`
      try {
        const r = await fetch(api(url), { headers: headers() })
        const all = r.ok ? await r.json() : []
        if (vigente) setCriterios(Array.isArray(all) ? all : [])
      } catch { if (vigente) setCriterios([]) }
    })()
    return () => { vigente = false }
  }, [asignaturaId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !rubricaDe && !pruebaDe) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, rubricaDe, pruebaDe])

  // Guardado inmediato campo a campo
  const cambiar = async (id: number, fields: Parameters<typeof actualizarInstrumento>[1]) => {
    await actualizarInstrumento(id, fields)
    await cargar()
  }

  const toggleTrimestre = async (ins: Instrumento, t: number) => {
    const actuales = parseTrimestres(ins.trimestres)
    const nuevos = actuales.includes(t) ? actuales.filter(x => x !== t) : [...actuales, t].sort()
    if (nuevos.length === 0) return // al menos un trimestre
    await cambiar(ins.id!, { trimestres: JSON.stringify(nuevos) })
  }

  const mover = async (ins: Instrumento, dir: -1 | 1) => {
    await moverInstrumento(asignaturaId, ins.id!, dir)
    await cargar()
  }

  /**
   * Borrar un instrumento es de TODA el área, no de una unidad, y el confirm
   * lo dice con cifras: Luis pulsaba «×» sin saber si quitaba de una unidad
   * o de todas, ni cuántas notas se iban. Para quitarlo solo de una unidad
   * está «Retirar de una unidad», que toca la programación y no el instrumento.
   */
  const borrar = async (ins: Instrumento) => {
    const u = usos[ins.id!] ?? await usoDeInstrumento(ins.id!)
    const lineas = [
      `Eliminar «${ins.nombre}» del área entera.`,
      '',
      `Se retira de TODAS las unidades de ${asignaturaNombre} (${describeUso(u)}${u.hijos ? `; se lleva también ${u.hijos} instrumento${u.hijos !== 1 ? 's' : ''} de dentro` : ''}).`,
      'Las notas quedan guardadas en este aparato, pero sin columna: no se ven ni cuentan. No se puede deshacer desde la app.',
      'Si tiene rúbrica o examen, se conserva una copia en tu banco.',
      '',
      'Si solo sobra en una unidad, cancela y usa «Retirar de una unidad»: la programación de esa unidad deja de usarlo y lo demás no cambia.',
    ]
    if (!confirm(lineas.join('\n'))) return
    await eliminarInstrumento(ins.id!)
    await cargar()
  }

  /** Retirar la familia (y sus hijos) de la programación de UNA unidad. Las notas se conservan. */
  const retirarDeUnidad = async (ins: Instrumento) => {
    if (!retirando || retirando.id !== ins.id) return
    const u = usos[ins.id!]
    const unidad = u?.unidades.find(x => String(x.unidad_id) === retirando.unidad)
    if (!unidad) return
    const notas = unidad.calificaciones + unidad.diario
    if (!confirm(`Retirar «${ins.nombre}» solo de «${unidad.nombre}».\n\nDeja de evaluar sus ${unidad.criterios} criterio${unidad.criterios !== 1 ? 's' : ''} en esa unidad; en las demás sigue igual.${notas ? ` Las ${unidad.calificaciones} nota${unidad.calificaciones !== 1 ? 's' : ''}${unidad.diario ? ` y ${unidad.diario} registro${unidad.diario !== 1 ? 's' : ''} del diario` : ''} de esa unidad se conservan, sin columna hasta que vuelvas a asignarlo.` : ''}`)) return
    const n = await retirarInstrumentoDeUnidad(ins.id!, unidad.unidad_id)
    setRetirando(null)
    setAvisoUso(`«${ins.nombre}» ya no se usa en «${unidad.nombre}» (${n} criterio${n !== 1 ? 's' : ''} retirado${n !== 1 ? 's' : ''}). Las notas de esa unidad siguen guardadas.`)
    await cargar()
  }

  const crearNuevo = async () => {
    if (!nuevo?.nombre.trim()) return
    const nombre = nuevo.nombre.trim()
    const esRubrica = nuevo.tipo === 'rubrica'
    const id = await crearInstrumento(asignaturaId, {
      nombre, tipo: nuevo.tipo, peso: nuevo.peso,
      trimestres: '[1,2,3]', orden: instrumentos.length,
    })
    setNuevo(null)
    await cargar()
    // Una rúbrica sin rúbrica no evalúa nada. Antes había que caer en la
    // cuenta de que el botón «📊 Rúbrica» de la fila era el que la creaba;
    // ahora se ofrece diseñarla en cuanto se elige el tipo.
    if (esRubrica) {
      setRubricaDe({ id, asignatura_id: asignaturaId, nombre, tipo: 'rubrica', peso: 0, trimestres: '[1,2,3]' } as Instrumento)
    }
  }

  const total = instrumentos.reduce((s, i) => s + (i.peso || 0), 0)
  const totalOk = total === 100

  return (
    <>
      {rubricaDe && (
        <RubricaEditor
          instrumentoId={rubricaDe.id!}
          instrumentoNombre={rubricaDe.nombre}
          asignaturaNombre={asignaturaNombre}
          nivel={nivel}
          capa={anidado ? 'var(--z-modal-anidado-2)' : undefined}
          onCerrar={() => setRubricaDe(null)}
        />
      )}

      {pruebaDe && (
        // Desde aquí no hay unidad: se edita el examen general del instrumento.
        // El de cada unidad se define desde el calificador, dentro de la unidad.
        <PruebaEditor
          instrumentoId={pruebaDe.id!}
          instrumentoNombre={pruebaDe.nombre}
          asignaturaId={asignaturaId}
          unidadId={null}
          criterios={[]}
          asignaturaNombre={asignaturaNombre}
          nivel={nivel}
          capa={anidado ? 'var(--z-modal-anidado-2)' : undefined}
          onCerrar={() => setPruebaDe(null)}
        />
      )}

      <div className="modal-overlay" style={anidado ? { zIndex: 'var(--z-modal-anidado)' } : undefined}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="card" role="dialog" aria-modal="true" aria-label="Gestionar instrumentos de evaluación"
          style={{ width: 'min(720px, 94vw)', maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-700)' }}>
              🎯 Qué evalúo — {asignaturaNombre} <span style={{ fontWeight: 500, color: 'var(--gris-600)', fontSize: 13 }}>· instrumentos</span>
            </h2>
            <button onClick={onClose} className="modal-close" aria-label="Cerrar">✕</button>
          </div>
          {/* Este peso es el reparto POR DEFECTO, no el definitivo: desde que un
              criterio puede declarar el suyo en la programación, decir «peso
              total» a secas hacía creer que mandaba siempre. */}
          <div style={{ fontSize: 12, color: 'var(--gris-600)', marginBottom: 14, lineHeight: 1.55 }}>
            Cada bloque es una <strong>familia</strong>: lo que la programación pesa en el área. Dentro de cada una va lo que haces de verdad. Reparto por defecto:{' '}
            <strong style={{ color: totalOk ? 'var(--verde-500)' : 'var(--ambar-500)' }}>
              {total}%{totalOk ? ' ✓' : total > 100 ? ' (excede 100)' : ` (falta ${100 - total})`}
            </strong>
            <div style={{ fontSize: 11, color: 'var(--gris-500)', marginTop: 3 }}>
              Es lo que se aplica a los criterios que no declaran el suyo. Un criterio
              concreto puede repartir distinto —por ejemplo, que prueba, cuaderno y lista
              de control cuenten por igual— desde 📋 Programación, sin tocar esto.
            </div>
          </div>

          {avisoUso && (
            <div data-uso-aviso role="status" style={{ fontSize: 12.5, color: 'var(--verde-500)', fontWeight: 600, marginBottom: 10 }}>{avisoUso}</div>
          )}

          {instrumentos.length === 0 && !nuevo && (
            <p style={{ color: 'var(--gris-600)', fontSize: 13, marginBottom: 12 }}>
              Sin instrumentos todavía. Crea el primero para poder calificar.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {instrumentos.map((ins, idx) => {
              const cfg = getInstrConfig(ins.tipo)
              const trims = parseTrimestres(ins.trimestres)
              return (
                <div key={ins.id} data-familia-bloque data-nombre={ins.nombre} style={{
                  border: `1px solid ${cfg.color}30`, background: cfg.bg,
                  borderRadius: 10, padding: '10px 12px',
                }}>
                  {/* Fila 1: orden, nombre, tipo, peso, acciones */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      <button onClick={() => mover(ins, -1)} disabled={idx === 0} aria-label="Subir"
                        style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 11, padding: 0, opacity: idx === 0 ? 0.3 : 1, lineHeight: 1.1 }}>▲</button>
                      <button onClick={() => mover(ins, 1)} disabled={idx === instrumentos.length - 1} aria-label="Bajar"
                        style={{ background: 'none', border: 'none', cursor: idx === instrumentos.length - 1 ? 'default' : 'pointer', fontSize: 11, padding: 0, opacity: idx === instrumentos.length - 1 ? 0.3 : 1, lineHeight: 1.1 }}>▼</button>
                    </div>
                    <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                    <input
                      defaultValue={ins.nombre}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== ins.nombre) cambiar(ins.id!, { nombre: v }) }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      style={{ flex: '1 1 140px', fontSize: 13, fontWeight: 600, padding: '5px 8px', minWidth: 120 }}
                    />
                    <select value={ins.tipo} onChange={e => cambiar(ins.id!, { tipo: e.target.value })}
                      style={{ fontSize: 12, padding: '5px 6px' }}>
                      {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <input type="number" min={1} max={100} defaultValue={ins.peso}
                        onBlur={e => { const v = Number(e.target.value); if (v >= 1 && v <= 100 && v !== ins.peso) cambiar(ins.id!, { peso: v }) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        style={{ width: 58, fontSize: 13, fontWeight: 700, textAlign: 'center', padding: '5px 2px' }} />
                      <span style={{ fontSize: 12, color: 'var(--gris-600)' }}>%</span>
                    </div>
                    <button onClick={() => borrar(ins)} title="Eliminar instrumento" aria-label="Eliminar"
                      style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>
                      ×
                    </button>
                  </div>

                  {/* Dónde se usa y cuánto guarda: lo que «×» tocaría. */}
                  {usos[ins.id!] && (
                    <div data-uso-instrumento style={{ fontSize: 11.5, color: 'var(--gris-600)', marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span title={usos[ins.id!].unidades.filter(u => u.criterios > 0).map(u => `${u.nombre}: ${u.criterios} criterios, ${u.calificaciones} notas`).join('\n') || 'No está en la programación de ninguna unidad'}>
                        Se usa en {describeUso(usos[ins.id!])}
                      </span>
                      {usos[ins.id!].unidades.some(u => u.criterios > 0) && retirando?.id !== ins.id && (
                        <button type="button" data-retirar-unidad onClick={() => {
                          const lista = usos[ins.id!].unidades.filter(u => u.criterios > 0)
                          const propuesta = lista.find(u => u.unidad_id === unidadActual?.id) ?? lista[0]
                          setRetirando({ id: ins.id!, unidad: String(propuesta.unidad_id) })
                        }}
                          title="Quitarlo de la programación de una sola unidad, sin borrar el instrumento ni sus notas"
                          style={{ background: 'none', border: 0, padding: 0, color: 'var(--azul-500)', fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>
                          Retirar de una unidad…
                        </button>
                      )}
                      {retirando?.id === ins.id && (
                        <span data-retirar-unidad-form style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <select data-retirar-unidad-select value={retirando?.unidad} onChange={e => setRetirando({ id: ins.id!, unidad: e.target.value })} style={{ fontSize: 11.5 }}>
                            {usos[ins.id!].unidades.filter(u => u.criterios > 0).map(u => (
                              <option key={u.unidad_id} value={String(u.unidad_id)}>{u.nombre}{u.trimestre ? ` (T${u.trimestre})` : ''} · {u.calificaciones} notas</option>
                            ))}
                          </select>
                          <button type="button" data-retirar-unidad-aceptar className="btn-secondary" style={{ fontSize: 11.5 }} onClick={() => retirarDeUnidad(ins)}>Retirar</button>
                          <button type="button" className="btn-secondary" style={{ fontSize: 11.5 }} onClick={() => setRetirando(null)}>Cancelar</button>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Fila 2: trimestres en los que aplica + rúbrica */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--gris-600)', fontWeight: 600 }}>Aplica en:</span>
                    {[1, 2, 3].map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600, color: trims.includes(t) ? 'var(--azul-700)' : 'var(--gris-500)' }}>
                        <input type="checkbox" checked={trims.includes(t)} onChange={() => toggleTrimestre(ins, t)} />
                        {t}º trim.
                      </label>
                    ))}
                    <label data-agregacion title="Si un alumno tiene varios registros del diario con este instrumento, así se funden en su nota"
                      style={{ fontSize: 11, color: 'var(--gris-600)', fontWeight: 600, display: 'flex', gap: 4, alignItems: 'center' }}>
                      Varios registros:
                      <select value={ins.agregacion ?? 'media'} onChange={e => cambiar(ins.id!, { agregacion: e.target.value as Agregacion })}
                        style={{ fontSize: 11, padding: '2px 4px' }}>
                        {AGREGACIONES.map(a => <option key={a.value} value={a.value} title={a.ayuda}>{a.label}</option>)}
                      </select>
                    </label>
                    <div style={{ flex: 1 }} />
                    {ins.tipo === 'prueba-escrita' && (
                      <button onClick={() => setPruebaDe(ins)}
                        title="Examen general del instrumento: tipo, preguntas y puntos. El de cada unidad se define desde el calificador."
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                          background: 'var(--azul-700)', color: 'white', border: 'none',
                        }}>
                        📝 Examen
                      </button>
                    )}
                    <button onClick={() => setRubricaDe(ins)}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                        background: ins.tipo === 'rubrica' ? '#166534' : 'white',
                        color: ins.tipo === 'rubrica' ? 'white' : 'var(--gris-600)',
                        border: ins.tipo === 'rubrica' ? 'none' : '1px solid var(--gris-300)',
                      }}>
                      📊 Rúbrica
                    </button>
                  </div>

                  {/* Lo que el docente hace dentro: speaking, el examen de cada unidad… */}
                  <FamiliaHijos
                    familia={ins}
                    asignaturaNombre={asignaturaNombre}
                    criterios={criterios}
                    capa={anidado ? 'var(--z-modal-anidado-2)' : undefined}
                    onCambio={cargar}
                  />
                </div>
              )
            })}
          </div>

          {/* Crear nuevo */}
          {nuevo ? (
            <div style={{ background: 'var(--gris-100)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <input value={nuevo.nombre} autoFocus placeholder="Nombre del instrumento *"
                  onChange={e => setNuevo(n => n && ({ ...n, nombre: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') crearNuevo() }}
                  style={{ flex: '1 1 160px', fontSize: 13 }} />
                <select value={nuevo.tipo} onChange={e => setNuevo(n => n && ({ ...n, tipo: e.target.value }))}
                  style={{ fontSize: 12 }}>
                  {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <input type="number" min={1} max={100} value={nuevo.peso}
                    onChange={e => setNuevo(n => n && ({ ...n, peso: Number(e.target.value) }))}
                    style={{ width: 58, fontSize: 13, textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: 'var(--gris-600)' }}>%</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={crearNuevo} disabled={!nuevo.nombre.trim()}>
                  Crear
                </button>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setNuevo(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary" style={{ fontSize: 13 }}
              onClick={() => setNuevo({ nombre: '', tipo: 'prueba-escrita', peso: Math.max(1, 100 - total) })}>
              + Nuevo instrumento
            </button>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-primary" onClick={onClose}>Hecho</button>
          </div>
        </div>
      </div>
    </>
  )
}
