/**
 * El informe de una prueba, compuesto en Sistema Lámina.
 *
 * Una lámina (o dos, si el examen es largo) con lo que el docente quiere
 * saber después de corregir: cómo ha ido la clase, qué preguntas se fallan
 * más y cuáles se aciertan, qué nota media sale por criterio, y la lectura
 * de qué aspectos fallan con su gráfico radial. Sin nombres de alumnos: es
 * un informe del grupo, no de nadie.
 *
 * Puro: recibe el informe ya calculado (`db/informePrueba.ts`) y devuelve
 * HTML. Imprimir y guardar van por `imprimir` y `descargarHTML` de `lamina`.
 */
import { documento, hoja, cabecera, pie, seccion, esc, nota, tinta } from './lamina'
import { radialSVG, type InformePrueba, type EstadisticaPregunta } from '../db/informePrueba'
import { TIPOS_PRUEBA, type PruebaDef } from '../db/prueba'

export type ContextoInforme = {
  grupo: string
  area: string
  unidad?: string | null
  /** Descripción de cada criterio, del currículo, si se tiene. */
  descripciones?: Map<string, string>
}

function metas(pares: [string, string][]): string {
  return `<div class="metas">${pares.map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('')}</div>`
}

/** Tinta por índice de acierto, con los mismos tramos que una nota. */
const tintaPct = (p: number) => tinta(p / 10)

function barraPct(p: number): string {
  return `<div class="barra"><div class="pista"><div class="relleno" style="width:${Math.max(0, Math.min(100, p))}%;background:${tintaPct(p)}"></div></div></div>`
}

function filaPregunta(p: EstadisticaPregunta, esTest: boolean): string {
  const detalle = esTest
    ? `${p.aciertos} · ${p.fallos} · ${p.enBlanco}${p.sinAnotar ? ` (+${p.sinAnotar} sin anotar)` : ''}`
    : `${nota(p.media, 2)} / ${nota(p.max, 2)}`
  return `<tr>
    <td class="n" style="width:9mm">${p.numero}</td>
    <td>${esc(p.enunciado || `Pregunta ${p.numero}`)}${p.aspecto ? ` <span class="sello" style="font-size:6.5pt;margin-left:2mm">${esc(p.aspecto)}</span>` : ''}</td>
    <td class="criterio-id">${esc(p.criterio_id ?? 'Todos')}</td>
    <td style="font-family:var(--lm-mono);font-size:8pt;white-space:nowrap">${detalle}</td>
    <td class="n" style="color:${tintaPct(p.pctAcierto)}">${nota(p.pctAcierto, 0)} %</td>
    <td style="width:26mm">${barraPct(p.pctAcierto)}</td>
  </tr>`
}

export function documentoInformePrueba(inf: InformePrueba, def: PruebaDef, ctx: ContextoInforme): string {
  const esTest = def.tipo === 'test'
  const tipo = TIPOS_PRUEBA.find(t => t.valor === def.tipo)?.nombre ?? def.tipo
  const descripcion = (c: string) => ctx.descripciones?.get(c) ?? ''

  // ── 01 · La clase
  const resumen = inf.alumnos === 0
    ? `<p class="vacio">Todavía no hay ningún alumno corregido con este examen.</p>`
    : metas([
      ['Corregidos', String(inf.alumnos)],
      ['Nota media', nota(inf.notaMedia)],
      ['Aprueban', `${inf.aprobados} (${Math.round((inf.aprobados / inf.alumnos) * 100)} %)`],
      ['Suspenden', String(inf.suspensos)],
      ['Preguntas', String(inf.preguntas.length)],
    ])

  // ── 02 · Qué falla
  const ejesTitulo = inf.ejesPor === 'aspecto' ? 'Acierto por aspecto' : 'Acierto por criterio'
  const lectura = `<ul style="margin:0 0 0 5mm;font-size:9.5pt;line-height:1.55">${inf.lectura.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`
  const radial = inf.alumnos > 0 && inf.ejes.length > 0
    ? `<div style="display:flex;gap:6mm;align-items:flex-start;margin-top:3mm">
        <div style="flex:0 0 auto">${radialSVG(inf.ejes, { lado: 300, tinta: '#1c1a16', relleno: '#3f7d99', papel: '#c7c0b1' })}</div>
        <div style="flex:1">
          <div class="sub" style="margin-top:0">${esc(ejesTitulo)}</div>
          <table><thead><tr><th>${inf.ejesPor === 'aspecto' ? 'Aspecto' : 'Criterio'}</th><th>Preguntas</th><th class="n">Acierto</th></tr></thead>
          <tbody>${[...inf.ejes].sort((a, b) => a.pctAcierto - b.pctAcierto).map(e => `<tr>
            <td>${esc(e.nombre)}</td>
            <td style="font-family:var(--lm-mono);font-size:8pt">${e.preguntas.join(', ')}</td>
            <td class="n" style="color:${tintaPct(e.pctAcierto)}">${nota(e.pctAcierto, 0)} %</td>
          </tr>`).join('')}</tbody></table>
        </div>
      </div>`
    : ''

  // ── 03 · Pregunta a pregunta, de más fallada a más acertada
  const tablaPreguntas = `<table>
    <thead><tr><th class="n" style="width:9mm">N.º</th><th>Pregunta</th><th>Criterio</th><th>${esTest ? 'Aciertos · fallos · en blanco' : 'Media / vale'}</th><th class="n">Acierto</th><th></th></tr></thead>
    <tbody>${inf.porDificultad.map(p => filaPregunta(p, esTest)).join('')}</tbody>
  </table>`

  // ── 04 · Por criterio
  const tablaCriterios = inf.porCriterio.length
    ? `<table>
      <thead><tr><th>Criterio</th><th>Descripción</th><th class="n">Media</th><th></th></tr></thead>
      <tbody>${inf.porCriterio.map(c => `<tr>
        <td class="criterio-id">${esc(c.criterio_id)}</td>
        <td class="desc">${esc(descripcion(c.criterio_id)) || (c.n === 0 ? 'Ninguna pregunta nombra este criterio.' : '')}</td>
        <td class="n" style="color:${tinta(c.media)}">${nota(c.media)}</td>
        <td style="width:26mm">${c.media != null ? barraPct(c.media * 10) : ''}</td>
      </tr>`).join('')}</tbody>
    </table>`
    : `<p class="vacio">El instrumento no evalúa ningún criterio en esta unidad.</p>`

  const cuerpo1 = `
    ${cabecera('Informe de la prueba')}
    <div class="kicker">Prueba escrita · ${esc(tipo)}</div>
    <h1 class="display">${esc(def.titulo)}</h1>
    <div class="subtitulo">${esc(ctx.grupo)} · ${esc(ctx.area)}${ctx.unidad ? ` · ${esc(ctx.unidad)}` : ''}</div>
    ${seccion('01', 'Cómo ha ido la clase', resumen)}
    ${seccion('02', 'Qué falla y qué está asentado', lectura + radial)}
    ${pie('Las notas de cada alumno están en el Calificador; aquí solo se mira el grupo.')}
  `
  const cuerpo2 = `
    ${cabecera('Informe de la prueba · detalle')}
    ${seccion('03', 'Pregunta a pregunta, de más fallada a más acertada', tablaPreguntas)}
    ${seccion('04', 'Nota media por criterio', tablaCriterios)}
    ${pie()}
  `
  return documento(`Informe · ${def.titulo}`, [hoja(cuerpo1), hoja(cuerpo2)])
}
