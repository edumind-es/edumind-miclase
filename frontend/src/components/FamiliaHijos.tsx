/**
 * Lo que el docente hace DENTRO de una familia de instrumentos.
 *
 * Va debajo de cada familia en ⚙ Instrumentos. Lista sus hijos —speaking,
 * listening, el examen de cada unidad, el billete de salida— con tipo, su
 * porcentaje dentro de la familia y los criterios que cubren en cada unidad
 * (siempre dentro de los de la familia). El porcentaje se escribe directo:
 * fijar uno reparte el resto entre los demás guardando su proporción
 * (`pesosAlFijarPorcentaje`), y lo guardado pasa a ser ese mismo porcentaje.
 * Luis veía «peso 1» y lo leía como 1 %. Ofrece añadir uno a mano o lanzar el asistente con las
 * plantillas del área.
 *
 * Nada de lo que hay aquí escribe notas: solo instrumentos y sus criterios.
 */
import { useEffect, useState } from 'react'
import {
  getHijos, crearInstrumentoHijo, actualizarInstrumento, eliminarInstrumento, moverInstrumento,
  criteriosDeFamiliaPorUnidad, criteriosDeHijoPorUnidad, fijarCriteriosDeHijo,
  datosDirectosDeFamilia, hayDatosDirectos, conflictosAlMover, moverDatosDeFamiliaAHijo, bloquesDirectosDeFamilia,
  getFamilias, previsualizarCambioDeFamilia, cambiarFamiliaDeHijo, usoDeInstrumento,
  type UsoDeInstrumento, type CriteriosDeFamiliaPorUnidad, type DatosDirectosDeFamilia, type BloqueDirectoConUnidad,
} from '@/db/queries'
import { describeBloque, etiquetaDia, etiquetaHora, type FiltroBloque } from '@/db/bloquesFamilia'
import type { Instrumento } from '@/db/localDb'
import { TIPOS_INSTRUMENTO, getInstrConfig, PALETA_INSTRUMENTOS, colorDeInstrumento } from '@/ia/instrumentosConfig'
import { porcentajesEnFamilia, pesosAlFijarPorcentaje } from '@/db/calculo'
import AsistenteFamilia from './AsistenteFamilia'
import ConvertirFamilia from './ConvertirFamilia'
import { describeUso } from './InstrumentosManager'

interface Props {
  familia: Instrumento
  asignaturaNombre: string
  /** Descripciones de los criterios del currículo, para el asistente y las ayudas. */
  criterios: { id: string; descripcion: string }[]
  /** Capa del asistente cuando este gestor ya va anidado. */
  capa?: string
  /** Algo ha cambiado: el gestor relee. */
  onCambio: () => void
}

