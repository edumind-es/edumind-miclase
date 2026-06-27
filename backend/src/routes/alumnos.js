// Caracteres sin ambigüedad visual (sin 0/O, sin 1/I/L)
const CODIGO_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generarCodigo(db) {
  for (let intento = 0; intento < 20; intento++) {
    let codigo = ''
    for (let i = 0; i < 5; i++) codigo += CODIGO_CHARS[Math.floor(Math.random() * CODIGO_CHARS.length)]
    if (!db.prepare('SELECT id FROM alumnos WHERE codigo_cifrado = ?').get(codigo)) return codigo
  }
  return null
}

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
    const codigo = generarCodigo(db)
    const result = db.prepare(`
      INSERT INTO alumnos (nombre, apellidos, fecha_nacimiento, neae, etiquetas, observaciones, codigo_cifrado)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nombre, apellidos, fecha_nacimiento || null, neae ? 1 : 0,
       JSON.stringify(etiquetas), observaciones || null, codigo)
    return { id: result.lastInsertRowid, codigo_cifrado: codigo }
  })

  // Importación masiva: recibe array de {nombre, apellidos}
  app.post('/bulk', async (req, reply) => {
    const { alumnos, grupo_id } = req.body
    if (!Array.isArray(alumnos) || alumnos.length === 0) {
      return reply.status(400).send({ error: 'alumnos debe ser un array no vacío' })
    }

    const insert = db.prepare(`
      INSERT INTO alumnos (nombre, apellidos, codigo_cifrado)
      VALUES (?, ?, ?)
    `)
    const vincular = db.prepare(`
      INSERT OR IGNORE INTO grupo_alumnos (grupo_id, alumno_id) VALUES (?, ?)
    `)

    const creados = db.transaction((items) => {
      const ids = []
      for (const a of items) {
        if (!a.nombre?.trim() || !a.apellidos?.trim()) continue
        const codigo = generarCodigo(db)
        const res = insert.run(a.nombre.trim(), a.apellidos.trim(), codigo)
        if (grupo_id) vincular.run(grupo_id, res.lastInsertRowid)
        ids.push({ id: res.lastInsertRowid, nombre: a.nombre, apellidos: a.apellidos, codigo_cifrado: codigo })
      }
      return ids
    })(alumnos)

    return { creados, total: creados.length }
  })

  app.put('/:id', async (req, reply) => {
    const alumno = db.prepare('SELECT id FROM alumnos WHERE id = ?').get(req.params.id)
    if (!alumno) return reply.status(404).send({ error: 'Alumno no encontrado' })
    const { nombre, apellidos, fecha_nacimiento, neae, etiquetas, observaciones } = req.body
    db.prepare(`
      UPDATE alumnos SET nombre=?, apellidos=?, fecha_nacimiento=?, neae=?, etiquetas=?, observaciones=?
      WHERE id = ?
    `).run(nombre, apellidos, fecha_nacimiento || null, neae ? 1 : 0,
       JSON.stringify(etiquetas || []), observaciones || null, req.params.id)
    return { ok: true }
  })

  // Regenerar código cifrado de un alumno
  app.post('/:id/regenerar-codigo', async (req, reply) => {
    const alumno = db.prepare('SELECT id FROM alumnos WHERE id = ?').get(req.params.id)
    if (!alumno) return reply.status(404).send({ error: 'Alumno no encontrado' })
    const codigo = generarCodigo(db)
    db.prepare('UPDATE alumnos SET codigo_cifrado = ? WHERE id = ?').run(codigo, req.params.id)
    return { codigo_cifrado: codigo }
  })

  // Exportar lista de códigos de un grupo (para el docente)
  app.get('/codigos/:grupo_id', async (req) => {
    return db.prepare(`
      SELECT a.codigo_cifrado, a.nombre, a.apellidos
      FROM alumnos a
      JOIN grupo_alumnos ga ON ga.alumno_id = a.id
      WHERE ga.grupo_id = ? AND ga.activo = 1
      ORDER BY a.apellidos, a.nombre
    `).all(req.params.grupo_id)
  })

  app.get('/:id/resumen', async (req) => {
    return db.prepare(`
      SELECT c.criterio_id, c.asignatura, c.trimestre, AVG(c.valor) as media
      FROM calificaciones c
      WHERE c.alumno_id = ? AND c.valor IS NOT NULL
      GROUP BY c.criterio_id, c.asignatura, c.trimestre
    `).all(req.params.id)
  })
}
