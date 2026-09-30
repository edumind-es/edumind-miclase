/**
 * Un instrumento que evalúa varios criterios: copiar la nota o vincularlos.
 *
 * Un cuaderno o una exposición se corrigen una vez y cuentan para varios
 * criterios. Hasta ahora había que repetir la nota casilla por casilla. Aquí
 * el docente elige, cada vez y a petición suya:
 *
 *  - **Copiar**: pasa la nota ya puesta a otros criterios, para este alumno o
 *    para toda la clase. Puntual: después cada casilla va por su cuenta.
 *  - **Vincular**: de ahí en adelante, calificar uno pone la misma nota en
 *    todos. Se guarda en la programación y vale también en la evaluación
 *    rápida y por QR.
 *
 * Nada se replica solo: sin haberlo pedido aquí, ninguna nota aparece en otra
 * casilla.
 */
import { useEffect, useState } from 'react'
import { copiarNotasACriterios, fijarVinculoDeInstrumento, type CeldaInstrumento } from '@/db/queries'
import type { Alumno } from '@/db/localDb'

interface Props {
  instrumento: CeldaInstrumento
  criterio: { id: string }
  /** Los otros criterios que este instrumento evalúa en lo que se está viendo. */
  hermanos: { id: string; descripcion: string }[]
  alumno: Alumno
  /** Toda la clase, para «copiar la columna». */
  alumnoIds: number[]
  trimestre: number
  unidadId: number | null
  /** Hay nota en esta casilla: sin ella no hay nada que copiar para este alumno. */
  tieneNota: boolean
  /** Algo ha cambiado (notas o vínculo): el llamante relee la matriz. */
  onCambio: (mensaje: string) => void
}

type Modo = 'copiar' | 'vincular' | null

