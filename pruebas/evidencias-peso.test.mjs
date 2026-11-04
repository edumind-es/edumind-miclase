/**
 * Las fotos y los vídeos no pueden tumbar la sincronización ni las copias.
 *
 * El iPad de Luis ocupa 812 MB, casi todo evidencias. Enviarlas siempre enteras
 * habría agotado la memoria al montar el paquete, así que las notas viajan
 * enteras y las evidencias solo cuando hacen falta. Lo que se mide aquí es lo
 * que viaja de verdad, no los mensajes de pantalla.
 */
import { navegadorChromium } from './lib/entorno.mjs'

const chromium = await navegadorChromium()
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const CONTRASENA = 'melocoton-bicicleta-42'

let fallos = 0
const ok = (c, m, extra = '') => {
  console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra !== '' ? ' — ' + extra : ''}`)
  if (!c) fallos++
}

const navegador = await chromium.launch()
const errores = []

async function aparato(nombre) {
  const ctx = await navegador.newContext({ viewport: { width: 1100, height: 1000 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`))
  await p.goto(BASE, { waitUntil: 'domcontentloaded' })
  await p.evaluate(async () => {
    window.sync = await import('/src/db/sync.ts')
    window.queries = await import('/src/db/queries.ts')
    window.enlace = await import('/src/db/enlaceDirecto.ts')
    window.copia = await import('/src/db/copia.ts')
    window.localDb = await import('/src/db/localDb.ts')
  })
  return p
}

const ponerNota = (p, valor, criterio_id = 'CE1.1') => p.evaluate(async ([v, c]) => {
  await window.queries.saveCalificaciones([{
    alumno_id: 1, instrumento_id: 1, criterio_id: c, trimestre: 1, unidad_id: 1, valor: v,
    asignatura: 'Lingua galega', curso: '6', etapa: 'primaria', comunidad: 'Galicia',
  }], { sinVinculos: true })
  await new Promise((r) => setTimeout(r, 5))
}, [valor, criterio_id])

const nota = (p, criterio_id = 'CE1.1') => p.evaluate(
  async (c) => (await window.queries.getCalificacionUnica(1, 1, c, 1, 1))?.valor ?? null, criterio_id)

/** Una evidencia con contenido de verdad. Devuelve su id. */
const evidencia = (p, kb = 200, tipo = 'video') => p.evaluate(async ([k, t]) => {
  const id = await window.queries.crearEvidencia({
    alumno_id: 1, tipo: t, mime: t === 'video' ? 'video/mp4' : 'image/jpeg',
    blob: new Blob([new Uint8Array(k * 1024)], { type: t === 'video' ? 'video/mp4' : 'image/jpeg' }),
  })
  await new Promise((r) => setTimeout(r, 5))
  return id
}, [kb, tipo])

const empaquetar = (p, opciones = {}) => p.evaluate(
  async (o) => (await window.sync.empaquetarParaOtroDispositivo(o)).paquete, opciones)

const aplicar = (p, paquete) => p.evaluate(async ([pq, pass]) => {
  if (!(await window.sync.claveGuardada())) await window.sync.desbloquearPorPaquete(pass, pq)
  return window.sync.aplicarPaquete(pq)
}, [paquete, CONTRASENA])

const deTabla = (paquete, tabla) => paquete.sobres.filter((s) => s.tabla === tabla)

const evidenciasDe = (p) => p.evaluate(async () => (await window.localDb.db.evidencias.toArray())
  .map((e) => ({ id: e.id, bytes: e.blob?.size ?? -1, borrada: !!e.deleted_at })))

async function porQR(A, B) {
  const oferta = await A.evaluate(async () => {
    window.anfitrion = await window.enlace.invitar()
    return window.anfitrion.codigo
  })
  const respuesta = await B.evaluate(async (cod) => {
    const invitado = await window.enlace.aceptarInvitacion(cod)
    window.canal = invitado.enlace
    return invitado.codigo
  }, oferta)
  await A.evaluate(async (cod) => {
    window.canal = await window.anfitrion.aceptarRespuesta(cod)
    window.sync.atenderEnlace(window.canal)
  }, respuesta)
  await B.evaluate(async () => {
    window.canal = await window.canal
    window.sync.atenderEnlace(window.canal)
  })
  const corre = (p) => p.evaluate(async () => {
    const r = await window.sync.sincronizarPorEnlace(window.canal)
    await window.sync.cerrarEnlace(window.canal)
    return r
  })
  return Promise.all([corre(A), corre(B)])
}

