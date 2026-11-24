# MiClase en Lámina — análisis de arquitectura

Dónde y qué hay que modificar para llevar la interfaz de MiClase al aspecto
EDUmind-Lámina. Medido sobre `main` el 23·11·2026 (`b76cda5`). **No se ha
tocado la app**: este documento y las dos maquetas son lo único que existe.

- Maqueta de aspecto: `MAQUETA_LAMINA_APP.html` (Calificador y panel de la casilla).
- Maqueta de estructura: `MAQUETA_LAMINA_ESTRUCTURA.html` (menú, barra superior, pestañas, pie, versión).

## 1. Lo decidido

Por Luis, viendo las maquetas (22 y 23·11·2026):

| Asunto | Decisión |
|---|---|
| Paleta | La de la skill `edumind-lamina`: papel `#ece9e1`, tinta `#17181a`, mundos desaturados |
| Notas | Dos modos a elección del docente: **filete** (cifra en tinta y raya de color) y **relleno** (casilla de color) |
| Iconos | SVG propios, de línea y en un solo color, en lugar de emoji. La familia de la maqueta vale |
| Desplegables | Lista propia en vez del desplegable del sistema: la app va a iOS, macOS, Windows, Linux y Android |
| Estructura | La de la maqueta de estructura: filete continuo, menú en tres formas, pestañas que no se cortan, pie repartido, versión con sitio propio |

Propuesto por Claude en las maquetas y **sin confirmar**: tipografía Outfit +
IBM Plex Mono; filete como modo por defecto; nombres cortos del menú plegado;
qué cuatro destinos van en la barra inferior del móvil.

## 2. Cómo está hecha hoy la parte visual

Cinco capas, de la más barata de cambiar a la más cara:

| Capa | Dónde vive | Tamaño |
|---|---|---|
| **A. Canon vendorizado** | `frontend/public/vendor/lamina-v1.css` (v1.1, jul 2026), cargado desde `index.html` | 298 líneas; solo se usan la franja de mundos y `--lm-display` |
| **B. Tokens y clases de la app** | `frontend/src/index.css` | 1.073 líneas, 30 colores |
| **C. Piezas comunes** | `components/comunes/` (`Boton`, `Dialogo`, `Pestanas`), `utils/confirmar.tsx`, `utils/foco.ts` | Las usan 2, 3 y 4 ficheros |
| **D. Marco** | `App.tsx` (menú, pie, versión), `BarraClase.tsx`, avisos flotantes | 5 ficheros |
| **E. Pantallas** | 98 ficheros `.tsx` | 2.551 estilos en línea, 358 colores escritos a mano, 332 emoji, 86 desplegables |

Lo que eso significa:

- **Los tokens mandan poco.** Cambiar `index.css` cambia menú, botones con clase, tarjetas y diálogos. No alcanza a los 2.551 `style={{…}}`.
- **Las piezas comunes casi no se usan.** Hay 530 botones: 118 con `.btn-primary`, 213 con `.btn-secondary` y solo 2 ficheros con `Boton`. Hay 118 `.card`.
- **Hay tres Láminas.** La vendorizada (v1.1, mundos vivos), la de los informes (`informes/lamina.ts`, copia de la anterior) y la de la skill (mundos desaturados), que es la elegida. Ver decisión abierta 1.
- **Las notas se pintan en línea.** `calificativo()` de `db/calculo.ts` devuelve el color y 14 pantallas lo ponen como fondo (34 usos); solo 2 usan las clases `.cal-N`. Sin una pieza común, el modo filete/relleno habría que hacerlo 34 veces.
- **La versión no existe como dato.** El pie dice «v1.0» escrito a mano; `package.json` dice `0.1.0`.

## 3. Qué se modifica, capa por capa

### A. Canon

| Fichero | Qué |
|---|---|
| `public/vendor/lamina-v1.css` | **No se edita** (lo dice su cabecera). La app redefine en su hoja lo que cambia |
| `src/index.css` (`:root`) | Tokens nuevos: papel, papel-2, tinta ×3, filete, pelo, mundos desaturados, tipografías, alto de barra, zonas seguras |
| `src/index.css` | `@font-face` de Outfit e IBM Plex Mono (ya están en `public/fonts/`; hoy solo los declaran los informes) |

