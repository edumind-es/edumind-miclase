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
│   ├── src/routes/sync.js   ← buzón E2E: solo ve tabla, id, fecha y ciphertext
│   └── src/routes/programacion.js ← PDF de PROENS → texto con columnas (pdftotext); no lo guarda ni lo interpreta
├── frontend/         ← React + Vite + TypeScript
│   ├── src/db/       ← localDb.ts (esquema Dexie v6) · queries.ts (única fuente de verdad)
│   │                   calculo.ts (notas ponderadas + perfil competencial)
│   │                   diario.ts (diario de evaluación: cómo varios registros dan una nota)
│   │                   sync.ts (E2E + fusión a tres bandas) · ids.ts (rangos por dispositivo)
│   │                   transporte.ts (interfaz) · transporteFichero.ts (paquete
│   │                   por AirDrop/Quick Share) · transporteDirecto.ts + enlaceDirecto.ts
│   │                   (sincronización entre dispositivos por WebRTC, sin servidor)
│   ├── src/contexto/ ← ClaseActiva.tsx (clase, área y trimestre en curso)
│   ├── src/programacion/ ← proens.ts: lector de programaciones de PROENS (Xunta) → unidades,
│   │                   criterios con mínimo e instrumento. Puro; se prueba con pruebas/fixtures/
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
- **`sync.ts` no sabe dónde viven los sobres.** Todo el diálogo con el exterior
  pasa por la interfaz `Transporte` (`db/transporte.ts`). Hay dos: el buzón del
  servidor y el enlace directo entre dispositivos. Meter una llamada `fetch`
  dentro de `sync.ts` rompería el enlace directo, que no tiene servidor al que
  llamar.
- **Hay tres caminos para los sobres, y ninguno es obligatorio**: el buzón del
  servidor, el enlace directo por QR (misma wifi) y un paquete en un fichero
  (`transporteFichero.ts`), que sale por la hoja de compartir del sistema
  —AirDrop, Quick Share— y es el único que no depende de la red del centro.
  El de fichero son **dos** transportes, escritura y lectura, a propósito:
  uno solo movería el cursor del lado equivocado, dando por enviado lo que
  solo se ha recibido.
- **En el enlace directo, callar no es haberse ido.** Los dos aparatos no
  arrancan a la vez —uno empieza al leer el QR y el otro está escribiendo la
  contraseña—, así que el transporte late cada pocos segundos desde que se
  abre la sesión y solo abandona tras un minuto de silencio *absoluto*. Medir
  inactividad en vez de silencio ya rompió la sincronización una vez. Y al
  terminar se manda `adios` y se espera el del otro: colgar a secas corta al
  que aún está escribiendo.
- **Cada transporte lleva sus propios cursores.** Lo ya subido al buzón no es lo
  ya pasado a la tablet: compartir cursor daría por enviado por un camino lo que
  se envió por el otro. El buzón conserva los nombres de clave de siempre.
- **Antes de pasar nada por el enlace directo se comparan las contraseñas**
  (`compararContrasenaConElOtro`, por la sal). Dos aparatos con contraseñas
  creadas por separado no pueden abrir nada del otro, y sin la comprobación
  «sincronizaban» sin error y después ya no mandaban nada. La contraseña la
  crea solo el anfitrión (quien invita); el invitado la comprueba contra él.
  Unificar (`unificarContrasena…`) reinicia los cursores sin servidor
  (`reenviarTodoSinServidor`), porque lo enviado con la clave vieja nunca se aplicó.
- **Escribir un paquete no es entregarlo.** El transporte de fichero no da nada
  por «aceptado» (sin terreno común para la fusión) y `empaquetarParaOtroDispositivo`
  devuelve `deshacer()` para cuando la hoja de compartir se cancela.
- **Nada de sincronizar se queda callado.** Cada acción termina diciendo qué ha
  pasado, también cuando no ha pasado nada; los sobres que no se pueden
  descifrar se cuentan en `sinDescifrar` y se explican como «otra contraseña»;
  los fallos de conexión traen diagnóstico (direcciones ofrecidas, estado ICE).
