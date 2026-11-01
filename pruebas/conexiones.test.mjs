/**
 * Conexión de las competencias específicas con los descriptores operativos
 * (backend/src/db/conexiones.js) y el currículo que la alimenta.
 *
 * Lo que se vigila: que los códigos de la columna «Enlaces» se lean aunque
 * vengan con espacios o en otra lengua; que cada origen se decida bien
 * (comunidad, solo competencia, Real Decreto, nada); que la reserva estatal
 * no invente competencias que la comunidad no nombró; y que los JSON de
 * curriculum/ den descriptores en todas las comunidades. Esta última parte es
 * la que avisa si una comunidad nueva llega sin conexión.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  leerCodigo, conexionDeObjetivo, objetivoDeCriterio, buscarEstatal,
} from '../backend/src/db/conexiones.js'

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const RAIZ = join(import.meta.dirname, '..', 'curriculum')
const estatal = Object.fromEntries(['primaria', 'secundaria'].map(e => {
  const d = JSON.parse(readFileSync(join(RAIZ, '_estatal', `${e}.json`), 'utf8'))
  return [e, { validos: new Set(d.descriptores.map(x => x.id)), estatales: d.competencias_especificas, datos: d }]
}))

console.log('\n1. Los códigos de «Enlaces»')
ok(leerCodigo('CPSAA3')?.codigo === 'CPSAA3' && leerCodigo('CPSAA3').tipo === 'descriptor', 'CPSAA3 es descriptor')
ok(leerCodigo(' cpsaa 3 ')?.codigo === 'CPSAA3', 'con espacios y en minúsculas')
ok(leerCodigo('CMCCTE2')?.codigo === 'STEM2', 'CMCCTE (valenciano) es STEM')
ok(leerCodigo('CCL')?.tipo === 'competencia', 'CCL a secas es la competencia')
ok(leerCodigo('CE3.1') === null && leerCodigo('OBJ2') === null && leerCodigo('') === null, 'lo demás no es un código')

console.log('\n2. Currículo estatal')
for (const e of ['primaria', 'secundaria']) {
  ok(estatal[e].datos.descriptores.length === 34, `${e}: los 34 descriptores del Anexo I`)
  ok(estatal[e].estatales.every(c => c.descriptores_ids.length > 0), `${e}: toda competencia específica estatal conecta`)
  const sucios = estatal[e].datos.descriptores.filter(d =>
    !d.descripcion.endsWith('.') || /Página|BOLETÍN|Descriptores|operativos/.test(d.descripcion))
  ok(!sucios.length, `${e}: textos sin restos del BOE (cabeceras, introducción de la competencia siguiente)`,
    sucios.map(d => d.id).join(' '))
}

console.log('\n3. Origen de la conexión')
const ctx = estatal.primaria
const ef1 = ctx.estatales.find(c => c.materia === 'educacion-fisica' && c.id === 'CE1')
let r = conexionDeObjetivo({ id: 'CE1', descripcion: 'x', descriptores_ids: ['STEM2', 'CPSAA5', 'ZZZ9'] }, ctx)
ok(r.origen === 'comunidad' && r.descriptores.join() === 'STEM2,CPSAA5', 'la comunidad manda; lo que no es descriptor se descarta', r.descriptores.join())
ok(r.competencias.join() === 'STEM,CPSAA', 'y cada descriptor arrastra su competencia')
r = conexionDeObjetivo({ id: 'CE1', descripcion: ef1.descripcion, descriptores_ids: [] }, ctx)
ok(r.origen === 'estatal' && r.descriptores.join() === ef1.descriptores_ids.join(), 'sin enlaces, la del Real Decreto con el mismo texto')
r = conexionDeObjetivo({ id: 'CE1', descripcion: ef1.descripcion, descriptores_ids: ['STEM', 'CC'] }, ctx)
ok(r.origen === 'estatal' && r.descriptores.every(d => d.startsWith('STEM')),
  'con competencias nombradas, el Real Decreto solo precisa dentro de ellas', r.descriptores.join())
ok(r.competencias.includes('CC'), 'y no se pierde la competencia nombrada sin descriptor')
r = conexionDeObjetivo({ id: 'CE7', descripcion: 'Bailar muiñeiras en el recreo con alegría compartida', descriptores_ids: ['CCEC', 'CPSAA'] }, ctx)
ok(r.origen === 'competencia' && !r.descriptores.length && r.competencias.join() === 'CPSAA,CCEC', 'Valencia: solo competencias')
r = conexionDeObjetivo({ id: 'OBJ1', descripcion: 'Concretar un plan de trabajo', descriptores_ids: [] }, ctx)
ok(r.origen === 'ninguna' && !r.competencias.length, 'nada de nada: ninguna')
ok(buscarEstatal({ id: 'CE9', descripcion: ef1.descripcion.split(' ').slice(0, 12).join(' ') + ' fútbol baloncesto ajedrez natación' }, ctx.estatales) === null,
  'con otro número y texto a medias no se acepta el parecido')

console.log('\n4. Criterio sin competencia específica enlazada')
ok(objetivoDeCriterio({ id: 'CE2.3', objetivo_id: null }) === 'CE2', 'CE2.3 → CE2')
ok(objetivoDeCriterio({ id: '3.1', objetivo_id: null }) === '3', '3.1 → 3')
ok(objetivoDeCriterio({ id: 'CE2.3', objetivo_id: 'OBJ5' }) === 'OBJ5', 'si la matriz la enlaza, manda la matriz')

console.log('\n5. Los JSON de curriculum/ conectan con descriptores')
// Mínimo de competencias específicas con descriptor en cada comunidad y
// etapa. Valencia en Primaria solo nombra competencias clave: se le exige
// que las nombre. Una optativa propia de la comunidad (Cultura Clásica o
// Unión Europea en Extremadura) no tiene competencia específica estatal con
// la que casar si la matriz no trae «Enlaces»: el 85 % vale también contando
// solo las materias que el Real Decreto tiene. Decisión de Luis (nov 2026).
for (const comunidad of readdirSync(RAIZ).filter(c => !c.startsWith('_'))) {
  for (const etapa of ['primaria', 'secundaria']) {
    const dir = join(RAIZ, comunidad, etapa)
    if (!existsSync(dir)) continue
    const materiasRD = new Set(estatal[etapa].estatales.map(c => c.materia))
    const cuenta = { comunidad: 0, competencia: 0, estatal: 0, ninguna: 0 }
    const rd = { total: 0, conDescriptor: 0 }
    for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const d = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      for (const o of d.objetivos ?? []) {
        const origen = conexionDeObjetivo(o, estatal[etapa]).origen
        cuenta[origen]++
        if (materiasRD.has(d.meta?.asignatura)) {
          rd.total++
          if (origen === 'comunidad' || origen === 'estatal') rd.conDescriptor++
        }
      }
    }
    const total = Object.values(cuenta).reduce((a, b) => a + b, 0)
    const conDescriptor = (cuenta.comunidad + cuenta.estatal) / total
    const conAlgo = (total - cuenta.ninguna) / total
    const soloRD = rd.total ? rd.conDescriptor / rd.total : 0
    const valencianaPrimaria = comunidad === 'valencia' && etapa === 'primaria'
    const pasa = valencianaPrimaria ? conAlgo >= 0.9 : (conDescriptor >= 0.85 || soloRD >= 0.85)
    ok(total > 0 && pasa,
      `${comunidad}/${etapa}: ${Math.round(100 * (valencianaPrimaria ? conAlgo : conDescriptor))} % conectado`
        + (!valencianaPrimaria && conDescriptor < 0.85 ? ` (${Math.round(100 * soloRD)} % en las materias del RD)` : ''),
      JSON.stringify(cuenta))
  }
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
