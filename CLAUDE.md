# edumind_miclase — Contexto del proyecto

## Qué es
App EDUmind MiClase. **Local-first**: todos los datos de aula (clases, alumnado, calificaciones, asistencia, programación, rúbricas, evidencias) viven en el navegador del docente (IndexedDB vía Dexie) — el servidor NO almacena datos personales en claro. El backend Node/Fastify + SQLite sirve el currículo (datos públicos), la auth (local + Authentik OIDC) y un buzón de sincronización **cifrado de extremo a extremo** que no puede abrir. Frontend React/Vite + TypeScript. Incluye currículum LOMLOE por comunidad autónoma (aragon, canarias, clm, cyl…).

## La idea central
La **programación manda**. Cada unidad decide con qué instrumento se evalúa cada
criterio (`criterio_instrumentos`). El calificador solo obedece: al pulsar una
casilla muestra el criterio, el instrumento que le toca y su rúbrica. Un criterio
sin instrumento sale rayado y explica cómo arreglarlo, en vez de dejar poner una
nota a ciegas.

## Arquitectura
edumind_miclase/
├── backend/          ← Fastify (Node ESM). Entrada: src/index.js
│   ├── data/         ← SQLite (miclase.db): currículo + docentes (auth) + buzón de sync cifrado
│   ├── src/plugins/auth.js  ← auth dual local + Authentik OIDC
│   ├── src/routes/auth.js
│   └── src/routes/sync.js   ← buzón E2E: solo ve tabla, id, fecha y ciphertext
├── frontend/         ← React + Vite + TypeScript
│   ├── src/db/       ← localDb.ts (esquema Dexie v5) · queries.ts (única fuente de verdad)
│   │                   calculo.ts (notas ponderadas + perfil competencial)
│   │                   sync.ts (E2E + fusión a tres bandas) · ids.ts (rangos por dispositivo)
│   ├── src/api.ts    ← resuelve la URL del API (relativa en web, absoluta en nativo)
│   ├── src/informes/ ← lamina.ts (canon EDUmind) · datos.ts · documentos.ts
│   ├── public/fonts/ ← Outfit e IBM Plex Mono (OFL-1.1) para los informes
│   ├── capacitor.config.ts
│   ├── ios/          ← proyecto Xcode (permisos en App/App/Info.plist)
│   └── android/      ← proyecto Gradle (permisos en app/src/main/AndroidManifest.xml)
├── curriculum/       ← currículum por CCAA
├── scripts/          ← parse_curriculum.py · generar_iconos.py (todos los iconos)
├── PRIVACIDAD.md     ← qué datos se tratan y qué ve el servidor
└── start-dev.sh      ← arranca backend (:3270) + frontend (:5173) juntos

## Invariantes que no se deben romper
- **Ids por rango de dispositivo** (`db/ids.ts`): nunca usar el autoincremento de
  Dexie para crear registros. Todo alta pasa por `nuevo()` en `queries.ts`, que
  asigna `id`, `updated_at` y `deleted_at`. Sin esto, dos dispositivos que
  sincronizan se pisan las claves foráneas.
- **Borrado lógico**: se marca `deleted_at`, no se borra la fila. Un borrado
  físico es invisible para el merge y reaparecería en el siguiente sync. Toda
  lectura debe filtrar con `vivos()`.
- **Las notas se ponderan en `calculo.ts`**, no en las pantallas. Peso de
  instrumento → nota de criterio → peso de criterio → nota de área → pesos de
  trimestre → nota final. Un trimestre sin datos no cuenta como cero.
- **Cambiar la programación no borra calificaciones.** Retirar un instrumento de
  un criterio conserva las notas ya puestas.
- **Toda llamada al API pasa por `api()` de `src/api.ts`.** Una ruta relativa
  fija funciona en la web pero en el contenedor nativo apunta al propio
  contenedor, no al servidor.
- **La fusión de sincronización mantiene su base.** `sync_base` guarda la
  última versión común de cada registro; sin ella el merge cae al
  last-write-wins y se pierden cambios simultáneos en campos distintos.
- **Las evidencias de más de 5 MB no sincronizan** (tope del sobre cifrado).
  Se guardan igual, pero hay que avisar al docente, no fallar en silencio.
- **El escaneo de QR necesita los dos motores.** `BarcodeDetector` no existe en
  WKWebView ni en Safari: sin el decodificador de reserva de `utils/lectorQR.ts`
  la función estrella desaparece justo en el iPad.
- **Los iconos se generan, no se editan a mano**: `scripts/generar_iconos.py`
  produce los de web, iOS y Android desde una única definición.

## Comandos habituales
- Dev completo: `./start-dev.sh`
- Empaquetar nativo: `npm run nativo:sync` (y `nativo:ios` / `nativo:android`
  para abrir Xcode o Android Studio — requieren macOS o Android Studio)
- Backend solo: `npm run dev:backend` (puerto 3270)
- Frontend solo: `npm run dev:frontend` (puerto 5173)
- Seed DB: `npm run seed`
- Build: `npm run build`

## Archivos críticos — pedir confirmación SIEMPRE antes de tocar
- `backend/data/miclase.db` — base de datos principal
- `backend/.env` — nunca tocar sin confirmación explícita
- `backend/src/plugins/auth.js` / `routes/auth.js` — auth dual local + OIDC, y exportación AES-256

## Pruebas
No hay framework de tests instalado; las pruebas se escriben como scripts
sueltos y se lanzan a mano (ver `DESPLIEGUE.md`):
- Motor de cálculo: bundle con esbuild y `node`.
- Backend de sync: arrancar en un puerto aparte con una copia de la BD y
  firmar un JWT de prueba con `jose`.
- Fusión a tres bandas: bundle con esbuild y `node`.
- Interfaz, migración v3→v5 y sincronización real entre dos dispositivos:
  Playwright (el binario vive en `/var/www/pasos_v2/node_modules`).

## Estado — EN PRODUCCIÓN
Desplegada en https://miclase.edumind.es (verificado 2026-07-04):
- nginx: `/etc/nginx/sites-enabled/miclase.edumind.es.conf` — sirve `frontend/dist` (SPA + PWA) y proxy `/api` → 127.0.0.1:3270
- systemd: `edumind-miclase-api.service` — backend Fastify con NODE_ENV=production (env vars en el unit, tienen prioridad sobre backend/.env)
- Despliegue: ver `DESPLIEGUE.md` (merge → npm install → build → restart servicio)

## Lo que NO hacer
- No hacer `npm install` sin avisar
- No tocar `backend/.env` sin confirmación
- No asumir que está desplegado en producción sin comprobarlo primero
- No añadir versiones nuevas al esquema Dexie sin un `upgrade()` que selle
  `updated_at` en los registros existentes
- No probar la sincronización contra la BD de producción: usar una copia
