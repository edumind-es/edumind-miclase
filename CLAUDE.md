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
│   ├── src/db/conexiones.js ← competencia específica → descriptores operativos (puro; lo usa seed.js)
│   └── src/routes/programacion.js ← RESERVA: PDF de PROENS → texto con columnas (pdftotext); solo si el docente lo acepta
├── frontend/         ← React + Vite + TypeScript
│   ├── src/db/       ← localDb.ts (esquema Dexie v10) · queries.ts (única fuente de verdad)
│   │                   calculo.ts (notas ponderadas + perfil competencial)
│   │                   competenciasClave.ts (nivel por descriptor operativo y competencia clave)
│   │                   diario.ts (diario de evaluación: cómo varios registros dan una nota)
│   │                   sync.ts (E2E + fusión a tres bandas) · ids.ts (rangos por dispositivo)
│   │                   transporte.ts (interfaz) · transporteFichero.ts (paquete
│   │                   por AirDrop/Quick Share) · transporteDirecto.ts + enlaceDirecto.ts
│   │                   (sincronización entre dispositivos por WebRTC, sin servidor)
│   ├── src/contexto/ ← ClaseActiva.tsx (clase, área y trimestre en curso)
│   ├── src/programacion/ ← proens.ts: lector de programaciones de PROENS (Xunta) → unidades,
│   │                   criterios con mínimo e instrumento. Puro; se prueba con pruebas/fixtures/
│   │                   pdfTexto.ts (puro) + pdfNavegador.ts: el PDF → texto con columnas en el aparato (pdf.js)
│   ├── src/planificacion/ ← semanal.ts: lector del .md de la programación semanal (puro) ·
│   │                   casar.ts: área, unidad y criterios de la clase (puro) · exportar.ts: .md y lámina
│   ├── src/api.ts    ← resuelve la URL del API (relativa en web, absoluta en nativo)
│   ├── src/informes/ ← lamina.ts (canon EDUmind) · datos.ts · documentos.ts · actaTutoria.ts
│   ├── public/fonts/ ← Outfit e IBM Plex Mono (OFL-1.1) para los informes
│   ├── public/aulamap/ ← AulaMap (© Juan José de Haro, AGPL v3 SOLO, con su permiso): el plano de clase
│   ├── src/nativo/   ← impresora.ts: plugin Impresora (PDF/AirPrint en iOS; iframe en web)
│   ├── src/utils/compartir.ts ← descargarFichero(): la ÚNICA salida de ficheros (web: descarga; nativo: hoja de compartir)
│   ├── capacitor.config.ts
│   ├── ios/          ← proyecto Xcode con Swift Package Manager (sin CocoaPods). Permisos y
│   │                   esquema de URL en App/App/Info.plist; plugins propios en
│   │                   App/CapApp-SPM/Sources/CapApp-SPM/ (ImpresoraPlugin, MiClaseViewController)
│   └── android/      ← proyecto Gradle (permisos en app/src/main/AndroidManifest.xml)
│   ├── src/curriculo/ ← ÚNICA puerta al currículo: fuente.ts (puro) + index.ts (carga y reserva)
│   └── public/curriculo/ ← el currículo empaquetado (generado en cada build; no se versiona)
├── curriculum/       ← currículum por CCAA; _estatal/ = descriptores y conexiones de los RD
├── scripts/          ← parse_curriculum.py · extraer_estatal.py · generar_iconos.py (todos los iconos)
│                       empaquetar_curriculo.mjs (curriculum/ → frontend/public/curriculo/)
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
  instrumento → nota de criterio; después la nota del área según
  `Asignatura.regla_area` (sin índice; `REGLAS_AREA`, `normalizarReglaArea`):
  **por instrumento** (por defecto: cada familia vale la media de sus
  criterios con nota y el área pondera las familias por su peso, el 80/20 de
  PROENS; `NotaArea.instrumentos` lo desglosa) o **por criterio** (media de
  los criterios por su peso, con el instrumento pesando solo dentro de cada
  criterio). Luego pesos de trimestre → nota final. La regla se elige en la
  pestaña «Nota final» (`[data-regla-area]`) y `ExplicacionNota` la nombra.
  Por criterio era lo único que había: con 5 criterios de examen y 20 de
  tabla, los 15 que solo evalúa la tabla entraban enteros y el 80/20 no se
  cumplía; Luis lo vio en el iPad (nov 2026) y decidió el cambio. La nota de
  cada criterio y las competencias clave no dependen de la regla. Un
  trimestre sin datos no cuenta como cero, ni un instrumento sin nota.
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
- **El buzón se puede cerrar por configuración, y está abierto por defecto.**
  `MICLASE_BUZON=cerrado` (`backend/src/config.js`, `BUZON_ABIERTO`) hace que
  `/api/sync/disponible` (público) diga `{abierto:false}` y que todo lo demás
  de `/api/sync` responda 410 `BUZON_CERRADO`, salvo `DELETE /` con sesión
  (supresión). La app lo pregunta en `AuthProvider` (`db/buzon.ts`): sin
  buzón no ofrece la cuenta ni restaura la sesión, así que todo lo que pide
  `modo === 'authentik'` se queda quieto, y Sincronizar enseña
  `[data-buzon-cerrado]`. La respuesta se recuerda en
  `miclase.buzon.cerrado` para que `diagnostico()` de la copia no cuente el
  buzón. Un servidor sin la ruta (404) cuenta como abierto. No se toca
  `routes/auth.js`. Decisión de Luis (oct 2026): el buzón es un añadido, la
  app es local. **Cerrado en producción desde el 1/11/2026**, vaciado antes
  sobre una copia (DESPLIEGUE.md, «Cerrar el buzón»).
- **Cada transporte lleva sus propios cursores.** Lo ya subido al buzón no es lo
  ya pasado a la tablet: compartir cursor daría por enviado por un camino lo que
  se envió por el otro. El buzón conserva los nombres de clave de siempre.
- **Por QR y por paquete los datos van siempre enteros** (`TABLAS_DATOS`,
  `kDesde: null`), y quien recibe descarta lo que ya tiene. El cursor es de cada
  camino, no de cada aparato: lo que recibió el Mac mini se daba por enviado y no
  le llegaba al MacBook, y lo recibido de un tercero, con su fecha, quedaba
  detrás del cursor. Quitarlo exige que nada viejo pise lo nuevo: ver la regla
  siguiente. **Las evidencias no**: el iPad de Luis ocupa 812 MB, y montar eso en
  un paquete agotaría su memoria. Por QR se pregunta al otro cuáles le faltan
  (`inventarioDelOtro`); en un paquete van las posteriores al anterior (el cursor
  `sync_push_desde:carpeta` ya solo cuenta evidencias) y el docente puede pedir
  todas (`todasLasEvidencias`, con `confirm`). El buzón y la copia en carpeta
  siguen por cursor, y lo recibido baja el de la copia (`incluirEnLaCopia`): si
  no, las notas del iPad llegaban al Mac pero no a su carpeta.
- **Una evidencia borrada no guarda su contenido.** `eliminarEvidencia` y
  `sinContenidoSiBorrada` dejan un blob vacío (la fila sigue: el borrado tiene
  que viajar) y `aSobre` la manda sin él. Lo borrado antes se vacía con
  `liberarEvidenciasBorradas`, que el desglose ofrece con `confirm`.
- **Qué ocupa cada cosa lo dice `db/almacen.ts`** (puro) en
  `AlmacenamientoLocal` (`[data-almacen-desglose]`). La copia de seguridad sale
  por defecto **sin evidencias** (`exportarDatos(…, { sinEvidencias })`, con
  `sin_evidencias: true` como primer campo; `esCopiaSinEvidencias`) e
  `importarDatos` conserva entonces las del aparato: si las borrase, restaurar
  una copia ligera se llevaría todos los vídeos. Las copias descargadas y los
  paquetes enviados cuentan para el aviso (`registrarCopiaEnFichero`).
- **El vídeo se graba en la app a calidad reducida** (`GrabadorVideo`: 720p,
  1 Mbps, unos 7,5 MB por minuto), porque la cámara del sistema pasaba del tope
  de sincronización (`LIMITE_EVIDENCIA_SINC`) en segundos. La cámara del sistema
  sigue como alternativa dentro del grabador y si no hay `MediaRecorder`. En
  `e2e.test.mjs` se prueba con cámara de mentira de Chromium; en Safari real, no.
  Comprimir los vídeos ya guardados está pendiente (necesita una librería).
- **Nada viejo pisa una nota.** `fusionarTresBandas` no aplica lo anterior a la
  base (`obsoleto`): «solo lo cambió el remoto» no distingue una edición de una
  versión vieja, y un Mac atrasado devolvía el 9 del iPad a su 5, con el sello
  del 9. Y en `calificaciones` una nota editada gana al borrado
  (`notaGanaAlBorrado`): esos borrados los hace casi siempre
  `reconciliarDuplicados`, y la nota nueva quedaba en una fila retirada. El
  recibo del enlace directo no es terreno común (`aceptados: []`): dejaba la
  base igual a lo local. Se prueba en `sync-varios-aparatos.test.mjs`, con tres
  aparatos. Nació de que las notas de Lingua galega del iPad no llegaban a los
  Macs (nov 2026).
- **Antes de pasar nada por el enlace directo se comparan las contraseñas**
  (`compararContrasenaConElOtro`, por la sal). Dos aparatos con contraseñas
  creadas por separado no pueden abrir nada del otro, y sin la comprobación
  «sincronizaban» sin error y después ya no mandaban nada. La contraseña la
  crea solo el anfitrión (quien invita); el invitado la comprueba contra él.
  Unificar (`unificarContrasena…`) reinicia los cursores sin servidor
  (`reenviarTodoSinServidor`), porque lo enviado con la clave vieja nunca se aplicó.
- **La copia automática es un paquete de AirDrop escrito en una carpeta**
  (`db/copia.ts`, formato puro en `db/copiaFormato.ts`, destinos en
  `db/destinoCopia.ts`). Mismo `PaqueteSync`, misma contraseña, cursor propio
  (`'copia'`): un fichero por tanda con nombre que ordena por fecha
  (`nombreFicheroCopia`) y un manifiesto con sal y verificador. Restaurar
  (`restaurarDesdeCopia`) aplica los paquetes en orden con `aplicarPaquete(…,
  { restaurar: true })`, el único caso en que un aparato acepta sus propios
  paquetes, y después sella el cursor de copia para no reescribir lo
  restaurado. El temporizador (`CopiaAutomatica`) no puede pedir el permiso
  de la carpeta —el navegador exige un clic—: si caducó, calla y la tarjeta
  de Sincronizar lo dice. El aviso de Inicio (`AvisoCopia`, `diagnosticoCopia`)
  cuenta el buzón como copia solo con la sincronización automática activa.
- **Escribir un paquete no es entregarlo.** El transporte de fichero no da nada
  por «aceptado» (sin terreno común para la fusión) y `empaquetarParaOtroDispositivo`
  devuelve `deshacer()` para cuando la hoja de compartir se cancela.
- **Nada de sincronizar se queda callado.** Cada acción termina diciendo qué ha
  pasado, también cuando no ha pasado nada; los sobres que no se pueden
  descifrar se cuentan en `sinDescifrar` y se explican como «otra contraseña»;
  los fallos de conexión traen diagnóstico (direcciones ofrecidas, estado ICE).
