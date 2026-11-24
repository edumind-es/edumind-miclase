/**
 * Castellano o galego.
 *
 * `ElegirIdioma` es la pregunta de la primera vez: sale al abrir la app en un
 * aparato sin idioma elegido (`miclase.idioma`) y se va en cuanto se elige.
 * Va en los dos idiomas a la vez, porque todavía no se sabe cuál lee quien la
 * ve. Cerrarla sin elegir deja el que propone el navegador.
 *
 * `SelectorIdioma` es el cambio de después, en el panel bajo del menú.
 */
import { useState } from 'react'
import Dialogo from '@/components/comunes/Dialogo'
import { fijarIdioma, idiomaElegido, idiomaInicial, useIdioma, useT, IDIOMAS, NOMBRE_IDIOMA, type Idioma } from '@/i18n'
import { traducir } from '@/i18n/textos'

export default function ElegirIdioma() {
  const [pendiente, setPendiente] = useState(() => idiomaElegido() == null)
  if (!pendiente) return null
  const propuesto = idiomaInicial()
  const elegir = (i: Idioma) => { fijarIdioma(i); setPendiente(false) }

  return (
    <Dialogo
      data-elegir-idioma
      ancho={520}
      titulo={<>{traducir('es', 'idioma.titulo')}<br /><span style={{ fontWeight: 500 }}>{traducir('gl', 'idioma.titulo')}</span></>}
      onCerrar={() => elegir(propuesto)}
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        {IDIOMAS.map(i => (
          <button key={i} type="button" data-idioma={i} autoFocus={i === propuesto}
            className={i === propuesto ? 'btn-primary' : 'btn-secondary'}
            onClick={() => elegir(i)}
            style={{ flex: '1 1 180px', minHeight: 64, fontSize: 18, fontWeight: 700 }}>
            {NOMBRE_IDIOMA[i]}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 13, color: 'var(--gris-600)', lineHeight: 1.55 }}>
        {traducir('es', 'idioma.texto')}
      </p>
      <p style={{ fontSize: 13, color: 'var(--gris-600)', lineHeight: 1.55, marginTop: 6 }}>
        {traducir('gl', 'idioma.texto')}
      </p>
    </Dialogo>
  )
}

/** Dos botones en el panel del menú: el idioma activo, marcado. */
export function SelectorIdioma() {
  const idioma = useIdioma()
  const t = useT()
  return (
    <div className="selector-idioma" role="group" aria-label={t('idioma.menu')} data-selector-idioma>
      <span className="sidebar-panel-texto selector-idioma-titulo" aria-hidden="true">🌐</span>
      {IDIOMAS.map(i => (
        <button key={i} type="button" data-idioma={i}
          className={`selector-idioma-boton${i === idioma ? ' activo' : ''}`}
          aria-pressed={i === idioma} title={NOMBRE_IDIOMA[i]} lang={i}
          onClick={() => { if (i !== idioma) fijarIdioma(i) }}>
          {i.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
