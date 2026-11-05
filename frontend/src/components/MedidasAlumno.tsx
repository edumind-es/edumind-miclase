/**
 * Medidas de atención a la diversidad de un alumno: por cada área de su
 * clase, la adaptación curricular y el refuerzo educativo.
 *
 * Se abre desde la ficha del alumno (Alumnado) y desde el sello ACI/RE de
 * la fila del calificador. Es dato de NEAE: quien lo monta comprueba antes
 * `verNeae()`; aquí no se vuelve a preguntar.
 */
import { useEffect, useState } from 'react'
import type { Alumno, Asignatura, Grupo, Medida } from '@/db/localDb'
import { getAsignaturas, getMedidas } from '@/db/queries'
import { medidaDe } from '@/db/medidas'

import MedidaRefuerzo from './MedidaRefuerzo'
import MedidaAdaptacion from './MedidaAdaptacion'

type Props = {
  alumno: Alumno
  grupo: Grupo
  /** Área que se abre desplegada (la del calificador desde el que se llega). */
  asignaturaId?: number | null
  onCerrar: () => void
  /** Algo ha cambiado: quien lo monta vuelve a pedir la matriz. */
  onCambio?: () => void
}

export default function MedidasAlumno({ alumno, grupo, asignaturaId, onCerrar, onCambio }: Props) {
  const [areas, setAreas] = useState<Asignatura[]>([])
  const [medidas, setMedidas] = useState<Map<number, Medida[]>>(new Map())
  const [abierta, setAbierta] = useState<number | null>(asignaturaId ?? null)

  const cargar = async () => {
    const as = await getAsignaturas(grupo.id!)
    setAreas(as)
    const m = new Map<number, Medida[]>()
    for (const a of as) m.set(a.id!, await getMedidas(alumno.id!, a.id!))
    setMedidas(m)
    if (abierta == null && as.length === 1) setAbierta(as[0].id!)
  }
  useEffect(() => { cargar() }, [alumno.id, grupo.id])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCerrar])

  const cambio = async () => { await cargar(); onCambio?.() }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Medidas de atención a la diversidad"
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }} data-medidas-alumno>
      <div className="card" style={{ width: 'min(720px, 96vw)', maxHeight: '92vh', overflow: 'auto', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--gris-200, #e5e7eb)', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Medidas de atención a la diversidad</h2>
            <div style={{ fontSize: 13, color: 'var(--gris-600)' }}>{alumno.apellidos}, {alumno.nombre} · {grupo.nombre}</div>
          </div>
          <button onClick={onCerrar} className="modal-close" aria-label="Cerrar">✕</button>
        </div>
        <div style={{ padding: '12px 18px 18px', display: 'grid', gap: 10 }}>
          <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: 0, lineHeight: 1.5 }}>
            La programación del área no cambia: la medida ajusta cómo se calcula la nota de este alumno en los
            trimestres que indiques. Es dato sensible: solo se ofrece y se enseña con NEAE encendido en Alumnado,
            pero la nota se calcula con la medida en todo caso.
          </p>
          {areas.length === 0 && <p style={{ fontSize: 13, color: 'var(--gris-600)' }}>Esta clase aún no tiene áreas.</p>}
          {areas.map(a => {
            const lista = medidas.get(a.id!) ?? []
            const aci = medidaDe(lista, 'adaptacion')
            const re = medidaDe(lista, 'refuerzo')
            const estaAbierta = abierta === a.id
            return (
              <div key={a.id} data-medidas-area={a.id} style={{ border: '1px solid var(--gris-200, #e5e7eb)', borderRadius: 10 }}>
                <button type="button" onClick={() => setAbierta(estaAbierta ? null : a.id!)} data-medidas-area-toggle
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600 }}>
                  <span style={{ flex: 1 }}>{a.nombre_display || a.nombre}</span>
                  {aci && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--azul-700)' }}>ACI</span>}
                  {re && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--azul-700)' }}>RE</span>}
                  {!aci && !re && <span style={{ fontSize: 11.5, color: 'var(--gris-500)', fontWeight: 400 }}>sin medidas</span>}
                  <span aria-hidden="true" style={{ color: 'var(--gris-500)' }}>{estaAbierta ? '▾' : '▸'}</span>
                </button>
                {estaAbierta && (
                  <div style={{ padding: '0 14px 14px', display: 'grid', gap: 14 }}>
                    <section data-seccion-adaptacion>
                      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px', color: 'var(--azul-900)' }}>Adaptación curricular</h3>
                      <MedidaAdaptacion alumno={alumno} asignatura={a} grupo={grupo} medida={aci} onCambio={cambio} />
                    </section>
                    <section data-seccion-refuerzo>
                      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px', color: 'var(--azul-900)' }}>Refuerzo educativo</h3>
                      <MedidaRefuerzo alumno={alumno} asignatura={a} medida={re} onCambio={cambio} />
                    </section>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
