/**
 * «Convertir lo que ya hay en un hijo», antes de meter el primer hijo en una
 * familia que ya tiene notas, diario, examen o rúbrica propios.
 *
 * En cuanto una familia tiene un hijo, ella solo resume: lo que se calificó
 * directamente con ella sigue contando (fundido con peso 1) pero deja de
 * tener columna. Luis tenía «Proba escrita - express repaso» calificada y al
 * crear dentro «Prueba escrita - oficial» esperaba dos columnas. Este diálogo
 * lo dice y ofrece convertir lo que ya hay en un hijo con el nombre de la
 * familia (editable), y renombrar la familia al nombre genérico. Nada se
 * mueve sin pulsar «Convertir»: también se puede seguir sin convertir.
 */
import { useState } from 'react'
import { convertirFamiliaEnHijo, nombreGenericoDeFamilia, type DatosDirectosDeFamilia } from '@/db/queries'
import type { FiltroBloque } from '@/db/bloquesFamilia'
import type { Instrumento } from '@/db/localDb'
import { getInstrConfig } from '@/ia/instrumentosConfig'

interface Props {
  familia: Instrumento
  datos: DatosDirectosDeFamilia
  /** Lo que el docente iba a hacer: «añadir “Oficial”» o «abrir el asistente». */
  accion: string
  capa?: string
  /**
   * Solo esta parte (unidad y día) de lo que la familia guarda: cuando ya
   * hay hijos y el gestor mueve bloque a bloque a «un instrumento nuevo».
   */
  bloque?: FiltroBloque
  /** Convertido (o no), seguir con lo que iba a hacer. */
  onSeguir: (convertido: boolean) => void
  onCancelar: () => void
}

export default function ConvertirFamilia({ familia, datos, accion, capa, bloque, onSeguir, onCancelar }: Props) {
  const cfg = getInstrConfig(familia.tipo)
  const propuesto = nombreGenericoDeFamilia(familia, cfg.label)
  const [nombreHijo, setNombreHijo] = useState(familia.nombre)
  const [renombrar, setRenombrar] = useState(propuesto !== familia.nombre)
  const [nombreFamilia, setNombreFamilia] = useState(propuesto)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const partes: string[] = []
  if (datos.calificaciones) partes.push(`${datos.calificaciones} nota${datos.calificaciones !== 1 ? 's' : ''}`)
  if (datos.diario) partes.push(`${datos.diario} registro${datos.diario !== 1 ? 's' : ''} del diario`)
  if (datos.examenes) partes.push(`${datos.examenes} examen${datos.examenes !== 1 ? 'es' : ''}`)
  if (datos.rubricas) partes.push('su rúbrica')
  const lista = partes.length > 1 ? partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1] : partes[0] ?? ''

  const convertir = async () => {
    setTrabajando(true); setError(null)
    try {
      await convertirFamiliaEnHijo(familia.id!, {
        nombre_hijo: nombreHijo,
        nombre_familia: renombrar ? nombreFamilia : null,
        bloque,
      })
      onSeguir(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo convertir')
      setTrabajando(false)
    }
  }

  return (
    <div className="modal-overlay" style={capa ? { zIndex: capa } : { zIndex: 'var(--z-modal-anidado)' }}
      onClick={e => { if (e.target === e.currentTarget && !trabajando) onCancelar() }}>
      <div className="card" role="dialog" aria-modal="true" aria-label={`Convertir lo que ya hay en ${familia.nombre}`}
        data-convertir-familia style={{ width: 'min(600px, 96vw)', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gris-300)', borderTop: `4px solid ${cfg.color}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--azul-900)' }}>«{familia.nombre}» ya tiene {lista}</div>
          <div style={{ fontSize: 12.5, color: 'var(--gris-600)', lineHeight: 1.55, marginTop: 4 }}>
            En cuanto metas algo dentro, la familia pasa a ser solo el resumen de sus instrumentos: lo que ya
            calificaste con ella seguiría contando, pero sin columna propia en el Calificador. Si lo conviertes
            en un instrumento propio, tendrás dos columnas: una con lo de ahora y otra para {accion}.
          </div>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--gris-600)' }}>
            Nombre del instrumento que recoge lo de ahora
            <input data-convertir-nombre-hijo value={nombreHijo} onChange={e => setNombreHijo(e.target.value)}
              style={{ fontSize: 13, fontWeight: 600, padding: '6px 8px' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" data-convertir-renombrar checked={renombrar} onChange={e => setRenombrar(e.target.checked)} />
            Renombrar la familia a
            <input data-convertir-nombre-familia value={nombreFamilia} disabled={!renombrar}
              onChange={e => setNombreFamilia(e.target.value)}
              style={{ flex: 1, fontSize: 12.5, fontWeight: 600, padding: '5px 8px', minWidth: 140 }} />
          </label>
          <div style={{ fontSize: 11.5, color: 'var(--gris-500)', lineHeight: 1.5 }}>
            Las notas, el diario, el examen y la rúbrica pasan al instrumento nuevo tal cual: la nota del área no cambia.
            El nuevo empieza con los mismos criterios que la familia; después puedes recortarlos.
          </div>
          {error && <div style={{ color: 'var(--rojo-500)', fontSize: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={onCancelar} disabled={trabajando} style={{ fontSize: 13 }}>Cancelar</button>
            <button data-convertir-omitir className="btn-secondary" onClick={() => onSeguir(false)} disabled={trabajando} style={{ fontSize: 13 }}
              title="Seguir sin convertir: la familia solo resumirá y lo de ahora se funde sin columna">
              Seguir sin convertir
            </button>
            <button data-convertir-aceptar className="btn-primary" onClick={convertir} disabled={trabajando || !nombreHijo.trim()} style={{ fontSize: 13 }}>
              {trabajando ? 'Convirtiendo…' : 'Convertir y seguir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