### B. Tokens y clases de `index.css`

| Bloque (líneas aprox.) | Qué |
|---|---|
| Sistema base (1–130) | Sustituir azules y grises por papel y tinta; `--radio-*` a 0; `--sombra*` fuera; `--fuente` a Outfit |
| Botones, campos, `.card`, `.badge` (60–130) | Botón = tinta; secundario = filete de 1 px; campo = filete inferior; `.card` = sección con filete, sin fondo blanco |
| Modales (131–150) | Papel con marco de 2 px, sin sombra; el velo se queda |
| Semáforo `.cal-*` (152–160) | Se quedan los colores; se añade el modo filete (ver pieza `Nota`) |
| Layout y menú (161–300, 700–725) | Se reescribe entero según la maqueta de estructura |
| Pestañas (300–360, 1042) | Activa = bloque de tinta sobre el filete; fuera el desplazamiento lateral |
| Matriz y Calificador (363–525, 726–900) | Filetes en vez de bordes grises; cabeceras; `repeating-linear-gradient` de «no cuenta» pasa a trama de filetes |
| Barra de clase (526–590) | Pasa a ser la barra superior de 56 px |
| Inicio, Planificación (591–700, 900–995) | Radios, sombras y pastillas fuera |
| Piezas comunes y hoja (1018–1073) | Ajuste a papel y tinta |

### C. Piezas comunes: tres que cambian y seis nuevas

| Pieza | Estado | Qué hace | Sustituye a |
|---|---|---|---|
| `Boton` | cambia | Variantes en tinta; acepta `icono` | 530 `<button>` sueltos, al tocar cada pantalla |
| `Dialogo` | cambia | Marco de 2 px, cabecera con filete, pie fijo | 36 ficheros con `.modal-overlay` a mano |
| `Pestanas` | cambia | Las que no caben pasan a «Más · N»; la activa siempre visible | El desplazamiento lateral |
| **`Icono`** | nueva | Un SVG por nombre, `currentColor`, trazo 1,5 | 332 emoji. Unos 30–40 iconos distintos |
| **`Lista`** | nueva | Desplegable propio: hoja en táctil, bajo el campo en escritorio; teclado completo | 86 `<select>` en 32 ficheros |
| **`Conmutador`** | nueva | Dos a cuatro opciones; activo = inversión de tinta | Trimestre, vista, y los `<select>` cortos |
| **`Nota`** | nueva | Pinta una nota en filete o relleno según la preferencia del aparato | 34 fondos en línea y las clases `.cal-N` |
| **`Seccion`** | nueva | Título con filete y contenido, sin caja | 118 `.card` |
| **`Acerca`** | nueva | Versión, compilación, datos, licencia, créditos | El pie de 10 px |

Además: `utils/confirmar.tsx` (hereda de `Dialogo`), `utils/foco.ts` (sin
cambios: sigue colgando de `.modal-overlay`) y un módulo nuevo `version.ts`
que lee la versión de `package.json` y la fecha de compilación desde
`vite.config.ts` (`define`).

### D. Marco

| Fichero | Qué |
|---|---|
| `src/App.tsx` | `NAV` con nombre de icono y nombre corto; menú en tres formas; pie del menú = estado del aparato (copia, versión, plegar); colofón al final de la página; barra inferior en móvil |
| `src/components/BarraClase.tsx` | Barra superior de 56 px con `Lista` y `Conmutador`. Hoy lleva un punto con el color de la clase y «⚙ Configurar» |
| `src/components/ActualizacionApp.tsx` | El aviso de versión nueva pasa a la fila de versión del menú, además del aviso actual |
| `src/components/EstadoConexion.tsx`, `InstalarApp.tsx`, `AvisoCopia.tsx` | Avisos flotantes en papel y filete |
| `frontend/index.html` | `theme-color` (hoy azul `#0f2d4a`) al papel; estilo de la barra de estado de iOS |
| `frontend/vite.config.ts` | `theme_color` y `background_color` del manifiesto; `define` de versión |

### E. Pantallas

Estilos en línea por zona (suman los 2.551). El trabajo de cada una es el
mismo: quitar estilos en línea, emoji y colores sueltos, y pasar a las piezas
comunes.

