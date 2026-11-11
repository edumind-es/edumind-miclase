/**
 * La semana planificada, de vuelta a texto: el mismo Markdown que se vuelca
 * (`semanal.ts` lo vuelve a leer igual) y una lámina para imprimir. Puro
 * salvo `lamina.ts`, que solo monta HTML.
 */
import type { EventoCalendario, SesionPlan } from '../db/localDb'
import { criteriosDe, secuenciaDe } from './casar'
import { minutosDe, MARCA_IA } from './semanal'
import { documento, hoja, cabecera, pie, esc } from '../informes/lamina'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const fecha = (iso: string) => new Date(iso + 'T12:00')
export const nombreDia = (iso: string) => DIAS[fecha(iso).getDay()]
export const diaLargo = (iso: string) => { const d = fecha(iso); return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}` }

/** «Semana del 9 al 13 de noviembre de 2026» (o «del 30 de noviembre al 4 de diciembre de 2026»). */
export function tituloSemana(desde: string, hasta: string): string {
  const a = fecha(desde), b = fecha(hasta)
  const ini = a.getMonth() === b.getMonth() ? `${a.getDate()}`
    : a.getFullYear() === b.getFullYear() ? `${a.getDate()} de ${MESES[a.getMonth()]}`
    : `${a.getDate()} de ${MESES[a.getMonth()]} de ${a.getFullYear()}`
  return `Semana del ${ini} al ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`
}

/** Días lectivos (lunes a viernes) entre dos fechas, más sábado y domingo si traen algo. */
export function diasDeSemana(desde: string, hasta: string, conAlgo: Set<string> = new Set()): string[] {
  const out: string[] = []
  for (let d = fecha(desde); d <= fecha(hasta); d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if ((d.getDay() >= 1 && d.getDay() <= 5) || conAlgo.has(iso)) out.push(iso)
  }
  return out
}

export interface Franja { franja: string | null; hora_inicio: string; hora_fin: string }

/** Las franjas de unas sesiones, sin repetir y en orden. */
export function franjasDe(sesiones: Pick<SesionPlan, 'franja' | 'hora_inicio' | 'hora_fin'>[]): Franja[] {
  const m = new Map<string, Franja>()
  for (const s of sesiones) {
    const k = `${s.hora_inicio}-${s.hora_fin}`
    if (!m.has(k) || (!m.get(k)!.franja && s.franja)) m.set(k, { franja: s.franja ?? null, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin })
  }
  return [...m.values()].sort((a, b) => minutosDe(a.hora_inicio) - minutosDe(b.hora_inicio) || minutosDe(a.hora_fin) - minutosDe(b.hora_fin))
}

const unidadCorta = (s: SesionPlan) => /^(UD\s*\d+)/i.exec(s.unidad_texto ?? '')?.[1].replace(/\s+/g, '') ?? null

function celda(s: SesionPlan): string {
  const partes = [`**${s.area}**`]
  if (s.tipo === 'especialista') partes.push('Especialista')
  else if (s.tipo === 'centro') partes.push('Actividad de centro')
  else {
    const ud = unidadCorta(s)
    if (ud) partes.push(ud)
    if (s.titulo) partes.push(s.titulo)
  }
  return partes.join(' · ').replace(/\|/g, '/') + (s.evaluable ? ' ■' : '')
}

const tieneDetalle = (s: SesionPlan) => !!(s.objetivo || s.secuencia_json || s.recursos || s.evaluacion || s.criterios_json)

/** Sesiones con detalle agrupadas por bloque (las de un bloque de varias franjas, juntas). */
function bloquesDelDia(sesiones: SesionPlan[]): SesionPlan[][] {
  const out: SesionPlan[][] = []
  for (const s of sesiones.filter(tieneDetalle)) {
    const prev = out[out.length - 1]
    if (prev && s.bloque && prev[0].bloque === s.bloque && prev[0].area === s.area) prev.push(s)
    else out.push([s])
  }
  return out
}

const NUMEROS = ['', '', 'dos', 'tres', 'cuatro', 'cinco']

export function semanaAMarkdown(
  clase: string, desde: string, hasta: string, sesiones: SesionPlan[], eventos: EventoCalendario[] = [],
): string {
  const conAlgo = new Set([...sesiones.map(s => s.fecha), ...eventos.map(e => e.fecha)])
  const dias = diasDeSemana(desde, hasta, conAlgo)
  const l: string[] = [`# Programación semanal · ${clase}`, '', tituloSemana(desde, hasta), '']
  // Lo que salió de una IA lo sigue diciendo fuera de la app (AI Act, art. 50.2).
  if (sesiones.some(s => s.generada_ia)) l.push(MARCA_IA, '')

  const franjas = franjasDe(sesiones.filter(s => s.franja))
  if (franjas.length) {
    l.push('## Vista rápida', '')
    l.push(`| | ${dias.map(d => `${nombreDia(d)} ${fecha(d).getDate()}`).join(' | ')} |`)
    l.push(`|---|${dias.map(() => '---').join('|')}|`)
    for (const f of franjas) {
      const filas = dias.map(d => sesiones.filter(s => s.franja && s.fecha === d && s.hora_inicio === f.hora_inicio && s.hora_fin === f.hora_fin).map(celda).join(' / '))
      l.push(`| ${[f.franja, `${f.hora_inicio}-${f.hora_fin}`].filter(Boolean).join(' ')} | ${filas.join(' | ')} |`)
    }
    l.push('')
  }

  l.push('## Detalle por sesión', '')
  for (const d of dias) {
    const delDia = sesiones.filter(s => s.fecha === d)
    const notas = eventos.filter(e => e.fecha <= d && (e.fecha_fin || e.fecha) >= d)
    const bloques = bloquesDelDia(delDia)
    if (!bloques.length && !notas.length) continue
    l.push(`### ${diaLargo(d)}`, '')
    for (const n of notas) l.push(`*${n.titulo}${n.notas ? `: ${n.notas}` : ''}*`, '')
    for (const b of bloques) {
      const s = b[0]
      const ini = b[0].hora_inicio, fin = b[b.length - 1].hora_fin
      const cuantas = b.length > 1 ? ` (${NUMEROS[b.length] || b.length} sesiones)` : ''
      l.push(`**${ini}-${fin} · ${s.area.toUpperCase()}${cuantas}**`, '')
      const linea = [s.unidad_texto, s.titulo].filter(Boolean).join(' · ')
      if (linea) l.push(linea, '')
      if (s.objetivo) l.push(`**OBJETIVO.** ${s.objetivo}`, '')
      const fases = secuenciaDe(s)
      if (fases.length) {
        l.push('**SECUENCIA**', '')
        for (const f of fases) l.push(`- **${f.fase}${f.minutos != null ? ` (${f.minutos} min)` : ''}:** ${f.texto}`)
        l.push('')
      }
      if (s.recursos) l.push(`**RECURSOS.** ${s.recursos}`, '')
      const crit = criteriosDe(s)
      let ev = s.evaluacion ?? ''
      if (crit.length && !/ancla[jx]e|ancoraxe/i.test(ev)) ev = `${ev ? ev + ' ' : ''}Anclaje: ${crit.map(c => c.codigo).join(', ')}.`
      if (ev) l.push(`**EVALUACIÓN FORMATIVA.** ${ev}`, '')
    }
  }
  return l.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** La semana como lámina para imprimir: la tabla de franjas y, detrás, el detalle. */