- **La sal y el verificador viven también en el dispositivo**, no solo en el
  buzón. Y al revés: quien estrenó la contraseña sin buzón y luego conecta su
  cuenta la **publica** con `publicarContrasenaEnBuzon` (misma sal, mismo
  verificador), nunca crea otra; hasta entonces ni la pantalla ni
  `SyncAutomatica` sincronizan contra un buzón sin configurar (`iniciado`). Si solo estuvieran en el servidor, un aparato nuevo no podría
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
- **El PDF de PROENS se lee en el aparato.** `pdfNavegador.ts` abre el PDF
  con pdf.js (build `legacy`, worker servido por la app, cargado a demanda) y
  `pdfTexto.ts` (puro) coloca cada trozo en su línea y su columna imitando
  `pdftotext -layout`: descarta el texto girado (la marca de agua),
  cuenta columnas desde el margen del documento y usa un ancho de carácter
  reducido (`FACTOR_PASO`). `proens-navegador.test.ts` exige el mismo
  resultado de `parsearProens` que con pdftotext en los dos PDF de
  `fixtures/`, campo a campo. El servidor (`routes/programacion.js`) queda
  como reserva y `ImportarProens` solo lo usa si la lectura en el aparato no
  da ninguna unidad **y** el docente acepta el `confirm` que dice que el PDF
  sale del dispositivo; `proens-ui.test.mjs` comprueba que no hay petición.
- **El lector de PROENS trabaja por columnas, no por líneas.** El texto llega
  de `pdftotext -layout` (o de `pdfTexto.ts`, que lo imita) y las posiciones de las cabeceras («Mínimos de
  consecución», «IA», «%») son lo que separa el criterio de su mínimo y lo
  que permite saber qué criterios cubre una celda combinada de instrumento
  (va centrada en su bloque y no se repite si salta de página). Normalizar
  espacios antes de parsear lo rompe todo. El fixture se regenera con
  `pruebas/lib/proens_gemelo.py`; el PDF real de Luis aún no ha pasado por él.
- **Un PDF de PROENS de otro curso, etapa o área pregunta antes de
  importarse** (`ImportarProens.aplicar`, con `confirmar` y «Importar de
  todos modos»): el aviso de arriba no bastaba, porque los criterios se casan
  solo por el número (CA→CE) con el currículo de la clase.
- **Física y Química de Galicia (ESO) lleva OBJ5 y OBJ6 añadidos a mano** en
  los tres JSON: la matriz de origen traía criterios que los nombraban pero
  no las competencias. Van con el texto del RD 217/2022 y sin descriptores
  propios, así que su conexión sale como `estatal` (`meta.nota` lo dice). Si
  se regenera el JSON desde la matriz, hay que volver a añadirlos.
- **La tabla `rubricas` guarda tres cosas.** La rúbrica de un instrumento, las
  copias del banco del docente (`instrumento_id = INSTRUMENTO_BANCO`, que no
  cuelgan de ningún instrumento y sobreviven al borrado de la clase) y las
  definiciones de prueba escrita (`tipo: 'prueba'`, una por instrumento y
  unidad, o general con `unidad_id` null). Comparten tabla para sincronizarse
  sin tocar el esquema ni el servidor. Toda consulta de rúbricas filtra con
  `esRubrica`: sin él, un examen se abriría como una rúbrica vacía.
- **El banco de pruebas es el banco de rúbricas con `tipo: 'prueba'`.** Un
  examen del banco es una fila de `rubricas` con `instrumento_id =
  INSTRUMENTO_BANCO`, `tipo: 'prueba'` y `prueba_json` (`getBancoPruebas`,
  `guardarPruebaEnBanco`, `eliminarPruebaDelBanco`), con `area` y `nivel` de
  origen; `esRubrica` lo aparta de todo lo de rúbricas y `listarPruebas` lo
  ignora porque no cuelga de ningún instrumento vivo. Se elige y se guarda
  desde `PruebaEditor` (`BancoPruebas`, `[data-banco-pruebas]`), que es
  adonde llegan todos los caminos para definir un examen; sin examen propio y
  con alguno en el banco, el editor abre con el banco a la vista. Elegir uno
  es una **copia** al instrumento y unidad del editor, nunca un enlace, y las
  preguntas con un criterio que el instrumento no evalúa quedan en «Todos».
  Borrar un instrumento, un área o una clase deja una copia del examen en el
  banco (`conservarRubricasEnBanco`), igual que las rúbricas; el mismo examen
  en varios sitios sale una vez, por firma (`firmaPrueba`).
- **La réplica a criterios vinculados vive en `saveCalificaciones`**, no en las
  pantallas: es el único sitio por el que pasan las notas (panel de celda,
  evaluación rápida, QR). Quién va con quién lo decide `db/vinculos.ts`,
  dentro de la unidad que se califica: desde la v7 la casilla lleva la
  unidad en la clave y un vínculo de una unidad no arrastra a otra (antes se
  cerraba por transitividad entre unidades, porque la clave no la llevaba).
  Copiar notas y corregir un examen escriben con `sinVinculos`: su reparto
  ya está decidido. Nada se replica sin que el docente lo haya pedido.
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
- **Con rúbrica completa, la pasada de clase es con la rúbrica.** Si el
  instrumento tiene niveles e indicadores, `SesionInstrumento` abre
  `SesionRubrica` en vez del diario: la rúbrica entera arriba y una fila por
  alumno con sus niveles (uno en la fila marca todos los indicadores; «por
  indicador» afina). Guarda `calificaciones` con `niveles_rubrica` en todos
  los criterios del instrumento, con `sinVinculos`, como el panel de la
  casilla; no escribe en el diario, porque una rúbrica no es una observación
  fechada. Luis abrió «Evaluar hoy» en una rúbrica y se encontró una escala.
- **Desde la vista por instrumento, la nota va a todos los criterios del
  instrumento.** La casilla es «el alumno con el cuaderno» y enseña la media de
  los treinta criterios que cubre: una nota en uno solo no movía la media y
  parecía no guardarse (le pasó a Luis tras copiar una nota a toda la columna).
  `CeldaEvaluacion` con `enfoque: 'instrumento'` escribe en todos
  (`destinosNota`, `sinVinculos`) y ofrece «solo este criterio»
  (`[data-alcance-toggle]`) como excepción; la observación sigue siendo del
  criterio. Por criterio nada cambia.
- **«Todo el curso» es un resumen de solo lectura con los tres trimestres a
  la vez** (`ResumenCurso.tsx`, datos de `getResumenCurso`). El selector de
  trimestre de la barra no manda ahí —manda en las unidades—: cada criterio
  lleva 1T · 2T · 3T · Final con `calcularNotaArea` (`criterios[].trimestres`
  y `.final`, lo mismo que el boletín) y la vista por instrumento es por
  FAMILIA (instrumentos de primer nivel) y trimestre, con los hijos plegados
  dentro (`[data-familia-th]` los despliega) y la nota del área al final.
  Decisión de Luis: en el resumen solo trimestres, nunca unidades, que ya
  tienen su pestaña; cada unidad cuenta igual en la media del trimestre
  (`fundirUnidades`) y después pesan instrumento y familia. Nada se calcula
  en la pantalla: la vista por familia promedia las notas virtuales que ya
  funde `getMatrizEvaluacion` (`db/resumenCurso.ts`, puro). Pulsar una
  casilla (`[data-celda-resumen]`, con `data-criterio` o `data-instrumento` y
  `data-trimestre` 1·2·3·final) abre `ExplicacionNota` con ese trimestre, o
  la final con `trimestre: null`, nunca `CeldaEvaluacion`: la ficha desgrana
  unidad → instrumento → familia, nombra la unidad de cada nota y lleva la
  regla a la vista (`[data-explicacion-regla]`). Arranca plegado por
  competencia con su propio recuerdo (`miclase.calificador.plegadas`, clave
  `<área>:curso`; sin elección, todas) porque quince criterios por cuatro
  columnas no caben en un iPad; `[data-plegar-todas]` alterna. Las pruebas
  que quieran calificar pulsan antes una pestaña de unidad (`.tab-unidad` a
  partir de la segunda); las que miren un criterio del resumen despliegan
  antes.
- **Las cabeceras de la matriz por instrumento salen plegadas**: nombre y
  botón de calificar (en un test con clave, también «Corregir por cámara»,
  que es calificar). Tipo, peso, criterios, «Imprimir test» y «Pegar columna»
  están tras `[data-cabeceras-toggle]` (`miclase.calificador.cabeceras`);
  siguen en el DOM pero sin sitio, así que una prueba que pulse «Pegar
  columna» o «Imprimir test» despliega antes.
- **Lo que trae PROENS son familias, no instrumentos.** «Proba escrita» 80 %
  y «Táboa de indicadores» 20 % agrupan lo que el docente hace de verdad: el
  examen de cada unidad, el billete de salida, speaking, listening. Un hijo
  es un `Instrumento` con `familia_id` (sin índice), tipo y color propios, un
  **subconjunto** de los criterios de su familia en cada unidad
  (`fijarCriteriosDeHijo` lo comprueba y falla si se sale) y un `peso`
  relativo DENTRO de la familia. El cálculo normaliza por la suma, así que
  el número guardado da igual; lo que se ENSEÑA es siempre el porcentaje
  (`porcentajesEnFamilia`, resuelto una vez en `CeldaInstrumento.pct_familia`
  con todos los hermanos) y el gestor lo deja escribir directo: fijar el 60 %
  a uno reparte el 40 % entre los demás guardando su proporción
  (`pesosAlFijarPorcentaje`) y desde entonces lo guardado son porcentajes.
  Un hijo nuevo entra con el peso medio de sus hermanos. Luis veía «peso 1»
  y lo leía como 1 %. La familia entra en el área con su peso de siempre. La fusión vive en `fundirHijosEnFamilias`
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
- **El primer hijo de una familia con notas propias pregunta antes de dejarla
  sin columna.** En cuanto hay un hijo la familia solo resume, y lo que se
  calificó directamente con ella sigue contando (fundido con peso 1) pero
  desaparece como columna: Luis tenía «Proba escrita - express repaso»
  calificada, creó dentro «Prueba escrita - oficial» y esperaba dos
  columnas. `FamiliaHijos` (añadir a mano y asistente) consulta
  `datosDirectosDeFamilia` antes del PRIMER hijo y, si hay notas, diario,
  examen o rúbrica, abre `ConvertirFamilia`: convertir lo que ya hay en un
  hijo con el nombre, tipo, agregación y color de la familia, y renombrar la
  familia al genérico (`nombreGenericoDeFamilia`: lo que va antes del guion,
  o la etiqueta del tipo). `convertirFamiliaEnHijo` (`queries.ts`) cambia el
  `instrumento_id` de `calificaciones`, `diario` y `rubricas` en la misma
  fila con `updated_at` nuevo (viajan en el siguiente sync, sin duplicar
  casillas) y COPIA las filas de `criterio_instrumentos`, porque la familia
  sigue siendo el techo de sus hijos y lo que la programación asigna. Nada se
  convierte sin pulsar «Convertir»: «Seguir sin convertir» deja todo como
  está. La nota del área no cambia: un solo hijo con peso 1 funde igual que
  la nota directa.
