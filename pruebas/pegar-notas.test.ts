/**
 * Leer una columna de notas pegada desde Excel. Lo que importa: que por orden
 * respete la lista, que por nombre no adivine, y que la escala 0-100 no cuele
 * como 0-10.
 */
import { interpretarPegado, leerNota } from '../frontend/src/utils/pegarNotas'

let fallos = 0
const ok = (cond: boolean, msg: string, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}
const clase = [
  { id: 1, apellidos: 'Abad Ríos', nombre: 'Ana' },
  { id: 2, apellidos: 'Bello Souto', nombre: 'Bruno' },
  { id: 3, apellidos: 'Casal Vidal', nombre: 'Carla' },
]

console.log('\n1. Notas sueltas')
ok(leerNota('7,5') === 7.5 && leerNota(' 8 ') === 8 && leerNota('10') === 10, 'coma o punto, con espacios')
ok(leerNota('') === null && leerNota('NP') === null && leerNota('—') === null, 'vacío, NP o raya es sin nota')

console.log('\n2. Una columna sola: por orden de lista')
{
  const r = interpretarPegado('7,5\n\n5\n9', clase)
  ok(!r.porNombre, 'no hay nombres: va por orden')
  ok(r.filas.length === 3 && r.filas[0].alumno?.id === 1 && r.filas[0].valor === 7.5, 'la primera para Abad')
  ok(r.filas[1].alumno?.id === 2 && r.filas[1].valor === 5 && r.filas[2].alumno?.id === 3 && r.filas[2].valor === 9, 'y las demás en orden (las líneas en blanco no cuentan)')
  ok(r.sinNota.length === 0, 'nadie se queda sin nota')
}
{
  const r = interpretarPegado('7\n8\n9\n10', clase)
  ok(r.filas[3].alumno === null && /Sobra/.test(r.filas[3].aviso ?? ''), 'una fila de más se señala, no se pierde en silencio')
}

console.log('\n3. Con nombre al lado: se casa por nombre, no por orden')
{
  const r = interpretarPegado('Alumno\tNota\nCasal Vidal, Carla\t6\nAbad Ríos, Ana\t9,5\nPérez Pérez, Pepe\t4\nBello Souto, Bruno\t', clase)
  ok(r.porNombre, 'detecta los nombres')
  const de = (id: number) => r.filas.find(f => f.alumno?.id === id)
  ok(de(3)?.valor === 6 && de(1)?.valor === 9.5, 'cada nota va a su alumno aunque el orden sea otro')
  ok(!r.filas.some(f => /^Alumno/.test(f.texto)), 'la cabecera «Alumno Nota» se descarta')
  const perez = r.filas.find(f => /Pérez/.test(f.texto))
  ok(perez?.alumno === null && /Ningún alumno/.test(perez?.aviso ?? ''), 'un nombre que no es de la clase se señala y no se asigna')
  ok(de(2)?.valor === null && /Sin nota/.test(de(2)?.aviso ?? ''), 'Bruno sin nota en la hoja se deja como está')
  ok(r.sinNota.length === 1 && r.sinNota[0].id === 2, 'y se cuenta entre los que no reciben nota')
}
{
  const r = interpretarPegado('ana abad rios;7\nBRUNO BELLO;8', clase)
  ok(r.filas[0].alumno?.id === 1 && r.filas[1].alumno?.id === 2, 'mayúsculas, acentos, orden nombre-apellido y punto y coma dan igual')
}

console.log('\n4. Escala 0-100')
{
  const r = interpretarPegado('75\n50\n100', clase)
  ok(r.escala100, 'hay valores por encima de 10: se toma como 0-100')
  ok(r.filas.map(f => f.valor).join(',') === '7.5,5,10', 'y se divide entre 10', r.filas.map(f => f.valor).join(','))
}
{
  const r = interpretarPegado('7\n12\n9', clase)
  ok(r.escala100 && r.filas[0].valor === 0.7, 'basta un valor por encima de 10 para que toda la columna sea 0-100 (y se ve en la vista previa)')
}

console.log(`\n${fallos === 0 ? '✅ TODO CORRECTO' : `❌ ${fallos} FALLO(S)`}\n`)
process.exit(fallos ? 1 : 0)
