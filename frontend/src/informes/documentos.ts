/**
 * Los tres documentos oficiales de MiClase, compuestos en Sistema Lámina:
 *   · Informe individual de evaluación (una lámina por alumno)
 *   · Boletín de calificaciones del grupo (una lámina por alumno)
 *   · Acta de área (todo el grupo en una tabla)
 */
import {
  documento, hoja, cabecera, pie, seccion, esc, nota, tinta, barraNota,
} from './lamina'
import { calificativo, parsearPesosTrimestres, perfilCompetencial } from '@/db/calculo'
import {
  notasDeAlumno, observacionesDeAlumno,
  type DatosGrupo, type EvidenciaInforme,
} from './datos'
import type { Alumno } from '@/db/localDb'

const TRIM = [1, 2, 3]

function duracion(ms?: number | null): string {
  if (!ms || !Number.isFinite(ms)) return '—'
  const seg = Math.round(ms / 1000)
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
}

function etiquetaTrimestre(t: number) {
  return t === 1 ? '1er trimestre' : t === 2 ? '2º trimestre' : '3er trimestre'
}

function subtituloGrupo(d: DatosGrupo) {
  const etapa = d.grupo.etapa === 'primaria' ? 'Educación Primaria' : 'Educación Secundaria'
  return `${d.grupo.nombre} · ${d.grupo.curso}º de ${etapa} · Curso ${d.grupo.curso_escolar}`
}

