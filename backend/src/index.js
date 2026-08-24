import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import Database from 'better-sqlite3'

// Valida JWT_SECRET y resuelve DB_PATH; aborta el arranque si el secreto
// falta, es corto o es el que está publicado en el repositorio.
import { DB_PATH } from './config.js'

// Local-first: los datos del docente viven en el navegador (IndexedDB).
// El servidor solo sirve currículo (datos públicos) y autenticación.
import curriculumRoutes from './routes/curriculum.js'
import authRoutes from './routes/auth.js'
import authPlugin from './plugins/auth.js'
import syncRoutes from './routes/sync.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const PORT = parseInt(process.env.PORT || '3270', 10)

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

// `origin: true` refleja cualquier Origin que pida, y con credentials:true
// eso deja que cualquier web abierta en el navegador del docente llame a
// este API con su sesión. En desarrollo se listan los orígenes reales:
// Vite y los dos contenedores de Capacitor.
const ORIGENES_DEV = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'capacitor://localhost',
  'http://localhost',
]

await app.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://miclase.edumind.es']
    : ORIGENES_DEV,
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
  const status = error.statusCode || 500
  // Los 4xx llevan mensajes que las rutas escriben a propósito para el
  // cliente. Los 5xx son fallos internos y su mensaje puede llevar nombres
  // de tabla o rutas del servidor: se registra, pero no se devuelve.
  reply.status(status).send({
    error: status < 500 ? error.message : 'Error interno del servidor',
  })
})

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
  console.log(`EDUmind MiClase backend en http://127.0.0.1:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