- **Con hijos ya dentro, lo que la familia guarda a su nombre se mueve, no se
  pierde de vista.** `convertirFamiliaEnHijo` solo se ofrece antes del primer
  hijo; a Luis no le valió porque «Examen · A nosa saúde» ya existía cuando
  definió el test y corrigió por cámara con la familia «Proba escrita»: la
  columna del hijo decía «Definir y corregir» y el examen no salía en ninguna.
  `getMatrizEvaluacion` cuenta eso en `familiasConDatosEscondidos` y la vista
  por instrumento lo avisa (`[data-familias-escondidas]`, con botón al
  gestor); `FamiliaHijos` enseña la franja `[data-familia-escondidos]` con
  «Mover» a un hijo existente o uno nuevo. La franja va **por bloques de
  unidad y día de anotación** (`db/bloquesFamilia.ts`, puro:
  `agruparEnBloques`, `enBloque`; `bloquesDirectosDeFamilia` en `queries.ts`
  le pone el nombre de la unidad), cada uno con su destino
  (`[data-bloque-escondido]` con `data-unidad-id` y `data-dia`), porque un
  total no deja decidir: el examen del express de una unidad y las notas de
  otra puestas otro día van a hijos distintos. La fecha es la de anotación
  en ese aparato (nota: `fecha`; diario: `fecha`; examen: `created_at`) y
  el día es el local, no el UTC. El destino sugerido es el hijo que ya cubre
  esa unidad con alguno de los criterios del bloque. `moverDatosDeFamiliaAHijo`,
  `conflictosAlMover` y `convertirFamiliaEnHijo` aceptan `bloque` y entonces
  solo tocan esa unidad y ese día; sin él, todo. `moverDatosDeFamiliaAHijo`
  cambia el `instrumento_id` en la misma fila, no pisa una casilla que el
  hijo ya tenga con nota, solo sustituye un examen de la misma unidad o la
  rúbrica del hijo si el docente acepta (`conflictosAlMover` se consulta
  antes) y amplía los criterios del hijo con los que nombran las notas
  movidas, dentro de los de la familia. Lo que no se mueve se cuenta en
  `noMovidos` y se dice.
- **La familia de un hijo la decide el docente, no el tipo.** Un examen
  puede contar en el 20 % diario («Táboa de indicadores») si así trabaja
  Luis: la prueba escrita oficial va en su familia y las de cotejo en la
  otra. Cada fila de hijo lleva el selector `[data-hijo-familia]`;
  `previsualizarCambioDeFamilia` dice qué criterios tendrá que añadir la
  familia nueva y con qué peso entra, y `cambiarFamiliaDeHijo` (`queries.ts`)
  solo cambia `familia_id`, peso (el medio de los nuevos hermanos), orden y
  trimestres: notas, diario, examen y rúbrica siguen con el id del hijo, así
  que nada se mueve ni se pierde, solo cambia con qué familia se funde. La
  familia nueva AMPLÍA su `criterio_instrumentos` con los del hijo que no
  evaluaba, porque sigue siendo el techo de sus hijos. Nada sin aceptar el
  `confirm`. Cada `FamiliaHijos` relee cuando el gestor recarga (depende del
  objeto `familia`, no solo de su id): si no, el bloque de destino no
  enseñaba al recién llegado.
- **Una columna se vacía o se mueve por unidad y trimestre, nunca entera.**
  En la cabecera de la vista por instrumento (plegado tras
  `[data-cabeceras-toggle]`, solo dentro de una unidad) van «Vaciar columna»
  (`[data-vaciar-columna]`) y «Mover a otro instrumento»
  (`[data-mover-columna]`, diálogo `MoverColumna` con vista previa). Las dos
  actúan SOLO sobre la unidad y el trimestre que se miran —la casilla lleva
  alumno, instrumento, criterio, trimestre y unidad— y pasan por
  `queries.ts`: `contarColumna` (para que el `confirm` diga cifras),
  `vaciarColumna`, `deshacerVaciado` y `moverColumna` (con `simular` para la
  vista previa). Vaciar no borra la nota: la casilla sigue viva, sin `valor`,
  con la nota como fantasma (`valor_anterior`, `MOTIVO_COLUMNA_VACIADA`),
  sin respuestas de examen (`niveles_rubrica`, porque con ellas el corrector
  seguiría dando al alumno por corregido) y con `origen` null; los registros
  del diario llevan `deleted_at`. «Deshacer» (`[data-vaciado-deshacer]`)
  restaura todo mientras la pantalla siga abierta; después queda el fantasma
  casilla a casilla. Mover cambia `instrumento_id` en la MISMA fila con
  `updated_at` nuevo, como `moverDatosDeFamiliaAHijo`, y solo a criterios
  que el destino evalúa en esa unidad según `criterio_instrumentos`; lo que
  no encaja (criterio sin destino, casilla del destino ya con nota, registro
  sin criterio común) se queda y se cuenta en `noMovidos`. El diario movido
  recorta `criterios_json` al destino y se vuelve a derivar en los dos lados.
  El examen y la rúbrica del origen no se mueven. Luis puso una prueba del
  20 % en la columna de la familia del 80 % y no podía ni quitarla ni moverla.
- **Un criterio se asocia a la columna desde su propia cabecera.** Con las
  cabeceras desplegadas, la lista de criterios lleva una «×» por criterio
  (`[data-criterio-chip]` + `[data-criterio-quitar]`, con `confirm`) y un
  selector «+ criterio» (`[data-criterio-anadir]`) con los de la unidad que
  aún no evalúa. Escriben lo mismo que 📋 Programación
  (`asignarCriterioAColumna` / `quitarCriterioDeColumna` en `queries.ts`,
  sobre `criterio_instrumentos`, solo en esa unidad): en un hijo pasan por
  `fijarCriteriosDeHijo` y, si la familia no lo evaluaba, se le asigna antes;
  quitar de una familia lo quita también de sus hijos. Las notas se conservan.
  Quien necesite la lista de criterios de una columna la lee de
  `data-criterios` en el `<th>` (ids separados por espacio), nunca del texto
  de la cabecera, que ahora lleva botones. Luis quería asociar un criterio en
  la columna de la prueba escrita y no podía.
- **Borrar un instrumento es de toda el área, y el gestor lo dice con cifras.**
  `usoDeInstrumento` cuenta, con los hijos, en cuántas unidades lo asigna la
  programación y cuántas notas y registros guarda; el gestor lo enseña junto a
  cada familia (`[data-uso-instrumento]`) y cada hijo (`[data-uso-hijo]`), y
  el `confirm` de «×» dice «se retira de TODAS las unidades (N unidades · M
  notas)» y que las notas quedan guardadas pero sin columna. Para quitarlo de
  una sola unidad está «Retirar de una unidad» (`[data-retirar-unidad]`,
  `retirarInstrumentoDeUnidad`): retira sus filas de `criterio_instrumentos`
  en esa unidad (y las de sus hijos) sin tocar el instrumento ni las notas;
  en un hijo basta con desmarcar sus criterios en esa unidad. Luis veía «×» y
  no sabía si borraba de una unidad o de todas.
- **El color identifica al instrumento, no a su tipo.** Ocho tonos de
  Okabe-Ito (`PALETA_INSTRUMENTOS`), propio (`Instrumento.color`) o por orden
  entre iguales (`colorDeInstrumento`), resueltos una vez en
  `getMatrizEvaluacion` (`CeldaInstrumento.color`). Nunca es la única pista:
  al lado va siempre la abreviatura (`abreviatura`). Los colores del tipo
  (`TIPOS_INSTRUMENTO`) quedan para iconos y fondos del gestor.
- **El Calificador abre por instrumento** en cuanto el área tiene alguno, salvo
  elección guardada en `localStorage` (`miclase.calificador.vista`). La primera
  vez por área sale la tarjeta `PresentacionCalificador` (cuatro pasos y las
  familias con lo que hay dentro), que se recuerda en
  `miclase.calificador.presentado`. Las pruebas que miran la matriz LOMLOE
  pulsan antes `[data-vista="criterios"]`.
- **Pegar una columna de Excel** (`PegarColumna` + `utils/pegarNotas.ts`,
  puro) asigna por orden de lista si no hay nombres y por nombre si los hay
  —dos palabras o más, nunca una—; lo que no casa se señala y no se asigna.
  Valores por encima de 10 convierten toda la columna a escala 0-100. Guarda
  en todos los criterios del instrumento con `sinVinculos`, como «Evaluar hoy».
- **Importar el CSV de Edixgal** (`ImportarMoodle` + `utils/importarMoodle.ts`,
  puro) reutiliza el casado por nombre de `pegarNotas.ts` (`casaNombre`, en las
  dos direcciones: Moodle trae nombre y apellidos en columnas separadas y a
  veces un segundo nombre que la lista no tiene). Las columnas de datos
  (número de ID, institución, correo, total del curso, última descarga) no
  son notas; el resto son ítems que el docente asigna columna a columna a un
  instrumento, y lo no asignado se ignora. La escala 0-100 se decide por
  columna, salvo que la cabecera declare el máximo («Cualificación/10,00»,
  «P. 1 /0,24»: el informe de un cuestionario), que manda. Luis solo usa
  cuestionarios de Edixgal, nunca el libro completo. Las columnas por
  pregunta —puntuación «P. 1» o texto «Resposta 1» del informe de
  respuestas— se reconocen (`pregunta`) y salen plegadas; la fila «Media
  xeral» no es nadie. **Del cuestionario se importa solo la nota ya
  evaluada («Cualificación»), nunca pregunta a pregunta**: decisión de
  Luis, el cuaderno es para calificar y el valor de cada respuesta ya está
  contado en esa nota. Guarda como «Pegar columna» y termina con un
  resumen: guardadas, alumnos sin encontrar, columnas ignoradas. Fixtures:
  `edixgal_calificacions.csv` (libro de calificaciones, a mano) y
  `edixgal_cuestionario.tsv` (cabecera real de Luis, alumnos inventados:
  no hay CSV real por la LOPD).
- **En el panel de la casilla, el instrumento es lo primero y lo grande.**
  Orden fijo de `CeldaEvaluacion`: franja del instrumento con la nota,
  selector solo si hay varios, y el instrumento en sí (examen, rúbrica o
  diario con los cuatro niveles ya a la vista). Todo lo demás —criterio
  entero, otros criterios, copiar o vincular, observación, evidencias,
  ajustes— va plegado en «Más» (`[data-mas-toggle]`), que las pruebas abren
  con `abrirMas()` tras esperar el panel. Decisión de Luis: la docente
  evalúa con prisa y la rúbrica no puede quedar detrás de una maraña de datos.
- **La PWA se actualiza sola** cuando no hay nada a medias que perder
  (`ActualizacionApp`): en los primeros 20 s tras abrir y al volver del
  segundo plano; entre medias, aviso con «Actualizar». `registerType:
  'prompt'` e `injectRegister: false`: el registro lo hace el componente.
- **Plegado por competencia y cobertura** (`db/cobertura.ts`, puro): la vista
  por criterio lleva una fila CE1 · CE2 · CE3 que pliega sus criterios a una
  columna con la media simple del alumno (se recuerda por área en
  `miclase.calificador.plegadas`); el panel de cobertura usa la misma
  `notaCelda` que pinta la casilla, para que nunca discrepen.
- **En un examen, lo no anotado vale cero; en una rúbrica, no cuenta.**
  `notaDePrueba` (`db/prueba.ts`) divide entre todos los puntos del examen;
  `notaDeRubrica` promedia solo lo observado. En el reparto por criterios solo
  reciben nota los criterios que alguna pregunta nombra y que la programación
  asigna al instrumento.
- **La planilla de corrección va dentro del examen, pregunta a pregunta.**
  `PreguntaPrueba.clave` (la respuesta esperada: «1-d · 2-e · 3-a») y
  `PreguntaPrueba.correccion` (cómo se reparten los puntos: «completo 0,25 ·
  parcial 0,1») son texto libre dentro de `prueba_json`, sin índice ni cambio
  de esquema, y no cuentan para la nota: el docente la pone mirándolas.
  `CorregirPrueba` las enseña bajo cada pregunta (`[data-pregunta-clave]`,
  `[data-pregunta-correccion]`); el editor las edita en dos columnas tras
  `[data-planilla-toggle]`, abiertas solas si el examen las trae. Entran por
  las tres vías de importar (columnas «Clave» y «Corrección» en tabla, «Clave:»
  y «Corrección:» bajo la pregunta en el examen escrito, y en JSON) y por el
  bloque de IA del editor, que en un examen de puntos o niveles no genera nada:
  `generarPromptPlanilla` pide a la IA ordenar el examen que el docente ya
  tiene como tabla, y `pruebaDeTexto` lee lo pegado sea tabla, examen o JSON.
  La planilla real de Luis no trae columna «Pregunta» —solo «N.º», «Clave»,
  «Puntuación e indicadores» y «Máx.»—: `pruebaDeFilas` acepta «N.º» como
  cabecera, no confunde «Puntuación e indicadores» con los puntos ni «Criterios
  de corrección» con el criterio, y una letra sola en «Clave» sigue siendo la
  correcta de un test.