- **La sal y el verificador viven también en el dispositivo**, no solo en el
  buzón. Si solo estuvieran en el servidor, un aparato nuevo no podría
  desbloquear sin él y el enlace directo no serviría de nada.
- **La fusión de sincronización mantiene su base.** `sync_base` guarda la
  última versión común de cada registro; sin ella el merge cae al
  last-write-wins y se pierden cambios simultáneos en campos distintos.
- **Los topes de tamaño salen todos de `db/limites.ts`.** El que manda es
  `LIMITE_SOBRE` (8 MB), que es lo que rechaza el servidor por registro; el
  aviso al capturar (~5,5 MB) se deriva de ahí contando lo que infla base64.
  No inventar cifras nuevas en otro fichero: eso ya pasó y dejó seis topes
  incoherentes.
- **Una evidencia que no puede viajar se dice, no se pierde.** El cursor de
  envío solo avanza con lo que el servidor confirma, y lo que no cabe queda en
  cuarentena y se lista en la pantalla de sincronización.
- **El escaneo de QR necesita los dos motores.** `BarcodeDetector` no existe en
  WKWebView ni en Safari: sin el decodificador de reserva de `utils/lectorQR.ts`
  la función estrella desaparece justo en el iPad.
- **La clase activa es una sola y vive en `contexto/ClaseActiva`.** Ninguna
  pantalla monta su propio selector de grupo ni guarda su propio `grupo_id`:
  eso ya pasó y dejó cinco selectores independientes, de modo que elegir la
  clase en Evaluación no cambiaba nada en Asistencia y abrir la app desde el
  icono aterrizaba sin ninguna. Los enlaces con `?grupo_id=` (los QR de mesa ya
  impresos) entran por `useParametrosClase`, que fija el contexto y limpia la
  URL. El trimestre no se persiste entre sesiones a propósito: heredar el de
  diciembre en enero metería las notas nuevas en el trimestre equivocado.
- **El lector de PROENS trabaja por columnas, no por líneas.** El texto llega
  de `pdftotext -layout` y las posiciones de las cabeceras («Mínimos de
  consecución», «IA», «%») son lo que separa el criterio de su mínimo y lo
  que permite saber qué criterios cubre una celda combinada de instrumento
  (va centrada en su bloque y no se repite si salta de página). Normalizar
  espacios antes de parsear lo rompe todo. El fixture se regenera con
  `pruebas/lib/proens_gemelo.py`; el PDF real de Luis aún no ha pasado por él.
- **La tabla `rubricas` guarda tres cosas.** La rúbrica de un instrumento, las
  copias del banco del docente (`instrumento_id = INSTRUMENTO_BANCO`, que no
  cuelgan de ningún instrumento y sobreviven al borrado de la clase) y las
  definiciones de prueba escrita (`tipo: 'prueba'`, una por instrumento y
  unidad, o general con `unidad_id` null). Comparten tabla para sincronizarse
  sin tocar el esquema ni el servidor. Toda consulta de rúbricas filtra con
  `esRubrica`: sin él, un examen se abriría como una rúbrica vacía.
- **La réplica a criterios vinculados vive en `saveCalificaciones`**, no en las
  pantallas: es el único sitio por el que pasan las notas (panel de celda,
  evaluación rápida, QR). Quién va con quién lo decide `db/vinculos.ts`,
  cerrando por transitividad entre unidades del trimestre, porque la nota se
  guarda por alumno, instrumento, criterio y trimestre, no por unidad. Copiar
  notas y corregir un examen escriben con `sinVinculos`: su reparto ya está
  decidido. Nada se replica sin que el docente lo haya pedido.
- **«Copiar nota» tiene tres alcances y ninguno se da por supuesto**: la nota
  del alumno a sus otros criterios; la misma nota de ese alumno a toda la clase
  (`desde_alumno_id`), que es lo que un docente entiende por «a toda la clase»;
  y la nota que cada alumno tenga en el criterio a sus otras columnas. Antes
  solo existían la primera y la tercera, y la tercera se llamaba «toda la
  clase»: Luis la pulsó esperando la segunda.
