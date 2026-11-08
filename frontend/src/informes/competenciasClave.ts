/**
 * Informe de competencias clave, en Sistema Lámina:
 *   · por alumno: una lámina con el nivel de cada competencia clave y de cada
 *     descriptor operativo, y de qué criterios y áreas sale;
 *   · del grupo: niveles de cada alumno por competencia y reparto del grupo
 *     por niveles en cada competencia y descriptor.
 *
 * Solo compone HTML: los números llegan hechos de `db/competenciasClave.ts`.
 */
import { documento, hoja, cabecera, pie, seccion, esc, nota, tinta, barraNota } from './lamina'
import {
  COMPETENCIAS_CLAVE, NOMBRES_COMPETENCIA, NIVELES_DESARROLLO, nivelDesarrollo, notaEnPeriodo,
  resumenDelGrupo, type Descriptor, type PerfilCompetenciasClave, type NotaDescriptor,
} from '@/db/competenciasClave'

export type AlumnoCompetencias = { nombre: string; apellidos: string; perfil: PerfilCompetenciasClave }

export type ContextoCompetencias = {
  /** «5ºA · 5º de Educación Primaria · Curso 2026-2027» */
  titulo: string
  etapa: 'primaria' | 'secundaria' | string
  catalogo: Descriptor[]
  /** Trimestre del informe; null = final del curso */
  periodo: number | null
}

function etiquetaPeriodo(p: number | null) {
  return p == null ? 'final del curso' : p === 1 ? '1er trimestre' : p === 2 ? '2º trimestre' : '3er trimestre'
}

function norma(etapa: string) {
  return etapa === 'secundaria' ? 'Real Decreto 217/2022' : 'Real Decreto 157/2022'
}

function celdaNivel(v: number | null): string {
  const n = nivelDesarrollo(v)
  if (!n) return `<td class="n" style="color:var(--lm-ink-3);white-space:nowrap">Sin evidencias</td>`
  return `<td class="n" data-nivel="${n.nivel}" style="color:${tinta(v)};font-weight:700;white-space:nowrap;padding-left:4mm">${esc(n.nombre)} (${n.nivel})</td>`
}

const mono = (t: string) =>
  `<span style="font-family:var(--lm-mono);font-size:6.5pt;color:var(--lm-ink-3)">${t}</span>`

function leyenda(): string {
  return 'Niveles de desarrollo: ' + NIVELES_DESARROLLO.map((n, i) => {
    const hasta = NIVELES_DESARROLLO[i + 1]?.desde
    return `${n.nivel} ${n.nombre} (${hasta == null ? `≥ ${nota(n.desde, 0)}` : `${nota(n.desde, 0)}–${nota(hasta - 0.1)}`})`
  }).join(' · ') + '.'
}

/** Áreas y criterios de los que sale un descriptor, en una línea. */
function rastro(d: NotaDescriptor, periodo: number | null): string {
  const porArea = new Map<string, string[]>()
  for (const a of d.aportes) {
    if (notaEnPeriodo(a.nota, periodo) == null) continue
    const l = porArea.get(a.area) ?? []
    l.push(esc(a.criterio_id) + (a.origen === 'estatal' ? '†' : ''))
    porArea.set(a.area, l)
  }
  return [...porArea.entries()].map(([area, crit]) => {
    const enArea = d.areas.find(x => x.area === area)
    const v = enArea ? notaEnPeriodo(enArea, periodo) : null
    return `${esc(area)} ${nota(v)} (${crit.join(' ')})`
  }).join(' · ')
}

/** Tabla de competencias clave de un alumno; vacía si no hay nada en el periodo. */
function tablaCompetenciasClave(perfil: PerfilCompetenciasClave, p: number | null): string {
  const competencias = perfil.competencias.filter(c => notaEnPeriodo(c, p) != null)
  const descriptores = perfil.descriptores.filter(d => notaEnPeriodo(d, p) != null)
  return competencias.length
    ? `<table><thead><tr>
        <th>Competencia clave</th><th class="n">Nota</th><th class="n">Nivel</th><th></th>
      </tr></thead><tbody>${competencias.map(c => {
        const v = notaEnPeriodo(c, p)
        const descs = c.descriptores.filter(id => descriptores.some(d => d.id === id))
        return `<tr data-competencia="${esc(c.id)}">
          <td><b>${esc(c.id)}</b> · ${esc(NOMBRES_COMPETENCIA[c.id] ?? '')}<br>${mono(
            esc(descs.join(' ')) + (c.directa && notaEnPeriodo(c.directa, p) != null ? `${descs.length ? ' · ' : ''}sin descriptor: ${nota(notaEnPeriodo(c.directa, p))}` : ''))}</td>
          <td class="n" style="color:${tinta(v)}">${nota(v)}</td>
          ${celdaNivel(v)}
          <td style="width:28mm">${barraNota(v)}</td>
        </tr>`
      }).join('')}</tbody></table>`
    : ''
}

