#!/usr/bin/env node
/**
 * Empaqueta el currículo de `curriculum/` para que viaje dentro de la app.
 *
 * El seed (backend/src/db/seed.js) mete los mismos JSON en SQLite y las rutas
 * de /api/curriculum los sirven; esto escribe lo mismo en ficheros estáticos
 * que la PWA precachea, para que la app califique sin pedirle nada al
 * servidor. Las conexiones competencia específica → descriptores salen de
 * `conexiones.js`, el mismo módulo que usa el seed, para que el resultado sea
 * idéntico (pruebas/curriculo-vs-servidor.test.mjs lo comprueba).
 *
 * Lo que escribe en `destino` (frontend/public/curriculo/, que no se versiona):
 *   indice.json                    comunidades → etapas → áreas → cursos
 *   descriptores/<etapa>.json      competencias clave y descriptores (texto estatal)
 *   criterios/<carpeta>-<etapa>.json   por área y curso: criterios y la conexión
 *                                  de cada competencia específica, una vez
 *   saberes/<carpeta>-<etapa>.json     bloques y saberes, aparte (nadie los pide hoy)
 *
 * Lo lanza el plugin de Vite en cada build y en dev (frontend/vite.config.ts)
 * y `npm run curriculo` a mano. Uso: node scripts/empaquetar_curriculo.mjs [destino]
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conexionDeObjetivo, objetivoDeCriterio } from '../backend/src/db/conexiones.js'

const RAIZ = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
export const CURRICULUM_POR_DEFECTO = join(RAIZ, 'curriculum')
export const DESTINO_POR_DEFECTO = join(RAIZ, 'frontend/public/curriculo')
/** Sube cuando cambie la forma de los ficheros: la app rechaza un índice de otra versión. */
export const VERSION_PAQUETE = 1

const ETAPAS = ['primaria', 'secundaria']

function leerJson(ruta) {
  try { return JSON.parse(readFileSync(ruta, 'utf8')) } catch { return null }
}

/** Mismo criterio que el seed: las carpetas que empiezan por «_» no son comunidades. */
function carpetasDeComunidad(raiz) {
  return readdirSync(raiz)
    .filter(c => !c.startsWith('_') && statSync(join(raiz, c)).isDirectory())
    .sort()
}

/**
 * Lee `curriculum/` y devuelve los paquetes en memoria, sin escribir nada.
 * Puro salvo la lectura de ficheros: la prueba lo llama sobre el árbol real.
 */
