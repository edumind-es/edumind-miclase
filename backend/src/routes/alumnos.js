export default async function alumnosRoutes(app) {
  const db = app.db

  app.get('/', async (req) => {
    const { grupo_id } = req.query
    if (grupo_id) {
      return db.prepare(`
        SELECT a.* FROM alumnos a
        JOIN grupo_alumnos ga ON ga.alumno_id = a.id
        WHERE ga.grupo_id = ? AND ga.activo = 1
        ORDER BY a.apellidos, a.nombre
      `).all(grupo_id)
    }
    return db.prepare('SELECT * FROM alumnos ORDER BY apellidos, nombre').all()
  })

  app.get('/:id', async (req, reply) => {
    const alumno = db.prepare('SELECT * FROM alumnos WHERE id = ?').get(req.params.id)
    if (!alumno) return reply.status(404).send({ error: 'Alumno no encontrado' })
    return alumno
  })

  app.post('/', async (req, reply) => {
    const { nombre, apellidos, fecha_nacimiento, neae = 0, etiquetas = [], observaciones } = req.body
    if (!nombre || !apellidos) {
      return reply.status(400).send({ error: 'nombre y apellidos son obligatorios' })
    }
    const result = db.prepare(`
      INSERT INTO alumnos (nombre, apellidos, fecha_nacimiento, neae, etiquetas, observaciones)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(nombre, apellidos, fecha_nacimiento, neae ? 1 : 0, JSON.stringify(etiquetas), observaciones)
    return { id: result.lastInsertRowid }
  })

  app.put('/:id', async (req, reply) => {
    const alumno = db.prepare('SELECT id FROM alumnos WHERE id = ?').get(req.params.id)
    if (!alumno) return reply.status(404).send({ error: 'Alumno no encontrado' })
    const { nombre, apellidos, fecha_nacimiento, neae, etiquetas, observaciones } = req.body
    db.prepare(`
      UPDATE alumnos SET nombre=?, apellidos=?, fecha_nacimiento=?, neae=?, etiquetas=?, observaciones=?
      WHERE id = ?
    `).run(nombre, apellidos, fecha_nacimiento, neae ? 1 : 0, JSON.stringify(etiquetas || []), observaciones, req.params.id)
    return { ok: true }
  })

  // Resumen de calificaciones de un alumno
  app.get('/:id/resumen', async (req) => {
    const califs = db.prepare(`
      SELECT c.criterio_id, c.asignatura, c.trimestre, AVG(c.valor) as media
      FROM calificaciones c
      WHERE c.alumno_id = ? AND c.valor IS NOT NULL
      GROUP BY c.criterio_id, c.asignatura, c.trimestre
    `).all(req.params.id)
    return califs
  })
}
