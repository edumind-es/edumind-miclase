import { useEffect, useState } from 'react'
import ProgramacionPanel from './ProgramacionPanel'
import RubricaEditor from './RubricaEditor'
import {
  getAsignaturas, getAsignaturaDetalle, crearAsignatura,
  crearInstrumento, eliminarInstrumento, actualizarInstrumento,
} from '@/db/queries'
import { useAppStore } from '@/store/useAppStore'
import { TIPOS_INSTRUMENTO, getInstrConfig } from '@/ia/instrumentosConfig'

// Mapa de slugs curriculares → nombres legibles (internamente, TIPOS_INSTRUMENTO viene de instrumentosConfig)
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
}

interface RubricaOpen {
  instrumentoId: number
  instrumentoNombre: string
  asignaturaNombre: string
}

function humanizarSlug(slug: string): string {
  // Primero mirar en el mapa de nombres canónicos
  if (NOMBRES[slug]) return NOMBRES[slug]
  // Fallback: capitalizar y separar guiones
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function AsignaturasPanel({ grupoId, etapa, curso, comunidad }: Props) {
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([])
  const [disponibles, setDisponibles] = useState<string[]>([])
  const [expandida, setExpandida] = useState<number | null>(null)
  const [tabActiva, setTabActiva] = useState<Record<number, 'instrumentos' | 'programacion'>>({})
  const [formNueva, setFormNueva] = useState(false)
  const [nueva, setNueva] = useState({ nombre: '', nombre_display: '' })
  const [formInstr, setFormInstr] = useState<number | null>(null)
  const [instr, setInstr] = useState({ nombre: '', tipo: 'prueba-escrita', peso: 100 })
  const [guardando, setGuardando] = useState(false)
  const [rubricaOpen, setRubricaOpen] = useState<RubricaOpen | null>(null)

  // edición inline de instrumento existente
  const [instrEditId, setInstrEditId] = useState<number | null>(null)
  const [instrEditForm, setInstrEditForm] = useState({ nombre: '', tipo: '', peso: 0 })

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

  const getTab = (id: number) => tabActiva[id] || 'instrumentos'
  const setTab = (id: number, tab: 'instrumentos' | 'programacion') =>
    setTabActiva(t => ({ ...t, [id]: tab }))

  const headers = useAppStore(s => s._headers)

  const cargar = async () => {
    const [asigs, currList] = await Promise.all([
      getAsignaturas(Number(grupoId)),
      fetch(`/api/curriculum/asignaturas?etapa=${etapa}&comunidad=${encodeURIComponent(comunidad)}`,
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
  }

  useEffect(() => { cargar() }, [grupoId])

  const handleCrearAsignatura = async () => {
    if (!nueva.nombre) return
    setGuardando(true)
    await crearAsignatura({
      grupo_id: Number(grupoId),
      nombre: nueva.nombre,
      nombre_display: nueva.nombre_display || NOMBRES[nueva.nombre] || nueva.nombre,
      comunidad,
      pesos_trimestres: '{"1":33,"2":33,"3":34}',
    })
    setFormNueva(false)
    setNueva({ nombre: '', nombre_display: '' })
    setGuardando(false)
    cargar()
  }

  const handleCrearInstrumento = async (asignaturaId: number) => {
    if (!instr.nombre) return
    setGuardando(true)
    await crearInstrumento(asignaturaId, {
      nombre: instr.nombre,
      tipo: instr.tipo,
      peso: instr.peso,
      trimestres: '[1,2,3]',
      orden: 0,
    })
    setFormInstr(null)
    setInstr({ nombre: '', tipo: 'prueba-escrita', peso: 100 })
    setGuardando(false)
    cargar()
  }

  const borrarInstrumento = async (_asignaturaId: number, instrId: number) => {
    await eliminarInstrumento(instrId)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Asignaturas y evaluación</h2>
        {!formNueva && (
          <button
            className="btn-primary"
            style={{ fontSize: 13, padding: '6px 14px' }}
            onClick={() => setFormNueva(true)}
          >
            + Añadir asignatura
          </button>
        )}
      </div>

      {/* Formulario nueva asignatura */}
      {formNueva && (
        <div style={{ background: 'var(--azul-100)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--azul-700)' }}>
            Nueva asignatura
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                Currículum LOMLOE
              </label>
              {disponibles.length > 0 ? (
                <select
                  value={nueva.nombre}
                  onChange={e => setNueva({
                    nombre: e.target.value,
                    nombre_display: NOMBRES[e.target.value] || e.target.value,
                  })}
                  style={{ width: '100%' }}
                >
                  <option value="">— Seleccionar —</option>
                  {disponibles.map(s => (
                    <option key={s} value={s}>{humanizarSlug(s)}</option>
                  ))}
                  <option value="__libre">Asignatura libre (sin currículum)</option>
                </select>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--gris-600)', padding: '8px 0' }}>
                  Todas las asignaturas del currículum ya están añadidas.
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                Nombre a mostrar
              </label>
              <input
                value={nueva.nombre_display}
                onChange={e => setNueva(n => ({ ...n, nombre_display: e.target.value }))}
                placeholder="Nombre en el calificador"
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-primary"
              style={{ fontSize: 13 }}
              onClick={handleCrearAsignatura}
              disabled={guardando || (!nueva.nombre && !nueva.nombre_display)}
            >
              {guardando ? 'Guardando…' : 'Crear asignatura'}
            </button>
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => { setFormNueva(false); setNueva({ nombre: '', nombre_display: '' }) }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de asignaturas */}
      {asignaturas.length === 0 && !formNueva && (
        <p style={{ color: 'var(--gris-600)', fontSize: 14 }}>
          Sin asignaturas. Añade una para poder usar el calificador.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {asignaturas.map(a => (
          <div key={a.id} style={{ border: '1px solid var(--gris-200)', borderRadius: 8 }}>
            {/* Cabecera asignatura */}
            <div
              onClick={() => setExpandida(expandida === a.id ? null : a.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', cursor: 'pointer', userSelect: 'none',
                background: expandida === a.id ? 'var(--azul-100)' : 'transparent',
                borderRadius: expandida === a.id ? '8px 8px 0 0' : 8,
              }}
            >
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{a.nombre_display}</span>
                <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--gris-600)' }}>
                  {a.instrumentos?.length || 0} instrumento{a.instrumentos?.length !== 1 ? 's' : ''}
                </span>
              </div>
              <span style={{ color: 'var(--gris-600)', fontSize: 14 }}>
                {expandida === a.id ? '▲' : '▼'}
              </span>
            </div>

            {/* Detalle expandido con pestañas */}
            {expandida === a.id && (
              <div style={{ borderTop: '1px solid var(--gris-200)' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--gris-200)', background: 'var(--gris-100)' }}>
                  {(['instrumentos', 'programacion'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setTab(a.id, tab)}
                      style={{
                        padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        borderBottom: getTab(a.id) === tab ? '2px solid var(--azul-700)' : '2px solid transparent',
                        background: 'transparent',
                        color: getTab(a.id) === tab ? 'var(--azul-700)' : 'var(--gris-600)',
                        transition: 'color .15s',
                      }}
                    >
                      {tab === 'instrumentos' ? '🎯 Instrumentos' : '📋 Programación'}
                    </button>
                  ))}
                </div>

                <div style={{ padding: '12px 14px' }}>
                  {getTab(a.id) === 'instrumentos' && (
                    <>
                      {a.instrumentos && a.instrumentos.length > 0 ? (
                        <div style={{ marginBottom: 12 }}>
                          {/* Barra de peso total */}
                          {(() => {
                            const total = a.instrumentos.reduce((s, i) => s + (i.peso || 0), 0)
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
                                  {ok ? '✓ 100%' : over ? `${total}% ↑excede` : `${total}% — falta ${100 - total}%`}
                                </span>
                              </div>
                            )
                          })()}
                          {/* Filas de instrumentos */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {a.instrumentos.map(ins => {
                            const cfg = getInstrConfig(ins.tipo)
                            const isEditing = instrEditId === ins.id
                            if (isEditing) {
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
                                    style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--azul-700)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                    ✓
                                  </button>
                                  <button onClick={() => setInstrEditId(null)}
                                    style={{ padding: '4px 8px', borderRadius: 6, background: 'transparent', border: '1px solid var(--gris-400)', cursor: 'pointer', fontSize: 12 }}>
                                    ✗
                                  </button>
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
                                {ins.tipo === 'rubrica' && (
                                  <button
                                    onClick={() => setRubricaOpen({ instrumentoId: ins.id, instrumentoNombre: ins.nombre, asignaturaNombre: a.nombre_display })}
                                    style={{
                                      fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                                      background: '#166534', color: 'white', border: 'none', fontWeight: 600, whiteSpace: 'nowrap',
                                    }}>
                                    📊 Rúbrica
                                  </button>
                                )}
                                <button onClick={() => startEditInstr(ins)}
                                  title="Editar"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 2px', color: 'var(--gris-500)', lineHeight: 1 }}>
                                  ✏
                                </button>
                                <button onClick={() => borrarInstrumento(a.id, ins.id)}
                                  title="Eliminar"
                                  style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1 }}>
                                  ×
                                </button>
                              </div>
                            )
                          })}
                          </div>
                        </div>
                      ) : (
                        <p style={{ color: 'var(--gris-600)', fontSize: 13, marginBottom: 12 }}>
                          Sin instrumentos. Añade al menos uno para poder registrar calificaciones.
                        </p>
                      )}

                      {formInstr === a.id ? (
                        <div style={{ background: 'var(--gris-100)', borderRadius: 6, padding: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px', gap: 8, marginBottom: 8 }}>
                            <input
                              value={instr.nombre}
                              onChange={e => setInstr(i => ({ ...i, nombre: e.target.value }))}
                              placeholder="Nombre del instrumento *"
                              style={{ width: '100%' }}
                              autoFocus
                            />
                            <select
                              value={instr.tipo}
                              onChange={e => setInstr(i => ({ ...i, tipo: e.target.value }))}
                              style={{ width: '100%' }}
                            >
                              {TIPOS_INSTRUMENTO.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                            <div style={{ position: 'relative' }}>
                              <input
                                type="number" min={1} max={100}
                                value={instr.peso}
                                onChange={e => setInstr(i => ({ ...i, peso: Number(e.target.value) }))}
                                style={{ width: '100%', paddingRight: 20 }}
                                title="Peso del instrumento (%)"
                              />
                              <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--gris-600)', pointerEvents: 'none' }}>%</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}
                              onClick={() => handleCrearInstrumento(a.id)} disabled={guardando || !instr.nombre}>
                              {guardando ? 'Guardando…' : 'Añadir'}
                            </button>
                            <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}
                              onClick={() => setFormInstr(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}
                          onClick={() => { setFormInstr(a.id); setInstr({ nombre: '', tipo: 'prueba-escrita', peso: 100 }) }}>
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
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    </>
  )
}
