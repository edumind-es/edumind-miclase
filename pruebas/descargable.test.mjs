/**
 * La versión descargable: que la página, los lanzadores y el guion digan lo mismo.
 *
 * «Instalar MiClase» promete un .zip en GitHub con un lanzador de doble clic.
 * Son cuatro piezas escritas en sitios distintos (la página, sus textos en dos
 * idiomas, `distribucion/` y `scripts/empaquetar_descargable.sh`) y basta con
 * que una cambie sola para que la página mande a un fichero que no existe.
 * Esta prueba falla si:
 *
 *  · la página o el LEEME nombran un lanzador que no está en `distribucion/`;
 *  · el .zip que enlaza la página no se llama como el que escribe el guion;
 *  · el puerto no es el mismo en los lanzadores, los textos y el LEEME (los
 *    datos van con la dirección: otro puerto es una app vacía);
 *  · el guion deja de publicar con el número de versión de la app.
 *
 * Que el enlace responda en GitHub no se mira aquí (necesita red): lo mira
 * `./scripts/empaquetar_descargable.sh --comprobar`, dentro de `npm run test:prod`
 * y al final de `desplegar.sh`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ } from './lib/entorno.mjs'

let fallos = 0
const ok = (c, m, extra = '') => { console.log(`${c ? '  ✓' : '  ✗ FALLO'} ${m}${extra ? ' — ' + extra : ''}`); if (!c) fallos++ }
const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8')

const textos = leer('frontend/src/i18n/textos.ts')
const pagina = leer('frontend/src/pages/Instalar/InstalarPage.tsx')
const guion = leer('scripts/empaquetar_descargable.sh')
const leeme = leer('distribucion/LEEME.txt')

/** Lo que va entre comillas angulares y tiene pinta de fichero: «abrir-miclase.sh». */
const ficherosNombrados = (texto) => [...texto.matchAll(/«([^»]+\.(?:bat|command|sh|ps1|py|yml|txt))»/g)].map((m) => m[1])

console.log('\nLos lanzadores que se nombran existen')
const pasos = [...textos.matchAll(/'instalar\.[bc]\.[a-zA-Z0-9]+': '([^\n]*)',?\n/g)].map((m) => m[1]).join('\n')
const nombrados = new Set([...ficherosNombrados(pasos), ...ficherosNombrados(leeme)])
ok(nombrados.size >= 3, 'la página y el LEEME nombran los lanzadores', [...nombrados].join(' · '))
for (const f of nombrados) ok(existsSync(join(RAIZ, 'distribucion', f)), `distribucion/${f}`)
// El docker-compose se nombra sin comillas angulares en la opción del centro
ok(/docker-compose\.yml/.test(pasos) && existsSync(join(RAIZ, 'distribucion/docker-compose.yml')),
  'el docker-compose.yml de la opción del centro va en el paquete')

console.log('\nUn solo nombre para el .zip')
const enPagina = pagina.match(/releases\/latest\/download\/([\w.-]+)/)?.[1]
const enGuion = guion.match(/^FICHERO="([^"]+)"/m)?.[1]
ok(!!enPagina && enPagina === enGuion, 'la página enlaza el fichero que escribe el guion', `${enPagina} / ${enGuion}`)
const repoPagina = pagina.match(/github\.com\/([\w.-]+\/[\w.-]+)'/)?.[1]
const repoGuion = guion.match(/^REPO="([^"]+)"/m)?.[1]
ok(!!repoPagina && repoPagina === repoGuion, 'y en el mismo repositorio', `${repoPagina} / ${repoGuion}`)

console.log('\nUn solo puerto')
const PUERTO = '8765'
ok(new RegExp(`MICLASE_PUERTO", "${PUERTO}"`).test(leer('distribucion/servidor.py')), `servidor.py sirve en ${PUERTO}`)
ok(new RegExp(`\\$Puerto = ${PUERTO}\\b`).test(leer('distribucion/servidor.ps1')), `servidor.ps1 sirve en ${PUERTO}`)
const puertosDichos = new Set([...`${pasos}\n${leeme}`.matchAll(/localhost:(\d+)/g)].map((m) => m[1]))
ok(puertosDichos.size === 1 && puertosDichos.has(PUERTO), 'la página y el LEEME dicen ese puerto', [...puertosDichos].join(' · '))

console.log('\nLa descargable lleva el número de la app')
ok(/^NUMERO=.*package\.json/m.test(guion) && /^ETIQUETA="v\$NUMERO"/m.test(guion),
  'el guion publica sobre la etiqueta vX.Y.Z de package.json')
ok(/--verify-tag/.test(guion), 'y no crea etiquetas por su cuenta (las pone desplegar.sh)')

if (fallos) { console.log(`\n✗ ${fallos} fallo(s)`); process.exit(1) }
console.log('\n✓ Versión descargable: la página, los lanzadores y el guion coinciden')
