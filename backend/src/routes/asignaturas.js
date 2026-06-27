export default async function asignaturasRoutes(app) {
  const db = app.db

  app.get('/', async (req) => {
    const { grupo_id } = req.query
    if (grupo_id) {
      return db.prepare('SELECT * FROM asignaturas WHERE grupo_id = ? ORDER BY nombre_display')
        .all(grupo_id)
    }
    return db.prepare('SELECT * FROM asignaturas ORDER BY nombre_display').all()
  })

  app.get('/:id', async (req, reply) => {
    const asig = db.prepare('SELECT * FROM asignaturas WHERE id = ?').get(req.params.id)
    if (!asig) return reply.status(404).send({ error: 'Asignatura no encontrada' })
    const instrumentos = db.prepare(
      'SELECT * FROM instrumentos WHERE asignatura_id = ? ORDER BY orden, id'
    ).all(req.params.id)
    return { ...asig, instrumentos }
  })

  app.post('/', async (req, reply) => {
    const { grupo_id, nombre, nombre_display, comunidad = 'Galicia', pesos_trimestres } = req.body
    if (!grupo_id || !nombre || !nombre_display) {
      return reply.status(400).send({ error: 'Faltan campos obligatorios' })
    }
    const result = db.prepare(`
      INSERT INTO asignaturas (grupo_id, nombre, nombre_display, comunidad, pesos_trimestres)
      VALUES (?, ?, ?, ?, ?)
    `).run(grupo_id, nombre, nombre_display, comunidad,
      pesos_trimestres ? JSON.stringify(pesos_trimestres) : '{"1":33,"2":33,"3":34}')
    return { id: result.lastInsertRowid }
  })

  // Gestión de instrumentos de evaluación
  app.post('/:id/instrumentos', async (req, reply) => {
    const { nombre, tipo, peso = 100, trimestres = [1, 2, 3] } = req.body
    if (!nombre || !tipo) {
      return reply.status(400).send({ error: 'nombre y tipo son obligatorios' })
    }
    const orden = db.prepare(
      'SELECT COALESCE(MAX(orden), 0) + 1 as siguiente FROM instrumentos WHERE asignatura_id = ?'
    ).get(req.params.id).siguiente
    const result = db.prepare(`
      INSERT INTO instrumentos (asignatura_id, nombre, tipo, peso, trimestres, orden)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.params.id, nombre, tipo, peso, JSON.stringify(trimestres), orden)
    return { id: result.lastInsertRowid }
  })

  app.delete('/:id/instrumentos/:instrumento_id', async (req) => {
    db.prepare('DELETE FROM instrumentos WHERE id = ? AND asignatura_id = ?')
      .run(req.params.instrumento_id, req.params.id)
    return { ok: true }
  })
}
