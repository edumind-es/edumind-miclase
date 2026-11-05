/**
 * Sello «ACI» / «RE» junto al nombre del alumno en las filas del calificador.
 *
 * Es dato de NEAE: solo se enseña con el interruptor encendido
 * (`verNeae()`), igual que el sello NEAE que lo acompaña. La nota se calcula
 * con la medida esté o no a la vista.
 */
import type { Medida } from '@/db/localDb'
import { etiquetaMedida, medidasDelAlumno } from '@/db/medidas'
import { verNeae } from '@/db/datosSensibles'

export default function SelloMedida({ medidas, onClick }: { medidas?: Medida[]; onClick?: () => void }) {
  if (!verNeae()) return null
  const lista = medidasDelAlumno(medidas)
  if (!lista.length) return null
  return (
    <>
      {lista.map(m => {
        const e = etiquetaMedida(m)
        const estilo = { marginLeft: 6, fontSize: 9.5, color: 'var(--azul-700)', fontWeight: 700 as const }
        return onClick ? (
          <button key={m.tipo} type="button" data-sello-medida={m.tipo} title={`${e.texto}. Pulsa para ver o editar.`}
            onClick={e => { e.stopPropagation(); onClick() }}
            style={{ ...estilo, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline dotted' }}>
            {e.sigla}
          </button>
        ) : (
          <span key={m.tipo} data-sello-medida={m.tipo} title={e.texto} style={estilo}>{e.sigla}</span>
        )
      })}
    </>
  )
}
