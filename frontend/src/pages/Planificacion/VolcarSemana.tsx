/**
 * Volcar una semana desde un .md: leer, enseñar qué ha salido y qué no casa
 * con la clase, y solo entonces guardar. Si la semana ya tiene algo
 * planificado, pregunta antes de sustituirlo (volcar dos veces no duplica).
 */
import { useState } from 'react'
import { leerSemana, type SemanaLeida } from '@/planificacion/semanal'
import { prepararVolcado, casarArea, type Volcado } from '@/planificacion/casar'
import { contarPlanificado, getUnidades, volcarSemana } from '@/db/queries'
import type { Asignatura, Grupo } from '@/db/localDb'
import { useAppStore } from '@/store/useAppStore'
import { idsDeCriterios } from './curriculo'
import { diaLargo } from '@/planificacion/exportar'

interface Props {
  grupo: Grupo & { id?: number }
  asignaturas: Asignatura[]
  onCerrar: () => void
  /** Tras guardar: el lunes de la semana volcada, para ir a verla. */
  onGuardado: (desde: string, mensaje: string) => void
}

export default function VolcarSemana({ grupo, asignaturas, onCerrar, onGuardado }: Props) {
  const headers = useAppStore(s => s._headers)
  const [texto, setTexto] = useState('')
  const [leida, setLeida] = useState<SemanaLeida | null>(null)
  const [volcado, setVolcado] = useState<Volcado | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const leer = async (md: string) => {
    setError(null); setLeida(null); setVolcado(null)
    const s = leerSemana(md)
    setLeida(s)
    if (!s.sesiones.length) return
    setTrabajando(true)
    try {
      // Solo las áreas que aparecen: no hace falta pedir el currículo de todas
      const usadas = asignaturas.filter(a => s.sesiones.some(x => casarArea(x.area, [{ id: a.id!, nombre: a.nombre, nombre_display: a.nombre_display }])))
      const unidades = (await Promise.all(usadas.map(a => getUnidades(a.id!)))).flat()
      const criterios = new Map<number, string[] | null>()
      await Promise.all(usadas.map(async a => criterios.set(a.id!, await idsDeCriterios(grupo, a, headers()))))
      setVolcado(prepararVolcado(s, {
        asignaturas: asignaturas.map(a => ({ id: a.id!, nombre: a.nombre, nombre_display: a.nombre_display })),
        unidades: unidades.map(u => ({ id: u.id!, asignatura_id: u.asignatura_id, nombre: u.nombre })),
        criterios,
      }))
    } catch (e) {
      setError(`No se pudo preparar la vista previa: ${(e as Error).message}`)
    } finally {
      setTrabajando(false)
    }
  }

  const abrirFichero = async (f: File | undefined) => {
    if (!f) return
    const t = await f.text()
    setTexto(t)
    await leer(t)
  }

  const guardar = async () => {
    if (!leida || !volcado || !leida.desde || !leida.hasta) return
    setTrabajando(true)
    try {
      const desde = leida.desde, hasta = leida.hasta
      const previas = await contarPlanificado(grupo.id!, desde, hasta)
      let sustituir = false
      if (previas) {
        sustituir = confirm(`Esa semana ya tiene ${previas} sesión(es) planificada(s) en ${grupo.nombre}.\n\n` +
          '¿Sustituirlas por las del fichero? Los eventos que escribiste a mano se quedan.')
        if (!sustituir) { setTrabajando(false); return }
      }
      const r = await volcarSemana(grupo.id!, volcado.sesiones, leida.notas, { desde, hasta, sustituir })
      if (!r) { setError('No se ha guardado nada.'); return }
      onGuardado(desde, `Volcadas ${r.creadas} sesiones${r.eventos ? ` y ${r.eventos} nota(s) del día` : ''}` +
        (r.retiradas ? `; sustituidas las ${r.retiradas} que había.` : '.'))
    } catch (e) {
      setError(`No se pudo guardar: ${(e as Error).message}`)
    } finally {
      setTrabajando(false)
    }
  }

  const sinCasar = volcado && (volcado.areasSinCasar.length + volcado.unidadesSinCasar.length +
    volcado.criteriosSinCasar.length + volcado.criteriosSinComprobar.length)

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card plan-modal" role="dialog" aria-modal="true" aria-label="Volcar una semana">
        <div className="plan-modal-cab">
          <h2>Volcar una semana</h2>
          <button className="modal-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>

        <p className="plan-ayuda">
          Sube el fichero <b>.md</b> de la programación semanal o pega su texto. Primero verás lo que sale;
          no se guarda nada hasta que pulses «Guardar». Se guarda en <b>{grupo.nombre}</b>.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <label className="btn-secondary" style={{ padding: '8px 14px', borderRadius: 6, cursor: 'pointer' }}>
            📄 Elegir fichero
            <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden data-volcar-fichero
              onChange={e => abrirFichero(e.target.files?.[0])} />
          </label>
          <span style={{ fontSize: 13, color: 'var(--gris-500)' }}>o pega el texto:</span>
        </div>
        <textarea data-volcar-texto value={texto} onChange={e => setTexto(e.target.value)} rows={6}
          placeholder="# Programación semanal · 6º A…" style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
        <div style={{ marginTop: 8 }}>
          <button className="btn-secondary" data-volcar-leer disabled={!texto.trim() || trabajando} onClick={() => leer(texto)}>
            Leer
          </button>
        </div>

        {error && <div className="plan-aviso plan-aviso--error">{error}</div>}

        {leida && (
          <div data-volcar-resumen style={{ marginTop: 14 }}>
            <div className="plan-resumen">
              <b>{leida.sesiones.length} sesiones</b>
              {leida.titulo_semana && <> · {leida.titulo_semana}</>}
              {leida.clase && <> · el fichero dice «{leida.clase}»</>}
              {leida.notas.length > 0 && <> · {leida.notas.length} nota(s) del día</>}
            </div>
            {leida.avisos.map((a, i) => <div key={i} className="plan-aviso">{a}</div>)}
            {!leida.desde && leida.sesiones.length > 0 && (
              <div className="plan-aviso plan-aviso--error">No sé de qué semana es: falta la línea «Semana del … al …».</div>
            )}

            {volcado && (
              <>
                {sinCasar ? (
                  <div className="plan-nocasa" data-no-casa>
                    <b>Lo que no casa con {grupo.nombre}</b> (se guarda igual, con el texto tal cual):
                    <ul>
                      {volcado.areasSinCasar.map(a => (
                        <li key={a.area} data-no-casa-area={a.area}>
                          Área «{a.area}» ({a.sesiones === 1 ? '1 sesión' : `${a.sesiones} sesiones`})
                          {a.especialista ? ': es de especialista y la clase no tiene esa área.' : ': la clase no tiene esa área.'}
                        </li>
                      ))}
                      {volcado.unidadesSinCasar.map(u => (
                        <li key={u.area + u.unidad} data-no-casa-unidad={u.unidad}>
                          Unidad «{u.unidad}» de {u.area}: no hay ninguna unidad con ese nombre o número en el área.
                        </li>
                      ))}
                      {volcado.criteriosSinCasar.map(c => (
                        <li key={c.area + c.codigo} data-no-casa-criterio={c.codigo}>
                          Criterio {c.codigo} de {c.area}: no está en el currículo del área.
                        </li>
                      ))}
                      {volcado.criteriosSinComprobar.map(a => (
                        <li key={a}>Criterios de {a}: no se han podido comprobar (sin conexión con el currículo).</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="plan-aviso plan-aviso--ok">Todo casa: áreas, unidades y criterios.</div>
                )}

                <div className="plan-previa">
                  {volcado.sesiones.map((s, i) => (
                    <div key={i} className="plan-previa-fila">
                      <span className="plan-previa-dia">{diaLargo(s.fecha)} · {s.franja ?? ''} {s.hora_inicio}</span>
                      <span>
                        <b>{s.area}</b>{s.unidad_texto ? ` · ${s.unidad_texto}` : ''}{s.titulo ? ` · ${s.titulo}` : ''}
                        {s.evaluable ? ' ■' : ''}
                        {!s.asignatura_id && s.tipo !== 'centro' && <span className="plan-chip-nocasa">sin área</span>}
                        {s.asignatura_id && s.unidad_texto && /UD\s*\d/i.test(s.unidad_texto) && !s.unidad_id && <span className="plan-chip-nocasa">sin unidad</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="plan-modal-pie">
          <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" data-volcar-guardar disabled={!volcado || !volcado.sesiones.length || !leida?.desde || trabajando}
            onClick={guardar}>
            {trabajando ? 'Un momento…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
