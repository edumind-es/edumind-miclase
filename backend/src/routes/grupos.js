export default async function gruposRoutes(app) {
  const db = app.db

  app.get('/', async () => {
    return db.prepare(`
      SELECT g.*, COUNT(ga.alumno_id) as num_alumnos
      FROM grupos g
      LEFT JOIN grupo_alumnos ga ON ga.grupo_id = g.id AND ga.activo = 1
      GROUP BY g.id
      ORDER BY g.curso_escolar DESC, g.nombre
    `).all()
  })

  app.get('/:id', async (req, reply) => {
    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(req.params.id)
    if (!grupo) return reply.status(404).send({ error: 'Grupo no encontrado' })
    const alumnos = db.prepare(`
      SELECT a.* FROM alumnos a
      JOIN grupo_alumnos ga ON ga.alumno_id = a.id
      WHERE ga.grupo_id = ? AND ga.activo = 1
      ORDER BY a.apellidos, a.nombre
    `).all(req.params.id)
    return { ...grupo, alumnos }
  })

  app.post('/', async (req, reply) => {
    const { nombre, etapa, curso, comunidad = 'Galicia', curso_escolar, docente_id = 1, color } = req.body
    if (!nombre || !etapa || !curso || !curso_escolar) {
      return reply.status(400).send({ error: 'Faltan campos obligatorios' })
    }
    const result = db.prepare(`
      INSERT INTO grupos (nombre, etapa, curso, comunidad, curso_escolar, docente_id, color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nombre, etapa, curso, comunidad, curso_escolar, docente_id, color || '#4A90D9')
    return { id: result.lastInsertRowid }
  })

  app.put('/:id', async (req, reply) => {
    const grupo = db.prepare('SELECT id FROM grupos WHERE id = ?').get(req.params.id)
    if (!grupo) return reply.status(404).send({ error: 'Grupo no encontrado' })
    const { nombre, color } = req.body
    db.prepare('UPDATE grupos SET nombre = ?, color = ? WHERE id = ?')
      .run(nombre, color, req.params.id)
    return { ok: true }
  })

  app.delete('/:id', async (req, reply) => {
    const grupo = db.prepare('SELECT id FROM grupos WHERE id = ?').get(req.params.id)
    if (!grupo) return reply.status(404).send({ error: 'Grupo no encontrado' })
    db.prepare('DELETE FROM grupos WHERE id = ?').run(req.params.id)
    return { ok: true }
  })

  // Añadir alumno a grupo
  app.post('/:id/alumnos/:alumno_id', async (req, reply) => {
    try {
      db.prepare('INSERT INTO grupo_alumnos (grupo_id, alumno_id) VALUES (?, ?)')
        .run(req.params.id, req.params.alumno_id)
      return { ok: true }
    } catch {
      return reply.status(409).send({ error: 'El alumno ya está en el grupo' })
    }
  })

  // Quitar alumno de grupo
  app.delete('/:id/alumnos/:alumno_id', async (req) => {
    db.prepare('UPDATE grupo_alumnos SET activo = 0 WHERE grupo_id = ? AND alumno_id = ?')
      .run(req.params.id, req.params.alumno_id)
    return { ok: true }
  })
}