- **El Calificador tiene dos vistas de los mismos datos** (`EvaluacionPage`):
  por criterio (la matriz LOMLOE) y por instrumento (`MatrizInstrumentos`, una
  columna por examen, cuaderno o billete de salida con los criterios que cubre).
  Ninguna guarda nada por su cuenta: las dos abren `CeldaEvaluacion`, con
  `enfoque` distinto, y «Evaluar hoy» (`SesionInstrumento`) escribe solo por
  `anadirRegistro`/`editarRegistro`/`borrarRegistro` del diario. Un alumno tiene
  un solo registro por instrumento y día desde esa pantalla: cambiar de botón
  edita, repetirlo borra. La vista elegida se recuerda en `localStorage`
  porque es una comodidad del aparato, no un dato.
- **Lo que trae PROENS son familias, no instrumentos.** «Proba escrita» 80 %
  y «Táboa de indicadores» 20 % agrupan lo que el docente hace de verdad: el
  examen de cada unidad, el billete de salida, speaking, listening. Un hijo
  es un `Instrumento` con `familia_id` (sin índice), tipo y color propios, un
  **subconjunto** de los criterios de su familia en cada unidad
  (`fijarCriteriosDeHijo` lo comprueba y falla si se sale) y un `peso`
  relativo DENTRO de la familia (1 por defecto). La familia entra en el área
  con su peso de siempre. La fusión vive en `fundirHijosEnFamilias`
  (`calculo.ts`) y la usan tanto `calcularNotaArea` como la matriz: una nota
  directa de la familia (anterior a tener hijos) cuenta como un hijo más con
  peso 1, y un hijo sin familia viva cuenta como instrumento suelto. Las
  notas y el diario se guardan con el id del hijo; la nota de la familia en
  la matriz es **virtual** (`Calificacion.virtual`, sin `id`, nunca se
  guarda). Las familias son lo único que suma el 100 % del gestor
  (`getFamilias`); borrar una familia se lleva a sus hijos. En la matriz,
  `porCriterio` trae a los hijos con `familia_id` y aparta a la familia en
  cuanto un hijo evalúa el criterio: se califica con el hijo y la familia
  resume. La misma regla aplica la evaluación rápida.
- **El color identifica al instrumento, no a su tipo.** Ocho tonos de
  Okabe-Ito (`PALETA_INSTRUMENTOS`), propio (`Instrumento.color`) o por orden
  entre iguales (`colorDeInstrumento`), resueltos una vez en
  `getMatrizEvaluacion` (`CeldaInstrumento.color`). Nunca es la única pista:
  al lado va siempre la abreviatura (`abreviatura`). Los colores del tipo
  (`TIPOS_INSTRUMENTO`) quedan para iconos y fondos del gestor.
- **En un examen, lo no anotado vale cero; en una rúbrica, no cuenta.**
  `notaDePrueba` (`db/prueba.ts`) divide entre todos los puntos del examen;
  `notaDeRubrica` promedia solo lo observado. En el reparto por criterios solo
  reciben nota los criterios que alguna pregunta nombra y que la programación
  asigna al instrumento.
- **Un examen se guarda con `guardarExamenDeAlumno`** (`queries.ts`), nunca
  montando las notas en la pantalla: se corrige desde el panel de la casilla y
  desde la evaluación rápida, y las dos tienen que repartir igual. Cambiar un
  examen ya corregido ofrece `recalcularNotasDeExamen`; no se hace sin preguntar.
- **Una nota puesta no se pierde nunca por un recálculo.** La que cambia —o la
  que se queda sin nota— deja su valor como fantasma en
  `Calificacion.valor_anterior`: a la vista (columna duplicada y
  semitranslúcida en la matriz), sin contar —todo el cálculo lee `valor`— y
  recuperable desde el panel de la casilla. Decisión expresa de Luis: retirar
  la nota sin más, aunque fuera coherente, no es aceptable.
- **Borrar un instrumento, un área o una clase conserva sus rúbricas en el
  banco** (`conservarRubricasEnBanco`). Solo «Eliminar rúbrica» la borra de verdad.
