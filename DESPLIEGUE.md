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

Los iconos y la pantalla de arranque se generan desde una sola definición:

```bash
python3 scripts/generar_iconos.py   # web, iOS y Android de una vez
npm run nativo:sync                 # build + copia a los proyectos nativos
```

Ojo con la versión de Node: **Capacitor 7 es la última que funciona con Node 20**,
que es lo que hay en este servidor. Capacitor 8 exige Node ≥ 22; si algún día se
actualiza Node, se puede subir.

### Compilar en el Mac, paso a paso

En este servidor no hay Xcode ni CocoaPods, así que el proyecto se prepara aquí
y se compila allí. Lo que sigue está pensado para hacerse de una sentada.

**1. Llevarse el código.** No hay remoto git, pero se puede clonar por SSH
directamente desde el servidor, y así se conserva el historial:

```bash
# En el Mac
git clone ssh://nuevoadmin@edumind-mini:2122/var/www/edumind_miclase
cd edumind_miclase
```

**2. Preparar.** Hace falta Node (18 o superior) y CocoaPods
(`brew install cocoapods`):

```bash
cd frontend && npm install && cd ..
npm run nativo:sync          # compila la web y la mete en el proyecto iOS
cd frontend && npx cap open ios
```

`npx cap sync` ejecuta `pod install` automáticamente cuando encuentra
CocoaPods; en este servidor se salta ese paso y avisa.

**3. En Xcode, tres cosas y solo tres:**

1. Selecciona el target **App** → pestaña **Signing & Capabilities** →
   en **Team** elige tu equipo de desarrollador. Con la firma automática, Xcode
   registra el identificador `es.edumind.miclase` por ti.
2. Arrastra `App/PrivacyInfo.xcprivacy` al target **App** en el navegador de
   proyecto (desmarca *Copy items if needed*: el fichero ya está en su sitio).
   Comprueba que aparece en **Build Phases → Copy Bundle Resources**. Sin esto
   App Store Connect se queja del manifiesto de privacidad al subir.
3. Elige un iPad conectado o un simulador y pulsa **Run**.

**4. Publicar.** `Product → Archive` → *Distribute App*. Para TestFlight basta
con eso; para la App Store hay que rellenar la ficha de privacidad en App Store
Connect. Las respuestas, según lo que hace la app: **no se recogen datos**, no
hay rastreo y no hay identificadores. Si el validador señala un «required reason
API», el que corresponde es `NSPrivacyAccessedAPICategoryUserDefaults` con
motivo `CA92.1`, que ya está declarado en el manifiesto.

### Qué revisar en el iPad antes de dar por buena la compilación

| Comprobación | Por qué importa |
|---|---|
| Escanear un QR de mesa con la cámara | WKWebView no trae `BarcodeDetector`: se usa el decodificador de reserva en JavaScript (`utils/lectorQR.ts`). Si esto falla, la función estrella no existe en iPad. |
| Hacer una foto y grabar un audio como evidencia | Verifica que los permisos del `Info.plist` están y que el texto que sale es el correcto |
| Cerrar la app, esperar y volver a abrirla con las notas puestas | Es la razón de ser del empaquetado: el almacenamiento debe sobrevivir |
| Abrir la app en modo avión | Debe arrancar y dejar calificar sin red |
| Girar el iPad y abrir el teclado en el calificador | Las áreas seguras y `contentInset` del teclado |
| Entrar en Sincronizar | Debe aparecer el campo de servidor, que solo se muestra en la app nativa |

### Android

```bash
npm run nativo:android    # abre Android Studio
```

Para Google Play hay que firmar el paquete: *Build → Generate Signed Bundle*.
El icono adaptativo ya está generado (primer plano y color de fondo).

## Configuración de sistema (auditoría 2026-08-24)

Los dos pendientes que había aquí están resueltos. Todos los cambios se
aplicaron con scripts en `/var/www/.edumind_ops/`, que hacen copia con fecha y
revierten solos si `nginx -t` falla:

| Script | Qué hace |
|---|---|
| `fix_miclase_headers_20260824.py` | Cabeceras de seguridad a un `.inc` incluido en **cada** `location`, y `Permissions-Policy` de `camera=()` a `camera=(self)` |
| `fix_miclase_secretos_20260824.py` | Secretos del unit a `/etc/edumind-miclase-api.env` (600), `JWT_SECRET` rotado, `HOST` eliminada |
| `fix_miclase_api_nostore_20260824.py` | `Cache-Control: no-store` en `/api/` |
| `fix_miclase_ratelimit_20260824.py` | Zonas `limit_req` y `miclase-proxy.inc` |
| `fix_miclase_429_20260824.py` | `limit_req_status 429` |
| `fix_miclase_csp_webllm_20260824.py` | CSP: `'wasm-unsafe-eval'` y los orígenes del modelo de IA local |

Dos cosas que conviene no perder de vista:

1. **Las cabeceras de seguridad se incluyen en cada `location`, no solo en el
   `server`.** nginx descarta *todas* las heredadas en cuanto un bloque hijo
   declara su propio `add_header`. Si añades un `location` nuevo con un
   `add_header`, incluye también `miclase-security-headers.inc` o ese recurso
   se servirá sin CSP.
2. **`AUTHENTIK_CLIENT_SECRET` sigue sin rotar.** Estuvo en un fichero 0644
   legible por cualquier usuario del servidor. Rotarlo exige cambiarlo también
   en Authentik, así que queda pendiente de hacerlo a mano.
