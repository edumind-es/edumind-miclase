/**
 * Parseo de la tabla markdown que devuelve la IA.
 *
 * El fallo que motiva esta suite: las celdas vacías se descartaban, así que un
 * descriptor en blanco corría el resto de la fila una columna a la izquierda y
 * el texto del nivel «Notable» acababa guardado como «Excelente». Invisible
 * hasta que se calificaba con ella.
 */
import { parsearRespuestaIA, rubricaToMarkdown } from '../frontend/src/ia/rubricaPrompt'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const CABECERA = '| Indicador | Excelente (4) | Notable (3) | Bien (2) | Insuficiente (1) |\n|---|---|---|---|---|'

console.log('\n1. Tabla completa')
{
  const r = parsearRespuestaIA(`# Rúbrica de juegos populares\n\n${CABECERA}\n| Explica las reglas | Con detalle | Casi completo | A medias | No las explica |`)
  ok(r !== null, 'parsea una tabla bien formada')
  ok(r?.titulo === 'Rúbrica de juegos populares', 'toma el título del encabezado #', r?.titulo)
  ok(r?.niveles.length === 4, 'reconoce los cuatro niveles', String(r?.niveles.length))
  ok(r?.niveles[0].valor === 4 && r?.niveles[3].valor === 1, 'con sus valores numéricos')
  ok(r?.indicadores[0].descriptores['Notable'] === 'Casi completo', 'cada descriptor en su nivel')
}

console.log('\n2. Celda vacía en medio — el fallo que teníamos')
{
  const r = parsearRespuestaIA(`${CABECERA}\n| Participa | Siempre |  | A veces | Nunca |`)
  ok(r !== null, 'la fila con un hueco no invalida la tabla')
  ok(r?.indicadores[0].descriptores['Notable'] === '', 'el hueco se queda en su nivel', JSON.stringify(r?.indicadores[0].descriptores['Notable']))
  ok(r?.indicadores[0].descriptores['Bien'] === 'A veces', 'y NO corre las columnas siguientes', r?.indicadores[0].descriptores['Bien'])
  ok(r?.indicadores[0].descriptores['Insuficiente'] === 'Nunca', 'hasta la última', r?.indicadores[0].descriptores['Insuficiente'])
}

console.log('\n3. Ruido alrededor de la tabla')
{
  const r = parsearRespuestaIA(`Claro, aquí tienes la rúbrica:\n\n${CABECERA}\n| Coopera | Anima al grupo | Colabora | Se deja llevar | Se aísla |\n\nEspero que te sirva.`)
  ok(r !== null, 'ignora el texto de cortesía antes y después')
  ok(r?.indicadores.length === 1, 'y no cuela la despedida como indicador', String(r?.indicadores.length))
}

console.log('\n4. Respuestas que no sirven')
{
  ok(parsearRespuestaIA('No he podido generar la rúbrica.') === null, 'sin tabla devuelve null')
  ok(parsearRespuestaIA(CABECERA) === null, 'cabecera sin ninguna fila devuelve null')
  ok(parsearRespuestaIA(`${CABECERA}\n|  | Siempre | Casi | A veces | Nunca |`) === null,
     'una fila sin nombre de indicador no cuenta como indicador')
}

console.log('\n5. Ida y vuelta: exportar y volver a leer')
{
  const original = parsearRespuestaIA(`${CABECERA}\n| Participa | Siempre |  | A veces | Nunca |`)!
  const r = parsearRespuestaIA(rubricaToMarkdown(original))
  ok(r !== null, 'el markdown que exportamos se vuelve a leer')
  ok(JSON.stringify(r?.indicadores) === JSON.stringify(original.indicadores),
     'sin perder ni mover ningún descriptor')
  ok(JSON.stringify(r?.niveles) === JSON.stringify(original.niveles), 'y conservando la escala')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
