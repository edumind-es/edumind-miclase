/**
 * Plano de clase del grupo: cuadrícula de asientos táctil.
 * - Modo edición: toca un asiento vacío y elige alumno; toca uno ocupado para liberarlo.
 * - Modo normal: tocar un alumno abre su panel de evaluación rápida.
 * Complementa los QR de mesa: mismo destino (/escanear), dos caminos.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPlano, redimensionarPlano, asignarAsiento, quitarAsiento } from '@/db/queries'
import type { Alumno, Asiento } from '@/db/localDb'

interface Props {
  grupoId: number
  alumnos: Alumno[]
  modoAnon: boolean
}

export default function PlanoClase({ grupoId, alumnos, modoAnon }: Props) {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [filas, setFilas] = useState(5)
  const [cols, setCols] = useState(6)
  const [asientos, setAsientos] = useState<Asiento[]>([])
  const [editando, setEditando] = useState(false)
  const [celdaSel, setCeldaSel] = useState<{ fila: number; col: number } | null>(null)

  const cargar = async () => {
    const { plano, asientos } = await getPlano(grupoId)
    setFilas(plano.filas)
    setCols(plano.cols)
    setAsientos(asientos)
  }

  useEffect(() => { if (visible) cargar() }, [visible, grupoId])

  const alumnoEn = (fila: number, col: number): Alumno | undefined => {
    const asiento = asientos.find(a => a.fila === fila && a.col === col)
    return asiento ? alumnos.find(al => al.id === asiento.alumno_id) : undefined
  }

  const sinAsiento = alumnos.filter(al => !asientos.some(a => a.alumno_id === al.id))

  const tocarCelda = async (fila: number, col: number) => {
    const ocupante = alumnoEn(fila, col)
    if (!editando) {
      if (ocupante) navigate(`/escanear?alumno=${ocupante.id}`)
      return
    }
    if (ocupante) {
      await quitarAsiento(grupoId, ocupante.id!)
      await cargar()
    } else {
      setCeldaSel({ fila, col })
    }
  }

  const sentarAlumno = async (alumnoId: number) => {
    if (!celdaSel) return
    await asignarAsiento(grupoId, alumnoId, celdaSel.fila, celdaSel.col)
    setCeldaSel(null)
    await cargar()
  }

  const cambiarTamano = async (f: number, c: number) => {
    const nf = Math.min(10, Math.max(2, f))
    const nc = Math.min(10, Math.max(2, c))
    await redimensionarPlano(grupoId, nf, nc)
    await cargar()
  }

  const etiqueta = (al: Alumno) =>
    modoAnon ? (al.codigo_cifrado || '—') : `${al.nombre} ${al.apellidos.split(' ')[0]?.[0] || ''}.`

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>🪑 Plano de clase</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {visible && (
            <>
              <button className={editando ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 13 }}
                onClick={() => { setEditando(e => !e); setCeldaSel(null) }}>
                {editando ? '✓ Terminar edición' : '✏️ Editar asientos'}
              </button>
              {editando && (
                <span style={{ fontSize: 12, color: 'var(--gris-600)' }}>
                  {filas}×{cols}
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 8px', marginLeft: 6 }} onClick={() => cambiarTamano(filas, cols + 1)}>+col</button>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 8px', marginLeft: 4 }} onClick={() => cambiarTamano(filas, cols - 1)}>−col</button>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 8px', marginLeft: 4 }} onClick={() => cambiarTamano(filas + 1, cols)}>+fila</button>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 8px', marginLeft: 4 }} onClick={() => cambiarTamano(filas - 1, cols)}>−fila</button>
                </span>
              )}
            </>
          )}
          <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setVisible(v => !v)}>
            {visible ? 'Ocultar' : 'Mostrar plano'}
          </button>
        </div>
      </div>

      {visible && (
        <>
          <div style={{ fontSize: 12, color: 'var(--gris-600)', margin: '10px 0' }}>
            {editando
              ? 'Toca un asiento vacío para sentar a un alumno; toca uno ocupado para liberarlo.'
              : 'Toca a un alumno para abrir su evaluación rápida.'}
          </div>

          {/* Pizarra como referencia de orientación */}
          <div style={{
            textAlign: 'center', fontSize: 11, color: 'var(--gris-600)', background: 'var(--gris-100)',
            borderRadius: 6, padding: '4px 0', marginBottom: 10, letterSpacing: 2,
          }}>
            PIZARRA / DOCENTE
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
            {Array.from({ length: filas * cols }, (_, i) => {
              const fila = Math.floor(i / cols)
              const col = i % cols
              const al = alumnoEn(fila, col)
              const esSel = celdaSel?.fila === fila && celdaSel?.col === col
              return (
                <button key={i} onClick={() => tocarCelda(fila, col)}
                  style={{
                    minHeight: 56, borderRadius: 10, cursor: 'pointer', padding: '4px 6px',
                    fontSize: 12, fontWeight: 600, lineHeight: 1.25,
                    border: esSel ? '2px dashed var(--azul-700)'
                      : al ? '2px solid var(--azul-300)' : '2px dashed var(--gris-300)',
                    background: al ? 'var(--azul-100)' : 'var(--gris-100)',
                    color: al ? 'var(--azul-900)' : 'var(--gris-300)',
                    fontFamily: modoAnon && al ? 'monospace' : undefined,
                  }}>
                  {al ? etiqueta(al) : (editando ? '+' : '')}
                  {al?.neae ? <div style={{ fontSize: 9, color: 'var(--ambar-500)', fontWeight: 700 }}>NEAE</div> : null}
                </button>
              )
            })}
          </div>

          {/* Selector de alumno para el asiento elegido */}
          {editando && celdaSel && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--azul-100)', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--azul-700)', marginBottom: 8 }}>
                Sentar en fila {celdaSel.fila + 1}, columna {celdaSel.col + 1}:
              </div>
              {sinAsiento.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>Todo el alumnado tiene asiento ya.</div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {sinAsiento.map(al => (
                    <button key={al.id} onClick={() => sentarAlumno(al.id!)}
                      style={{
                        padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid var(--azul-300)', background: 'white', color: 'var(--azul-900)', minHeight: 40,
                      }}>
                      {modoAnon ? al.codigo_cifrado : `${al.apellidos}, ${al.nombre}`}
                    </button>
                  ))}
                </div>
              )}
              <button className="btn-secondary" style={{ fontSize: 12, marginTop: 8 }} onClick={() => setCeldaSel(null)}>
                Cancelar
              </button>
            </div>
          )}

          {sinAsiento.length > 0 && !editando && (
            <div style={{ fontSize: 12, color: 'var(--gris-600)', marginTop: 10 }}>
              Sin asiento: {sinAsiento.length} alumno{sinAsiento.length !== 1 ? 's' : ''} — usa «Editar asientos».
            </div>
          )}
        </>
      )}
    </div>
  )
}
