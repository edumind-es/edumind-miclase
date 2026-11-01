/**
 * Tarjeta de Alumnado para encender o apagar el indicador NEAE y las
 * evidencias en este aparato (ver db/datosSensibles.ts). Plegada: abierta solo
 * cuando el docente la busca.
 */
import { useEffect, useState } from 'react'
import { contarDatosSensibles, fijarDatosSensibles, useDatosSensibles } from '@/db/datosSensibles'

export default function AjustesDatosSensibles() {
  const d = useDatosSensibles()
  const [abierta, setAbierta] = useState(false)
  const [n, setN] = useState<{ neae: number; evidencias: number } | null>(null)

  useEffect(() => { if (abierta) contarDatosSensibles().then(setN).catch(() => setN(null)) }, [abierta, d])

  const cambiar = (clave: 'neae' | 'evidencias', valor: boolean) => {
    if (valor) {
      const que = clave === 'neae'
        ? 'El indicador NEAE puede revelar datos de salud o discapacidad del alumnado.'
        : 'Las evidencias son imagen y voz de menores, y se guardan en este aparato.'
      if (!confirm(`${que}\n\nÚsalo solo si tu centro lo autoriza. ¿Encender?`)) return
    }
    fijarDatosSensibles({ [clave]: valor })
  }

  const fila = (clave: 'neae' | 'evidencias', titulo: string, explicacion: string, guardados?: number) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, marginBottom: 10, cursor: 'pointer' }}>
      <input type="checkbox" data-sensible={clave} checked={d[clave]}
        onChange={e => cambiar(clave, e.target.checked)} style={{ marginTop: 3 }} />
      <span>
        <strong>{titulo}</strong> — {explicacion}
        {!d[clave] && !!guardados && (
          <span data-sensible-guardados={clave} style={{ display: 'block', fontSize: 12, color: 'var(--gris-500)', marginTop: 2 }}>
            Hay {guardados} guardado{guardados !== 1 ? 's' : ''} en este aparato: se conservan, pero no se muestran.
          </span>
        )}
      </span>
    </label>
  )

  return (
    <div className="card" data-datos-sensibles style={{ marginTop: 24, padding: '12px 16px' }}>
      <button type="button" data-datos-sensibles-toggle onClick={() => setAbierta(a => !a)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
        🔒 Datos sensibles: NEAE {d.neae ? 'encendido' : 'apagado'} · evidencias {d.evidencias ? 'encendidas' : 'apagadas'} {abierta ? '▴' : '▾'}
      </button>
      {abierta && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12.5, color: 'var(--gris-600)', marginBottom: 12, lineHeight: 1.55 }}>
            Vienen apagados. Enciéndelos solo si tu centro autoriza tratarlos con esta app.
            Apagar no borra nada: deja de ofrecerlos y de enseñarlos, también en los informes.
            La elección es de este aparato.
          </p>
          {fila('neae', 'Indicador NEAE', 'marcar al alumnado con necesidades específicas de apoyo educativo.', n?.neae)}
          {fila('evidencias', 'Evidencias', 'fotos, audio y vídeo del alumnado al calificar.', n?.evidencias)}
        </div>
      )}
    </div>
  )
}
