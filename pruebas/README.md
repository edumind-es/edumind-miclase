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
| `calculo.test.ts` | notas ponderadas, trimestres, escala LOMLOE | — |
| `fusion.test.ts` | fusión a tres bandas, campo a campo | — |
| `lectorqr.test.mjs` | decodificación de QR | — |
| `enlace-directo.test.mjs` | emparejamiento WebRTC y troceado de 3 MB | navegador |
| `sync.test.mjs` | buzón del servidor: cuotas, fechas, rechazos | backend |
| `e2e.test.mjs` | recorrido por la interfaz | backend + web |
| `migracion.test.mjs` | subida de esquema Dexie v3→v5 | backend + web |
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
