/**
 * El paquete que viaja por AirDrop, y sobre todo: que el iPad lo deje elegir.
 *
 * El fallo que motiva esta suite: el paquete llegaba bien al iPad pero el
 * selector de archivos lo pintaba en gris y no había forma de abrirlo desde la
 * app. iPadOS no filtra por la extensión que se escriba en `accept`, sino por
 * el tipo declarado del fichero (UTType), y `.miclasesync` no lo declara
 * ninguna app del sistema: llegaba como tipo genérico y quedaba fuera del
 * filtro. Termina en `.json` para que iPadOS lo reconozca como `public.json`.
 */
import { EXTENSION, MIME } from '../frontend/src/db/transporteFichero'
import { leerPaquete } from '../frontend/src/db/sync'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

console.log('\n1. El nombre del fichero lo tiene que entender el sistema')
{
  ok(EXTENSION.endsWith('.json'),
    'la extensión termina en .json, o el iPad no deja seleccionarlo', EXTENSION)
  ok(EXTENSION.includes('miclasesync'),
    'y sigue distinguiéndose de cualquier otro JSON', EXTENSION)
  ok(MIME === 'application/json', 'el tipo declarado va a juego', MIME)

  const nombre = `miclase-2026-09-12${EXTENSION}`
  ok(/\.json$/.test(nombre), 'el fichero que se comparte acaba en .json', nombre)
}

console.log('\n2. Quien decide si un fichero vale es el contenido, no la extensión')
{
  // Es lo que permite quitar el filtro `accept` sin perder nada: un fichero
  // que no sea un paquete se rechaza igual, y con un mensaje que se entiende.
  const bueno = JSON.stringify({ formato: 'miclase-sync', version: 1, sobres: [] })
  ok(leerPaquete(bueno).formato === 'miclase-sync', 'un paquete válido se lee')

  for (const [texto, qué] of [
    ['esto no es json', 'un fichero que no es JSON'],
    ['{"formato":"otra-cosa"}', 'un JSON que no es un paquete'],
    ['{"formato":"miclase-sync","version":99,"sobres":[]}', 'un paquete de una versión más nueva'],
    ['{"formato":"miclase-sync","version":1}', 'un paquete sin sobres'],
  ]) {
    let msg = ''
    try { leerPaquete(texto); msg = 'no falló' } catch (e: any) { msg = e.message }
    ok(msg !== 'no falló', `${qué} se rechaza con un mensaje claro`, msg)
  }
}

console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ PAQUETE POR FICHERO CORRECTO')
process.exit(fallos ? 1 : 0)
