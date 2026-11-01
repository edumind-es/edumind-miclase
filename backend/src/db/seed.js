#!/usr/bin/env node
/**
 * Carga el currículo generado (JSON) en la base de datos SQLite.
 * Ejecutar una sola vez después de crear la DB o cuando se actualicen los JSON.
 * Uso: node src/db/seed.js
 */
import { mkdirSync, readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import { conexionDeObjetivo, objetivoDeCriterio } from './conexiones.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '../../..')
const DB_PATH = process.env.DB_PATH || join(ROOT, 'backend/data/miclase.db')
const CURRICULUM_PATH = process.env.CURRICULUM_PATH || join(ROOT, 'curriculum')

// backend/data/ no se versiona, asi que en un clon limpio no existe y
// better-sqlite3 falla con «the directory does not exist». Lo destapo la
// primera ejecucion de la integracion continua.
mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)

// Aplicar schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
db.exec(schema)

const inserts = {
  competencia: db.prepare(`
    INSERT OR IGNORE INTO c_competencias (id, titulo, comunidad, etapa)
    VALUES (@id, @titulo, @comunidad, @etapa)
  `),
  descriptor: db.prepare(`
    INSERT OR REPLACE INTO c_descriptores (id, competencia_id, descripcion, comunidad, etapa)
    VALUES (@id, @competencia_id, @descripcion, @comunidad, @etapa)
  `),
  criterio: db.prepare(`
    INSERT OR REPLACE INTO c_criterios (id, asignatura, curso, etapa, comunidad, objetivo_id, descripcion, peso)
    VALUES (@id, @asignatura, @curso, @etapa, @comunidad, @objetivo_id, @descripcion, @peso)
  `),
  bloque: db.prepare(`
    INSERT OR REPLACE INTO c_bloques (id, asignatura, curso, etapa, comunidad, titulo)
    VALUES (@id, @asignatura, @curso, @etapa, @comunidad, @titulo)
  `),
  objetivo: db.prepare(`
    INSERT OR REPLACE INTO c_objetivos (id, asignatura, curso, etapa, comunidad, descripcion, conexion_origen)
    VALUES (@id, @asignatura, @curso, @etapa, @comunidad, @descripcion, @conexion_origen)
  `),
  borrarConexiones: db.prepare(`
    DELETE FROM c_conexiones WHERE asignatura = @asignatura AND curso = @curso AND etapa = @etapa AND comunidad = @comunidad
  `),
  conexion: db.prepare(`
    INSERT OR IGNORE INTO c_conexiones (objetivo_id, tipo, codigo, asignatura, curso, etapa, comunidad)
    VALUES (@objetivo_id, @tipo, @codigo, @asignatura, @curso, @etapa, @comunidad)
  `),
  saber: db.prepare(`
    INSERT OR REPLACE INTO c_saberes (id, bloque_id, asignatura, curso, etapa, comunidad, descripcion)
    VALUES (@id, @bloque_id, @asignatura, @curso, @etapa, @comunidad, @descripcion)
  `),
  saberCriterio: db.prepare(`
    INSERT OR IGNORE INTO c_saberes_criterios (saber_id, criterio_id, asignatura, curso, etapa, comunidad)
    VALUES (@saber_id, @criterio_id, @asignatura, @curso, @etapa, @comunidad)
  `),
}

// Currículo estatal: texto de los descriptores (Anexo I, igual en todas las
// comunidades) y conexión de reserva por competencia específica. Lo genera
// scripts/extraer_estatal.py. Las carpetas que empiezan por «_» no son
// comunidades.
const ESTATAL = {}
for (const etapa of ['primaria', 'secundaria']) {
  const datos = loadJsonFile(join(CURRICULUM_PATH, '_estatal', `${etapa}.json`))
  if (datos) {
    ESTATAL[etapa] = {
      ...datos,
      validos: new Set(datos.descriptores.map(d => d.id)),
      estatales: datos.competencias_especificas,
    }
  }
}
const origenes = {}

function loadJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function processFile(filePath) {
  const data = loadJsonFile(filePath)
  if (!data) return 0

  const { meta, competencias, descriptores, criterios, bloques, saberes } = data
  const objetivos = data.objetivos ?? []
  const ctx = {
    asignatura: meta.asignatura,
    curso: meta.curso,
    etapa: meta.etapa,
    comunidad: meta.comunidad,
  }

  const estatal = ESTATAL[ctx.etapa]
  // Sin currículo estatal de la etapa, valen los descriptores del propio JSON
  const contexto = estatal ?? {
    validos: new Set(descriptores.map(d => d.id)),
    estatales: [],
  }

  const seedFile = db.transaction(() => {
    for (const c of [...competencias, ...(estatal?.competencias ?? [])]) {
      inserts.competencia.run({ ...c, comunidad: ctx.comunidad, etapa: ctx.etapa })
    }
    // El texto estatal va después y manda: el de algunas matrices llega roto
    for (const d of [...descriptores, ...(estatal?.descriptores ?? [])]) {
      inserts.descriptor.run({ ...d, comunidad: ctx.comunidad, etapa: ctx.etapa })
    }
    inserts.borrarConexiones.run(ctx)
    for (const o of objetivos) {
      const con = conexionDeObjetivo(o, contexto)
      origenes[con.origen] = (origenes[con.origen] ?? 0) + 1
      inserts.objetivo.run({ id: o.id, descripcion: o.descripcion, conexion_origen: con.origen, ...ctx })
      for (const codigo of con.descriptores) {
        inserts.conexion.run({ objetivo_id: o.id, tipo: 'descriptor', codigo, ...ctx })
      }
      for (const codigo of con.competencias) {
        inserts.conexion.run({ objetivo_id: o.id, tipo: 'competencia', codigo, ...ctx })
      }
    }
    for (const cr of criterios) {
      inserts.criterio.run({ ...cr, objetivo_id: objetivoDeCriterio(cr), ...ctx })
    }
    for (const b of bloques) {
      inserts.bloque.run({ ...b, ...ctx })
    }
    for (const s of saberes) {
      inserts.saber.run({ ...s, ...ctx })
      for (const cid of (s.criterios_ids || [])) {
        inserts.saberCriterio.run({
          saber_id: s.id,
          criterio_id: cid,
          ...ctx,
        })
      }
    }
  })

  seedFile()
  return criterios.length
}

function walkDir(dir) {
  let total = 0
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (entry.startsWith('_')) continue
    if (statSync(fullPath).isDirectory()) {
      total += walkDir(fullPath)
    } else if (entry.endsWith('.json')) {
      const n = processFile(fullPath)
      if (n > 0) {
        console.log(`  ✓ ${fullPath.replace(CURRICULUM_PATH + '/', '')} (${n} criterios)`)
        total++
      }
    }
  }
  return total
}

console.log(`Seeding curriculum en: ${DB_PATH}`)
const total = walkDir(CURRICULUM_PATH)
console.log(`\nCompletado: ${total} ficheros cargados.`)

// Estadísticas
const stats = {
  criterios: db.prepare('SELECT COUNT(*) as n FROM c_criterios').get().n,
  saberes: db.prepare('SELECT COUNT(*) as n FROM c_saberes').get().n,
  bloques: db.prepare('SELECT COUNT(*) as n FROM c_bloques').get().n,
  descriptores: db.prepare('SELECT COUNT(*) as n FROM c_descriptores').get().n,
  conexiones: db.prepare("SELECT COUNT(*) as n FROM c_conexiones WHERE tipo = 'descriptor'").get().n,
}
console.log(`DB: ${stats.criterios} criterios, ${stats.saberes} saberes, ${stats.bloques} bloques`)
console.log(`Competencias clave: ${stats.descriptores} descriptores, ${stats.conexiones} conexiones con descriptor`)
console.log(`Origen de la conexión por competencia específica: ${JSON.stringify(origenes)}`)
db.close()
