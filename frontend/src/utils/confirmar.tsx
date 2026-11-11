/**
 * El diálogo de confirmación de la app, en lugar de `confirm()` y `alert()`
 * del navegador (rediseño del Calificador, fase 3 · E).
 *
 * Los del navegador no dejan poner el verbo en el botón («Aceptar» no dice
 * qué se acepta), cortan el texto en el iPad y en la app instalada salen con
 * la dirección de la web encima. Este se llama igual de fácil —
 * `if (!await confirmar('¿Borrar…?')) return`— y admite título, verbo y
 * marca de peligro. Se monta solo, por encima de cualquier otro diálogo, y
 * devuelve el foco a donde estaba.
 *
 * Con una cadena, el primer párrafo hace de título. Esc y «Cancelar»
 * devuelven false. Las pruebas lo aceptan con `aceptarConfirmaciones` de
 * `pruebas/lib/entorno.mjs`, que busca `[data-confirmar]`.
 */
import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'

export interface OpcionesConfirmar {
  /** La pregunta, en una línea. Sin él, el primer párrafo de `texto`. */
  titulo?: string
  /** Lo que pasará. Los saltos de línea se respetan. */
  texto?: string
  /** El verbo del botón que confirma: «Vaciar la columna», «Borrar». */
  aceptar?: string
  cancelar?: string
  /** La acción quita o borra algo: el botón que confirma va en rojo. */
  peligro?: boolean
  /** Solo informa: un único botón («Entendido»). */
  soloAviso?: boolean
}

function Dialogo({ o, alCerrar }: { o: OpcionesConfirmar; alCerrar: (v: boolean) => void }) {
  const principal = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    principal.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); alCerrar(false) }
    }
    // En captura: que Esc cierre esta pregunta y no el diálogo de debajo.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [alCerrar])
  return (
    <div className="modal-overlay" style={{ zIndex: 5000 }} data-confirmar
      onClick={e => { if (e.target === e.currentTarget) alCerrar(false) }}>
      <div className="card" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo"
        style={{ width: 'min(520px, 94vw)', maxHeight: '88vh', overflowY: 'auto', padding: 22 }}>
        <div id="confirmar-titulo" data-confirmar-titulo style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-900)', lineHeight: 1.35, whiteSpace: 'pre-line' }}>
          {o.titulo}
        </div>
        {o.texto && (
          <div data-confirmar-texto style={{ fontSize: 14, color: 'var(--gris-600)', lineHeight: 1.5, marginTop: 8, whiteSpace: 'pre-line' }}>
            {o.texto}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 18 }}>
          {!o.soloAviso && (
            <button type="button" className="btn-secondary" data-confirmar-cancelar onClick={() => alCerrar(false)} style={{ minHeight: 44, padding: '8px 16px' }}>
              {o.cancelar ?? 'Cancelar'}
            </button>
          )}
          <button type="button" ref={principal} className="btn-primary" data-confirmar-aceptar onClick={() => alCerrar(true)}
            style={{ minHeight: 44, padding: '8px 16px', ...(o.peligro ? { background: 'var(--cal-insuficiente)', borderColor: 'var(--cal-insuficiente)' } : {}) }}>
            {o.aceptar ?? (o.soloAviso ? 'Entendido' : 'Aceptar')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Una cadena suelta: el primer párrafo es la pregunta y el resto, la explicación. */
function deTexto(mensaje: string): OpcionesConfirmar {
  const [titulo, ...resto] = mensaje.trim().split(/\n\s*\n/)
  return { titulo, texto: resto.join('\n\n') || undefined }
}

function abrir(o: OpcionesConfirmar): Promise<boolean> {
  return new Promise(resolver => {
    const antes = document.activeElement as HTMLElement | null
    const nodo = document.createElement('div')
    document.body.appendChild(nodo)
    const raiz = createRoot(nodo)
    const cerrar = (v: boolean) => {
      raiz.unmount()
      nodo.remove()
      antes?.focus?.()
      resolver(v)
    }
    raiz.render(<Dialogo o={o} alCerrar={cerrar} />)
  })
}

/** Pregunta antes de hacer algo. Devuelve true si el docente confirma. */
export function confirmar(mensaje: string | OpcionesConfirmar): Promise<boolean> {
  const o = typeof mensaje === 'string' ? deTexto(mensaje) : mensaje
  return abrir({ ...o, titulo: o.titulo ?? deTexto(o.texto ?? '').titulo, ...(o.titulo ? {} : { texto: deTexto(o.texto ?? '').texto }) })
}

/** Dice algo que hay que leer antes de seguir. Sustituye a `alert()`. */
export async function avisar(mensaje: string | OpcionesConfirmar): Promise<void> {
  const o = typeof mensaje === 'string' ? deTexto(mensaje) : mensaje
  await abrir({ ...o, soloAviso: true })
}
