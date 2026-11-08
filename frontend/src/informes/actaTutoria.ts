/**
 * Acta de una tutoría, compuesta en Sistema Lámina.
 *
 * Una hoja con los datos de la reunión, quién asistió, el orden del día, los
 * apartados del modelo en su orden, la revisión de los acuerdos anteriores
 * (si se trajo), los acuerdos nuevos con fecha y responsable, la próxima cita
 * y el hueco de firmas: una por asistente y la del tutor o tutora.
 *
 * Puro: recibe la tutoría y los nombres ya resueltos y devuelve HTML.
 * Imprimir y guardar van por `imprimir` y `descargarHTML` de `lamina`.
 */
import { documento, hoja, cabecera, pie, seccion, esc } from './lamina'
import {
  nombreTipo, nombreModalidad, nombreEstado, fechaLegible,
  type Tutoria, type AcuerdoPendiente,
} from '../db/tutorias'

export type ContextoActa = {
  /** Nombre de la clase («6.º A»). */
  grupo: string
  /** Curso escolar, si se sabe. */
  cursoEscolar?: string
  /** id → «Apellidos, Nombre» de los alumnos de la tutoría. */
  nombresAlumnos: Map<number, string>
  /** Acuerdos de tutorías anteriores revisados en esta (opcional). */
  revisados?: AcuerdoPendiente[]
}

function metas(pares: [string, string][]): string {
  return `<div class="metas">${pares.filter(([, v]) => v).map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('')}</div>`
}

/** Párrafos a partir del texto libre (respeta saltos de línea). */
function parrafos(texto: string): string {
  const t = (texto ?? '').trim()
  if (!t) return `<p class="vacio">Sin anotar.</p>`
  return t.split(/\n{2,}/).map(p => `<p style="font-size:9.5pt;margin-bottom:2mm;white-space:pre-line">${esc(p)}</p>`).join('')
}

export function nombreFicheroActa(t: Tutoria): string {
  return `acta-tutoria-${t.fecha.slice(0, 10)}`
}

export function documentoActaTutoria(t: Tutoria, ctx: ContextoActa): string {
  const alumnos = (t.alumnos ?? []).map(id => ctx.nombresAlumnos.get(id) ?? `Alumno ${id}`)
  const secciones: string[] = []
  let n = 0
  const num = () => String(++n).padStart(2, '0')

  // Asistentes
  const asistentes = t.asistentes ?? []
  secciones.push(seccion(num(), 'Asistentes', asistentes.length
    ? `<table><thead><tr><th>Nombre</th><th>Relación o cargo</th></tr></thead><tbody>${
        asistentes.map(a => `<tr><td>${esc(a.nombre || '—')}</td><td>${esc(a.rol || '—')}</td></tr>`).join('')
      }</tbody></table>`
    : `<p class="vacio">No se anotaron asistentes.</p>`))

  // Orden del día
  if ((t.orden_dia ?? []).length) {
    secciones.push(seccion(num(), 'Orden del día', `<ol style="margin:0 0 0 5mm;font-size:9.5pt;line-height:1.6">${
      t.orden_dia.map(p => `<li>${esc(p.texto)}${p.tratado ? '' : ' <span style="color:var(--lm-ink-3);font-size:8pt">(no tratado)</span>'}</li>`).join('')
    }</ol>`))
  }

  // Apartados del modelo, en su orden
  for (const a of t.apartados ?? []) {
    secciones.push(seccion(num(), a.titulo, parrafos(a.texto)))
  }

  // Revisión de acuerdos anteriores
  if (ctx.revisados?.length) {
    secciones.push(seccion(num(), 'Seguimiento de acuerdos anteriores',
      `<table><thead><tr><th>Acuerdo</th><th>De la tutoría del</th><th>Previsto</th><th>Estado</th></tr></thead><tbody>${
        ctx.revisados.map(r => `<tr>
          <td>${esc(r.acuerdo.texto)}${r.acuerdo.nota_revision ? `<br><span style="font-size:8pt;color:var(--lm-ink-2)">${esc(r.acuerdo.nota_revision)}</span>` : ''}</td>
          <td style="font-family:var(--lm-mono);font-size:8pt;white-space:nowrap">${esc(fechaLegible(r.fecha_tutoria.slice(0, 10)))}</td>
          <td style="font-family:var(--lm-mono);font-size:8pt;white-space:nowrap">${esc(fechaLegible(r.acuerdo.fecha_prevista) || '—')}</td>
          <td>${esc(nombreEstado(r.acuerdo.estado))}</td>
        </tr>`).join('')
      }</tbody></table>`))
  }

  // Acuerdos
  const acuerdos = t.acuerdos ?? []
  secciones.push(seccion(num(), 'Acuerdos', acuerdos.length
    ? `<table><thead><tr><th style="width:8mm">N.º</th><th>Acuerdo</th><th>Responsable</th><th>Fecha prevista</th><th>Estado</th></tr></thead><tbody>${
        acuerdos.map((a, i) => `<tr>
          <td class="criterio-id" style="width:8mm">${i + 1}</td>
          <td>${esc(a.texto)}</td>
          <td>${esc(a.responsable || '—')}</td>
          <td style="font-family:var(--lm-mono);font-size:8pt;white-space:nowrap">${esc(fechaLegible(a.fecha_prevista) || '—')}</td>
          <td>${esc(nombreEstado(a.estado))}</td>
        </tr>`).join('')
      }</tbody></table>`
    : `<p class="vacio">No se tomaron acuerdos.</p>`))

  // Próxima cita
  if (t.proxima_cita || t.proxima_cita_nota) {
    secciones.push(seccion(num(), 'Próxima cita',
      `<p style="font-size:10pt"><b>${esc(fechaLegible(t.proxima_cita) || 'Sin fecha')}</b>${
        t.proxima_cita_nota ? ` · ${esc(t.proxima_cita_nota)}` : ''}</p>`))
  }

  // Firmas: una por asistente y la del tutor o tutora
  const firmantes = [
    ...asistentes.map(a => [a.nombre, a.rol].filter(Boolean).join(' · ')),
    'Tutor/a',
  ]
  const filas: string[] = []
  for (let i = 0; i < firmantes.length; i += 3) {
    filas.push(`<div class="firma">${firmantes.slice(i, i + 3).map(f => `<div>${esc(f)}</div>`).join('')}${
      // Huecos vacíos para que las firmas no se estiren a todo el ancho
      Array.from({ length: Math.max(0, 3 - firmantes.slice(i, i + 3).length) }, () => '<div style="visibility:hidden">·</div>').join('')
    }</div>`)
  }

  const contenido = `
    ${cabecera('Acta de tutoría')}
    <div class="kicker">${esc(nombreTipo(t.tipo))}</div>
    <div class="display">Acta de tutoría</div>
    <div class="subtitulo">${esc(alumnos.length ? alumnos.join(' · ') : `Grupo ${ctx.grupo}`)}</div>
    ${metas([
      ['Fecha', fechaLegible(t.fecha)],
      ['Clase', ctx.grupo],
      ['Curso', ctx.cursoEscolar ?? ''],
      ['Modalidad', nombreModalidad(t.modalidad)],
      ['Modelo', t.modelo_nombre ?? ''],
    ])}
    ${secciones.join('\n')}
    <div style="break-inside:avoid;margin-top:10mm">
      <div class="sub">Firmas</div>
      ${filas.join('')}
    </div>
    ${pie('Acta con datos personales de menores y familias: guárdala y compártela solo con quien deba conocerla.')}
  `
  return documento(`Acta de tutoría · ${fechaLegible(t.fecha)}`, [hoja(contenido)])
}
