# Pruebas de EDUmind MiClase

```bash
npm test              # todo (~3 min)
npm run test:rapido   # sin navegador (~4 s)
npm run test:prod     # contra https://miclase.edumind.es
```

`ejecutar.mjs` es quien orquesta: levanta el backend y el servidor de
desarrollo en **puertos libres**, espera a que respondan de verdad, lanza las
suites y lo mata todo al terminar.

## Reglas

- **Nunca contra la base de datos de producción.** El orquestador la copia a un
  directorio temporal y aborta si alguien apunta a la real.
- **Ningún puerto ni ruta cableados en las pruebas.** Los recibe por variables
  de entorno (`BASE`, `API`, `SYNC_API`, `BUNDLE`). Con puertos fijos, un
  proceso superviviente de la tanda anterior hacía que una prueba pasara contra
  código viejo. Pasó de verdad.
- **Playwright es dependencia del proyecto**, no se coge prestado de otro repo.
- Si algo falla, el temporal **no se borra**: dentro están las capturas.

## Qué cubre cada suite

| Suite | Qué comprueba | Necesita |
|---|---|---|
| `tipos` | `tsc` sobre todo el frontend | — |
| `calculo.test.ts` | notas ponderadas, trimestres, escala LOMLOE, media de unidades estancas | — |
| `migracion-unidades.test.ts` | qué unidad recibe una nota antigua sin ella (misma regla en migración, copia y sync) | — |
| `fusion.test.ts` | fusión a tres bandas, campo a campo | — |
| `transporte-directo.test.ts` | el protocolo y **el reloj** del enlace directo, con un canal de mentira | — |
| `lectorqr.test.mjs` | decodificación de QR | — |
| `paquete-fichero.test.ts` | el paquete de AirDrop: que el nombre lo entienda iPadOS y que el contenido sea quien valide | — |
| `taxonomias.test.ts` | la sugerencia de instrumentos: sobre todo, que se calle cuando el verbo no dice el nivel | — |
| `prueba-escrita.test.ts` | nota de un examen por tipo, reparto por criterios, importación y exportación | — |
| `informe-prueba.test.ts` | informe de una prueba corregida: aciertos por pregunta, ejes por aspecto o criterio, lectura heurística, radial SVG y documento | — |
| `medidas.test.ts` | medidas de atención a la diversidad: el refuerzo cambia pesos solo en sus trimestres, excluye instrumentos, los propios pesan 0 para el resto; la adaptación retira o sustituye criterios; sin medidas, el cálculo de siempre | — |
| `planificacion-semanal.test.ts` | lector del .md de la programación semanal (castellano y gallego): fechas, franjas con su título y su ■, detalle de un bloque en cada franja, secuencia, criterios del anclaje, notas del día; casado de área, unidad y criterio; el .md exportado se relee igual | — |
| `planificacion-ui.test.mjs` | volcar el .md en una clase con vista previa de lo que no casa, volcar otra vez sustituye sin duplicar, detalle, salto al Calificador en su unidad, borrar, mover y crear a mano, un evento, la vista de mes y exportar | backend + navegador |
| `medidas-ui.test.mjs` | refuerzo desde la ficha (NEAE encendido): sello en el calificador, casilla que no cuenta, «Todo el curso» distinto solo para ese alumno, explicación; con NEAE apagado ni sello ni editor, misma nota | backend + navegador |
| `proens.test.ts` | lectura de una programación de PROENS: unidades, trimestres, mínimos, instrumentos por celda combinada | — |
| `proens-api.test.mjs` | `/api/programacion/texto`: el PDF vuelve como texto con columnas; lo que no es PDF se rechaza | backend |
| `proens-ui.test.mjs` | importar el PDF gemelo desde el panel de programación: vista previa, aplicar, lo guardado en IndexedDB, repetir sin duplicar | backend + navegador |
| `empaquetado-nativo.test.mjs` | android/ios a la par de la versión de Capacitor, y `webDir` sin enlaces rotos | — |
| `rubrica-banco-ui.test.mjs` | el banco de rúbricas desde la interfaz | backend + web |
| `prueba-banco-ui.test.mjs` | el banco de pruebas: elegir, guardar, sobrevivir al borrado, y que las rúbricas no lo vean | backend + web |
| `prueba-escrita-ui.test.mjs` | definir, corregir, recalcular con fantasma, informe y mover un examen de unidad | backend + web |
| `enlace-directo.test.mjs` | emparejamiento WebRTC y troceado de 3 MB | navegador |
| `sync.test.mjs` | buzón del servidor: cuotas, fechas, rechazos | backend |
| `e2e.test.mjs` | recorrido por la interfaz | backend + web |
| `migracion.test.mjs` | subida de esquema Dexie v3→v7: puerta con copia previa, unidades asignadas a las notas antiguas | backend + web |
| `escaner-sin-detector.test.mjs` | el escáner sin `BarcodeDetector`, como en iPad | backend + web |
| `sync-dos-dispositivos.test.mjs` | sincronización por buzón entre dos aparatos | backend + web |
| `sync-directo.test.mjs` | sincronización **sin servidor**, con `/api/` cortado | backend + web |
| `emparejar-ui.test.mjs` | el emparejamiento desde la pantalla | backend + web |
| `emparejar-produccion.test.mjs` | el paquete compilado, con la CSP real | producción |

## Añadir una suite

1. Un `.test.mjs` en esta carpeta. Salir con código distinto de cero si falla.
2. Coger el navegador de `./lib/entorno.mjs`, nunca importarlo por ruta.
3. Leer las URLs de `process.env`, con un valor por defecto razonable.
4. Registrarla en `ejecutar.mjs`, en el bloque que le corresponda según lo que
   necesite montado.
