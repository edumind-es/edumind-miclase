/**
 * Corregir una prueba escrita pregunta a pregunta.
 *
 * Se anota lo que saca el alumno en cada pregunta —puntos, acierto/fallo o
 * nivel, según el tipo de examen— y la nota sale sola. Quien guarda es el
 * panel de la celda: aquí solo se decide qué respuestas hay.
 */
import { useEffect, useState } from 'react'
import {
  notaDePrueba, puntosDePregunta, ACIERTO, FALLO, EN_BLANCO,
  type PruebaDef, type PreguntaPrueba,
} from '@/db/prueba'
import { calificativo } from '@/db/calculo'

interface Props {
  def: PruebaDef
  /** Pregunta → lo anotado. Una pregunta que no está es una pregunta sin anotar. */
  respuestas: Record<string, number>
  /** Criterios en los que este examen pone nota, según la programación. */
  destinos: string[]
  criterioActual: string
  guardando: boolean
  onCambio: (respuestas: Record<string, number>) => void
}

const formato = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

export default function CorregirPrueba({ def, respuestas, destinos, criterioActual, guardando, onCambio }: Props) {
  // Lo que se está tecleando en cada casilla de puntos, antes de darlo por bueno.
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  useEffect(() => { setBorrador({}) }, [respuestas])

  const r = notaDePrueba(def, respuestas, destinos)

  const poner = (id: string, valor: number | undefined) => {
    const siguiente = { ...respuestas }
    if (valor === undefined) delete siguiente[id]; else siguiente[id] = valor
    onCambio(siguiente)
  }
  /** Volver a pulsar lo ya marcado lo desmarca, como en la rúbrica. */
  const alternar = (id: string, valor: number) => poner(id, respuestas[id] === valor ? undefined : valor)

  /** Da por bueno lo tecleado: coma o punto, y dentro de lo que vale la pregunta. */
  const confirmar = (p: PreguntaPrueba) => {
    const texto = borrador[p.id]
    if (texto === undefined) return
    const limpio = texto.trim().replace(',', '.')
    if (limpio === '') { if (respuestas[p.id] !== undefined) poner(p.id, undefined); else setBorrador({}); return }
    const n = Number(limpio)
    if (!Number.isFinite(n)) { setBorrador(b => { const { [p.id]: _fuera, ...resto } = b; return resto }); return }
    const valor = Math.round(Math.max(0, Math.min(p.max, n)) * 100) / 100
    if (valor !== respuestas[p.id]) poner(p.id, valor); else setBorrador({})
  }

  const todoBien = () => {
    const tope = Math.max(0, ...(def.escala ?? []).map(n => n.valor))
    onCambio(Object.fromEntries(def.preguntas.map(p =>
      [p.id, def.tipo === 'test' ? ACIERTO : def.tipo === 'niveles' ? tope : p.max])))
  }

  const btn = (activo: boolean, color = 'var(--azul-700)') => ({
    minWidth: 40, minHeight: 36, padding: '4px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
    border: `2px solid ${activo ? color : 'var(--gris-300)'}`,
    background: activo ? color : 'white', color: activo ? 'white' : 'var(--gris-900)',
  } as const)

  return (
    <div data-corregir-prueba style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gris-600)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
          Examen — {def.titulo}
        </div>
        <div style={{ flex: 1 }} />
        <span data-resumen-prueba style={{ fontSize: 11.5, fontWeight: 600, color: r.anotadas === r.total ? 'var(--verde-500)' : 'var(--gris-500)' }}>
          {r.anotadas} de {r.total} anotadas · {formato(r.obtenido)} / {formato(r.maximo)} puntos
        </span>
        <button onClick={todoBien} disabled={guardando}
          title="Anota todas las preguntas con la puntuación máxima; luego corriges las que no"
          style={{ background: 'none', border: 'none', color: 'var(--azul-500)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
          todo bien
        </button>
        {r.anotadas > 0 && (
          <button onClick={() => onCambio({})} disabled={guardando}
            style={{ background: 'none', border: 'none', color: 'var(--rojo-500)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
            limpiar
          </button>
        )}
      </div>

      {/* A qué criterios va la nota, y cuánto a cada uno si se reparte. */}
      <div data-destinos-prueba style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5, color: 'var(--gris-600)', marginBottom: 8 }}>
        <span>{def.reparto === 'criterios' ? 'Nota por criterio:' : 'La misma nota va a:'}</span>
        {destinos.filter(c => c in r.porCriterio).map(c => {
          const nota = r.porCriterio[c]
          return (
            <span key={c} style={{
              padding: '2px 8px', borderRadius: 999, fontWeight: 700,
              border: `1px solid ${c === criterioActual ? 'var(--azul-700)' : 'var(--gris-300)'}`,
              background: nota == null ? 'white' : calificativo(nota).color, color: nota == null ? 'var(--gris-700)' : 'white',
            }}>
              {c}{nota != null ? ` ${formato(nota)}` : ''}
            </span>
          )
        })}
      </div>
      {!(criterioActual in r.porCriterio) && (
        <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 8 }}>
          Este examen no tiene ninguna pregunta de <strong>{criterioActual}</strong>: corregirlo pone nota en los demás criterios, no en este.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {def.preguntas.map((p, i) => {
          const resp = respuestas[p.id]
          const anotada = typeof resp === 'number'
          return (
            <div key={p.id} data-pregunta={i + 1} style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              border: '1px solid var(--gris-300)', borderRadius: 9, padding: '6px 10px',
              background: anotada ? 'var(--azul-100)' : 'white',
            }}>
              <div style={{ flex: '1 1 160px', minWidth: 0, fontSize: 12.5, lineHeight: 1.35 }}>
                <strong style={{ color: 'var(--azul-900)' }}>{p.enunciado || `Pregunta ${i + 1}`}</strong>
                {def.reparto === 'criterios' && (
                  <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--gris-500)', fontWeight: 700 }}>
                    {p.criterio_id || 'todos'}
                  </span>
                )}
              </div>

              {def.tipo === 'puntos' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {/* No se desactiva mientras guarda: al pasar con el tabulador
                      a la siguiente, la casilla recién enfocada perdería el foco
                      y habría que volver a pulsar en cada pregunta. */}
                  <input inputMode="decimal"
                    value={borrador[p.id] ?? (anotada ? formato(resp) : '')}
                    onChange={e => setBorrador(b => ({ ...b, [p.id]: e.target.value }))}
                    onBlur={() => confirmar(p)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    aria-label={`Puntos en ${p.enunciado || `la pregunta ${i + 1}`}`}
                    placeholder="—"
                    style={{ width: 62, fontSize: 14, fontWeight: 700, textAlign: 'center', padding: '5px 4px' }} />
                  <span style={{ fontSize: 12, color: 'var(--gris-600)', minWidth: 34 }}>/ {formato(p.max)}</span>
                  <button style={btn(anotada && resp === p.max, 'var(--verde-500)')} disabled={guardando}
                    onClick={() => alternar(p.id, p.max)} title="Pregunta entera" aria-label={`Pregunta ${i + 1}: todos los puntos`}>✓</button>
                  <button style={btn(anotada && resp === 0, 'var(--rojo-500)')} disabled={guardando}
                    onClick={() => alternar(p.id, 0)} title="Cero puntos" aria-label={`Pregunta ${i + 1}: cero puntos`}>0</button>
                </div>
              )}

              {def.tipo === 'test' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <button style={btn(resp === ACIERTO, 'var(--verde-500)')} disabled={guardando}
                    onClick={() => alternar(p.id, ACIERTO)} aria-pressed={resp === ACIERTO} aria-label={`Pregunta ${i + 1}: acierto`}>✓ Acierto</button>
                  <button style={btn(resp === FALLO, 'var(--rojo-500)')} disabled={guardando}
                    onClick={() => alternar(p.id, FALLO)} aria-pressed={resp === FALLO} aria-label={`Pregunta ${i + 1}: fallo`}>✗ Fallo</button>
                  <button style={btn(resp === EN_BLANCO, 'var(--gris-600)')} disabled={guardando}
                    onClick={() => alternar(p.id, EN_BLANCO)} aria-pressed={resp === EN_BLANCO} aria-label={`Pregunta ${i + 1}: en blanco`}>En blanco</button>
                </div>
              )}

              {def.tipo === 'niveles' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  {(def.escala ?? []).map(n => (
                    <button key={n.nombre} style={btn(resp === n.valor)} disabled={guardando}
                      onClick={() => alternar(p.id, n.valor)} aria-pressed={resp === n.valor}
                      title={`${n.nombre}: ${formato(puntosDePregunta(def, p, n.valor))} de ${formato(p.max)} puntos`}>
                      {n.nombre}
                    </button>
                  ))}
                </div>
              )}

              {def.tipo !== 'puntos' && (
                <span style={{ fontSize: 11.5, color: 'var(--gris-600)', minWidth: 56, textAlign: 'right' }}>
                  {anotada ? formato(puntosDePregunta(def, p, resp)) : '—'} / {formato(p.max)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
