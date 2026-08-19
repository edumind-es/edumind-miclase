import 'dotenv/config'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import Database from 'better-sqlite3'

// Local-first: los datos del docente viven en el navegador (IndexedDB).
// El servidor solo sirve currículo (datos públicos) y autenticación.
import curriculumRoutes from './routes/curriculum.js'
import authRoutes from './routes/auth.js'
import authPlugin from './plugins/auth.js'
import syncRoutes from './routes/sync.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '../..')

const PORT = parseInt(process.env.PORT || '3270', 10)
const DB_PATH = process.env.DB_PATH || join(ROOT, 'data/miclase.db')

// En producción el JWT de sesión debe firmarse con un secreto propio,
// nunca con el valor por defecto que está en el repositorio
if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET || '').length < 32) {
  console.error('ERROR: falta JWT_SECRET (mínimo 32 caracteres) en backend/.env — no se puede arrancar en producción')
  process.exit(1)
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Aplicar schema si la DB es nueva
const schema = readFileSync(join(__dirname, 'db/schema.sql'), 'utf8')
db.exec(schema)

// Docente por defecto en primera ejecución
if (!db.prepare('SELECT id FROM docentes LIMIT 1').get()) {
  db.prepare("INSERT INTO docentes (nombre, email) VALUES ('Docente Principal', NULL)").run()
}

const app = Fastify({
  logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' },
  // Los lotes de sincronización llevan evidencias cifradas en base64
  bodyLimit: 64 * 1024 * 1024,
})

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
await app.register(curriculumRoutes, { prefix: '/api/curriculum' })
await app.register(syncRoutes, { prefix: '/api/sync' })

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
