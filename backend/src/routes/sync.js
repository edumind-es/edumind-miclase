/**
 * Sincronización multi-dispositivo cifrada de extremo a extremo.
 *
 * El servidor es un buzón ciego: almacena y reparte blobs cifrados sin
 * poder abrirlos. La clave se deriva en el navegador (PBKDF2 → AES-256-GCM)
 * de una contraseña de sincronización que nunca sale del dispositivo.
 *
 * Requiere sesión SSO real: en modo local (docente_id = 1) no se sincroniza,
 * porque todos los instaladores compartirían el mismo buzón.
 *
 * Resolución de conflictos: last-write-wins por registro, comparando
 * `updated_at`. El servidor rechaza escrituras más antiguas que la que ya
 * tiene, de modo que dos dispositivos que empujan a la vez convergen.
 */

const LIMITE_LOTE = 500                    // registros por petición

// 8 MB por registro (evidencias con foto). El cliente deriva de aquí el aviso
// que le da al docente al capturar: ver frontend/src/db/limites.ts, que tiene
// que mantener el mismo valor en LIMITE_SOBRE.
const LIMITE_PAYLOAD = 8 * 1024 * 1024

/**
 * `updated_at` decide quién gana un conflicto, y se compara como texto. Sobre
 * cadenas ISO-8601 eso ordena bien, pero sin validar nada un `updated_at` de
 * "zzz" gana a cualquier fecha real y pisa el registro bueno. Se exige forma
 * ISO antes de dejar que un valor entre en esa comparación.
 */
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

const TABLAS = new Set([
  'grupos', 'alumnos', 'grupo_alumnos', 'asignaturas', 'instrumentos',
  'unidades', 'unidad_criterios', 'criterio_instrumentos', 'calificaciones',
  'sesiones', 'asistencia', 'rubricas', 'evidencias', 'planos', 'asientos',
])

