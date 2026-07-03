# edumind_miclase — Contexto del proyecto

## Qué es
App EDUmind MiClase. Backend Node/Fastify + SQLite (better-sqlite3), auth dual (local + Authentik OIDC) y exportación cifrada AES-256. Frontend React/Vite + TypeScript. Incluye currículum educativo por comunidad autónoma (aragon, canarias, clm, cyl...).

## Arquitectura
edumind_miclase/
├── backend/          ← Fastify (Node ESM). Entrada: src/index.js
│   ├── data/         ← SQLite (miclase.db)
│   ├── src/plugins/auth.js  ← auth dual local + Authentik OIDC
│   └── src/routes/auth.js
├── frontend/         ← React + Vite + TypeScript
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
