/**
 * La ficha de una actividad (o de un instrumento), abierta desde donde se
 * califica: una hoja que sube desde abajo con lo que el docente quiere tocar
 * sin salir de la pasada de clase —nombre, tipo, con qué se evalúa y cómo se
 * funden varios registros— y lo que conviene tener a la vista: cuánto pesa y
 * qué criterios evalúa en la unidad.
 *
 * Luis: en «Evaluar hoy» editar el instrumento costaba, escondido en un
 * desplegable pequeño. `BotonEditarActividad` pone un «Editar» de 44 px en la
 * cabecera de cada pantalla de calificar y abre esta ficha.
 *
 * No guarda nada por su cuenta: nombre, tipo y agregación van por
 * `actualizarInstrumento`; la rúbrica, por el `RubricaEditor` de siempre. El
 * peso y los criterios se enseñan, y se cambian donde ya se cambiaban («Qué
 * evalúo» y el «Más» de la columna).
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { actualizarInstrumento, type CeldaInstrumento, type DatosDeArea } from '@/db/queries'
import RubricaEditor from './RubricaEditor'
import { BotonesHerramienta, esDeObservacion } from './ElegirHerramienta'
import type { HerramientaSimple } from '@/ia/rubricaPlantillas'
import { AGREGACIONES } from '@/db/diario'
import type { Agregacion } from '@/db/localDb'
import { TIPOS_INSTRUMENTO, abreviatura } from '@/ia/instrumentosConfig'

interface Props {
  instrumento: CeldaInstrumento
  /** Los criterios que evalúa en la unidad que se mira. */
  criterios: { id: string; descripcion: string }[]
  unidadNombre?: string
  area: DatosDeArea
  /** Se ha guardado algo del instrumento: quien abre tiene que releer. */
  onCambio: () => void
  /** Ha cambiado la herramienta (rúbrica): la pasada puede ser otra. Si no se da, se llama a `onCambio`. */
  onHerramienta?: () => void
  /** Definir o editar el examen, si quien abre sabe dónde. */
  onExamen?: () => void
}

const campo = { minHeight: 44, fontSize: 15, padding: '6px 10px', width: '100%' } as const
const rotulo = { fontSize: 12, fontWeight: 700, color: 'var(--gris-600)', display: 'block', marginBottom: 4 } as const

