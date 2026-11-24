import { Link } from 'react-router-dom'
import { useT } from '@/i18n'

/**
 * Una URL que no existe pintaba el marco de la app con el contenido vacío,
 * que se parece demasiado a «esto está roto». Sobre todo con la PWA, donde
 * cualquier ruta abre sin red desde el acceso directo del móvil.
 */
export default function NoEncontrada() {
  const t = useT()
  return (
    <div className="card" style={{ padding: 40, textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
        {t('noEncontrada.titulo')}
      </h1>
      <p style={{ color: 'var(--gris-600)', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
        {t('noEncontrada.texto')}
      </p>
      <Link to="/" className="btn-primary"
        style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--azul-700)',
                 color: 'white', fontWeight: 600, fontSize: 14 }}>
        {t('noEncontrada.volver')}
      </Link>
    </div>
  )
}
