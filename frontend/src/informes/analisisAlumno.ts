/**
 * Informe del análisis de un alumno frente a su grupo (Lámina).
 *
 * Es un documento con nombre —al contrario que el informe de una prueba, que
 * es del grupo y no nombra a nadie—, pensado para una tutoría o una sesión
 * de evaluación. Las cifras del grupo (media, mediana, moda) solo se
 * imprimen cuando salen de `MINIMO_GRUPO` notas o más: con tres notas se
 * deducen las de los compañeros. La pantalla del docente sí las enseña todas.
 */
import { documento, hoja, cabecera, pie, seccion, esc, nota, tinta } from './lamina'
import {
  PERIODOS, ETIQUETA_PERIODO, grupoPublicable,
  type AnalisisAlumno, type AnalisisExamen, type Comparacion, type FilaAnalisis,
} from '../db/analisisAlumno'
import { textoDeModa } from '../db/estadistica'

export type DatosInformeAnalisis = {
  alumno: string
  clase: string
  area: string
  cursoEscolar?: string
  analisis: AnalisisAlumno
  examenes: AnalisisExamen[]
  /** criterio_id → descripción del currículo. */
  descripciones: Map<string, string>
}

const signo = (n: number | null) => n == null ? '' : `${n > 0 ? '+' : ''}${nota(n)}`
const mono = 'font-family:var(--lm-mono);font-size:7.5pt;color:var(--lm-ink-2)'

/** La celda de un periodo: la nota del alumno y, debajo, la mediana del grupo si se puede dar. */
function celda(c: Comparacion): string {
  if (c.valor == null && !c.grupo) return '<td class="n">—</td>'
  const grupo = grupoPublicable(c) ? `<br><span style="${mono}">med. ${nota(c.grupo!.mediana)}${c.diferencia != null ? ` (${signo(c.diferencia)})` : ''}</span>` : ''
  return `<td class="n"><b style="color:${tinta(c.valor)}">${c.valor == null ? '—' : nota(c.valor)}</b>${grupo}</td>`
}

function tabla(filas: FilaAnalisis[], primera: string, periodos: readonly (typeof PERIODOS[number])[], etiqueta: (f: FilaAnalisis) => string): string {
  return `<table><thead><tr><th>${esc(primera)}</th>${periodos.map(p => `<th class="n">${ETIQUETA_PERIODO[p]}</th>`).join('')}</tr></thead><tbody>${
    filas.map(f => `<tr><td>${etiqueta(f)}</td>${periodos.map(p => celda(f.periodos[p])).join('')}</tr>`).join('')
  }</tbody></table>`
}