export default function FichaActividad({ instrumento, criterios, unidadNombre, area, onCambio, onHerramienta, onExamen, onCerrar }: Props & { onCerrar: () => void }) {
  const [nombre, setNombre] = useState(instrumento.nombre)
  const [tipo, setTipo] = useState(instrumento.tipo)
  const [agregacion, setAgregacion] = useState<Agregacion>(instrumento.agregacion ?? 'media')
  const [editor, setEditor] = useState<{ inicio?: HerramientaSimple } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const esActividad = instrumento.familia_id != null

  const guardar = async (campos: Parameters<typeof actualizarInstrumento>[1], dicho: string) => {
    try { await actualizarInstrumento(instrumento.instrumento_id, campos); setAviso(dicho); onCambio() }
    catch (e) { setAviso(`No se pudo guardar: ${(e as Error).message}`) }
  }
  const guardarNombre = () => {
    const limpio = nombre.trim()
    if (!limpio) { setNombre(instrumento.nombre); return }
    if (limpio !== instrumento.nombre) void guardar({ nombre: limpio }, 'Nombre guardado.')
  }

  if (editor) {
    return (
      <RubricaEditor
        inicio={editor.inicio}
        instrumentoId={instrumento.instrumento_id}
        instrumentoNombre={nombre.trim() || instrumento.nombre}
        asignaturaNombre={area.asignatura}
        nivel={`${area.curso}º ${area.etapa}`}
        capa="var(--z-modal)"
        onCerrar={() => { setEditor(null); (onHerramienta ?? onCambio)(); onCerrar() }}
      />
    )
  }

  const herramienta = instrumento.tiene_prueba ? 'examen'
    : instrumento.tiene_rubrica ? 'rubrica'
    : esDeObservacion(tipo) ? 'diario' : 'ninguna'

  return createPortal(
    <div className="modal-overlay hoja-velo" onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="hoja-columna" role="dialog" aria-modal="true" aria-label={`Editar «${instrumento.nombre}»`}
        data-ficha-actividad style={{ borderTop: `6px solid ${instrumento.color}`, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="hoja-cabecera">
          <div className="hoja-titulo">
            <span className="abrev" style={{ background: instrumento.color }}>{abreviatura(nombre || instrumento.nombre)}</span>
            Editar {esActividad ? 'la actividad' : 'el instrumento'}
          </div>
          <button type="button" className="modal-close" data-ficha-cerrar aria-label="Cerrar" onClick={onCerrar}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 10 }}>
          <label>
            <span style={rotulo}>Nombre</span>
            <input data-ficha-nombre value={nombre} onChange={e => setNombre(e.target.value)} onBlur={guardarNombre}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} style={campo} />
          </label>
          <label>
            <span style={rotulo}>Tipo</span>
            <select data-ficha-tipo value={tipo} style={campo}
              onChange={e => { setTipo(e.target.value); void guardar({ tipo: e.target.value }, 'Tipo guardado.') }}>
              {TIPOS_INSTRUMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        </div>

        <div data-ficha-peso style={{ marginTop: 12, fontSize: 13.5, color: 'var(--gris-700)' }}>
          <span style={rotulo}>Cuánto pesa</span>
          {esActividad
            ? <>{instrumento.pct_familia != null ? <><strong>{instrumento.pct_familia} %</strong> dentro de </> : 'Dentro de '}«{instrumento.familia_nombre}», que vale el <strong>{instrumento.familia_peso} %</strong> del área.</>
            : <><strong>{instrumento.peso} %</strong> del área.</>}
          <span style={{ color: 'var(--gris-600)' }}> Se cambia en «Qué evalúo».</span>
        </div>

        <div data-ficha-herramienta={herramienta} style={{ marginTop: 14 }}>
          <span style={rotulo}>Con qué se evalúa</span>
          {herramienta === 'examen' && (
            <div style={{ fontSize: 13.5 }}>
              Con un <strong>examen</strong>{instrumento.prueba_de_unidad ? ` (el de «${instrumento.prueba_de_unidad}»)` : ''}: se corrige pregunta a pregunta.{' '}
              {onExamen && <button type="button" className="btn-secondary" data-ficha-examen onClick={() => { onExamen(); onCerrar() }} style={{ minHeight: 44, fontSize: 14, marginTop: 6 }}>Editar el examen</button>}
            </div>
          )}
          {herramienta === 'rubrica' && (
            <div style={{ fontSize: 13.5 }}>
              Con su <strong>rúbrica</strong> (o lista de control o escala).
              <div><button type="button" className="btn-primary" data-ficha-rubrica onClick={() => setEditor({})} style={{ minHeight: 44, fontSize: 14, marginTop: 6 }}>Editar la rúbrica</button></div>
            </div>
          )}
          {(herramienta === 'diario' || herramienta === 'ninguna') && (
            <div style={{ fontSize: 13.5 }}>
              <div style={{ marginBottom: 8 }}>
                {herramienta === 'diario'
                  ? <>Con el <strong>diario de observación</strong>: cuatro niveles por registro. Si prefieres otra herramienta, elígela:</>
                  : <>Todavía <strong>sin herramienta</strong>: nota directa. Elige una y se usará cada vez que califiques con ella:</>}
              </div>
              <BotonesHerramienta tipo={tipo} onRubrica={inicio => setEditor({ inicio })} onExamen={onExamen ? () => { onExamen(); onCerrar() } : undefined} />
            </div>
          )}
        </div>

        {!instrumento.tiene_prueba && !instrumento.tiene_rubrica && (
          <label style={{ display: 'block', marginTop: 14 }}>
            <span style={rotulo}>Si un alumno tiene varios registros del diario, su nota es</span>
            <select data-ficha-agregacion value={agregacion} style={{ ...campo, maxWidth: 320 }}
              onChange={e => { const a = e.target.value as Agregacion; setAgregacion(a); void guardar({ agregacion: a }, 'Regla guardada: las notas del diario se han recalculado.') }}>
              {AGREGACIONES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
        )}

        <div data-ficha-criterios style={{ marginTop: 14, fontSize: 13.5 }}>
          <span style={rotulo}>Criterios que evalúa{unidadNombre ? ` en ${unidadNombre}` : ''} ({criterios.length})</span>
          {criterios.length === 0
            ? <span style={{ color: 'var(--gris-600)' }}>Ninguno todavía.</span>
            : criterios.map(c => <span key={c.id} title={c.descripcion} style={{ display: 'inline-block', fontWeight: 700, color: 'var(--azul-700)', background: 'var(--gris-100)', border: '1px solid var(--gris-300)', padding: '3px 9px', margin: '0 6px 6px 0' }}>{c.id}</span>)}
          <div style={{ color: 'var(--gris-600)', fontSize: 12.5 }}>Se añaden o quitan en el «Más» de su columna.</div>
        </div>

        {aviso && <div data-ficha-aviso role="status" style={{ marginTop: 12, fontSize: 13, color: '#166534', background: '#dcfce7', padding: '8px 10px' }}>{aviso}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn-primary" data-ficha-hecho onClick={onCerrar} style={{ minHeight: 44, fontSize: 14 }}>Hecho</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** El «Editar» de la cabecera de una pantalla de calificar, con su ficha. */
export function BotonEditarActividad(props: Props) {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <button type="button" className="btn-secondary" data-editar-actividad onClick={() => setAbierta(true)}
        // El nombre accesible es «Editar» a secas: con el del instrumento se confundía
        // con la pastilla que lo elige en el panel. El instrumento va en la descripción.
        title={`Editar «${props.instrumento.nombre}»: nombre, tipo y con qué se evalúa`}
        style={{ minHeight: 44, fontSize: 14, whiteSpace: 'nowrap' }}>
        Editar
      </button>
      {abierta && <FichaActividad {...props} onCerrar={() => setAbierta(false)} />}
    </>
  )
}