- **El diario de evaluación no pisa nada.** La tabla `diario` guarda una
  observación fechada por registro (nivel 1-4) y la nota del criterio se
  DERIVA en `materializarDiario` (`queries.ts`), nunca en una pantalla, con la
  regla de `Instrumento.agregacion` (`db/diario.ts`). La nota derivada se
  escribe en `calificaciones` con `origen: 'diario'` y `sinVinculos`, para que
  informes, matriz, fantasma y sync sigan leyendo lo de siempre. Reglas que no
  se deben romper: (1) la materialización es determinista (orden por fecha e
  id) y **solo escribe si cambia `valor` u `origen`** —cada aparato la repite
  tras sincronizar (`alAplicarCambios` en `sync.ts`) y si escribiera siempre
  habría un ping-pong sin fin—; (2) los criterios de un registro se fijan al
  crearlo en `criterios_json`, así que cambiar la programación no vacía notas
  derivadas; (3) una nota a mano sobre una casilla derivada la vuelve manual y
  el siguiente registro la manda a fantasma: nada se pierde. El backend tiene
  la tabla en la lista blanca de `routes/sync.js`; sin eso los registros van a
  cuarentena y no viajan.
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
`npm test` monta backend y servidor de desarrollo en puertos libres, corre las
doce suites y lo apaga todo. Se niega a arrancar contra la BD de producción.
`npm run test:rapido` para el bucle corto (4 s), `npm run test:prod` contra la
web ya desplegada. Se lanzan solas en `git commit` (rápidas) y `git push`
(completas) vía `.githooks/`.

## Estado — EN PRODUCCIÓN
Desplegada en https://miclase.edumind.es (verificado 2026-08-24):
- nginx: `/etc/nginx/sites-enabled/miclase.edumind.es.conf` — sirve `frontend/dist` (SPA + PWA) y proxy `/api` → 127.0.0.1:3270
  - `miclase-security-headers.inc` — cabeceras de seguridad. **Se incluye dentro de
    cada `location`**: nginx descarta las heredadas del `server` en cuanto un bloque
    hijo declara su propio `add_header`, y así la SPA se servía sin CSP.
  - `miclase-proxy.inc` — ajustes del proxy, compartidos por los cuatro `location` de `/api/`
  - `/etc/nginx/conf.d/miclase-rate-limit.conf` — zonas `limit_req` (auth 10r/m, sync 120r/m, resto 60r/m; 429)
- systemd: `edumind-miclase-api.service` — backend Fastify con NODE_ENV=production.
  Los secretos (`JWT_SECRET`, `AUTHENTIK_CLIENT_SECRET`) **no están en el unit**:
  viven en `/etc/edumind-miclase-api.env` con permisos 600.
- Despliegue: `./desplegar.sh` (pruebas → compila en `frontend/releases/…` →
  cambia el enlace simbólico de golpe → comprueba → vuelve atrás si falla).
  `./desplegar.sh --volver` deshace. Nunca automático.
- **El árbol de trabajo ES producción**: systemd ejecuta `backend/src` desde
  este mismo directorio, así que un `git checkout` de otra rama cambia el
  backend en el siguiente `systemctl restart`. El frontend ya no: `frontend/dist`
  es un enlace simbólico a la versión publicada en `frontend/releases/`, y solo
  cambia cuando lo cambia `desplegar.sh`.

## Lo que NO hacer
- No hacer `npm install` sin avisar
- No compilar a mano sobre `frontend/dist`: usar `./desplegar.sh`
- No tocar `backend/.env` sin confirmación
- No asumir que está desplegado en producción sin comprobarlo primero
- No añadir versiones nuevas al esquema Dexie sin un `upgrade()` que selle
  `updated_at` en los registros existentes. Una tabla nueva va además en
  `TABLAS_SINC`, en `exportarDatos`/`importarDatos`, en la lista blanca del
  backend (`routes/sync.js`) y en las pruebas que leen la versión
  (`migracion.test.mjs`, `e2e.test.mjs`)
- No probar la sincronización contra la BD de producción: usar una copia
