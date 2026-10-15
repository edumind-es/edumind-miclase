/**
 * «De dónde sale esta nota»: la ficha que abre una casilla en «Todo el curso».
 *
 * En la pestaña de todo el curso no se califica —no hay unidad en la que
 * anotar— y la casilla es un resumen: la nota del criterio (o la media del
 * alumno con el instrumento) en el trimestre. Pulsarla no abre el panel de
 * edición sino esta ficha, que enseña con qué instrumentos se ha construido
 * el número, en qué unidad se anotó cada nota, qué pesa cada cosa y cómo
 * queda el criterio en los tres trimestres y en la nota final.
 *
 * El cálculo es el de siempre (`calcularNotaArea`, el mismo del boletín):
 * aquí no se suma nada por cuenta propia, solo se cuenta lo que ya pasa.
 */
import { useEffect, useState } from 'react'
import { getCalificacionesAlumnoAsignatura, type CeldaInstrumento, type UnidadConCriterios } from '@/db/queries'
import {
  calcularNotaArea, calificativo, parsearPesosTrimestres, pesosVinculoDeUnidades,
  porcentajesEnFamilia, type NotaArea,
} from '@/db/calculo'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import type { Alumno, Asignatura, Calificacion, Instrumento } from '@/db/localDb'

type Criterio = { id: string; descripcion: string }

interface Props {
  alumno: Alumno
  asig: Asignatura
  trimestre: number
  instrumentos: Instrumento[]
  unidades: UnidadConCriterios[]
  /** Casilla por criterio: se explica la nota del criterio. */
  criterio?: Criterio
  /** Casilla por instrumento: se explica la media del alumno con él en estos criterios. */
  instrumento?: { ins: CeldaInstrumento; criterios: Criterio[] }
  onCerrar: () => void
}

const r1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10)

/** Cómo se puso una nota: a mano, con rúbrica, del diario o de un examen. */
function origenDe(c: Calificacion): string {
  if (c.origen === 'diario') return 'derivada del diario'
  if (c.niveles_rubrica && Object.keys(c.niveles_rubrica).length) return 'con rúbrica'
  return 'nota directa'
}

