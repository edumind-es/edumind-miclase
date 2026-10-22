/**
 * «Mi banco de pruebas» — todos los exámenes del docente, para reutilizarlos.
 *
 * Un examen vivía encerrado en su instrumento y su unidad: para repetirlo en
 * otra clase había que exportarlo a un fichero y volver a importarlo. El
 * banco los enseña todos juntos —los que están en uso en cualquier clase y los
 * guardados aparte— y elegir uno lo copia al instrumento y la unidad desde los
 * que se abrió el editor.
 *
 * Es una copia, no un vínculo: retocar el examen en una clase no cambia el de
 * otra. Hermano de `BancoRubricas`, sobre el mismo mecanismo (`INSTRUMENTO_BANCO`).
 */
import { useEffect, useMemo, useState } from 'react'
import { getBancoPruebas, guardarPruebaEnBanco, eliminarPruebaDelBanco, type PruebaDeBanco } from '@/db/queries'
import { puntosTotales, TIPOS_PRUEBA, LETRAS } from '@/db/prueba'

interface Props {
  /** El instrumento que se está editando: su propio examen no se le ofrece. */
  instrumentoId: number
  onElegir: (prueba: PruebaDeBanco) => void
  onCerrar: () => void
  /** Sube cuando el editor guarda algo en el banco, para releer la lista. */
  refresco?: number
}

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function BancoPruebas({ instrumentoId, onElegir, onCerrar, refresco = 0 }: Props) {
  const [pruebas, setPruebas] = useState<PruebaDeBanco[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = () => getBancoPruebas().then(setPruebas).catch(() => setPruebas([]))
  useEffect(() => { cargar() }, [refresco])

  const visibles = useMemo(() => {
    if (!pruebas) return []
    const q = plano(busqueda.trim())
    return pruebas
      // El examen que este instrumento ya tiene no es una opción, salvo que
      // además esté en el banco o en otro instrumento.
      .filter(r => r.enBanco || r.instrumentoIds.some(id => id !== instrumentoId))
      .filter(r => !q || plano([r.def.titulo, r.area, r.nivel, ...r.usos].filter(Boolean).join(' ')).includes(q))
  }, [pruebas, busqueda, instrumentoId])

  const conservar = async (r: PruebaDeBanco) => {
    await guardarPruebaEnBanco(r.def, { area: r.area, nivel: r.nivel })
    setMsg({ tipo: 'ok', texto: `«${r.def.titulo}» queda guardado en el banco: seguirá aquí aunque borres la clase.` })
    cargar()
  }

  const quitar = async (r: PruebaDeBanco) => {
    if (r.bancoId == null) return
    const sigue = r.usos.length > 0
    if (!confirm(sigue
      ? `¿Quitar «${r.def.titulo}» del banco?\n\nLos instrumentos que lo usan lo conservan.`
      : `¿Quitar «${r.def.titulo}» del banco?\n\nNingún instrumento lo usa: se perderá.`)) return
    await eliminarPruebaDelBanco(r.bancoId)
    setMsg({ tipo: 'ok', texto: `«${r.def.titulo}» quitado del banco.` })
    cargar()
  }

  return (
    <div data-banco-pruebas style={{ border: '1px solid var(--gris-300)', background: 'var(--gris-50)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <strong style={{ fontSize: 13.5, color: 'var(--azul-900)', flex: 1 }}>📚 Mi banco de pruebas</strong>
        <button onClick={onCerrar} aria-label="Cerrar el banco"
          style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--gris-600)', lineHeight: 1 }}>×</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--gris-600)', lineHeight: 1.5, margin: '0 0 10px' }}>
        Tus exámenes de todas las clases. Al elegir uno se <strong>copia</strong> a este instrumento: puedes adaptarlo sin cambiar el original.
      </p>

      {msg && (
        <div style={{
          marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12.5,
          background: msg.tipo === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.tipo === 'ok' ? '#166534' : '#991b1b',
        }}>
          {msg.tipo === 'ok' ? '✅ ' : '❌ '}{msg.texto}
        </div>
      )}

      {pruebas === null && <div style={{ fontSize: 12.5, color: 'var(--gris-600)' }}>Cargando…</div>}

      {pruebas !== null && pruebas.length > 3 && (
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por título, área o clase…" aria-label="Buscar en el banco de pruebas"
          style={{ width: '100%', fontSize: 13, marginBottom: 10 }} />
      )}

      {pruebas !== null && visibles.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.55, padding: '6px 0' }}>
          {busqueda.trim()
            ? 'Ningún examen coincide con la búsqueda.'
            : 'Todavía no hay exámenes en tu banco. Aparecerán aquí los que definas en cualquier instrumento de prueba escrita, de cualquier clase.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibles.map(r => {
          const desplegada = abierta === r.id
          const tipo = TIPOS_PRUEBA.find(t => t.valor === r.def.tipo)?.nombre ?? r.def.tipo
          return (
            <div key={r.id} data-prueba-banco={r.def.titulo}
              style={{ background: 'white', border: '1px solid var(--gris-300)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--azul-900)' }}>{r.def.titulo}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--gris-600)', marginTop: 2 }}>
                    {r.def.preguntas.length} pregunta{r.def.preguntas.length !== 1 ? 's' : ''} · {puntosTotales(r.def)} puntos · {tipo}
                    {r.conClave ? ' · con clave' : ''}
                    {r.def.reparto === 'criterios' ? ' · por criterios' : ''}
                    {(r.area || r.nivel) && ` · ${[r.area, r.nivel].filter(Boolean).join(', ')}`}
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
                      title="Quitar la copia del banco. Los instrumentos que lo usan lo conservan.">
                      Quitar del banco
                    </button>
                  ) : (
                    <button className="btn-secondary" style={{ fontSize: 11.5 }} onClick={() => conservar(r)}
                      title="Guardar una copia aparte, que no desaparece si borras el instrumento o la clase">
                      ⭐ Conservar
                    </button>
                  )}
                  <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => onElegir(r)}>
                    Usar este
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

/** Las preguntas con sus puntos y, en un test con clave, la correcta: lo justo para reconocer el examen. */
function VistaPrevia({ r }: { r: PruebaDeBanco }) {
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--gris-200)', fontSize: 12, color: 'var(--gris-700)', lineHeight: 1.55 }}>
      <ol style={{ margin: '0 0 0 18px', padding: 0 }}>
        {r.def.preguntas.map((p, i) => (
          <li key={p.id}>
            {p.enunciado || `Pregunta ${i + 1}`} — {p.max} pt{p.max !== 1 ? 's' : ''}
            {p.criterio_id ? ` · ${p.criterio_id}` : ''}
            {p.opciones?.length ? ` · ${p.opciones.length} opciones${p.correcta != null ? `, correcta ${LETRAS[p.correcta]}` : ''}` : ''}
          </li>
        ))}
      </ol>
    </div>
  )
}
