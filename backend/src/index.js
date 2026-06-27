import 'dotenv/config'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import Database from 'better-sqlite3'

import gruposRoutes from './routes/grupos.js'
import alumnosRoutes from './routes/alumnos.js'
import asignaturasRoutes from './routes/asignaturas.js'
import calificacionesRoutes from './routes/calificaciones.js'
import curriculumRoutes from './routes/curriculum.js'
import sesionesRoutes from './routes/sesiones.js'
import authRoutes from './routes/auth.js'
import backupRoutes from './routes/backup.js'
import authPlugin from './plugins/auth.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '../..')

const PORT = parseInt(process.env.PORT || '3210', 10)
const DB_PATH = process.env.DB_PATH || join(ROOT, 'data/miclase.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Aplicar schema si la DB es nueva
const schema = readFileSync(join(__dirname, 'db/schema.sql'), 'utf8')
db.exec(schema)

// Migraciones en caliente (idempotentes)
try { db.prepare('ALTER TABLE alumnos ADD COLUMN codigo_cifrado TEXT').run() } catch {}
try { db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_alumnos_codigo ON alumnos(codigo_cifrado)').run() } catch {}

// Docente por defecto en primera ejecución
if (!db.prepare('SELECT id FROM docentes LIMIT 1').get()) {
  db.prepare("INSERT INTO docentes (nombre, email) VALUES ('Docente Principal', NULL)").run()
}

const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' } })

await app.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://miclase.edumind.es']
    : true,
  credentials: true,
})

// Inyectar DB en todas las rutas
app.decorate('db', db)

// Auth plugin (proporciona app.getDocente)
await app.register(authPlugin)

// Rutas
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(backupRoutes, { prefix: '/api/backup' })
await app.register(gruposRoutes, { prefix: '/api/grupos' })
await app.register(alumnosRoutes, { prefix: '/api/alumnos' })
await app.register(asignaturasRoutes, { prefix: '/api/asignaturas' })
await app.register(calificacionesRoutes, { prefix: '/api/calificaciones' })
await app.register(curriculumRoutes, { prefix: '/api/curriculum' })
await app.register(sesionesRoutes, { prefix: '/api/sesiones' })

app.get('/api/health', async () => ({ status: 'ok', version: '0.1.0' }))

app.setErrorHandler((error, request, reply) => {
  app.log.error(error)
  reply.status(error.statusCode || 500).send({ error: error.message })
})

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
  console.log(`EDUmind MiClase backend en http://127.0.0.1:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
