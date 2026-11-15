/**
 * El informe de UN alumno en una actividad evaluada con rúbrica (o lista de
 * control, o escala) o con el diario, compuesto en Sistema Lámina.
 *
 * Como el del examen (`informeAlumnoPrueba.ts`): lleva nombre, sirve para una
 * tutoría o para la familia, y las cifras de la clase solo se imprimen con
 * `MINIMO_GRUPO` notas o más. Las observaciones que el docente escribió en
 * cada registro NO salen salvo que lo pida (`conObservaciones`): suelen ser
 * notas para él.
 *
 * Puro: recibe el análisis ya calculado (`analizarActividad`) y devuelve HTML.
 */
import { documento, hoja, cabecera, pie, seccion, esc, nota, tinta } from './lamina'
import { grupoPublicable, MINIMO_GRUPO } from '../db/analisisAlumno'
import { etiquetaAgregacion } from '../db/diario'
import type { AnalisisActividad, IndicadorAnalizado } from '../db/informeActividad'

export type DatosInformeAlumnoActividad = {
  alumno: string
  clase: string
  area: string
  trimestre: number
  /** La actividad del alumno frente a TODA la clase. */
  analisis: AnalisisActividad
  conObservaciones?: boolean
}

const tintaPct = (p: number) => tinta(p / 10)
const barra = (p: number) => `<div class="barra"><div class="pista"><div class="relleno" style="width:${Math.max(0, Math.min(100, p))}%;background:${tintaPct(p)}"></div></div></div>`

/** «12·11·2026», en la hora del aparato. */
export function fechaCorta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(d.getDate())}·${dos(d.getMonth() + 1)}·${d.getFullYear()}`
}

export const TEXTO_TENDENCIA = { sube: 'Va a más', baja: 'Va a menos', estable: 'Se mantiene' } as const

function filaIndicador(i: IndicadorAnalizado, conClase: boolean): string {
  const publicable = conClase && i.nGrupo >= MINIMO_GRUPO && i.pctGrupo != null
  return `<tr data-indicador="${esc(i.nombre)}">
    <td>${esc(i.nombre)}${i.descriptor ? `<div style="font-size:8pt;color:var(--lm-ink-2)">${esc(i.descriptor)}</div>` : ''}</td>
    <td style="white-space:nowrap${i.pctAlumno != null ? `;color:${tintaPct(i.pctAlumno)}` : ''}"><b>${esc(i.nivel ?? (i.valor != null ? String(i.valor) : 'Sin marcar'))}</b></td>
    <td style="width:26mm">${i.pctAlumno != null ? barra(i.pctAlumno) : ''}</td>
    ${conClase ? `<td class="n">${publicable ? `${i.pctGrupo} %` : '—'}</td>` : ''}
  </tr>`
}

function tablaIndicadores(is: IndicadorAnalizado[], conClase: boolean): string {
  return `<table>
    <thead><tr><th>Indicador</th><th>Su nivel</th><th></th>${conClase ? '<th class="n">La clase</th>' : ''}</tr></thead>
    <tbody>${is.map(i => filaIndicador(i, conClase)).join('')}</tbody>
  </table>`
}

export function documentoInformeAlumnoActividad(d: DatosInformeAlumnoActividad): string {
  const a = d.analisis
  const conClase = grupoPublicable(a.nota)
  const esRubrica = a.herramienta === 'rubrica'

  const resultado = `<div class="metas">
      <span>Nota <b style="color:${tinta(a.nota.valor)}">${a.nota.valor == null ? '—' : nota(a.nota.valor)}</b></span>
      ${esRubrica ? `<span>Indicadores <b>${a.indicadores.length}</b></span><span>A mejorar <b>${a.flojos.length}</b></span>` : ''}
      ${a.registros.length ? `<span>Registros <b>${a.registros.length}</b></span>` : ''}
      ${a.tendencia ? `<span>Evolución <b>${TEXTO_TENDENCIA[a.tendencia]}</b></span>` : ''}
      ${conClase ? `<span>Media de la clase <b>${nota(a.nota.grupo!.media)}</b></span><span>Mediana <b>${nota(a.nota.grupo!.mediana)}</b></span>` : ''}
    </div>${conClase ? '' : '<p class="vacio">Hay pocas notas en esta actividad: no se dan las cifras de la clase.</p>'}`

  const secciones: string[] = [seccion('01', 'Resultado', resultado)]
  const numero = () => String(secciones.length + 1).padStart(2, '0')

  if (esRubrica) {
    secciones.push(seccion(numero(), 'A mejorar', a.flojos.length === a.indicadores.length && a.flojos.length
      ? `<p class="vacio">Todos los indicadores quedan por debajo de la mitad: son los de la tabla siguiente.</p>`
      : a.flojos.length
      ? tablaIndicadores(a.flojos, conClase)
      : `<p class="vacio">Ningún indicador queda por debajo de la mitad.</p>`))
    secciones.push(seccion(numero(), 'Indicador a indicador', a.indicadores.length
      ? tablaIndicadores(a.indicadores, conClase)
        + (a.sinMarcar ? `<p style="font-size:8.5pt;color:var(--lm-ink-2);margin-top:2mm">${a.sinMarcar === 1 ? 'Un indicador está' : `${a.sinMarcar} indicadores están`} sin marcar: no cuenta${a.sinMarcar === 1 ? '' : 'n'} en la nota.</p>` : '')
      : `<p class="vacio">La rúbrica no tiene indicadores.</p>`))
  }

  if (a.registros.length) {
    const conObs = !!d.conObservaciones && a.registros.some(r => r.observacion)
    const filas = a.registros.map(r => `<tr>
        <td style="white-space:nowrap">${esc(fechaCorta(r.fecha))}</td>
        <td>${esc(r.etiqueta ?? 'Con la rúbrica')}</td>
        <td class="n" style="color:${tinta(r.nota)}"><b>${nota(r.nota)}</b></td>
        ${conObs ? `<td>${esc(r.observacion ?? '')}</td>` : ''}
      </tr>`).join('')
    secciones.push(seccion(numero(), esRubrica ? 'Cómo ha ido evolucionando' : 'Registro a registro', `<table>
        <thead><tr><th>Día</th><th>Valoración</th><th class="n">Nota</th>${conObs ? '<th>Observación</th>' : ''}</tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <p style="font-size:8.5pt;color:var(--lm-ink-2);margin-top:2mm">Con varios registros, la nota es: ${esc(etiquetaAgregacion(a.agregacion).toLowerCase())}.</p>`))
  }

  const contenido = `
    ${cabecera('Informe de la actividad · alumno')}
    <div class="kicker">${esRubrica ? 'Rúbrica' : 'Diario de observación'} · ${esc(a.titulo)}</div>
    <h1 class="display">${esc(d.alumno)}</h1>
    <div class="subtitulo">${esc(d.clase)} · ${esc(d.area)}${a.unidad ? ` · ${esc(a.unidad)}` : ''} · ${d.trimestre}.º trimestre · ${esc(a.instrumento)}</div>
    ${secciones.join('')}
    ${pie('Documento con datos personales de un menor: guárdalo y compártelo solo con quien deba conocerlo. Un indicador queda «a mejorar» con menos de la mitad del nivel más alto.')}
  `
  return documento(`Informe · ${a.titulo} · ${d.alumno}`, [hoja(contenido)])
}
