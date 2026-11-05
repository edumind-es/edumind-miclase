/**
 * El currículo empaquetado en la app (scripts/empaquetar_curriculo.mjs +
 * frontend/src/curriculo/fuente.ts), sin servidor ni navegador.
 *
 * Lo que se vigila: que el índice recoja todas las carpetas de `curriculum/`
 * con la comunidad escrita como la escribe cada JSON; que cada comunidad y
 * etapa tenga su paquete y los descriptores de la etapa estén; que
 * `criteriosDelPaquete` componga lo mismo que da el servidor (campos, curso
 * normalizado, conexión por competencia específica, orden); y que una
 * comunidad sin «Enlaces» (Madrid) salga con la conexión estatal. Lo que
 * compara con el servidor de verdad está en curriculo-vs-servidor.test.ts.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { empaquetar } from '../scripts/empaquetar_curriculo.mjs'
import {
  asignaturasDelIndice, clavePaquete, comunidadesDelIndice, criteriosDelPaquete, cursosDelIndice,
  normalizarCurso, saberesDelPaquete, VERSION_PAQUETE,
} from '../frontend/src/curriculo/fuente'

let fallos = 0
const ok = (cond: unknown, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const RAIZ = join(process.cwd(), 'curriculum')
const carpetas = readdirSync(RAIZ).filter(c => !c.startsWith('_') && statSync(join(RAIZ, c)).isDirectory()).sort()
const r = empaquetar(RAIZ)
const indice = r.indice

console.log('\n1. El índice')
ok(indice.version === VERSION_PAQUETE, `versión ${VERSION_PAQUETE}`)
const comunidades = comunidadesDelIndice(indice)
ok(comunidades.length === carpetas.length, `${comunidades.length} comunidades, una por carpeta`, comunidades.join(' '))
ok(comunidades.includes('Galicia') && comunidades.includes('MADRID') && comunidades.includes('CyL'),
  'la comunidad se escribe como la escribe su JSON (Galicia, MADRID, CyL)')
ok(new Set(Object.values(indice.comunidades).map(c => c.carpeta)).size === carpetas.length
  && Object.values(indice.comunidades).every(c => carpetas.includes(c.carpeta)), 'cada comunidad apunta a su carpeta')
ok(r.avisos.length === 0, 'sin avisos del generador', r.avisos.join(' | '))
ok(r.vacios.every((v: string) => {
  // «clm/secundaria/fisica-y-quimica_1.json»: ni el área ni ese curso en el índice de esa comunidad
  const [carpeta, etapa, fichero] = v.split('/')
  const m = /^(.+)_([^_]+)\.json$/.exec(fichero)!
  const com = Object.values(indice.comunidades).find(c => c.carpeta === carpeta)
  return !com?.etapas[etapa]?.[m[1]]?.includes(m[2] + 'º')
}), 'un fichero sin criterios no entra en el índice, como en el servidor', r.vacios.join(' '))

console.log('\n2. Un paquete por comunidad y etapa, y los descriptores de cada etapa')
let paquetes = 0
for (const [comunidad, com] of Object.entries(indice.comunidades)) {
  for (const etapa of Object.keys(com.etapas)) {
    const clave = clavePaquete(indice, comunidad, etapa)
    const p = clave ? r.criterios[clave] : null
    ok(!!p && p.comunidad === comunidad && p.etapa === etapa, `${comunidad} · ${etapa} → ${clave}`)
    ok(!!clave && !!r.saberes[clave], `${comunidad} · ${etapa}: saberes aparte`)
    if (p) {
      const areas = asignaturasDelIndice(indice, etapa, comunidad)
      ok(areas.length > 0 && areas.every(a => p.areas[a.asignatura]), `${areas.length} áreas, todas en el paquete`)
      ok(areas.every(a => cursosDelIndice(indice, a.asignatura, etapa, comunidad).every(c => p.areas[a.asignatura][c.curso])),
        'todos los cursos del índice están en el paquete')
    }
    paquetes++
  }
}
ok(paquetes === Object.keys(r.criterios).length, `${paquetes} paquetes y ninguno huérfano`)
for (const etapa of ['primaria', 'secundaria']) {
  const d = r.descriptores[etapa]
  ok(d?.descriptores.length === 34 && d.descriptores.every(x => x.descripcion.length > 40), `${etapa}: 34 descriptores con texto`)
  ok(d?.competencias.length === 8, `${etapa}: las ocho competencias clave`)
}

console.log('\n3. Los criterios como los da el servidor')
ok(normalizarCurso('4') === '4º' && normalizarCurso('4º') === '4º' && normalizarCurso(3) === '3º' && normalizarCurso('4ª') === '4º',
  'el curso se normaliza: 4, 4º, 3, 4ª')
const galicia = r.criterios[clavePaquete(indice, 'Galicia', 'primaria')!]
const ef4 = criteriosDelPaquete(galicia, 'educacion-fisica', '4')
ok(ef4.length > 20, `Galicia EF 4º: ${ef4.length} criterios`)
ok(ef4.every(c => c.id && c.descripcion && typeof c.peso === 'number' && c.asignatura === 'educacion-fisica'
  && c.curso === '4º' && c.etapa === 'primaria' && c.comunidad === 'Galicia'
  && Array.isArray(c.descriptores) && Array.isArray(c.competencias_clave) && typeof c.conexion_origen === 'string'),
  'cada criterio trae lo de siempre y sus campos de competencias clave')
const ce11 = ef4.find(c => c.id === 'CE1.1')
ok(ce11?.objetivo_id === 'OBJ1' && ce11.conexion_origen === 'comunidad' && ce11.descriptores.includes('STEM2')
  && ce11.competencias_clave.join() === 'STEM,CPSAA,CE', 'CE1.1 conecta por su competencia específica', JSON.stringify(ce11?.descriptores))
ok(ef4.every((c, i) => i === 0 || ef4[i - 1].id <= c.id), 'ordenados por id como SQLite')
ok(criteriosDelPaquete(galicia, 'educacion-fisica', '9').length === 0 && criteriosDelPaquete(galicia, 'no-existe', '4').length === 0,
  'un curso o un área que no existe dan vacío, sin lanzar')
ok(criteriosDelPaquete(galicia, 'educacion-fisica', '4').length === criteriosDelPaquete(galicia, 'educacion-fisica', '4º').length,
  '«4» y «4º» son el mismo curso')

const madrid = r.criterios[clavePaquete(indice, 'MADRID', 'primaria')!]
const areaMadrid = Object.keys(madrid.areas).find(a => a.startsWith('educacion-fisica')) ?? Object.keys(madrid.areas)[0]
const cursoMadrid = Object.keys(madrid.areas[areaMadrid])[0]
const crMadrid = criteriosDelPaquete(madrid, areaMadrid, cursoMadrid)
ok(crMadrid.some(c => c.conexion_origen === 'estatal') && crMadrid.every(c => c.conexion_origen !== 'comunidad'),
  `Madrid (${areaMadrid} ${cursoMadrid}) sin «Enlaces»: conexión estatal`, [...new Set(crMadrid.map(c => c.conexion_origen))].join(' '))

console.log('\n4. Los saberes')
const sab = saberesDelPaquete(r.saberes[clavePaquete(indice, 'Galicia', 'primaria')!], 'educacion-fisica', '4')
ok(sab.bloques.length > 0 && sab.saberes.length > 0, `Galicia EF 4º: ${sab.bloques.length} bloques, ${sab.saberes.length} saberes`)
ok(sab.saberes.every(s => s.asignatura === 'educacion-fisica' && s.curso === '4º' && 'criterios_ids_csv' in s),
  'con los campos del servidor (criterios_ids_csv incluido)')

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
