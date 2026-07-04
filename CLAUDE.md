# edumind_miclase — Contexto del proyecto

## Qué es
App EDUmind MiClase. **Local-first**: todos los datos de aula (grupos, alumnado, calificaciones, asistencia, unidades, rúbricas) viven en el navegador del docente (IndexedDB vía Dexie) — el servidor NO almacena datos personales de nadie. El backend Node/Fastify + SQLite solo sirve el currículo (datos públicos) y la auth (local + Authentik OIDC). Backup: exportación cifrada AES-256 hecha en el navegador. Frontend React/Vite + TypeScript. Incluye currículum educativo por comunidad autónoma (aragon, canarias, clm, cyl...).

## Arquitectura
edumind_miclase/
├── backend/          ← Fastify (Node ESM). Entrada: src/index.js. Solo /api/curriculum + /api/auth
│   ├── data/         ← SQLite (miclase.db): currículo seeded + tabla docentes (auth)
│   ├── src/plugins/auth.js  ← auth dual local + Authentik OIDC
│   └── src/routes/auth.js
├── frontend/         ← React + Vite + TypeScript
│   └── src/db/       ← localDb.ts (esquema Dexie) + queries.ts — única fuente de verdad de los datos
├── curriculum/       ← currículum por CCAA
├── scripts/
└── start-dev.sh      ← arranca backend (:3270) + frontend (:5173) juntos

## Comandos habituales
- Dev completo: `./start-dev.sh`
- Backend solo: `npm run dev:backend` (puerto 3270)
- Frontend solo: `npm run dev:frontend` (puerto 5173)
- Seed DB: `npm run seed`
- Build: `npm run build`

## Archivos críticos — pedir confirmación SIEMPRE antes de tocar
- `backend/data/miclase.db` — base de datos principal
- `backend/.env` — nunca tocar sin confirmación explícita
- `backend/src/plugins/auth.js` / `routes/auth.js` — auth dual local + OIDC, y exportación AES-256

## Estado
Sin nginx configurado todavía (no detectado en sites-enabled) — de momento vive en desarrollo local, no en producción.

## Lo que NO hacer
- No hacer `npm install` sin avisar
- No tocar `backend/.env` sin confirmación
- No asumir que está desplegado en producción sin comprobarlo primero
