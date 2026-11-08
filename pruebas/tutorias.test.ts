/**
 * Seguimiento de tutorías: reglas puras (`db/tutorias.ts`) y el acta.
 *
 * Lo que se vigila: que una tutoría nazca del modelo con COPIA de sus
 * apartados (cambiar el modelo no reescribe actas); que una de grupo vaya sin
 * alumnado; que normalizar quite asistentes y acuerdos vacíos y no repita
 * claves; que los acuerdos pendientes salgan con los vencidos primero y por
 * alumno; que revisar un acuerdo selle el día y volver a «pendiente» lo
 * quite; que los filtros de la pantalla (alumno, tipo, fechas, pendientes)
 * se combinen; que los modelos de serie vayan delante y los borrados no
 * salgan; y que el acta lleve asistentes, apartados, acuerdos, próxima cita y
 * una firma por asistente más la del tutor, escapando el texto.
 */
import {
  MODELOS_DE_SERIE, MODELO_EN_BLANCO, tutoriaDesdeModelo, normalizarTutoria, normalizarModelo,
  acuerdosPendientes, filtrarTutorias, conAcuerdoCambiado, modelosElegibles, proximasCitas,
  fechaLegible, claveNueva, modeloDesdeTutoria,
} from '../frontend/src/db/tutorias'
import { documentoActaTutoria } from '../frontend/src/informes/actaTutoria'
import type { Tutoria, ModeloTutoria } from '../frontend/src/db/localDb'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const tut = (id: number, extra: Partial<Tutoria> = {}): Tutoria => ({
  id, grupo_id: 1, fecha: '2026-10-01T16:00', tipo: 'familia', modalidad: 'presencial',
  alumnos: [10], asistentes: [], orden_dia: [], apartados: [], acuerdos: [],
  updated_at: '2026-10-01T16:00:00Z', deleted_at: null, ...extra,
})

console.log('1. Del modelo a la tutoría')
const familia = MODELOS_DE_SERIE.find(m => m.clave === 'serie:familia')!
ok(MODELOS_DE_SERIE.length === 3, 'hay tres modelos de serie', MODELOS_DE_SERIE.map(m => m.nombre).join(' · '))
ok(MODELOS_DE_SERIE.every(m => m.apartados.some(a => a.clave === 'temas')), 'todos llevan «Temas tratados»')
const b = tutoriaDesdeModelo(familia, { grupo_id: 7, alumnos: [10, 11], fecha: '2026-11-05T17:00' })
ok(b.grupo_id === 7 && b.alumnos.join() === '10,11' && b.fecha === '2026-11-05T17:00', 'lleva clase, alumnado y fecha')
ok(b.apartados.length === familia.apartados.length && b.apartados[0].titulo === familia.apartados[0].titulo, 'copia los apartados en su orden')
ok(b.orden_dia.length === familia.orden_dia.length && b.orden_dia.every(p => p.tratado === false), 'el orden del día sale sin tratar')
b.apartados[0].texto = 'cambiado'
ok(familia.apartados[0].texto === '', 'escribir en la tutoría no toca el modelo (es una copia)')
ok(b.modelo_clave === 'serie:familia' && b.modelo_nombre === familia.nombre, 'recuerda de qué modelo sale')
ok(b.con_seguimiento === true, 'el modelo de familia abre con los acuerdos pendientes a la vista')
const g = tutoriaDesdeModelo({ ...MODELO_EN_BLANCO, tipo: 'grupo' }, { grupo_id: 7, alumnos: [10] })
ok(g.alumnos.length === 0, 'una tutoría de grupo nace sin alumnado')
const m2 = modeloDesdeTutoria({ ...b, apartados: [{ clave: 'x', titulo: 'Lo hablado', texto: 'privado' }] }, 'Mío')
ok(m2.apartados[0].texto === '' && m2.apartados[0].titulo === 'Lo hablado', 'guardar una tutoría como modelo no se lleva lo escrito del caso')

console.log('\n2. Normalizar antes de guardar')
const n = normalizarTutoria(tut(1, {
  alumnos: [10, 10, 11],
  asistentes: [{ nombre: ' Ana ', rol: 'Madre' }, { nombre: '', rol: '' }],
  orden_dia: [{ texto: 'Notas', tratado: true }, { texto: '  ', tratado: false }],
  acuerdos: [
    { clave: 'a1', texto: 'Leer 20 min', estado: 'pendiente' },
    { clave: 'a1', texto: 'Agenda', estado: 'cumplido', fecha_revision: '2026-10-10' },
    { clave: 'a3', texto: '   ', estado: 'pendiente' },
  ],
  revisados: [{ tutoria_id: 5, clave: 'a1' }, { tutoria_id: 5, clave: 'a1' }],
}))
ok(n.alumnos.join() === '10,11', 'sin alumnos repetidos')
ok(n.asistentes.length === 1 && n.asistentes[0].nombre === 'Ana', 'sin asistentes vacíos y con el nombre recortado')
ok(n.orden_dia.length === 1, 'sin puntos vacíos en el orden del día')
ok(n.acuerdos.length === 2, 'sin acuerdos vacíos')
ok(new Set(n.acuerdos.map(a => a.clave)).size === 2, 'las claves de acuerdo no se repiten', n.acuerdos.map(a => a.clave).join())
ok(n.acuerdos[1].fecha_revision === '2026-10-10' && n.acuerdos[0].fecha_revision === null, 'solo el revisado conserva su fecha de revisión')
ok(n.revisados.length === 1, 'un acuerdo revisado se anota una vez')
const raro = normalizarTutoria({ tipo: 'otra' as any, modalidad: 'fax' as any })
ok(raro.tipo === 'familia' && raro.modalidad === 'presencial' && Array.isArray(raro.acuerdos), 'lo que llega de un aparato raro se completa')