export default function ExplicacionNota({ alumno, asig, trimestre, instrumentos, unidades, criterio, instrumento, onCerrar }: Props) {
  const [cals, setCals] = useState<Calificacion[] | null>(null)
  const [nota, setNota] = useState<NotaArea | null>(null)

  useEffect(() => {
    let vigente = true
    getCalificacionesAlumnoAsignatura(alumno.id!, asig.id!).then(lista => {
      if (!vigente) return
      const pesosCriterio = new Map<string, number>()
      for (const u of unidades) for (const c of u.criterios) pesosCriterio.set(c.criterio_id, Math.max(pesosCriterio.get(c.criterio_id) ?? 0, c.peso || 1))
      setCals(lista)
      setNota(calcularNotaArea(asig.id!, lista, instrumentos, asig.pesos_trimestres, pesosCriterio, pesosVinculoDeUnidades(unidades)))
    })
    return () => { vigente = false }
  }, [alumno.id, asig.id, instrumentos, unidades])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const porId = new Map(instrumentos.map(i => [i.id!, i]))
  const nombreUnidad = (id: number | null | undefined) => unidades.find(u => u.id === id)?.nombre ?? null
  const pesosT = parsearPesosTrimestres(asig.pesos_trimestres)

  /** Las notas crudas (las de verdad, con el id del hijo) de un criterio en el trimestre. */
  const crudasDe = (criterioId: string) =>
    (cals ?? []).filter(c => c.criterio_id === criterioId && c.trimestre === trimestre && c.valor != null)
      .sort((a, b) => (porId.get(a.instrumento_id)?.orden ?? 0) - (porId.get(b.instrumento_id)?.orden ?? 0))

  const filaCruda = (c: Calificacion) => {
    const ins = porId.get(c.instrumento_id)
    const fam = ins?.familia_id != null ? porId.get(ins.familia_id) : null
    const hermanos = fam ? instrumentos.filter(i => i.familia_id === fam.id) : []
    const pct = fam ? porcentajesEnFamilia(hermanos.map(h => h.peso))[hermanos.findIndex(h => h.id === ins!.id)] : null
    const cfg = getInstrConfig(ins?.tipo ?? 'otro')
    const unidad = nombreUnidad(c.unidad_id)
    return (
      <li key={c.id ?? `${c.instrumento_id}:${c.criterio_id}`} data-explicacion-fila style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--gris-300)' }}>
        <strong style={{ fontSize: 15, minWidth: 34, textAlign: 'right', color: calificativo(c.valor).color }}>{c.valor}</strong>
        <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45 }}>
          <span aria-hidden="true">{cfg.icon}</span> <strong>{ins?.nombre ?? 'instrumento borrado'}</strong>
          {fam ? <span style={{ color: 'var(--gris-600)' }}> · {pct} % de {fam.nombre} ({fam.peso} % del área)</span>
               : ins ? <span style={{ color: 'var(--gris-600)' }}> · {ins.peso} % del área</span> : null}
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--gris-500)' }}>
            {origenDe(c)}{unidad ? ` · anotada en ${unidad}` : ''}{c.fecha ? ` · ${c.fecha.slice(0, 10)}` : ''}
            {c.valor_anterior != null ? ` · antes ${c.valor_anterior} (no cuenta)` : ''}
          </span>
        </span>
      </li>
    )
  }

  /** Bloque de un criterio: su nota del trimestre, cómo se compone y los tres trimestres. */
  const bloqueCriterio = (cr: Criterio, conTrimestres: boolean) => {
    const nc = nota?.criterios.find(x => x.criterio_id === cr.id)
    const valor = r1(nc?.trimestres[trimestre] ?? null)
    const aport = (nc?.aportaciones ?? []).filter(a => a.trimestre === trimestre)
    const crudas = crudasDe(cr.id)
    return (
      <section key={cr.id} data-explicacion-criterio={cr.id} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span data-explicacion-valor style={{
            minWidth: 46, height: 46, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: valor == null ? 'var(--gris-500)' : 'white',
            background: valor == null ? 'var(--gris-100)' : calificativo(valor).color,
          }}>{valor ?? '—'}</span>
          <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--azul-900)' }}>{cr.id}</strong> · {trimestre}º trimestre
            <div style={{ color: 'var(--gris-600)', fontSize: 12 }}>{cr.descripcion}</div>
          </div>
        </div>

        {valor == null ? (
          <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '4px 0 0' }}>Sin ninguna nota en este trimestre.</p>
        ) : (
          <>
            {aport.length > 1 && (
              <p style={{ fontSize: 12, color: 'var(--gris-600)', margin: '0 0 4px' }}>
                Media ponderada de {aport.map(a => `${a.nombre} (${r1(a.valor)} × ${a.peso} %)`).join(' y ')}.
              </p>
            )}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{crudas.map(filaCruda)}</ul>
          </>
        )}

        {conTrimestres && nc && (
          <div data-explicacion-trimestres style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', fontSize: 12 }}>
            {[1, 2, 3].map(t => (
              <span key={t} style={{ padding: '4px 9px', borderRadius: 7, background: t === trimestre ? 'var(--azul-100)' : 'var(--gris-100)', color: 'var(--gris-900)' }}
                title={`Peso del ${t}º trimestre en la nota final: ${pesosT[t] ?? 0} %`}>
                T{t} <strong>{r1(nc.trimestres[t]) ?? '—'}</strong> <span style={{ color: 'var(--gris-500)' }}>· {pesosT[t] ?? 0} %</span>
              </span>
            ))}
            <span style={{ padding: '4px 9px', borderRadius: 7, background: 'var(--azul-700)', color: 'white' }}>
              Final <strong>{r1(nc.final) ?? '—'}</strong>
            </span>
          </div>
        )}
      </section>
    )
  }

  const titulo = criterio
    ? `${criterio.id} · ${alumno.apellidos}, ${alumno.nombre}`
    : `${instrumento?.ins.nombre} · ${alumno.apellidos}, ${alumno.nombre}`

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div role="dialog" aria-modal="true" aria-label={`De dónde sale la nota: ${titulo}`} data-explicacion-nota
        className="card" style={{ width: 'min(620px, 94vw)', maxHeight: '88vh', overflow: 'auto', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: 'var(--azul-900)', color: 'white', position: 'sticky', top: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .8 }}>De dónde sale esta nota</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{titulo}</div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '14px 18px 18px' }}>
          {cals == null ? (
            <p style={{ fontSize: 13, color: 'var(--gris-600)' }}>Calculando…</p>
          ) : criterio ? (
            <>
              {bloqueCriterio(criterio, true)}
              {nota && (
                <p data-explicacion-area style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '6px 0 0', paddingTop: 10, borderTop: '1px solid var(--gris-300)' }}>
                  Nota de <strong>{asig.nombre_display}</strong> en el {trimestre}º trimestre: <strong>{r1(nota.trimestres[trimestre]) ?? '—'}</strong>
                  {nota.final != null ? <> · final del curso: <strong>{r1(nota.final)}</strong></> : null}.
                </p>
              )}
            </>
          ) : instrumento ? (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '0 0 12px', lineHeight: 1.5 }}>
                La casilla es la media de lo que {alumno.nombre} tiene con <strong>{instrumento.ins.nombre}</strong> en los
                {' '}{instrumento.criterios.length} criterio{instrumento.criterios.length !== 1 ? 's' : ''} que evalúa. Cada criterio, con lo suyo:
              </p>
              {instrumento.criterios.map(cr => bloqueCriterio(cr, false))}
            </>
          ) : null}

          <p style={{ fontSize: 12, color: 'var(--gris-500)', margin: '14px 0 0', lineHeight: 1.5 }}>
            En «Todo el curso» no se califica: entra en la pestaña de una unidad para cambiar o poner notas.
          </p>
        </div>
      </div>
    </div>
  )
}