export function empaquetar(raiz = CURRICULUM_POR_DEFECTO) {
  // Currículo estatal: texto de los descriptores y conexión de reserva
  const estatal = {}
  for (const etapa of ETAPAS) {
    const datos = leerJson(join(raiz, '_estatal', `${etapa}.json`))
    if (datos) {
      estatal[etapa] = {
        datos,
        validos: new Set(datos.descriptores.map(d => d.id)),
        estatales: datos.competencias_especificas,
      }
    }
  }

  const indice = { version: VERSION_PAQUETE, comunidades: {} }
  const criterios = {}   // clave `<carpeta>-<etapa>` → paquete
  const saberes = {}
  const descriptores = {} // etapa → { competencias, descriptores }
  const avisos = []
  // Ficheros sin un solo criterio (Física y Química de CLM): el servidor no
  // los lista en /asignaturas ni en /cursos porque no dejan fila en
  // c_criterios, así que tampoco entran en el índice. No es un error.
  const vacios = []
  const origenes = {}

  for (const carpeta of carpetasDeComunidad(raiz)) {
    for (const etapa of ETAPAS) {
      const dir = join(raiz, carpeta, etapa)
      let ficheros
      try { ficheros = readdirSync(dir).filter(f => f.endsWith('.json')).sort() } catch { continue }
      for (const f of ficheros) {
        const data = leerJson(join(dir, f))
        if (!data?.meta || !Array.isArray(data.criterios)) { avisos.push(`${carpeta}/${etapa}/${f}: no es un fichero de currículo`); continue }
        const { meta } = data
        const comunidad = meta.comunidad
        if (data.criterios.length === 0) { vacios.push(`${carpeta}/${etapa}/${f}`); continue }
        if (meta.etapa !== etapa) avisos.push(`${carpeta}/${etapa}/${f}: meta.etapa dice «${meta.etapa}»`)

        const ctxEstatal = estatal[etapa]
        // Sin currículo estatal de la etapa, valen los descriptores del propio JSON
        const contexto = ctxEstatal ?? { validos: new Set(data.descriptores.map(d => d.id)), estatales: [] }
        if (!descriptores[etapa]) {
          const fuente = ctxEstatal?.datos ?? data
          descriptores[etapa] = {
            competencias: fuente.competencias.map(c => ({ id: c.id, titulo: c.titulo })),
            descriptores: fuente.descriptores.map(d => ({ id: d.id, competencia_id: d.competencia_id, descripcion: d.descripcion })),
          }
        }
        for (const d of data.descriptores ?? []) {
          if (!contexto.validos.has(d.id)) avisos.push(`${carpeta}/${etapa}/${f}: descriptor «${d.id}» desconocido en el currículo estatal`)
        }

        // Índice
        const com = indice.comunidades[comunidad] ??= { carpeta, etapas: {} }
        if (com.carpeta !== carpeta) avisos.push(`«${comunidad}» aparece en dos carpetas: ${com.carpeta} y ${carpeta}`)
        const cursos = (com.etapas[etapa] ??= {})[meta.asignatura] ??= []
        if (!cursos.includes(meta.curso)) cursos.push(meta.curso)

        // Conexión de cada competencia específica, una vez por área y curso
        const objetivos = {}
        for (const o of data.objetivos ?? []) {
          const con = conexionDeObjetivo(o, contexto)
          origenes[con.origen] = (origenes[con.origen] ?? 0) + 1
          objetivos[o.id] = { descriptores: con.descriptores, competencias: con.competencias, origen: con.origen }
        }
        // Un id repetido dentro del fichero: en SQLite gana el último (INSERT OR REPLACE)
        const porId = new Map()
        for (const cr of data.criterios) {
          porId.set(cr.id, { id: cr.id, objetivo_id: objetivoDeCriterio(cr), descripcion: cr.descripcion, peso: cr.peso })
        }
        const clave = `${carpeta}-${etapa}`
        const paquete = criterios[clave] ??= { version: VERSION_PAQUETE, comunidad, etapa, areas: {} }
        ;(paquete.areas[meta.asignatura] ??= {})[meta.curso] = { criterios: [...porId.values()], objetivos }

        const paqueteSaberes = saberes[clave] ??= { version: VERSION_PAQUETE, comunidad, etapa, areas: {} }
        ;(paqueteSaberes.areas[meta.asignatura] ??= {})[meta.curso] = {
          bloques: (data.bloques ?? []).map(b => ({ id: b.id, titulo: b.titulo })),
          saberes: (data.saberes ?? []).map(s => ({ id: s.id, bloque_id: s.bloque_id, descripcion: s.descripcion, criterios_ids: s.criterios_ids ?? [] })),
        }
      }
    }
  }
  for (const com of Object.values(indice.comunidades)) {
    for (const areas of Object.values(com.etapas)) {
      for (const cursos of Object.values(areas)) cursos.sort()
    }
  }
  return { indice, criterios, saberes, descriptores, avisos, vacios, origenes }
}

/** Escribe los paquetes en `destino`, vaciándolo antes. Devuelve un resumen. */
export function escribirPaquetes(destino = DESTINO_POR_DEFECTO, raiz = CURRICULUM_POR_DEFECTO) {
  const r = empaquetar(raiz)
  rmSync(destino, { recursive: true, force: true })
  for (const sub of ['descriptores', 'criterios', 'saberes']) mkdirSync(join(destino, sub), { recursive: true })
  const json = (o) => JSON.stringify(o)
  let bytes = 0
  const escribir = (ruta, o) => { const t = json(o); bytes += Buffer.byteLength(t); writeFileSync(join(destino, ruta), t) }
  escribir('indice.json', r.indice)
  for (const [etapa, d] of Object.entries(r.descriptores)) escribir(`descriptores/${etapa}.json`, d)
  for (const [clave, p] of Object.entries(r.criterios)) escribir(`criterios/${clave}.json`, p)
  for (const [clave, p] of Object.entries(r.saberes)) escribir(`saberes/${clave}.json`, p)
  return {
    comunidades: Object.keys(r.indice.comunidades).length,
    paquetes: Object.keys(r.criterios).length,
    bytes,
    avisos: r.avisos,
    vacios: r.vacios,
    origenes: r.origenes,
  }
}

// Por el nombre y no por `import.meta.url`: las pruebas lo empaquetan con
// esbuild en otro fichero y ahí la URL es la del paquete, no la de este script.
const esPrincipal = /empaquetar_curriculo\.mjs$/.test(process.argv[1] ?? '')
if (esPrincipal) {
  const destino = process.argv[2] ? resolve(process.argv[2]) : DESTINO_POR_DEFECTO
  const res = escribirPaquetes(destino)
  console.log(`Currículo empaquetado en ${destino}: ${res.comunidades} comunidades, ${res.paquetes} paquetes, ${(res.bytes / 1024 / 1024).toFixed(1)} MB`)
  console.log(`Origen de la conexión por competencia específica: ${JSON.stringify(res.origenes)}`)
  for (const a of res.avisos) console.warn(`  ⚠ ${a}`)
  if (res.vacios.length) console.log(`Sin criterios (no entran): ${res.vacios.join(' ')}`)
}
