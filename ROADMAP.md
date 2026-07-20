# Roadmap — EDUmind MiClase

Objetivo: alternativa open source, gratuita y local-first a iDoceo/Additio.
Diferencial: evaluar en vivo con criterio LOMLOE y evidencia en menos de 10
segundos (QR de mesa → panel táctil → nota + foto).

## Completado

- **Fase 1 — Evaluación con QR**: hoja imprimible de QR por grupo (solo códigos
  anónimos, nunca nombres), escáner con cámara (`BarcodeDetector` nativo, sin
  dependencias; fallback de código manual), panel de evaluación rápida táctil
  con criterios LOMLOE, niveles de rúbrica (convertidos a escala 0-10) y
  teclado de notas.
- **Fase 2 — Evidencias**: foto de producciones desde el panel rápido
  (comprimida a JPEG ≤1600px), galería por alumno con vista ampliada,
  descarga y borrado; incluidas en el backup cifrado (formato v3, blobs en
  base64) y en el informe PDF.
- **Fase 3 — Nivel cuaderno profesional**: plano de clase táctil por grupo
  (toque en alumno → evaluación rápida; encaja con los QR de mesa), informe
  individual PDF (detalle por criterio y trimestre + observaciones +
  evidencias), diario de sesión editable, currículo cacheado 7 días para
  evaluar sin conexión, almacenamiento persistente solicitado al navegador.

## Fase 4 — pendiente (requiere decisiones e instalación de toolchains)

1. **iPad de verdad (Capacitor)**: Safari puede purgar IndexedDB tras ~7 días
   sin uso. Para competir con iDoceo en su terreno hay que empaquetar la app:
   `npm i @capacitor/core @capacitor/cli && npx cap init` + plataforma iOS
   (necesita macOS/Xcode). La app web actual funciona sin cambios dentro del
   contenedor. Mientras tanto: Android/Chrome no tienen ese problema y el
   almacenamiento persistente ya se solicita.
2. **Sincronización multi-dispositivo cifrada de extremo a extremo**: el
   servidor solo almacenaría blobs cifrados con la contraseña del docente
   (mismo esquema AES-256-GCM del backup). Es el problema difícil — diseñar
   con calma (¿last-write-wins por tabla? ¿CRDTs?).
3. **Evidencias de audio/vídeo**: el modelo de datos ya lo contempla
   (`evidencias.tipo`); falta la captura y los límites de tamaño.
4. **Publicación open source**: elegir licencia (sugerencia: AGPL-3.0 para
   proteger el trabajo, o MIT para máxima adopción), README público,
   capturas, y repositorio en GitHub/Codeberg.
