# Despliegue y actualización — EDUmind MiClase

Infraestructura real (verificada 2026-07-04):

- **nginx**: `/etc/nginx/sites-enabled/miclase.edumind.es.conf` — sirve `frontend/dist`
  con fallback SPA, cabeceras PWA (`sw.js` sin caché, `/assets/` immutable) y
  proxy `/api/` → `127.0.0.1:3270`. SSL Let's Encrypt + Cloudflare origin guard.
- **systemd**: `edumind-miclase-api.service` — backend Fastify con
  `NODE_ENV=production` y toda la configuración como variables de entorno del unit
  (tienen prioridad sobre `backend/.env`).
- **DB**: `backend/data/miclase.db` — solo currículo público + tabla `docentes` (auth).
  Los datos de aula viven en el navegador de cada docente (local-first).

## Secuencia de actualización y despliegue

```bash
cd /var/www/edumind_miclase

# 1. Traer los cambios a main (ejemplo: rama de trabajo de Claude)
git merge claude/fervent-lederberg-85adfe

# 2. Dependencias — solo si cambió algún package.json
(cd backend && npm install)
(cd frontend && npm install)

# 3. Currículo — solo si cambiaron los JSON de curriculum/ o el schema
npm run seed

# 4. Build del frontend (es lo que sirve nginx desde frontend/dist)
npm run build

# 5. Reiniciar el backend
sudo systemctl restart edumind-miclase-api

# 6. Verificar
curl -s https://miclase.edumind.es/api/health        # → {"status":"ok",...}
curl -s https://miclase.edumind.es/healthz            # → miclase ok
systemctl status edumind-miclase-api --no-pager | head -5
```

Notas:
- La PWA usa `registerType: autoUpdate`: los navegadores de los usuarios se
  actualizan solos al recargar tras el despliegue de un build nuevo.
- No hay remoto git: el "deploy" es merge local + build + restart.
- El backend valida al arrancar que `JWT_SECRET` exista y tenga ≥32 caracteres
  cuando `NODE_ENV=production`; si el servicio no arranca tras actualizar,
  revisar `journalctl -u edumind-miclase-api -n 20`.

## Novedades de la versión RTM (agosto 2026) — leer antes de desplegar

1. **El esquema SQLite cambia**: `schema.sql` añade `sync_registros` y
   `sync_estado` para el buzón de sincronización cifrada. Se crean solas al
   reiniciar el backend (`CREATE TABLE IF NOT EXISTS`), pero **el reinicio del
   paso 5 es obligatorio**, no opcional. Ninguna tabla existente se toca.
2. **La base del navegador migra de la v3 a la v5** en cuanto cada docente
   abra la app: añade `criterio_instrumentos`, `meta`, `sync_base` (la base de
   la fusión a tres bandas) y sella `updated_at`/`deleted_at` en todo lo que ya
   había. Migración probada sin pérdida de datos (clases, alumnado, notas,
   observaciones, programación, evidencias con foto, asistencia y rúbricas).
   Aun así, conviene avisar de que descarguen una copia de seguridad antes de
   actualizar.
3. **La sincronización exige sesión EDUmind.** En modo local (docente_id = 1)
   los endpoints `/api/sync/*` responden 403 con código `SIN_SSO`, para que
   todas las instalaciones locales no compartan el mismo buzón.
4. **Tamaño de los envíos de sincronización**: las evidencias fotográficas
   viajan cifradas en base64. Fastify acepta hasta 64 MB, pero el límite real
   lo pone nginx: `client_max_body_size 20m` en
   `/etc/nginx/sites-enabled/miclase.edumind.es.conf` (línea 25). El cliente
   cierra cada lote a los **12 MB** para quedar holgadamente por debajo, así
   que no hay que tocar nginx. Si algún día se sube ese margen en
   `frontend/src/db/sync.ts` (`LIMITE_ENVIO`), hay que subir nginx también.
5. **Tipografías nuevas** en `frontend/public/fonts/` (Outfit e IBM Plex Mono,
   OFL-1.1) para los informes en Sistema Lámina. Van al build automáticamente.
6. `jspdf` y `html2canvas` **retirados** del proyecto: los informes se componen
   en HTML y los imprime el navegador.
7. **El service worker cambia de política**: deja de cachear `/api/auth/` y
   `/api/sync` (una respuesta de sesión guardada daba sesiones fantasma) y
   cachea el currículo 120 días. Los navegadores se actualizan solos al
   recargar, pero si alguien ve comportamientos raros de sesión el primer día,
   basta con recargar dos veces.

