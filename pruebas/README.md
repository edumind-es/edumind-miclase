# Pruebas de EDUmind MiClase

No hay framework de tests instalado: son scripts sueltos que se lanzan a mano y
salen con código 0 si todo va bien. Están pensados para pasarlos **antes de cada
despliegue**.

| Fichero | Qué comprueba | Necesita |
|---|---|---|
| `calculo.test.ts` | Motor de notas: ponderación por instrumento, por criterio y por trimestre; escala LOMLOE; conversión de rúbricas | nada |
| `fusion.test.ts` | Fusión a tres bandas: qué se conserva cuando dos dispositivos tocan el mismo registro | nada |
| `sync.test.mjs` | Buzón de sincronización: configuración, empuje, descarga, last-write-wins, aislamiento entre docentes | backend en `:3999` con una **copia** de la BD |
| `e2e.test.mjs` | Flujo completo en navegador: clase → alumnado → áreas → programación → instrumento por criterio → matriz → informe lámina → backup | `npm run dev:frontend` |
| `migracion.test.mjs` | Que una base v3 de un curso real migre a v4 sin perder nada | `npm run dev:frontend` |
| `sync-dos-dispositivos.test.mjs` | Cifrado, descifrado y fusión **en el navegador**: dos dispositivos que se sincronizan, el servidor sin poder leer nada, y el last-write-wins | backend de prueba + vite con `VITE_API_TARGET` |

`migracion.test.mjs` se crea y se borra solo la página de siembra que necesita
(`frontend/public/__sembrar-v3.html` y una copia de Dexie). No hay que hacer
nada a mano; si alguna vez se interrumpe a lo bruto, comprueba que no quedan
ficheros `__*` en `frontend/public/` antes de compilar.

## Cómo lanzarlos

```bash
cd /var/www/edumind_miclase
export SCRATCH=/tmp/miclase-pruebas && mkdir -p $SCRATCH

# Tipos
npx --prefix frontend tsc -b frontend

# Funciones puras: motor de cálculo y fusión
for t in calculo fusion; do
  npx --prefix frontend esbuild pruebas/$t.test.ts --bundle --platform=node \
    --format=esm --outfile=$SCRATCH/$t.mjs && node $SCRATCH/$t.mjs
done

# Sincronización (NUNCA contra la BD de producción)
cp backend/data/miclase.db $SCRATCH/test.db
PORT=3999 DB_PATH=$SCRATCH/test.db NODE_ENV=development \
  JWT_SECRET=clave_de_pruebas_de_al_menos_32_caracteres \
  node backend/src/index.js & sleep 2
node pruebas/sync.test.mjs

# Navegador (Playwright vive en /var/www/pasos_v2)
npm run dev:frontend & sleep 3
node pruebas/e2e.test.mjs
node pruebas/migracion.test.mjs

# Sincronización entre dos dispositivos: vite debe apuntar al backend de prueba
pkill -f "bin/vite"
VITE_API_TARGET=http://127.0.0.1:3999 npm run dev:frontend & sleep 3
sqlite3 $SCRATCH/test.db "INSERT OR IGNORE INTO docentes (id, nombre, email) \
  VALUES (2, 'Docente de prueba', 'authentik-sub-de-prueba')"
node pruebas/sync-dos-dispositivos.test.mjs
```

El backend de prueba debe arrancarse para esa última con
`JWT_SECRET=clave_de_pruebas_de_al_menos_32_caracteres`, que es la que el
script usa para firmar la sesión.

Las capturas de pantalla quedan en `$SCRATCH/tiros/`.
