export default async function curriculumRoutes(app) {
  const db = app.db

  // Listado de asignaturas disponibles por etapa/comunidad
  app.get('/asignaturas', async (req) => {
    const { etapa = 'primaria', comunidad = 'Galicia' } = req.query
    return db.prepare(`
      SELECT DISTINCT asignatura, etapa, comunidad
      FROM c_criterios
      WHERE etapa = ? AND comunidad = ?
      ORDER BY asignatura
    `).all(etapa, comunidad)
  })

  // Criterios de evaluación para una asignatura/curso concretos
  app.get('/criterios', async (req, reply) => {
    const { asignatura, curso, etapa = 'primaria', comunidad = 'Galicia' } = req.query
    if (!asignatura || !curso) {
      return reply.status(400).send({ error: 'asignatura y curso son obligatorios' })
    }
    // normalizar curso (puede venir con º o sin él)
    const cursoNorm = curso.replace('º', '').replace('ª', '')
    const criterios = db.prepare(`
      SELECT * FROM c_criterios
      WHERE asignatura = ? AND curso = ? AND etapa = ? AND comunidad = ?
      ORDER BY id
    `).all(asignatura, cursoNorm, etapa, comunidad)
    return criterios
  })

  // Bloques y saberes organizados
  app.get('/saberes', async (req, reply) => {
    const { asignatura, curso, etapa = 'primaria', comunidad = 'Galicia' } = req.query
    if (!asignatura || !curso) {
      return reply.status(400).send({ error: 'asignatura y curso son obligatorios' })
    }
    const cursoNorm = curso.replace('º', '').replace('ª', '')
    const bloques = db.prepare(`
      SELECT * FROM c_bloques
      WHERE asignatura = ? AND curso = ? AND etapa = ? AND comunidad = ?
      ORDER BY id
    `).all(asignatura, cursoNorm, etapa, comunidad)
    const saberes = db.prepare(`
      SELECT s.*, GROUP_CONCAT(sc.criterio_id) as criterios_ids_csv
      FROM c_saberes s
      LEFT JOIN c_saberes_criterios sc ON sc.saber_id = s.id
        AND sc.asignatura = s.asignatura AND sc.curso = s.curso
        AND sc.etapa = s.etapa AND sc.comunidad = s.comunidad
      WHERE s.asignatura = ? AND s.curso = ? AND s.etapa = ? AND s.comunidad = ?
      GROUP BY s.id, s.asignatura, s.curso, s.etapa, s.comunidad
      ORDER BY s.id
    `).all(asignatura, cursoNorm, etapa, comunidad)
    return { bloques, saberes }
  })

  // Cursos disponibles para una asignatura
  app.get('/cursos', async (req) => {
    const { asignatura, etapa = 'primaria', comunidad = 'Galicia' } = req.query
    return db.prepare(`
      SELECT DISTINCT curso FROM c_criterios
      WHERE asignatura = ? AND etapa = ? AND comunidad = ?
      ORDER BY curso
    `).all(asignatura, etapa, comunidad)
  })
}
