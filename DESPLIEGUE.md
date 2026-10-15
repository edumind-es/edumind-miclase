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

## Pruebas

Un solo comando. Monta el backend y el servidor de desarrollo en puertos
libres, corre las doce suites y lo apaga todo al terminar. La base de datos se
copia a un temporal: **el orquestador se niega a arrancar contra la de
producción**.

```bash
cd /var/www/edumind_miclase
npm test              # todo, unos 3 minutos
npm run test:rapido   # tipos, cálculo, fusión y lector de QR: 4 segundos
npm run test:prod     # contra https://miclase.edumind.es, ya desplegado
```

Si algo falla, el resumen dice qué suite y deja las capturas de pantalla en el
directorio temporal, que en ese caso no se borra.

Las pruebas se lanzan solas en dos momentos (`.githooks/`, activados con
`git config core.hooksPath .githooks`):

| Momento | Qué corre | Cuánto tarda |
|---|---|---|
| `git commit` | `npm run test:rapido` | ~4 s |
| `git push` | `npm test` | ~3 min |
| `./desplegar.sh` | `npm test` | ~3 min |

Para saltárselo puntualmente: `--no-verify` en git, `--sin-pruebas` al desplegar.

`.github/workflows/ci.yml` corre exactamente lo mismo, y está listo para
cuando el repositorio suba a GitHub. **No despliega**: el despliegue es
siempre una decisión manual.

## Desplegar

```bash
./desplegar.sh              # pruebas, compilar y publicar
./desplegar.sh --volver     # deshacer: versión anterior, al instante
./desplegar.sh --sin-pruebas
```

Qué hace, y por qué así:

1. **Se planta si hay cambios sin guardar en git.** Producción tiene que salir
   de un commit identificable.
2. **Pasa las pruebas.**
3. **Compila en `frontend/releases/<fecha>-<commit>`**, nunca encima de lo que
   se está sirviendo. Antes, `npm run build` vaciaba `frontend/dist` —que es
   literalmente la raíz de nginx—, así que durante la compilación la app estaba
   a medias y una compilación fallida la dejaba rota.
4. **Reinicia el backend solo si `backend/` ha cambiado**, según git.
5. **Cambia la versión viva de golpe**, moviendo un enlace simbólico. No hay
   ningún instante en que nginx vea un directorio incompleto.
6. **Comprueba que la web sirve el paquete nuevo** y, si no, **vuelve atrás
   sola**.
7. Conserva las cinco últimas versiones.

`frontend/dist` es un enlace simbólico a la versión publicada. nginx lo
resuelve en cada petición, así que el cambio no necesita recargar nginx.

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

Ojo con la versión de Node: **Capacitor 8 exige Node ≥ 22**. En este servidor
hay Node 20, así que el empaquetado nativo se hace en el Mac, no aquí; el
`npm run build` de la web sigue funcionando con Node 20.

### Qué hace distinto la app nativa (y por qué)

Dentro de WKWebView hay tres cosas de la web que **no existen** y que fallaban
en silencio: la descarga de ficheros (`<a download>`), `window.print()` y el
login por redirección. La app las resuelve así:

- **Ficheros** (copias de seguridad, CSV, informes HTML, rúbricas, QR,
  evidencias): todos salen por `descargarFichero` de `utils/compartir.ts`, que
  en nativo escribe en la caché de la app y abre la **hoja de compartir del
  sistema** (Guardar en Archivos, AirDrop, Mail…). Cualquier `a.download`
  nuevo vuelve a no hacer nada en el iPad: no los uses.
- **Imprimir / PDF** (informes y hoja de QR de mesa): el plugin propio
  `Impresora` (`src/nativo/impresora.ts` ↔
  `ios/App/CapApp-SPM/Sources/CapApp-SPM/ImpresoraPlugin.swift`) compone el
  HTML en A4, genera el PDF y abre la hoja del sistema, donde está AirPrint.
- **Login con EDUmind**: ver «Login desde la app nativa», más abajo. Hasta que
  el servidor lo admita, la app no enseña el botón y lo explica; todo lo demás
  —modo local, enlace directo por QR, paquete por AirDrop— funciona igual.
