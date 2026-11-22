/**
 * «Poner esta nota a su equipo», en el panel de la casilla.
 *
 * Si el alumno está en un equipo de un agrupamiento que vale para esta área
 * y unidad (`agrupamientosPara`: el de la unidad, el del área, los de toda la
 * clase), la franja nombra a sus compañeros y ofrece llevarles la nota que
 * él ya tiene en esta casilla. Sin equipo no se pinta nada.
 *
 * No calcula ni decide: copia con `copiarNotaAlEquipo`, que respeta la nota
 * que un compañero ya tuviera; si hay alguna, se pregunta antes de pisarla.
 */
import { useEffect, useState } from 'react'
import { copiarNotaAlEquipo, getAgrupamientos, getAlumnosByGrupo } from '@/db/queries'
import type { Agrupamiento, Alumno } from '@/db/localDb'
import { agrupamientosPara, equipoDeAlumno, sinBajas } from '@/db/equipos'
import { confirmar } from '@/utils/confirmar'

interface Props {
  alumno: Alumno
  grupoId: number
  asignaturaId: number
  /** La unidad que se mira, o null en un área sin unidades. */
  unidadId: number | null
  /** La unidad con la que se guarda la casilla (`claveUnidad`). */
  unidadClave: number
  instrumentoId: number
  trimestre: number
  /** Los criterios a los que va la nota desde esta casilla. */
  criterios: string[]
  tieneNota: boolean
  deshabilitado?: boolean
  onCambio: (texto: string) => void
  onError: (texto: string) => void
}

export default function NotaAlEquipo({
  alumno, grupoId, asignaturaId, unidadId, unidadClave, instrumentoId, trimestre, criterios,
  tieneNota, deshabilitado, onCambio, onError,
}: Props) {
  const [agrupamientos, setAgrupamientos] = useState<Agrupamiento[]>([])
  const [alumnos, setAlumnos] = useState<Alumno[]>([])
  const [elegido, setElegido] = useState<number | null>(null)
  const [copiando, setCopiando] = useState(false)

  useEffect(() => {
    let vigente = true
    // Los equipos se piden después de la nota: el efecto de un hijo corre antes
    // que el del panel, y sin esta espera sus consultas se ponían por delante
    // de lo primero que tiene que llegar, que es la nota.
    const espera = setTimeout(() => {
      Promise.all([getAgrupamientos(grupoId), getAlumnosByGrupo(grupoId)]).then(([ags, als]) => {
        if (!vigente) return
        const ids = als.map(a => a.id!)
        setAlumnos(als)
        setAgrupamientos(agrupamientosPara(ags, asignaturaId, unidadId)
          .map(a => ({ ...a, equipos: sinBajas(a.equipos, ids) })))
      }).catch(() => { /* sin equipos no hay franja: no es un fallo que enseñar */ })
    }, 150)
    return () => { vigente = false; clearTimeout(espera) }
  }, [grupoId, asignaturaId, unidadId])

  // Solo cuentan los agrupamientos en los que este alumno tiene compañeros.
  const suyos = agrupamientos
    .map(a => ({ a, equipo: equipoDeAlumno(a, alumno.id!) }))
    .filter(x => x.equipo && x.equipo.alumnos.length > 1)
  if (!suyos.length) return null
  const actual = suyos.find(x => x.a.id === elegido) ?? suyos[0]
  const equipo = actual.equipo!
  const companeros = equipo.alumnos.filter(id => id !== alumno.id)
  const nombres = companeros.map(id => alumnos.find(a => a.id === id)?.nombre ?? '…').join(', ')

  const copiar = async () => {
    setCopiando(true)
    try {
      const pedir = (sobrescribir: boolean) => copiarNotaAlEquipo({
        instrumento_id: instrumentoId, trimestre, unidad_id: unidadClave, criterios,
        desde_alumno_id: alumno.id!, alumno_ids: companeros, sobrescribir,
      })
      let r = await pedir(false)
      let dicho = `Nota puesta a ${equipo.nombre}: ${r.copiadas} casilla${r.copiadas !== 1 ? 's' : ''}.`
      if (r.respetadas > 0) {
        const ok = await confirmar({
          titulo: `¿Sustituir las notas que ${equipo.nombre} ya tenía?`,
          texto: `${r.respetadas} casilla${r.respetadas !== 1 ? 's' : ''} de sus compañeros ya tenía${r.respetadas !== 1 ? 'n' : ''} nota y no se ha${r.respetadas !== 1 ? 'n' : ''} tocado.`,
          aceptar: 'Sustituir', cancelar: 'Dejarlas como están',
        })
        if (ok) {
          const antes = r.copiadas
          r = await pedir(true)
          dicho = `Nota puesta a ${equipo.nombre}: ${antes + r.copiadas} casillas, ${r.copiadas} sustituida${r.copiadas !== 1 ? 's' : ''}.`
        } else {
          dicho += ` ${r.respetadas} ya tenía${r.respetadas !== 1 ? 'n' : ''} nota y se ha${r.respetadas !== 1 ? 'n' : ''} respetado.`
        }
      }
      onCambio(dicho)
    } catch (e) {
      onError(`No se pudo poner la nota al equipo: ${(e as Error).message}`)
    } finally { setCopiando(false) }
  }

  return (
    <div data-equipo-nota data-equipo-nombre={equipo.nombre}
      style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', marginBottom: 10, border: '1px solid var(--gris-300)', borderRadius: 9, fontSize: 13.5 }}>
      <span style={{ flex: '1 1 200px' }}>
        <strong>{equipo.nombre}</strong>
        <span style={{ color: 'var(--gris-600)' }}> · con {nombres}</span>
      </span>
      {suyos.length > 1 && (
        <select data-equipo-nota-agrupamiento aria-label="Agrupamiento" value={actual.a.id} style={{ minHeight: 44, fontSize: 13.5, maxWidth: 200 }}
          onChange={e => setElegido(Number(e.target.value))}>
          {suyos.map(x => <option key={x.a.id} value={x.a.id}>{x.a.nombre}</option>)}
        </select>
      )}
      <button type="button" className="btn-secondary" data-equipo-nota-poner style={{ minHeight: 44, fontSize: 14 }}
        disabled={!tieneNota || copiando || deshabilitado} onClick={copiar}
        title={tieneNota ? `Lleva la nota de ${alumno.nombre} a sus compañeros de equipo` : `Pon antes la nota de ${alumno.nombre}`}>
        {copiando ? 'Poniendo…' : 'Poner esta nota a su equipo'}
      </button>
    </div>
  )
}
