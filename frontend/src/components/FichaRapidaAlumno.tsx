/**
 * La ficha rápida de un alumno, abierta desde su nombre en el Calificador.
 *
 * Luis: desde la fila de un alumno quería ver y editar su información de esa
 * área o de todas, sin salir de donde califica. Dos pestañas: «Esta área»
 * (nota por trimestre y final, desglose por instrumento, medidas y análisis)
 * y «Todas las áreas» (la nota de cada una, observaciones y la ficha).
 *
 * No calcula ninguna nota ni guarda nada por su cuenta: las notas son las de
 * `getResumenCurso` —las del boletín— y para editar abre lo de siempre
 * (`MedidasAlumno`, `AnalisisAlumno`, `EditarAlumno`). Esos diálogos se
 * enseñan EN LUGAR de la ficha, no encima: así Esc cierra uno solo.
 */
import { useEffect, useState } from 'react'
import { getAsignaturas, getResumenCurso } from '@/db/queries'
import type { NotaArea } from '@/db/calculo'
import type { Alumno, Asignatura, Grupo, Medida } from '@/db/localDb'
import { etiquetaMedida, medidasDelAlumno } from '@/db/medidas'
import { useDatosSensibles } from '@/db/datosSensibles'
import Dialogo from './comunes/Dialogo'
import Pestanas from './comunes/Pestanas'
import MedidasAlumno from './MedidasAlumno'
import AnalisisAlumno from './AnalisisAlumno'
import { EditarAlumno } from './AlumnadoClase'

interface Props {
  alumno: Alumno
  grupo: Grupo
  /** El área que se está calificando. */
  asignaturaId: number
  onCerrar: () => void
  /** Se ha cambiado algo del alumno (ficha o medidas): quien abre tiene que releer. */
  onCambio: () => void
}

type Pestana = 'area' | 'todas'
type Abierto = 'medidas' | 'medidas-todas' | 'analisis' | 'ficha' | null