console.log('\n3. Acuerdos pendientes')
const todas = [
  tut(1, { alumnos: [10], fecha: '2026-09-20T16:00', acuerdos: [
    { clave: 'a1', texto: 'Revisar agenda', estado: 'pendiente', fecha_prevista: '2026-10-01' },
    { clave: 'a2', texto: 'Hecho', estado: 'cumplido' },
  ] }),
  tut(2, { alumnos: [11], fecha: '2026-10-05T16:00', acuerdos: [
    { clave: 'a1', texto: 'Sin fecha', estado: 'pendiente' },
    { clave: 'a2', texto: 'Más adelante', estado: 'pendiente', fecha_prevista: '2026-12-01' },
  ] }),
  tut(3, { alumnos: [10], deleted_at: '2026-10-06T00:00:00Z', acuerdos: [{ clave: 'a1', texto: 'Borrada', estado: 'pendiente' }] }),
]
const pend = acuerdosPendientes(todas, '2026-11-08')
ok(pend.length === 3, 'tres pendientes: ni cumplidos ni de tutorías borradas', pend.map(p => p.acuerdo.texto).join(' · '))
ok(pend[0].acuerdo.texto === 'Revisar agenda' && pend[0].vencido, 'el vencido va primero')
ok(pend[1].acuerdo.texto === 'Más adelante' && !pend[1].vencido, 'luego por fecha prevista')
ok(pend[2].acuerdo.texto === 'Sin fecha', 'los que no tienen fecha, al final')
ok(acuerdosPendientes(todas, '2026-11-08', [11]).length === 2, 'por alumno, solo los suyos')

console.log('\n4. Revisar un acuerdo')
const rev = conAcuerdoCambiado(todas[0].acuerdos, 'a1', { estado: 'cumplido' }, '2026-11-08')
ok(rev[0].estado === 'cumplido' && rev[0].fecha_revision === '2026-11-08', 'marcarlo cumplido sella el día de la revisión')
ok(todas[0].acuerdos[0].estado === 'pendiente', 'no muta la lista original')
const vuelta = conAcuerdoCambiado(rev, 'a1', { estado: 'pendiente' })
ok(vuelta[0].fecha_revision === null, 'volver a pendiente quita la fecha de revisión')
ok(rev[1] === todas[0].acuerdos[1], 'los demás acuerdos no se tocan')

console.log('\n5. Filtros de la pantalla')
const lista = [
  tut(1, { fecha: '2026-09-20T16:00', tipo: 'familia', alumnos: [10] }),
  tut(2, { fecha: '2026-10-05T10:00', tipo: 'alumno', alumnos: [11], acuerdos: [{ clave: 'a', texto: 'x', estado: 'pendiente' }] }),
  tut(3, { fecha: '2026-10-20T12:00', tipo: 'grupo', alumnos: [] }),
  tut(4, { fecha: '2026-10-21T12:00', deleted_at: '2026-10-22T00:00:00Z' }),
]
ok(filtrarTutorias(lista).map(t => t.id).join() === '3,2,1', 'sin filtro: vivas y de la más reciente a la más antigua')
ok(filtrarTutorias(lista, { alumno_id: 10 }).map(t => t.id).join() === '1', 'por alumno')
ok(filtrarTutorias(lista, { tipo: 'grupo' }).map(t => t.id).join() === '3', 'por tipo')
ok(filtrarTutorias(lista, { desde: '2026-10-05', hasta: '2026-10-05' }).map(t => t.id).join() === '2', 'por fechas, con los extremos incluidos')
ok(filtrarTutorias(lista, { conPendientes: true }).map(t => t.id).join() === '2', 'solo con acuerdos pendientes')
const citas = proximasCitas([tut(1, { proxima_cita: '2026-12-01T16:00' }), tut(2, { proxima_cita: '2026-01-01T16:00' }), tut(3, { proxima_cita: '2026-11-20T09:00' })], '2026-11-08T10:00')
ok(citas.map(t => t.id).join() === '3,1', 'próximas citas: solo futuras, la más cercana primero')