export default async function syncRoutes(app) {
  const db = app.db

  /** Docente autenticado de verdad, o null. */
  async function docenteSSO(req, reply) {
    const docenteId = await app.getDocente(req)
    if (!docenteId) {
      reply.status(401).send({ error: 'Sesión no válida' })
      return null
    }
    if (docenteId === 1) {
      reply.status(403).send({
        error: 'La sincronización requiere iniciar sesión con EDUmind',
        codigo: 'SIN_SSO',
      })
      return null
    }
    return docenteId
  }

  function estado(docenteId) {
    let fila = db.prepare('SELECT * FROM sync_estado WHERE docente_id = ?').get(docenteId)
    if (!fila) {
      db.prepare('INSERT INTO sync_estado (docente_id, seq) VALUES (?, 0)').run(docenteId)
      fila = { docente_id: docenteId, seq: 0, salt: null, verificador: null }
    }
    return fila
  }

  // ── Configuración del buzón ────────────────────────────────────────────

  /**
   * Sal de derivación y verificador de contraseña.
   * El primer dispositivo los publica; los demás los descargan para derivar
   * exactamente la misma clave a partir de la misma contraseña.
   */
  app.get('/config', async (req, reply) => {
    const docenteId = await docenteSSO(req, reply)
    if (!docenteId) return
    const e = estado(docenteId)
    const total = db.prepare('SELECT COUNT(*) n FROM sync_registros WHERE docente_id = ?').get(docenteId)
    return {
      iniciado: !!e.salt,
      salt: e.salt,
      verificador: e.verificador,
      seq: e.seq,
      registros: total.n,
      actualizado: e.actualizado,
    }
  })

  /** Publica la sal la primera vez. No se puede sobrescribir a ciegas. */
  app.post('/config', async (req, reply) => {
    const docenteId = await docenteSSO(req, reply)
    if (!docenteId) return

    const { salt, verificador, reiniciar } = req.body || {}
    if (!salt || !verificador) {
      return reply.status(400).send({ error: 'salt y verificador son obligatorios' })
    }
    const e = estado(docenteId)

    if (e.salt && !reiniciar) {
      return reply.status(409).send({
        error: 'Ya existe una contraseña de sincronización para esta cuenta',
        codigo: 'YA_INICIADO',
      })
    }

    // Reiniciar la contraseña invalida el buzón: lo cifrado con la clave
    // anterior sería indescifrable, así que se vacía explícitamente.
    const tx = db.transaction(() => {
      if (reiniciar) {
        db.prepare('DELETE FROM sync_registros WHERE docente_id = ?').run(docenteId)
      }
      db.prepare(`
        UPDATE sync_estado SET salt = ?, verificador = ?, seq = 0, actualizado = datetime('now')
        WHERE docente_id = ?
      `).run(salt, verificador, docenteId)
    })
    tx()
    return { ok: true, reiniciado: !!reiniciar }
  })

  // ── Empuje ─────────────────────────────────────────────────────────────

  app.post('/push', async (req, reply) => {
    const docenteId = await docenteSSO(req, reply)
    if (!docenteId) return

    const { device_id, registros } = req.body || {}
    if (!device_id || !Array.isArray(registros)) {
      return reply.status(400).send({ error: 'device_id y registros son obligatorios' })
    }
    if (registros.length > LIMITE_LOTE) {
      return reply.status(413).send({ error: `Máximo ${LIMITE_LOTE} registros por envío` })
    }

    const e = estado(docenteId)
    if (!e.salt) {
      return reply.status(409).send({ error: 'Configura primero la contraseña de sincronización', codigo: 'SIN_CONFIG' })
    }

    const leerActual = db.prepare(
      'SELECT updated_at FROM sync_registros WHERE docente_id = ? AND tabla = ? AND registro_id = ?')
    const escribir = db.prepare(`
      INSERT INTO sync_registros (docente_id, tabla, registro_id, seq, updated_at, device_id, iv, payload)
      VALUES (@docente_id, @tabla, @registro_id, @seq, @updated_at, @device_id, @iv, @payload)
      ON CONFLICT (docente_id, tabla, registro_id) DO UPDATE SET
        seq = excluded.seq, updated_at = excluded.updated_at,
        device_id = excluded.device_id, iv = excluded.iv, payload = excluded.payload
    `)

    let seq = e.seq
    let escritos = 0, descartados = 0

    // El cliente necesita saber QUE registro se ha rechazado y por que. Con un
    // contador a secas no podia distinguir «el servidor ya tiene una version
    // mas nueva» (normal, se resuelve en el pull) de «esta evidencia no cabe y
    // no va a caber nunca» (hay que avisar al docente). Sin ese detalle el
    // cliente avanzaba su cursor y el registro no se reintentaba jamas.
    const aceptados = []
    const rechazados = []
    const rechazar = (r, motivo) => {
      descartados++
      rechazados.push({ tabla: r.tabla, registro_id: String(r.registro_id ?? ''), motivo })
    }

    const tx = db.transaction(() => {
      for (const r of registros) {
        if (!TABLAS.has(r.tabla)) { rechazar(r, 'tabla_desconocida'); continue }
        if (!r.registro_id || !r.updated_at || !r.iv || !r.payload) { rechazar(r, 'campos_incompletos'); continue }
        if (r.payload.length > LIMITE_PAYLOAD) { rechazar(r, 'demasiado_grande'); continue }
        if (!FECHA_ISO.test(r.updated_at)) { rechazar(r, 'fecha_invalida'); continue }

        // Last-write-wins: no pisar una versión más reciente.
        // La comparación es de texto, pero sobre cadenas ISO-8601 validadas
        // arriba, que ordenan igual que las fechas que representan.
        const actual = leerActual.get(docenteId, r.tabla, String(r.registro_id))
        if (actual && actual.updated_at >= r.updated_at) { rechazar(r, 'version_anterior'); continue }

        seq++
        escribir.run({
          docente_id: docenteId,
          tabla: r.tabla,
          registro_id: String(r.registro_id),
          seq,
          updated_at: r.updated_at,
          device_id,
          iv: r.iv,
          payload: r.payload,
        })
        escritos++
        aceptados.push({ tabla: r.tabla, registro_id: String(r.registro_id) })
      }
      db.prepare("UPDATE sync_estado SET seq = ?, actualizado = datetime('now') WHERE docente_id = ?")
        .run(seq, docenteId)
    })
    tx()

    return { ok: true, escritos, descartados, seq, aceptados, rechazados }
  })

  // ── Descarga ───────────────────────────────────────────────────────────

  app.get('/pull', async (req, reply) => {
    const docenteId = await docenteSSO(req, reply)
    if (!docenteId) return

    const desde = Number(req.query.desde || 0)
    const limite = Math.min(Number(req.query.limite || LIMITE_LOTE), LIMITE_LOTE)
    const excluirDispositivo = req.query.excluir_device || null

    const filas = db.prepare(`
      SELECT tabla, registro_id, seq, updated_at, device_id, iv, payload
      FROM sync_registros
      WHERE docente_id = ? AND seq > ?
      ORDER BY seq ASC
      LIMIT ?
    `).all(docenteId, Number.isFinite(desde) ? desde : 0, limite)

    // El dispositivo puede pedir que no le devuelvan lo que él mismo subió
    const utiles = excluirDispositivo
      ? filas.filter(f => f.device_id !== excluirDispositivo)
      : filas

    const ultimoSeq = filas.length ? filas[filas.length - 1].seq : desde
    const e = estado(docenteId)

    return {
      registros: utiles,
      seq: ultimoSeq,
      hay_mas: filas.length === limite,
      seq_servidor: e.seq,
    }
  })

  // ── Borrado del buzón ──────────────────────────────────────────────────

  /** Vacía el buzón del servidor. Los datos locales de cada dispositivo no se tocan. */
  app.delete('/', async (req, reply) => {
    const docenteId = await docenteSSO(req, reply)
    if (!docenteId) return
    const r = db.prepare('DELETE FROM sync_registros WHERE docente_id = ?').run(docenteId)
    db.prepare("UPDATE sync_estado SET seq = 0, salt = NULL, verificador = NULL, actualizado = datetime('now') WHERE docente_id = ?")
      .run(docenteId)
    return { ok: true, borrados: r.changes }
  })
}