- **La planilla con rúbrica por pregunta es la forma oficial de corregir una
  prueba escrita** (`CORRECCION_PRUEBAS.md`). `PreguntaPrueba.niveles`
  (puntos y texto, de más a menos) y `.notas` van dentro de `prueba_json`,
  sin índice ni esquema. `pruebaDeFilas` lee el fichero de Luis tal cual:
  «Ítem» como número, «Columna» como nombre (quitando «CA2.1 · » y «(/1)»),
  «Máximo» como puntos y entonces «Puntuación» es el reparto (no los
  puntos), «Resposta correcta / clave» en gallego, «Nivel 1…6» con
  `nivelCorreccionDe` («0,75 pt · texto»; «Non procede» no es un nivel) y
  «Notas de corrección» aparte. Entra por `.csv` (`filasDeCsv`) y por
  `.xlsx` probando hoja a hoja (`leerXlsxHojas`): la planilla va detrás de
  la plantilla de iDoceo con el alumnado. El corrector enseña los niveles
  como botones (`[data-pregunta-niveles]`) y, sin niveles, los escalones de
  `escalonesDePregunta` (puro: la cifra más pequeña del reparto que divide
  el máximo hasta en diez, o las combinaciones de apartados que suman el
  máximo); nada de eso cambia la nota, que sigue en `notaDePrueba`.
  `generarPromptPlanilla` pide exactamente esa tabla. **Sin criterios en el
  fichero, la nota va a todos los del instrumento** (reparto único); con un
  criterio que el instrumento no evalúa en la unidad, el editor lo señala
  en `[data-reasignar-criterios]` y el docente elige, por criterio y de una
  vez, adónde van sus preguntas (`reasignarCriterio`, puro): a uno de los
  que sí evalúa o a todos. Decisión de Luis: la prueba asocia su resultado
  a los criterios del instrumento salvo que el fichero diga otra cosa, y si
  no coinciden se elige del listado, no se pierde la nota en silencio.
- **Nada de examen falla en silencio.** `ExamenesConHoja` recoge cualquier
  error al listar, abrir el editor o el corrector y lo pone en
  `[data-examenes-aviso]`; `PruebaEditor` dice si no pudo leer el examen
  guardado; y `BarreraErrores` (en `main.tsx`, por fuera de todo) enseña el
  error con «Recargar» y «Copiar» en vez de dejar la pantalla en blanco. Luis
  creó exámenes en el iPad y «no se abría el diálogo» sin ninguna pista; no se
  pudo reproducir en Chromium, así que lo primero fue que el fallo se vea.
- **Un test con clave lleva `opciones` y `correcta` por pregunta** (`PreguntaPrueba`,
  solo `tipo: 'test'`; `normalizarPrueba` las descarta en otro tipo y nunca
  convierte un `correcta: null` en 0). `respuestaDeMarca` traduce la letra
  marcada a `ACIERTO`/`FALLO`/`EN_BLANCO`: la corrección por cámara guardará
  lo mismo que la de a mano. Se importa además como examen escrito
  (`pruebaDeExamenMarkdown`: «1. …», «a) …», correcta con `*`, negrita,
  `[x]` o «Respuestas: 1-b»), que es lo que devuelve la IA con
  `generarPromptTest` (`ia/pruebaPrompt.ts`) desde el editor; `examenAMarkdown`
  exporta el examen del alumnado sin la clave.
- **La hoja de respuestas se dibuja en milímetros desde `db/hojaOMR.ts`**, y
  esa geometría es el contrato con el escáner: cuatro marcas de 10 mm en las
  esquinas, QR de 34 mm arriba a la derecha con `MCT1|prueba_id|alumno_id|n|k`
  (`payloadHoja`/`leerPayloadHoja`, con versión), burbujas de 5 mm a paso de
  8 mm en dos columnas de 25. Hasta 50 preguntas × 5 opciones. `informes/hojasTest.ts`
  genera las hojas (una página por alumno) y el examen del alumnado;
  `ImprimirTest` las imprime desde la columna del examen («🖨 Imprimir test»,
  solo con clave completa y plegado tras `[data-cabeceras-toggle]`).
- **«Exámenes y pruebas de evaluación» es una cámara para dos códigos** (`EscanearPage`):
  el QR de mesa abre la evaluación rápida del alumno y el QR de una hoja de
  respuestas (`leerPayloadHoja`) abre el corrector de ese examen, resolviendo
  clase, área, unidad e instrumento desde el id del examen
  (`resolverContextoExamen` en `ExamenesConHoja.tsx`, que reutiliza
  `getMatrizEvaluacion` + `columnasPorInstrumento` para que los criterios sean
  los mismos que en el Calificador). La misma pantalla lista todos los
  exámenes del docente (`listarPruebas`) con imprimir, corregir y «Nuevo
  examen» (clase → área → unidad → instrumento de prueba escrita → el
  `PruebaEditor` de siempre). Luis no encontraba el corrector porque solo
  vivía en la cabecera de la columna del examen, dentro de una unidad y con
  el examen ya definido. También entra por URL: `/escanear?c=MCT1|…`.
- **El escáner de hojas vive en el aparato** (`utils/lectorHoja.ts`, puro salvo
  jsQR): marcas por manchas macizas no pegadas al borde (relleno de caja
  > 0,74, que aguanta ~15° de giro y deja fuera los patrones del QR), una por
  esquina de la foto; homografía mm → px con las cuatro; el QR se recorta
  enderezado; cada burbuja se mide contra el papel de su alrededor
  (oscuridad relativa: marcada ≥ 0,4, duda entre 0,22 y 0,4, y dos oscuras =
  duda). Si el QR no se lee se prueban las cuatro orientaciones. `EscanerHojas`
  («📷 Corregir por cámara» en la columna del examen) congela la foto, pinta
  lo leído, deja corregir con el dedo y guarda por `guardarExamenDeAlumno`:
  igual que a mano. Se prueba en `hoja-escaner.test.mjs` con la hoja de la
  app «fotografiada» girada, del revés y apaisada sobre fondo oscuro; con
  cámara real no se ha probado todavía.
- **Un examen se guarda con `guardarExamenDeAlumno`** (`queries.ts`), nunca
  montando las notas en la pantalla: se corrige desde el panel de la casilla y
  desde la evaluación rápida, y las dos tienen que repartir igual. Cambiar un
  examen ya corregido ofrece `recalcularNotasDeExamen`; no se hace sin preguntar.
- **Un examen se mueve, no se duplica, y mover no mueve notas.** `PruebaEditor`
  lleva siempre el destino a la vista (`[data-destino-examen]`: selectores
  «Instrumento del examen» y «Unidad del examen», con «Todas las unidades» como
  general) y necesita `asignaturaId` para listar adónde se puede mover. Cambiar
  el destino y guardar llama a `guardarPrueba(…, { mover: id })`, que cambia
  `instrumento_id`/`unidad_id` en la MISMA fila con `updated_at` nuevo (viaja
  en el sync sin duplicar) y retira el examen que hubiera en el destino solo
  tras el `confirm`. Las correcciones ya hechas se quedan con el instrumento
  y la unidad de origen —son notas, y cambiar la programación no las borra—;
  el editor lo pregunta si había corregidos y lo dice al guardar. Con otro
  destino, los criterios de las preguntas son los que ESE instrumento evalúa
  en ESA unidad (`criteriosQueEvalua`). La cabecera de la columna del examen
  abre el editor directo con `[data-editar-examen]` (plegado tras
  `[data-cabeceras-toggle]`), además de «Editar» en «Exámenes y pruebas de evaluación».
- **Un examen puede contar en varias unidades, y la lista vive en el examen.**
  `PruebaDef.unidades_vinculadas` (dentro de `prueba_json`, sin índice ni
  esquema; `unidadesDelExamen` en `db/prueba.ts`, puro) dice en qué otras
  unidades cuenta el examen de una unidad: Luis hace en la UD2 un examen
  que recoge también lo de la UD1. Se marca en el editor («También cuenta
  en», `[data-unidades-vinculadas]`, solo en un examen de unidad; el general
  no vincula nada y `guardarPrueba` quita siempre la unidad propia).
  `getPrueba` resuelve el examen de una unidad en este orden: el suyo, el
  de otra que la vincula, el general; la matriz lo dice en la cabecera
  («examen de «UD2»», `CeldaInstrumento.prueba_de_unidad`). Vincular no
  pone notas: las pone `guardarExamenDeAlumno`, que tras escribir en la
  unidad desde la que se corrige escribe la MISMA corrección en las demás
  del examen, cada una con los criterios que el instrumento evalúa allí
  (`criteriosQueEvalua`), con `sinVinculos` y en el mismo trimestre —la
  casilla lleva el trimestre de la barra, no el de la unidad; replicar con
  el de la unidad dejó la otra unidad en blanco—; devuelve `tambien` y las
  pantallas lo dicen. Se corrige desde cualquiera de las unidades. Una
  unidad con examen propio manda el suyo y el vínculo ajeno no le entra.
  `correccionesDeExamen` cuenta las correcciones de todas las unidades del
  examen (y una unidad cubierta por vínculo no cae al general), así el
  recálculo y el informe ven la misma corrección una vez por alumno.
- **En un examen que cuenta en varias unidades, cada pregunta puede decir
  de cuál es.** `PreguntaPrueba.unidad_id` (opcional, dentro de
  `prueba_json`, sin índice ni esquema) y `pruebaDeUnidad(def, unidad)`
  (`db/prueba.ts`, puro): el examen tal como cuenta en una unidad, con sus
  preguntas y las que no dicen unidad. **Una pregunta sin unidad cuenta en
  todas** (decisión de Luis, nov 2026), así que un examen sin etiquetas da
  exactamente las notas de siempre. `guardarExamenDeAlumno` y
  `recalcularNotasDeExamen` pasan el examen por `pruebaDeUnidad` antes de
  `notaDePrueba`, unidad a unidad: un alumno puede suspender la UD1 y aprobar
  la UD2 con el mismo examen. Las RESPUESTAS se siguen guardando enteras en
  todas las unidades (el examen es uno y se corrige desde cualquiera). Una
  unidad que se queda sin ninguna pregunta no recibe nota ni se le borra la
  que tuviera, y el editor lo avisa (`[data-unidad-sin-preguntas]`). La
  columna «Unidad» del editor (`[data-pregunta-unidad]`) solo sale con otra
  unidad vinculada; desvincular una devuelve sus preguntas a «Todas»
  (`sinUnidadesAjenas`, también en `guardarPrueba` y al cargar del banco,
  donde los ids son de otra clase). El corrector marca las preguntas de otra
  unidad (`[data-pregunta-otra-unidad]`) y el aviso «también en…» dice la
  nota de cada unidad si es distinta (`UnidadTambienCorregida.nota`). El
  examen general no reparte por unidad. **Un aparato sin actualizar ignora
  la etiqueta al leer y la borra si vuelve a guardar el examen**
  (`normalizarPrueba` antiguo): hay que actualizar todos antes de usarlo.
  **La unidad de cada pregunta viaja por su nombre**, porque el id solo vale
  en el aparato: `filasDePrueba`, `examenAMarkdown` y `pruebaAJson` reciben
  las unidades del área y escriben «Unidad» (columna, línea «Unidad: …» o
  campo `unidad`; «Todas» en la común), y al leer queda en
  `PreguntaPrueba.unidad_texto`, que es solo de paso: `casarUnidades`
  (`db/prueba.ts`, puro) lo convierte en `unidad_id` con `unidadDeTexto`
  —nombre, número escrito («UD2») o un trozo que solo quepa en una; nunca
  por orden—, deja vinculada la unidad que el fichero nombra y el examen no
  vinculaba, quita los ids que no son del área y dice lo que no casa (esas
  preguntas cuentan en todas). El editor lo aplica en las dos entradas
  (fichero y texto pegado) y lo cuenta en el mensaje; `sinUnidadesAjenas`
  borra el texto de paso al guardar. Los prompts (`generarPromptTest`,
  `generarPromptPlanilla`) piden la unidad solo con dos o más. El informe de
  la prueba (`InformePrueba`) lleva `[data-informe-unidad]` cuando el examen
  reparte por unidad: «Todo el examen» o solo una, con `pruebaDeUnidad`; los
  criterios son los de la unidad desde la que se abrió.