- **Origen**: la app se sirve desde `capacitor://localhost` (iOS no admite
  fijar `https` como esquema propio; el CORS del backend ya lo lista). No
  cambiarlo una vez publicada: cambiaría el origen de IndexedDB y el docente
  vería su cuaderno vacío.

### Compilar en el Mac, paso a paso

El proyecto iOS usa **Swift Package Manager**, no CocoaPods: no hace falta Ruby,
Homebrew ni `pod install`. Xcode resuelve Capacitor y los plugins solo al abrir
el proyecto, a partir de `ios/App/CapApp-SPM/Package.swift` (lo escribe
`cap sync`; no se edita a mano).

**1. Llevarse el código.** Se clona desde el remoto de GitHub, que conserva el
historial completo:

```bash
# En el Mac
git clone https://github.com/edumind-es/edumind-miclase.git
cd edumind-miclase
```

**2. Preparar.** Hace falta Xcode y Node 22 o superior. Si el Mac no tiene
Node, vale una copia local sin permisos de administrador: descomprime el
tarball oficial (`node-v22.x-darwin-arm64.tar.gz`) en `~/.local/node` y añade
`export PATH="$HOME/.local/node/bin:$PATH"` a la sesión.

```bash
cd frontend && npm install && cd ..
npm run nativo:sync          # compila la web y la mete en el proyecto iOS
cd frontend && npx cap open ios
```

**3. En Xcode, dos cosas y solo dos:**

1. Selecciona el target **App** → pestaña **Signing & Capabilities** →
   en **Team** elige tu equipo de desarrollador. Con la firma automática, Xcode
   registra el identificador `es.edumind.miclase` por ti.
2. Arrastra `App/PrivacyInfo.xcprivacy` al target **App** en el navegador de
   proyecto (desmarca *Copy items if needed*: el fichero ya está en su sitio).
   Comprueba que aparece en **Build Phases → Copy Bundle Resources**. Es el
   único fichero que no está ya en el target: `project.pbxproj` no se edita
   fuera de Xcode (editarlo con Xcode abierto lo corrompe), y añadirlo es
   justo lo que hace Xcode al soltarlo.

No hay que añadir ficheros Swift al target. Los plugins propios
(`ImpresoraPlugin`, `MiClaseViewController`) viven en
`ios/App/CapApp-SPM/Sources/CapApp-SPM/`, que se compila entero sin tocar el
proyecto; `SceneDelegate.swift` los importa con `import CapApp_SPM`.

**4. Probar.** Elige un iPad conectado o un simulador, pulsa **Run** y repasa
la tabla de abajo. Desde la terminal, sin abrir Xcode:

```bash
cd frontend/ios/App
xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

**5. Publicar.** `Product → Archive` → *Distribute App* → *App Store Connect*.
Para TestFlight basta con eso. Para la App Store, en App Store Connect:

- **Privacidad de la app**: «No se recogen datos». No hay rastreo ni
  identificadores; la sincronización opcional sube sobres cifrados que el
  servidor no puede leer, y en esta versión la app nativa ni siquiera ofrece
  la cuenta de EDUmind hasta que el servidor admita el login nativo.
- **Cifrado de exportación**: ya contestado en `Info.plist`
  (`ITSAppUsesNonExemptEncryption = false`): la app solo usa el cifrado del
  sistema (HTTPS y Web Crypto de WebKit), que está exento.
- **Notas para la revisión**: la app funciona completa sin cuenta (modo
  local), así que no hace falta credencial de prueba. Conviene sugerir el
  recorrido: crear una clase, añadir alumnado, calificar en el Calificador,
  y en Informes pulsar «Imprimir / PDF».
- **Capturas**: iPad de 13" e iPhone de 6,9" como mínimo; se hacen desde el
  simulador (⌘S).
- Si el validador señala un «required reason API», el que corresponde es
  `NSPrivacyAccessedAPICategoryUserDefaults` con motivo `CA92.1`, que ya está
  declarado en el manifiesto.
- Cada subida nueva necesita subir `CURRENT_PROJECT_VERSION` (el *Build*) en
  el target; `MARKETING_VERSION` (1.0) es la versión que ve el público.

### Login desde la app nativa

**Estado (comprobado 2026-10-13):** `https://miclase.edumind.es/api/auth/config`
ya devuelve `redirect_uri_nativo: "es.edumind.miclase://auth/callback"`, así
que el servidor en producción admite el login desde la app. El código de
`backend/src/routes/auth.js` de este clon todavía no lo incluye: antes de
tocar ese fichero hay que traer los cambios del servidor. Queda por confirmar
que el proveedor OIDC de Authentik tenga esa redirect URI en su lista; si no,
Authentik rechaza el login con «redirect_uri no permitida».

