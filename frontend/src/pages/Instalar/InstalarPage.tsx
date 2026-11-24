/**
 * Instalar MiClase: las formas de tener la app en un aparato, y por qué
 * cualquiera de ellas sobrevive a EDUmind.
 *
 * MiClase no necesita al servidor para nada de lo que guarda (todo vive en el
 * navegador, ver PRIVACIDAD.md), así que instalarla es solo tener la app:
 *
 *   1. Desde el navegador (PWA). Una vez instalada, el service worker la abre
 *      sin red aunque miclase.edumind.es desapareciera.
 *   2. La versión descargable: un .zip publicado en GitHub con la app
 *      compilada y lanzadores de doble clic (`distribucion/`,
 *      `scripts/empaquetar_descargable.sh`). Se sirve en localhost:8765.
 *   3. En el servidor del centro, con el docker-compose del mismo .zip.
 *
 * Decisión de Luis (nov 2026): «que siga viva aunque mi proyecto mañana se
 * terminase», como la versión descargable de Liga de Valores.
 */
import { useState } from 'react'
import { useT } from '@/i18n'
import { esIOS, lanzarInstalacion, useEventoInstalacion, yaInstalada } from '@/components/InstalarApp'
import ExportImport from '@/components/ExportImport'

const REPO = 'https://github.com/edumind-es/edumind-miclase'
/** El nombre del fichero lo fija `scripts/empaquetar_descargable.sh`. */
export const URL_DESCARGA = `${REPO}/releases/latest/download/miclase.zip`
const URL_VERSIONES = `${REPO}/releases`

export default function InstalarPage() {
  const t = useT()
  const evento = useEventoInstalacion()
  const [instalada] = useState(yaInstalada)
  const [copia, setCopia] = useState(false)
  const ios = esIOS()

  return (
    <div style={{ maxWidth: 820 }} data-instalar-pagina>
      <h1 className="page-title">{t('instalar.titulo')}</h1>
      <p style={{ color: 'var(--gris-600)', lineHeight: 1.65, marginBottom: 20, maxWidth: 680 }}>
        {t('instalar.intro')}
      </p>

      <section className="card instalar-opcion" data-instalar-opcion="navegador">
        <h2 className="instalar-opcion-titulo"><span className="instalar-num">1</span>{t('instalar.a.titulo')}</h2>
        <p>{t('instalar.a.texto')}</p>
        {instalada
          ? <p className="instalar-ok">✓ {t('instalar.a.ya')}</p>
          : (
            <>
              {evento && (
                <button className="btn-primary" onClick={() => { lanzarInstalacion() }}>
                  📲 {t('instalar.a.boton')}
                </button>
              )}
              <ul className="instalar-lista">
                {(!ios || !evento) && <li>{t('instalar.a.chrome')}</li>}
                <li>{t('instalar.a.ios')}</li>
              </ul>
            </>
          )}
      </section>

      <section className="card instalar-opcion" data-instalar-opcion="descargable">
        <h2 className="instalar-opcion-titulo"><span className="instalar-num">2</span>{t('instalar.b.titulo')}</h2>
        <p>{t('instalar.b.texto')}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0' }}>
          <a className="btn-primary" href={URL_DESCARGA} data-instalar-descargar
            style={{ textDecoration: 'none' }}>
            ⬇ {t('instalar.b.descargar')}
          </a>
          <a className="btn-secondary" href={URL_VERSIONES} target="_blank" rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}>
            {t('instalar.b.github')}
          </a>
        </div>
        <h3 className="instalar-subtitulo">{t('instalar.b.pasosTitulo')}</h3>
        <ol className="instalar-lista">
          <li>{t('instalar.b.paso1')}</li>
          <li>{t('instalar.b.paso2')}</li>
          <li>{t('instalar.b.paso3')}</li>
        </ol>
        <p className="instalar-aviso">{t('instalar.b.aviso')}</p>
      </section>

      <section className="card instalar-opcion" data-instalar-opcion="centro">
        <h2 className="instalar-opcion-titulo"><span className="instalar-num">3</span>{t('instalar.c.titulo')}</h2>
        <p>{t('instalar.c.texto')}</p>
        <pre className="instalar-codigo">docker compose up -d</pre>
      </section>

      <section className="card instalar-opcion" style={{ background: 'var(--azul-100)' }}>
        <h2 className="instalar-opcion-titulo">🔒 {t('instalar.datosTitulo')}</h2>
        <p>{t('instalar.datosTexto')}</p>
        <button className="btn-secondary" onClick={() => setCopia(true)}>📦 {t('instalar.exportar')}</button>
      </section>

      {copia && <ExportImport onClose={() => setCopia(false)} />}
    </div>
  )
}