## Pruebas antes de desplegar

No hay framework de tests: son scripts sueltos. Nunca contra la BD de producción.

```bash
cd /var/www/edumind_miclase
SCRATCH=/tmp/miclase-pruebas && mkdir -p $SCRATCH

# 1. Tipos
npx --prefix frontend tsc -b frontend

# 2. Motor de cálculo de notas (funciones puras)
npx --prefix frontend esbuild pruebas/calculo.test.ts --bundle --platform=node \
  --format=esm --outfile=$SCRATCH/calculo.mjs && node $SCRATCH/calculo.mjs

# 3. Backend de sincronización, en un puerto aparte y con una COPIA de la BD
cp backend/data/miclase.db $SCRATCH/test.db
PORT=3999 DB_PATH=$SCRATCH/test.db NODE_ENV=development \
  JWT_SECRET=clave_de_pruebas_de_al_menos_32_caracteres \
  node backend/src/index.js &
node pruebas/sync.test.mjs

# 4. Interfaz y migración v3→v4 (Playwright vive en /var/www/pasos_v2)
npm run dev:frontend &
node pruebas/e2e.test.mjs
node pruebas/migracion.test.mjs

# 5. Sincronización real entre dos dispositivos (vite contra el backend de prueba)
pkill -f "bin/vite"
VITE_API_TARGET=http://127.0.0.1:3999 npm run dev:frontend &
node pruebas/sync-dos-dispositivos.test.mjs
```

## Empaquetado nativo (iPad y Android)

La app web sigue siendo el producto principal. El contenedor nativo existe por
una razón concreta: **Safari purga IndexedDB tras unos días sin visitar el
sitio**, y ahí se va el trimestre. Dentro de la app instalada el almacenamiento
pertenece a la aplicación y el sistema no lo limpia por inactividad.

Los proyectos ya están generados y versionados, con los permisos declarados:

- `frontend/ios/App/App/Info.plist` — cámara, micrófono y fototeca, con los
  textos que lee el docente en el diálogo de iOS. **Sin estas claves iOS cierra
  la app** en cuanto se pide la cámara.
- `frontend/android/app/src/main/AndroidManifest.xml` — `CAMERA` y
  `RECORD_AUDIO`, declarados como características opcionales para no excluir
  dispositivos sin cámara en la tienda.

```bash
# Copia el build web dentro de los dos proyectos nativos
npm run nativo:sync

# Abre el proyecto (requiere el IDE correspondiente)
npm run nativo:ios       # necesita macOS con Xcode
npm run nativo:android   # necesita Android Studio
```

Para publicar hace falta lo que no se puede hacer desde este servidor: un Mac
con Xcode y cuenta de desarrollador de Apple (99 $/año) para iOS, y firmar el
bundle para Google Play. Hasta entonces, en Android y escritorio la PWA
instalable cubre el caso de uso, y el aviso de «proteger mis datos» de la
pantalla de Sincronizar pide al navegador almacenamiento persistente.

Ojo con la versión de Node: **Capacitor 7 es la última que funciona con Node 20**,
que es lo que hay en este servidor. Capacitor 8 exige Node ≥ 22; si algún día se
actualiza Node, se puede subir.

## Pendientes conocidos (archivos de sistema — cambiarlos a mano)

1. **Typo en el unit systemd**: la variable `JWT_SECRET` tiene el valor con el
   prefijo `JWT_SECRET=` duplicado. Funciona (es solo una cadena más larga),
   pero conviene corregirlo. Mejor aún: mover los secretos del unit a
   `EnvironmentFile=/var/www/edumind_miclase/backend/.env` con permisos 600,
   para que no sean legibles en `systemctl cat`.
   Tras editar: `sudo systemctl daemon-reload && sudo systemctl restart edumind-miclase-api`.
   (Cambiar el secreto invalida las sesiones activas de 7 días — impacto mínimo.)
2. **CSP y la IA local**: la cabecera `Content-Security-Policy` de nginx tiene
   `connect-src 'self'`, que bloquea la descarga del modelo WebLLM
   (Phi-3.5 se baja de huggingface.co / CDN). Si se quiere IA local en
   producción, añadir esos hosts a `connect-src` (y probablemente
   `'wasm-unsafe-eval'` a `script-src`). Mientras tanto, el botón
   "Copiar prompt" para IA externa funciona igualmente.