- **Rediseño del Calificador, fase 1** (`PROPUESTA_UX_CALIFICADOR.html`, nov
  2026). (1) **Vocabulario a la vista del docente**: lo que trae la
  programación con su porcentaje es un **«instrumento»** y lo que hay dentro
  es una **«actividad»**; «familia» e «hijo» quedan solo en el código, los
  datos (`familia_id`) y estas notas. Decisión de Luis. Un texto nuevo no
  debe decir «familia» ni «hijo» al docente. (2) **El semáforo de notas
  cumple 4,5:1** con texto blanco (`--cal-*` en `index.css`: Notable
  `#1f6fa5`, Bien `#6f52a0`, Suficiente `#a85a00`, Insuficiente `#c0302f`;
  antes cuatro de los cinco no llegaban). (3) **Lo que se toca mide 44 px**:
  pestañas, acciones de columna, conmutadores, casillas, cerrar y las flechas
  del panel, que ahora se llaman «Alumno anterior» y «Alumno siguiente»
  (`aria-label`). El orquestador de pruebas enseña más líneas de una suite
  fallida con `LINEAS=400`.
- **Rediseño del Calificador, fase 2** (nov 2026). Sustituye a lo que otras
  notas de este fichero dicen de pestañas y cabeceras: **(A) no hay filas de
  pestañas.** El área se elige en la barra de la clase (`BarraClase`, que ya
  no la esconde en `/evaluacion`) y la unidad en un selector
  (`[data-unidad-select]`: la primera opción es «Todo el curso»); las clases
  `.tab-area` y `.tab-unidad`, `[data-unidades-modo]` y `[data-unidad-actual]`
  ya no existen. Las pruebas eligen unidad con `elegirUnidad(p, n)` de
  `pruebas/lib/entorno.mjs` (0 = «Todo el curso») y leen la elegida con
  `unidadElegida(p)`. Los avisos de la programación (criterios sin
  instrumento, instrumentos sin criterio en la unidad, datos escondidos,
  fuera de trimestre) van tras un contador, `[data-avisos-toggle]`, cerrado
  al entrar; `[data-columna-aviso]` (lo que acaba de pasar con una columna)
  sigue a la vista. **(C) una acción principal por columna** y un «Más»
  propio (`[data-columna-mas]`) que despliega solo esa columna: cámara,
  examen, informe, pegar, mover, vaciar, criterios y «Definir herramienta».
  «Más en todas» es el `[data-cabeceras-toggle]` de siempre. Una prueba que
  pulse una acción secundaria abre antes el «Más» de su columna. **(B)
  «Calificar» en una columna sin examen ni rúbrica que no es de observación**
  (`[data-nota-abrir]`) abre `SesionNota` (`[data-nota-directa]`): la clase
  en una lista con cinco calificativos de nota fija —IN 3 · SU 5 · BI 6 ·
  NT 7,5 · SB 9,5, decisión de Luis— y una casilla de nota exacta; cada
  pulsación guarda en todos los criterios de la columna (`sinVinculos`, como
  «Pegar columna») y pasa al siguiente; repetir el calificativo quita la
  nota y «Deshacer» devuelve a cada criterio lo que tenía. No finge una
  herramienta: lo dice (`[data-sin-herramienta]`) y ofrece definirla. Con
  examen sigue abriéndose el corrector y con rúbrica o diario, su pasada.
- **Rediseño del Calificador, fase 3: la app pregunta con su propio
  diálogo** (nov 2026). `utils/confirmar.tsx`: `await confirmar(…)` y
  `await avisar(…)` sustituyen a `confirm()` y `alert()` del navegador en
  toda la app (no queda ninguno fuera de AulaMap, que es código ajeno). Con
  una cadena, el primer párrafo es la pregunta; con un objeto se da el verbo
  del botón (`aceptar`), el de cancelar y `peligro` para lo que borra. Se
  monta solo por encima de cualquier diálogo (`[data-confirmar]`), Esc
  cancela sin cerrar lo de debajo y devuelve el foco. **Un `confirm()` nuevo
  es un error**: no deja poner el verbo y las pruebas no lo aceptan igual.
  Como es asíncrono, quien pregunta es `async` y una casilla que pregunta al
  marcarse cambia al aceptar, no al pulsar. Las pruebas llaman a
  `aceptarConfirmaciones(p, alVer?)` de `pruebas/lib/entorno.mjs` ANTES de
  navegar (acepta sola cada pregunta y entrega su texto) y a
  `rechazarSiguienteConfirmacion(p)` para cancelar una.
- **Piezas comunes y foco retenido** (cierre de la fase 3, nov 2026).
  `components/comunes/`: `Boton` (variantes primario, secundario, peligro y
  enlace; 44 px), `Dialogo` (velo, título, cerrar, Esc, pie; los `data-…`
  van a la tarjeta) y `Pestanas` (`tablist`/`tab`, flechas, Inicio y Fin;
  aspectos `area` y `unidad`). Usan las clases de siempre (`.btn-primary`,
  `.modal-overlay`, `.tab-area`, `.tab-unidad`), así que lo escrito antes
  sigue valiendo; **lo nuevo se hace con ellas** y lo viejo se pasa cuando se
  toque. Ya las usan `confirmar`, `AnalisisAlumno`, las pestañas de la clase
  y las de Seguimiento, que ahora son `role="tab"`: las pruebas las buscan
  con `getByRole('tab', …)`. El foco lo retiene `utils/foco.ts`
  (`instalarFoco()` en `main.tsx`) para TODO lo que lleve `.modal-overlay`,
  sin tocar cada diálogo: manda el último velo visible del documento, al
  abrirse se lleva el foco a la tarjeta (no a un campo: en el iPad abriría
  el teclado) salvo que el diálogo ya lo haya puesto dentro, el tabulador da
  la vuelta y al cerrar vuelve a quien abrió. Un diálogo nuevo que no lleve
  `.modal-overlay` se queda sin nada de esto.
- **El «Más» de una columna es una hoja que sube desde abajo** (nov 2026;
  sustituye a lo que la fase 2 (C) dice de «despliega solo esa columna»).
  `[data-columna-mas]` abre `[data-hoja-columna]` (portal a `body`, con
  `.modal-overlay` para el foco): tipo y peso, criterios con su «×» y
  «+ criterio», y las acciones secundarias como botones grandes
  (`button.hoja-accion`, con los mismos `data-…` de siempre). Pulsar una
  acción cierra la hoja; Esc y pulsar fuera, también. Luis la eligió por ser
  lo más cómodo en tablet: la cabecera ya no crece ni empuja la lista. Los
  detalles siguen ADEMÁS en la cabecera, sin sitio mientras está plegada
  (`.instr-th-detalle`), y `[data-cabeceras-toggle]` («Más en todas») los
  enseña ahí como antes; con él activo el «Más» de columna se desactiva. Una
  prueba que abra la hoja busca la acción dentro de `[data-hoja-columna]`,
  no en el `<th>`: con la hoja abierta el mismo `data-…` está dos veces.
- **El corrector por cámara vuelve solo a la cámara tras «Guardar y
  siguiente»** y dice qué guardó (`[data-escaner-guardada]`: alumno, nota y
  «Enseña la hoja siguiente», o que ya están todas). Corrigiendo a mano no
  se avanza solo: decisión de Luis (nov 2026).
- **El análisis de un alumno lo compara con su grupo y no calcula ninguna
  nota.** `db/analisisAlumno.ts` y `db/estadistica.ts` (puros,
  `analisis-alumno.test.ts`) parten de las `NotaArea` de toda la clase que
  ya da `getResumenCurso` y de las respuestas de cada examen
  (`examenesDeArea` en `queries.ts`): por área, por familia de instrumentos
  y por criterio, la nota del alumno junto a media, mediana y moda del
  grupo; sus puntos débiles (suspenso, o un punto o más bajo la mediana) y
  fuertes; y en cada examen, las preguntas que él falló (< 50 %) y la
  mayoría acertó (≥ 60 %), con `informeDePrueba`. Decisiones de Luis (nov
  2026): la **moda va sobre el calificativo** (IN·SU·BI·NT·SB), no sobre la
  nota, que con decimales no se repite; y la nota de un criterio
  **adaptado (ACI) no entra** en la estadística del grupo de ese criterio ni
  se compara ahí, siempre, con NEAE a la vista o no. La pantalla es
  `AnalisisAlumno` (`[data-analisis-alumno]`), desde Seguimiento → «Por
  alumno» (`[data-analisis-abrir]` en el nombre) y desde la ficha; es del
  docente y enseña todas las cifras. El documento
  (`informes/analisisAlumno.ts`, Lámina, por `imprimir`) lleva nombre y
  **no da cifras del grupo con menos de `MINIMO_GRUPO` (5) notas**: de tres
  se deducen las de los compañeros. El informe de una prueba sigue siendo
  del grupo y sin nombres.
- **El informe de una prueba se calcula entero en el aparato y es del grupo,
  no de nadie.** `db/informePrueba.ts` (puro, `informe-prueba.test.ts`)
  recibe la definición y las respuestas que ya guarda cada nota
  (`respuestasDeExamen` en `queries.ts`, sobre `correccionesDeExamen`) y da:
  por pregunta, aciertos, fallos y en blanco (test) o puntos medios (puntos y
  niveles), con un índice de acierto 0-100 común; el orden por dificultad;
  la nota media por criterio con `notaDePrueba`, la misma que puso la nota al
  alumno; y los **ejes** del radial, que son los aspectos si alguna pregunta
  trae `PreguntaPrueba.aspecto` (texto libre, sin índice, dentro del JSON;
  columna «Aspecto» en el editor tras `[data-aspectos-toggle]`, y en xlsx,
  md y json) y si no los criterios. La lectura es heurística (`redactar`):
  reglas fijas sobre los porcentajes, cada frase comprobable en la tabla;
  nada de IA. El gráfico es `radialSVG`, SVG puro sin librerías (barras con
  menos de tres ejes). El documento (`informes/informePrueba.ts`, Lámina) no
  lleva nombres de alumnos y sale por `imprimir`/`descargarHTML`. Se abre
  desde la cabecera de la columna (`[data-informe-abrir]`, plegado) y desde
  «Exámenes y pruebas de evaluación» (`[data-examen-informe]`), en `InformePrueba`.
- **Una nota puesta no se pierde nunca por un recálculo.** La que cambia —o la
  que se queda sin nota— deja su valor como fantasma en
  `Calificacion.valor_anterior`: a la vista (columna duplicada y
  semitranslúcida en la matriz), sin contar —todo el cálculo lee `valor`— y
  recuperable desde el panel de la casilla. Decisión expresa de Luis: retirar
  la nota sin más, aunque fuera coherente, no es aceptable.