/** El bloque del informe individual: la tabla y cómo leerla. Vacío si no hay datos. */
export function bloqueCompetenciasClave(perfil: PerfilCompetenciasClave, periodo: number | null): string {
  const tabla = tablaCompetenciasClave(perfil, periodo)
  return tabla && `${tabla}<p class="sub">${leyenda()}</p>`
}

function laminaAlumno(al: AlumnoCompetencias, ctx: ContextoCompetencias): string {
  const { perfil, } = al
  const p = ctx.periodo
  const textoDe = new Map(ctx.catalogo.map(d => [d.id, d.descripcion]))
  const descriptores = perfil.descriptores.filter(d => notaEnPeriodo(d, p) != null)

  const tablaCompetencias = tablaCompetenciasClave(perfil, p)
    || `<p class="vacio">Todavía no hay notas de criterio conectadas con las competencias clave.</p>`

  const bloqueDescriptores = COMPETENCIAS_CLAVE.map(id => {
    const propios = descriptores.filter(d => d.competencia_id === id)
    if (!propios.length) return ''
    return `<p class="sub">${esc(id)} · ${esc(NOMBRES_COMPETENCIA[id])}</p>
      <table><thead><tr>
        <th style="width:16mm">Descriptor</th><th>Descripción y de dónde sale</th><th class="n">Nota</th><th class="n">Nivel</th>
      </tr></thead><tbody>${propios.map(d => {
        const v = notaEnPeriodo(d, p)
        return `<tr data-descriptor="${esc(d.id)}">
          <td class="criterio-id">${esc(d.id)}</td>
          <td class="desc">${esc(textoDe.get(d.id) ?? '')}<br>${mono(rastro(d, p))}</td>
          <td class="n" style="color:${tinta(v)}">${nota(v)}</td>
          ${celdaNivel(v)}
        </tr>`
      }).join('')}</tbody></table>`
  }).join('')

  const avisos: string[] = []
  if (perfil.usaEstatal) {
    avisos.push(`† Conexión tomada del ${norma(ctx.etapa)}: la comunidad no declara con qué descriptores conecta esa competencia específica.`)
  }
  if (perfil.sinConexion.length) {
    avisos.push(`Criterios con nota que no conectan con ningún descriptor ni competencia clave: ${
      perfil.sinConexion.map(s => `${esc(s.criterio_id)} (${esc(s.area)})`).join(', ')}.`)
  }

  const contenido = `
    ${cabecera(`Competencias clave · ${etiquetaPeriodo(p)}`)}
    <p class="kicker">Perfil de salida LOMLOE · Descriptores operativos</p>
    <h1 class="display">${esc(al.apellidos)},<br>${esc(al.nombre)}</h1>
    <p class="subtitulo">${esc(ctx.titulo)}</p>
    <div class="metas">
      <span>Competencias con evidencias <b>${perfil.competencias.filter(c => notaEnPeriodo(c, p) != null).length} de 8</b></span>
      <span>Descriptores con evidencias <b>${descriptores.length}</b></span>
    </div>
    ${seccion('01', 'Nivel por competencia clave', tablaCompetencias)}
    ${descriptores.length ? seccion('02', 'Nivel por descriptor operativo', bloqueDescriptores) : ''}
    ${avisos.length ? `<p class="sub">${avisos.join('<br>')}</p>` : ''}
    ${pie(`${leyenda()} Cada descriptor es la media de las áreas que lo trabajan (dentro de cada área, sus criterios ponderados por la programación); cada competencia, la media de sus descriptores con evidencias.`)}
  `
  return hoja(contenido)
}

/** Un documento con la lámina de competencias clave de cada alumno. */
export function documentoCompetenciasAlumnos(alumnos: AlumnoCompetencias[], ctx: ContextoCompetencias): string {
  const titulo = alumnos.length === 1
    ? `Competencias clave · ${alumnos[0].apellidos}, ${alumnos[0].nombre}`
    : `Competencias clave · ${ctx.titulo}`
  return documento(titulo, alumnos.map(a => laminaAlumno(a, ctx)))
}

function reparto(porNivel: [number, number, number, number]): string {
  return porNivel.map(n => `<td class="n">${n || '·'}</td>`).join('')
}

