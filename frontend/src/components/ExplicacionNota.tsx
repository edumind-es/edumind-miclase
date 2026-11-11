/**
 * «De dónde sale esta nota»: la ficha que abre una casilla en «Todo el curso».
 *
 * En la pestaña de todo el curso no se califica —no hay unidad en la que
 * anotar— y la casilla es un resumen: la nota de un criterio, la media del
 * alumno con una familia o la nota del área, en un trimestre o la final.
 * Pulsarla no abre el panel de edición sino esta ficha, que desgrana el
 * número por el mismo camino por el que se calcula:
 *
 *   nota de cada instrumento = media de sus unidades (cada unidad cuenta igual)
 *   → pesa cada instrumento dentro de su familia
 *   → pesa cada familia en el área (la nota del criterio en el trimestre)
 *   → la final pondera los trimestres con nota por su peso.
 *
 * El cálculo es el de siempre (`calcularNotaArea`, el mismo del boletín, y
 * las mismas fusiones `fundirUnidades` y `fundirHijosEnFamilias`): aquí no
 * se suma nada por cuenta propia, solo se cuenta lo que ya pasa.
 */
import { useEffect, useState } from 'react'
import { getCalificacionesAlumnoAsignatura, type UnidadConCriterios } from '@/db/queries'
import {
  calcularNotaArea, calificativo, fundirHijosEnFamilias, fundirUnidades, parsearPesosTrimestres,
  pesosCriterioDeUnidades, pesosVinculoDeUnidades, porcentajesEnFamilia, type NotaArea,
  normalizarReglaArea, normalizarReglaFinal, REGLAS_AREA, REGLAS_FINAL, pesosDeUnidades,
} from '@/db/calculo'
import { getInstrConfig } from '@/ia/instrumentosConfig'
import type { Alumno, Asignatura, Calificacion, Instrumento, Medida } from '@/db/localDb'
import { instrumentosParaAlumno, criteriosExcluidos, criterioAdaptado, etiquetaMedida, medidasDelAlumno } from '@/db/medidas'
import { verNeae } from '@/db/datosSensibles'

type Criterio = { id: string; descripcion: string }

interface Props {
  alumno: Alumno
  asig: Asignatura
  /** Trimestre que se explica; null, la nota final del curso. */
  trimestre: number | null
  instrumentos: Instrumento[]
  unidades: UnidadConCriterios[]
  /** Casilla por criterio: se explica la nota del criterio. */
  criterio?: Criterio
  /** Casilla por familia (o hijo): la media del alumno con ella en estos criterios. */
  instrumento?: { id: number; nombre: string; criterios: Criterio[] }
  onCerrar: () => void
  /** Medidas del alumno en el área: el desglose usa sus pesos y lo dice. */
  medidas?: Medida[]
}

const TRIMESTRES = [1, 2, 3]
const r1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10)
const ordinal = (t: number) => `${t}${t === 1 ? 'er' : 'º'} trimestre`

/** Cómo se puso una nota: a mano, con rúbrica, del diario o de un examen. */
function origenDe(c: Calificacion): string {
  if (c.origen === 'diario') return 'derivada del diario'
  if (c.niveles_rubrica && Object.keys(c.niveles_rubrica).length) return 'con rúbrica'
  return 'nota directa'
}

/** Una rama del desglose: el instrumento con su nota fundida y sus notas crudas, una por unidad. */
type Rama = { ins: Instrumento | undefined; id: number; valor: number | null; crudas: Calificacion[] }
/** Lo que pesa en el área: la familia (o el instrumento suelto) con sus ramas. */
type Tronco = { ins: Instrumento | undefined; id: number; valor: number | null; ramas: Rama[]; suelto: boolean }