| Zona | Ficheros | Estilos en línea | Los más cargados |
|---|---|---|---|
| Exámenes y rúbricas | 15 | 611 | `PruebaEditor` 159 · `RubricaEditor` 102 · `InformePrueba` 64 · `ExamenesConHoja` 51 |
| Calificador | 20 | 564 | `CeldaEvaluacion` 112 · `EvaluacionPage` 66 · `EvaluacionRapida` 49 · `SesionRubrica` 40 |
| Programación e instrumentos | 9 | 430 | `ProgramacionPanel` 102 · `AsignaturasPanel` 69 · `ImportarProens` 59 · `InstrumentosManager` 50 |
| Seguimiento, tutorías, informes, asistencia, planificación, inicio | 14 | 393 | `SesionesPage` 50 · `AnalisisAlumno` 47 · `TutoriaEditor` 45 · `TutoriasPage` 44 |
| Clase y alumnado | 13 | 321 | `AlumnosPage` 74 · `GruposPage` 69 · `MedidaRefuerzo` 39 |
| Sincronizar y sistema | 15 | 220 | `SincronizarPage` 70 · `EmparejarDirecto` 28 |
| Marco | 4 | 12 | — |

Doce ficheros concentran casi el 40 % (997 de 2.551).

### F. Fuera de las pantallas

| Fichero | Qué | ¿Se toca? |
|---|---|---|
| `src/ia/instrumentosConfig.ts` | Icono (emoji) y color de cada tipo de instrumento | Sí: el emoji pasa a nombre de `Icono` |
| `src/ia/pruebaImportar.ts`, `rubricaPlantillas.ts`, `db/queries.ts` | Emoji en textos y mensajes | Sí |
| `src/informes/lamina.ts` | Paleta de los informes (mundos vivos) | Decisión abierta 2 |
| `src/marca.ts`, `scripts/generar_iconos.py` | El corro con mundos vivos; icono de la app sobre azul `#0f2d4a` | Decisión abierta 3 |
| `src/nativo/impresoraWeb.ts` | Vista previa de impresión en Safari, con azul y grises a mano | Sí |
| `src/utils/qrSheet.ts` | Hoja de QR de mesa, en azul | Sí, es un documento |
| `src/db/informePrueba.ts` | Colores del gráfico radial | Con los informes |
| `android/…/values/*.xml`, `ios/…/Assets.xcassets` | Fondo del icono, splash, color primario | Con el icono de la app |

## 4. Lo que no se toca

- **Datos, cálculo y sincronización**: nada de `db/`, salvo el color que devuelve `calificativo()`. Sin esquema nuevo.
- **Semáforo de notas** (`--cal-*`) y **colores de instrumento** (Okabe-Ito): llevan información y ya cumplen contraste.
- **El color de cada clase** (`grupo.color`): es un dato del docente.
- **Hojas de respuestas** (`db/hojaOMR.ts`, `informes/hojasTest.ts`): su geometría es el contrato con el escáner.
- **AulaMap** (`public/aulamap/`): código ajeno, AGPL. Solo cabe retocar `miclase-puente.css`; dentro del plano seguirá viéndose distinto.
- **Lo que dibuja el sistema**: hoja de compartir, diálogo de imprimir, selector de ficheros, permisos, teclado.
- **Los 44 px táctiles** y el foco retenido de los diálogos.
- **Los `data-…`** en los que se apoyan las pruebas.

## 5. Las pruebas

El aspecto casi no se prueba, pero dos cambios sí las rompen:

| Cambio | Alcance en `pruebas/` | Cómo se resuelve |
|---|---|---|
| Emoji → icono | 74 líneas en 24 ficheros buscan un botón por su texto con emoji («⚙ Instrumentos», «✅ Guardada…») | El icono va con `aria-hidden`; el nombre del botón queda sin emoji. Cambio mecánico, fichero a fichero |
| `<select>` → `Lista` | 133 `selectOption` en 29 ficheros | Un ayudante `elegirOpcion(p, selector, valor)` en `pruebas/lib/entorno.mjs` que sirva para los dos, y se migra con cada sustitución |
| Clases de aspecto | `.cal-N` (25 usos), `.sidebar` (7), `.card` (4) | Mantener `.cal-N` en la pieza `Nota`; dar `data-…` al menú |
| Estilo calculado | 3 ficheros (`e2e`, `planilla-ui`, `prueba-escrita-ui`) | Revisar a mano |

