/**
 * Refuerzo educativo de un alumno en un área: otros porcentajes de
 * instrumento para él, instrumentos que no cuentan e instrumentos propios.
 *
 * No toca la programación de la clase: escribe `Medida.pesos_json`
 * (instrumento → peso; 0 = no cuenta) y los trimestres en los que aplica.
 * Los porcentajes se enseñan y se editan como en el gestor
 * (`porcentajesEnFamilia`, `pesosAlFijarPorcentaje`); el cálculo normaliza
 * por la suma, así que no sumar 100 no rompe nada, pero se avisa.
 * Un instrumento propio (`crearInstrumentoPropio`) es un instrumento normal
 * del área marcado `solo_medidas`: para el resto de la clase pesa 0.
 */
import { useEffect, useState } from 'react'
import type { Alumno, Asignatura, Instrumento, Medida } from '@/db/localDb'
import { getInstrumentos, guardarMedida, eliminarMedida, crearInstrumentoPropio } from '@/db/queries'
import { porcentajesEnFamilia, pesosAlFijarPorcentaje } from '@/db/calculo'
import { parsearPesos, trimestresDeMedida } from '@/db/medidas'
import { TIPOS_INSTRUMENTO, getInstrConfig } from '@/ia/instrumentosConfig'

type Props = {
  alumno: Alumno
  asignatura: Asignatura
  medida: Medida | null
  onCambio: () => void
}

const ORDINAL: Record<number, string> = { 1: '1T', 2: '2T', 3: '3T' }

