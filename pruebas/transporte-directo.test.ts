/**
 * El transporte del enlace directo, con un canal de mentira.
 *
 * Sin navegador y sin WebRTC: aquí se prueba el protocolo y, sobre todo, **el
 * reloj**, que es lo que llevaba meses tumbando la suite `sync directa, sin
 * servidor` una de cada cuatro veces en el CI y nunca en local.
 *
 * El fallo, medido en su día con instrumentación: el anfitrión se atasca unos
 * cinco segundos cifrando el lote de salida, los latidos del invitado se le
 * quedan en la cola de eventos, y al entrar en `traer()` mira el reloj, ve que
 * hace cinco segundos que «no sabe» del otro y lo da por muerto. Estaba
 * midiendo su propio atasco como silencio ajeno.
 *
 * Por qué se prueba aquí y no en la suite con navegadores: allí hace falta que
 * la máquina vaya lo bastante mal como para atascarse más que la tolerancia, y
 * eso no se puede pedir. Con un canal de mentira el atasco se provoca a mano y
 * la prueba sale igual en cualquier máquina.
 */
import { transporteDirecto } from '../frontend/src/db/transporteDirecto'
import type { Enlace } from '../frontend/src/db/enlaceDirecto'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Canal de mentira: apunta lo que se envía y deja inyectar lo que llega. */
function canalFalso() {
  const enviados: any[] = []
  let recibir: ((m: any) => void) | null = null
  let cerrar: ((motivo: string) => void) | null = null
  const enlace: Enlace = {
    async enviar(m) { enviados.push(m) },
    alRecibir(cb) { recibir = cb },
    alCerrarse(cb) { cerrar = cb },
    cerrar() {},
  }
  return {
    enlace,
    enviados,
    /** Simula que llega un mensaje del otro aparato. */
    llega: (m: any) => recibir?.(m),
    corta: (motivo: string) => cerrar?.(motivo),
  }
}

const SIN_CONFIG = async () => ({ salt: null, verificador: null })

console.log('\n1. El atasco propio NO cuenta como silencio del otro')
{
  const c = canalFalso()
  const t = transporteDirecto(c.enlace, SIN_CONFIG, { espera: 400, latido: 50 })

  // El anfitrión se pasa un buen rato cifrando su lote: más que la tolerancia,
  // y sin atender el canal. Al salir del atasco, `traer()` no debe rendirse.
  await esperar(700)

  const promesa = t.traer(0, 200)
  // El invitado, que estaba vivo todo el rato, dice que ha terminado
  setTimeout(() => c.llega({ t: 'fin' }), 120)

  let fallo: string | null = null
  const r = await promesa.catch((e) => { fallo = e.message; return null })
  ok(fallo === null, 'tras un atasco más largo que la tolerancia, sigue escuchando', fallo || 'sin fallo')
  ok(r !== null && r.registros.length === 0 && r.hay_mas === false,
    'y termina en orden cuando el otro manda su fin')
}

console.log('\n2. Al otro que de verdad calla se le sigue dando por perdido')
{
  const c = canalFalso()
  const t = transporteDirecto(c.enlace, SIN_CONFIG, { espera: 300, latido: 50 })

  let fallo: string | null = null
  await t.traer(0, 200).catch((e) => { fallo = e.message })
  ok(fallo !== null && /dejó de responder/.test(fallo!),
    'sin una sola señal, abandona dentro de la tolerancia', fallo || 'no falló')
}

console.log('\n3. Mientras lleguen latidos, se espera lo que haga falta')
{
  const c = canalFalso()
  const t = transporteDirecto(c.enlace, SIN_CONFIG, { espera: 300, latido: 50 })

  // Latidos durante bastante más de la tolerancia, y solo al final el fin
  const reloj = setInterval(() => c.llega({ t: 'latido' }), 100)
  setTimeout(() => { clearInterval(reloj); c.llega({ t: 'fin' }) }, 1200)

  let fallo: string | null = null
  const r = await t.traer(0, 200).catch((e) => { fallo = e.message; return null })
  ok(fallo === null, 'cuatro veces la tolerancia esperando, y no abandona', fallo || 'sin fallo')
  ok(r !== null, 'y acaba entregando el turno')
}

console.log('\n4. Lo que llega se entrega, y el fin se anuncia una sola vez')
{
  const c = canalFalso()
  const t = transporteDirecto(c.enlace, SIN_CONFIG, { espera: 400, latido: 50 })

  c.llega({ t: 'sobres', id: '7', registros: [
    { tabla: 'alumnos', registro_id: '1', updated_at: 'a', iv: 'i', payload: 'p' },
    { tabla: 'alumnos', registro_id: '2', updated_at: 'b', iv: 'i', payload: 'p' },
  ] })
  const recibo = c.enviados.find((m) => m.t === 'recibo')
  ok(recibo?.id === '7' && recibo.aceptados.length === 2,
    'a un envío se le contesta con su recibo y el mismo identificador')

  const r1 = await t.traer(0, 1)
  ok(r1.registros.length === 1 && r1.hay_mas === true, 'se sirve por tandas y avisa de que queda más')
  c.llega({ t: 'fin' })
  const r2 = await t.traer(r1.seq, 200)
  ok(r2.registros.length === 1 && r2.hay_mas === false, 'y la última tanda cierra')
  ok(c.enviados.filter((m) => m.t === 'fin').length === 1,
    'el fin se manda una sola vez, no en cada tanda')
}

console.log('\n5. Un canal cortado con sobres sin recoger los entrega igual')
{
  const c = canalFalso()
  const t = transporteDirecto(c.enlace, SIN_CONFIG, { espera: 400, latido: 50 })
  c.llega({ t: 'sobres', id: '1', registros: [
    { tabla: 'grupos', registro_id: '9', updated_at: 'a', iv: 'i', payload: 'p' },
  ] })
  c.corta('el otro dispositivo cerró la conexión')

  const r = await t.traer(0, 200)
  ok(r.registros.length === 1, 'lo que ya estaba aquí no se pierde porque el canal se caiga')
}

console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ TRANSPORTE DIRECTO CORRECTO')
process.exit(fallos ? 1 : 0)
