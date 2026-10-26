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
│   ├── src/db/       ← localDb.ts (esquema Dexie v7) · queries.ts (única fuente de verdad)
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
│   ├── src/nativo/   ← impresora.ts: plugin Impresora (PDF/AirPrint en iOS; iframe en web)
│   ├── src/utils/compartir.ts ← descargarFichero(): la ÚNICA salida de ficheros (web: descarga; nativo: hoja de compartir)
│   ├── capacitor.config.ts
│   ├── ios/          ← proyecto Xcode con Swift Package Manager (sin CocoaPods). Permisos y
│   │                   esquema de URL en App/App/Info.plist; plugins propios en
│   │                   App/CapApp-SPM/Sources/CapApp-SPM/ (ImpresoraPlugin, MiClaseViewController)
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
- **«Evaluar con QR y cámara» es una cámara para dos códigos** (`EscanearPage`):
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
  `[data-cabeceras-toggle]`), además de «Editar» en «Evaluar con QR y cámara».
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
  «Evaluar con QR y cámara» (`[data-examen-informe]`), en `InformePrueba`.
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
- **Los iconos se generan, no se editan a mano**: `scripts/generar_iconos.py`
  produce los de web, iOS y Android desde una única definición.
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

## Comandos habituales
- Dev completo: `./start-dev.sh`
- Empaquetar nativo: `npm run nativo:sync` (y `nativo:ios` / `nativo:android`
  para abrir Xcode o Android Studio — requieren macOS o Android Studio).
  Capacitor 8 necesita Node ≥ 22: en el servidor (Node 20) solo se compila la web.
- Compilar iOS sin abrir Xcode: ver DESPLIEGUE.md, «Compilar en el Mac» (xcodebuild)
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