console.log('\n6. Modelos')
const propios: ModeloTutoria[] = [
  { id: 50, nombre: 'Zeta', tipo: 'alumno', modalidad: 'telefono', apartados: [{ clave: 't', titulo: 'Temas', texto: '' }], orden_dia: [], con_seguimiento: false },
  { id: 51, nombre: 'Alfa', tipo: 'equipo', modalidad: 'presencial', apartados: [], orden_dia: ['a', '  '], con_seguimiento: true },
  { id: 52, nombre: 'Borrado', tipo: 'familia', modalidad: 'presencial', apartados: [], orden_dia: [], con_seguimiento: false, deleted_at: '2026-11-01T00:00:00Z' },
]
const eleg = modelosElegibles(propios)
ok(eleg.slice(0, 3).every(m => m.serie), 'los de serie van delante')
ok(eleg.slice(3, 5).map(m => m.nombre).join() === 'Alfa,Zeta', 'luego los propios por nombre')
ok(!eleg.some(m => m.nombre === 'Borrado'), 'un modelo borrado no se ofrece')
ok(eleg[eleg.length - 1].clave === 'serie:blanco', '«En blanco» al final')
ok(eleg.find(m => m.id === 51)!.clave === 'propio:51', 'la clave de un propio lleva su id')
ok(normalizarModelo(propios[1]).orden_dia.length === 1, 'sin puntos vacíos en el orden del día del modelo')
ok(normalizarModelo({ apartados: [{ clave: '', titulo: '  ', texto: '' }] }).apartados.length === 0, 'un apartado sin título no se guarda')
ok(claveNueva(['ap1', 'ap2', 'ap3']) === 'ap4' && claveNueva(['ap2']) === 'ap3', 'claves nuevas que no chocan')

console.log('\n7. Acta')
ok(fechaLegible('2026-11-05T17:30') === '05/11/2026 · 17:30' && fechaLegible('2026-11-05') === '05/11/2026', 'fecha legible con y sin hora')
const t = tut(9, {
  fecha: '2026-11-05T17:30', alumnos: [10], modelo_nombre: 'Tutoría con la familia',
  asistentes: [{ nombre: 'Ana Pérez', rol: 'Madre' }, { nombre: 'Rosa', rol: 'Orientadora' }],
  orden_dia: [{ texto: 'Evolución', tratado: true }, { texto: 'Ruegos', tratado: false }],
  apartados: [{ clave: 'temas', titulo: 'Temas tratados', texto: 'Hablamos de <lectura>.' }, { clave: 'obs', titulo: 'Observaciones', texto: '' }],
  acuerdos: [{ clave: 'a1', texto: 'Leer 20 minutos al día', responsable: 'Familia', fecha_prevista: '2026-12-01', estado: 'pendiente' }],
  proxima_cita: '2026-12-10T17:00', proxima_cita_nota: 'Revisar la lectura',
})
const html = documentoActaTutoria(t, {
  grupo: '6.º A', cursoEscolar: '2026-2027', nombresAlumnos: new Map([[10, 'García, Lucía']]),
  revisados: [{ tutoria_id: 1, fecha_tutoria: '2026-09-20T16:00', alumnos: [10], acuerdo: { clave: 'a1', texto: 'Revisar agenda', estado: 'cumplido' }, vencido: false }],
})
ok(html.startsWith('<!doctype html>') && html.includes('lm-plate-top'), 'es un documento Lámina')
ok(html.includes('García, Lucía') && html.includes('6.º A') && html.includes('05/11/2026 · 17:30'), 'lleva alumno, clase y fecha')
ok(html.includes('Ana Pérez') && html.includes('Orientadora'), 'lleva los asistentes')
ok(html.includes('Temas tratados') && html.includes('Observaciones') && html.indexOf('Temas tratados') < html.indexOf('Observaciones'), 'lleva los apartados en su orden')
ok(html.includes('Hablamos de &lt;lectura&gt;.'), 'escapa el texto del docente')
ok(html.includes('Ruegos') && html.includes('(no tratado)'), 'el orden del día dice lo que no se trató')
ok(html.includes('Leer 20 minutos al día') && html.includes('01/12/2026'), 'lleva los acuerdos con su fecha prevista')
ok(html.includes('Seguimiento de acuerdos anteriores') && html.includes('Revisar agenda') && html.includes('Cumplido'), 'lleva los acuerdos anteriores revisados')
ok(html.includes('Próxima cita') && html.includes('10/12/2026 · 17:00') && html.includes('Revisar la lectura'), 'lleva la próxima cita')
const firmas = (html.match(/<div class="firma">/g) ?? []).length
ok(firmas >= 1 && html.includes('Ana Pérez · Madre') && html.includes('Tutor/a'), 'hueco de firma por asistente y para el tutor', `${firmas} fila(s)`)
const grupo = documentoActaTutoria(tut(10, { tipo: 'grupo', alumnos: [] }), { grupo: '6.º A', nombresAlumnos: new Map() })
ok(grupo.includes('Grupo 6.º A') && grupo.includes('No se tomaron acuerdos'), 'una de grupo sin acuerdos también sale')

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
