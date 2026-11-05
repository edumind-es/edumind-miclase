/**
 * Las notas del iPad tienen que llegar a los dos Macs, y nada viejo las pisa.
 *
 * Luis cubrió las notas en el iPad, sincronizó por QR y por AirDrop, y el Mac
 * mini y el MacBook seguían con una copia antigua. Tres contextos de navegador
 * hacen de los tres aparatos, cada uno con su base de datos, y lo que se mira
 * al final es la nota que enseña la casilla (`getCalificacionUnica`).
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
  const ctx = await navegador.newContext()
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`))
  await p.goto(BASE, { waitUntil: 'domcontentloaded' })
  await p.evaluate(async () => {
    window.sync = await import('/src/db/sync.ts')
    window.queries = await import('/src/db/queries.ts')
    window.enlace = await import('/src/db/enlaceDirecto.ts')
  })
  return p
}

/** Pone una nota en una casilla, por donde pasan todas las notas de la app. */
const poner = (p, valor, criterio_id = 'CE1.1') => p.evaluate(async ([v, c]) => {
  await window.queries.saveCalificaciones([{
    alumno_id: 1, instrumento_id: 1, criterio_id: c, trimestre: 1, unidad_id: 1, valor: v,
    asignatura: 'Lingua galega', curso: '6', etapa: 'primaria', comunidad: 'Galicia',
  }], { sinVinculos: true })
  // Dos notas no comparten sello ni en una máquina rápida.
  await new Promise((r) => setTimeout(r, 5))
}, [valor, criterio_id])

const nota = (p, criterio_id = 'CE1.1') => p.evaluate(
  async (c) => (await window.queries.getCalificacionUnica(1, 1, c, 1, 1))?.valor ?? null, criterio_id)

const empaquetar = (p) => p.evaluate(async () => (await window.sync.empaquetarParaOtroDispositivo()).paquete)

const aplicar = (p, paquete) => p.evaluate(async ([pq, pass]) => {
  if (!(await window.sync.claveGuardada())) await window.sync.desbloquearPorPaquete(pass, pq)
  return window.sync.aplicarPaquete(pq)
}, [paquete, CONTRASENA])

/** QR de verdad: canal WebRTC entre los dos y los dos sincronizando a la vez. */
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

  console.log('\n1. Punto de partida: los tres tienen la misma nota')
  await poner(iPad, 5)
  const paqueteViejo = await empaquetar(iPad)
  await aplicar(mini, paqueteViejo)
  await aplicar(macbook, paqueteViejo)
  ok(await nota(mini) === 5 && await nota(macbook) === 5, 'el 5 está en los dos Macs')

  console.log('\n2. Un paquete del iPad para cada Mac, uno detrás de otro')
  // Dos notas: el cursor es inclusivo y siempre repetía la última, así que con
  // una sola el segundo Mac la recibía y el fallo no se veía.
  await poner(iPad, 2, 'CE4.1')
  await poner(iPad, 9)
  await aplicar(mini, await empaquetar(iPad))
  ok(await nota(mini) === 9, 'el Mac mini recibe el 9', await nota(mini))
  await aplicar(macbook, await empaquetar(iPad))
  ok(await nota(macbook) === 9, 'y el MacBook también, aunque ya se le mandó al otro', await nota(macbook))
  ok(await nota(macbook, 'CE4.1') === 2, 'con todas las notas, no solo la última', await nota(macbook, 'CE4.1'))

  console.log('\n3. Un paquete antiguo abierto después no pisa nada')
  const res = await aplicar(mini, paqueteViejo)
  ok(await nota(mini) === 9, 'el Mac mini sigue con el 9', await nota(mini))
  ok(res.aplicados === 0, 'y no cuenta nada como aplicado', res.aplicados)

  console.log('\n4. Lo que un Mac recibió se lo puede pasar al otro')
  await poner(iPad, 7)
  await aplicar(mini, await empaquetar(iPad))
  await aplicar(macbook, await empaquetar(mini))
  ok(await nota(macbook) === 7, 'el 7 del iPad llega al MacBook pasando por el Mac mini', await nota(macbook))

  console.log('\n5. Una fila retirada por duplicada no se traga la nota nueva')
  // Los dos califican la misma casilla sin saberlo. El Mac recibe la del iPad y,
  // como la suya es posterior, retira la del iPad; el iPad sigue calificando en ella.
  await poner(iPad, 4, 'CE2.1')
  const antes = await empaquetar(iPad)
  await poner(mini, 6, 'CE2.1')
  await aplicar(mini, antes)
  ok(await nota(mini, 'CE2.1') === 6, 'el Mac se queda con su nota, la más reciente', await nota(mini, 'CE2.1'))
  await poner(iPad, 10, 'CE2.1')
  await aplicar(mini, await empaquetar(iPad))
  ok(await nota(mini, 'CE2.1') === 10, 'la nota nueva del iPad se ve en el Mac', await nota(mini, 'CE2.1'))
  await aplicar(iPad, await empaquetar(mini))
  ok(await nota(iPad, 'CE2.1') === 10, 'y el iPad no la pierde al recibir lo del Mac', await nota(iPad, 'CE2.1'))

  console.log('\n6. Por QR, con un Mac atrasado: la nota nueva viaja y el iPad no retrocede')
  await poner(iPad, 8)
  // El Mac mini no sabe nada del 8 y además ha tocado otra casilla.
  await poner(mini, 3, 'CE3.1')
  const [deIpad, deMac] = await porQR(iPad, mini)
  ok(deIpad.errores.length === 0 && deMac.errores.length === 0, 'sin errores',
    [...deIpad.errores, ...deMac.errores].join(' | '))
  ok(await nota(mini) === 8, 'el Mac mini recibe el 8', await nota(mini))
  ok(await nota(iPad) === 8, 'el iPad sigue con el 8', await nota(iPad))
  ok(await nota(iPad, 'CE3.1') === 3, 'y recibe lo que puso el Mac', await nota(iPad, 'CE3.1'))

  console.log('\n7. Por QR con el otro Mac, justo después')
  const [, deMacbook] = await porQR(iPad, macbook)
  ok(await nota(macbook) === 8, 'el MacBook recibe el 8 aunque el iPad ya se lo pasó al mini', await nota(macbook))
  ok(await nota(macbook, 'CE2.1') === 10 && await nota(macbook, 'CE3.1') === 3, 'y todo lo demás', deMacbook.aplicados)
  ok(await nota(iPad) === 8, 'el iPad no retrocede', await nota(iPad))

  console.log('\n8. Sincronizar otra vez no cambia nada: no hay ida y vuelta sin fin')
  await porQR(iPad, mini)
  const [a, b] = await porQR(iPad, mini)
  ok(a.aplicados === 0 && b.aplicados === 0, 'una vez iguales, ninguno aplica nada', `${a.aplicados} y ${b.aplicados}`)
  ok(a.enviados > 0, 'aunque se envíe todo: lo que el otro ya tiene se descarta', a.enviados)
  for (const [nombre, p] of [['iPad', iPad], ['Mac mini', mini]]) {
    ok(await nota(p) === 8 && await nota(p, 'CE2.1') === 10 && await nota(p, 'CE3.1') === 3,
      `${nombre} conserva las tres notas`)
  }

  ok(errores.length === 0, 'sin errores de página', errores.join(' | '))
} catch (e) {
  console.log('  ✗ EXCEPCIÓN', e.message)
  fallos++
} finally {
  await navegador.close()
}

console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ LAS NOTAS LLEGAN A TODOS LOS APARATOS')
process.exit(fallos ? 1 : 0)