/** Resumen de competencias clave del grupo. */
export function documentoCompetenciasGrupo(alumnos: AlumnoCompetencias[], ctx: ContextoCompetencias): string {
  const p = ctx.periodo
  const textoDe = new Map(ctx.catalogo.map(d => [d.id, d.descripcion]))
  const resumen = resumenDelGrupo(alumnos.map(a => a.perfil), p)
  const comps = resumen.competencias.filter(c => c.conDatos > 0)
  const descs = resumen.descriptores.filter(d => d.conDatos > 0)
  const cabNiveles = NIVELES_DESARROLLO.map(n => `<th class="n" title="${esc(n.nombre)}">${n.nivel}</th>`).join('')

  const tablaGrupo = comps.length
    ? `<table><thead><tr>
        <th>Competencia clave</th><th class="n">Media</th><th class="n">Alumnos</th>${cabNiveles}
      </tr></thead><tbody>${comps.map(c => `<tr data-competencia="${esc(c.id)}">
        <td><b>${esc(c.id)}</b> · ${esc(NOMBRES_COMPETENCIA[c.id] ?? '')}</td>
        <td class="n" style="color:${tinta(c.media)}">${nota(c.media)}</td>
        <td class="n">${c.conDatos}</td>
        ${reparto(c.porNivel)}
      </tr>`).join('')}</tbody></table>`
    : `<p class="vacio">Todavía no hay notas de criterio conectadas con las competencias clave.</p>`

  const columnas = COMPETENCIAS_CLAVE.filter(id => comps.some(c => c.id === id))
  const tablaAlumnos = columnas.length
    ? `<table><thead><tr><th>Alumno</th>${columnas.map(id => `<th class="n">${esc(id)}</th>`).join('')}</tr></thead>
      <tbody>${alumnos.map(a => `<tr>
        <td>${esc(a.apellidos)}, ${esc(a.nombre)}</td>
        ${columnas.map(id => {
          const c = a.perfil.competencias.find(x => x.id === id)
          const v = c ? notaEnPeriodo(c, p) : null
          const n = nivelDesarrollo(v)
          return n
            ? `<td class="n" data-nivel="${n.nivel}" style="color:${tinta(v)}" title="${esc(n.nombre)} · ${nota(v)}"><b>${n.nivel}</b> ${mono(nota(v))}</td>`
            : `<td class="n" style="color:var(--lm-ink-3)">—</td>`
        }).join('')}
      </tr>`).join('')}</tbody></table>`
    : ''

  const tablaDescriptores = descs.length
    ? `<table><thead><tr>
        <th style="width:16mm">Descriptor</th><th>Descripción</th><th class="n">Media</th><th class="n">Alumnos</th>${cabNiveles}
      </tr></thead><tbody>${descs.map(d => `<tr data-descriptor="${esc(d.id)}">
        <td class="criterio-id">${esc(d.id)}</td>
        <td class="desc">${esc(textoDe.get(d.id) ?? '')}</td>
        <td class="n" style="color:${tinta(d.media)}">${nota(d.media)}</td>
        <td class="n">${d.conDatos}</td>
        ${reparto(d.porNivel)}
      </tr>`).join('')}</tbody></table>`
    : ''

  const usaEstatal = alumnos.some(a => a.perfil.usaEstatal)
  const partes: [string, string][] = [['Competencias clave del grupo', tablaGrupo]]
  if (tablaAlumnos) partes.push(['Nivel de cada alumno por competencia', tablaAlumnos])
  if (tablaDescriptores) partes.push(['Descriptores operativos del grupo', tablaDescriptores])

  const contenido = `
    ${cabecera(`Competencias clave del grupo · ${etiquetaPeriodo(p)}`)}
    <p class="kicker">Perfil de salida LOMLOE · Resumen del grupo</p>
    <h1 class="display">Competencias clave</h1>
    <p class="subtitulo">${esc(ctx.titulo)}</p>
    <div class="metas">
      <span>Alumnado <b>${alumnos.length}</b></span>
      <span>Competencias con evidencias <b>${comps.length} de 8</b></span>
      <span>Descriptores con evidencias <b>${descs.length}</b></span>
    </div>
    ${partes.map(([t, c], i) => seccion(String(i + 1).padStart(2, '0'), t, c)).join('\n')}
    ${usaEstatal ? `<p class="sub">Parte de las conexiones se toma del ${norma(ctx.etapa)}, porque la comunidad no las declara.</p>` : ''}
    ${pie(`${leyenda()} Las columnas 1-4 cuentan alumnos en cada nivel; la media es la de quienes tienen evidencias.`)}
  `
  return documento(`Competencias clave · ${ctx.titulo}`, [hoja(contenido)])
}