En la web, «Conectar EDUmind» redirige a Authentik y este vuelve a
`https://miclase.edumind.es/auth/callback`. En la app eso no sirve: Capacitor
manda las direcciones externas a Safari, y Authentik volvería a la web, donde
no está el verificador PKCE que generó la app. El camino correcto ya está
implementado en el frontend (`auth/AuthProvider.tsx`): abrir Authentik en el
navegador del sistema y volver por el esquema propio de la app,
`es.edumind.miclase://auth/callback`, declarado en `Info.plist`.

Para que funcione hacen falta dos cambios **fuera del frontend** (el segundo
ya está en el servidor de producción, no en este clon; `auth.js` es fichero
crítico y requiere confirmación expresa):

1. **Authentik**: en el proveedor OIDC de MiClase, añadir
   `es.edumind.miclase://auth/callback` a las *Redirect URIs* permitidas.
2. **Backend** (`backend/src/routes/auth.js`): anunciar el redirect nativo en
   `/config` y aceptar en `/callback` el `redirect_uri` con el que se inició
   el login, limitado a una lista cerrada:

   ```js
   const REDIRECT_URI_NATIVO = process.env.AUTHENTIK_REDIRECT_URI_NATIVO
     || 'es.edumind.miclase://auth/callback'
   const REDIRECTS_PERMITIDOS = new Set([REDIRECT_URI, REDIRECT_URI_NATIVO])

   // en app.get('/config'):
       redirect_uri_nativo: REDIRECT_URI_NATIVO,

   // en app.post('/callback'):
       const { code, code_verifier, nonce, redirect_uri } = req.body || {}
       const redirectUri = redirect_uri || REDIRECT_URI
       if (!REDIRECTS_PERMITIDOS.has(redirectUri)) {
         return reply.status(400).send({ error: 'redirect_uri no admitido' })
       }
       // …y en el POST a /application/o/token/:
           redirect_uri: redirectUri,
   ```

Hasta entonces la app nativa no muestra el botón de conectar y, en
Sincronizar, explica que el servidor aún no admite el login desde la app. En
cuanto `/api/auth/config` devuelva `redirect_uri_nativo`, el botón aparece
solo, sin publicar una versión nueva en la tienda.

### Qué revisar en el iPad antes de dar por buena la compilación

| Comprobación | Por qué importa |
|---|---|
| Escanear un QR de mesa con la cámara | WKWebView no trae `BarcodeDetector`: se usa el decodificador de reserva en JavaScript (`utils/lectorQR.ts`). Si esto falla, la función estrella no existe en iPad. |
| Hacer una foto y grabar un audio como evidencia | Verifica que los permisos del `Info.plist` están y que el texto que sale es el correcto |
| Cerrar la app, esperar y volver a abrirla con las notas puestas | Es la razón de ser del empaquetado: el almacenamiento debe sobrevivir |
| Abrir la app en modo avión | Debe arrancar y dejar calificar sin red |
| Girar el iPad y abrir el teclado en el calificador | Las áreas seguras y `contentInset` del teclado |
| Entrar en Sincronizar | Debe aparecer el campo de servidor, que solo se muestra en la app nativa; y, mientras el servidor no admita el login nativo, el aviso en lugar del botón «Conectar con EDUmind» |
| Informes → «Descargar copia de seguridad» | Debe abrirse la hoja de compartir del sistema (Guardar en Archivos, AirDrop…). Si no pasa nada, `utils/compartir.ts` no está detectando el contenedor nativo |
| Informes → «Imprimir / PDF» y Mis clases → hoja de QR de mesa | Debe salir la hoja del sistema con el PDF ya compuesto. Si no, el plugin `Impresora` no está registrado en `MiClaseViewController` |
| Compartir un paquete por AirDrop y recibirlo en el otro aparato | El fichero debe llegar como `.miclasesync.json` y poder elegirse en «Recibir un paquete» |

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