export function documentoAnalisisAlumno(d: DatosInformeAnalisis): string {
  const a = d.analisis
  const secciones: string[] = []
  let n = 0
  const num = () => String(++n).padStart(2, '0')

  // Área: la fila del alumno y, si el grupo es publicable, sus tres estadísticos.
  const final = a.area.periodos.final
  const lineaGrupo = grupoPublicable(final)
    ? `<p style="font-size:8.5pt;color:var(--lm-ink-2);margin-top:2mm">Grupo (nota final, ${final.grupo!.n} alumnos): media <b>${nota(final.grupo!.media)}</b> · mediana <b>${nota(final.grupo!.mediana)}</b> · moda <b>${esc(textoDeModa(final.grupo!.moda, final.grupo!.n))}</b>.</p>`
    : `<p class="vacio">El grupo es pequeño: no se dan sus cifras.</p>`
  secciones.push(seccion(num(), 'Nota del área frente al grupo',
    tabla([a.area], 'Periodo', PERIODOS, () => esc(d.area)) + lineaGrupo))

  if (a.instrumentos.length) {
    secciones.push(seccion(num(), 'Por instrumento de evaluación',
      tabla(a.instrumentos, 'Instrumento', ['1', '2', '3'], f => esc(f.nombre))))
  }

  secciones.push(seccion(num(), 'Dónde necesita más apoyo', a.debiles.length
    ? `<table><thead><tr><th style="width:20mm">Criterio</th><th>Descripción</th><th class="n">Nota</th><th class="n">Mediana</th></tr></thead><tbody>${
        a.debiles.map(p => {
          const c = a.criterios.find(x => x.id === p.criterio_id)!.periodos.final
          return `<tr><td class="criterio-id">${esc(p.criterio_id)}</td><td class="desc">${esc(d.descripciones.get(p.criterio_id) || '—')}</td>
            <td class="n"><b style="color:${tinta(p.valor)}">${nota(p.valor)}</b></td><td class="n">${grupoPublicable(c) ? nota(c.grupo!.mediana) : '—'}</td></tr>`
        }).join('')
      }</tbody></table>`
    : `<p class="vacio">Ningún criterio suspenso ni claramente por debajo del grupo.</p>`))

  if (a.fuertes.length) {
    secciones.push(seccion(num(), 'En qué destaca',
      `<p style="font-size:9.5pt">${a.fuertes.slice(0, 6).map(p => `<b>${esc(p.criterio_id)}</b> (${nota(p.valor)})`).join(' · ')}</p>`))
  }

  secciones.push(seccion(num(), 'Detalle por criterio',
    tabla(a.criterios.filter(c => PERIODOS.some(p => c.periodos[p].valor != null)), 'Criterio', PERIODOS,
      f => `<span class="criterio-id">${esc(f.id)}</span>`)))

  for (const e of d.examenes) {
    const publicable = grupoPublicable(e.nota)
    const fallos = e.fallosDestacados.length
      ? `<p style="font-size:9pt;margin-top:2mm"><b>Falló y la mayoría acertó:</b></p><ul style="margin:0 0 0 5mm;font-size:9pt;line-height:1.5">${
          e.fallosDestacados.map(p => `<li>${p.numero}. ${esc(p.enunciado || `Pregunta ${p.numero}`)}${publicable ? ` <span style="${mono}">(acierto del grupo ${p.pctGrupo} %)</span>` : ''}</li>`).join('')
        }</ul>`
      : `<p class="vacio">No falló ninguna pregunta que la mayoría acertara.</p>`
    const ejes = e.ejes.length
      ? `<p style="font-size:9pt;margin-top:2mm">${e.ejes.map(x => `${esc(x.nombre)}: <b>${x.pctAlumno} %</b>${publicable ? ` <span style="${mono}">(grupo ${x.pctGrupo} %)</span>` : ''}`).join(' · ')}</p>`
      : ''
    secciones.push(seccion(num(), `${e.titulo}${e.unidad ? ` · ${e.unidad}` : ''}`,
      `<p style="font-size:9.5pt">Nota <b style="color:${tinta(e.nota.valor)}">${e.nota.valor == null ? '—' : nota(e.nota.valor)}</b>${
        publicable ? ` · grupo: media ${nota(e.nota.grupo!.media)}, mediana ${nota(e.nota.grupo!.mediana)}, moda ${esc(textoDeModa(e.nota.grupo!.moda, e.nota.grupo!.n))}` : ''}</p>${ejes}${fallos}`))
  }

  const contenido = `
    ${cabecera('Análisis del alumno')}
    <p class="kicker">${esc(d.area)}</p>
    <h1 class="display">${esc(d.alumno)}</h1>
    <div class="subtitulo">${esc(d.clase)}${d.cursoEscolar ? ` · Curso ${esc(d.cursoEscolar)}` : ''}</div>
    ${secciones.join('\n')}
    ${pie('Documento con datos personales de un menor: guárdalo y compártelo solo con quien deba conocerlo. «med.» es la mediana del grupo.')}
  `
  return documento(`Análisis · ${d.alumno} · ${d.area}`, [hoja(contenido)])
}
