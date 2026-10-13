/**
 * Plantillas de hijos dentro de una familia de instrumentos.
 *
 * Lo que más importa es que se callen: una destreza cuyas palabras no
 * aparecen en ningún criterio no debe llevarse criterios por simpatía.
 */
import {
  esLenguaExtranjera, plantillasParaArea, sugerirCriteriosParaHijo, criteriosSinCubrir, DESTREZAS, GENERALES,
} from '../frontend/src/ia/familiasPlantillas'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

console.log('\n1. Qué área es de idioma')
ok(esLenguaExtranjera('Lingua Estranxeira: Inglés') && esLenguaExtranjera('Primera Lengua Extranjera') && esLenguaExtranjera('Francés'), 'inglés, francés y «lingua estranxeira» lo son')
ok(!esLenguaExtranjera('Ciencias Sociales') && !esLenguaExtranjera('Lingua Galega e Literatura'), 'sociales y gallego no')
ok(plantillasParaArea('Inglés')[0].nombre === 'Listening' && plantillasParaArea('Matemáticas')[0].nombre === 'Examen', 'en idioma salen primero las destrezas; en el resto, el examen')

console.log('\n2. Reparto de criterios de inglés por destreza (enunciados reales de 6º)')
const ingles = [
  { id: 'CE1.1', descripcion: 'Reconocer e interpretar el sentido global y la información específica de textos orales y multimodales sencillos sobre temas frecuentes.' },
  { id: 'CE1.2', descripcion: 'Comprender textos escritos breves y sencillos, seleccionando las estrategias más adecuadas para la lectura.' },
  { id: 'CE2.1', descripcion: 'Expresar oralmente frases cortas con información básica sobre asuntos cotidianos, usando recursos verbales y no verbales.' },
  { id: 'CE2.2', descripcion: 'Redactar textos breves y sencillos, con adecuación a la situación comunicativa, a partir de modelos.' },
  { id: 'CE3.1', descripcion: 'Participar en situaciones de interacción cotidianas, mostrando empatía y respeto.' },
  { id: 'CE4.1', descripcion: 'Mediar en situaciones predecibles, usando estrategias sencillas para explicar conceptos.' },
]
const porNombre = (n: string) => DESTREZAS.find(d => d.nombre === n)!
ok(JSON.stringify(sugerirCriteriosParaHijo(porNombre('Listening'), ingles)) === '["CE1.1"]', 'Listening se queda con la comprensión de textos orales', sugerirCriteriosParaHijo(porNombre('Listening'), ingles).join(','))
ok(JSON.stringify(sugerirCriteriosParaHijo(porNombre('Reading'), ingles)) === '["CE1.2"]', 'Reading, con la comprensión de textos escritos y la lectura')
ok(JSON.stringify(sugerirCriteriosParaHijo(porNombre('Speaking'), ingles)) === '["CE2.1"]', 'Speaking, con la expresión oral', sugerirCriteriosParaHijo(porNombre('Speaking'), ingles).join(','))
ok(JSON.stringify(sugerirCriteriosParaHijo(porNombre('Writing'), ingles)) === '["CE2.2"]', 'Writing, con la redacción')
ok(JSON.stringify(sugerirCriteriosParaHijo(porNombre('Interacción y mediación'), ingles)) === '["CE3.1","CE4.1"]', 'interacción y mediación, con los suyos')
ok(criteriosSinCubrir(DESTREZAS, ingles).length === 0, 'entre las cinco destrezas no queda ningún criterio sin dueño')

console.log('\n3. Callarse cuando no sabe')
const sociales = [
  { id: 'CE1.1', descripcion: 'Utilizar recursos digitales de acuerdo con las necesidades del contexto educativo de forma segura.' },
  { id: 'CE2.3', descripcion: 'Analizar los procesos geográficos, históricos y culturales que han conformado la realidad.' },
]
ok(sugerirCriteriosParaHijo(porNombre('Speaking'), sociales).length === 0, 'Speaking no se lleva criterios de sociales')
ok(sugerirCriteriosParaHijo(GENERALES.find(g => g.nombre === 'Trabajo en equipo')!, sociales).length === 0, 'ni «trabajo en equipo» sin palabra que lo sostenga')
ok(sugerirCriteriosParaHijo(GENERALES.find(g => g.nombre === 'Cuaderno')!, sociales).length === 2, 'una plantilla sin claves se lleva todos los de la familia')
ok(JSON.stringify(criteriosSinCubrir([porNombre('Speaking')], sociales)) === '["CE1.1","CE2.3"]', 'y se dice qué queda sin cubrir')
ok(GENERALES.find(g => g.nombre === 'Examen')!.porUnidad === true, 'el examen va por unidad')

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos ? 1 : 0)