function metas(pares: [string, string][]): string {
  return `<div class="metas">${pares
    .map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`)
    .join('')}</div>`
}

function celdaNota(v: number | null | undefined, negrita = false): string {
  const c = calificativo(v)
  return `<td class="n" style="color:${tinta(v)}${negrita ? ';font-weight:700' : ''}">` +
         `${nota(v)}${v != null ? ` <span style="font-size:7pt;opacity:.75">${esc(c.sigla)}</span>` : ''}</td>`
}

// ─── 1 · Informe individual ──────────────────────────────────────────────

export function informeIndividual(
  datos: DatosGrupo,
  alumno: Alumno,
  evidencias: EvidenciaInforme[],
  opciones: { trimestre?: number | null; incluirCriterios?: boolean } = {}
): string {
  const { trimestre = null, incluirCriterios = true } = opciones
  const notas = notasDeAlumno(datos, alumno.id!)
  const conDatos = notas.filter(n => n.nota.criterios.length > 0)
  const observaciones = observacionesDeAlumno(datos, alumno.id!)
    .filter(o => trimestre == null || o.trimestre === trimestre)
  const asist = datos.asistencia.get(alumno.id!) || {}

  // ── 01 · Resultados por área
  const filasArea = conDatos.map(({ area, nota: n }) => {
    const valores = trimestre ? [n.trimestres[trimestre]] : TRIM.map(t => n.trimestres[t])
    return `<tr>
      <td>${esc(area.asig.nombre_display)}</td>
      ${valores.map(v => celdaNota(v)).join('')}
      ${celdaNota(trimestre ? n.trimestres[trimestre] : n.final, true)}
      <td style="width:28mm">${barraNota(trimestre ? n.trimestres[trimestre] : n.final)}</td>
    </tr>`
  }).join('')

  const cabecerasArea = trimestre
    ? `<th>Área</th><th class="n">${esc(etiquetaTrimestre(trimestre))}</th><th class="n">Nota</th><th></th>`
    : `<th>Área</th><th class="n">1er tr.</th><th class="n">2º tr.</th><th class="n">3er tr.</th><th class="n">Final</th><th></th>`

  const bloqueAreas = conDatos.length
    ? `<table><thead><tr>${cabecerasArea}</tr></thead><tbody>${filasArea}</tbody></table>`
    : `<p class="vacio">Todavía no hay calificaciones registradas.</p>`

  // ── 02 · Detalle por criterio
  const bloqueCriterios = !incluirCriterios ? '' : conDatos.map(({ area, nota: n }) => {
    const criterios = n.criterios.filter(c =>
      trimestre == null || c.trimestres[trimestre] != null)
    if (!criterios.length) return ''

    const pesos = parsearPesosTrimestres(area.asig.pesos_trimestres)
    const filas = criterios.map(c => {
      const valores = trimestre ? [c.trimestres[trimestre]] : TRIM.map(t => c.trimestres[t])
      const instrs = [...new Set(c.aportaciones.map(a => a.nombre))].join(', ')
      return `<tr>
        <td class="criterio-id">${esc(c.criterio_id)}</td>
        <td class="desc">${esc(area.descripciones.get(c.criterio_id) || '—')}
          ${instrs ? `<br><span style="font-family:var(--lm-mono);font-size:6.5pt;color:var(--lm-ink-3)">${esc(instrs)}</span>` : ''}
        </td>
        ${valores.map(v => celdaNota(v)).join('')}
        ${celdaNota(trimestre ? c.trimestres[trimestre] : c.final, true)}
      </tr>`
    }).join('')

    const cab = trimestre
      ? `<th style="width:20mm">Criterio</th><th>Descripción e instrumentos</th><th class="n">Nota</th><th class="n">—</th>`
      : `<th style="width:20mm">Criterio</th><th>Descripción e instrumentos</th><th class="n">1T</th><th class="n">2T</th><th class="n">3T</th><th class="n">Final</th>`

    return `<p class="sub">${esc(area.asig.nombre_display)}${
      trimestre ? '' : ` · ponderación ${pesos[1]}/${pesos[2]}/${pesos[3]}`}</p>
      <table><thead><tr>${cab}</tr></thead><tbody>${filas}</tbody></table>`
  }).join('')

  // ── Perfil competencial: cómo va en cada competencia específica
  const bloquePerfil = conDatos.map(({ area, nota: n }) => {
    const perfil = perfilCompetencial(n.criterios, area.pesosCriterio)
      .filter(c => trimestre == null ? c.final != null : c.trimestres[trimestre] != null)
    if (!perfil.length) return ''

    const filas = perfil.map(c => {
      const v = trimestre ? c.trimestres[trimestre] : c.final
      return `<tr>
        <td>${esc(c.etiqueta)}
          <span style="font-family:var(--lm-mono);font-size:6.5pt;color:var(--lm-ink-3)"> ${esc(c.criterios.join(' '))}</span>
        </td>
        ${celdaNota(v, true)}
        <td style="width:38mm">${barraNota(v)}</td>
      </tr>`
    }).join('')

    return `<p class="sub">${esc(area.asig.nombre_display)}</p>
      <table><thead><tr>
        <th>Competencia específica</th><th class="n">Nota</th><th></th>
      </tr></thead><tbody>${filas}</tbody></table>`
  }).filter(Boolean).join('')

  // ── 03 · Observaciones
  const bloqueObs = observaciones.length
    ? observaciones.map(o => `<div class="observacion">
        <span class="flag">${esc(o.criterio)} · T${o.trimestre}${o.area ? ` · ${esc(o.area)}` : ''}</span>
        ${esc(o.texto)}
      </div>`).join('')
    : `<p class="vacio">Sin observaciones registradas.</p>`

  // ── 04 · Evidencias
  const fotos = evidencias.filter(e => e.tipo === 'foto' && e.src)
  const medios = evidencias.filter(e => e.tipo !== 'foto')

  const rejillaFotos = fotos.length
    ? `<div class="evidencias">${fotos.map(ev => `<figure>
        <img src="${ev.src}" alt="Evidencia de aprendizaje">
        <figcaption>${esc(new Date(ev.fecha).toLocaleDateString('es-ES'))}${
          ev.criterio ? ` · ${esc(ev.criterio)}` : ''}${
          ev.descripcion ? `<br>${esc(ev.descripcion)}` : ''}</figcaption>
      </figure>`).join('')}</div>`
    : ''

  // El audio y el vídeo no se imprimen, pero deben constar
  const listaMedios = medios.length
    ? `<p class="sub">Grabaciones — consultables en la app</p>
       <table><thead><tr>
         <th style="width:22mm">Tipo</th><th style="width:22mm">Criterio</th>
         <th>Descripción</th><th class="n">Duración</th><th class="n">Fecha</th>
       </tr></thead><tbody>
       ${medios.map(ev => `<tr>
         <td>${ev.tipo === 'audio' ? 'Audio' : 'Vídeo'}</td>
         <td class="criterio-id">${esc(ev.criterio || '—')}</td>
         <td class="desc">${esc(ev.descripcion || 'Sin descripción')}</td>
         <td class="n">${duracion(ev.duracion_ms)}</td>
         <td class="n">${esc(new Date(ev.fecha).toLocaleDateString('es-ES'))}</td>
       </tr>`).join('')}
       </tbody></table>`
    : ''

  const bloqueEvid = (rejillaFotos || listaMedios)
    ? rejillaFotos + listaMedios
    : `<p class="vacio">Sin evidencias adjuntas.</p>`

  // ── Asistencia
  // El recuento es del mismo periodo que las notas: ver `trimestreAsistencia`.
  const totalSesiones = Object.values(asist).reduce((s, n) => s + n, 0)
  const bloqueAsistencia = totalSesiones
    ? metas([
        ['Sesiones', String(totalSesiones)],
        ['Presente', String(asist.presente || 0)],
        ['Faltas', String(asist.ausente || 0)],
        ['Justificadas', String(asist.justificada || 0)],
        ['Retrasos', String(asist.retraso || 0)],
      ]) + `<p class="sub">Recuento del ${datos.trimestreAsistencia
              ? etiquetaTrimestre(datos.trimestreAsistencia)
              : 'curso completo'}. Los alumnos sin registrar en una sesión no cuentan en ninguna casilla.</p>`
    : ''

  const contenido = `
    ${cabecera(`Informe de evaluación${trimestre ? ` · ${etiquetaTrimestre(trimestre)}` : ' · curso completo'}`)}
    <p class="kicker">Evaluación competencial LOMLOE</p>
    <h1 class="display">${esc(alumno.apellidos)},<br>${esc(alumno.nombre)}</h1>
    <p class="subtitulo">${esc(subtituloGrupo(datos))}</p>
    ${metas([
      ['Clase', datos.grupo.nombre],
      ['Curso escolar', datos.grupo.curso_escolar],
      ['Áreas', String(conDatos.length)],
      ...(alumno.neae ? [['Medidas', 'NEAE'] as [string, string]] : []),
    ])}
    ${bloqueAsistencia}

    ${(() => {
      // Las secciones se numeran según las que realmente aparezcan
      const partes: [string, string][] = [['Resultados por área', bloqueAreas]]
      if (bloquePerfil) partes.push(['Perfil por competencia específica', bloquePerfil])
      if (incluirCriterios && bloqueCriterios) partes.push(['Detalle por criterio de evaluación', bloqueCriterios])
      partes.push(['Observaciones del docente', bloqueObs])
      partes.push([`Evidencias de aprendizaje${evidencias.length ? ` (${evidencias.length})` : ''}`, bloqueEvid])
      return partes.map(([titulo, cuerpo], i) =>
        seccion(String(i + 1).padStart(2, '0'), titulo, cuerpo)).join('\n    ')
    })()}

    <div class="firma">
      <div>El maestro / la maestra</div>
      <div>Vº Bº Dirección</div>
      <div>Recibí · familia</div>
    </div>
    ${pie('Las notas se calculan ponderando el peso de cada instrumento y el reparto por trimestres del área.')}
  `

  return documento(
    `Informe · ${alumno.apellidos}, ${alumno.nombre}`,
    [hoja(contenido)]
  )
}

/** Un solo documento con el informe de todo el grupo, una lámina por alumno. */
export function informesDelGrupo(
  datos: DatosGrupo,
  evidenciasPorAlumno: Map<number, EvidenciaInforme[]>,
  opciones: { trimestre?: number | null; incluirCriterios?: boolean } = {}
): string {
  const hojas = datos.alumnos.map(al => {
    const html = informeIndividual(datos, al, evidenciasPorAlumno.get(al.id!) || [], opciones)
    // Extraer solo la lámina: el envoltorio se pone una vez
    const i = html.indexOf('<div class="hoja">')
    const f = html.lastIndexOf('</body>')
    return html.slice(i, f)
  })
  return documento(`Informes · ${datos.grupo.nombre}`, hojas)
}

// ─── 2 · Boletín de calificaciones ───────────────────────────────────────

export function boletinGrupo(datos: DatosGrupo, trimestre: number | null): string {
  const hojas = datos.alumnos.map(al => {
    const notas = notasDeAlumno(datos, al.id!).filter(n => n.nota.criterios.length > 0)

    const filas = notas.map(({ area, nota: n }) => `<tr>
      <td>${esc(area.asig.nombre_display)}</td>
      ${trimestre
        ? celdaNota(n.trimestres[trimestre], true)
        : TRIM.map(t => celdaNota(n.trimestres[t])).join('') + celdaNota(n.final, true)}
      <td style="width:34mm">${barraNota(trimestre ? n.trimestres[trimestre] : n.final)}</td>
    </tr>`).join('')

    const valores = notas
      .map(n => trimestre ? n.nota.trimestres[trimestre] : n.nota.final)
      .filter((v): v is number => v != null)
    const media = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null

    const cab = trimestre
      ? `<th>Área</th><th class="n">${esc(etiquetaTrimestre(trimestre))}</th><th></th>`
      : `<th>Área</th><th class="n">1er tr.</th><th class="n">2º tr.</th><th class="n">3er tr.</th><th class="n">Final</th><th></th>`

    const asist = datos.asistencia.get(al.id!) || {}
    const totalSesiones = Object.values(asist).reduce((s, n) => s + n, 0)

    const contenido = `
      ${cabecera(`Boletín de calificaciones${trimestre ? ` · ${etiquetaTrimestre(trimestre)}` : ''}`)}
      <p class="kicker">Curso ${esc(datos.grupo.curso_escolar)}</p>
      <h1 class="display">${esc(al.apellidos)},<br>${esc(al.nombre)}</h1>
      <p class="subtitulo">${esc(subtituloGrupo(datos))}</p>
      ${metas([
        ['Clase', datos.grupo.nombre],
        ['Áreas', String(notas.length)],
        ['Media', media != null ? nota(media) : '—'],
        // Justificadas y retrasos se contaban y no se enseñaban nunca: una
        // familia no puede leer «3 faltas» sin saber cuántas están
        // justificadas.
        ...(totalSesiones
          ? ([
              ['Faltas', String(asist.ausente || 0)],
              ['Justificadas', String(asist.justificada || 0)],
              ['Retrasos', String(asist.retraso || 0)],
            ] as [string, string][])
          : []),
      ])}

      ${seccion('01', 'Calificaciones', notas.length
        ? `<table><thead><tr>${cab}</tr></thead><tbody>${filas}
             ${media != null ? `<tr class="destacada"><td>Media del alumno</td>
               ${trimestre ? celdaNota(media, true) : `<td class="n"></td><td class="n"></td><td class="n"></td>${celdaNota(media, true)}`}
               <td></td></tr>` : ''}
           </tbody></table>
           <p class="sub">Escala</p>
           <p style="font-size:8pt;color:var(--lm-ink-2);line-height:1.6">
             IN Insuficiente (&lt;5) · SU Suficiente (5) · BI Bien (6) · NT Notable (7–8) · SB Sobresaliente (9–10).
             La nota de cada área pondera el peso de sus instrumentos de evaluación y el reparto por trimestres.
           </p>`
        : `<p class="vacio">Todavía no hay calificaciones registradas para este alumno.</p>`)}

      <div class="firma">
        <div>El maestro / la maestra</div>
        <div>Vº Bº Dirección</div>
        <div>Recibí · familia</div>
      </div>
      ${pie()}
    `
    return hoja(contenido)
  })

  return documento(`Boletines · ${datos.grupo.nombre}`, hojas)
}

// ─── 3 · Acta de área ────────────────────────────────────────────────────

export function actaArea(datos: DatosGrupo, asignaturaId: number, trimestre: number | null): string {
  const area = datos.areas.find(a => a.asig.id === asignaturaId)
  if (!area) throw new Error('Área no encontrada')

  const filas = datos.alumnos.map(al => {
    const n = notasDeAlumno(datos, al.id!).find(x => x.area.asig.id === asignaturaId)!.nota
    return `<tr>
      <td>${esc(al.apellidos)}, ${esc(al.nombre)}${al.neae ? ' <span class="sello" style="color:var(--lm-social-deep)">NEAE</span>' : ''}</td>
      ${trimestre
        ? celdaNota(n.trimestres[trimestre], true)
        : TRIM.map(t => celdaNota(n.trimestres[t])).join('') + celdaNota(n.final, true)}
    </tr>`
  }).join('')

  const cab = trimestre
    ? `<th>Alumno/a</th><th class="n">${esc(etiquetaTrimestre(trimestre))}</th>`
    : `<th>Alumno/a</th><th class="n">1er tr.</th><th class="n">2º tr.</th><th class="n">3er tr.</th><th class="n">Final</th>`

  const instrumentos = area.instrumentos.length
    ? `<table><thead><tr><th>Instrumento</th><th>Tipo</th><th class="n">Peso</th></tr></thead><tbody>
        ${area.instrumentos.map(i => `<tr>
          <td>${esc(i.nombre)}</td><td class="desc">${esc(i.tipo)}</td><td class="n">${i.peso}%</td>
        </tr>`).join('')}
      </tbody></table>`
    : `<p class="vacio">El área no tiene instrumentos configurados.</p>`

  const contenido = `
    ${cabecera(`Acta de área${trimestre ? ` · ${etiquetaTrimestre(trimestre)}` : ' · curso completo'}`)}
    <p class="kicker">${esc(subtituloGrupo(datos))}</p>
    <h1 class="display">${esc(area.asig.nombre_display)}</h1>
    ${metas([
      ['Clase', datos.grupo.nombre],
      ['Alumnado', String(datos.alumnos.length)],
      ['Curso escolar', datos.grupo.curso_escolar],
    ])}

    ${seccion('01', 'Calificaciones del grupo',
      datos.alumnos.length
        ? `<table><thead><tr>${cab}</tr></thead><tbody>${filas}</tbody></table>`
        : `<p class="vacio">La clase no tiene alumnado.</p>`)}

    ${seccion('02', 'Instrumentos de evaluación y ponderación', instrumentos)}

    <div class="firma">
      <div>El maestro / la maestra</div>
      <div>Vº Bº Dirección</div>
    </div>
    ${pie()}
  `

  return documento(`Acta · ${area.asig.nombre_display} · ${datos.grupo.nombre}`, [hoja(contenido)])
}
