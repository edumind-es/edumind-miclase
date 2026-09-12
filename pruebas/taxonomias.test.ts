/**
 * La sugerencia de instrumentos a partir del criterio.
 *
 * Lo que más se comprueba aquí no es que acierte, sino que **se calle cuando
 * no sabe**: el riesgo de esta función no es sugerir poco, es sugerir con
 * aplomo un nivel que el verbo no sostiene y que el docente se lo crea.
 *
 * Y en particular, que el DOK nunca salga del verbo: lo pone quien va a
 * evaluar, porque depende de la complejidad de lo que pida, no del enunciado.
 */
import { bloomDeCriterio, sugerirInstrumentos, BLOOM, DOK } from '../frontend/src/ia/taxonomias'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

console.log('\n1. El verbo da pista del nivel de Bloom')
{
  // Criterios reales del currículo cargado
  const a = bloomDeCriterio('Identificar las características de los seres vivos.')
  ok(a?.nivel === 'recordar', 'identificar → recordar', String(a?.nivel))

  const b = bloomDeCriterio('Analizar problemas del entorno próximo proponiendo soluciones.')
  ok(b?.nivel === 'analizar', 'analizar → analizar', String(b?.nivel))

  const c = bloomDeCriterio('Diseñar y construir un prototipo que resuelva un problema.')
  ok(c?.nivel === 'crear', 'diseñar → crear', String(c?.nivel))

  const d = bloomDeCriterio('Valorar la diversidad cultural del entorno.')
  ok(d?.nivel === 'evaluar', 'valorar → evaluar', String(d?.nivel))

  // Sin tildes ni mayúsculas de por medio
  const e = bloomDeCriterio('COMUNICAR de forma oral los resultados')
  ok(e?.nivel === 'crear', 'no le afectan mayúsculas ni acentos', String(e?.nivel))
}

console.log('\n2. Cuando el verbo NO dice el nivel, se calla')
{
  // Los cuatro más frecuentes del currículo que no significan nada por sí solos
  for (const [texto, verbo] of [
    ['Participar en experimentos guiados de manera individual o en equipo.', 'participar'],
    ['Seleccionar información de diferentes fuentes.', 'seleccionar'],
    ['Mostrar actitudes de respeto hacia los demás.', 'mostrar'],
    ['Utilizar recursos digitales de forma guiada.', 'utilizar'],
  ]) {
    const r = bloomDeCriterio(texto)
    ok(r?.nivel === null && r?.ambiguo === true,
      `«${verbo}» no se etiqueta a ciegas`, `nivel=${r?.nivel} ambiguo=${r?.ambiguo}`)
  }
}

console.log('\n3. Sin nivel y sin demanda declarada NO se sugiere nada')
{
  const s = sugerirInstrumentos('Participar en experimentos guiados.')
  ok(s.tipos.length === 0, 'no propone una lista al azar que se leería como consejo',
    s.tipos.join(', ') || 'ninguno')
  ok(s.motivo === 'ambiguo', 'y dice por qué', String(s.motivo))
}

console.log('\n4. El DOK lo pone el docente, y manda sobre el verbo')
{
  const texto = 'Identificar las características de los seres vivos.'

  const solo = sugerirInstrumentos(texto)
  ok(solo.bloom === 'recordar' && solo.tipos.includes('prueba-escrita'),
    'sin demanda declarada, sugiere desde la pista del verbo', solo.tipos.join(', '))

  // El MISMO criterio, pero el docente va a pedir una indagación larga
  const hondo = sugerirInstrumentos(texto, 4)
  ok(hondo.tipos.includes('portfolio') && !hondo.tipos.includes('prueba-escrita'),
    'declarando investigación, la sugerencia cambia entera', hondo.tipos.join(', '))
  ok(hondo.bloom === 'recordar',
    'y la pista del verbo se sigue enseñando, sin decidir por ella', String(hondo.bloom))
}

console.log('\n5. Un verbo cualquiera no revienta nada')
{
  const r = sugerirInstrumentos('Jugar al balón prisionero respetando las reglas.')
  ok(r.motivo === 'desconocido' && r.tipos.length === 0, 'verbo fuera de la tabla: sin sugerencia', String(r.motivo))
  const vacio = sugerirInstrumentos('')
  ok(vacio.tipos.length === 0 && vacio.verbo === null, 'y un criterio vacío tampoco', String(vacio.verbo))
}

console.log('\n6. Las escalas están completas')
{
  ok(BLOOM.length === 6, 'Bloom revisada tiene seis niveles', String(BLOOM.length))
  ok(DOK.length === 4 && DOK.every(d => !!d.pregunta),
    'DOK tiene cuatro y cada uno explica qué demanda describe', String(DOK.length))
}

console.log(fallos ? `\n❌ ${fallos} FALLO(S)` : '\n✅ SUGERENCIA DE INSTRUMENTOS CORRECTA')
process.exit(fallos ? 1 : 0)
