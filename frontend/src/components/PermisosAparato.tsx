/**
 * Los permisos de cámara y micrófono de este aparato, a la vista en «Acerca de».
 *
 * Una web no puede cambiar un permiso que el navegador tiene bloqueado: si se
 * dijo «No permitir» una vez, el navegador no vuelve a preguntar y la app no
 * tiene cómo deshacerlo. Lo que sí puede es DECIR cómo está, volver a pedirlo
 * cuando aún se puede y explicar dónde se cambia. A Luis le pasó en el iPad:
 * lo negó por error y no había por dónde volver (27/11/2026).
 */
import { useEffect, useState } from 'react'
import { useT } from '@/i18n'
import type { Clave } from '@/i18n/textos'

type Cual = 'camera' | 'microphone'
type Estado = 'granted' | 'denied' | 'prompt' | 'desconocido'

/** Cómo está el permiso, o «desconocido» si el navegador no lo dice (Safari antiguo, Firefox). */
async function estadoDe(cual: Cual): Promise<Estado> {
  try {
    const r = await navigator.permissions.query({ name: cual as PermissionName })
    return r.state as Estado
  } catch { return 'desconocido' }
}

const ROTULO: Record<Cual, Clave> = { camera: 'permisos.camara', microphone: 'permisos.micro' }
const ESTADO: Record<Estado, Clave> = {
  granted: 'permisos.permitido', denied: 'permisos.bloqueado', prompt: 'permisos.preguntara', desconocido: 'permisos.desconocido',
}

export default function PermisosAparato() {
  const t = useT()
  const [estados, setEstados] = useState<Record<Cual, Estado>>({ camera: 'desconocido', microphone: 'desconocido' })
  const [resultado, setResultado] = useState<{ cual: Cual; texto: Clave; bien: boolean } | null>(null)
  const [ocupado, setOcupado] = useState<Cual | null>(null)

  const leer = async () => setEstados({ camera: await estadoDe('camera'), microphone: await estadoDe('microphone') })
  useEffect(() => { void leer() }, [])

  // Pedirlo es usarlo un instante: el navegador solo pregunta cuando se intenta
  // abrir la cámara o el micrófono, y se sueltan en cuanto contesta.
  const pedir = async (cual: Cual) => {
    setOcupado(cual); setResultado(null)
    try {
      const flujo = await navigator.mediaDevices.getUserMedia(cual === 'camera' ? { video: true } : { audio: true })
      flujo.getTracks().forEach(p => p.stop())
      setResultado({ cual, texto: 'permisos.funciona', bien: true })
    } catch (e) {
      const nombre = (e as { name?: string })?.name
      setResultado({ cual, bien: false, texto: nombre === 'NotAllowedError' ? 'permisos.negado' : nombre === 'NotFoundError' ? 'permisos.noHay' : 'permisos.fallo' })
    }
    await leer()
    setOcupado(null)
  }

  const algunoBloqueado = Object.values(estados).includes('denied') || (resultado != null && !resultado.bien && resultado.texto === 'permisos.negado')
  return (
    <div data-permisos>
      {(['camera', 'microphone'] as const).map(cual => (
        <div key={cual} data-permiso={cual} data-estado={estados[cual]} className="ml-permiso">
          <span><b>{t(ROTULO[cual])}</b> · {t(ESTADO[estados[cual]])}</span>
          <button type="button" className="btn-secondary" data-permiso-pedir disabled={ocupado != null} onClick={() => pedir(cual)}>
            {t(estados[cual] === 'granted' ? 'permisos.comprobar' : 'permisos.pedir')}
          </button>
          {resultado?.cual === cual && (
            <p role="status" data-permiso-resultado className="ml-nota" style={{ color: resultado.bien ? 'var(--bien-tinta)' : 'var(--mal-tinta)' }}>{t(resultado.texto)}</p>
          )}
        </div>
      ))}
      {algunoBloqueado && (
        <div data-permisos-como className="ml-nota">
          <p style={{ margin: '6px 0 4px' }}><b>{t('permisos.comoTitulo')}</b></p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>{t('permisos.comoIpad')}</li>
            <li>{t('permisos.comoMac')}</li>
            <li>{t('permisos.comoChrome')}</li>
          </ul>
          <p style={{ margin: '4px 0 0' }}>{t('permisos.comoDespues')}</p>
        </div>
      )}
    </div>
  )
}
