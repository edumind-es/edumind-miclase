/**
 * El informe de UN alumno en una prueba, compuesto en Sistema Lámina.
 *
 * Es el reverso del informe de la prueba (`informePrueba.ts`), que es del
 * grupo y no nombra a nadie: este lleva nombre y sirve para una tutoría o
 * para la familia. Dice la nota, cómo le fue en cada etiqueta (aspecto) o
 * criterio, y qué preguntas falló. Las cifras de la clase solo se imprimen
 * con `MINIMO_GRUPO` exámenes corregidos o más —de menos se deducen las de
 * los compañeros—, y el grupo «de media parecida» no se imprime nunca: es
 * una herramienta de la pantalla del docente.
 *
 * Puro: recibe el análisis ya calculado (`analizarExamen`) y devuelve HTML.
 */
import { documento, hoja, cabecera, pie, seccion, esc, nota, tinta } from './lamina'
import { grupoPublicable, type AnalisisExamen, type PreguntaAnalizada } from '../db/analisisAlumno'
import { TIPOS_PRUEBA, type PruebaDef } from '../db/prueba'

export type DatosInformeAlumnoPrueba = {
  alumno: string
  clase: string
  area: string
  unidad?: string | null
  def: PruebaDef
  /** El examen del alumno frente a TODA la clase. */
  analisis: AnalisisExamen
}

const tintaPct = (p: number) => tinta(p / 10)
const barra = (p: number) => `<div class="barra"><div class="pista"><div class="relleno" style="width:${Math.max(0, Math.min(100, p))}%;background:${tintaPct(p)}"></div></div></div>`
const sello = (t: string) => ` <span class="sello" style="font-size:6.5pt;margin-left:2mm">${esc(t)}</span>`

function filaPregunta(p: PreguntaAnalizada, conClase: boolean): string {
  return `<tr>
    <td class="n" style="width:9mm">${p.numero}</td>
    <td>${esc(p.enunciado || `Pregunta ${p.numero}`)}${p.aspecto ? sello(p.aspecto) : ''}</td>
    <td class="criterio-id">${esc(p.criterio_id ?? 'Todos')}</td>
    <td class="n" style="white-space:nowrap;color:${tintaPct(p.pctAlumno)}">${nota(p.obtenido, 2)} / ${nota(p.max, 2)}</td>
    ${conClase ? `<td class="n">${p.pctGrupo} %</td>` : ''}
  </tr>`
}

function tablaPreguntas(ps: PreguntaAnalizada[], conClase: boolean): string {
  return `<table>
    <thead><tr><th class="n" style="width:9mm">N.º</th><th>Pregunta</th><th>Criterio</th><th class="n">Puntos</th>${conClase ? '<th class="n">Acierto de la clase</th>' : ''}</tr></thead>
    <tbody>${ps.map(p => filaPregunta(p, conClase)).join('')}</tbody>
  </table>`
}

export function documentoInformeAlumnoPrueba(d: DatosInformeAlumnoPrueba): string {
  const a = d.analisis
  const conClase = grupoPublicable(a.nota)
  const tipo = TIPOS_PRUEBA.find(t => t.valor === d.def.tipo)?.nombre ?? d.def.tipo
  const que = a.ejesPor === 'aspecto' ? 'etiqueta' : 'criterio'

  const resultado = `<div class="metas">
      <span>Nota <b style="color:${tinta(a.nota.valor)}">${a.nota.valor == null ? '—' : nota(a.nota.valor)}</b></span>
      <span>Preguntas <b>${a.preguntas.length}</b></span>
      <span>Falladas <b>${a.falladas.length}</b></span>
      ${conClase ? `<span>Media de la clase <b>${nota(a.nota.grupo!.media)}</b></span><span>Mediana <b>${nota(a.nota.grupo!.mediana)}</b></span>` : ''}
    </div>${conClase ? '' : '<p class="vacio">Hay pocos exámenes corregidos: no se dan las cifras de la clase.</p>'}`

  const ejes = a.ejes.length
    ? `<table>
      <thead><tr><th>${a.ejesPor === 'aspecto' ? 'Etiqueta' : 'Criterio'}</th><th class="n">Su acierto</th><th style="width:30mm"></th>${conClase ? '<th class="n">La clase</th>' : ''}</tr></thead>
      <tbody>${[...a.ejes].sort((x, y) => x.pctAlumno - y.pctAlumno).map(e => `<tr data-eje="${esc(e.nombre)}">
        <td>${esc(e.nombre)}</td>
        <td class="n" style="color:${tintaPct(e.pctAlumno)}"><b>${e.pctAlumno} %</b></td>
        <td>${barra(e.pctAlumno)}</td>
        ${conClase ? `<td class="n">${e.pctGrupo} %</td>` : ''}
      </tr>`).join('')}</tbody>
    </table>`
    : `<p class="vacio">El examen no tiene preguntas que agrupar.</p>`

  const falladas = a.falladas.length
    ? tablaPreguntas(a.falladas, conClase)
      + (conClase && a.fallosDestacados.length
        ? `<p style="font-size:8.5pt;color:var(--lm-ink-2);margin-top:2mm">Van primero las que más acierta la clase: son las que más conviene repasar. La mayoría de la clase acertó ${a.fallosDestacados.length === 1 ? `la ${a.fallosDestacados[0].numero}` : `estas ${a.fallosDestacados.length}: ${a.fallosDestacados.map(p => p.numero).join(', ')}`}.</p>`
        : '')
    : `<p class="vacio">No falló ninguna pregunta.</p>`

  const contenido = `
    ${cabecera('Informe de la prueba · alumno')}
    <div class="kicker">Prueba escrita · ${esc(tipo)} · ${esc(a.titulo)}</div>
    <h1 class="display">${esc(d.alumno)}</h1>
    <div class="subtitulo">${esc(d.clase)} · ${esc(d.area)}${d.unidad ? ` · ${esc(d.unidad)}` : ''}</div>
    ${seccion('01', 'Resultado', resultado)}
    ${seccion('02', `Cómo le fue por ${que}`, ejes)}
    ${seccion('03', 'Preguntas falladas', falladas)}
    ${seccion('04', 'El examen, pregunta a pregunta', tablaPreguntas(a.preguntas, conClase))}
    ${pie('Documento con datos personales de un menor: guárdalo y compártelo solo con quien deba conocerlo. Una pregunta cuenta como fallada con menos de la mitad de sus puntos.')}
  `
  return documento(`Informe · ${a.titulo} · ${d.alumno}`, [hoja(contenido)])
}