Falta una prueba nueva: que ninguna pestaña, entrada de menú ni dato de la
barra quede cortado en cuatro anchos. Ya está escrita para la maqueta y se
puede llevar a la app.

## 6. Orden propuesto

Cada fase deja la app entera y desplegable. Ninguna toca datos.

| Fase | Qué | Ficheros | Riesgo |
|---|---|---|---|
| **0. Cimientos** | Tokens, fuentes, `Icono`, `version.ts`. Casi sin cambio visible | `index.css`, 2 nuevos, `vite.config.ts` | Bajo |
| **1. Marco** | Menú, barra superior, pie, versión, «Acerca de», barra inferior, color del sistema | `App.tsx`, `BarraClase`, 4 avisos, `index.html` | Medio: se ve en todas las pantallas |
| **2. Piezas comunes** | `Boton`, `Dialogo`, `Pestanas`, `Lista`, `Conmutador`, `Nota`, `Seccion`; clases de `index.css` a papel y tinta | `comunes/`, `index.css` | Medio: cambia el aire de todo, y deja a medias el interior de las pantallas |
| **3. Calificador** | La pantalla que más se usa, entera | 20 ficheros, 564 estilos | Alto: es donde se califica |
| **4. Exámenes y rúbricas** | Editor de examen, rúbrica, corrector, escáner | 15 ficheros, 611 estilos | Alto por volumen |
| **5. Resto** | Programación, clase, seguimiento, tutorías, informes, sincronizar | 51 ficheros, 1.364 estilos | Bajo por pantalla; largo |
| **6. Documentos e identidad** | Informes, QR de mesa, icono de la app, splash | Según decisiones 2 y 3 | Cambia lo impreso y el icono |

Entre la fase 2 y la 5 la app convive con dos aspectos: marco y piezas en
Lámina, e interior de las pantallas pendientes con sus colores de antes. Es
inevitable si no se quiere una reescritura de golpe.

## 7. Decisiones abiertas

1. ~~Qué canon manda~~ **Decidido (23·11·2026): la paleta de la skill manda para todo** — app, informes y canon. Queda como tarea aparte, fuera de este repositorio, actualizar `edumind.es/design/lamina.html` y la hoja vendorizada (v1.1), que aún dicen mundos vivos; hasta entonces MiClase redefine los colores en su hoja.
2. ~~Informes~~ **Decidido: pasan a la paleta de la skill y siguen saliendo sobre blanco al imprimir**, por ahorro. La regla ya existe (`@media print` de `informes/lamina.ts`: hoja blanca y franja en filete fino) y no se toca; el papel crudo es solo de pantalla y del `.html` descargado. Pendiente técnico: una variante oscura de cada mundo para texto, porque los desaturados no llegan a 4,5:1 como color de cifra.
3. **Icono de la app y splash.** Son azul `#0f2d4a` con el corro en colores vivos. ¿Se rehacen en papel y tinta? Cambia el icono en los aparatos donde ya está instalada.
4. **Tipografía.** Outfit + IBM Plex Mono (ya dentro de la app) o Archivo + JetBrains Mono (las de la skill).
5. ~~Número de versión~~ **Decidido (23·11·2026): el aspecto Lámina sale como 2.0.0**, con protocolo de versiones de verdad. Ver la sección 8.
6. **Modo noche.** El canon vendorizado trae una variante «noche»; la app no tiene modo oscuro. ¿Entra o queda fuera?
7. ~~Galego~~ **Decidido (23·11·2026): se fusiona antes.** Ver la sección 9: la fase 1 de galego no está en ningún commit.

## 8. Versiones

**Lo que hay hoy en MiClase** (comprobado el 23·11·2026):

| Dónde | Dice |
|---|---|
| `package.json` (raíz, `frontend/`, `backend/`) | 0.1.0, sin tocar desde el principio |
| Pie del menú (`App.tsx`) | «v1.0», escrito a mano |
| iOS (`MARKETING_VERSION` / build) | 1.0 / 1 |
| Android (`versionName` / `versionCode`) | 1.0 / 1 |
| `CHANGELOG.md` | no existe |
| Etiquetas de git | ninguna |
| `desplegar.sh` | no mira ni escribe versión; las publicadas se llaman por fecha |

