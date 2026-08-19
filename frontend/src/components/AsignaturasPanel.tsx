import { useEffect, useState } from 'react'
import ProgramacionPanel from './ProgramacionPanel'
import RubricaEditor from './RubricaEditor'
import {
  getAsignaturas, getAsignaturaDetalle, crearAsignatura, crearAsignaturasEnLote,
  eliminarAsignatura, crearInstrumento, eliminarInstrumento, actualizarInstrumento,
} from '@/db/queries'
import { useAppStore } from '@/store/useAppStore'
import { TIPOS_INSTRUMENTO, getInstrConfig } from '@/ia/instrumentosConfig'
import { api } from '@/api'

// Mapa de slugs curriculares → nombres legibles
const NOMBRES: Record<string, string> = {
  'ciencias-naturales':               'Ciencias de la Naturaleza',
  'ciencias-sociales':                'Ciencias Sociales',
  'educacion-fisica':                 'Educación Física',
  'educacion-plastica':               'Educación Plástica y Visual',
  'lengua-castellana':                'Lengua Castellana y Literatura',
  'lengua-extranjera':                'Lengua Extranjera (Inglés)',
  'lingua-galega':                    'Lingua Galega e Literatura',
  'matematicas':                      'Matemáticas',
  'musica-danza':                     'Música y Danza',
  'plastica-visual':                  'Educación Plástica y Visual',
  'proyecto-competencial':            'Proyecto Competencial',
  'biologia-y-geologia':              'Biología y Geología',
  'fisica-y-quimica':                 'Física y Química',
  'geografia-e-historia':             'Geografía e Historia',
  'musica':                           'Música',
  'tecnologia':                       'Tecnología y Digitalización',
  'informatica':                      'Informática',
  'educacion-estetica':               'Educación Estética',
  'ambito-cientifico-tecnologico':    'Ámbito Científico-Tecnológico',
  'ambito-linguistico-y-social':      'Ámbito Lingüístico y Social',
  'economia':                         'Economía',
  'filosofia':                        'Filosofía',
  'latin':                            'Latín',
  'religion':                         'Religión',
  'valores-civicos':                  'Valores Cívicos y Éticos',
}

interface Instrumento {
  id: number
  nombre: string
  tipo: string
  peso: number
}

interface Asignatura {
  id: number
  nombre: string
  nombre_display: string
  instrumentos?: Instrumento[]
}

interface Props {
  grupoId: string
  etapa: string
  curso: string
  comunidad: string
  onCambio?: () => void
}

interface RubricaOpen {
  instrumentoId: number
  instrumentoNombre: string
  asignaturaNombre: string
}

