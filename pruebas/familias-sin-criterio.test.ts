/**
 * Familias con peso que no tienen columna en la unidad que se mira.
 *
 * El porcentaje del gestor no crea columnas: la programación manda. Luis
 * puso un 20 % a «Proba escrita» y la matriz siguió enseñando solo «Táboa
 * de indicadores». El aviso tiene que nombrar a la familia que falta y
 * callarse en los demás casos.
 */
import { columnasPorInstrumento, familiasSinCriterio } from '../frontend/src/components/MatrizInstrumentos'
import type { MatrizEvaluacion, CeldaInstrumento } from '../frontend/src/db/queries'
import type { Instrumento } from '../frontend/src/db/localDb'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

const ins = (id: number, nombre: string, peso: number, extra: Partial<Instrumento> = {}): Instrumento =>
  ({ id, asignatura_id: 1, nombre, tipo: 'observacion', peso, trimestres: '[1,2,3]', orden: id, ...extra } as Instrumento)

const celda = (i: Instrumento, familia: Instrumento | null = null): CeldaInstrumento => ({
  instrumento_id: i.id!, nombre: i.nombre, tipo: i.tipo, peso: i.peso,
  tiene_rubrica: false, tiene_prueba: false, vinculados: [], agregacion: 'media',
  familia_id: familia?.id ?? null, familia_nombre: familia?.nombre ?? null,
  familia_peso: familia ? familia.peso : i.peso, pct_familia: null, color: '#000',
})

const matriz = (instrumentos: Instrumento[], porCriterio: Record<string, CeldaInstrumento[]>): MatrizEvaluacion =>
  ({ instrumentos, porCriterio: new Map(Object.entries(porCriterio)), criteriosFueraDeTrimestre: new Set(),
     calificaciones: {}, evidencias: {}, diario: {}, criteriosDeUnidad: null } as unknown as MatrizEvaluacion)

const criterios = [{ id: 'CE1.1', descripcion: '' }, { id: 'CE1.2', descripcion: '' }]
const PE = ins(1, 'Proba escrita', 20, { tipo: 'prueba-escrita' })
const TI = ins(2, 'Táboa de indicadores', 80)

console.log('\n1. El caso de Luis: PE pesa 20 % y ningún criterio de la unidad la tiene')
{
  const m = matriz([PE, TI], { 'CE1.1': [celda(TI)], 'CE1.2': [celda(TI)] })
  const cols = columnasPorInstrumento(m, criterios)
  const falta = familiasSinCriterio(m, cols, 1)
  ok(cols.length === 1 && cols[0].ins.nombre === 'Táboa de indicadores', 'la matriz solo tiene la columna de TI')
  ok(falta.length === 1 && falta[0].nombre === 'Proba escrita' && falta[0].peso === 20, 'el aviso nombra a «Proba escrita» con su 20 %', JSON.stringify(falta))
}

console.log('\n2. Se calla cuando todas tienen columna')
{
  const m = matriz([PE, TI], { 'CE1.1': [celda(PE), celda(TI)], 'CE1.2': [celda(TI)] })
  ok(familiasSinCriterio(m, columnasPorInstrumento(m, criterios), 1).length === 0, 'nada que avisar')
}

console.log('\n3. Un hijo con columna cubre a su familia')
{
  const examen = ins(3, 'Examen UD1', 1, { familia_id: 1, tipo: 'prueba-escrita' })
  const m = matriz([PE, TI, examen], { 'CE1.1': [celda(examen, PE), celda(TI)], 'CE1.2': [celda(TI)] })
  const falta = familiasSinCriterio(m, columnasPorInstrumento(m, criterios), 1)
  ok(falta.length === 0, 'la familia PE está representada por su hijo', JSON.stringify(falta))
}

console.log('\n4. Los hijos no se avisan por su cuenta, y una familia fuera del trimestre tampoco')
{
  const examen = ins(3, 'Examen UD1', 1, { familia_id: 1, tipo: 'prueba-escrita' })
  const soloT2 = ins(4, 'Proxecto', 10, { trimestres: '[2]' })
  const m = matriz([PE, TI, examen, soloT2], { 'CE1.1': [celda(TI)], 'CE1.2': [celda(TI)] })
  const falta = familiasSinCriterio(m, columnasPorInstrumento(m, criterios), 1)
  ok(falta.map(f => f.nombre).join() === 'Proba escrita', 'solo la familia: ni el hijo ni la que no aplica en el 1º trimestre', falta.map(f => f.nombre).join())
  ok(familiasSinCriterio(m, columnasPorInstrumento(m, criterios), 2).map(f => f.nombre).join() === 'Proba escrita,Proxecto', 'en el 2º trimestre «Proxecto» sí cuenta')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos ? 1 : 0)