- **Las unidades son estancas** (esquema v7). La casilla se identifica por
  alumno, instrumento, criterio, trimestre **y unidad** (índice compuesto de
  `calificaciones` y `diario`): el mismo criterio con el mismo instrumento
  en la UD3 y la UD4 del trimestre son dos notas. Luis anotaba en una y
  aparecía en la otra. Consecuencias que no hay que romper: (1) toda escritura
  lleva `unidad_id` numérico (`saveCalificaciones` y `anadirRegistro` fallan
  sin él; IndexedDB no indexa una fila con la unidad en blanco); un área sin
  unidades califica en el cajón `SIN_UNIDAD` (0) vía `claveUnidad`. (2) «Todo
  el curso» funde las unidades por casilla con `fundirUnidades`
  (`calculo.ts`): media simple, cada unidad cuenta igual, y `calcularNotaArea`
  la aplica ANTES de ponderar por instrumento y familia, porque si no un
  instrumento con nota en dos unidades pesaría el doble y el 20/80 de la
  programación dejaría de cumplirse. (3) Las filas sin unidad —copias
  anteriores a la v7, paquetes de un aparato sin actualizar— reciben la suya
  con la regla pura de `db/migracionUnidades.ts` (la que ya traen; si no, la
  unidad del trimestre que programa ese criterio con ese instrumento; si no,
  la única; si no, la primera; si el área no tiene unidades, `SIN_UNIDAD`),
  en el `upgrade()`, en `importarDatos` y en `asignarUnidadesPendientes` tras
  cada sync. (4) La migración no abre la base sin más: `PuertaMigracion`
  (delante de `App` en `main.tsx`) detecta la versión instalada sin disparar
  el upgrade, exporta una copia `.miclase` cifrada desde una instancia
  `new MiClaseDB(versionInstalada)` y solo después deja abrir; el Inicio
  enseña `AvisoMigracionUnidades` con el resumen que dejó el upgrade en
  `localStorage`. Un aparato con la versión anterior que sincronice puede
  retirar notas que el nuevo ya distingue: hay que actualizar todos antes
  de volver a calificar, y así lo dicen la puerta y el aviso.
- **Las unidades de un trimestre cuentan igual salvo que el área diga otra
  cosa.** `Asignatura.regla_unidades` (sin índice; `REGLAS_UNIDADES`,
  `normalizarReglaUnidades`): `iguales` (por defecto, lo de siempre) o `peso`,
  que pondera cada unidad por `Unidad.peso`, el «% Peso» de PROENS.
  `pesosDeUnidades(regla, unidades)` (`calculo.ts`, puro) da los pesos o
  `undefined` si cuentan igual, y `fundirUnidades(cals, pesosUnidad)` hace la
  media ponderada; una unidad sin peso entra con la media de las que lo
  tienen, y sin ningún peso escrito todas cuentan igual. Lo pasan TODOS los
  que funden: `calcularNotaArea` (`opciones.pesosUnidad`, desde
  `getResumenCurso`, `ExplicacionNota`, `informes/datos.ts` y Seguimiento),
  `getMatrizEvaluacion` y `getResumenPorCriterio` (`pesosUnidadDeArea`); si
  uno no lo pasara, «Todo el curso» y el boletín discreparían. Se elige en
  «Nota final» (`[data-regla-unidades]`), donde con `peso` se editan los
  pesos de cada unidad (`[data-peso-unidad]`), y `ExplicacionNota` lo dice
  (`[data-explicacion-unidades]`). La nota de cada unidad no cambia. Decisión
  de Luis (auditoría de nov 2026): que se pueda elegir por área.
- **La nota final del curso sale de una sola función**, `notaFinal` en
  `calculo.ts`, con la regla que declare el área (`Asignatura.regla_final`,
  sin índice: ponderada por `pesos_trimestres` —lo de siempre y el valor por
  defecto—, continua = el último trimestre con nota, más alta, mediana). La
  misma regla se aplica a la final de cada criterio y a la del área, para
  que «Todo el curso», el boletín y «de dónde sale esta nota» coincidan.
  Mediana y más alta no son lineales: la final del área se calcula con la
  regla sobre sus tres notas de trimestre, no sumando las finales de los
  criterios, y `ExplicacionNota` lo avisa. Porcentajes y regla se editan en
  la pestaña «Nota final» del panel de áreas (`NotaFinalPanel`); antes los
  porcentajes solo se escribían al crear el área. Decisión de Luis: lo
  normal es la media de los tres, pero hay docentes que no lo hacen así. La
  recuperación automática de un criterio suspenso que una unidad posterior
  supera NO está hecha: es otra regla, por criterio y entre unidades.
- **Una casilla tiene una sola fila que cuenta** (`masReciente` en
  `queries.ts`: la de `updated_at` más reciente y, a igualdad, menor id). Dos
  aparatos que califican la misma casilla antes de sincronizar crean dos
  filas vivas con la misma clave y distinto id. Toda lectura de
  `calificaciones` pasa por `sinDuplicados` o `getCalificacionUnica`,
  `saveCalificaciones` escribe en esa misma fila y retira las otras, y
  `reconciliarDuplicados` lo repasa tras cada sync. Antes la matriz pintaba la
  última fila que encontraba y el panel editaba la primera: Luis ponía una
  nota y no la veía cambiar.
- **Nadie finge una herramienta, y se elige por donde se entra a calificar.**
  Un instrumento sin rúbrica ni examen que no es de observación
  (`faltaHerramienta`, `ElegirHerramienta.tsx`) la pide en los tres sitios:
  la cabecera de la columna («Definir herramienta», `[data-herramienta-definir]`,
  con «Evaluar hoy» como segunda opción), la pasada «Evaluar hoy»
  (`[data-sin-herramienta]` encima de los cuatro niveles; al guardar la rúbrica
  la misma pantalla pasa a `SesionRubrica`) y el panel de la casilla. Los
  botones son los mismos (`BotonesHerramienta`): rúbrica, lista de control,
  escala de estimación y, si es prueba escrita, examen; lista y escala son
  rúbricas con otra forma (`herramientaInicial`, `RubricaEditor` con `inicio`).
  La parrilla 0-10 queda como «nota directa». El diario solo sale abierto en
  los instrumentos de observación (`esDeObservacion`), que aun así ofrecen
  «Definir rúbrica» como segunda opción en la cabecera y plegado en «Evaluar
  hoy», por si el docente la prefiere: Luis abrió «Evaluar hoy»
  en «Exposición oral» y se encontró una escala 1-4 que nadie había elegido,
  con la rúbrica a crear tras «Más» y un icono pequeño.
- **Una rúbrica puede evolucionar, pero nunca por su cuenta.** Cambiar la
  rúbrica de un alumno que ya tenía nota pregunta (`PreguntaRubrica`):
  «corregir» sustituye, como siempre; «nueva observación» la mete en el
  diario como registro con `nota` 0-10 y `niveles_rubrica`
  (`evolucionarRubrica`), convirtiendo antes la nota que ya había en la
  primera observación para que la media no la pierda. La agregación del
  diario trabaja en notas (`notaDeRegistro`), no en niveles, y para los
  registros de nivel de siempre da exactamente lo mismo (2,5 · 5 · 7,5 · 10),
  así que un aparato sin actualizar no entra en ping-pong; `valor` guarda el
  nivel equivalente (`nivelDeNota`) por si acaso. `materializarDiario` copia
  las marcas de la última observación a la casilla y compara también eso.
  Una pantalla crea una observación por alumno y pasada: los retoques la
  editan. Afinar una nota puesta en esa misma pantalla no pregunta.
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
- **Lo que sale de la IA queda marcado, y lo que se le da no lleva alumnado.**
  `Rubrica.generada_ia` y `PruebaDef.generada_ia` (dentro de `prueba_json`,
  sin esquema) se conservan al abrir, guardar, copiar al banco y exportar
  (`rubricaAJson`, `pruebaAJson`) y se leen al importar: es la marca legible
  por máquina del AI Act (art. 50.2). Retocar el borrador no la quita.
  Mientras está, el editor enseña `AvisoBorradorIA` (`[data-borrador-ia]`), y
  todo campo de contexto que va al prompt lleva `AvisoContextoIA`
  (`[data-aviso-contexto-ia]`). Abrir una rúbrica guardada ponía la marca a
  cero y al volver a guardar se perdía. `PRIVACIDAD.md` describe la CSP real,
  el endpoint de programación y los proveedores: si cambia alguno, se
  actualiza allí con fecha.
- **La medida ajusta el cálculo del alumno, no la programación.** Tabla
  `medidas` (esquema v8; `db/medidas.ts`, puro; `pruebas/medidas.test.ts`):
  una fila viva por alumno, área y tipo (`adaptacion` | `refuerzo`), con
  vigencia por trimestres. El refuerzo guarda `pesos_json` (instrumento →
  peso; 0 = no cuenta) y manda sobre el peso de la clase y sobre el reparto
  del criterio; un instrumento `solo_medidas` (`crearInstrumentoPropio`) es
  un instrumento normal del área que pesa 0 para quien no lo incluya. La
  adaptación guarda `criterios_json` (criterio de la clase → null = no
  cuenta | sustituto con código, texto y curso): **la nota del criterio
  adaptado vive en la casilla del criterio de la clase al que sustituye**,
  porque el `criterio_id` («CE1.1») se repite en todos los cursos y crear
  otro rompería claves, vínculos y programación. `calcularNotaArea` recibe
  `{ medidas }` como último parámetro y los cuatro llamadores lo pasan
  (`getResumenCurso`, `ExplicacionNota`, `informes/datos.ts`, Seguimiento);
  `getMatrizEvaluacion` devuelve `medidas` por alumno. Es dato de NEAE: el
  sello ACI/RE (`SelloMedida`, `[data-sello-medida]`), la franja del panel
  (`[data-medida-aviso]`), el editor (`MedidasAlumno`, desde la ficha y desde
  el sello) y los informes miran `verNeae()`; **la nota se calcula con la
  medida en todo caso**. Las casillas que no cuentan salen `[data-no-cuenta]`
  y siguen abriéndose. Una base v7 no pasa por la puerta de migración
  (`VERSION_PUERTA`): solo gana una tabla vacía. Tras desplegar hay que
  reiniciar el backend: `medidas` está en su lista blanca.
- **Las tutorías son de la clase; sus modelos, del docente** (esquema v9,
  tablas `tutorias` y `modelos_tutoria`; `db/tutorias.ts`, puro;
  `pruebas/tutorias.test.ts` y `tutorias-ui.test.mjs`). Una tutoría lleva
  `grupo_id` y nombra a su alumnado en `alumnos`, un array con índice
  multiEntry (`*alumnos`): la ficha del alumno (`HistorialTutorias`, en
  `EditarAlumno`) lee su historial de todas sus clases con
  `getTutoriasDeAlumno`. Una de grupo va sin alumnado. Asistentes, orden del
  día, apartados y acuerdos van como arrays de verdad, no `*_json`: la fusión
  los compara como JSON (`iguales`), así que dos aparatos que tocan acuerdos
  distintos de la misma tutoría a la vez se quedan con la lista del más
  reciente. **Los apartados se COPIAN del modelo al crear la tutoría**
  (`tutoriaDesdeModelo`): cambiar o borrar un modelo no reescribe actas. Los
  tres modelos de serie (`MODELOS_DE_SERIE`: con la familia, entrevista
  inicial, seguimiento de acuerdos) viven en el código y no en la tabla,
  porque sembrarlos en cada aparato los triplicaría al sincronizar; se
  duplican para editarlos. Un acuerdo se revisa en SU tutoría
  (`revisarAcuerdo`, que vuelve a sellarla) aunque se marque desde la lista de
  pendientes o desde otra tutoría; la que lo revisa lo anota en `revisados`
  para su acta. Borrar una clase se lleva sus tutorías (`eliminarGrupo`);
  quitar a un alumno de la clase, no. La pantalla es `/tutorias`
  (`TutoriasPage`, `?alumno=` filtra, `?abrir=` abre) y el acta
  (`informes/actaTutoria.ts`, Lámina, con firma por asistente y del tutor)
  sale por `imprimir`/`descargarHTML`. No van tras el interruptor de datos
  sensibles (decisión razonada en PRIVACIDAD.md): el formulario pide
  minimización (`[data-aviso-tutoria]`). Tras desplegar, reiniciar el
  backend: las dos tablas están en su lista blanca.
