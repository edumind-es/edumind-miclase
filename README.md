# EDUmind MiClase

**Cuaderno del profesorado local-first con evaluación LOMLOE por criterio e
instrumento.** Alternativa libre y gratuita a iDoceo y Additio.

> **Los datos del alumnado no salen del dispositivo del docente.** No es una
> política que prometemos cumplir: es la arquitectura. El servidor no tiene
> ninguna tabla donde quepan un nombre, una nota o una fotografía en claro.
> Ver [PRIVACIDAD.md](PRIVACIDAD.md).

---

## La idea

**La programación manda.** Cada unidad decide con qué instrumento se evalúa cada
criterio LOMLOE. El calificador solo obedece: al pulsar una casilla muestra el
criterio, el instrumento que le toca y su rúbrica. Un criterio sin instrumento
sale rayado y explica cómo arreglarlo, en vez de dejarte poner una nota a ciegas.

El objetivo de diseño es evaluar en vivo, en el gimnasio o en el patio, con
evidencia registrada en menos de diez segundos: **QR de mesa → panel táctil →
nota + foto**.

## Qué sabe hacer

- **Evaluación rápida con QR**: hoja imprimible de códigos por clase (solo
  códigos anónimos, nunca nombres), escáner con la cámara y panel táctil con
  criterios, rúbricas y teclado de notas.
- **Plano de clase**: toque en el alumno → evaluación rápida.
- **Evidencias**: foto, audio con cronómetro y vídeo, con galería por alumno.
- **Motor de cálculo real**: peso de instrumento → nota de criterio → peso de
  criterio → nota de área → pesos de trimestre → nota final, con escala
  cualitativa LOMLOE. Un trimestre sin datos no cuenta como cero.
- **Informes imprimibles**: informe individual, informes de clase, boletín y
  acta de área, con las tipografías incrustadas en el `.html` descargado.
- **Funciona sin conexión**: el currículo se cachea 7 días; empaquetada como app
  nativa (Capacitor) arranca sin cobertura.
- **Sincronización multi-dispositivo cifrada de extremo a extremo**: sobres
  AES-256-GCM que el servidor no puede abrir, o enlace directo entre
  dispositivos por WebRTC, sin servidor de por medio.
- **Currículum LOMLOE por comunidad autónoma** incluido.

## Arquitectura en dos líneas

Frontend **React + Vite + TypeScript** con todos los datos de aula en IndexedDB
(Dexie). Backend **Node/Fastify + SQLite** que sirve únicamente el currículo
(datos públicos), la autenticación y un buzón de sincronización cifrado del que
solo ve tabla, id, fecha y `ciphertext`.

```
backend/     Fastify (Node ESM). Currículo, auth y buzón E2E
frontend/    React + Vite + TS. El cuaderno entero vive aquí
  src/db/    localDb.ts · queries.ts · calculo.ts · sync.ts
curriculum/  Currículum LOMLOE por CCAA
pruebas/     Suite de pruebas (unidad, API e interfaz con Playwright)
scripts/     Parseo de currículo y generación de iconos
```

## Arrancar en local

Requiere **Node 18 o superior** (el CI usa Node 22).

```bash
git clone https://github.com/edumind-es/edumind-miclase.git
cd edumind-miclase

npm install
(cd backend && npm install)
(cd frontend && npm install)

cp backend/.env.example backend/.env
# Edita backend/.env: JWT_SECRET necesita 32+ caracteres propios.
# Genera uno con:  openssl rand -hex 32

npm run seed        # carga el currículo en SQLite
./start-dev.sh      # backend en :3270 + frontend en :5173
```

Abre <http://localhost:5173>. Sin `AUTHENTIK_CLIENT_ID` el login SSO queda
desactivado y la app funciona en modo local, que es lo normal en desarrollo.

## Pruebas

```bash
npm test            # suite completa
npm run test:rapido # sin las pruebas de interfaz (más rápido)
```

Las pruebas de interfaz necesitan Playwright:
`npx playwright install chromium`.

## Documentación

| Documento | Para qué |
|---|---|
| [PRIVACIDAD.md](PRIVACIDAD.md) | Qué datos se tratan, dónde viven y qué ve el servidor. Escrito también para responsables de protección de datos de un centro |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Cómo colaborar: entorno, convenciones e invariantes que no se deben romper |
| [ROADMAP.md](ROADMAP.md) | Qué está hecho y qué viene |
| [DESPLIEGUE.md](DESPLIEGUE.md) | Puesta en producción y compilación nativa iOS/Android |
| [CLAUDE.md](CLAUDE.md) | Contexto técnico e invariantes del proyecto |

## Colaborar

Se agradece especialmente la ayuda del profesorado en:

- **Currículum de otras comunidades autónomas** — no hace falta saber programar.
- **Probar en aula real** y contar qué falla, en
  [Issues](https://github.com/edumind-es/edumind-miclase/issues).
- **Traducción** (gallego, catalán, euskera, valenciano).
- Código: ver [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

Licencia doble **AGPL-3.0-or-later** *o* **EUPL-1.2**, a elección de quien la
reutilice. Ver [LICENSE](LICENSE) y [NOTICE](NOTICE).

EDUmind® es marca registrada. El código es libre; la marca y los logotipos no
se ceden con él — ver [TRADEMARKS.md](TRADEMARKS.md).

Por **Luis Vilela Acuña** — maestro de Educación Física
(Pontevedra).
