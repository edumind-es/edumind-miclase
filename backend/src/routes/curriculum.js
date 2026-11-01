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
    // La BD almacena el curso con º (ej: "3º"); añadirlo si viene sin él
    const base = curso.replace('º', '').replace('ª', '')
    const cursoNorm = base + 'º'
    const criterios = db.prepare(`
      SELECT cr.*, o.conexion_origen
      FROM c_criterios cr
      LEFT JOIN c_objetivos o ON o.id = cr.objetivo_id
        AND o.asignatura = cr.asignatura AND o.curso = cr.curso
        AND o.etapa = cr.etapa AND o.comunidad = cr.comunidad
      WHERE cr.asignatura = ? AND cr.curso = ? AND cr.etapa = ? AND cr.comunidad = ?
      ORDER BY cr.id
    `).all(asignatura, cursoNorm, etapa, comunidad)
    // Competencias clave de cada criterio, por su competencia específica
    // (c_conexiones; ver db/conexiones.js). Campos añadidos: quien no los lee
    // sigue recibiendo lo de siempre.
    const conexiones = db.prepare(`
      SELECT objetivo_id, tipo, codigo FROM c_conexiones
      WHERE asignatura = ? AND curso = ? AND etapa = ? AND comunidad = ?
    `).all(asignatura, cursoNorm, etapa, comunidad)
    const porObjetivo = new Map()
    for (const c of conexiones) {
      const o = porObjetivo.get(c.objetivo_id) ?? { descriptor: [], competencia: [] }
      o[c.tipo].push(c.codigo)
      porObjetivo.set(c.objetivo_id, o)
    }
    return criterios.map(cr => {
      const o = porObjetivo.get(cr.objetivo_id)
      return {
        ...cr,
        descriptores: o?.descriptor ?? [],
        competencias_clave: o?.competencia ?? [],
        conexion_origen: cr.conexion_origen ?? 'ninguna',
      }
    })
  })

  // Competencias clave y descriptores operativos del Perfil de salida
  app.get('/descriptores', async (req) => {
    const { etapa = 'primaria', comunidad = 'Galicia' } = req.query
    const descriptores = db.prepare(`
      SELECT id, competencia_id, descripcion FROM c_descriptores
      WHERE etapa = ? AND comunidad = ?
    `).all(etapa, comunidad)
    const competencias = db.prepare(`
      SELECT id, titulo FROM c_competencias
    `).all()
    return { competencias, descriptores }
  })

  // Bloques y saberes organizados
  app.get('/saberes', async (req, reply) => {
    const { asignatura, curso, etapa = 'primaria', comunidad = 'Galicia' } = req.query
    if (!asignatura || !curso) {
      return reply.status(400).send({ error: 'asignatura y curso son obligatorios' })
    }
    const cursoNorm = curso.replace('º', '').replace('ª', '') + 'º'
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
