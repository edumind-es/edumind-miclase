import { useMemo, useRef, useState } from 'react'
import { api } from '@/api'
import { useAppStore } from '@/store/useAppStore'
import { parsearProens, type ProgramacionProens } from '@/programacion/proens'
import { aplicarProgramacionImportada, type ResultadoImportacion } from '@/db/queries'
import { TIPOS_INSTRUMENTO, getInstrConfig } from '@/ia/instrumentosConfig'

/**
 * Importar la programación didáctica oficial (PROENS) en un área.
 *
 * Tres pasos: elegir el PDF, revisar lo leído y aplicar. La revisión no es
 * adorno: el PDF se lee por posiciones de columna y el instrumento de cada
 * criterio se deduce de una celda combinada, así que aquí se puede corregir
 * cualquier cosa antes de que toque la base de datos. Lo que el currículo
 * cargado no conozca (un código de criterio que no existe en esa área y
 * curso) se enseña y se deja fuera: importarlo daría casillas huérfanas en
 * el calificador.
 */

interface Props {
  asignaturaId: number
  asignaturaNombre: string
  grupoCurso: string
  grupoEtapa: string
  criteriosCurr: { id: string; descripcion: string }[]
  onHecho: () => void
  onCerrar: () => void
}

const TRIM = [
  { n: 1, label: '1er trim.' }, { n: 2, label: '2º trim.' }, { n: 3, label: '3er trim.' },
]

/** Contenido de un fichero en base64 (sin el prefijo data:). */
async function aBase64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer())
  let binario = ''
  // Por trozos: String.fromCharCode con cientos de miles de argumentos revienta la pila
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binario)
}

const clave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** ¿«ciencias-sociales» y «Ciencias Sociais» son la misma área? Prefijo común ≥ 70 %. */
export function mismaArea(a: string, b: string): boolean {
  const x = clave(a), y = clave(b)
  if (!x || !y) return true
  if (x.includes(y) || y.includes(x)) return true
  let n = 0
  while (n < x.length && n < y.length && x[n] === y[n]) n++
  return n / Math.max(x.length, y.length) >= 0.7
}

