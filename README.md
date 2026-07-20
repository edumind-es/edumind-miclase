# EDUmind MiClase

Cuaderno docente **local-first**: grupos, alumnado, evaluación, asistencia,
unidades y rúbricas viven en el navegador del docente (IndexedDB vía Dexie) —
el servidor **no almacena datos personales de nadie**. El backend (Node/Fastify
+ SQLite) solo sirve el currículo oficial (datos públicos LOMLOE por comunidad
autónoma) y la autenticación opcional. Copia de seguridad: exportación cifrada
AES-256 generada en el propio navegador.

App en producción: <https://miclase.edumind.es>

Este repositorio es una release pública saneada para revisión de código,
reutilización educativa y auditoría. No incluye secretos, base de datos ni
configuración de despliegue (ver `OPEN_SOURCE_RELEASE.md`).

## Arquitectura

- `frontend/` — React + Vite + TypeScript (datos de aula en el navegador)
- `backend/` — Fastify (Node ESM): `/api/curriculum` + `/api/auth`
- `curriculum/` — currículo LOMLOE por comunidad autónoma (datos oficiales públicos)

## Desarrollo

```bash
cd backend && cp .env.example .env   # y rellenar
npm install
npm run seed          # siembra el currículo en SQLite
./start-dev.sh        # backend :3270 + frontend :5173
```

## Privacidad

Diseño de minimización de datos: el despliegue público no recibe ni conserva
datos de alumnado. Ver `PRIVACY.md`.

## Licencia

Software libre bajo `AGPL-3.0-or-later OR EUPL-1.2` (ver `LICENSE`).
EDUmind® es una marca registrada; ver `TRADEMARKS.md`.
