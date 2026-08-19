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

## Pendiente

1. **iPad de verdad (Capacitor)**: Safari puede purgar IndexedDB tras ~7 días
   sin uso. Para competir con iDoceo en su terreno hay que empaquetar la app:
   `npm i @capacitor/core @capacitor/cli && npx cap init` + plataforma iOS
   (necesita macOS/Xcode). La app web actual funciona sin cambios dentro del
   contenedor. Mientras tanto: Android/Chrome no tienen ese problema, el
   almacenamiento persistente ya se solicita y la sincronización protege
   frente a una purga.
2. **Evidencias de audio y vídeo**: el modelo de datos ya lo contempla
   (`evidencias.tipo`); falta la captura y los límites de tamaño. Ojo: el
   sobre de sincronización tiene un tope de 8 MB por registro.
3. **Resolución de conflictos más fina**: hoy es last-write-wins por registro.
   Para edición simultánea intensiva convendría bajar a nivel de campo.
4. **Informe de evolución por competencia específica**: agrupar criterios por
   competencia y dibujar el perfil competencial del alumno.
5. **Rúbricas compartibles**: exportar/importar rúbricas entre docentes como
   fichero, sin pasar por el servidor.