export function semanaAHtml(
  clase: string, desde: string, hasta: string, sesiones: SesionPlan[], eventos: EventoCalendario[] = [],
): string {
  const conAlgo = new Set([...sesiones.map(s => s.fecha), ...eventos.map(e => e.fecha)])
  const dias = diasDeSemana(desde, hasta, conAlgo)
  const franjas = franjasDe(sesiones)
  const celdaHtml = (s: SesionPlan) => `<div style="margin-bottom:4px"><b>${esc(s.area)}</b>${s.evaluable ? ' ■' : ''}<br>
    <span style="font-size:9px">${esc([s.tipo === 'especialista' ? 'Especialista' : s.tipo === 'centro' ? 'Actividad de centro' : unidadCorta(s), s.titulo].filter(Boolean).join(' · '))}</span></div>`
  const tabla = `<table style="width:100%;border-collapse:collapse;font-size:10px">
    <tr><th></th>${dias.map(d => `<th style="text-align:left;border-bottom:1px solid #000">${esc(nombreDia(d))} ${fecha(d).getDate()}
      ${eventos.filter(e => e.fecha <= d && (e.fecha_fin || e.fecha) >= d).map(e => `<div style="font-weight:400;font-style:italic">${esc(e.titulo)}</div>`).join('')}</th>`).join('')}</tr>
    ${franjas.map(f => `<tr><td style="vertical-align:top;white-space:nowrap;padding:4px;border-bottom:1px solid #ccc">${esc(f.franja ?? '')}<br>${esc(f.hora_inicio)}-${esc(f.hora_fin)}</td>
      ${dias.map(d => `<td style="vertical-align:top;padding:4px;border-bottom:1px solid #ccc">${sesiones.filter(s => s.fecha === d && s.hora_inicio === f.hora_inicio && s.hora_fin === f.hora_fin).map(celdaHtml).join('')}</td>`).join('')}</tr>`).join('')}
  </table>`
  const detalle = dias.map(d => {
    const bloques = bloquesDelDia(sesiones.filter(s => s.fecha === d))
    if (!bloques.length) return ''
    return `<h2 style="margin-top:16px">${esc(diaLargo(d))}</h2>` + bloques.map(b => {
      const s = b[0]
      const fases = secuenciaDe(s)
      return `<div style="margin:8px 0 12px;font-size:11px">
        <b>${esc(b[0].hora_inicio)}-${esc(b[b.length - 1].hora_fin)} · ${esc(s.area)}</b>${s.evaluable ? ' ■' : ''}<br>
        ${esc([s.unidad_texto, s.titulo].filter(Boolean).join(' · '))}
        ${s.objetivo ? `<p><b>Objetivo.</b> ${esc(s.objetivo)}</p>` : ''}
        ${fases.length ? `<ul>${fases.map(f => `<li><b>${esc(f.fase)}${f.minutos != null ? ` (${f.minutos} min)` : ''}:</b> ${esc(f.texto)}</li>`).join('')}</ul>` : ''}
        ${s.recursos ? `<p><b>Recursos.</b> ${esc(s.recursos)}</p>` : ''}
        ${s.evaluacion ? `<p><b>Evaluación.</b> ${esc(s.evaluacion)}</p>` : ''}
      </div>`
    }).join('')
  }).join('')
  return documento(`Planificación · ${clase} · ${tituloSemana(desde, hasta)}`, [
    hoja(`${cabecera('Planificación semanal')}
      <h1 style="font-size:20px;margin:8px 0 2px">${esc(clase)}</h1>
      <div style="margin-bottom:10px">${esc(tituloSemana(desde, hasta))}</div>
      ${tabla}${detalle}${pie()}`),
  ])
}
