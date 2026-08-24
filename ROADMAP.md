# Roadmap — EDUmind MiClase

Objetivo: alternativa open source, gratuita y local-first a iDoceo/Additio.
Diferencial: la **programación manda**. Evaluar en vivo con criterio LOMLOE
sabiendo siempre con qué instrumento se evalúa, y con evidencia en menos de
diez segundos (QR de mesa → panel táctil → nota + foto).

## Completado

- **Fase 1 — Evaluación con QR**: hoja imprimible de QR por clase (solo códigos
  anónimos, nunca nombres), escáner con cámara (`BarcodeDetector` nativo, sin
  dependencias; fallback de código manual), panel de evaluación rápida táctil
  con criterios LOMLOE, niveles de rúbrica (convertidos a escala 0-10) y
  teclado de notas.
- **Fase 2 — Evidencias**: foto de producciones desde el panel rápido
  (comprimida a JPEG ≤1600px), galería por alumno con vista ampliada,
  descarga y borrado; incluidas en el backup y en los informes.
- **Fase 3 — Nivel cuaderno profesional**: plano de clase táctil por clase
  (toque en alumno → evaluación rápida; encaja con los QR de mesa), informe
  individual, diario de sesión editable, currículo cacheado 7 días para
  evaluar sin conexión, almacenamiento persistente solicitado al navegador.
- **Fase 4 — Cadena completa (RTM curso 2026-2027)**:
  - **Criterio ↔ instrumento** (`criterio_instrumentos`): la programación decide
    con qué se evalúa cada criterio de cada unidad. El calificador obedece:
    cada casilla sabe su instrumento y abre su rúbrica. Un criterio sin
    instrumento sale rayado y explica cómo arreglarlo.
  - **Asistente de puesta en marcha**: seis pasos con estado real (clase →
    alumnado → áreas → programación → instrumentos → evaluar), enlazados al
    sitio exacto donde se resuelve cada uno.
  - **Alta de áreas en lote**: se marcan todas las que se imparten y aparecen
    como pestañas en Evaluación, con subpestañas por unidad.
  - **Motor de cálculo** (`db/calculo.ts`): notas ponderadas de verdad por peso
    de instrumento, peso de criterio y reparto por trimestres, con escala
    cualitativa LOMLOE. Un trimestre sin datos no cuenta como cero.
  - **Informes en Sistema Lámina**: informe individual, informes de clase,
    boletín y acta de área, compuestos en el canon EDUmind (papel, barra de
    Cinco Mundos, Outfit e IBM Plex Mono) e impresos desde el navegador.
    El .html descargado lleva las tipografías incrustadas.
  - **Sincronización multi-dispositivo cifrada de extremo a extremo**: buzón de
    sobres AES-256-GCM que el servidor no puede abrir, merge last-write-wins
    por registro y rangos de id por dispositivo para que dos aparatos no se
    pisen las claves. Requiere sesión EDUmind; el modo local sigue intacto.
  - **Menú lateral plegable** (Ctrl+B), con el estado recordado.
  - **Programación no destructiva**: regenerar la estructura conserva lo hecho;
    retirar un instrumento de un criterio no borra las notas ya puestas.

- **Fase 5 — Roadmap cerrado (agosto 2026)**:
  - **Empaquetado nativo (Capacitor 7)**: proyectos iOS y Android en
    `frontend/ios` y `frontend/android`, con los permisos de cámara y
    micrófono declarados. Resuelve la purga de IndexedDB de Safari: dentro del
    contenedor el almacenamiento es de la app y el sistema no lo limpia por
    inactividad. La app se empaqueta entera, así que arranca sin cobertura.
  - **Evidencias de audio y vídeo**: grabación de audio con cronómetro sin
    salir de la app, vídeo con la cámara del sistema, reproducción en la
    galería y en el panel de celda, filtros por tipo y control de tamaño
    (aviso al pasar de 5,5 MB, que es lo que de verdad cabe en un sobre de
    sincronización una vez base64 lo infla un tercio).
    En los informes las fotos se incrustan y las grabaciones se listan con su
    duración, porque en papel no se pueden reproducir.
  - **Fusión a tres bandas**: la sincronización ya no resuelve los conflictos
    a lo bruto. Guarda la última versión común de cada registro y combina
    campo a campo: si en el portátil se corrige el apellido y en la tablet se
    marca NEAE, se conservan los dos cambios. Solo cuando ambos tocan el mismo
    campo decide el más reciente.
  - **Perfil por competencia específica**: los criterios se agrupan por su
    competencia (CE2.3 → competencia 2) en el informe individual y en una
    vista nueva de Seguimiento. Es la lectura que pide la evaluación
    competencial.
  - **Rúbricas compartibles**: exportación e importación fiel en
    `.edurubrica.json`, con su escala intacta. Es un fichero: no pasa por
    ningún servidor.
  - **Offline de verdad**: el service worker deja de cachear las respuestas de
    sesión y de sincronización (guardarlas daba sesiones fantasma), el
    currículo se cachea 120 días, cualquier ruta de la app abre sin red, y hay
    aviso de trabajo sin conexión y panel de salud del almacenamiento.
  - `jspdf` y `html2canvas` retirados: ya no se usaban.

