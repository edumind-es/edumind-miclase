/**
 * «¿Cómo preparo el fichero?» — la ayuda de importar rúbricas.
 *
 * Importar sin saber qué forma debe tener el fichero es probar a ciegas. Aquí
 * se enseña la tabla que se espera, y cada formato trae una plantilla ya
 * rellena para descargar: es más fácil cambiar un ejemplo que partir de cero.
 */
import {
  RUBRICA_EJEMPLO, rubricaAXlsx, rubricaAMarkdown, rubricaAJson,
} from '@/ia/rubricaImportar'

function descargar(nombre: string, contenido: BlobPart, tipo: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const FORMATOS = [
  {
    icono: '📗', nombre: 'Hoja de cálculo (.xlsx)',
    para: 'Excel, LibreOffice Calc, Numbers o Google Sheets (Archivo → Descargar → .xlsx).',
    como: 'Una hoja con la tabla de abajo. Si hay varias hojas se lee la primera.',
    boton: 'Plantilla .xlsx',
    bajar: () => descargar('plantilla-rubrica.xlsx', rubricaAXlsx(RUBRICA_EJEMPLO), TIPO_XLSX),
  },
  {
    icono: '📝', nombre: 'Markdown (.md)',
    para: 'Lo que devuelve una IA (ChatGPT, Claude, Gemini) o un editor de notas.',
    como: 'La misma tabla escrita con barras: | Indicador | Excelente (4) | … Un título con # encima, si quieres.',
    boton: 'Plantilla .md',
    bajar: () => descargar('plantilla-rubrica.md', rubricaAMarkdown(RUBRICA_EJEMPLO), 'text/markdown;charset=utf-8'),
  },
  {
    icono: '🔁', nombre: 'Rúbrica de EDUmind (.json)',
    para: 'La que te pasa otro docente con «Compartir rúbrica». No hay que prepararla.',
    como: 'Guarda la rúbrica exacta, con su escala y sus pesos. Es el formato que no pierde nada.',
    boton: 'Ejemplo .json',
    bajar: () => descargar('ejemplo.edurubrica.json', rubricaAJson(RUBRICA_EJEMPLO), 'application/json'),
  },
]

export default function AyudaImportarRubrica({ onCerrar }: { onCerrar: () => void }) {
  const celda = { border: '1px solid var(--gris-300)', padding: '4px 7px', fontSize: 11, textAlign: 'left' as const }
  const cab = { ...celda, background: 'var(--gris-100)', fontWeight: 700 }
  return (
    <div style={{ border: '1px solid var(--azul-300)', background: 'var(--azul-100)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 13.5, color: 'var(--azul-900)', flex: 1 }}>Cómo preparar el fichero para importarlo</strong>
        <button onClick={onCerrar} aria-label="Cerrar la ayuda"
          style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--gris-600)', lineHeight: 1 }}>×</button>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--gris-700)', lineHeight: 1.55, marginBottom: 10 }}>
        La rúbrica es <strong>una tabla</strong>: una fila por indicador y una columna por nivel.
        El fichero se lee en este dispositivo y no se sube a ningún sitio.
      </p>

      <div style={{ overflowX: 'auto', marginBottom: 10 }}>
        <table style={{ borderCollapse: 'collapse', background: 'white' }}>
          <thead>
            <tr>
              <th style={cab}>Indicador</th>
              <th style={cab}>Peso</th>
              <th style={cab}>Excelente (4)</th>
              <th style={cab}>Notable (3)</th>
              <th style={cab}>Bien (2)</th>
              <th style={cab}>Insuficiente (1)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={celda}>Organiza lo que cuenta</td>
              <td style={celda}>40</td>
              <td style={celda}>Presenta, desarrolla y cierra</td>
              <td style={celda}>Sigue un orden claro</td>
              <td style={celda}>Salta de una idea a otra</td>
              <td style={celda}>Datos sueltos</td>
            </tr>
            <tr>
              <td style={celda}>Se expresa con claridad</td>
              <td style={celda}>60</td>
              <td style={celda}>…</td>
              <td style={celda}>…</td>
              <td style={celda}>…</td>
              <td style={celda}>…</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul style={{ fontSize: 12, color: 'var(--gris-700)', lineHeight: 1.6, margin: '0 0 12px 18px', padding: 0 }}>
        <li>La primera columna se llama <strong>Indicador</strong>. Así se encuentra la tabla aunque no empiece en la primera fila.</li>
        <li>Cada nivel lleva sus <strong>puntos entre paréntesis</strong>: «Excelente (4)». Puedes poner los niveles que quieras, también uno de 0 puntos («No lo hace (0)»).</li>
        <li>La columna <strong>Peso</strong> es opcional: lo que cuenta cada indicador, en %. Sin ella, todos cuentan igual.</li>
        <li>Si escribes un título en una fila suelta encima de la tabla, será el título de la rúbrica.</li>
        <li>Una celda en blanco no pasa nada: el descriptor se queda vacío y lo completas aquí.</li>
      </ul>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        {FORMATOS.map(f => (
          <div key={f.nombre} style={{ background: 'white', border: '1px solid var(--gris-300)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--azul-900)' }}>
              <span aria-hidden="true">{f.icono}</span> {f.nombre}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--gris-600)', lineHeight: 1.45 }}>{f.para}</div>
            <div style={{ fontSize: 11.5, color: 'var(--gris-600)', lineHeight: 1.45, flex: 1 }}>{f.como}</div>
            <button className="btn-secondary" style={{ fontSize: 11.5, alignSelf: 'flex-start' }} onClick={f.bajar}>
              ⬇ {f.boton}
            </button>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--gris-600)', lineHeight: 1.5, margin: '10px 0 0' }}>
        Al importar, la rúbrica se carga en el editor para que la revises: <strong>no queda guardada hasta que pulses «Guardar rúbrica»</strong>.
      </p>
    </div>
  )
}
