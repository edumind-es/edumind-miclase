export default async function calificacionesRoutes(app) {
  const db = app.db

  // Calificador completo: todos los alumnos × todos los criterios × trimestre
  app.get('/calificador', async (req, reply) => {
    const { asignatura_id, trimestre } = req.query
    if (!asignatura_id) return reply.status(400).send({ error: 'asignatura_id requerido' })

    const asig = db.prepare('SELECT * FROM asignaturas WHERE id = ?').get(asignatura_id)
    if (!asig) return reply.status(404).send({ error: 'Asignatura no encontrada' })

    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(asig.grupo_id)
    const alumnos = db.prepare(`
      SELECT a.id, a.nombre, a.apellidos, a.neae FROM alumnos a
      JOIN grupo_alumnos ga ON ga.alumno_id = a.id
      WHERE ga.grupo_id = ? AND ga.activo = 1
      ORDER BY a.apellidos, a.nombre
    `).all(asig.grupo_id)

    const criterios = db.prepare(`
      SELECT * FROM c_criterios
      WHERE asignatura = ? AND curso = ? AND etapa = ? AND comunidad = ?
      ORDER BY id
    `).all(asig.nombre, grupo.curso, grupo.etapa, asig.comunidad)

    const instrumentos = db.prepare(
      'SELECT * FROM instrumentos WHERE asignatura_id = ? ORDER BY orden'
    ).all(asignatura_id)

    const filtroTrimestre = trimestre ? 'AND c.trimestre = ?' : ''
    const params = trimestre
      ? [asignatura_id, Number(trimestre)]
      : [asignatura_id]

    const califs = db.prepare(`
      SELECT c.alumno_id, c.criterio_id, c.instrumento_id, c.trimestre, c.valor, c.observacion
      FROM calificaciones c
      JOIN instrumentos i ON i.id = c.instrumento_id
      WHERE i.asignatura_id = ? ${filtroTrimestre}
    `).all(...params)

    // Indexar por alumno→criterio→instrumento→trimestre
    const index = {}
    for (const cal of califs) {
      const key = `${cal.alumno_id}:${cal.criterio_id}:${cal.instrumento_id}:${cal.trimestre}`
      index[key] = cal
    }

    return { alumnos, criterios, instrumentos, calificaciones: index }
  })

  // Guardar / actualizar una calificación
  app.post('/', async (req, reply) => {
    const { alumno_id, instrumento_id, criterio_id, asignatura, curso, etapa, comunidad = 'Galicia', trimestre, valor, observacion } = req.body
    if (!alumno_id || !instrumento_id || !criterio_id || !trimestre) {
      return reply.status(400).send({ error: 'Faltan campos obligatorios' })
    }
    db.prepare(`
      INSERT INTO calificaciones (alumno_id, instrumento_id, criterio_id, asignatura, curso, etapa, comunidad, trimestre, valor, observacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(alumno_id, instrumento_id, criterio_id, trimestre)
      DO UPDATE SET valor = excluded.valor, observacion = excluded.observacion, fecha = datetime('now')
    `).run(alumno_id, instrumento_id, criterio_id, asignatura, curso, etapa, comunidad, trimestre, valor ?? null, observacion ?? null)
    return { ok: true }
  })

  // Guardar múltiples calificaciones en batch (para el calificador tipo grid)
  app.post('/batch', async (req, reply) => {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ error: 'items debe ser un array no vacío' })
    }
    const stmt = db.prepare(`
      INSERT INTO calificaciones (alumno_id, instrumento_id, criterio_id, asignatura, curso, etapa, comunidad, trimestre, valor, observacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(alumno_id, instrumento_id, criterio_id, trimestre)
      DO UPDATE SET valor = excluded.valor, observacion = excluded.observacion, fecha = datetime('now')
    `)
    const batchInsert = db.transaction((rows) => {
      for (const r of rows) {
        stmt.run(r.alumno_id, r.instrumento_id, r.criterio_id, r.asignatura, r.curso, r.etapa,
          r.comunidad || 'Galicia', r.trimestre, r.valor ?? null, r.observacion ?? null)
      }
    })
    batchInsert(items)
    return { ok: true, count: items.length }
  })

  // Media por criterio de un grupo en una asignatura
  app.get('/resumen-grupo', async (req, reply) => {
    const { asignatura_id, trimestre } = req.query
    if (!asignatura_id) return reply.status(400).send({ error: 'asignatura_id requerido' })
    const filtro = trimestre ? 'AND c.trimestre = ?' : ''
    const params = trimestre ? [asignatura_id, Number(trimestre)] : [asignatura_id]
    return db.prepare(`
      SELECT c.criterio_id, c.trimestre,
        COUNT(c.valor) as n_calificados,
        AVG(c.valor) as media,
        MIN(c.valor) as minimo,
        MAX(c.valor) as maximo
      FROM calificaciones c
      JOIN instrumentos i ON i.id = c.instrumento_id
      WHERE i.asignatura_id = ? ${filtro} AND c.valor IS NOT NULL
      GROUP BY c.criterio_id, c.trimestre
      ORDER BY c.criterio_id, c.trimestre
    `).all(...params)
  })
}
