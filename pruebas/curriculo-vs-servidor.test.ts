/**
 * El currículo empaquetado en la app dice lo mismo que el servidor.
 *
 * Contra un backend sembrado con el currículo del árbol de trabajo
 * (ejecutar.mjs siembra su copia). Para cada comunidad y etapa, con el área
 * de Educación Física si la hay (si no, la primera): `asignaturas`, `cursos`,
 * `criterios` y `descriptores` de `frontend/src/curriculo/fuente.ts` sobre lo
 * que genera `scripts/empaquetar_curriculo.mjs`, campo a campo contra
 * `/api/curriculum`. Si esto falla, una pantalla vería distinto el currículo
 * con red que sin ella.
 */
import { join } from 'node:path'
import { empaquetar } from '../scripts/empaquetar_curriculo.mjs'
import {
  asignaturasDelIndice, clavePaquete, criteriosDelPaquete, cursosDelIndice, saberesDelPaquete,
} from '../frontend/src/curriculo/fuente'

const API = process.env.API || 'http://127.0.0.1:3270'

let fallos = 0
const ok = (cond: unknown, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const pedir = (ruta: string, q: Record<string, string>) =>
  fetch(`${API}/api/curriculum/${ruta}?${new URLSearchParams(q)}`).then(r => r.json())

/** Igualdad profunda con un mensaje de en qué difieren. */
function diferencia(a: unknown, b: unknown, ruta = ''): string | null {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${ruta}: ${a.length} frente a ${b.length} elementos`
    for (let i = 0; i < a.length; i++) { const d = diferencia(a[i], b[i], `${ruta}[${i}]`); if (d) return d }
    return null
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const claves = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of claves) {
      const d = diferencia((a as any)[k], (b as any)[k], `${ruta}.${k}`)
      if (d) return d
    }
    return null
  }
  return a === b ? null : `${ruta}: ${JSON.stringify(a)} frente a ${JSON.stringify(b)}`
}

const r = empaquetar(join(process.cwd(), 'curriculum'))
const indice = r.indice

for (const [comunidad, com] of Object.entries(indice.comunidades)) {
  for (const etapa of Object.keys(com.etapas)) {
    console.log(`\n${comunidad} · ${etapa}`)
    const clave = clavePaquete(indice, comunidad, etapa)!

    const asigLocal = asignaturasDelIndice(indice, etapa, comunidad)
    const asigServidor = await pedir('asignaturas', { etapa, comunidad })
    let d = diferencia(asigLocal, asigServidor)
    ok(!d, `asignaturas: ${asigLocal.length} iguales`, d ?? '')

    const area = asigLocal.find(a => a.asignatura === 'educacion-fisica')?.asignatura ?? asigLocal[0].asignatura
    const cursosLocal = cursosDelIndice(indice, area, etapa, comunidad)
    const cursosServidor = await pedir('cursos', { asignatura: area, etapa, comunidad })
    d = diferencia(cursosLocal, cursosServidor)
    ok(!d, `cursos de ${area}: ${cursosLocal.map(c => c.curso).join(' ')}`, d ?? '')

    for (const { curso } of cursosLocal) {
      const local = criteriosDelPaquete(r.criterios[clave], area, curso)
      const servidor = await pedir('criterios', { asignatura: area, curso, etapa, comunidad })
      d = diferencia(local, servidor)
      ok(!d, `criterios de ${area} ${curso}: ${local.length} iguales campo a campo`, d ?? '')
    }

    // Sin «º»: la app manda el curso de la clase tal cual y los dos normalizan
    const sinSimbolo = cursosLocal[0].curso.replace('º', '')
    d = diferencia(criteriosDelPaquete(r.criterios[clave], area, sinSimbolo),
      await pedir('criterios', { asignatura: area, curso: sinSimbolo, etapa, comunidad }))
    ok(!d, `con el curso «${sinSimbolo}» sin símbolo, igual`, d ?? '')

    const sabLocal = saberesDelPaquete(r.saberes[clave], area, cursosLocal[0].curso)
    const sabServidor = await pedir('saberes', { asignatura: area, curso: cursosLocal[0].curso, etapa, comunidad })
    // GROUP_CONCAT no garantiza el orden: se compara el conjunto
    const normalizar = (s: any) => ({ ...s, criterios_ids_csv: s.criterios_ids_csv ? s.criterios_ids_csv.split(',').sort().join(',') : null })
    d = diferencia({ bloques: sabLocal.bloques, saberes: sabLocal.saberes.map(normalizar) },
      { bloques: sabServidor.bloques, saberes: sabServidor.saberes.map(normalizar) })
    ok(!d, `saberes de ${area} ${cursosLocal[0].curso}: ${sabLocal.saberes.length} iguales`, d ?? '')

    const descLocal = r.descriptores[etapa]
    const descServidor = await pedir('descriptores', { etapa, comunidad })
    const porId = (xs: { id: string }[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id))
    d = diferencia(porId(descLocal.descriptores), porId(descServidor.descriptores))
    ok(!d, `descriptores: ${descLocal.descriptores.length} iguales`, d ?? '')
    d = diferencia(descLocal.competencias.map(c => c.id).sort(), descServidor.competencias.map((c: any) => c.id).sort())
    ok(!d, 'las mismas competencias clave', d ?? '')
  }
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
