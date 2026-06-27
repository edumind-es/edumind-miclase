export default async function sesionesRoutes(app) {
  const db = app.db

  app.get('/', async (req) => {
    const { grupo_id, desde, hasta } = req.query
    let query = 'SELECT * FROM sesiones WHERE 1=1'
    const params = []
    if (grupo_id) { query += ' AND grupo_id = ?'; params.push(grupo_id) }
    if (desde) { query += ' AND fecha >= ?'; params.push(desde) }
    if (hasta) { query += ' AND fecha <= ?'; params.push(hasta) }
    query += ' ORDER BY fecha DESC'
    return db.prepare(query).all(...params)
  })

  app.post('/', async (req, reply) => {
    const { grupo_id, fecha, tipo = 'clase', notas } = req.body
    if (!grupo_id || !fecha) return reply.status(400).send({ error: 'grupo_id y fecha son obligatorios' })
    const result = db.prepare(
      'INSERT INTO sesiones (grupo_id, fecha, tipo, notas) VALUES (?, ?, ?, ?)'
    ).run(grupo_id, fecha, tipo, notas)
    return { id: result.lastInsertRowid }
  })

  // Registrar asistencia de toda la clase en una sesión
  app.post('/:id/asistencia', async (req, reply) => {
    const { registros } = req.body  // [{alumno_id, estado}]
    if (!Array.isArray(registros)) return reply.status(400).send({ error: 'registros debe ser array' })
    const stmt = db.prepare(`
      INSERT INTO asistencia (sesion_id, alumno_id, estado) VALUES (?, ?, ?)
      ON CONFLICT(sesion_id, alumno_id) DO UPDATE SET estado = excluded.estado
    `)
    const batch = db.transaction((items) => {
      for (const r of items) stmt.run(req.params.id, r.alumno_id, r.estado)
    })
    batch(registros)
    return { ok: true }
  })

  // Asistencia de una sesión concreta
  app.get('/:id/asistencia', async (req) => {
    return db.prepare(`
      SELECT a.alumno_id, al.nombre, al.apellidos, a.estado
      FROM asistencia a
      JOIN alumnos al ON al.id = a.alumno_id
      WHERE a.sesion_id = ?
      ORDER BY al.apellidos, al.nombre
    `).all(req.params.id)
  })

  // Resumen de asistencia de un alumno en un grupo
  app.get('/resumen/:alumno_id', async (req) => {
    const { grupo_id } = req.query
    return db.prepare(`
      SELECT a.estado, COUNT(*) as total
      FROM asistencia a
      JOIN sesiones s ON s.id = a.sesion_id
      WHERE a.alumno_id = ? ${grupo_id ? 'AND s.grupo_id = ?' : ''}
      GROUP BY a.estado
    `).all(...(grupo_id ? [req.params.alumno_id, grupo_id] : [req.params.alumno_id]))
  })
}