Tras 124 PR, la app no tiene ni un número que haya subido una vez. El protocolo sí existe en el ecosistema: diez proyectos EDUmind llevan `CHANGELOG.md` (Keep a Changelog + versión semántica) e Hilo lee la versión de `package.json` al compilar para pintarla en el pie. En MiClase no se aplicó nunca.

**Propuesta: el mismo protocolo que Hilo, con un candado para que no se vuelva a soltar.**

1. **Una sola fuente**: `version` del `package.json` de la raíz. Los de `frontend/` y `backend/` la copian.
2. **La app la lee al compilar** (`define` de Vite → `version.ts`): el pie y «Acerca de» no se escriben a mano nunca más. «Acerca de» añade la fecha de compilación.
3. **`CHANGELOG.md`** en castellano, formato Keep a Changelog, una entrada por versión.
4. **Regla de subida**: mayor = cambia cómo se usa la app o exige actualizar todos los aparatos (esquema Dexie); menor = función nueva; parche = arreglo.
5. **El candado** es una prueba rápida (`version.test.ts`, entra en `git commit` y en `desplegar.sh`): falla si los tres `package.json` no coinciden, si la versión no tiene entrada en el `CHANGELOG`, o si iOS o Android dicen otra versión pública.
6. **`desplegar.sh`** pone la etiqueta `vX.Y.Z` al publicar y comprueba que la web servida dice esa versión.
7. iOS: `MARKETING_VERSION` y el build se suben en Xcode (el `project.pbxproj` no se edita a mano); la prueba solo avisa de que no coinciden.

**Punto de partida, a confirmar por Luis**: lo que hoy está en producción se sella como **1.0.0** (es lo que dicen el pie y los proyectos nativos) con una entrada de resumen; lo que entre hasta Lámina sube menores (1.1.0, 1.2.0…); el aspecto Lámina es la **2.0.0**. El protocolo se monta en la fase 0, antes de cualquier cambio visual.

## 9. Lo que hay que fusionar antes

**Galego no está en una rama: está sin guardar.** La rama que anotó este documento (`claude/educational-info-galego-695c2d`) no tiene ningún commit; solo una página de divulgación suelta. La fase 1 de verdad está en el worktree `galician-language-install-d90c65`, **sin ningún commit desde el 15·11·2026**: 11 ficheros cambiados y 7 nuevos (`frontend/src/i18n/`, `ElegirIdioma`, la página Instalar, sus dos pruebas, `distribucion/` y `scripts/empaquetar_descargable.sh`, que es la versión descargable). No está en `main` ni en producción, y una limpieza de worktrees se lo llevaría.

Su base está 22 commits por detrás de `main`, y `main` ha tocado 6 de sus 11 ficheros: `CLAUDE.md` (177 líneas), `App.tsx` (29: salió «Alumnado» del menú, entraron los equipos), `pruebas/ejecutar.mjs` (17), `index.css` (13), `pruebas/lib/entorno.mjs` (13) y `main.tsx` (3). Hay choques que resolver a mano.

Orden:

1. Commit de lo que hay en ese worktree, tal cual (pone el trabajo a salvo).
2. Traer `main` a esa rama y resolver los seis ficheros.
3. Pruebas afectadas (`idiomas`, `idioma-ui`, `aterrizaje-ui`, `e2e`) y después la tanda completa.
4. PR, revisión de Luis, fusión. El despliegue lo decide Luis.
5. Poner esta rama de Lámina al día con `main`: también está 22 commits atrás, y **el menú de las maquetas hay que repasarlo** contra el de `main` (sin «Alumnado», con selector ES/GL).

Consecuencia para Lámina: todo texto del marco nuevo (menú, nombres cortos del menú plegado, «Más», «Acerca de», estado del aparato) nace ya en `i18n/textos.ts`, en castellano y galego.

## 10. Que llegue entero: despliegue y visualización

### Lo comprobado: no hace falta tocar el servidor