## Auditoría de agosto de 2026

Una revisión a fondo (modelo de datos, backend, producción y pantallas)
encontró que varias cosas dadas por cerradas aquí estaban a medias. Corregido
en la rama `fix/auditoria-20260824`; lo que sigue queda anotado para no volver
a darlo por hecho:

- La **sincronización periódica** solo corría mientras la pantalla de
  sincronización estaba abierta. Ahora el temporizador vive en toda la app
  (`components/SyncAutomatica.tsx`), pero sigue necesitando la app en
  ejecución: `Background Sync` real continúa pendiente.
- **`Instrumento.trimestres`** se configuraba y no lo leía nadie: un examen
  marcado «solo 1er trimestre» puntuaba en los tres. Ahora el calificador
  filtra por él.
- La sincronización podía **perder evidencias en silencio**: el cursor de
  envío avanzaba al encolar, no al confirmar.
- **No se podía editar ni borrar** un alumno ni una sesión, aunque las
  funciones existían.
- El **boletín trimestral** imprimía las faltas de todo el curso.
- Los **niveles de rúbrica** no llegaban nunca a 0 ni podían dar un 0.

## Pendiente

Lo siguiente son mejoras, no deudas:

0. **Instrumentos con forma propia** (pedido por Luis, agosto 2026): hoy todos
   los instrumentos se califican igual —nota 0-10 o niveles de rúbrica— sea
   una prueba escrita, un portfolio o un test. La idea es que cada tipo ofrezca
   lo suyo: el portfolio, lo que el docente elija (rúbrica, lista de control…);
   la prueba escrita, nota directa o desglose por preguntas con su puntuación;
   un test de V/F, respuesta esperada y respuesta dada, con la nota calculada.
   Es la pieza que más acercaría la app a iDoceo en comodidad de uso, y es
   trabajo de diseño además de código: no está empezada.

0.b **Soberanía del dato: quitarle al servidor el papel de depositario**
   (decidido con Luis, agosto 2026). Hoy el servidor ya no guarda datos de
   alumnado en claro, pero sigue albergando el buzón cifrado, y eso es
   tratamiento de datos personales seudonimizados. En un centro público el
   responsable del tratamiento es la Consellería, no el docente, así que lo
   defendible es que el dato no salga del dispositivo. Por orden de interés:
   - **Buzón «trae tu propio almacén»**: que el docente elija dónde vive el
     buzón cifrado —su Nextcloud, un WebDAV, una carpeta— en vez de en el
     servidor de EDUmind. Si otros centros adoptan la app, EDUmind deja de ser
     encargado del tratamiento de nadie (art. 28 RGPD).
   - **Sincronización directa entre dispositivos** (WebRTC con código de
     emparejamiento o QR): elimina el buzón por completo.
   - **Purga y retención del buzón**: borrar los sobres en cuanto los han
     recogido todos los dispositivos del docente (minimización, art. 5).
   - **Empotrar el currículo en la app** (Galicia son 4,2 MB): el servidor
     dejaría de hacer falta para evaluar.
   Pendiente inmediato: eliminar del servidor las tablas de aula huérfanas
   anteriores a local-first (`alumnos`, `grupos`, `calificaciones`…). No las
   usa ninguna ruta y no están en `schema.sql`, pero `alumnos` conserva dos
   filas de prueba, una con `neae = 1`, que es dato de salud del artículo 9.

1. **Publicar en las tiendas**: los proyectos nativos están listos, pero
   compilar iOS exige macOS con Xcode y una cuenta de desarrollador de Apple
   (99 $/año); Android necesita firmar el bundle. Hasta entonces, la PWA
   instalable cubre el caso de uso en Android y en escritorio.
2. **Sincronización en segundo plano**: hoy el temporizador corre en toda la
   app (cada cinco minutos, y al volver del segundo plano), pero solo con la
   app abierta. Con `Background Sync` en Android y `BGTaskScheduler` en iOS
   podría hacerse sin abrirla.
3. **Compartir programaciones completas**, no solo rúbricas: exportar una
   unidad con sus criterios e instrumentos para que otro docente la adopte.
4. **Modo tutoría**: vista de un alumno con todas sus áreas a la vez, pensada
   para la reunión con la familia.
5. **Importar alumnado desde XADE / Séneca / Rayuela** con el formato de
   exportación de cada consejería.