export default function ImportarProens({
  asignaturaId, asignaturaNombre, grupoCurso, grupoEtapa, criteriosCurr, onHecho, onCerrar,
}: Props) {
  const headers = useAppStore(s => s._headers)
  const fileRef = useRef<HTMLInputElement>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState('')
  const [prog, setProg] = useState<ProgramacionProens | null>(null)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)

  const conocidos = useMemo(() => new Set(criteriosCurr.map(c => c.id)), [criteriosCurr])

  // ── Paso 1: leer el fichero ────────────────────────────────────────────

  const leerFichero = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setLeyendo(true); setError(''); setProg(null)
    try {
      let texto: string
      if (/\.txt$/i.test(f.name)) {
        texto = await f.text()
      } else {
        // El PDF va en base64 dentro de un JSON. Mandar el File tal cual
        // como cuerpo fallaba en Safari y en el iPad con «Load failed» antes
        // de salir del dispositivo; un JSON es el mismo camino que usa el
        // resto del API y funciona en la web y en la app nativa.
        const pdf = await aBase64(f)
        let r: Response
        try {
          r = await fetch(api('/api/programacion/texto'), {
            method: 'POST',
            headers: { ...headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdf }),
          })
        } catch {
          throw new Error('No se ha podido enviar el PDF al servidor. Comprueba la conexión y vuelve a intentarlo.')
        }
        const datos = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(datos.error || `El servidor ha respondido ${r.status}`)
        texto = datos.texto
      }
      const p = parsearProens(texto)
      if (p.unidades.length === 0) {
        throw new Error(p.avisos[0] || 'No se ha encontrado ninguna unidad en el documento.')
      }
      setProg(p)
    } catch (err: any) {
      setError(err?.message || 'No se ha podido leer el fichero.')
    }
    setLeyendo(false)
  }

  // ── Edición de lo leído ────────────────────────────────────────────────

  const editarUnidad = (i: number, cambios: Partial<ProgramacionProens['unidades'][number]>) =>
    setProg(p => p && { ...p, unidades: p.unidades.map((u, k) => k === i ? { ...u, ...cambios } : u) })

  const editarCriterio = (i: number, j: number, instrumento: string | null) =>
    setProg(p => p && {
      ...p,
      unidades: p.unidades.map((u, k) => k !== i ? u : {
        ...u, criterios: u.criterios.map((c, m) => m === j ? { ...c, instrumento } : c),
      }),
    })

  const editarInstrumento = (i: number, cambios: Partial<ProgramacionProens['instrumentos'][number]>) =>
    setProg(p => p && { ...p, instrumentos: p.instrumentos.map((x, k) => k === i ? { ...x, ...cambios } : x) })

  // ── Comprobaciones ─────────────────────────────────────────────────────

  const desconocidos = useMemo(() => {
    if (!prog) return []
    const set = new Set<string>()
    for (const u of prog.unidades) for (const c of u.criterios) if (!conocidos.has(c.codigoCurriculo)) set.add(c.codigo)
    return [...set].sort()
  }, [prog, conocidos])

  const cursoPdf = prog?.curso ?? null
  const cursoGrupo = grupoCurso.replace(/[ºª]/g, '')
  const cursoDistinto = cursoPdf != null && cursoPdf !== cursoGrupo
  // El área llega como slug del currículo («ciencias-sociales») y el PDF la
  // trae en gallego («Ciencias Sociais»): se comparan por prefijo común, que
  // absorbe la terminación distinta sin dar por buena otra área.
  const areaDudosa = !!prog?.area && !mismaArea(asignaturaNombre, prog.area)
  const areaLegible = asignaturaNombre.replace(/-/g, ' ')
  const etapaDistinta = !!prog?.etapa && prog.etapa !== grupoEtapa

  const totalCriterios = prog?.unidades.reduce((s, u) => s + u.criterios.length, 0) ?? 0
  const importables = prog?.unidades.reduce((s, u) => s + u.criterios.filter(c => conocidos.has(c.codigoCurriculo)).length, 0) ?? 0
  const sinInstrumento = prog?.unidades.reduce((s, u) => s + u.criterios.filter(c => !c.instrumento && conocidos.has(c.codigoCurriculo)).length, 0) ?? 0
  const sumaPesos = prog?.instrumentos.reduce((s, i) => s + (i.peso ?? 0), 0) ?? 0

  // ── Paso 3: aplicar ────────────────────────────────────────────────────

  const aplicar = async () => {
    if (!prog) return
    setAplicando(true); setError('')
    try {
      const r = await aplicarProgramacionImportada(asignaturaId, {
        instrumentos: prog.instrumentos,
        unidades: prog.unidades.map(u => ({
          numero: u.numero, titulo: u.titulo, descripcion: u.descripcion,
          peso: u.peso, sesiones: u.sesiones, trimestre: u.trimestre, contenidos: u.contenidos,
          criterios: u.criterios
            .filter(c => conocidos.has(c.codigoCurriculo))
            .map(c => ({ codigoCurriculo: c.codigoCurriculo, minimo: c.minimo, instrumento: c.instrumento })),
        })),
      })
      setResultado(r)
      onHecho()
    } catch (err: any) {
      setError(err?.message || 'No se ha podido importar.')
    }
    setAplicando(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const aviso = (texto: React.ReactNode, tono: 'ambar' | 'rojo' = 'ambar') => (
    <div style={{
      fontSize: 12.5, padding: '8px 12px', borderRadius: 7, marginBottom: 8, lineHeight: 1.5,
      background: tono === 'rojo' ? '#fee2e2' : '#fffbeb',
      border: `1px solid ${tono === 'rojo' ? '#fca5a5' : '#fde68a'}`,
      color: tono === 'rojo' ? '#991b1b' : '#92400e',
    }}>{texto}</div>
  )

  return (
    <div style={{ background: 'linear-gradient(135deg,#eef2ff,#f0fdf4)', border: '1px solid #a5b4fc', borderRadius: 10, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--azul-700)', flex: 1 }}>📄 Importar la programación de PROENS</div>
        <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onCerrar}>Cerrar</button>
      </div>

      {resultado ? (
        <div style={{ fontSize: 13, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 7, padding: '10px 14px', lineHeight: 1.6 }}>
          <strong>Programación importada.</strong>{' '}
          {resultado.unidadesCreadas} unidades nuevas{resultado.unidadesActualizadas ? ` y ${resultado.unidadesActualizadas} actualizadas` : ''} ·{' '}
          {resultado.instrumentosCreados} instrumentos nuevos{resultado.instrumentosReutilizados ? ` y ${resultado.instrumentosReutilizados} reutilizados` : ''} ·{' '}
          {resultado.criteriosVinculados} criterios con su mínimo
          {resultado.criteriosSinInstrumento > 0 && `, ${resultado.criteriosSinInstrumento} sin instrumento (saldrán rayados en el calificador)`}.
        </div>
      ) : !prog ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--gris-600)', lineHeight: 1.55, marginBottom: 12 }}>
            Sube el PDF que descarga PROENS (Xunta de Galicia). Se crearán las unidades con su trimestre,
            sesiones y peso, cada criterio con su <strong>mínimo de consecución</strong> y el instrumento
            con el que se evalúa, y los instrumentos con su peso. Antes de guardar nada verás lo leído y
            podrás corregirlo. <strong>No borra</strong> lo que ya tengas: una unidad con el mismo título se
            actualiza y las calificaciones no se tocan.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-primary" style={{ fontSize: 13 }} disabled={leyendo} onClick={() => fileRef.current?.click()}>
              {leyendo ? 'Leyendo…' : '📄 Elegir PDF de PROENS'}
            </button>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf,.txt" style={{ display: 'none' }} onChange={leerFichero} />
            <span style={{ fontSize: 11.5, color: 'var(--gris-500)' }}>El PDF se convierte a texto en el servidor y no se guarda.</span>
          </div>
          {error && <div style={{ marginTop: 10 }}>{aviso(error, 'rojo')}</div>}
        </>
      ) : (
        <>
          {/* Cabecera del documento */}
          <div style={{ fontSize: 12.5, color: 'var(--gris-600)', marginBottom: 10 }}>
            <strong style={{ color: 'var(--gris-800)' }}>{prog.area ?? 'Área sin identificar'}</strong>
            {prog.curso && <> · {prog.curso}º {prog.etapa}</>}
            {prog.centro && <> · {prog.centro}</>}
            {prog.cursoEscolar && <> · {prog.cursoEscolar}</>}
            {' · '}{prog.unidades.length} unidades · {totalCriterios} criterios
          </div>

          {(cursoDistinto || etapaDistinta) && aviso(<>
            El PDF es de <strong>{prog.curso}º de {prog.etapa}</strong> y esta clase es de <strong>{cursoGrupo}º de {grupoEtapa}</strong>.
            Los criterios se cotejan con el currículo de la clase, no con el del PDF.
          </>)}
          {areaDudosa && aviso(<>
            El PDF dice <strong>«{prog.area}»</strong> y esta área es <strong>«{areaLegible}»</strong>. Comprueba que es el documento correcto.
          </>)}
          {desconocidos.length > 0 && aviso(<>
            <strong>{desconocidos.length} código{desconocidos.length !== 1 ? 's' : ''} que el currículo cargado no conoce</strong> y se
            dejan fuera: {desconocidos.join(', ')}. Si el PDF es de otra área o curso, importarlos daría casillas huérfanas.
          </>)}
          {prog.avisos.map((a, i) => <div key={i}>{aviso(a)}</div>)}
          {sumaPesos > 0 && Math.round(sumaPesos) !== 100 && aviso(<>
            Los pesos de los instrumentos suman <strong>{sumaPesos}</strong>, no 100. Se importan tal cual: el cálculo pondera con lo que haya.
          </>)}

          {/* Instrumentos */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gris-700)', margin: '10px 0 6px' }}>Instrumentos de evaluación</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {prog.instrumentos.map((ins, i) => (
              <div key={ins.abrev} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 170px 70px', gap: 6, alignItems: 'center', background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--azul-700)' }}>{ins.abrev}</span>
                <input value={ins.nombre} onChange={e => editarInstrumento(i, { nombre: e.target.value })} style={{ fontSize: 12 }} />
                <select value={ins.tipo} onChange={e => editarInstrumento(i, { tipo: e.target.value })} style={{ fontSize: 12 }}>
                  {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <input type="number" min={0} max={100} value={ins.peso ?? ''} placeholder="peso"
                    onChange={e => editarInstrumento(i, { peso: e.target.value === '' ? null : Number(e.target.value) })}
                    style={{ fontSize: 12, width: 52 }} />
                  <span style={{ fontSize: 11, color: 'var(--gris-500)' }}>%</span>
                </div>
              </div>
            ))}
            {prog.instrumentos.length === 0 && (
              <div style={{ fontSize: 12, color: '#92400e' }}>El documento no declara instrumentos: los criterios se importarán sin ninguno.</div>
            )}
          </div>

          {/* Unidades */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gris-700)', margin: '6px 0' }}>Unidades</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {prog.unidades.map((u, i) => {
              const abiertaEsta = abierta === i
              const fuera = u.criterios.filter(c => !conocidos.has(c.codigoCurriculo)).length
              return (
                <div key={u.numero} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 96px 62px 62px auto', gap: 6, alignItems: 'center', padding: '5px 8px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-500)' }}>UD {u.numero}</span>
                    <input value={u.titulo} onChange={e => editarUnidad(i, { titulo: e.target.value })} style={{ fontSize: 12.5, fontWeight: 600 }} />
                    <select value={u.trimestre ?? ''} onChange={e => editarUnidad(i, { trimestre: e.target.value ? Number(e.target.value) as 1 | 2 | 3 : null })}
                      style={{ fontSize: 12, borderColor: u.trimestre ? undefined : '#f59e0b' }}>
                      <option value="">Sin trim.</option>
                      {TRIM.map(t => <option key={t.n} value={t.n}>{t.label}</option>)}
                    </select>
                    <span style={{ fontSize: 11, color: 'var(--gris-500)', whiteSpace: 'nowrap' }} title="Sesiones previstas">{u.sesiones ?? '?'} ses.</span>
                    <span style={{ fontSize: 11, color: 'var(--gris-500)', whiteSpace: 'nowrap' }} title="Peso de la unidad en el área">{u.peso ?? '?'} %</span>
                    <button onClick={() => setAbierta(abiertaEsta ? null : i)}
                      style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 12, cursor: 'pointer', fontWeight: 600, background: abiertaEsta ? 'var(--azul-700)' : 'white', color: abiertaEsta ? 'white' : 'var(--azul-700)', border: '1px solid #c7d2fe', whiteSpace: 'nowrap' }}>
                      {abiertaEsta ? '▼' : '▶'} {u.criterios.length} criterios
                      {fuera > 0 && <span style={{ marginLeft: 5, color: abiertaEsta ? '#fed7aa' : '#b45309' }}>· {fuera} fuera</span>}
                    </button>
                  </div>
                  {abiertaEsta && (
                    <div style={{ borderTop: '1px solid #e5e7eb', background: '#fbfcfe', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {u.criterios.map((c, j) => {
                        const conocido = conocidos.has(c.codigoCurriculo)
                        return (
                          <div key={c.codigo} style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 8, alignItems: 'start', padding: '5px 8px', borderRadius: 5, background: conocido ? 'white' : '#fef2f2', border: `1px solid ${conocido ? '#e5e7eb' : '#fca5a5'}` }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                                <span style={{ fontWeight: 700, color: conocido ? 'var(--azul-700)' : '#991b1b', marginRight: 6 }}>{c.codigo} → {c.codigoCurriculo}</span>
                                <span style={{ color: 'var(--gris-600)' }}>{c.descripcion}</span>
                              </div>
                              {c.minimo && (
                                <div style={{ fontSize: 11, color: '#166534', marginTop: 3, lineHeight: 1.4 }}>
                                  <strong>Mínimo:</strong> {c.minimo}
                                </div>
                              )}
                              {!conocido && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 3 }}>No existe en el currículo de esta clase: no se importa.</div>}
                            </div>
                            <select value={c.instrumento ?? ''} disabled={!conocido}
                              onChange={e => editarCriterio(i, j, e.target.value || null)}
                              style={{ fontSize: 11.5, borderColor: c.instrumento ? undefined : '#f59e0b' }}>
                              <option value="">— sin instrumento —</option>
                              {prog.instrumentos.map(ins => (
                                <option key={ins.abrev} value={ins.abrev}>{getInstrConfig(ins.tipo).icon} {ins.nombre}{c.porcentaje != null && c.instrumento === ins.abrev ? ` (${c.porcentaje}%)` : ''}</option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                      {u.contenidos.length > 0 && (
                        <details style={{ fontSize: 11.5, color: 'var(--gris-600)', marginTop: 4 }}>
                          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{u.contenidos.length} contidos</summary>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.45 }}>
                            {u.contenidos.map((ct, k) => <li key={k}>{ct}</li>)}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {error && aviso(error, 'rojo')}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={aplicar} disabled={aplicando || importables === 0}>
              {aplicando ? 'Importando…' : `✓ Importar ${prog.unidades.length} unidades y ${importables} criterios`}
            </button>
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => { setProg(null); setError('') }}>Elegir otro fichero</button>
            {sinInstrumento > 0 && (
              <span style={{ fontSize: 11.5, color: '#92400e' }}>{sinInstrumento} criterio{sinInstrumento !== 1 ? 's' : ''} sin instrumento: saldrán rayados hasta que elijas uno.</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