export default function ExplicacionNota({ alumno, asig, trimestre, instrumentos, unidades, criterio, instrumento, onCerrar, medidas }: Props) {
  const [cals, setCals] = useState<Calificacion[] | null>(null)
  const [nota, setNota] = useState<NotaArea | null>(null)

  useEffect(() => {
    let vigente = true
    getCalificacionesAlumnoAsignatura(alumno.id!, asig.id!).then(lista => {
      if (!vigente) return
      setCals(lista)
      setNota(calcularNotaArea(asig.id!, lista, instrumentos, asig.pesos_trimestres,
        pesosCriterioDeUnidades(unidades), pesosVinculoDeUnidades(unidades), normalizarReglaFinal(asig.regla_final),
        normalizarReglaArea(asig.regla_area), { medidas, pesosUnidad: pesosDeUnidades(asig.regla_unidades, unidades) }))
    })
    return () => { vigente = false }
  }, [alumno.id, asig.id, instrumentos, unidades, medidas])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  // Los instrumentos como pesan para este alumno en cada trimestre: con un
  // refuerzo, los suyos; sin medida, los de la clase.
  const instrumentosEn = (t: number) => instrumentosParaAlumno(instrumentos, medidas, t)
  const porIdEn = (t: number) => new Map(instrumentosEn(t).map(i => [i.id!, i]))
  const porId = new Map(instrumentos.map(i => [i.id!, i]))
  const orden = (id: number) => porId.get(id)?.orden ?? 999
  const medidasVisibles = verNeae() ? medidasDelAlumno(medidas) : []
  const nombreUnidad = (id: number | null | undefined) => unidades.find(u => u.id === id)?.nombre ?? null
  const ordenUnidad = (id: number | null | undefined) => { const k = unidades.findIndex(u => u.id === id); return k < 0 ? 999 : k }
  const pesosT = parsearPesosTrimestres(asig.pesos_trimestres)
  // Cómo sale la final: la regla del área, con sus palabras. Mediana y nota
  // más alta no son lineales, así que se avisa de que la del área no es la
  // media de las finales de los criterios.
  const regla = normalizarReglaFinal(asig.regla_final)
  const textoFinal = (() => {
    const r = REGLAS_FINAL.find(x => x.id === regla)!
    const base = `La final sale por «${r.nombre}»: ${r.descripcion} Un trimestre sin notas no cuenta como cero.`
    return regla === 'ponderada' ? base
      : `${base} La del área se calcula con esa regla sobre sus tres notas de trimestre, no sumando las finales de los criterios, así que puede diferir una décima de lo que salga a mano.`
  })()
  const pesosCriterio = pesosCriterioDeUnidades(unidades)
  const familiaDe = (id: number): number | null => {
    const f = porId.get(id)?.familia_id ?? null
    return f != null && porId.has(f) ? f : null
  }

  /**
   * El desglose de un criterio en un trimestre, por el camino del cálculo:
   * las notas crudas (una por unidad) se funden por instrumento, y los
   * instrumentos en su familia. Las mismas funciones que el motor.
   */
  const pesosUnidad = pesosDeUnidades(asig.regla_unidades, unidades)
  const desglose = (criterioId: string, t: number): Tronco[] => {
    // Lo que la medida retira no entra en el desglose: el criterio excluido
    // y los instrumentos que no pesan para este alumno en este trimestre.
    if (criteriosExcluidos(medidas, t).has(criterioId)) return []
    const insT = instrumentosEn(t)
    const idT = porIdEn(t)
    const crudas = (cals ?? []).filter(c => c.criterio_id === criterioId && c.trimestre === t && c.valor != null
      && !(insT !== instrumentos && idT.has(c.instrumento_id) && idT.get(c.instrumento_id)!.peso <= 0))
    const porInstr = fundirUnidades(crudas, pesosUnidad)
    const porFamilia = fundirHijosEnFamilias(porInstr, insT)
    return porFamilia
      .sort((a, b) => orden(a.instrumento_id) - orden(b.instrumento_id))
      .map(f => {
        const ramas = porInstr
          .filter(i => i.instrumento_id === f.instrumento_id || familiaDe(i.instrumento_id) === f.instrumento_id)
          .sort((a, b) => orden(a.instrumento_id) - orden(b.instrumento_id))
          .map(i => ({
            ins: idT.get(i.instrumento_id), id: i.instrumento_id, valor: i.valor ?? null,
            crudas: crudas.filter(c => c.instrumento_id === i.instrumento_id).sort((a, b) => ordenUnidad(a.unidad_id) - ordenUnidad(b.unidad_id)),
          }))
        const suelto = ramas.length === 1 && ramas[0].id === f.instrumento_id && familiaDe(f.instrumento_id) == null
        return { ins: idT.get(f.instrumento_id), id: f.instrumento_id, valor: f.valor ?? null, ramas, suelto }
      })
  }

  /** Lo que se explica desde una casilla por familia o hijo: solo su tronco (o su rama). */
  const soloDe = (troncos: Tronco[]): Tronco[] => {
    if (!instrumento) return troncos
    return troncos
      .filter(tr => tr.id === instrumento.id || tr.ramas.some(r => r.id === instrumento.id))
      .map(tr => tr.id === instrumento.id ? tr : { ...tr, ramas: tr.ramas.filter(r => r.id === instrumento.id) })
  }
  /** La nota que enseña la casilla por familia o hijo en un criterio y trimestre. */
  const valorDeInstrumento = (troncos: Tronco[]): number | null => {
    if (!instrumento) return null
    const tr = troncos.find(x => x.id === instrumento.id)
    if (tr) return tr.valor
    for (const x of troncos) { const r = x.ramas.find(r => r.id === instrumento.id); if (r) return r.valor }
    return null
  }

  const pctEnFamilia = (ins: Instrumento | undefined, t: number): string | null => {
    if (!ins || ins.familia_id == null) return null
    const insT = instrumentosEn(t)
    const fam = insT.find(i => i.id === ins.familia_id)
    if (!fam) return null
    const hermanos = insT.filter(i => i.familia_id === fam.id)
    return `${porcentajesEnFamilia(hermanos.map(h => h.peso))[hermanos.findIndex(h => h.id === ins.id)]} % de ${fam.nombre}`
  }

  const filaCruda = (c: Calificacion) => {
    const unidad = nombreUnidad(c.unidad_id)
    return (
      <li key={c.id ?? `${c.instrumento_id}:${c.criterio_id}:${c.unidad_id}`} data-explicacion-fila className="explicacion-fila">
        <strong style={{ color: calificativo(c.valor).color }}>{c.valor}</strong>
        <span>
          {unidad ? <>anotada en <b>{unidad}</b></> : 'sin unidad anotada'}
          <span className="suave"> · {origenDe(c)}{c.fecha ? ` · ${c.fecha.slice(0, 10)}` : ''}
            {c.valor_anterior != null ? ` · antes ${c.valor_anterior} (no cuenta)` : ''}</span>
        </span>
      </li>
    )
  }

  const rama = (r: Rama, dentro: boolean, t: number) => {
    const cfg = getInstrConfig(r.ins?.tipo ?? 'otro')
    const pct = pctEnFamilia(r.ins, t)
    return (
      <li key={r.id} data-explicacion-rama className={`explicacion-rama${dentro ? ' dentro' : ''}`}>
        <div className="explicacion-cab">
          <strong style={{ color: calificativo(r.valor).color }}>{r1(r.valor) ?? '—'}</strong>
          <span>
            <span aria-hidden="true">{cfg.icon}</span> <b>{r.ins?.nombre ?? 'instrumento borrado'}</b>
            <span className="suave">
              {pct ? ` · ${pct}` : r.ins && !dentro ? ` · ${r.ins.peso} % del área` : ''}
              {r.crudas.length > 1 ? ` · media de ${r.crudas.length} unidades` : ''}
            </span>
          </span>
        </div>
        <ul className="explicacion-crudas">{r.crudas.map(filaCruda)}</ul>
      </li>
    )
  }

  const tronco = (tr: Tronco, t: number) => {
    if (tr.suelto) return rama(tr.ramas[0], false, t)
    const cfg = getInstrConfig(tr.ins?.tipo ?? 'otro')
    return (
      <li key={tr.id} data-explicacion-familia className="explicacion-tronco">
        <div className="explicacion-cab">
          <strong style={{ color: calificativo(tr.valor).color }}>{r1(tr.valor) ?? '—'}</strong>
          <span>
            <span aria-hidden="true">{cfg.icon}</span> <b>{tr.ins?.nombre ?? 'familia borrada'}</b>
            <span className="suave">{tr.ins ? ` · ${tr.ins.peso} % del área` : ''}{tr.ramas.length > 1 ? ` · ${tr.ramas.length} instrumentos dentro` : ''}</span>
          </span>
        </div>
        <ul className="explicacion-ramas">{tr.ramas.map(r => rama(r, true, t))}</ul>
      </li>
    )
  }

  /** El desglose de un criterio en un trimestre: su valor y de qué se compone. */
  const bloqueTrimestre = (cr: Criterio, t: number, destacado: boolean) => {
    const nc = nota?.criterios.find(x => x.criterio_id === cr.id)
    const troncos = soloDe(desglose(cr.id, t))
    const valor = r1(instrumento ? valorDeInstrumento(troncos) : nc?.trimestres[t] ?? null)
    const excluido = criteriosExcluidos(medidas, t).has(cr.id)
    const adaptado = criterioAdaptado(medidas, cr.id, t)
    return (
      <section key={`${cr.id}-${t}`} data-explicacion-criterio={cr.id} data-explicacion-trimestre={t} className="explicacion-bloque">
        <div className="explicacion-valor-fila">
          <span data-explicacion-valor className="explicacion-valor" style={{
            color: valor == null ? 'var(--gris-500)' : 'white',
            background: valor == null ? 'var(--gris-100)' : calificativo(valor).color,
            opacity: destacado ? 1 : .85,
          }}>{valor ?? '—'}</span>
          <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--azul-900)' }}>{cr.id}</strong> · {ordinal(t)}
            {instrumento ? <> · con <strong>{instrumento.nombre}</strong></> : null}
            {destacado && <div style={{ color: 'var(--gris-600)', fontSize: 12 }}>{cr.descripcion}</div>}
            {adaptado && medidasVisibles.length > 0 && (
              <div data-explicacion-adaptado style={{ color: 'var(--azul-700)', fontSize: 12 }}>
                Criterio adaptado{adaptado.curso ? ` (${adaptado.curso})` : ''}: {adaptado.codigo} {adaptado.descripcion}
              </div>
            )}
          </div>
        </div>
        {excluido ? (
          <p data-explicacion-excluido style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '4px 0 0' }}>
            Este criterio no cuenta para este alumno en este trimestre{medidasVisibles.length ? ' (adaptación curricular)' : ''}.
          </p>
        ) : valor == null ? (
          <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '4px 0 0' }}>Sin ninguna nota en este trimestre.</p>
        ) : (
          <>
            {!instrumento && troncos.length > 1 && (
              <p style={{ fontSize: 12, color: 'var(--gris-600)', margin: '0 0 4px' }}>
                Media ponderada de {troncos.map(tr => `${tr.ins?.nombre ?? 'instrumento retirado'} (${r1(tr.valor)} × ${tr.ins?.peso ?? 1} %)`).join(' y ')}.
              </p>
            )}
            <ul className="explicacion-troncos">{troncos.map(tr => tronco(tr, t))}</ul>
          </>
        )}
      </section>
    )
  }

  /** Los tres trimestres y la final de un criterio, con el peso de cada uno. */
  const chipsTrimestres = (valores: Record<number, number | null>, final: number | null) => (
    <div data-explicacion-trimestres className="explicacion-chips">
      {TRIMESTRES.map(t => (
        <span key={t} className={t === trimestre ? 'actual' : ''} title={`Peso del ${ordinal(t)} en la nota final: ${pesosT[t] ?? 0} %`}>
          T{t} <strong>{r1(valores[t]) ?? '—'}</strong> <span className="suave">· {pesosT[t] ?? 0} %</span>
        </span>
      ))}
      <span className={`final${trimestre == null ? ' actual' : ''}`}>Final <strong>{r1(final) ?? '—'}</strong></span>
    </div>
  )

  /** Un criterio entero: el trimestre pedido, o los tres si se explica la final. */
  const bloqueCriterio = (cr: Criterio, conTrimestres: boolean) => {
    const nc = nota?.criterios.find(x => x.criterio_id === cr.id)
    const trimestres = trimestre != null ? [trimestre] : TRIMESTRES.filter(t => nc?.trimestres[t] != null)
    return (
      <div key={cr.id}>
        {trimestre == null && trimestres.length === 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--gris-600)' }}><strong>{cr.id}</strong> · sin ninguna nota en el curso.</p>
        )}
        {trimestres.map((t, k) => bloqueTrimestre(cr, t, trimestre != null || k === 0))}
        {conTrimestres && nc && (
          <>
            {chipsTrimestres(nc.trimestres, nc.final)}
            {trimestre == null && (
              <p data-explicacion-final style={{ fontSize: 12, color: 'var(--gris-600)', margin: '6px 0 0' }}>
                {textoFinal}
              </p>
            )}
          </>
        )}
      </div>
    )
  }

  /**
   * La nota del área: con la regla por instrumento, cada instrumento con la
   * media de sus criterios y su peso; con la regla por criterio, cada
   * criterio con su nota y su peso.
   */
  const bloqueArea = () => {
    if (!nota) return null
    const porInstrumento = nota.regla_area === 'instrumento'
    const filas = (t: number) => nota.criterios.filter(c => c.trimestres[t] != null)
    const filasInstr = (t: number) => nota.instrumentos.filter(i => i.trimestres[t] != null)
    // El peso del trimestre que se mira: con un refuerzo cambia de uno a otro.
    const pesoT = (i: NotaArea['instrumentos'][number], t: number) => i.pesos?.[t] ?? i.peso
    const pesoTotal = (t: number) => filasInstr(t).reduce((s, i) => s + pesoT(i, t), 0)
    const pct = (i: NotaArea['instrumentos'][number], t: number) => {
      const total = pesoTotal(t)
      return total > 0 ? Math.round((pesoT(i, t) / total) * 100) : 0
    }
    const listaTrimestre = (t: number) => (
      <section key={t} data-explicacion-trimestre={t} className="explicacion-bloque">
        <div className="explicacion-valor-fila">
          <span data-explicacion-valor className="explicacion-valor" style={{
            color: nota.trimestres[t] == null ? 'var(--gris-500)' : 'white',
            background: nota.trimestres[t] == null ? 'var(--gris-100)' : calificativo(nota.trimestres[t]).color,
          }}>{r1(nota.trimestres[t]) ?? '—'}</span>
          <div style={{ fontSize: 12.5 }}><strong style={{ color: 'var(--azul-900)' }}>{asig.nombre_display}</strong> · {ordinal(t)}
            <div style={{ color: 'var(--gris-600)', fontSize: 12 }}>{porInstrumento
              ? 'media de los instrumentos con nota, ponderada por su peso; cada instrumento, la media de sus criterios'
              : 'media de los criterios con nota, ponderada por su peso'}</div></div>
        </div>
        {filas(t).length === 0
          ? <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '4px 0 0' }}>Sin ninguna nota en este trimestre.</p>
          : porInstrumento ? (
            <ul className="explicacion-crudas" style={{ marginLeft: 0 }}>
              {filasInstr(t).map(i => (
                <li key={i.instrumento_id} data-explicacion-instrumento-area className="explicacion-fila">
                  <strong style={{ color: calificativo(i.trimestres[t]).color }}>{r1(i.trimestres[t])}</strong>
                  <span><b>{i.nombre}</b><span className="suave"> · {pct(i, t)} % · media de {i.criterios[t]} {i.criterios[t] === 1 ? 'criterio' : 'criterios'}</span></span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="explicacion-crudas" style={{ marginLeft: 0 }}>
              {filas(t).map(c => (
                <li key={c.criterio_id} data-explicacion-fila className="explicacion-fila">
                  <strong style={{ color: calificativo(c.trimestres[t]).color }}>{r1(c.trimestres[t])}</strong>
                  <span><b>{c.criterio_id}</b><span className="suave"> · peso {pesosCriterio.get(c.criterio_id) ?? 1}</span></span>
                </li>
              ))}
            </ul>
          )}
      </section>
    )
    const trimestres = trimestre != null ? [trimestre] : TRIMESTRES.filter(t => nota.trimestres[t] != null)
    return (
      <>
        {trimestres.map(listaTrimestre)}
        {chipsTrimestres(nota.trimestres, nota.final)}
        {trimestre == null && (
          <p data-explicacion-final style={{ fontSize: 12, color: 'var(--gris-600)', margin: '6px 0 0' }}>
            {textoFinal}
          </p>
        )}
      </>
    )
  }

  const quien = `${alumno.apellidos}, ${alumno.nombre}`
  const titulo = criterio ? `${criterio.id} · ${quien}` : instrumento ? `${instrumento.nombre} · ${quien}` : `${asig.nombre_display} · ${quien}`
  const cuando = trimestre == null ? 'Final del curso' : ordinal(trimestre)

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div role="dialog" aria-modal="true" aria-label={`De dónde sale la nota: ${titulo}`} data-explicacion-nota
        className="card" style={{ width: 'min(640px, 94vw)', maxHeight: '88vh', overflow: 'auto', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: 'var(--azul-900)', color: 'white', position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .8 }}>De dónde sale esta nota · {cuando}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{titulo}</div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '14px 18px 18px' }}>
          <p data-explicacion-regla style={{ fontSize: 12, color: 'var(--gris-600)', margin: '0 0 12px', lineHeight: 1.5, padding: '8px 10px', background: 'var(--gris-100)', borderRadius: 7 }}>
            Cada instrumento vale la <strong>media de sus unidades</strong> en el trimestre
            ({pesosUnidad ? <span data-explicacion-unidades="peso">cada unidad por el peso de la programación</span> : 'cada unidad cuenta igual'});
            después pesa cada instrumento dentro de su familia, y cada familia en el área.
          </p>
          {medidasVisibles.length > 0 && (
            <p data-explicacion-medida style={{ fontSize: 12, color: 'var(--azul-900)', margin: '0 0 12px', lineHeight: 1.5, padding: '8px 10px', background: 'var(--azul-50, #eff6ff)', borderLeft: '4px solid var(--azul-700)', borderRadius: 7 }}>
              {medidasVisibles.map(m => {
                const e = etiquetaMedida(m)
                const detalle = m.tipo === 'refuerzo'
                  ? [1, 2, 3].filter(t => instrumentosEn(t) !== instrumentos).slice(0, 1).map(t =>
                      instrumentosEn(t).filter(i => i.familia_id == null || !porId.has(i.familia_id)).map(i => `${i.nombre} ${i.peso} %`).join(' · '))[0]
                  : null
                return <span key={m.tipo} style={{ display: 'block' }}><strong>{e.texto}</strong>{detalle ? ` · ${detalle}` : ''}{m.descripcion ? ` · ${m.descripcion}` : ''}</span>
              })}
              <span style={{ display: 'block', color: 'var(--gris-600)' }}>Los pesos de abajo son los de este alumno.</span>
            </p>
          )}
          {cals == null ? (
            <p style={{ fontSize: 13, color: 'var(--gris-600)' }}>Calculando…</p>
          ) : criterio ? (
            <>
              {bloqueCriterio(criterio, true)}
              {nota && (
                <p data-explicacion-area style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '6px 0 0', paddingTop: 10, borderTop: '1px solid var(--gris-300)' }}>
                  Nota de <strong>{asig.nombre_display}</strong>{trimestre != null ? <> en el {ordinal(trimestre)}: <strong>{r1(nota.trimestres[trimestre]) ?? '—'}</strong></> : null}
                  {nota.final != null ? <> · final del curso: <strong>{r1(nota.final)}</strong></> : null}.
                </p>
              )}
            </>
          ) : instrumento ? (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '0 0 12px', lineHeight: 1.5 }}>
                La casilla es la media de lo que {alumno.nombre} tiene con <strong>{instrumento.nombre}</strong> en los
                {' '}{instrumento.criterios.length} criterio{instrumento.criterios.length !== 1 ? 's' : ''} que evalúa. Cada criterio, con lo suyo:
              </p>
              {instrumento.criterios.map(cr => bloqueCriterio(cr, false))}
            </>
          ) : bloqueArea()}

          <p style={{ fontSize: 12, color: 'var(--gris-500)', margin: '14px 0 0', lineHeight: 1.5 }}>
            En «Todo el curso» no se califica: entra en la pestaña de una unidad para cambiar o poner notas.
          </p>
        </div>
      </div>
    </div>
  )
}