- **NEAE y evidencias vienen apagados** (`db/datosSensibles.ts`): un aparato
  nuevo no ofrece marcar NEAE ni capturar foto, audio o vídeo hasta que el
  docente los enciende en Alumnado (`AjustesDatosSensibles`,
  `[data-datos-sensibles-toggle]`, `[data-sensible="neae"|"evidencias"]`,
  con `confirm`). La primera resolución (`resolverDatosSensibles`, en `Layout`
  de `App.tsx`) los deja encendidos si el aparato ya tenía alumnado con NEAE
  o evidencias, para que actualizar no esconda nada; desde ahí manda la
  elección, guardada en `miclase.sensibles` (preferencia del aparato, no se
  sincroniza). Apagar solo esconde: el sello (`verNeae()` en cada pantalla y
  en `informes/documentos.ts`), la casilla de la ficha, la galería, la
  captura (`CapturaEvidencia` devuelve null con `verEvidencias()` falso) y
  las evidencias de los informes. Guardar una ficha con NEAE escondido
  conserva el indicador. Las pruebas que capturen evidencias las encienden
  antes (`e2e.test.mjs` escribe `miclase.sensibles` y lanza
  `miclase:sensibles`). Motivo: art. 9 RGPD y arts. 17.4 y 31.5 del
  anteproyecto de Lei de educación dixital.
- **El currículo viaja dentro de la app, y las pantallas lo piden a
  `src/curriculo/`**, nunca a `/api/curriculum` (`e2e.test.mjs` exige cero
  peticiones en toda la sesión). `scripts/empaquetar_curriculo.mjs` lee
  `curriculum/` en cada build y cada arranque de dev —lo lanza el plugin
  `miclase-curriculo` de `vite.config.ts`, no un «prebuild» de npm, porque
  `desplegar.sh` y las pruebas llaman a `vite` directamente; en el hook
  `config`, no en `buildStart`, porque el servidor de dev lee la lista de
  `public/` antes de `buildStart` y en un clon limpio (el CI) el índice
  caía al index.html de la SPA; a mano,
  `npm run curriculo`— y escribe en `frontend/public/curriculo/`
  (gitignored): `indice.json` (comunidades → etapas → áreas → cursos, con
  la comunidad escrita como la escribe cada JSON: `MADRID`, `CyL`),
  `descriptores/<etapa>.json` (texto estatal) y un paquete de criterios por
  comunidad y etapa (`criterios/<carpeta>-<etapa>.json`: por área y curso,
  los criterios y la conexión de cada competencia específica, UNA vez). Las
  conexiones las calcula el MISMO `conexiones.js` que usa el seed, en Node;
  el frontend no lo importa. `fuente.ts` (puro) compone exactamente lo que
  da el servidor, con su normalización del curso («4» → «4º»), y
  `curriculo-vs-servidor.test.ts` lo compara campo a campo para cada
  comunidad y etapa; `curriculo-empaquetado.test.ts` es la prueba pura. El
  service worker precachea índice, descriptores y los 15 paquetes de
  criterios (6 MB en el aparato, 0,75 MB por la red una vez): sin red, con
  cualquier comunidad, se crea la clase, se listan áreas y cursos y se
  califica. Los saberes van aparte y no se precachean (nadie los pide). El
  servidor (`routes/curriculum.js`, intacto) es solo RESERVA: `index.ts` lo
  llama por `api()` si la comunidad no está en el índice o un paquete no
  llega. Una comunidad nueva es su carpeta en `curriculum/` y regenerar;
  el selector de clases la lee del índice (`comunidades()`) y su nombre
  largo es una línea en `curriculo/nombres.ts`. Decisión de Luis (nov
  2026): precachear todas, no bajar a demanda. Cada criterio del paquete
  trae también `descriptores`, `competencias_clave` y `conexion_origen`, y
  `descriptores()` da el catálogo de la etapa: las competencias clave
  (`ChipsCompetencias`, `CompetenciasClaveGrupo`, informes) y la adaptación
  curricular (`MedidaAdaptacion`, cursos y criterios de otro curso) leen de
  ahí y funcionan sin red igual que el calificador.
- **Las competencias clave salen de la competencia específica de cada
  criterio**, y cada conexión dice de dónde sale. Formato del currículo, que
  cualquier comunidad nueva tiene que cumplir para tenerlas sin tocar nada:
  el JSON de `curriculum/<ccaa>/<etapa>/<materia>_<curso>.json` (lo que
  escribe `parse_curriculum.py` desde la matriz de iDoceo) lleva
  `objetivos[]` (las competencias específicas: Tipo 2, `id` y `descripcion`)
  con `descriptores_ids` = la columna «Enlaces» tal cual («CCL1, STEM2…»), y
  `criterios[].objetivo_id` (Tipo 3, «Enlaces»). Nada más: el texto de los
  descriptores y la reserva salen de `curriculum/_estatal/{primaria,
  secundaria}.json` (`scripts/extraer_estatal.py`, desde las matrices de los
  RD 157/2022 y 217/2022: los 34 descriptores del Anexo I y la conexión
  estatal de cada competencia específica por materia). `seed.js` pasa cada
  competencia específica por `conexionDeObjetivo` (`backend/src/db/conexiones.js`,
  puro) y guarda `c_objetivos` (con `conexion_origen`) y `c_conexiones`
  (`tipo` 'descriptor' o 'competencia'). El origen es `comunidad` (la matriz
  trae descriptores), `competencia` (solo nombra CCL, CP…: Valencia en
  Primaria), `estatal` (no trae nada y se toma la del RD para la competencia
  específica del mismo texto: mismo número con parecido ≥ 0,5, o cualquiera
  con ≥ 0,75; Madrid en Primaria) o `ninguna`. Los códigos se normalizan
  (`leerCodigo`: espacios, minúsculas, `CMCCTE` = STEM). Un criterio sin
  `objetivo_id` lo toma de su código (CE2.3 → CE2). El texto del descriptor
  es siempre el estatal (el Anexo I es enseñanza mínima; el de algunas
  matrices llega roto). Las carpetas que empiezan por `_` no son
  comunidades. `pruebas/conexiones.test.mjs` exige a cada comunidad y etapa
  de `curriculum/` un 85 % de competencias específicas con descriptor (90 %
  con algo en Valencia Primaria), en total o contando solo las materias que
  el RD tiene (las optativas propias sin «Enlaces» no pueden casar con el
  estatal: Extremadura ESO da 84 % y 90 %; decisión de Luis, nov 2026): una
  comunidad nueva sin «Enlaces» falla ahí. `/api/curriculum/criterios` añade a cada criterio `descriptores`,
  `competencias_clave` y `conexion_origen` (campos nuevos: nadie más los
  necesita), y `/api/curriculum/descriptores` da el catálogo de la etapa. Es
  dato público del servidor: no hay esquema Dexie nuevo. Tras cambiar el
  currículo o el schema, `npm run seed` en producción.
- **El nivel por descriptor y por competencia clave se calcula en
  `db/competenciasClave.ts`** (puro, `pruebas/competencias-clave.test.ts`),
  sobre las notas de criterio de `calcularNotaArea`, sin volver a ponderar
  instrumentos. Reglas decididas por Luis (nov 2026): un descriptor es, en
  cada área, la media de los criterios que conectan con él ponderada por el
  peso de la programación, y después la media simple de las áreas (cada área
  cuenta igual); una competencia clave es la media simple de sus
  descriptores con datos, más UNA entrada con lo conectado solo a la
  competencia (`directa`); lo que no tiene datos no cuenta como cero. La
  final usa la final de cada criterio, con la regla del área. Escala
  `NIVELES_DESARROLLO`: 1 Inicial (< 5) · 2 En desarrollo (5–6,9) ·
  3 Adquirido (7–8,9) · 4 Consolidado (≥ 9). La conexión estatal cuenta
  igual y se marca (†) en el informe. El informe
  (`informes/competenciasClave.ts`, Lámina; tarjeta «Competencias clave» de
  Informes, `[data-competencias-alcance]`: resumen del grupo, una lámina por
  alumno o un alumno) lleva el rastro de cada descriptor (área, nota del área
  y criterios) y lista los criterios con nota que no conectan. El «perfil
  por competencia específica» de `perfilCompetencial` sigue igual en el
  informe de evaluación.
- **Las competencias clave se ven donde se evalúa, no solo en su informe.**
  Cada criterio las enseña en la cabecera de la matriz por criterio
  (`[data-criterio-competencias]`), en «Más» del panel de la casilla y en
  Programación (`ChipsCompetencias`, con los campos que ya trae
  `/api/curriculum/criterios`). Seguimiento lleva la pestaña «Competencias
  clave» (`CompetenciasClaveGrupo`, `[data-competencias-clave]`), de la clase
  entera y no del área elegida, con `tablaDeCompetencias` (puro). El informe
  individual lleva `bloqueCompetenciasClave`. El editor de examen avisa
  (`[data-aviso-reparto]`) cuando varios criterios reciben la misma nota; nada
  cambia sin pulsar. El informe de la prueba añade descriptores por pregunta y
  acierto por competencia (`competenciasDeLaPrueba`). El service worker pide
  el currículo primero a la red (`NetworkFirst`, 4 s): con la caché delante,
  lo sembrado de nuevo no llegaba hasta la segunda apertura.
- **El plano de clase es AulaMap, de Juan José de Haro (jjdeharo), y se le
  cita.** Copia en `frontend/public/aulamap/` (commit y cambios en
  `LEEME-MICLASE.md`), integrada con permiso de su autor (8/11/2026) a
  condición de que esa carpeta siga en **AGPL v3 solo** —la opción EUPL de
  MiClase no la cubre: `LICENSE` y `NOTICE` lo dicen— y de que AulaMap salga
  en los créditos con su enlace. La línea «Plano basado en AulaMap, de Juan
  José de Haro (jjdeharo)» con enlaces (`[data-credito-aulamap]`) va siempre
  a la vista en `PlanoClase.tsx`; no se quita. AulaMap se abre en un iframe
  del MISMO origen: `PlanoClase` deja en `window.MiClaseAulaMap` la clase y
  cómo guardarla, y `miclase-puente.js` la pasa a `app.js`, que solo lleva
  dos ganchos (`loadState`/`saveState`): dentro de MiClase nunca escribe en
  `localStorage`. La traducción es pura (`db/planoAulaMap.ts`,
  `plano-aulamap.test.ts`): un grupo = una clase de AulaMap; el alumnado lo
  manda MiClase (id `a<id>`; bajas se levantan, altas entran sin sentar) y lo
  guardado en `Plano.aulamap` (sin índice, sin esquema nuevo) **no lleva
  nombres**, que se ponen al abrir —el modo anónimo pone el código—.
  `guardarPlanoAulaMap` solo escribe si cambia. Un grupo sin plano de AulaMap
  estrena uno con la cuadrícula vieja (`filas`×`cols` y `asientos`, que ya
  no se escriben). En vista, tocar a un alumno abre `/escanear?alumno=`; los
  QR de mesa no dependen del plano. Dentro de MiClase se esconden el selector
  de clases, exportar, importar, compartir y la edición de la lista
  (`miclase-puente.css`). Imprimir es el `window.print()` de AulaMap: en la
  app nativa no imprime todavía. `plano-aulamap-ui.test.mjs` comprueba la
  cita, que ninguna petición sale del origen y AulaMap suelto. El permiso se
  dio con MiClase en GitHub y en el servidor (nov 2026, sin app en tiendas):
  **antes de publicar en la App Store o en Google Play, confirmarlo con el
  autor**, porque las condiciones de la App Store chocan con la AGPL de
  código ajeno.
