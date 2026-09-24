/**
 * La ruta que convierte un PDF de PROENS en texto con columnas.
 *
 * El servidor no interpreta nada: solo pasa el PDF por `pdftotext -layout`.
 * Lo que se comprueba aquí es que el texto conserva las columnas (sin
 * ellas el lector del navegador no puede separar criterio y mínimo), que un
 * fichero que no es PDF se rechaza con un mensaje claro y que un cuerpo con
 * otro tipo no cuela.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const API = process.env.API || 'http://127.0.0.1:3999'
const pdf = readFileSync(join(process.cwd(), 'pruebas/fixtures/proens_ccss6.pdf'))

let fallos = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FALLO'} ${msg}${extra ? ' — ' + extra : ''}`)
  if (!cond) fallos++
}

async function enviar(cuerpo, tipo = 'application/pdf') {
  const r = await fetch(`${API}/api/programacion/texto`, {
    method: 'POST', headers: { 'Content-Type': tipo }, body: cuerpo,
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

console.log('\n1. PDF de PROENS')
{
  const r = await enviar(pdf)
  ok(r.status === 200, 'responde 200', String(r.status))
  const texto = r.body.texto || ''
  ok(texto.length > 10000, 'devuelve el texto entero', `${texto.length} caracteres`)
  const linea = texto.split('\n').find(l => l.includes('CA2.1 - Identificar'))
  ok(!!linea, 'conserva los criterios')
  ok(!!linea && /\s{3,}Identificar certas/.test(linea), 'y las columnas: el mínimo va a la derecha del criterio, en la misma línea', linea?.slice(0, 110))
  ok(/Lenda: IA: Instrumento de Avaliación/.test(texto), 'con los acentos bien (UTF-8)')
}

console.log('\n2. Lo que no es un PDF')
{
  const r = await enviar(Buffer.from('esto no es un pdf'))
  ok(r.status === 400, 'un fichero cualquiera da 400', String(r.status))
  ok(/no es un PDF/i.test(r.body.error || ''), 'con un mensaje que lo dice', r.body.error)
}
{
  const r = await enviar('{}', 'application/json')
  ok(r.status === 400, 'un JSON da 400', String(r.status))
}
{
  const r = await enviar(Buffer.alloc(0))
  ok(r.status === 400, 'un cuerpo vacío da 400', String(r.status))
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto')
process.exit(fallos ? 1 : 0)
