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

// ─── Formato de una página ───────────────────────────────────────────────
//
// Lo que se da al alumno o a la familia: cabe en un A4. Una sola tabla con
// cada pregunta, sus puntos y el nivel de la rúbrica de corrección que se le
// marcó, en vez de las cuatro secciones del informe completo. La letra baja
// según cuánto texto haya (`densidadUnaPagina`), porque el documento no puede
// medirse a sí mismo al imprimir (en el iPad lo compone el plugin nativo).

/** Alto útil para la tabla en una hoja A4, en mm, descontando cabecera, resumen y pie. */
const ALTO_TABLA_MM = 210
const TAMANOS_PT = [9, 8.5, 8, 7.5, 7, 6.5, 6]

/** Cuántas líneas ocupa un texto en una columna de `ancho` mm con letra de `pt` puntos. */
function lineas(texto: string, ancho: number, pt: number): number {
  const porLinea = Math.max(8, Math.floor(ancho / (pt * 0.3528 * 0.54)))
  // Se parte por palabras: una línea nunca se llena del todo.
  return Math.max(1, Math.ceil(texto.length * 1.15 / porLinea))
}

/** Margen arriba y abajo de cada fila: con la letra mínima, también se aprieta. */
const relleno_mm = (pt: number) => pt >= 7 ? 1.2 : 0.7

/** El tamaño de letra (pt) más grande con el que la tabla cabe en la hoja. Puro, se prueba aparte. */
export function densidadUnaPagina(ps: (Pick<PreguntaAnalizada, 'enunciado' | 'nivel' | 'criterio_id'> & Partial<Pick<PreguntaAnalizada, 'clave' | 'correccion'>>)[]): number {
  for (const pt of TAMANOS_PT) {
    const linea = pt * 0.3528 * 1.3
    const relleno = relleno_mm(pt) * 2 + 0.4
    // Clave y corrección van en letra un 15 % menor, bajo la pregunta y bajo el nivel.
    const menor = (t: string | false | null | undefined, ancho: number) => t ? 0.85 * lineas(t, ancho / 0.85, pt) : 0
    const alto = ps.reduce((s, p) => s + relleno + linea * Math.max(
      lineas(p.enunciado + (p.criterio_id ? ` ${p.criterio_id}` : ''), 56, pt) + menor(p.clave && `Respuesta: ${p.clave}`, 56),
      lineas(p.nivel ?? '', 84, pt) + menor(!p.nivel && p.correccion && `Corrección: ${p.correccion}`, 84),
    ), 6)
    if (alto <= ALTO_TABLA_MM) return pt
  }
  return TAMANOS_PT[TAMANOS_PT.length - 1]
}

const CSS_UNA_PAGINA = `
.breve .kicker { margin: 4mm 0 1mm; }
.breve h1 { font-family: var(--lm-display); font-weight: 800; font-size: 17pt; line-height: 1.05; letter-spacing: -.02em; margin: 0; }
.breve .subtitulo { font-size: 9pt; margin-top: 1mm; }
.breve .metas { margin-top: 3mm; }
.breve .metas span { padding: 1.5mm 3mm 1.5mm 0; margin-right: 3mm; }
.breve .linea { font-size: 8.5pt; color: var(--lm-ink-2); margin-top: 2mm; line-height: 1.45; }
.breve .linea b { color: var(--lm-ink); }
.breve table { margin-top: 3mm; table-layout: fixed; }
.breve th, .breve td { padding: var(--pad, 1.2mm) 2mm var(--pad, 1.2mm) 0; }
.breve td { line-height: 1.3; }
.breve th.n, .breve td.n { width: auto; padding-right: 2mm; }
.breve th:last-child, .breve td:last-child { padding-right: 0; }
.breve .nivel { color: var(--lm-ink); }
.breve .nivel.sin { font-style: italic; color: var(--lm-ink-3); }
.breve .det { display: block; font-size: .85em; color: var(--lm-ink-2); margin-top: .4mm; }
.breve .det b { font-weight: 600; color: var(--lm-ink); }
.breve .crit { font-family: var(--lm-mono); font-weight: 600; font-size: .85em; color: var(--lm-ink-2); white-space: nowrap; }
.breve .pie { margin-top: 4mm; padding-top: 2mm; font-size: 6.5pt; line-height: 1.4; }
`

