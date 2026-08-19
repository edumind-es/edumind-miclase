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
2. **La base del navegador migra de la v3 a la v4** en cuanto cada docente
   abra la app: añade `criterio_instrumentos`, la tabla `meta` y sella
   `updated_at`/`deleted_at` en todo lo que ya había. Migración probada sin
   pérdida de datos (clases, alumnado, notas, observaciones, programación,
   evidencias con foto, asistencia y rúbricas). Aun así, conviene avisar de
   que descarguen una copia de seguridad antes de actualizar.
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
6. `jspdf` y `html2canvas` han dejado de usarse (los informes ahora se componen
   en HTML e imprime el navegador). Siguen en `package.json`; se pueden quitar
   en una limpieza posterior de dependencias.

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
```

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
