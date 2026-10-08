/**
 * Copia automática en carpeta: el formato y la regla del aviso, sin navegador.
 *
 * Lo que hay que proteger: que los paquetes de la carpeta se apliquen en el
 * orden en que se escribieron (restaurar fuera de orden deja ganar a un
 * cambio viejo), que un fichero ajeno en la carpeta no se tome por paquete, y
 * que el aviso de «copia vieja» cuente el buzón solo si la sincronización
 * automática está activa.
 */
import {
  DIAS_AVISO, FICHERO_MANIFIESTO, diagnosticoCopia, diasDesde, esFicheroCopia, leerManifiesto,
  nombreFicheroCopia, nuevoManifiesto, ordenarFicherosCopia,
} from '../frontend/src/db/copiaFormato'
import { EXTENSION } from '../frontend/src/db/transporteFichero'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const DIA = 86_400_000
const ahora = Date.parse('2026-10-08T12:00:00.000Z')
const hace = (dias: number) => new Date(ahora - dias * DIA).toISOString()

console.log('\n1. El nombre del fichero ordena por fecha y lo reconoce el iPad')
{
  const a = nombreFicheroCopia('2026-10-08T09:05:00.000Z', 'ab12cd34-ef56')
  const b = nombreFicheroCopia('2026-10-08T16:12:00.000Z', 'ab12cd34-ef56')
  const c = nombreFicheroCopia('2026-11-01T00:00:00.000Z', 'zz99')
  ok(a.endsWith(EXTENSION), 'termina como el paquete de AirDrop: un fichero suelto se puede importar a mano', a)
  ok(esFicheroCopia(a) && esFicheroCopia(c), 'se reconoce como fichero de copia')
  ok(!esFicheroCopia(FICHERO_MANIFIESTO) && !esFicheroCopia('notas.txt') && !esFicheroCopia('copia-x.json'), 'el manifiesto y los ficheros ajenos no son paquetes')
  const orden = ordenarFicherosCopia([c, 'otro.txt', b, FICHERO_MANIFIESTO, a])
  ok(JSON.stringify(orden) === JSON.stringify([a, b, c]), 'se aplican por fecha de escritura, y solo los paquetes', orden.join(' '))
}

console.log('\n2. El manifiesto lleva lo que un aparato nuevo necesita para desbloquear')
{
  const m = nuevoManifiesto('dev-1', 'SAL', 'IV.VERIF', '2026-10-08T00:00:00.000Z')
  const leido = leerManifiesto(JSON.stringify(m))
  ok(leido.salt === 'SAL' && leido.verificador === 'IV.VERIF' && leido.device_id === 'dev-1', 'sal, verificador y aparato de origen')
  ok(leido.ultima === null && leido.ficheros === 0, 'empieza sin copias')
  for (const [texto, que] of [['{}', 'un JSON cualquiera'], ['no json', 'un fichero que no es JSON'], [JSON.stringify({ formato: 'miclase-copia', version: 9 }), 'una versión más nueva']]) {
    let mensaje = ''
    try { leerManifiesto(texto) } catch (e) { mensaje = (e as Error).message }
    ok(mensaje.length > 0, `${que} se rechaza con explicación`, mensaje)
  }
}

console.log('\n3. Días desde la última copia')
{
  ok(diasDesde(null, ahora) === null, 'nunca → null')
  ok(diasDesde(hace(0.5), ahora) === 0, 'hoy → 0')
  ok(diasDesde(hace(7.9), ahora) === 7, 'días enteros, sin redondear hacia arriba')
  ok(diasDesde('basura', ahora) === null, 'una fecha ilegible no cuenta')
}

console.log('\n4. Cuándo avisar')
{
  const base = { ultimaCopia: null, ultimaSync: null, autoSync: false, primerUso: hace(30) }
  ok(diagnosticoCopia(base, ahora).nivel === 'nunca', 'sin ninguna copia y con uso → «nunca»')
  ok(diagnosticoCopia({ ...base, primerUso: hace(2) }, ahora).nivel === 'reciente', 'los primeros días no se avisa')
  ok(diagnosticoCopia({ ...base, ultimaCopia: hace(1) }, ahora).nivel === 'ok', 'copia en carpeta de ayer → bien')
  const vieja = diagnosticoCopia({ ...base, ultimaCopia: hace(DIAS_AVISO) }, ahora)
  ok(vieja.nivel === 'aviso' && vieja.dias === DIAS_AVISO, `a los ${DIAS_AVISO} días se avisa`, vieja.texto)
  ok(diagnosticoCopia({ ...base, ultimaSync: hace(1), autoSync: false }, ahora).nivel === 'nunca', 'una sincronización suelta no es copia automática')
  const buzon = diagnosticoCopia({ ...base, ultimaSync: hace(1), autoSync: true }, ahora)
  ok(buzon.nivel === 'ok' && buzon.via === 'buzon', 'con la sincronización automática activa, el buzón cuenta como copia', buzon.texto)
  const mejor = diagnosticoCopia({ ...base, ultimaCopia: hace(10), ultimaSync: hace(1), autoSync: true }, ahora)
  ok(mejor.via === 'buzon' && mejor.nivel === 'ok', 'manda la más reciente de las dos')
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
