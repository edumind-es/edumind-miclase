/**
 * Exportación e importación de datos del docente.
 * Los datos se devuelven en claro al cliente; el cifrado lo aplica
 * el frontend con AES-256-GCM + PBKDF2 antes de guardar el archivo.
 */
export default async function backupRoutes(app) {
  const db = app.db

  // Exportar todos los datos del docente activo
  app.get('/export', async (req, reply) => {
    const docenteId = await app.getDocente(req)
    if (!docenteId) return reply.status(401).send({ error: 'No autenticado' })

    const grupos = db.prepare('SELECT * FROM grupos WHERE docente_id = ?').all(docenteId)
    const grupoIds = grupos.map(g => g.id)

    if (grupoIds.length === 0) {
      return { version: 1, exportado_en: new Date().toISOString(), grupos: [], alumnos: [], grupo_alumnos: [], asignaturas: [], instrumentos: [], calificaciones: [], sesiones: [], asistencia: [] }
    }

    const ph = grupoIds.map(() => '?').join(',')

    const alumnos = db.prepare(`
      SELECT DISTINCT a.* FROM alumnos a
      JOIN grupo_alumnos ga ON ga.alumno_id = a.id
      WHERE ga.grupo_id IN (${ph})
    `).all(...grupoIds)

    const alumnoIds = alumnos.map(a => a.id)
    const alumPh = alumnoIds.length > 0 ? alumnoIds.map(() => '?').join(',') : '0'

    return {
      version: 1,
      exportado_en: new Date().toISOString(),
      docente_id_original: docenteId,
      grupos,
      alumnos,
      grupo_alumnos: db.prepare(`SELECT * FROM grupo_alumnos WHERE grupo_id IN (${ph})`).all(...grupoIds),
      asignaturas:   db.prepare(`SELECT * FROM asignaturas WHERE grupo_id IN (${ph})`).all(...grupoIds),
      instrumentos:  db.prepare(`
        SELECT i.* FROM instrumentos i
        JOIN asignaturas a ON a.id = i.asignatura_id
        WHERE a.grupo_id IN (${ph})
      `).all(...grupoIds),
      calificaciones: alumnoIds.length > 0
        ? db.prepare(`SELECT * FROM calificaciones WHERE alumno_id IN (${alumPh})`).all(...alumnoIds)
        : [],
      sesiones:    db.prepare(`SELECT * FROM sesiones WHERE grupo_id IN (${ph})`).all(...grupoIds),
      asistencia:  alumnoIds.length > 0
        ? db.prepare(`
            SELECT a.* FROM asistencia a
            JOIN sesiones s ON s.id = a.sesion_id
            WHERE s.grupo_id IN (${ph})
          `).all(...grupoIds)
        : [],
    }
  })

  // Importar datos (el frontend ya descifró el archivo)
  app.post('/import', async (req, reply) => {
    const docenteId = await app.getDocente(req)
    if (!docenteId) return reply.status(401).send({ error: 'No autenticado' })

    const { grupos = [], alumnos = [], grupo_alumnos = [], asignaturas = [], instrumentos = [], calificaciones = [], sesiones = [], asistencia = [] } = req.body

    if (grupos.length === 0) {
      return reply.status(400).send({ error: 'El backup no contiene grupos' })
    }

    // Mapa de IDs originales → nuevos IDs (para reasignar foreign keys)
    const mapaGrupos      = new Map()
    const mapaAlumnos     = new Map()
    const mapaAsignaturas = new Map()
    const mapaInstrumentos= new Map()
    const mapaSesiones    = new Map()

    const doImport = db.transaction(() => {
      // Grupos
      for (const g of grupos) {
        const { id: oldId, ...rest } = g
        const r = db.prepare(`
          INSERT INTO grupos (nombre, etapa, curso, comunidad, curso_escolar, docente_id, color)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(rest.nombre, rest.etapa, rest.curso, rest.comunidad || 'Galicia',
               rest.curso_escolar, docenteId, rest.color || '#4A90D9')
        mapaGrupos.set(oldId, r.lastInsertRowid)
      }

      // Alumnos
      for (const a of alumnos) {
        const { id: oldId, ...rest } = a
        const r = db.prepare(`
          INSERT INTO alumnos (nombre, apellidos, fecha_nacimiento, neae, etiquetas, observaciones, codigo_cifrado)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(rest.nombre, rest.apellidos, rest.fecha_nacimiento, rest.neae || 0,
               rest.etiquetas || '[]', rest.observaciones, rest.codigo_cifrado)
        mapaAlumnos.set(oldId, r.lastInsertRowid)
      }

      // Grupo_alumnos
      for (const ga of grupo_alumnos) {
        const newGrupo = mapaGrupos.get(ga.grupo_id)
        const newAlumno = mapaAlumnos.get(ga.alumno_id)
        if (newGrupo && newAlumno) {
          db.prepare('INSERT OR IGNORE INTO grupo_alumnos (grupo_id, alumno_id, activo) VALUES (?, ?, ?)')
            .run(newGrupo, newAlumno, ga.activo ?? 1)
        }
      }

      // Asignaturas
      for (const a of asignaturas) {
        const { id: oldId, ...rest } = a
        const newGrupo = mapaGrupos.get(rest.grupo_id)
        if (!newGrupo) continue
        const r = db.prepare(`
          INSERT INTO asignaturas (grupo_id, nombre, nombre_display, comunidad, pesos_trimestres)
          VALUES (?, ?, ?, ?, ?)
        `).run(newGrupo, rest.nombre, rest.nombre_display, rest.comunidad || 'Galicia', rest.pesos_trimestres)
        mapaAsignaturas.set(oldId, r.lastInsertRowid)
      }

      // Instrumentos
      for (const inst of instrumentos) {
        const { id: oldId, ...rest } = inst
        const newAsig = mapaAsignaturas.get(rest.asignatura_id)
        if (!newAsig) continue
        const r = db.prepare(`
          INSERT INTO instrumentos (asignatura_id, nombre, tipo, peso, trimestres, orden)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(newAsig, rest.nombre, rest.tipo, rest.peso, rest.trimestres, rest.orden || 0)
        mapaInstrumentos.set(oldId, r.lastInsertRowid)
      }

      // Calificaciones
      for (const c of calificaciones) {
        const newAlumno = mapaAlumnos.get(c.alumno_id)
        const newInstr  = mapaInstrumentos.get(c.instrumento_id)
        if (!newAlumno || !newInstr) continue
        db.prepare(`
          INSERT OR IGNORE INTO calificaciones
            (alumno_id, instrumento_id, criterio_id, asignatura, curso, etapa, comunidad, trimestre, valor, observacion)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newAlumno, newInstr, c.criterio_id, c.asignatura, c.curso, c.etapa,
               c.comunidad || 'Galicia', c.trimestre, c.valor, c.observacion)
      }

      // Sesiones
      for (const s of sesiones) {
        const { id: oldId, ...rest } = s
        const newGrupo = mapaGrupos.get(rest.grupo_id)
        if (!newGrupo) continue
        const r = db.prepare('INSERT INTO sesiones (grupo_id, fecha, tipo, notas) VALUES (?, ?, ?, ?)')
          .run(newGrupo, rest.fecha, rest.tipo || 'clase', rest.notas)
        mapaSesiones.set(oldId, r.lastInsertRowid)
      }

      // Asistencia
      for (const a of asistencia) {
        const newSesion = mapaSesiones.get(a.sesion_id)
        const newAlumno = mapaAlumnos.get(a.alumno_id)
        if (!newSesion || !newAlumno) continue
        db.prepare('INSERT OR IGNORE INTO asistencia (sesion_id, alumno_id, estado) VALUES (?, ?, ?)')
          .run(newSesion, newAlumno, a.estado)
      }
    })

    doImport()

    return {
      ok: true,
      importados: {
        grupos:        mapaGrupos.size,
        alumnos:       mapaAlumnos.size,
        asignaturas:   mapaAsignaturas.size,
        calificaciones: calificaciones.filter(c => mapaAlumnos.has(c.alumno_id)).length,
      }
    }
  })
}