export default function MedidaRefuerzo({ alumno, asignatura, medida, onCambio }: Props) {
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  const [pesos, setPesos] = useState<Map<number, number>>(new Map())
  const [trimestres, setTrimestres] = useState<number[]>([1, 2, 3])
  const [descripcion, setDescripcion] = useState('')
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: string; familia_id: number | null; en_lugar_de: number | null } | null>(null)
  const [estado, setEstado] = useState('')

  const cargar = () => getInstrumentos(asignatura.id!).then(setInstrumentos)
  useEffect(() => { cargar() }, [asignatura.id])
  useEffect(() => {
    setPesos(parsearPesos(medida))
    setTrimestres(medida ? trimestresDeMedida(medida) : [1, 2, 3])
    setDescripcion(medida?.descripcion ?? '')
  }, [medida?.id, medida?.updated_at])

  const familias = instrumentos.filter(i => i.familia_id == null || !instrumentos.some(x => x.id === i.familia_id))
  const hijosDe = (f: Instrumento) => instrumentos.filter(i => i.familia_id === f.id)
  /** El peso que vale para el alumno: el fijado, o el de la clase (0 si es solo para medidas y no está incluido). */
  const pesoDe = (i: Instrumento) => pesos.has(i.id!) ? pesos.get(i.id!)! : i.solo_medidas ? 0 : i.peso

  const guardar = async (cambios: Partial<Medida>) => {
    await guardarMedida({ alumno_id: alumno.id!, asignatura_id: asignatura.id!, tipo: 'refuerzo', ...cambios })
    setEstado('Guardado')
    onCambio()
  }
  const pesosJson = (m: Map<number, number>) => JSON.stringify(Object.fromEntries([...m.entries()].map(([k, v]) => [String(k), v])))

  const activar = async () => {
    // Arranca con los pesos de la clase, para que el docente vea lo que cambia.
    const m = new Map<number, number>()
    for (const i of instrumentos) if (!i.solo_medidas) m.set(i.id!, i.peso)
    setPesos(m)
    await guardar({ pesos_json: pesosJson(m), trimestres: JSON.stringify(trimestres) })
  }

  /** Porcentajes entre los que cuentan (los excluidos a 0), sumando 100. */
  const repartoEntre = (lista: Instrumento[], m: Map<number, number> = pesos): Map<number, number> => {
    const valor = (i: Instrumento) => m.has(i.id!) ? m.get(i.id!)! : i.solo_medidas ? 0 : i.peso
    const cuentan = lista.filter(i => valor(i) > 0)
    const pct = porcentajesEnFamilia(cuentan.map(i => valor(i)))
    const out = new Map<number, number>()
    lista.forEach(i => out.set(i.id!, 0))
    cuentan.forEach((i, k) => out.set(i.id!, pct[k]))
    return out
  }

  /**
   * Excluir o volver a incluir: el peso del excluido pasa a los demás de su
   * nivel (familias entre sí, hermanos dentro de la familia), guardando su
   * proporción, para que lo guardado sean porcentajes y sumen 100.
   */
  const alternarExclusion = async (i: Instrumento, excluir: boolean, nivel: Instrumento[]) => {
    const m = new Map(pesos)
    m.set(i.id!, excluir ? 0 : Math.max(1, i.solo_medidas ? 10 : i.peso))
    for (const [id, pct] of repartoEntre(nivel, m)) m.set(id, pct)
    setPesos(m)
    await guardar({ pesos_json: pesosJson(m) })
  }

  /** Fijar el porcentaje de una familia reparte el resto entre las demás, como en el gestor. */
  const fijarFamiliaPct = async (f: Instrumento, pct: number) => {
    const activas = familias.filter(x => pesoDe(x) > 0 || x.id === f.id)
    const idx = activas.findIndex(x => x.id === f.id)
    const nuevos = pesosAlFijarPorcentaje(activas.map(x => pesoDe(x)), idx, Math.max(0, Math.min(100, pct)))
    const m = new Map(pesos)
    activas.forEach((x, k) => m.set(x.id!, nuevos[k]))
    setPesos(m)
    await guardar({ pesos_json: pesosJson(m) })
  }

  const fijarHijoPct = async (f: Instrumento, h: Instrumento, pct: number) => {
    const hermanos = hijosDe(f).filter(x => pesoDe(x) > 0 || x.id === h.id)
    const idx = hermanos.findIndex(x => x.id === h.id)
    const nuevos = pesosAlFijarPorcentaje(hermanos.map(x => pesoDe(x)), idx, Math.max(0, Math.min(100, pct)))
    const m = new Map(pesos)
    hermanos.forEach((x, k) => m.set(x.id!, nuevos[k]))
    setPesos(m)
    await guardar({ pesos_json: pesosJson(m) })
  }

  const cambiarTrimestres = async (t: number, marcado: boolean) => {
    const lista = [1, 2, 3].filter(x => x === t ? marcado : trimestres.includes(x))
    if (!lista.length) return
    setTrimestres(lista)
    if (medida) await guardar({ trimestres: JSON.stringify(lista) })
  }

  const quitar = async () => {
    if (!medida) return
    if (!window.confirm(`¿Quitar el refuerzo de ${alumno.nombre} en ${asignatura.nombre_display}?\n\nSus notas no cambian: vuelve a contar con los porcentajes de la clase.`)) return
    await eliminarMedida(medida.id!)
    setPesos(new Map())
    setEstado('Refuerzo retirado')
    onCambio()
  }

  const crearPropio = async () => {
    if (!nuevo?.nombre.trim()) return
    const id = await crearInstrumentoPropio(asignatura.id!, nuevo)
    await cargar()
    const m = new Map(pesos)
    const sustituido = nuevo.en_lugar_de != null ? instrumentos.find(i => i.id === nuevo.en_lugar_de) : undefined
    // Entra con el peso del sustituido (que deja de contar) o con el medio de sus hermanos.
    if (sustituido) { m.set(id, pesoDe(sustituido)); m.set(sustituido.id!, 0) }
    else if (nuevo.familia_id != null) m.set(id, 1)
    else m.set(id, 10)
    setPesos(m)
    setNuevo(null)
    await guardar({ pesos_json: pesosJson(m), trimestres: JSON.stringify(trimestres) })
  }

  // Solo cuentan las familias no excluidas: el total y los porcentajes son entre ellas.
  const totalFamilias = familias.filter(f => pesoDe(f) > 0).reduce((s, f) => s + pesoDe(f), 0)
  const pctFamilias = repartoEntre(familias)

  const filaPeso = (i: Instrumento, pct: number, onPct: (v: number) => void, dentro: boolean) => {
    const cfg = getInstrConfig(i.tipo)
    const cuenta = pesoDe(i) > 0
    return (
      <div key={i.id} data-refuerzo-instrumento={i.id} data-cuenta={cuenta ? '' : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', marginLeft: dentro ? 22 : 0, fontSize: 13, opacity: cuenta ? 1 : .6 }}>
        <span aria-hidden="true">{cfg.icon}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {i.nombre}
          {i.solo_medidas ? <span style={{ fontSize: 10.5, color: 'var(--azul-700)', marginLeft: 6 }}>propio</span> : null}
          {!dentro && !i.solo_medidas && i.peso !== pesoDe(i) && <span style={{ fontSize: 11, color: 'var(--gris-500)', marginLeft: 6 }}>clase: {i.peso} %</span>}
        </span>
        <input type="number" min={0} max={100} value={cuenta ? pct : 0} disabled={!cuenta} data-refuerzo-pct
          onChange={e => onPct(Number(e.target.value) || 0)}
          style={{ width: 62, fontSize: 13, textAlign: 'center' }} aria-label={`Porcentaje de ${i.nombre}`} />
        <span style={{ fontSize: 12, color: 'var(--gris-600)' }}>%{dentro ? ' del instrumento' : ''}</span>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={!cuenta} data-refuerzo-excluir
            onChange={e => alternarExclusion(i, e.target.checked, dentro ? hijosDe(instrumentos.find(x => x.id === i.familia_id)!) : familias)} />
          No cuenta
        </label>
      </div>
    )
  }

  return (
    <div data-medida-refuerzo data-activa={medida ? '' : undefined} style={{ display: 'grid', gap: 10 }}>
      {!medida ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--gris-600)' }}>Sin refuerzo: cuenta con los porcentajes de la clase.</span>
          <button type="button" className="btn-secondary" style={{ fontSize: 13 }} onClick={activar} data-refuerzo-activar disabled={!instrumentos.length}>
            Activar refuerzo
          </button>
          {!instrumentos.length && <span style={{ fontSize: 12, color: 'var(--ambar-600, #b45309)' }}>El área aún no tiene instrumentos.</span>}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Aplica en</span>
            {[1, 2, 3].map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={trimestres.includes(t)} data-refuerzo-trimestre={t}
                  onChange={e => cambiarTrimestres(t, e.target.checked)} /> {ORDINAL[t]}
              </label>
            ))}
            <span style={{ fontSize: 12, color: 'var(--gris-600)' }}>Fuera de esos trimestres cuenta como el resto.</span>
          </div>

          <div>
            {familias.map(f => (
              <div key={f.id} style={{ borderTop: '1px solid var(--gris-200, #e5e7eb)' }}>
                {filaPeso(f, pctFamilias.get(f.id!) ?? 0, v => fijarFamiliaPct(f, v), false)}
                {hijosDe(f).length > 0 && (() => {
                  const hs = hijosDe(f)
                  const pcts = repartoEntre(hs)
                  return hs.map(h => filaPeso(h, pcts.get(h.id!) ?? 0, v => fijarHijoPct(f, h, v), true))
                })()}
              </div>
            ))}
            <p data-refuerzo-total style={{ fontSize: 12, margin: '6px 0 0', color: totalFamilias === 100 ? 'var(--gris-600)' : 'var(--ambar-600, #b45309)' }}>
              {totalFamilias === 100 ? 'Los instrumentos suman 100.' : `Los instrumentos suman ${totalFamilias}. El cálculo reparte proporcionalmente; conviene que sumen 100 para leerlos como porcentajes.`}
            </p>
          </div>

          {nuevo ? (
            <div data-refuerzo-nuevo style={{ background: 'var(--gris-100)', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Instrumento propio de este alumno</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={nuevo.nombre} autoFocus placeholder="Nombre (p. ej. Prueba oral) *" data-propio-nombre
                  onChange={e => setNuevo(n => n && ({ ...n, nombre: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') crearPropio() }}
                  style={{ flex: '1 1 160px', fontSize: 13 }} />
                <select value={nuevo.tipo} onChange={e => setNuevo(n => n && ({ ...n, tipo: e.target.value }))} style={{ fontSize: 12 }} aria-label="Tipo">
                  {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Dentro de
                  <select value={nuevo.familia_id ?? ''} data-propio-familia
                    onChange={e => setNuevo(n => n && ({ ...n, familia_id: e.target.value ? Number(e.target.value) : null, en_lugar_de: null }))} style={{ fontSize: 12 }}>
                    <option value="">— ningún instrumento (suelta) —</option>
                    {familias.filter(f => !f.solo_medidas).map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  En lugar de
                  <select value={nuevo.en_lugar_de ?? ''} data-propio-sustituye
                    onChange={e => setNuevo(n => n && ({ ...n, en_lugar_de: e.target.value ? Number(e.target.value) : null }))} style={{ fontSize: 12 }}>
                    <option value="">— nada: se suma a los demás —</option>
                    {(nuevo.familia_id != null ? instrumentos.filter(i => i.familia_id === nuevo.familia_id) : familias)
                      .filter(i => !i.solo_medidas).map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                  </select>
                </label>
              </div>
              <p style={{ fontSize: 12, color: 'var(--gris-600)', margin: 0 }}>
                Evaluará en cada unidad los criterios del instrumento al que sustituye (o los de su familia). Para el resto de la clase no cuenta ni sale.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-primary" style={{ fontSize: 12 }} onClick={crearPropio} disabled={!nuevo.nombre.trim()} data-propio-crear>Crear</button>
                <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setNuevo(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn-secondary" style={{ fontSize: 12.5 }} data-refuerzo-propio
                onClick={() => setNuevo({ nombre: '', tipo: 'oral', familia_id: null, en_lugar_de: null })}>
                + Instrumento propio
              </button>
              <button type="button" style={{ fontSize: 12.5, background: 'none', border: 'none', color: 'var(--rojo-500, #b91c1c)', cursor: 'pointer', fontWeight: 600 }} onClick={quitar} data-refuerzo-quitar>
                Quitar refuerzo
              </button>
            </div>
          )}

          <label style={{ fontSize: 12.5, display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Nota del docente (opcional)</span>
            <textarea rows={2} value={descripcion} data-refuerzo-descripcion
              onChange={e => setDescripcion(e.target.value)}
              onBlur={() => { if ((medida?.descripcion ?? '') !== descripcion) guardar({ descripcion: descripcion.trim() || null }) }}
              style={{ width: '100%', fontSize: 13 }} />
          </label>
        </>
      )}
      {estado && <div role="status" style={{ fontSize: 12, color: 'var(--gris-600)' }}>{estado}</div>}
    </div>
  )
}
