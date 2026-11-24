/**
 * El hub de áreas: la entrada del Calificador con el aspecto Lámina.
 *
 * Antes de calificar se elige el área aquí, a la vista de todas, en vez de en
 * un desplegable: simplifica la navegación y evita poner notas en el área
 * equivocada (petición de Luis, nov 2026). Cada área lleva su sigla y su
 * color, que después se ven en el marco mientras se califica.
 *
 * No calcula ninguna nota: cuenta lo que hay (`getResumenDeAreas`).
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useClaseActiva } from '@/contexto/ClaseActiva'
import { getResumenDeAreas, type ResumenDeArea } from '@/db/queries'
import { identidadDeAreas } from '@/db/areas'
import { localeAhora, useT } from '@/i18n'
import Sigla from '@/components/comunes/Sigla'

export default function HubAreas() {
  const t = useT()
  const navegar = useNavigate()
  const { grupo, grupoId, asignaturas, asignaturaId, trimestre, cargando, elegirAsignatura } = useClaseActiva()
  const [areas, setAreas] = useState<ResumenDeArea[] | null>(null)

  useEffect(() => {
    let vigente = true
    if (grupoId == null) { setAreas([]); return }
    getResumenDeAreas(grupoId, trimestre).then(r => { if (vigente) setAreas(r) })
    return () => { vigente = false }
  }, [grupoId, trimestre, asignaturas])

  if (cargando || areas == null) return <p className="hub-nota">{t('inicio.cargando')}</p>

  const identidad = identidadDeAreas(areas.map(a => a.asignatura))
  const entrar = (id: number) => { elegirAsignatura(id); navegar('/evaluacion') }
  const fecha = (iso: string) => new Date(iso).toLocaleDateString(localeAhora(), { day: 'numeric', month: 'long' })
  const ultima = areas.find(a => a.asignatura.id === asignaturaId && a.notas > 0)

  return (
    <div data-hub-areas>
      <h1 className="page-title">{t('menu.calificador')}</h1>

      {areas.length === 0 && (
        <p className="hub-nota">
          {grupo ? t('hub.sinAreas') : t('hub.sinClase')}{' '}
          <Link to={grupoId != null ? `/grupos/${grupoId}` : '/grupos'}>{t('hub.irAClases')}</Link>
        </p>
      )}

      {ultima && (() => { const id = identidad.get(ultima.asignatura.id!)!; return (
        <>
          <p className="hub-rotulo">{t('hub.seguir')}</p>
          <div className="hub-seguir" data-hub-seguir style={{ '--c': id.color, '--cp': id.papel } as React.CSSProperties}>
            <Sigla sigla={id.sigla} color={id.color} />
            <span className="hub-nombre"><b>{ultima.asignatura.nombre_display}</b>
              <span className="hub-dato">{t('hub.ultimaNota', { fecha: fecha(ultima.ultima!) })}</span></span>
            <button type="button" className="btn-primary" onClick={() => entrar(ultima.asignatura.id!)}>{t('hub.seguirBoton')}</button>
          </div>
        </>
      ) })()}

      {areas.length > 0 && (
        <>
          <p className="hub-rotulo"><span>{t('hub.areasDe', { clase: grupo?.nombre ?? '', n: areas.length })}</span><span>{t('hub.toca')}</span></p>
          <ol className="hub-mosaico">
            {areas.map(a => { const id = identidad.get(a.asignatura.id!)!; return (
              <li key={a.asignatura.id} className="hub-casilla" data-hub-area={a.asignatura.id} data-sigla={id.sigla}
                style={{ '--c': id.color, '--cp': id.papel } as React.CSSProperties}>
                <button type="button" className="hub-abre" onClick={() => entrar(a.asignatura.id!)}>
                  <Sigla sigla={id.sigla} color={id.color} />
                  <span className="hub-nombre"><b>{a.asignatura.nombre_display}</b>
                    <span className="hub-dato">{a.unidades.length ? t('hub.unidades', { n: a.unidades.length, t: trimestre }) : t('hub.sinUnidades', { t: trimestre })}</span></span>
                </button>
                <p className={a.notas ? 'hub-estado' : 'hub-estado hub-estado--pide'}>
                  {a.notas ? t('hub.notas', { n: a.notas }) : t('hub.sinNotas')}
                </p>
              </li>
            ) })}
          </ol>
          <p className="hub-nota">{t('hub.pie')}</p>
        </>
      )}
    </div>
  )
}