- **El mínimo de consecución se ve donde se califica y en el informe.**
  `unidad_criterios.minimo` (lo trae PROENS) sale en la franja del instrumento
  del panel de la casilla (`[data-minimo-criterio]`, dos líneas; al tocarlo,
  entero), solo dentro de una unidad, con `getMinimoDeCriterio`. Se pide
  DESPUÉS de la nota: por delante retrasaba lo primero que tiene que llegar
  al panel. En el informe individual va bajo la descripción del criterio
  (`lineaMinimos` en `informes/documentos.ts`, con `AreaInforme.minimos`): con
  mínimos distintos en varias unidades, cada uno con el nombre de la suya; el
  mismo texto, una vez; con trimestre, solo los de sus unidades; y no se
  imprime en un criterio adaptado a la vista, porque no es el suyo. Boletines
  y acta no lo llevan. Es texto: ninguna nota se compara con él. Antes solo
  se veía en 📋 Programación (auditoría de nov 2026).
- **En papel, la lámina va sobre blanco.** El `@media print` de
  `informes/lamina.ts` pone `--lm-paper` y `.hoja` en blanco y deja la franja
  de los Cinco Mundos en un filete de 1,5 mm: el fondo crudo a página
  completa, forzado con `print-color-adjust`, tintaba cada hoja (una por
  alumno en boletines e informes). «Guardar como PDF» y el PDF de iOS usan el
  mismo medio, así que también salen en blanco; el papel de la lámina queda
  para la pantalla y el `.html` descargado. Las hojas de respuestas llevan su
  propio CSS y no cambian. Luis: los informes eran demasiado caros de imprimir.
- **Tocar los instrumentos de un criterio no retira a los hijos de una
  familia que sigue asignada.** `fijarInstrumentosDeCriterio` recibe familias
  (la importación de PROENS y 📋 Programación no nombran hijos): un hijo
  conserva su fila mientras su familia esté en la lista y se va con ella si
  se retira. Antes reimportar la programación deshacía en silencio el reparto
  de criterios de los hijos (`proens-ui.test.mjs`, paso 6).
- **El Calificador reabre la última unidad del área**
  (`miclase.calificador.unidad`, por área, en el aparato), pero solo si es
  del trimestre de la barra: la casilla lleva el trimestre de la barra, y
  reabrir en enero la unidad de diciembre invitaría a calificar en el
  trimestre equivocado. Un `?unidad_id=` manda, y pulsar «Todo el curso» la
  olvida. Sin unidad recordada se sigue abriendo en «Todo el curso». La carga
  de la matriz descarta la respuesta que llega tarde (`vigente`): abrir
  directamente en una unidad dejaba que la de todo el curso, más lenta, la
  pisara.
- **Los iconos se generan, no se editan a mano**: `scripts/generar_iconos.py`
  produce los de web, iOS y Android desde una única definición.
  La marca es un **corro de clase**: cinco círculos (Los Cinco Mundos)
  alrededor de uno central, la clase. La eligió Luis (nov 2026); antes era la
  matriz 5×3 del calificador. La misma geometría vive en `frontend/src/marca.ts`
  (puro), que da el símbolo del menú (`components/Marca.tsx`, `[data-marca]`)
  y el de la cabecera de los informes (`marcaSVG` en `lamina.ts`): si cambia
  en el script, cambia allí. Sobre fondo oscuro el mundo interior va aclarado
  (`#5b9aa6`), porque el `#2c5c66` del canon se pierde sobre el azul; sobre
  papel va el canon y el círculo central en tinta. El splash de Android sigue
  siendo el de Capacitor.
- **Todo fichero sale por `descargarFichero` (`utils/compartir.ts`).** Un
  `<a download>` no hace nada dentro de WKWebView: la copia de seguridad
  «se descargaba» en el iPad sin que saliera nada. En nativo la función abre
  la hoja de compartir del sistema; en web descarga.
- **Imprimir pasa por `Impresora` (`nativo/impresora.ts`).** `window.print()`
  tampoco existe en WKWebView; el plugin Swift compone el PDF y abre la hoja
  del sistema. En web sigue siendo el iframe oculto de siempre.
  **Salvo en Safari y en el iPad** (`nativo/webkit.ts`, `esWebKit`): ahí el
  iframe oculto no imprime nada —y en la app instalada en la pantalla de
  inicio no existe la hoja de impresión—, así que `ImpresoraWeb` enseña el
  documento en una vista previa (`[data-vista-impresion]`) con «Imprimir»
  (desde el iframe visible y dentro de la pulsación, que es lo que Safari
  exige), «Compartir» (`compartirFichero`: la hoja del sistema, con Guardar
  en Archivos y AirDrop; **no** imprime un `.html`) y «Abrir en Safari»
  (`[data-vista-abrir]`: `window.open` de un blob dentro de la pulsación; en
  la app instalada una URL fuera de la app sale a Safari, cuyo botón de
  compartir sí tiene Imprimir y Guardar en Archivos). En la app instalada
  «Imprimir» no se ofrece, porque no abre nada. La barra lleva su línea de
  estado (`[data-vista-estado]`) y la capa deja la zona segura arriba
  (`env(safe-area-inset-top)`): la app corre bajo la barra de estado
  (`viewport-fit=cover`) y con iPadOS 26 la hora y la batería caían encima de
  los botones. `imprimir()` devuelve si el docente pulsó una de las tres;
  cerrar la vista no es haber impreso y las pantallas lo dicen. Luis pulsaba
  «Imprimir hojas» en el iPad, la app decía «enviado a imprimir» y no salía
  nada.
- **El login nativo depende del servidor.** La app solo ofrece «Conectar
  EDUmind» si `/api/auth/config` anuncia `redirect_uri_nativo`
  (`es.edumind.miclase://auth/callback`); si no, lo explica. Ver DESPLIEGUE.md,
  «Login desde la app nativa».
- **`project.pbxproj` no se edita a mano** (ni con Xcode abierto ni por
  script). Lo que haya que compilar va a `ios/App/CapApp-SPM/Sources/`, que
  entra entero; lo que haya que añadir al target (p. ej. `PrivacyInfo.xcprivacy`)
  lo hace el docente arrastrándolo en Xcode.
- **`iosScheme` no se fija en `capacitor.config.ts`.** iOS no admite http/https
  como esquema propio y Capacitor lo ignora: el origen real es
  `capacitor://localhost`, y cambiarlo tras publicar vaciaría IndexedDB.
- **La semana se le puede pedir a una IA, y lo que vuelve queda marcado.**
  `ia/planificacionPrompt.ts` (puro) monta el prompt con lo que ya sabe la
  app —clase, semana, horario, áreas, unidades del trimestre con sus
  criterios y los eventos de esos días; nunca alumnado— y la plantilla de
  formato NO se escribe a mano: es lo que `semanaAMarkdown` exporta para una
  sesión de ejemplo, así que el prompt y `leerSemana` no pueden separarse
  (`planificacion-semanal.test.ts` lee la plantilla sin avisos). Vive en
  «Volcar una semana» (`[data-ia-semana-toggle]`): «Copiar prompt» para una
  IA externa (`[data-ia-semana-prompt]` lo enseña) y, con WebGPU, «Generar
  el día» con la IA local —un solo día (`soloDia`): una semana no le cabe en
  1200 tokens—. La respuesta entra por el cuadro de texto y la vista previa
  de siempre. No hay horario guardado: sale de las franjas ya planificadas y
  el docente lo corrige en el propio diálogo (`franjasDeTexto`). La marca es
  `SesionPlan.generada_ia` (sin índice): la pone la casilla
  `[data-volcar-de-ia]`, que se marca sola al copiar el prompt, al generar o
  si el .md trae `MARCA_IA` (`<!-- generada-ia -->`); se conserva al editar,
  se ve en el detalle (`AvisoBorradorIA`) y `semanaAMarkdown` la escribe.
  Decisión de Luis (auditoría de nov 2026): las dos vías, externa y local.
- **La planificación es una previsión, no un registro de aula** (esquema v10,
  tablas `planificacion` y `eventos`; entrada «Planificación» del menú, con
  vistas Semana y Mes en `pages/Planificacion/`). Una sesión planificada es de
  la clase activa y de un día y una franja (`fecha`, `franja`, `hora_inicio`,
  `hora_fin`); no toca notas, diario ni asistencia. Área y unidad se enlazan
  si casan (`asignatura_id`, `unidad_id`) pero el texto tal cual se guarda
  siempre (`area`, `unidad_texto`), y los criterios van en `criterios_json`
  como `{ codigo, criterio_id }`: el «CA6.5» del .md y el «CE6.5» del
  currículo si existe (`codigoCurriculo`), o null. Lo que no casa se guarda y
  se dice antes, nunca se descarta. El volcado lee el .md de Luis
  (`planificacion/semanal.ts`, puro, fixture
  `pruebas/fixtures/planificacion_semanal_6A.md`, castellano y gallego): una
  sesión por franja de la «Vista rápida», con su título y su ■, y el detalle
  de un bloque de varias franjas copiado en cada una (`bloque`); sin tabla,
  el bloque es la sesión. Casar es aparte (`casar.ts`, puro): área por
  `claveArea` (gallego, castellano y slug del currículo), unidad por título y
  luego por número escrito en el nombre, **nunca por orden**. Volcar otra vez
  la misma semana no duplica: `volcarSemana` devuelve null si hay algo y no
  se pidió `sustituir`, y sustituir retira con borrado lógico las sesiones de
  esas fechas y los eventos `origen: 'volcado'`, no los escritos a mano. Los
  eventos son de la clase o de todas (`grupo_id = TODAS_LAS_CLASES`, 0); la
  nota en cursiva de un día del .md es un evento `tipo: 'nota'`. Lo
  planificado con ■ en un área de la clase lleva al Calificador por URL
  (`/evaluacion?grupo_id&asignatura_id&unidad_id`). Imprimir va por
  `imprimir` (Lámina) y exportar el .md por `descargarFichero`; el .md
  exportado se vuelve a leer igual (`planificacion-semanal.test.ts`).
  Borrar una clase retira su planificación y sus eventos.

## Comandos habituales
- Dev completo: `./start-dev.sh`
- Empaquetar nativo: `npm run nativo:sync` (y `nativo:ios` / `nativo:android`
  para abrir Xcode o Android Studio — requieren macOS o Android Studio).
  Capacitor 8 necesita Node ≥ 22: en el servidor (Node 20) solo se compila la web.
- Compilar iOS sin abrir Xcode: ver DESPLIEGUE.md, «Compilar en el Mac» (xcodebuild)
- Backend solo: `npm run dev:backend` (puerto 3270)
- Frontend solo: `npm run dev:frontend` (puerto 5173)
- Seed DB: `npm run seed`
- Empaquetar el currículo para la app a mano: `npm run curriculo` (el build lo hace solo)
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
- No hacer `fetch` de `/api/curriculum` desde una pantalla: todo pasa por
  `src/curriculo/`, que lee el currículo empaquetado y deja el servidor de reserva
- No añadir versiones nuevas al esquema Dexie sin un `upgrade()` que selle
  `updated_at` en los registros existentes (la v9 es la de tutorías y la v10 la de planificación). Una tabla nueva va además en
  `TABLAS_SINC`, en `exportarDatos`/`importarDatos`, en la lista blanca del
  backend (`routes/sync.js`) y en las pruebas que leen la versión
  (`migracion.test.mjs`, `e2e.test.mjs`, `diario-ui.test.mjs`)
- No probar la sincronización contra la BD de producción: usar una copia