| Qué | Estado |
|---|---|
| CSP de nginx | Vale tal cual: `style-src 'unsafe-inline'`, `img-src data:`, `font-src 'self' data:`. Iconos SVG en línea, flecha en data URI y fuentes propias pasan. **No se toca nginx** |
| Fuentes | Outfit e IBM Plex Mono ya están en `public/fonts/` (62 KB) y el service worker ya precachea `woff2`: funcionan sin red. Falta declararlas en `index.css` con `font-display: swap` |
| Service worker | Cada compilación se precachea entera y se cambia de golpe (`ActualizacionApp`): nadie ve media hoja nueva y media vieja |
| Informes y hojas de respuestas | Llevan su CSS dentro del documento: los tokens de la app no les llegan |
| Datos | Nada toca Dexie, sync ni backend. No hay que reiniciar el servicio |

### Riesgos encontrados

1. **iPad con iOS 15.** El proyecto nativo admite desde iOS 15.0 y las *container queries* de la maqueta piden Safari 16. **En la app no se usan**: la forma del marco (ancho, plegado, móvil) la decide `ResizeObserver` y la escribe en `data-forma`, que funciona en todos. Tampoco `:has()` ni `color-mix()`. Vite no arregla CSS que el navegador no entiende.
2. **Dos aspectos a medias en producción.** Entre la fase 2 y la 5 habría pantallas nuevas y viejas mezcladas a la vista de quien use la app. Propuesta: los tokens nuevos viven bajo `:root[data-aspecto="lamina"]` y **producción sigue como está** hasta la 2.0.0. Cada fase se fusiona en `main` (ramas cortas: hay más de treinta worktrees abiertos y una rama larga chocaría con todos), Luis enciende el aspecto en su iPad desde «Acerca de» para verlo de verdad, y la 2.0.0 es cambiar el valor por defecto. Pasar los colores a mano de las pantallas a tokens no cambia nada con el aspecto apagado.
3. **`desplegar.sh` solo comprueba que la web responde**, no cómo se ve. Dos pruebas nuevas, que entran en `npm test` y por tanto en cada despliegue:
   - **«Nada cortado»**: cada pantalla del menú a 1440, 1180×820, 820×1180 y 390×844, con el aspecto encendido; falla si algo desborda el marco, si un texto de botón o pestaña queda partido o si algo táctil mide menos de 44 px. Es el script con el que se comprobaron las maquetas.
   - **Trinquete**: cuenta radios, sombras, degradados, emoji, `<select>` y colores a mano en `frontend/src`; la cifra solo puede bajar. Así ninguna pantalla nueva vuelve atrás y se ve cuánto queda.
4. **Las pruebas que hay se rompen por el camino**: 74 selectores con emoji, 133 `selectOption`, 25 usos de `.cal-N`. Cada fase arregla las suyas en el mismo PR; `entorno.mjs` gana `elegirEnLista()` para que cambiar un `<select>` por la lista propia sea una línea por prueba.
5. **AulaMap** es código ajeno (AGPL) con su propio aspecto: dentro del plano se seguirá viendo distinto. Solo se puede ajustar lo nuestro (`miclase-puente.css`).
6. **Icono y color del sistema**: en una app ya instalada en la pantalla de inicio, iOS no cambia el icono ni el color de la barra hasta que se quita y se vuelve a añadir. Hay que decirlo en las notas de la 2.0.0.
7. **Apps nativas**: no se actualizan con `desplegar.sh`. Hace falta compilar en el Mac (`nativo:sync`, Xcode) y subir versión y build.

### Lo que no se puede comprobar desde el servidor

Chromium de pruebas no es Safari. Al cerrar cada fase, con el aspecto encendido, Luis mira en: iPad en Safari, iPad con la app instalada en la pantalla de inicio (zona de la hora y la batería), un móvil Android, y un escritorio que no sea Mac. Lector de pantalla (VoiceOver) al menos en el marco y en la lista propia.

### La fase 0, corregida

Protocolo de versiones (sección 8) → tokens bajo `data-aspecto` → fuentes → `Icono` → las dos pruebas nuevas. Nada visible cambia en producción.

## 11. Hubs y color de área

**Decidido por Luis (24·11·2026)** sobre `MAQUETA_LAMINA_HUBS.html`: hub en **mosaico** y color de área con **filete y papel teñido**.