// Es un documento personal: ninguna cifra de la clase, solo su corrección.
// El reparto de puntos sale solo si no hay nivel de rúbrica marcado: el
// nivel ya dice por qué tiene esos puntos, y repetirlo no deja caber la hoja.
function filaBreve(p: PreguntaAnalizada): string {
  const nivel = !p.anotada ? 'Sin anotar' : p.nivel ?? '—'
  return `<tr data-pregunta="${p.numero}">
    <td class="n">${p.numero}</td>
    <td>${esc(p.enunciado || `Pregunta ${p.numero}`)}${p.criterio_id ? ` <span class="crit">${esc(p.criterio_id)}</span>` : ''}${p.clave ? `<span class="det" data-clave><b>Respuesta:</b> ${esc(p.clave)}</span>` : ''}</td>
    <td class="n" style="white-space:nowrap;color:${tintaPct(p.pctAlumno)}">${nota(p.obtenido, 2)} / ${nota(p.max, 2)}</td>
    <td><span class="nivel${p.anotada && p.nivel ? '' : ' sin'}" data-nivel>${esc(nivel)}</span>${p.correccion && !p.nivel ? `<span class="det" data-correccion><b>Corrección:</b> ${esc(p.correccion)}</span>` : ''}</td>
  </tr>`
}

/** La hoja de una página de un alumno. `documentoUnaPagina` junta una o varias. */
export function hojaInformeAlumnoPruebaBreve(d: DatosInformeAlumnoPrueba): string {
  const a = d.analisis
  const tipo = TIPOS_PRUEBA.find(t => t.valor === d.def.tipo)?.nombre ?? d.def.tipo
  const pt = densidadUnaPagina(a.preguntas)
  const obtenido = a.preguntas.reduce((s, p) => s + Math.max(0, p.obtenido), 0)
  const maximo = a.preguntas.reduce((s, p) => s + p.max, 0)
  const que = a.ejesPor === 'aspecto' ? 'etiqueta' : 'criterio'
  const ejes = a.ejes.length > 1
    ? `<div class="linea" data-ejes>Por ${que}: ${[...a.ejes].sort((x, y) => x.pctAlumno - y.pctAlumno)
      .map(e => `${esc(e.nombre)} <b style="color:${tintaPct(e.pctAlumno)}">${e.pctAlumno} %</b>`).join(' · ')}</div>`
    : ''
  const repasar = a.falladas.length
    ? `<div class="linea" data-repasar>Para repasar: <b>${[...a.falladas].sort((x, y) => x.numero - y.numero).map(p => p.numero).join(', ')}</b> (menos de la mitad de sus puntos).</div>`
    : `<div class="linea" data-repasar>No falló ninguna pregunta.</div>`

  const contenido = `
    ${cabecera('Informe de la prueba · alumno')}
    <div class="kicker">${esc(tipo)} · ${esc(a.titulo)}</div>
    <h1>${esc(d.alumno)}</h1>
    <div class="subtitulo">${esc(d.clase)} · ${esc(d.area)}${d.unidad ? ` · ${esc(d.unidad)}` : ''}</div>
    <div class="metas">
      <span>Nota <b style="color:${tinta(a.nota.valor)}">${a.nota.valor == null ? '—' : nota(a.nota.valor)}</b></span>
      <span>Puntos <b>${nota(obtenido, 2)} / ${nota(maximo, 2)}</b></span>
      <span>Preguntas <b>${a.preguntas.length}</b></span>
    </div>
    ${ejes}
    ${repasar}
    <table style="font-size:${pt}pt;--pad:${relleno_mm(pt)}mm" data-una-pagina-pt="${pt}">
      <colgroup><col style="width:9mm"><col style="width:58mm"><col style="width:22mm"><col></colgroup>
      <thead><tr><th class="n">N.º</th><th>Pregunta</th><th class="n">Puntos</th><th>Nivel alcanzado</th></tr></thead>
      <tbody>${a.preguntas.map(filaBreve).join('')}</tbody>
    </table>
    ${pie('Datos personales de un menor: compártelo solo con quien deba conocerlo.')}
  `
  return hoja(contenido).replace('<div class="hoja">', '<div class="hoja breve" data-informe-una-pagina>')
}

/** Uno o varios alumnos, una hoja A4 cada uno. */
export function documentoUnaPagina(titulo: string, datos: DatosInformeAlumnoPrueba[]): string {
  return documento(titulo, datos.map(hojaInformeAlumnoPruebaBreve))
    .replace('</style>', `${CSS_UNA_PAGINA}</style>`)
}
