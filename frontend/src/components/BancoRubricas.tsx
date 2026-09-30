/**
 * «Mi banco de rúbricas» — todas las rúbricas del docente, para reutilizarlas.
 *
 * Hasta ahora una rúbrica vivía encerrada en su instrumento: para usarla en
 * otra clase había que exportarla a un fichero y volver a importarla. El banco
 * las enseña todas juntas —las que están en uso en cualquier clase y las
 * guardadas aparte— y elegir una la copia al instrumento que se está editando.
 *
 * Es una copia, no un vínculo: retocar la rúbrica en una clase no cambia la de
 * otra, que es lo que se espera al adaptarla a un grupo distinto.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getBancoRubricas, guardarEnBanco, eliminarDelBanco, type RubricaDeBanco,
} from '@/db/queries'
import { importarRubrica } from '@/ia/rubricaImportar'
import type { RubricaParsed } from '@/ia/rubricaPrompt'

interface Props {
  /** El instrumento que se está editando: su propia rúbrica no se le ofrece. */
  instrumentoId: number
  onElegir: (rubrica: RubricaParsed, origen: RubricaDeBanco) => void
  onCerrar: () => void
  /** Sube cuando el editor guarda algo en el banco, para releer la lista. */
  refresco?: number
}

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function BancoRubricas({ instrumentoId, onElegir, onCerrar, refresco = 0 }: Props) {
  const [rubricas, setRubricas] = useState<RubricaDeBanco[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const ficherosRef = useRef<HTMLInputElement>(null)

  const cargar = () => getBancoRubricas().then(setRubricas).catch(() => setRubricas([]))
  useEffect(() => { cargar() }, [refresco])

  const visibles = useMemo(() => {
    if (!rubricas) return []
    const q = plano(busqueda.trim())
    return rubricas
      // La rúbrica que este instrumento ya tiene no es una opción, salvo que
      // además esté en el banco o en otra clase.
      .filter(r => r.enBanco || r.instrumentoIds.some(id => id !== instrumentoId))
      .filter(r => !q || plano([r.titulo, r.area, r.nivel, ...r.usos].filter(Boolean).join(' ')).includes(q))
  }, [rubricas, busqueda, instrumentoId])

  const elegir = (r: RubricaDeBanco) => {
    try {
      onElegir({ titulo: r.titulo, niveles: JSON.parse(r.niveles_json), indicadores: JSON.parse(r.indicadores_json) }, r)
    } catch {
      setMsg({ tipo: 'error', texto: 'Esta rúbrica está dañada y no se puede cargar.' })
    }
  }

  const conservar = async (r: RubricaDeBanco) => {
    await guardarEnBanco({
      titulo: r.titulo, niveles_json: r.niveles_json, indicadores_json: r.indicadores_json,
      contexto: r.contexto, generada_ia: r.generada_ia, area: r.area, nivel: r.nivel,
    })
    setMsg({ tipo: 'ok', texto: `«${r.titulo}» queda guardada en el banco: seguirá aquí aunque borres la clase.` })
    cargar()
  }

  const quitar = async (r: RubricaDeBanco) => {
    if (r.bancoId == null) return
    const sigue = r.usos.length > 0
    if (!confirm(sigue
      ? `¿Quitar «${r.titulo}» del banco?\n\nLos instrumentos que la usan la conservan.`
      : `¿Quitar «${r.titulo}» del banco?\n\nNingún instrumento la usa: se perderá.`)) return
    await eliminarDelBanco(r.bancoId)
    setMsg({ tipo: 'ok', texto: `«${r.titulo}» quitada del banco.` })
    cargar()
  }

  /** Varios ficheros de una vez, directos al banco: es como se trae una colección ya hecha. */
  const importarAlBanco = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const ficheros = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!ficheros.length) return
    let nuevas = 0, repetidas = 0
    const errores: string[] = []
    for (const f of ficheros) {
      try {
        const { rubrica, contexto, area } = await importarRubrica(f.name, await f.arrayBuffer())
        const { yaEstaba } = await guardarEnBanco({
          titulo: rubrica.titulo,
          niveles_json: JSON.stringify(rubrica.niveles),
          indicadores_json: JSON.stringify(rubrica.indicadores),
          contexto, generada_ia: 0, area,
        })
        if (yaEstaba) repetidas++; else nuevas++
      } catch (err: any) {
        errores.push(`${f.name}: ${err.message || 'no se pudo leer'}`)
      }
    }
    const partes = [
      nuevas ? `${nuevas} rúbrica${nuevas !== 1 ? 's' : ''} añadida${nuevas !== 1 ? 's' : ''} al banco` : '',
      repetidas ? `${repetidas} ya estaba${repetidas !== 1 ? 'n' : ''}` : '',
    ].filter(Boolean)
    setMsg(errores.length
      ? { tipo: 'error', texto: `${partes.length ? partes.join(', ') + '. ' : ''}No se pudo leer: ${errores.join(' · ')}` }
      : { tipo: 'ok', texto: partes.join(', ') + '.' })
    cargar()
  }

  return (
    <div style={{ border: '1px solid var(--gris-300)', background: 'var(--gris-50)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <strong style={{ fontSize: 13.5, color: 'var(--azul-900)', flex: 1 }}>📚 Mi banco de rúbricas</strong>
        <button className="btn-secondary" style={{ fontSize: 11.5 }} onClick={() => ficherosRef.current?.click()}
          title="Añadir al banco una o varias rúbricas desde ficheros (.xlsx, .md, .json)">
          📥 Añadir ficheros al banco
        </button>
        <input ref={ficherosRef} type="file" multiple style={{ display: 'none' }} onChange={importarAlBanco}
          data-uso="banco" accept=".xlsx,.md,.markdown,.txt,.json" />
        <button onClick={onCerrar} aria-label="Cerrar el banco"
          style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--gris-600)', lineHeight: 1 }}>×</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--gris-600)', lineHeight: 1.5, margin: '0 0 10px' }}>
        Tus rúbricas de todas las clases. Al elegir una se <strong>copia</strong> a este instrumento: puedes adaptarla sin cambiar la original.
      </p>

      {msg && (
        <div style={{
          marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12.5,
          background: msg.tipo === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.tipo === 'ok' ? '#166534' : '#991b1b',
        }}>
          {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
        </div>
      )}

      {rubricas === null && <div style={{ fontSize: 12.5, color: 'var(--gris-600)' }}>Cargando…</div>}

      {rubricas !== null && rubricas.length > 3 && (
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por título, área o clase…" aria-label="Buscar en el banco"
          style={{ width: '100%', fontSize: 13, marginBottom: 10 }} />
      )}

      {rubricas !== null && visibles.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.55, padding: '6px 0' }}>
          {busqueda.trim()
            ? 'Ninguna rúbrica coincide con la búsqueda.'
            : 'Todavía no hay rúbricas en tu banco. Aparecerán aquí las que guardes en cualquier instrumento, y puedes añadir las que tengas en ficheros.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibles.map(r => {
          const desplegada = abierta === r.id
          return (
            <div key={r.id} data-rubrica-banco={r.titulo}
              style={{ background: 'white', border: '1px solid var(--gris-300)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--azul-900)' }}>{r.titulo}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--gris-600)', marginTop: 2 }}>
                    {r.nIndicadores} indicadores · {r.nNiveles} niveles
                    {(r.area || r.nivel) && ` · ${[r.area, r.nivel].filter(Boolean).join(', ')}`}
                    {r.generada_ia ? ' · generada con IA' : ''}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--gris-500)', marginTop: 2, lineHeight: 1.45 }}>
                    {r.enBanco && <span style={{ color: '#166534', fontWeight: 700 }}>⭐ En el banco</span>}
                    {r.enBanco && r.usos.length > 0 && ' · '}
                    {r.usos.length > 0 && <>En uso en: {r.usos.join(' — ')}</>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="btn-secondary" style={{ fontSize: 11.5 }} onClick={() => setAbierta(desplegada ? null : r.id)}
                    aria-expanded={desplegada}>
                    {desplegada ? 'Ocultar' : 'Ver'}
                  </button>
                  {r.enBanco ? (
                    <button className="btn-secondary" style={{ fontSize: 11.5 }} onClick={() => quitar(r)}
                      title="Quitar la copia del banco. Los instrumentos que la usan la conservan.">
                      Quitar del banco
                    </button>
                  ) : (
                    <button className="btn-secondary" style={{ fontSize: 11.5 }} onClick={() => conservar(r)}
                      title="Guardar una copia aparte, que no desaparece si borras el instrumento o la clase">
                      ⭐ Conservar
                    </button>
                  )}
                  <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => elegir(r)}>
                    Usar esta
                  </button>
                </div>
              </div>
              {desplegada && <VistaPrevia r={r} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Indicadores y escala, sin los descriptores: lo justo para reconocer la rúbrica. */
function VistaPrevia({ r }: { r: RubricaDeBanco }) {
  let niveles: { nombre: string; valor: number }[] = []
  let indicadores: { nombre: string; peso?: number }[] = []
  try { niveles = JSON.parse(r.niveles_json); indicadores = JSON.parse(r.indicadores_json) } catch { /* se enseña vacía */ }
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--gris-200)', fontSize: 12, color: 'var(--gris-700)', lineHeight: 1.55 }}>
      <div style={{ marginBottom: 4 }}>
        <strong>Escala:</strong> {niveles.map(n => `${n.nombre} (${n.valor})`).join(' · ')}
      </div>
      <ol style={{ margin: '0 0 0 18px', padding: 0 }}>
        {indicadores.map((ind, i) => (
          <li key={i}>{ind.nombre}{ind.peso != null ? ` — ${ind.peso}%` : ''}</li>
        ))}
      </ol>
      {r.contexto && <div style={{ marginTop: 4, color: 'var(--gris-600)' }}><strong>Contexto:</strong> {r.contexto}</div>}
    </div>
  )
}