| Qué | Cómo queda | Dónde se toca |
|---|---|---|
| **Hub de áreas** | Entrada del Calificador sin área elegida: «Seguir donde lo dejaste» y una casilla por área (sigla, unidad en curso, calificado del trimestre, lo que pide atención, atajo a sus pruebas) | `EvaluacionPage` (vista nueva cuando no hay área), datos de `getResumenCurso` y de los avisos que ya calcula la matriz |
| **Hub de exámenes** | Las áreas dejan de ser pestañas: cola «Por corregir» de toda la clase, mosaico de áreas, y modelos y otras clases en filas al final. Dentro de un área, lo de hoy (`AreaDeExamenes`) | `ExamenesConHoja` (fuera `Pestanas` de áreas) |
| **Color de área** | Franja bajo la barra superior y cabecera sobre papel teñido dentro de un área; filete y papel teñido en cada casilla del hub; sigla de color en el selector de área | `BarraClase`, cabecera de página del marco, pieza nueva `Sigla` |
| **Dato** | `Asignatura.color` y `Asignatura.sigla`, sin índice ni versión de esquema (como `Instrumento.color`); sin ellos, color por orden entre las áreas de la clase y sigla sacada del nombre. Se editan en Mis clases → Áreas | `localDb.ts` (tipo), `queries.ts`, panel de áreas |

Reglas: el color nunca va solo (siempre con la sigla); vive en el marco y en los hubs, nunca dentro de la tabla, donde mandan el semáforo de notas y el color de instrumento; diez tonos apagados con 4,5:1 o más bajo la sigla en blanco; el papel teñido se calcula (9 % del color sobre el papel), sin `color-mix`.

Pendiente de confirmar: los diez colores concretos, el 9 % del teñido y el reparto automático al crear el área. Entra en la fase 1 (marco) la franja y la sigla, y en las fases 3 y 4 cada hub. Afecta a las pruebas que eligen área por pestaña en «Exámenes y pruebas» (`examenes-area-ui.test.mjs`).

## 12. Modelo aprobado

**24·11·2026**: Luis da por bueno el modelo tras recorrer `MAQUETA_LAMINA_NAVEGACION.html`, el prototipo con las diez pantallas del menú. Ese fichero es la referencia de lo que se construye; las otras tres maquetas quedan como historia de cómo se llegó (aspecto, estructura, hubs).

Orden de arranque, cada paso con su visto bueno:

1. Poner a salvo las maquetas y este documento con un commit en esta rama.
2. Galego: commit de la fase 1 en su worktree, traer `main`, resolver y PR (sección 9).
3. Poner esta rama al día con `main`.
4. Fase 0: protocolo de versiones, tokens tras `data-aspecto`, fuentes, `Icono` y las dos pruebas nuevas (secciones 8 y 10).

## 13. Decisiones del 24·11·2026 (cierran las propuestas abiertas)

| Asunto | Decisión de Luis |
|---|---|
| Versión de lo que hay hoy | **1.9.0** (no 1.0.0): la app ha crecido mucho desde la primera. Lámina es la 2.0.0. iOS y Android se suben a mano en Xcode y Android Studio |
| Qué se ve en producción durante las fases | **Nada hasta la 2.0.0**: aspecto nuevo tras `data-aspecto`, apagado por defecto; Luis lo enciende en su aparato |
| Colores de área | **Valen los diez del prototipo** como paleta de partida; cada área se puede cambiar en Mis clases → Áreas |
| «Instalar» y selector ES/GL | **Dentro de «Acerca de»**, junto a versión y notas en filete o relleno. El menú se queda en diez entradas |
| Publicación | Solo GitHub (PR 134); sin dirección web para el prototipo |
| Galego | Fusionado en `main` (PR 133) |

Esto corrige la sección 8: el punto de partida es 1.9.0, no 1.0.0.

Se da por buena la tipografía del prototipo aprobado (Outfit + IBM Plex Mono, las que la app ya empaqueta). Siguen abiertos, para la fase 6: icono de la app y splash, y modo noche.

### Fase 0 en cuatro PR cortos

| PR | Qué | Se ve en producción |
|---|---|---|
| **0a. Versiones** | `version` 1.9.0 en los tres `package.json`, `CHANGELOG.md`, `version.ts` leída al compilar, pie del menú sin número a mano, `version.test.ts`, etiqueta en `desplegar.sh` | El pie pasa de «v1.0» a «v1.9.0» |
| **0b. Interruptor y tokens** | `data-aspecto` en `<html>` (preferencia del aparato), tokens de Lámina bajo `:root[data-aspecto="lamina"]`, fuentes declaradas | Nada |
| **0c. Iconos** | Pieza `Icono` con la familia del prototipo | Nada |
| **0d. Pruebas** | «Nada cortado» y trinquete | Nada |

