/**
 * Las competencias clave llegan al frontend por la API del currículo.
 *
 * Contra un backend sembrado con el currículo del árbol de trabajo
 * (ejecutar.mjs siembra su copia). Para cada comunidad y etapa: que
 * `/criterios` traiga los descriptores de cada criterio, sin dejar de traer
 * lo de siempre, y que `/descriptores` dé los 34 del Perfil de salida con su
 * texto.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const API = process.env.API || 'http://127.0.0.1:3270'
const RAIZ = join(process.cwd(), 'curriculum')

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const pedir = (ruta) => fetch(`${API}/api/curriculum${ruta}`).then(r => r.json())

for (const carpeta of readdirSync(RAIZ).filter(c => !c.startsWith('_'))) {
  for (const etapa of ['primaria', 'secundaria']) {
    const dir = join(RAIZ, carpeta, etapa)
    if (!existsSync(dir)) continue
    // Educación física si la hay; si no, la primera
    const ficheros = readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    const f = ficheros.find(x => x.startsWith('educacion-fisica')) ?? ficheros[0]
    const { meta } = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    console.log(`\n${meta.comunidad} · ${etapa} · ${meta.asignatura} ${meta.curso}`)

    const q = new URLSearchParams({ asignatura: meta.asignatura, curso: meta.curso, etapa, comunidad: meta.comunidad })
    const criterios = await pedir(`/criterios?${q}`)
    ok(Array.isArray(criterios) && criterios.length > 0, `${criterios.length} criterios`)
    ok(criterios.every(c => c.id && c.descripcion && Array.isArray(c.descriptores) && Array.isArray(c.competencias_clave)),
      'cada criterio trae lo de siempre y sus campos de competencias clave')
    const conectados = criterios.filter(c => c.descriptores.length || c.competencias_clave.length)
    ok(conectados.length / criterios.length >= 0.8, `${conectados.length} de ${criterios.length} conectados`,
      [...new Set(criterios.map(c => c.conexion_origen))].join(' '))

    const { descriptores, competencias } = await pedir(`/descriptores?${new URLSearchParams({ etapa, comunidad: meta.comunidad })}`)
    ok(descriptores?.length === 34 && descriptores.every(d => d.descripcion.length > 40), '34 descriptores con su texto')
    ok(competencias?.length >= 8, 'las ocho competencias clave')
    const citados = new Set(criterios.flatMap(c => c.descriptores))
    ok([...citados].every(id => descriptores.some(d => d.id === id)), 'todo descriptor citado está en el catálogo')
  }
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