function humanizarSlug(slug: string): string {
  if (NOMBRES[slug]) return NOMBRES[slug]
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default function AsignaturasPanel({ grupoId, etapa, curso, comunidad, onCambio }: Props) {
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([])
  const [disponibles, setDisponibles] = useState<string[]>([])
  const [expandida, setExpandida] = useState<number | null>(null)
  const [tabActiva, setTabActiva] = useState<Record<number, 'instrumentos' | 'programacion'>>({})
  const [selector, setSelector] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [nombreLibre, setNombreLibre] = useState('')
  const [formInstr, setFormInstr] = useState<number | null>(null)
  const [instr, setInstr] = useState({ nombre: '', tipo: 'prueba-escrita', peso: 100 })
  const [guardando, setGuardando] = useState(false)
  const [rubricaOpen, setRubricaOpen] = useState<RubricaOpen | null>(null)
  const [aviso, setAviso] = useState('')

  const [instrEditId, setInstrEditId] = useState<number | null>(null)
  const [instrEditForm, setInstrEditForm] = useState({ nombre: '', tipo: '', peso: 0 })

  const headers = useAppStore(s => s._headers)

  const getTab = (id: number) => tabActiva[id] || 'programacion'
  const setTab = (id: number, tab: 'instrumentos' | 'programacion') =>
    setTabActiva(t => ({ ...t, [id]: tab }))

  const cargar = async () => {
    const [asigs, currList] = await Promise.all([
      getAsignaturas(Number(grupoId)),
      fetch(api(`/api/curriculum/asignaturas?etapa=${etapa}&comunidad=${encodeURIComponent(comunidad)}`),
        { headers: headers() }).then(r => r.json()).catch(() => []),
    ])
    const conInstr = await Promise.all(
      asigs.map(async (a: any) => {
        const det = await getAsignaturaDetalle(a.id)
        return { ...a, instrumentos: det?.instrumentos || [] } as Asignatura
      })
    )
    setAsignaturas(conInstr)
    const slugsYa = new Set(asigs.map((a: any) => a.nombre))
    setDisponibles(
      Array.isArray(currList)
        ? currList.map((c: any) => c.asignatura).filter((s: string) => !slugsYa.has(s))
        : []
    )
    onCambio?.()
  }

  useEffect(() => { cargar() }, [grupoId, comunidad, etapa])

  // ── Alta de áreas en lote ────────────────────────────────────────────

  const alternar = (slug: string) => {
    setMarcadas(prev => {
      const s = new Set(prev)
      s.has(slug) ? s.delete(slug) : s.add(slug)
      return s
    })
  }

  const marcarTodas = () => {
    setMarcadas(m => m.size === disponibles.length ? new Set() : new Set(disponibles))
  }

  const anadirMarcadas = async () => {
    if (marcadas.size === 0 && !nombreLibre.trim()) return
    setGuardando(true)
    try {
      if (marcadas.size > 0) {
        await crearAsignaturasEnLote(Number(grupoId), comunidad, [...marcadas].map(slug => ({
          nombre: slug,
          nombre_display: humanizarSlug(slug),
        })))
      }
      if (nombreLibre.trim()) {
        await crearAsignatura({
          grupo_id: Number(grupoId),
          nombre: '__libre',
          nombre_display: nombreLibre.trim(),
          comunidad,
          pesos_trimestres: '{"1":33,"2":33,"3":34}',
        })
      }
      const n = marcadas.size + (nombreLibre.trim() ? 1 : 0)
      setAviso(`✅ ${n} área${n !== 1 ? 's añadidas' : ' añadida'}. Ahora monta su programación.`)
      setMarcadas(new Set())
      setNombreLibre('')
      setSelector(false)
      await cargar()
    } finally { setGuardando(false) }
  }

  // ── Instrumentos ─────────────────────────────────────────────────────

  const startEditInstr = (ins: Instrumento) => {
    setInstrEditId(ins.id)
    setInstrEditForm({ nombre: ins.nombre, tipo: ins.tipo, peso: ins.peso })
    setFormInstr(null)
  }

  const guardarInstrEdit = async () => {
    if (!instrEditId || !instrEditForm.nombre) return
    await actualizarInstrumento(instrEditId, instrEditForm)
    setInstrEditId(null)
    cargar()
  }

  const handleCrearInstrumento = async (asignaturaId: number) => {
    if (!instr.nombre) return
    setGuardando(true)
    await crearInstrumento(asignaturaId, {
      nombre: instr.nombre, tipo: instr.tipo, peso: instr.peso,
      trimestres: '[1,2,3]', orden: 0,
    })
    setFormInstr(null)
    setInstr({ nombre: '', tipo: 'prueba-escrita', peso: 100 })
    setGuardando(false)
    cargar()
  }

  const borrarInstrumento = async (instrId: number, nombre: string) => {
    if (!confirm(`¿Eliminar «${nombre}»?\n\nSe eliminarán también sus calificaciones y dejará de estar asignado a los criterios.`)) return
    await eliminarInstrumento(instrId)
    cargar()
  }

  const borrarAsignatura = async (a: Asignatura) => {
    if (!confirm(`¿Eliminar el área «${a.nombre_display}»?\n\nSe eliminarán su programación, sus instrumentos y todas sus calificaciones. No se puede deshacer.`)) return
    await eliminarAsignatura(a.id)
    if (expandida === a.id) setExpandida(null)
    cargar()
  }

  return (
    <>
    {rubricaOpen && (
      <RubricaEditor
        instrumentoId={rubricaOpen.instrumentoId}
        instrumentoNombre={rubricaOpen.instrumentoNombre}
        asignaturaNombre={rubricaOpen.asignaturaNombre}
        nivel={`${curso}º ${etapa}`}
        onCerrar={() => setRubricaOpen(null)}
      />
    )}
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Áreas y evaluación</h2>
          <div style={{ fontSize: 12.5, color: 'var(--gris-600)', marginTop: 2 }}>
            {asignaturas.length === 0
              ? 'Elige de una vez todas las áreas que impartes en esta clase.'
              : `${asignaturas.length} área${asignaturas.length !== 1 ? 's' : ''} · aparecen como pestañas en Evaluación`}
          </div>
        </div>
        {!selector && (
          <button className="btn-primary" style={{ fontSize: 13, padding: '7px 16px' }}
            onClick={() => { setSelector(true); setAviso('') }}>
            + Añadir áreas
          </button>
        )}
      </div>

      {aviso && (
        <div style={{ marginBottom: 14, padding: '9px 14px', borderRadius: 8, fontSize: 13, background: 'var(--verde-100)', color: 'var(--verde-500)', fontWeight: 500 }}>
          {aviso}
        </div>
      )}

      {/* ── Selector múltiple de áreas ──────────────────────────────── */}
      {selector && (
        <div style={{ background: 'var(--azul-100)', borderRadius: 10, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--azul-700)' }}>
              Áreas del currículo LOMLOE — {comunidad} · {curso}º {etapa}
            </div>
            {disponibles.length > 0 && (
              <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={marcarTodas}>
                {marcadas.size === disponibles.length ? 'Desmarcar todas' : `Marcar todas (${disponibles.length})`}
              </button>
            )}
          </div>

          {disponibles.length > 0 ? (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
              gap: 4, marginBottom: 14, maxHeight: 300, overflowY: 'auto',
            }}>
              {disponibles.map(slug => {
                const activa = marcadas.has(slug)
                return (
                  <label key={slug} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                    borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: activa ? 600 : 400,
                    background: activa ? 'white' : 'transparent',
                    border: `1px solid ${activa ? 'var(--azul-300)' : 'transparent'}`,
                    color: activa ? 'var(--azul-900)' : 'var(--gris-600)',
                  }}>
                    <input type="checkbox" checked={activa} onChange={() => alternar(slug)}
                      style={{ accentColor: 'var(--azul-700)', width: 16, height: 16, flexShrink: 0 }} />
                    {humanizarSlug(slug)}
                  </label>
                )
              })}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--gris-600)', marginBottom: 14 }}>
              Todas las áreas del currículo de {comunidad} ya están añadidas a esta clase.
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--azul-300)', paddingTop: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: 'var(--azul-700)' }}>
              ¿Un área que no está en el currículo? Añádela a mano
            </label>
            <input value={nombreLibre} onChange={e => setNombreLibre(e.target.value)}
              placeholder="Ej: Taller de ajedrez, Refuerzo de lectura…"
              style={{ width: '100%', maxWidth: 380, fontSize: 13 }} />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-primary" style={{ fontSize: 13 }}
              onClick={anadirMarcadas}
              disabled={guardando || (marcadas.size === 0 && !nombreLibre.trim())}>
              {guardando ? 'Añadiendo…'
                : marcadas.size > 0 ? `Añadir ${marcadas.size} área${marcadas.size !== 1 ? 's' : ''}`
                : 'Añadir área'}
            </button>
            <button className="btn-secondary" style={{ fontSize: 13 }}
              onClick={() => { setSelector(false); setMarcadas(new Set()); setNombreLibre('') }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {asignaturas.length === 0 && !selector && (
        <p style={{ color: 'var(--gris-600)', fontSize: 14 }}>
          Sin áreas todavía. Añade las que impartes para poder programar y evaluar.
        </p>
      )}

      {/* ── Lista de áreas ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {asignaturas.map(a => {
          const nInstr = a.instrumentos?.length || 0
          return (
          <div key={a.id} style={{ border: '1px solid var(--gris-200, #e5e7eb)', borderRadius: 8 }}>
            <div
              onClick={() => setExpandida(expandida === a.id ? null : a.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 14px', cursor: 'pointer', userSelect: 'none', gap: 10,
                background: expandida === a.id ? 'var(--azul-100)' : 'transparent',
                borderRadius: expandida === a.id ? '8px 8px 0 0' : 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{a.nombre_display}</span>
                <span style={{ marginLeft: 10, fontSize: 12, color: nInstr ? 'var(--gris-600)' : 'var(--ambar-500)' }}>
                  {nInstr} instrumento{nInstr !== 1 ? 's' : ''}
                  {nInstr === 0 && ' — crea alguno para poder evaluar'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button onClick={e => { e.stopPropagation(); borrarAsignatura(a) }}
                  title="Eliminar área"
                  style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>
                  ×
                </button>
                <span style={{ color: 'var(--gris-600)', fontSize: 14 }}>{expandida === a.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expandida === a.id && (
              <div style={{ borderTop: '1px solid var(--gris-300)' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--gris-300)', background: 'var(--gris-100)' }}>
                  {(['programacion', 'instrumentos'] as const).map(tab => (
                    <button key={tab} onClick={() => setTab(a.id, tab)}
                      style={{
                        padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        borderBottom: getTab(a.id) === tab ? '2px solid var(--azul-700)' : '2px solid transparent',
                        background: 'transparent',
                        color: getTab(a.id) === tab ? 'var(--azul-700)' : 'var(--gris-600)',
                      }}>
                      {tab === 'instrumentos' ? '🎯 Instrumentos' : '📋 Programación'}
                    </button>
                  ))}
                </div>

                <div style={{ padding: '12px 14px' }}>
                  {getTab(a.id) === 'instrumentos' && (
                    <>
                      {a.instrumentos && a.instrumentos.length > 0 ? (
                        <div style={{ marginBottom: 12 }}>
                          {(() => {
                            const total = a.instrumentos!.reduce((s, i) => s + (i.peso || 0), 0)
                            const ok = total === 100
                            const over = total > 100
                            const barColor = ok ? '#166534' : over ? '#dc2626' : '#b45309'
                            const barBg = ok ? '#dcfce7' : over ? '#fee2e2' : '#fef3c7'
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '6px 10px', background: barBg, borderRadius: 6 }}>
                                <div style={{ flex: 1, height: 5, background: '#e5e7eb', borderRadius: 3 }}>
                                  <div style={{ width: `${Math.min(total, 100)}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width .3s' }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: barColor, whiteSpace: 'nowrap' }}>
                                  {ok ? '✓ 100%' : over ? `${total}% ↑ excede` : `${total}% — falta ${100 - total}%`}
                                </span>
                              </div>
                            )
                          })()}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {a.instrumentos.map(ins => {
                            const cfg = getInstrConfig(ins.tipo)
                            if (instrEditId === ins.id) {
                              return (
                                <div key={ins.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  background: 'var(--azul-100)', borderRadius: 8, padding: '8px 12px',
                                  border: '1px solid var(--azul-300)',
                                }}>
                                  <span style={{ fontSize: 18 }}>{getInstrConfig(instrEditForm.tipo).icon}</span>
                                  <input value={instrEditForm.nombre} autoFocus
                                    onChange={e => setInstrEditForm(f => ({ ...f, nombre: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') guardarInstrEdit(); if (e.key === 'Escape') setInstrEditId(null) }}
                                    style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: '4px 8px' }}
                                  />
                                  <select value={instrEditForm.tipo}
                                    onChange={e => setInstrEditForm(f => ({ ...f, tipo: e.target.value }))}
                                    style={{ fontSize: 12, padding: '4px 6px' }}>
                                    {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                                  </select>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <input type="number" min={1} max={100} value={instrEditForm.peso}
                                      onChange={e => setInstrEditForm(f => ({ ...f, peso: Number(e.target.value) }))}
                                      style={{ width: 54, fontSize: 13, fontWeight: 700, textAlign: 'center', padding: '4px 2px' }}
                                    />
                                    <span style={{ fontSize: 12, color: 'var(--gris-600)' }}>%</span>
                                  </div>
                                  <button onClick={guardarInstrEdit}
                                    style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--azul-700)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✓</button>
                                  <button onClick={() => setInstrEditId(null)}
                                    style={{ padding: '4px 8px', borderRadius: 6, background: 'transparent', border: '1px solid var(--gris-300)', cursor: 'pointer', fontSize: 12 }}>✗</button>
                                </div>
                              )
                            }
                            return (
                              <div key={ins.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: cfg.bg, borderRadius: 8, padding: '7px 12px',
                                border: `1px solid ${cfg.color}25`, fontSize: 13,
                              }}>
                                <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                                <span style={{ fontWeight: 600, color: cfg.color, flex: 1 }}>{ins.nombre}</span>
                                <span style={{
                                  fontSize: 11, color: cfg.color, background: `${cfg.color}15`,
                                  padding: '2px 7px', borderRadius: 10, fontWeight: 500, whiteSpace: 'nowrap',
                                }}>
                                  {cfg.label}
                                </span>
                                <span style={{ color: 'var(--azul-700)', fontWeight: 700, fontSize: 13, minWidth: 36, textAlign: 'right' }}>
                                  {ins.peso}%
                                </span>
                                <button
                                  onClick={() => setRubricaOpen({ instrumentoId: ins.id, instrumentoNombre: ins.nombre, asignaturaNombre: a.nombre_display })}
                                  title="Editar la rúbrica de este instrumento"
                                  style={{
                                    fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                                    background: ins.tipo === 'rubrica' ? '#166534' : 'white',
                                    color: ins.tipo === 'rubrica' ? 'white' : 'var(--gris-600)',
                                    border: ins.tipo === 'rubrica' ? 'none' : '1px solid var(--gris-300)',
                                    fontWeight: 600, whiteSpace: 'nowrap',
                                  }}>
                                  📊 Rúbrica
                                </button>
                                <button onClick={() => startEditInstr(ins)} title="Editar"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 2px', color: 'var(--gris-500)', lineHeight: 1 }}>✏</button>
                                <button onClick={() => borrarInstrumento(ins.id, ins.nombre)} title="Eliminar"
                                  style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>
                              </div>
                            )
                          })}
                          </div>
                        </div>
                      ) : (
                        <p style={{ color: 'var(--gris-600)', fontSize: 13, marginBottom: 12 }}>
                          Sin instrumentos. Crea al menos uno: es lo que después asignarás a cada criterio en la programación.
                        </p>
                      )}

                      {formInstr === a.id ? (
                        <div style={{ background: 'var(--gris-100)', borderRadius: 6, padding: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px', gap: 8, marginBottom: 8 }}>
                            <input value={instr.nombre} autoFocus
                              onChange={e => setInstr(i => ({ ...i, nombre: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleCrearInstrumento(a.id) }}
                              placeholder="Nombre del instrumento *" style={{ width: '100%' }} />
                            <select value={instr.tipo} onChange={e => setInstr(i => ({ ...i, tipo: e.target.value }))} style={{ width: '100%' }}>
                              {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            <div style={{ position: 'relative' }}>
                              <input type="number" min={1} max={100} value={instr.peso}
                                onChange={e => setInstr(i => ({ ...i, peso: Number(e.target.value) }))}
                                style={{ width: '100%', paddingRight: 20 }} title="Peso del instrumento (%)" />
                              <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--gris-600)', pointerEvents: 'none' }}>%</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}
                              onClick={() => handleCrearInstrumento(a.id)} disabled={guardando || !instr.nombre}>
                              {guardando ? 'Guardando…' : 'Añadir'}
                            </button>
                            <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setFormInstr(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}
                          onClick={() => {
                            const usado = (a.instrumentos || []).reduce((s, i) => s + (i.peso || 0), 0)
                            setFormInstr(a.id)
                            setInstr({ nombre: '', tipo: 'prueba-escrita', peso: Math.max(1, 100 - usado) })
                          }}>
                          + Instrumento de evaluación
                        </button>
                      )}
                    </>
                  )}

                  {getTab(a.id) === 'programacion' && (
                    <ProgramacionPanel
                      asignaturaId={a.id}
                      asignaturaNombre={a.nombre}
                      grupoEtapa={etapa}
                      grupoCurso={curso}
                      grupoComunidad={comunidad}
                      grupoId={Number(grupoId)}
                      instrumentos={a.instrumentos || []}
                      onIrAInstrumentos={() => setTab(a.id, 'instrumentos')}
                      onCambio={cargar}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )})}
      </div>
    </div>
    </>
  )
}