## 14. Estado a 24·11·2026: qué está hecho y qué falta

Lámina sigue **apagada por defecto**. Se enciende en un aparato con `?aspecto=lamina` y se apaga en «Acerca de» → «El de siempre».

### Hecho

| Fase | Qué | PR | En producción |
|---|---|---|---|
| Previo | Galego, fase 1, y versión descargable | 133 | 1.9.0 |
| 0a | Protocolo de versiones: un número, `CHANGELOG`, candado, etiqueta al desplegar | 135 | 1.9.0 |
| 0b | Interruptor, tokens y fuentes | 136 | 1.9.0 |
| 0c | Familia de iconos y pieza `Icono` | 137 | 1.9.0 |
| 0d | Trinquete y «nada cortado» | 138 | 1.9.0 |
| 1 | Marco: menú en tres formas, barra superior, «Acerca de», pieza `Lista` | 139 | 1.9.0 |
| 2 | Piezas comunes y 255 colores de aviso con nombre | 140 | 1.10.0 |
| 3 | Tabla del Calificador, notas en filete o relleno, hub de áreas, sigla y color por área | 141 | 1.10.0 |
| 3 | Selector de color y sigla en Mis clases → Áreas | 142 | 1.10.0 |
| 4 | Hub de áreas en «Exámenes y pruebas» | 143 | 1.11.0 |
| — | Pestañas que no se cortan, aspa como icono, desplegables iguales cerrados | 144 | 1.11.0 |

Arreglos que salieron por el camino y afectan también al aspecto de siempre: Asistencia cabe en el móvil (el pase de lista quedaba en 78 px).

### Lo que cambió respecto al plan

- **Fases más cortas y encadenadas.** Cada PR va sobre el anterior y se fusiona al pasar las pruebas de GitHub; un despliegue recoge varios.
- **El hub de áreas es una ruta propia** (`/areas`), no un estado del Calificador: así los enlaces con área y unidad entran directos y el Calificador no cambia.
- **Notas**: obedecen a filete o relleno las casillas con clase `.cal-N`. Las que un diálogo pinta en línea siguen en relleno.
- **La cola «Por corregir»** del hub de exámenes no está: `listarPruebas` no trae cuántos alumnos lleva corregidos cada examen.
- **El trinquete solo exige lo que ya tiene sustituto** (radios, sombras, degradados, emoji). Desplegables, colores a mano y estilos en línea se cuentan y se exigirán después.

### Lo que falta para la 2.0.0

| Qué | Tamaño | Nota |
|---|---|---|
| Interior de las pantallas | ~2.700 estilos en línea en 98 ficheros | Con Lámina ya siguen la paleta y las piezas; falta su composición. Empezar por Inicio, Calificador y el panel de la casilla |
| Emoji | 365 | Quitarlos cambia también el aspecto de siempre: van al final, o condicionados al aspecto |
| Desplegables dentro de las pantallas | 95 `<select>` | Cerrados ya se ven igual; pasar a `Lista` los de uso diario. Las pruebas usan `selectOption` en 133 sitios |
| Notas pintadas en línea | 14 ficheros | Explicación de la nota, pasadas de clase, corrector, análisis |
| Cola «Por corregir» | Una consulta | Contar correcciones por examen sin calcular notas |
| Color de área en Planificación | Pequeño | En el prototipo, cada sesión lleva el color de su área |
| Identidad | Icono, splash, `theme-color` del manifiesto | Decisión 3, abierta |
| Pruebas de pantalla en Lámina | ~90 suites | Hoy corren con el aspecto de siempre. Antes de encender por defecto hay que pasarlas |
| Encender por defecto | Un valor | Es la 2.0.0 |

### Lo que no se ha podido comprobar

Todo se ha visto en Chromium (escritorio, iPad horizontal y vertical, móvil) y en la web publicada. No en un iPad real, ni en Safari, ni en la app instalada en la pantalla de inicio, ni con lector de pantalla.