const TRIMESTRES = [1, 2, 3] as const
const boton = { minHeight: 44, fontSize: 14 } as const
const th = { textAlign: 'right', padding: '6px 10px', fontSize: 12, color: 'var(--gris-600)' } as const
const td = { textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums' } as const

const cifra = (v: number | null | undefined) => v == null ? '—' : v.toFixed(2).replace('.', ',')

export default function FichaRapidaAlumno({ alumno, grupo, asignaturaId, onCerrar, onCambio }: Props) {
  const sensibles = useDatosSensibles()
  const [pestana, setPestana] = useState<Pestana>('area')
  const [abierto, setAbierto] = useState<Abierto>(null)
  const [areas, setAreas] = useState<Asignatura[]>([])
  const [notas, setNotas] = useState<Map<number, NotaArea | null>>(new Map())
  const [medidas, setMedidas] = useState<Medida[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  // Sube al cerrar un editor: las notas y las medidas pueden haber cambiado.
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vigente = true
    getAsignaturas(grupo.id!).then(as => { if (vigente) setAreas(as) })
      .catch(e => { if (vigente) setAviso(`No se pudieron leer las áreas: ${(e as Error).message}`) })
    return () => { vigente = false }
  }, [grupo.id])

  // «Esta área» se calcula al abrir; las demás, solo si se pide la otra pestaña.
  useEffect(() => {
    const pedir = pestana === 'todas' ? areas.map(a => a.id!) : [asignaturaId]
    if (!pedir.length) return
    let vigente = true
    Promise.all(pedir.map(async id => [id, await getResumenCurso(id)] as const)).then(res => {
      if (!vigente) return
      setNotas(antes => {
        const m = new Map(antes)
        for (const [id, r] of res) m.set(id, r?.notas.get(alumno.id!) ?? null)
        return m
      })
      const propia = res.find(([id]) => id === asignaturaId)?.[1]
      if (propia) setMedidas(propia.medidas.get(alumno.id!) ?? [])
    }).catch(e => { if (vigente) setAviso(`No se pudieron calcular las notas: ${(e as Error).message}`) })
    return () => { vigente = false }
  }, [pestana, areas, asignaturaId, alumno.id, vuelta])

  const volver = () => { setAbierto(null); setVuelta(v => v + 1); onCambio() }

  if (abierto === 'medidas' || abierto === 'medidas-todas') {
    return <MedidasAlumno alumno={alumno} grupo={grupo} asignaturaId={abierto === 'medidas' ? asignaturaId : undefined} onCerrar={volver} onCambio={onCambio} />
  }
  if (abierto === 'analisis') {
    return <AnalisisAlumno alumno={alumno} grupoId={grupo.id!} asignaturaId={asignaturaId} onCerrar={() => setAbierto(null)} />
  }
  if (abierto === 'ficha') {
    // Guardar puede cambiar el nombre o quitarlo de la clase: se cierra todo y se relee.
    return <EditarAlumno alumno={alumno} grupoId={grupo.id!} onCerrar={() => setAbierto(null)} onGuardado={() => { onCambio(); onCerrar() }} />
  }

  const area = areas.find(a => a.id === asignaturaId)
  const nota = notas.get(asignaturaId)
  const calculada = notas.has(asignaturaId)
  const delAlumno = sensibles.neae ? medidasDelAlumno(medidas) : []

  return (
    <Dialogo ancho={640} antetitulo="FICHA DEL ALUMNO" titulo={`${alumno.apellidos}, ${alumno.nombre}`} onCerrar={onCerrar} data-ficha-rapida
      pie={<button type="button" className="btn-primary" style={boton} onClick={onCerrar}>Hecho</button>}>
      <Pestanas etiqueta="Qué se enseña del alumno" activa={pestana} alCambiar={setPestana}
        pestanas={[{ id: 'area', etiqueta: area ? `Esta área · ${area.nombre_display}` : 'Esta área' }, { id: 'todas', etiqueta: 'Todas las áreas' }]} />

      {aviso && <div role="alert" style={{ margin: '10px 0', fontSize: 13, color: '#991b1b' }}>{aviso}</div>}

      {pestana === 'area' && (
        <div data-ficha-rapida-area style={{ marginTop: 12 }}>
          {!calculada ? <p style={{ fontSize: 13.5, color: 'var(--gris-600)' }}>Calculando…</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Nota</th>
                  {TRIMESTRES.map(t => <th key={t} style={th}>{t}.º trim.</th>)}
                  <th style={th}>Final</th>
                </tr>
              </thead>
              <tbody>
                <tr data-ficha-nota-area style={{ fontWeight: 700, borderTop: '1px solid var(--gris-300)' }}>
                  <td style={{ padding: '8px 10px' }}>El área</td>
                  {TRIMESTRES.map(t => <td key={t} style={td}>{cifra(nota?.trimestres[t])}</td>)}
                  <td style={td} data-ficha-nota-final>{cifra(nota?.final)}</td>
                </tr>
                {(nota?.instrumentos ?? []).map(i => (
                  <tr key={i.instrumento_id} data-ficha-nota-instrumento style={{ borderTop: '1px solid var(--gris-200)' }}>
                    <td style={{ padding: '8px 10px' }}>{i.nombre} <span style={{ color: 'var(--gris-600)', fontSize: 12 }}>· {i.peso} %</span></td>
                    {TRIMESTRES.map(t => <td key={t} style={td}>{cifra(i.trimestres[t])}</td>)}
                    <td style={td} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12.5, color: 'var(--gris-600)', margin: '8px 0 14px' }}>
            Son las notas del boletín. Para ver de dónde sale una, pulsa su casilla en «Todo el curso».
          </p>

          {delAlumno.length > 0 && (
            <p data-ficha-rapida-medidas style={{ fontSize: 13.5, margin: '0 0 10px' }}>
              En esta área tiene: {delAlumno.map(m => etiquetaMedida(m).texto).join(' · ')}.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sensibles.neae && (
              <button type="button" className="btn-secondary" style={boton} data-ficha-rapida-medidas-abrir onClick={() => setAbierto('medidas')}>
                Medidas en esta área…
              </button>
            )}
            <button type="button" className="btn-secondary" style={boton} data-ficha-rapida-analisis onClick={() => setAbierto('analisis')}>
              Análisis frente al grupo…
            </button>
          </div>
        </div>
      )}

      {pestana === 'todas' && (
        <div data-ficha-rapida-todas style={{ marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Área</th>
                {TRIMESTRES.map(t => <th key={t} style={th}>{t}.º trim.</th>)}
                <th style={th}>Final</th>
              </tr>
            </thead>
            <tbody>
              {areas.map(a => {
                const n = notas.get(a.id!)
                const lista = notas.has(a.id!)
                return (
                  <tr key={a.id} data-ficha-area={a.nombre_display} style={{ borderTop: '1px solid var(--gris-200)', fontWeight: a.id === asignaturaId ? 700 : 400 }}>
                    <td style={{ padding: '8px 10px' }}>{a.nombre_display}</td>
                    {TRIMESTRES.map(t => <td key={t} style={td}>{lista ? cifra(n?.trimestres[t]) : '…'}</td>)}
                    <td style={td}>{lista ? cifra(n?.final) : '…'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ fontSize: 13.5, margin: '14px 0 10px' }}>
            <strong>Observaciones:</strong>{' '}
            {alumno.observaciones?.trim()
              ? <span data-ficha-rapida-observaciones style={{ whiteSpace: 'pre-wrap' }}>{alumno.observaciones}</span>
              : <span style={{ color: 'var(--gris-600)' }}>ninguna.</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" style={boton} data-ficha-rapida-editar onClick={() => setAbierto('ficha')}>
              Editar la ficha…
            </button>
            {sensibles.neae && (
              <button type="button" className="btn-secondary" style={boton} data-ficha-rapida-medidas-todas onClick={() => setAbierto('medidas-todas')}>
                Medidas en todas las áreas…
              </button>
            )}
          </div>
        </div>
      )}
    </Dialogo>
  )
}

/**
 * El nombre del alumno en una fila del Calificador: un botón que abre su
 * ficha rápida. Un toque basta, así que también vale el doble clic o
 * mantener pulsado.
 */
export function NombreAlumno({ alumno, onAbrir }: { alumno: Alumno; onAbrir?: (alumno: Alumno) => void }) {
  const texto = `${alumno.apellidos}, ${alumno.nombre}`
  if (!onAbrir) return <>{texto}</>
  return (
    <button type="button" className="alumno-nombre" data-alumno-abrir={alumno.id} title={`Ver la ficha de ${alumno.nombre}`}
      onClick={() => onAbrir(alumno)}>
      {texto}
    </button>
  )
}
