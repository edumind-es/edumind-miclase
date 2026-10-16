/**
 * Aviso del Inicio tras la migración a unidades estancas (v7).
 *
 * Lee el resumen que dejó el `upgrade()` del esquema (`CLAVE_RESUMEN_MIGRACION`)
 * y cuenta qué ha pasado con las notas antiguas: cuántas han recibido
 * unidad, cuántas fueron a la primera por no programarlas ninguna y cuántas
 * no cabían en ninguna. Recuerda dónde quedó la copia y pide actualizar
 * todos los aparatos. Se cierra a mano y no vuelve.
 */
import { useState } from 'react'
import { CLAVE_RESUMEN_MIGRACION, type ResumenMigracion } from '@/db/migracionUnidades'

type Guardado = ResumenMigracion & { fecha: string }

function leer(): Guardado | null {
  try {
    const v = localStorage.getItem(CLAVE_RESUMEN_MIGRACION)
    return v ? JSON.parse(v) as Guardado : null
  } catch { return null }
}

export default function AvisoMigracionUnidades() {
  const [resumen, setResumen] = useState<Guardado | null>(leer)
  if (!resumen) return null
  let copia: string | null = null
  try { copia = localStorage.getItem('miclase.migracion.copia') } catch { /* sin nombre */ }

  const cerrar = () => {
    try {
      localStorage.removeItem(CLAVE_RESUMEN_MIGRACION)
      localStorage.removeItem('miclase.migracion.copia')
    } catch { /* nada */ }
    setResumen(null)
  }

  return (
    <div data-aviso-migracion className="card" style={{ marginBottom: 18, borderLeft: '4px solid var(--ambar-500)' }}>
      <h2 style={{ fontSize: 17, marginBottom: 6 }}>Las unidades ahora son estancas</h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 6 }}>
        Cada unidad guarda sus propias notas, aunque repita criterio e instrumento con otra del
        trimestre. «Todo el curso» hace la media de las unidades.
      </p>
      <ul style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 8px 18px' }}>
        <li>
          {resumen.asignadas === 0
            ? 'Todas tus notas ya sabían de qué unidad eran: no se ha movido ninguna.'
            : `${resumen.asignadas} nota${resumen.asignadas === 1 ? '' : 's'} u observaci${resumen.asignadas === 1 ? 'ón' : 'ones'} sin unidad se han colocado en la unidad que programa su criterio con su instrumento.`}
        </li>
        {resumen.primera > 0 && (
          <li>
            {resumen.primera} de ellas no las programaba ninguna unidad del trimestre y han ido a la
            primera. Si alguna no está donde debía, cámbiala desde su casilla.
          </li>
        )}
        {resumen.sinUnidad > 0 && (
          <li>
            {resumen.sinUnidad} eran de un área sin unidades: siguen contando en «Todo el curso»,
            pero ninguna pestaña de unidad las enseña hasta que el área tenga programación.
          </li>
        )}
        <li>
          <strong>Actualiza todos tus aparatos antes de volver a calificar.</strong> Uno con la versión
          anterior que sincronice podría retirar notas que aquí ya están separadas.
        </li>
        {copia && (
          <li>
            La copia previa es <code>{copia}</code>. Se restaura desde «Exportar / Importar copia de
            seguridad», en el menú lateral.
          </li>
        )}
      </ul>
      <button type="button" className="btn-secondary" onClick={cerrar} data-aviso-migracion-cerrar style={{ fontSize: 12.5 }}>
        Entendido
      </button>
    </div>
  )
}