try {
  const iPad = await aparato('iPad'), mini = await aparato('Mac mini'), macbook = await aparato('MacBook')
  await iPad.evaluate((pass) => window.sync.estrenarSincronizacionLocal(pass), CONTRASENA)

  console.log('\n1. Paquete: las notas siempre enteras; las evidencias, solo las nuevas')
  await ponerNota(iPad, 6)
  await ponerNota(iPad, 7, 'CE2.1')
  const primera = await evidencia(iPad)
  const p1 = await empaquetar(iPad)
  ok(deTabla(p1, 'calificaciones').length === 2 && deTabla(p1, 'evidencias').length === 1, 'el primero lo lleva todo')
  await aplicar(mini, p1)
  const p2 = await empaquetar(iPad)
  ok(deTabla(p2, 'calificaciones').length === 2, 'el segundo vuelve a llevar todas las notas')
  ok(deTabla(p2, 'evidencias').length <= 1, 'y no repite las evidencias (como mucho, la del límite)', deTabla(p2, 'evidencias').length)
  const segunda = await evidencia(iPad)
  const p3 = await empaquetar(iPad)
  ok(deTabla(p3, 'evidencias').some((s) => s.registro_id === String(segunda)), 'una evidencia nueva sí va')
  const todas = await empaquetar(iPad, { todasLasEvidencias: true })
  ok(deTabla(todas, 'evidencias').length === 2, 'a petición, salen todas', deTabla(todas, 'evidencias').length)

  console.log('\n2. Cancelar la hoja de compartir no pierde evidencias')
  const tercera = await evidencia(iPad)
  await iPad.evaluate(async () => { await (await window.sync.empaquetarParaOtroDispositivo()).deshacer() })
  const p4 = await empaquetar(iPad)
  ok(deTabla(p4, 'evidencias').some((s) => s.registro_id === String(tercera)), 'el intento siguiente vuelve a llevarla')
  // Se repite la última ya enviada (el cursor es inclusivo), pero no las anteriores.
  ok(!deTabla(p4, 'evidencias').some((s) => s.registro_id === String(primera)), 'y no arrastra las ya enviadas antes')

  console.log('\n3. QR: cada aparato manda solo las evidencias que le faltan al otro')
  await aplicar(mini, todas)
  await aplicar(mini, p4)
  const [a, b] = await porQR(iPad, mini)
  ok(a.errores.length === 0 && b.errores.length === 0, 'sin errores', [...a.errores, ...b.errores].join(' | '))
  await macbook.evaluate(async ([pq, pass]) => window.sync.desbloquearPorPaquete(pass, pq), [p1, CONTRASENA])
  const [, c] = await porQR(iPad, macbook)
  const enMacbook = await evidenciasDe(macbook)
  ok(enMacbook.filter((e) => !e.borrada && e.bytes > 0).length === 3, 'el MacBook recibe las tres, y el Mac mini ya las tenía', `${c.recibidos} recibidos`)
  const nuevaEnMini = await evidencia(mini, 50, 'foto')
  const [deIpad, deMini] = await porQR(iPad, mini)
  const notasYDatos = (await iPad.evaluate(() => window.localDb.db.calificaciones.count()))
  ok(deMini.enviados - deIpad.enviados === 1, 'el Mac mini manda una evidencia más que el iPad: la suya, la nueva',
    `${deMini.enviados} y ${deIpad.enviados} con ${notasYDatos} notas`)
  ok((await evidenciasDe(iPad)).some((e) => e.id === nuevaEnMini && e.bytes > 0), 'y le llega al iPad con su contenido')

  console.log('\n4. Borrar una evidencia libera su espacio, también en los demás')
  await iPad.evaluate((id) => window.queries.eliminarEvidencia(id), primera)
  const borrada = (await evidenciasDe(iPad)).find((e) => e.id === primera)
  ok(borrada.borrada && borrada.bytes === 0, 'en el aparato donde se borra, ya no ocupa', borrada.bytes)
  const conBorrado = await empaquetar(iPad)
  const sobre = deTabla(conBorrado, 'evidencias').find((s) => s.registro_id === String(primera))
  ok(sobre && sobre.payload.length < 5000, 'viaja solo el aviso, sin el vídeo', sobre?.payload.length)
  await aplicar(mini, conBorrado)
  const enMini = (await evidenciasDe(mini)).find((e) => e.id === primera)
  ok(enMini.borrada && enMini.bytes === 0, 'y el Mac que la recibe también la vacía', enMini.bytes)

  console.log('\n5. Lo borrado antes de este arreglo se puede liberar')
  const vieja = await evidencia(iPad, 300)
  await iPad.evaluate(async (id) => {
    // Como quedaban antes: marcada como borrada y con el contenido dentro.
    const t = new Date().toISOString()
    await window.localDb.db.evidencias.update(id, { deleted_at: t, updated_at: t })
  }, vieja)
  const sello = await iPad.evaluate(async (id) => (await window.localDb.db.evidencias.get(id)).updated_at, vieja)
  ok((await iPad.evaluate(() => window.queries.getResumenEvidencias())).borradas.bytes === 300 * 1024, 'el desglose las cuenta aparte')
  const liberados = await iPad.evaluate(() => window.queries.liberarEvidenciasBorradas())
  ok(liberados === 300 * 1024, 'se liberan sus bytes', liberados)
  ok(await iPad.evaluate(async (id) => (await window.localDb.db.evidencias.get(id)).updated_at, vieja) === sello, 'sin tocar su fecha: nada que sincronizar')

  console.log('\n6. La copia ligera no se lleva ni se carga las evidencias')
  const ligera = await iPad.evaluate(() => window.queries.exportarDatos(undefined, { sinEvidencias: true }))
  const datos = JSON.parse(ligera)
  ok(await iPad.evaluate((json) => window.queries.esCopiaSinEvidencias(json), ligera), 'se reconoce sin leer el fichero entero')
  ok(!(await iPad.evaluate(async () => window.queries.esCopiaSinEvidencias(await window.queries.exportarDatos()))), 'y una completa no pasa por ligera')
  ok(datos.evidencias.length === 0 && datos.calificaciones.length >= 2, 'lleva las notas y ninguna evidencia')
  const vivasAntes = (await evidenciasDe(iPad)).filter((e) => !e.borrada).length
  await ponerNota(iPad, 1)
  await iPad.evaluate((json) => window.queries.importarDatos(json), ligera)
  ok(await nota(iPad) === 6, 'al restaurarla, las notas vuelven a las de la copia', await nota(iPad))
  ok((await evidenciasDe(iPad)).filter((e) => !e.borrada && e.bytes > 0).length === vivasAntes, 'y las evidencias del aparato siguen ahí')
  const completa = JSON.parse(await iPad.evaluate(() => window.queries.exportarDatos()))
  ok(completa.evidencias.length > 0 && !completa.sin_evidencias, 'la copia completa sí las lleva')

  console.log('\n7. Lo recibido entra en la copia en carpeta del Mac')
  const carpeta = () => {
    const ficheros = new Map()
    window.carpeta = {
      ficheros, tipo: 'carpeta', nombre: 'prueba',
      async escribir(n, t) { ficheros.set(n, t) },
      async leer(n) { return ficheros.get(n) ?? null },
      async listar() { return [...ficheros.keys()] },
    }
  }
  await macbook.evaluate(carpeta)
  await ponerNota(iPad, 9, 'CE3.1')               // nota anterior a la copia del Mac…
  const paquete = await empaquetar(iPad)
  await macbook.waitForTimeout(20)
  await macbook.evaluate(() => window.copia.hacerCopia(window.carpeta))
  await aplicar(macbook, paquete)                 // …y que llega después
  const r = await macbook.evaluate(() => window.copia.hacerCopia(window.carpeta))
  ok(r.resultado.enviados > 0 && r.sobres > 0, 'la copia siguiente la incluye', `${r.sobres} registros`)
  const repetida = await macbook.evaluate(() => window.copia.hacerCopia(window.carpeta))
  ok(repetida.sobres === 0, 'y la de después ya no vuelve a escribir nada', repetida.sobres)

  console.log('\n8. La pantalla dice qué ocupa cada cosa, y el aviso cuenta las copias a mano')
  await iPad.evaluate(() => {
    const d = { neae: false, evidencias: true }
    localStorage.setItem('miclase.sensibles', JSON.stringify(d))
    window.dispatchEvent(new CustomEvent('miclase:sensibles', { detail: d }))
  })
  await iPad.goto(`${BASE}/sincronizar`, { waitUntil: 'domcontentloaded' })
  await iPad.locator('[data-almacen-desglose]').waitFor({ timeout: 15000 })
  ok(/vídeos? · /.test(await iPad.locator('[data-almacen-tipo="video"]').textContent()), 'el desglose enseña los vídeos y lo que pesan')
  ok(await iPad.locator('[data-paquete-todas]').isVisible(), 'y el paquete ofrece enviar todas las evidencias')
  await iPad.evaluate(async () => {
    window.copia = await import('/src/db/copia.ts')
    await window.copia.registrarCopiaEnFichero()
  })
  const diag = await iPad.evaluate(() => window.copia.diagnostico())
  ok(diag.via === 'fichero' && diag.nivel === 'ok', 'una copia a mano cuenta', diag.texto)

  ok(errores.length === 0, 'sin errores de página', errores.join(' | '))
} catch (e) {
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ LAS EVIDENCIAS NO ESTORBAN')
process.exit(fallos ? 1 : 0)