export default function FamiliaHijos({ familia, asignaturaNombre, criterios, capa, onCambio }: Props) {
  const [hijos, setHijos] = useState<Instrumento[]>([])
  /** Dónde se usa cada hijo y cuánto guarda: lo que «×» tocaría. */
  const [usos, setUsos] = useState<Record<number, UsoDeInstrumento>>({})
  /** Las otras familias del área, para cambiar un hijo de familia. */
  const [familias, setFamilias] = useState<Instrumento[]>([])
  const [cobertura, setCobertura] = useState<CriteriosDeFamiliaPorUnidad[]>([])
  const [deHijo, setDeHijo] = useState<Map<number, Map<number, string[]>>>(new Map())
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: string } | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [asistente, setAsistente] = useState(false)
  /** Pendiente de decidir si lo que ya hay en la familia se convierte en un hijo. */
  const [conversion, setConversion] = useState<{ datos: DatosDirectosDeFamilia; accion: string; seguir: () => void; bloque?: FiltroBloque } | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [error, setError] = useState<string | null>(null)
  /**
   * Lo que la familia guarda a su nombre teniendo ya hijos: sin columna hasta
   * moverlo. Por bloques de unidad y día (`db/bloquesFamilia.ts`), cada uno
   * con su destino: el examen del express y las notas de otra unidad no van
   * al mismo hijo.
   */
  const [escondidos, setEscondidos] = useState<BloqueDirectoConUnidad[]>([])
  /** Destino elegido por bloque (clave `unidad|dia`): id de hijo o 'nuevo'. */
  const [destinos, setDestinos] = useState<Record<string, string>>({})
  const [moviendo, setMoviendo] = useState<string | null>(null)
  const [movido, setMovido] = useState<string | null>(null)
  const claveBloque = (b: FiltroBloque) => `${b.unidad_id ?? 'x'}|${b.dia ?? 'x'}`

  useEffect(() => {
    let vigente = true
    ;(async () => {
      const [h, cob, bloques, fams] = await Promise.all([
        getHijos(familia.id!), criteriosDeFamiliaPorUnidad(familia.id!), bloquesDirectosDeFamilia(familia.id!),
        getFamilias(familia.asignatura_id),
      ])
      const mapas = new Map<number, Map<number, string[]>>()
      for (const x of h) mapas.set(x.id!, await criteriosDeHijoPorUnidad(x.id!))
      const usosDe = Object.fromEntries(await Promise.all(h.map(async x => [x.id!, await usoDeInstrumento(x.id!)] as const)))
      if (!vigente) return
      setHijos(h); setCobertura(cob); setDeHijo(mapas); setFamilias(fams); setUsos(usosDe)
      setEscondidos(h.length > 0 ? bloques : [])
      // Destino por defecto de cada bloque: el hijo que ya cubre esa unidad
      // y alguno de sus criterios; si no, el primero. Lo elegido se respeta.
      setDestinos(prev => {
        const sig = { ...prev }
        for (const b of bloques) {
          const k = claveBloque(b)
          if (sig[k]) continue
          const sugerido = b.unidad_id != null
            ? h.find(x => (mapas.get(x.id!)?.get(b.unidad_id!) ?? []).some(c => b.criterios.includes(c)))
            : undefined
          const elegido = sugerido ?? h[0]
          if (elegido?.id != null) sig[k] = String(elegido.id)
        }
        return sig
      })
    })()
    return () => { vigente = false }
  // `familia` (el objeto, no solo su id): el gestor recarga las familias tras
  // cada cambio y así este bloque relee también cuando el cambio vino de OTRO
  // bloque, como un hijo que acaba de cambiar de familia.
  }, [familia, recarga])

  const cambiado = () => { setRecarga(n => n + 1); onCambio() }

  /**
   * Cambiar un hijo de familia. La familia la decide el docente por cómo
   * trabaja, no el tipo: un examen puede ir en el 20 % diario. Se dice qué
   * criterios tendrá que añadir la familia nueva y con qué peso entra, y
   * nada se hace sin aceptar.
   */
  const cambiarFamilia = async (h: Instrumento, familia_id: number) => {
    setError(null)
    try {
      const c = await previsualizarCambioDeFamilia(h.id!, familia_id)
      const lineas = [
        `Mover «${h.nombre}» de «${c.familia_actual.nombre}» a «${c.familia_nueva.nombre}».`,
        '',
        `Sus notas, diario, examen y rúbrica siguen siendo suyos: solo cambia con qué familia cuenta en el área (${c.familia_nueva.peso} %) y entra con el ${c.peso} % dentro de ella (el medio de sus nuevos hermanos; se puede ajustar después).`,
      ]
      if (c.anadir.length) {
        lineas.push('', `«${c.familia_nueva.nombre}» pasará a evaluar también:`)
        for (const u of c.anadir) lineas.push(`· ${u.unidad_nombre}: ${u.criterios.join(', ')}`)
      }
      if (!confirm(lineas.join('\n'))) return
      await cambiarFamiliaDeHijo(h.id!, familia_id)
      cambiado()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar de familia') }
  }
  const descripcion = (id: string) => criterios.find(c => c.id === id)?.descripcion ?? ''

  /**
   * Antes del PRIMER hijo, si la familia ya tiene notas, diario, examen o
   * rúbrica propios, se pregunta si convertirlos en un hijo (`ConvertirFamilia`).
   * Nunca se convierte solo: el docente puede seguir sin convertir.
   */
  const antesDelPrimerHijo = async (accion: string, seguir: () => void) => {
    if (hijos.length > 0) { seguir(); return }
    const datos = await datosDirectosDeFamilia(familia.id!)
    if (hayDatosDirectos(datos)) setConversion({ datos, accion, seguir })
    else seguir()
  }

  const crear = () => {
    if (!nuevo?.nombre.trim()) return
    antesDelPrimerHijo(`«${nuevo.nombre.trim()}»`, crearDeVerdad)
  }

  const crearDeVerdad = async () => {
    if (!nuevo?.nombre.trim()) return
    setError(null)
    try {
      const id = await crearInstrumentoHijo(familia.id!, { nombre: nuevo.nombre, tipo: nuevo.tipo })
      // Por defecto cubre todo lo de la familia: luego se recorta.
      for (const u of cobertura) await fijarCriteriosDeHijo(u.unidad_id, id, u.criterios)
      setNuevo(null)
      cambiado()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear') }
  }

  /**
   * Mover UN bloque (unidad y día) de lo que la familia guarda a su nombre a
   * un hijo que ya existe, o a uno nuevo con el diálogo de convertir. Si el
   * hijo ya tiene examen para la misma unidad o rúbrica propia, se pregunta
   * antes de pisar nada.
   */
  const mover = async (b: BloqueDirectoConUnidad) => {
    const k = claveBloque(b)
    const destino = destinos[k]
    const bloque: FiltroBloque = { unidad_id: b.unidad_id, dia: b.dia }
    if (destino === 'nuevo') {
      setConversion({ datos: b, accion: 'lo nuevo', seguir: () => {}, bloque })
      return
    }
    const hijo = hijos.find(h => String(h.id) === destino)
    if (!hijo) return
    setMoviendo(k); setError(null); setMovido(null)
    try {
      const choques = await conflictosAlMover(familia.id!, hijo.id!, bloque)
      let sustituir = false
      if (choques.examenes || choques.rubrica) {
        const que = [
          choques.examenes ? `${choques.examenes} examen${choques.examenes !== 1 ? 'es' : ''} para la misma unidad` : '',
          choques.rubrica ? 'rúbrica propia' : '',
        ].filter(Boolean).join(' y ')
        sustituir = confirm(`«${hijo.nombre}» ya tiene ${que}.\n\nAceptar: sustituirlo por lo de «${familia.nombre}».\nCancelar: conservar lo del hijo (lo de la familia se queda donde está).`)
      }
      const r = await moverDatosDeFamiliaAHijo(familia.id!, hijo.id!, { sustituir, bloque })
      const partes = [
        r.calificaciones ? `${r.calificaciones} nota${r.calificaciones !== 1 ? 's' : ''}` : '',
        r.diario ? `${r.diario} registro${r.diario !== 1 ? 's' : ''} del diario` : '',
        r.rubricas ? `${r.rubricas} examen${r.rubricas !== 1 ? 'es' : ''} o rúbrica` : '',
      ].filter(Boolean)
      const quedan = r.noMovidos.calificaciones + r.noMovidos.examenes + r.noMovidos.rubricas
      setMovido(`${partes.length ? `Movido a «${hijo.nombre}»: ${partes.join(', ')}.` : 'Nada que mover.'}${quedan ? ` Se quedan en la familia ${quedan} que habrían pisado lo del hijo.` : ''}`)
      cambiado()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo mover') }
    finally { setMoviendo(null) }
  }

  /**
   * Borrar un hijo es de TODA el área: el confirm lo dice con cifras. Para
   * quitarlo de una sola unidad basta con desmarcar sus criterios en ella
   * («criterios»), que es programación y no borra nada.
   */
  const borrar = async (h: Instrumento) => {
    const u = usos[h.id!] ?? await usoDeInstrumento(h.id!)
    if (!confirm([
      `Eliminar «${h.nombre}» (dentro de «${familia.nombre}») del área entera.`,
      '',
      `Se retira de TODAS las unidades (${describeUso(u)}). Las notas quedan guardadas en este aparato, pero sin columna: no se ven ni cuentan. No se puede deshacer desde la app.`,
      'Si tiene rúbrica o examen, se conserva una copia en tu banco.',
      '',
      'Si solo sobra en una unidad, cancela y desmárcale los criterios de esa unidad en «criterios»: deja de evaluarla y lo demás no cambia.',
    ].join('\n'))) return
    await eliminarInstrumento(h.id!)
    cambiado()
  }

  const alternarCriterio = async (h: Instrumento, u: CriteriosDeFamiliaPorUnidad, criterio: string) => {
    const actuales = deHijo.get(h.id!)?.get(u.unidad_id) ?? []
    const siguientes = actuales.includes(criterio) ? actuales.filter(c => c !== criterio) : [...actuales, criterio]
    setError(null)
    try {
      await fijarCriteriosDeHijo(u.unidad_id, h.id!, siguientes)
      cambiado()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar') }
  }

  const totalCriterios = (h: Instrumento) => {
    const m = deHijo.get(h.id!)
    if (!m) return 0
    const ids = new Set<string>()
    for (const lista of m.values()) for (const c of lista) ids.add(c)
    return ids.size
  }
  const totalFamilia = new Set(cobertura.flatMap(u => u.criterios)).size
  const porcentajes = porcentajesEnFamilia(hijos.map(h => h.peso))
  /** Guarda los pesos que cambian tras fijar el porcentaje de un hijo (o igualarlos). */
  const guardarPesos = async (nuevos: number[]) => {
    await Promise.all(hijos.map((h, i) => (nuevos[i] !== h.peso ? actualizarInstrumento(h.id!, { peso: nuevos[i] }) : Promise.resolve())))
    cambiado()
  }
  const fijarPorcentaje = (idx: number, pct: number) => guardarPesos(pesosAlFijarPorcentaje(hijos.map(h => h.peso), idx, pct))
  const igualar = () => guardarPesos(porcentajesEnFamilia(hijos.map(() => 1)))
  const yaIguales = porcentajes.every(v => Math.abs(v - 100 / hijos.length) < 1)

  return (
    <div data-familia-hijos data-familia-id={familia.id} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--gris-300)' }}>
      {conversion && (
        <ConvertirFamilia
          familia={familia}
          datos={conversion.datos}
          accion={conversion.accion}
          capa={capa}
          bloque={conversion.bloque}
          onSeguir={convertido => {
            const { seguir } = conversion
            setConversion(null)
            // Convertido: el hijo nuevo ya existe; el que viene entra como segundo.
            if (convertido) onCambio()
            seguir()
          }}
          onCancelar={() => setConversion(null)}
        />
      )}
      {asistente && (
        <AsistenteFamilia
          familia={familia}
          asignaturaNombre={asignaturaNombre}
          cobertura={cobertura}
          criterios={criterios}
          yaExisten={hijos.map(h => h.nombre)}
          capa={capa}
          onCerrar={creados => { setAsistente(false); if (creados) cambiado() }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: hijos.length || nuevo ? 8 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
          Dentro de esta familia
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--gris-600)' }}>
          {hijos.length === 0
            ? <>Nada todavía: se califica directamente con «{familia.nombre}».</>
            : <>{hijos.length} instrumento{hijos.length !== 1 ? 's' : ''} · se reparten el {familia.peso} % de la familia en el área: <span data-reparto-hijos>{porcentajes.map(v => `${v} %`).join(' · ')}</span>.</>}
        </span>
        <div style={{ flex: 1 }} />
        {hijos.length > 1 && !yaIguales && (
          <button data-hijos-igualar onClick={igualar} className="btn-secondary" style={{ fontSize: 11.5 }}
            title="Que todos cuenten lo mismo dentro de la familia">
            Igualar
          </button>
        )}
        {totalFamilia > 0 && (
          <button data-asistente-abrir onClick={() => antesDelPrimerHijo('lo que hagas dentro', () => setAsistente(true))} className="btn-secondary" style={{ fontSize: 11.5 }}
            title="Elegir entre lo que suele hacerse en esta área: speaking, listening, un examen por unidad, billete de salida…">
            ✨ ¿Qué haces dentro?
          </button>
        )}
        <button data-hijo-nuevo onClick={() => setNuevo({ nombre: '', tipo: 'observacion' })} className="btn-secondary" style={{ fontSize: 11.5 }}
          disabled={!!nuevo || totalFamilia === 0}
          title={totalFamilia === 0 ? 'Asigna primero esta familia a algún criterio en la programación' : 'Añadir un instrumento dentro de esta familia'}>
          + Añadir
        </button>
      </div>

      {error && <div style={{ color: 'var(--rojo-500)', fontSize: 12, marginBottom: 6 }}>{error}</div>}

      {escondidos.length > 0 && (
        <div data-familia-escondidos style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 7, fontSize: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <div style={{ lineHeight: 1.5, marginBottom: 6 }}>
            <strong>«{familia.nombre}» guarda a su nombre {describeBloque({
              calificaciones: escondidos.reduce((n, b) => n + b.calificaciones, 0),
              diario: escondidos.reduce((n, b) => n + b.diario, 0),
              examenes: escondidos.reduce((n, b) => n + b.examenes, 0),
              rubricas: escondidos.reduce((n, b) => n + b.rubricas, 0),
            })}</strong>, sin columna: con hijos dentro, la familia solo resume. Cada bloque va al instrumento que lo hizo de verdad; la fecha es la de anotación en este aparato.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {escondidos.map(b => {
              const k = claveBloque(b)
              return (
                <div key={k} data-bloque-escondido data-unidad-id={b.unidad_id ?? ''} data-dia={b.dia ?? ''}
                  style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'white', borderRadius: 6, padding: '6px 8px', border: '1px solid #fde68a' }}>
                  <span style={{ flex: '1 1 240px', lineHeight: 1.45 }}>
                    <strong data-bloque-unidad>{b.unidad_nombre ?? (b.unidad_id ? `Unidad ${b.unidad_id}` : 'Sin unidad')}</strong>
                    {' · '}
                    <span data-bloque-fecha title={b.ultima ?? ''}>{etiquetaDia(b.dia)}{b.ultima ? ` ${etiquetaHora(b.ultima)}` : ''}</span>
                    {' — '}
                    <span data-bloque-contenido>{describeBloque(b)}</span>
                    {b.criterios.length > 0 && (
                      <span style={{ color: 'var(--gris-600)' }}> · {b.criterios.join(', ')}</span>
                    )}
                  </span>
                  <select data-mover-destino value={destinos[k] ?? ''} onChange={e => setDestinos(d => ({ ...d, [k]: e.target.value }))} style={{ fontSize: 12 }} disabled={moviendo != null}>
                    {hijos.map(h => <option key={h.id} value={String(h.id)}>{h.nombre}</option>)}
                    <option value="nuevo">Un instrumento nuevo…</option>
                  </select>
                  <button data-mover-aceptar className="btn-primary" style={{ fontSize: 12 }} onClick={() => mover(b)} disabled={moviendo != null || !destinos[k]}>
                    {moviendo === k ? 'Moviendo…' : 'Mover'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {movido && <div data-mover-resultado style={{ fontSize: 12, color: 'var(--verde-500)', fontWeight: 600, marginBottom: 6 }}>{movido}</div>}

      {hijos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {hijos.map((h, idx) => {
            const cfg = getInstrConfig(h.tipo)
            const color = colorDeInstrumento(h, idx)
            const n = totalCriterios(h)
            const abierto = editando === h.id
            const pct = porcentajes[idx]
            return (
              <div key={h.id} data-hijo data-nombre={h.nombre} style={{ background: 'white', border: `1px solid ${color}40`, borderLeft: `4px solid ${color}`, borderRadius: 8, padding: '6px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button onClick={() => moverInstrumento(h.asignatura_id, h.id!, -1).then(cambiado)} disabled={idx === 0} aria-label="Subir"
                      style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 10, padding: 0, opacity: idx === 0 ? .3 : 1, lineHeight: 1.1 }}>▲</button>
                    <button onClick={() => moverInstrumento(h.asignatura_id, h.id!, 1).then(cambiado)} disabled={idx === hijos.length - 1} aria-label="Bajar"
                      style={{ background: 'none', border: 'none', cursor: idx === hijos.length - 1 ? 'default' : 'pointer', fontSize: 10, padding: 0, opacity: idx === hijos.length - 1 ? .3 : 1, lineHeight: 1.1 }}>▼</button>
                  </div>
                  {/* Color de identidad: es lo que la docente distingue en la matriz. */}
                  <div data-color-hijo style={{ display: 'flex', gap: 3 }} title="Color con el que se ve en el calificador">
                    {PALETA_INSTRUMENTOS.map(c => (
                      <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c}
                        onClick={() => actualizarInstrumento(h.id!, { color: c }).then(cambiado)}
                        style={{ width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
                          border: `2px solid ${color === c ? 'var(--gris-900)' : 'transparent'}` }} />
                    ))}
                  </div>
                  <span aria-hidden="true" style={{ fontSize: 15 }}>{cfg.icon}</span>
                  <input defaultValue={h.nombre} aria-label="Nombre"
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== h.nombre) actualizarInstrumento(h.id!, { nombre: v }).then(cambiado) }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    style={{ flex: '1 1 220px', fontSize: 12.5, fontWeight: 600, padding: '4px 7px', minWidth: 160 }} />
                  <select value={h.tipo} aria-label="Tipo" onChange={e => actualizarInstrumento(h.id!, { tipo: e.target.value }).then(cambiado)} style={{ fontSize: 11.5, padding: '4px 5px' }}>
                    {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                  {familias.length > 1 && (
                    <select data-hijo-familia value={String(familia.id)} aria-label="Familia"
                      title="En qué familia cuenta este instrumento. Lo decides tú por cómo trabajas, no el tipo: un examen puede ir en el 20 % diario."
                      onChange={e => { const id = Number(e.target.value); if (id !== familia.id) cambiarFamilia(h, id) }}
                      style={{ fontSize: 11.5, padding: '4px 5px', maxWidth: 170 }}>
                      {familias.map(f => <option key={f.id} value={String(f.id)}>{f.nombre} · {f.peso} %</option>)}
                    </select>
                  )}
                  <label title={`Cuánto cuenta dentro de «${familia.nombre}». Al cambiarlo, los demás se reparten el resto guardando su proporción.`}
                    style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--gris-600)', fontWeight: 600 }}>
                    <input type="number" min={1} max={100} key={`${h.id}-${pct}`} defaultValue={pct} data-peso-hijo
                      aria-label={`Porcentaje de «${h.nombre}» dentro de «${familia.nombre}»`}
                      onBlur={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 1 && Math.round(v) !== pct) fijarPorcentaje(idx, v) }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      style={{ width: 46, fontSize: 12, fontWeight: 700, textAlign: 'center', padding: '4px 2px' }} />
                    <span style={{ fontWeight: 600 }}>%</span>
                    <span style={{ fontWeight: 500 }} title="De la nota del área">· {Math.round((familia.peso * pct) / 100 * 10) / 10} % del área</span>
                  </label>
                  <button data-hijo-criterios onClick={() => setEditando(abierto ? null : h.id!)} aria-expanded={abierto}
                    title="Qué criterios de la familia evalúa este instrumento, unidad por unidad"
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 6, cursor: 'pointer', background: n === 0 ? '#fffbeb' : 'white', color: n === 0 ? '#92400e' : 'var(--gris-600)', border: `1px solid ${n === 0 ? '#fde68a' : 'var(--gris-300)'}` }}>
                    {n} de {totalFamilia} criterios {abierto ? '▴' : '▾'}
                  </button>
                  {usos[h.id!] && (
                    <span data-uso-hijo style={{ fontSize: 10.5, color: 'var(--gris-500)' }}
                      title={usos[h.id!].unidades.filter(u => u.criterios > 0).map(u => `${u.nombre}: ${u.calificaciones} notas`).join('\n') || 'Sin unidad'}>
                      {describeUso(usos[h.id!])}
                    </span>
                  )}
                  <button onClick={() => borrar(h)} title="Eliminar de toda el área" aria-label="Eliminar"
                    style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>×</button>
                </div>

                {abierto && (
                  <div data-hijo-criterios-lista style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cobertura.map(u => {
                      const marcados = deHijo.get(h.id!)?.get(u.unidad_id) ?? []
                      return (
                        <div key={u.unidad_id} style={{ fontSize: 12 }}>
                          <div style={{ fontWeight: 700, color: 'var(--azul-900)', marginBottom: 3 }}>
                            {u.nombre} {u.trimestre ? <span style={{ fontWeight: 500, color: 'var(--gris-500)' }}>T{u.trimestre}</span> : null}
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {u.criterios.map(c => {
                              const activo = marcados.includes(c)
                              return (
                                <button key={c} type="button" aria-pressed={activo} title={descripcion(c)}
                                  onClick={() => alternarCriterio(h, u, c)}
                                  style={{
                                    fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 14, cursor: 'pointer',
                                    border: `1.5px solid ${activo ? color : 'var(--gris-300)'}`,
                                    background: activo ? color : 'white', color: activo ? 'white' : 'var(--gris-600)',
                                  }}>{c}</button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {nuevo && (
        <div data-hijo-form style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--gris-100)', borderRadius: 8, padding: 8 }}>
          <input value={nuevo.nombre} autoFocus placeholder="Nombre (Speaking, Cuaderno, Examen tema 3…)" aria-label="Nombre del nuevo instrumento"
            onChange={e => setNuevo(n => n && ({ ...n, nombre: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') crear(); if (e.key === 'Escape') setNuevo(null) }}
            style={{ flex: '1 1 180px', fontSize: 12.5 }} />
          <select value={nuevo.tipo} onChange={e => setNuevo(n => n && ({ ...n, tipo: e.target.value }))} style={{ fontSize: 11.5 }}>
            {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
          <button data-hijo-crear className="btn-primary" style={{ fontSize: 12 }} onClick={crear} disabled={!nuevo.nombre.trim()}>Crear</button>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setNuevo(null)}>Cancelar</button>
          <div style={{ flexBasis: '100%', fontSize: 11, color: 'var(--gris-600)' }}>
            Empieza cubriendo todos los criterios de la familia; después recórtalos con «criterios».
          </div>
        </div>
      )}
    </div>
  )
}
