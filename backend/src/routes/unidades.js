export default async function unidadesRoutes(app) {
  const db = app.db

  // Listar unidades de una asignatura (con sus criterios)
  app.get('/', async (req, reply) => {
    const { asignatura_id } = req.query
    if (!asignatura_id) return reply.status(400).send({ error: 'asignatura_id requerido' })

    const unidades = db.prepare(
      'SELECT * FROM unidades WHERE asignatura_id = ? ORDER BY orden, id'
    ).all(asignatura_id)

    // Obtener contexto curricular para filtrar la JOIN correctamente
    const ctx = db.prepare(`
      SELECT a.nombre AS asig_nombre, a.comunidad, g.etapa, g.curso
      FROM asignaturas a JOIN grupos g ON g.id = a.grupo_id
      WHERE a.id = ?
    `).get(asignatura_id)

    const cursoNorm = ctx ? ctx.curso.replace('º', '').replace('ª', '') + 'º' : ''

    const getCriterios = db.prepare(`
      SELECT uc.criterio_id, uc.peso, cc.descripcion
      FROM unidad_criterios uc
      LEFT JOIN c_criterios cc ON cc.id = uc.criterio_id
        AND cc.asignatura = ? AND cc.curso = ? AND cc.etapa = ? AND cc.comunidad = ?
      WHERE uc.unidad_id = ?
      ORDER BY uc.criterio_id
    `)

    return unidades.map(u => ({
      ...u,
      criterios: ctx
        ? getCriterios.all(ctx.asig_nombre, cursoNorm, ctx.etapa, ctx.comunidad, u.id)
        : [],
    }))
  })

  // Crear unidad
  app.post('/', async (req, reply) => {
    const { asignatura_id, nombre, tipo = 'unidad', descripcion, trimestre, orden } = req.body
    if (!asignatura_id || !nombre) return reply.status(400).send({ error: 'asignatura_id y nombre son obligatorios' })

    const maxOrden = db.prepare('SELECT COALESCE(MAX(orden), -1) + 1 as sig FROM unidades WHERE asignatura_id = ?').get(asignatura_id)
    const result = db.prepare(`
      INSERT INTO unidades (asignatura_id, nombre, tipo, descripcion, trimestre, orden)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(asignatura_id, nombre, tipo, descripcion || null, trimestre || null, orden ?? maxOrden.sig)

    return { id: result.lastInsertRowid }
  })

  // Actualizar unidad
  app.put('/:id', async (req, reply) => {
    const { nombre, tipo, descripcion, trimestre, orden, activa } = req.body
    const u = db.prepare('SELECT id FROM unidades WHERE id = ?').get(req.params.id)
    if (!u) return reply.status(404).send({ error: 'Unidad no encontrada' })

    db.prepare(`
      UPDATE unidades SET
        nombre      = COALESCE(?, nombre),
        tipo        = COALESCE(?, tipo),
        descripcion = COALESCE(?, descripcion),
        trimestre   = COALESCE(?, trimestre),
        orden       = COALESCE(?, orden),
        activa      = COALESCE(?, activa)
      WHERE id = ?
    `).run(nombre, tipo, descripcion, trimestre, orden, activa, req.params.id)

    return { ok: true }
  })

  // Eliminar unidad
  app.delete('/:id', async (req, reply) => {
    const u = db.prepare('SELECT id FROM unidades WHERE id = ?').get(req.params.id)
    if (!u) return reply.status(404).send({ error: 'Unidad no encontrada' })
    db.prepare('DELETE FROM unidades WHERE id = ?').run(req.params.id)
    return { ok: true }
  })

  // Vincular criterio a unidad
  app.post('/:id/criterios', async (req, reply) => {
    const { criterio_id, peso = 1.0 } = req.body
    if (!criterio_id) return reply.status(400).send({ error: 'criterio_id requerido' })
    db.prepare(`
      INSERT INTO unidad_criterios (unidad_id, criterio_id, peso)
      VALUES (?, ?, ?)
      ON CONFLICT(unidad_id, criterio_id) DO UPDATE SET peso = excluded.peso
    `).run(req.params.id, criterio_id, peso)
    return { ok: true }
  })

  // Desvincular criterio de unidad
  app.delete('/:id/criterios/:criterio_id', async (req) => {
    db.prepare('DELETE FROM unidad_criterios WHERE unidad_id = ? AND criterio_id = ?')
      .run(req.params.id, req.params.criterio_id)
    return { ok: true }
  })

  // Reordenar unidades en batch
  app.post('/reordenar', async (req, reply) => {
    const { orden } = req.body  // [{ id, orden }]
    if (!Array.isArray(orden)) return reply.status(400).send({ error: 'orden debe ser array' })
    const stmt = db.prepare('UPDATE unidades SET orden = ? WHERE id = ?')
    const batch = db.transaction((items) => {
      for (const item of items) stmt.run(item.orden, item.id)
    })
    batch(orden)
    return { ok: true }
  })

  // Generar plantilla automática de unidades para una asignatura
  app.post('/plantilla', async (req, reply) => {
    const { asignatura_id, n_unidades = 9, tipo = 'unidad' } = req.body
    if (!asignatura_id) return reply.status(400).send({ error: 'asignatura_id requerido' })

    const asig = db.prepare(`
      SELECT a.nombre, a.comunidad,
             g.etapa, g.curso
      FROM asignaturas a JOIN grupos g ON g.id = a.grupo_id
      WHERE a.id = ?
    `).get(asignatura_id)
    if (!asig) return reply.status(404).send({ error: 'Asignatura no encontrada' })

    // Eliminar unidades previas si las hay
    db.prepare('DELETE FROM unidades WHERE asignatura_id = ?').run(asignatura_id)

    const cursoNorm = asig.curso.replace('º', '').replace('ª', '') + 'º'
    const criterios = db.prepare(`
      SELECT id FROM c_criterios
      WHERE asignatura = ? AND curso = ? AND etapa = ? AND comunidad = ?
      ORDER BY id
    `).all(asig.nombre, cursoNorm, asig.etapa, asig.comunidad)

    if (criterios.length === 0) {
      return reply.status(422).send({ error: 'No se encontraron criterios curriculares para esta asignatura. Verifica que la asignatura y la comunidad coincidan.' })
    }

    const n = Math.min(n_unidades, 12)
    const trimestreSize = Math.ceil(n / 3)

    // Distribuir criterios entre unidades
    const criteriosPorUnidad = Math.ceil(criterios.length / n)
    const crits = criterios.map(c => c.id)

    const insertUnidad = db.prepare(
      'INSERT INTO unidades (asignatura_id, nombre, tipo, trimestre, orden) VALUES (?, ?, ?, ?, ?)'
    )
    const insertCriterio = db.prepare(
      'INSERT OR IGNORE INTO unidad_criterios (unidad_id, criterio_id, peso) VALUES (?, ?, ?)'
    )

    const tipoLabel = {
      unidad: 'UD',
      situacion: 'SA',
      proyecto: 'Proyecto',
      secuencia: 'Sec.',
      bloque: 'Bloque',
    }[tipo] || 'UD'

    const batch = db.transaction(() => {
      for (let i = 0; i < n; i++) {
        const trimestre = Math.floor(i / trimestreSize) + 1
        const { lastInsertRowid: uid } = insertUnidad.run(
          asignatura_id,
          `${tipoLabel} ${i + 1}`,
          tipo,
          Math.min(trimestre, 3),
          i
        )
        // Asignar bloque de criterios a esta unidad
        const inicio = i * criteriosPorUnidad
        const fin = Math.min(inicio + criteriosPorUnidad, crits.length)
        for (let j = inicio; j < fin; j++) {
          insertCriterio.run(uid, crits[j], 1.0)
        }
      }
    })
    batch()

    // Devolver las unidades creadas
    const unidades = db.prepare('SELECT * FROM unidades WHERE asignatura_id = ? ORDER BY orden').all(asignatura_id)
    return { ok: true, unidades, criterios_totales: criterios.length }
  })
}