export default function CriteriosHermanos({
  instrumento, criterio, hermanos, alumno, alumnoIds, trimestre, unidadId, tieneNota, onCambio,
}: Props) {
  const [modo, setModo] = useState<Modo>(null)
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [alcance, setAlcance] = useState<'alumno' | 'clase'>('alumno')
  const [sobrescribir, setSobrescribir] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  const vinculados = instrumento.vinculados
  const hayVinculo = vinculados.length > 0

  // Al cambiar de criterio o de instrumento, lo que estaba a medias ya no aplica.
  useEffect(() => { setModo(null) }, [criterio.id, instrumento.instrumento_id])

  const abrir = (m: Exclude<Modo, null>) => {
    // Al vincular se parte de lo que ya está vinculado; al copiar, de todos.
    setElegidos(new Set(m === 'vincular' && hayVinculo
      ? hermanos.filter(h => vinculados.includes(h.id)).map(h => h.id)
      : hermanos.map(h => h.id)))
    setAlcance(tieneNota ? 'alumno' : 'clase')
    setSobrescribir(false)
    setModo(m)
  }

  const alternar = (id: string) => setElegidos(prev => {
    const s = new Set(prev)
    if (s.has(id)) s.delete(id); else s.add(id)
    return s
  })

  const lista = (ids: string[]) => ids.join(', ')

  const copiar = async () => {
    setTrabajando(true)
    try {
      const destinos = [...elegidos]
      const r = await copiarNotasACriterios({
        instrumento_id: instrumento.instrumento_id, trimestre, origen: criterio.id, destinos,
        alumno_ids: alcance === 'alumno' ? [alumno.id!] : alumnoIds, sobrescribir,
      })
      const partes = [
        r.copiadas
          ? `${r.copiadas} nota${r.copiadas !== 1 ? 's' : ''} copiada${r.copiadas !== 1 ? 's' : ''} de ${criterio.id} a ${lista(destinos)}`
          : 'No se ha copiado ninguna nota',
        r.respetadas ? `${r.respetadas} casilla${r.respetadas !== 1 ? 's' : ''} ya tenía${r.respetadas !== 1 ? 'n' : ''} nota y se ha${r.respetadas !== 1 ? 'n' : ''} respetado` : '',
        r.sinNota && alcance === 'clase' ? `${r.sinNota} alumno${r.sinNota !== 1 ? 's' : ''} sin nota en ${criterio.id}` : '',
      ].filter(Boolean)
      setModo(null)
      onCambio(partes.join(' · '))
    } finally { setTrabajando(false) }
  }

  const vincular = async (criterios: string[]) => {
    setTrabajando(true)
    try {
      await fijarVinculoDeInstrumento(instrumento.instrumento_id, trimestre, unidadId,
        criterios.length ? [criterio.id, ...criterios] : [])
      setModo(null)
      onCambio(criterios.length
        ? `${criterio.id} vinculado con ${lista(criterios)}. Las notas ya puestas no cambian: usa «Copiar nota» si quieres igualarlas.`
        : `Vínculo quitado. Cada criterio vuelve a calificarse por separado; las notas se quedan como están.`)
    } finally { setTrabajando(false) }
  }

  if (hermanos.length === 0 && !hayVinculo) return null

  const caja = { border: '1px solid var(--gris-300)', borderRadius: 9, padding: '10px 12px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.5 }
  const boton = { fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: 'white', color: 'var(--gris-700)', border: '1px solid var(--gris-300)' } as const

  return (
    <div data-hermanos style={{ ...caja, background: hayVinculo ? 'var(--azul-100)' : 'var(--gris-50)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', color: 'var(--gris-700)' }}>
          {hayVinculo ? (
            <>🔗 <strong>Vinculado con {lista(vinculados)}</strong>: la nota que pongas aquí con «{instrumento.nombre}» se pone también en {vinculados.length === 1 ? 'él' : 'ellos'}.</>
          ) : (
            <>«{instrumento.nombre}» evalúa también <strong>{lista(hermanos.map(h => h.id))}</strong>.</>
          )}
        </div>
        {hermanos.length > 0 && (
          <>
            <button style={boton} onClick={() => modo === 'copiar' ? setModo(null) : abrir('copiar')} aria-expanded={modo === 'copiar'}
              title="Pasar la nota de este criterio a otros, una vez">
              Copiar nota…
            </button>
            <button style={boton} onClick={() => modo === 'vincular' ? setModo(null) : abrir('vincular')} aria-expanded={modo === 'vincular'}
              title="Que calificar uno ponga la misma nota en los demás, de aquí en adelante">
              🔗 {hayVinculo ? 'Cambiar vínculo…' : 'Vincular…'}
            </button>
          </>
        )}
      </div>

      {modo && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--gris-300)' }}>
          <div style={{ fontWeight: 700, color: 'var(--azul-900)', marginBottom: 6 }}>
            {modo === 'copiar'
              ? `Copiar la nota de ${criterio.id} a:`
              : `Vincular ${criterio.id} con:`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            {hermanos.map(h => (
              <label key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer' }}>
                <input type="checkbox" checked={elegidos.has(h.id)} onChange={() => alternar(h.id)} style={{ marginTop: 3 }} />
                <span><strong>{h.id}</strong> <span style={{ color: 'var(--gris-600)' }}>{h.descripcion.length > 90 ? h.descripcion.slice(0, 90) + '…' : h.descripcion}</span></span>
              </label>
            ))}
          </div>

          {modo === 'copiar' && (
            <>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: tieneNota ? 'pointer' : 'default', opacity: tieneNota ? 1 : .5 }}>
                  <input type="radio" name="alcance-copia" checked={alcance === 'alumno'} disabled={!tieneNota}
                    onChange={() => setAlcance('alumno')} />
                  Solo {alumno.nombre}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <input type="radio" name="alcance-copia" checked={alcance === 'clase'} onChange={() => setAlcance('clase')} />
                  Toda la clase ({alumnoIds.length})
                </label>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" checked={sobrescribir} onChange={e => setSobrescribir(e.target.checked)} />
                Sobrescribir las casillas que ya tienen nota
              </label>
              <div style={{ color: 'var(--gris-600)', fontSize: 11.5, marginBottom: 8 }}>
                Se copia la nota con lo marcado en la rúbrica y la observación. Es una copia de este momento: si luego cambias una, la otra no se mueve.
              </div>
              <button className="btn-primary" style={{ fontSize: 12.5 }} onClick={copiar}
                disabled={trabajando || elegidos.size === 0}>
                Copiar
              </button>
            </>
          )}

          {modo === 'vincular' && (
            <>
              <div style={{ color: 'var(--gris-600)', fontSize: 11.5, marginBottom: 8 }}>
                A partir de ahora, calificar cualquiera de ellos con «{instrumento.nombre}» pondrá la misma nota en los demás
                {unidadId ? ' en esta unidad' : ''}, también desde la evaluación rápida. Las notas ya puestas no cambian.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn-primary" style={{ fontSize: 12.5 }} onClick={() => vincular([...elegidos])}
                  disabled={trabajando || elegidos.size === 0}>
                  🔗 Vincular
                </button>
                {hayVinculo && (
                  <button className="btn-secondary" style={{ fontSize: 12.5 }} onClick={() => vincular([])} disabled={trabajando}>
                    Quitar el vínculo
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
