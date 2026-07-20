# Despliegue y actualización — EDUmind MiClase

Infraestructura real (verificada 2026-07-04):

- **nginx**: `/etc/nginx/sites-enabled/miclase.edumind.es.conf` — sirve `frontend/dist`
  con fallback SPA, cabeceras PWA (`sw.js` sin caché, `/assets/` immutable) y
  proxy `/api/` → `127.0.0.1:3270`. SSL Let's Encrypt + Cloudflare origin guard.
- **systemd**: `edumind-miclase-api.service` — backend Fastify con
  `NODE_ENV=production` y toda la configuración como variables de entorno del unit
  (tienen prioridad sobre `backend/.env`).
- **DB**: `backend/data/miclase.db` — solo currículo público + tabla `docentes` (auth).
  Los datos de aula viven en el navegador de cada docente (local-first).

## Secuencia de actualización y despliegue

```bash
cd /var/www/edumind_miclase

# 1. Traer los cambios a main (ejemplo: rama de trabajo de Claude)
git merge claude/fervent-lederberg-85adfe

# 2. Dependencias — solo si cambió algún package.json
(cd backend && npm install)
(cd frontend && npm install)

# 3. Currículo — solo si cambiaron los JSON de curriculum/ o el schema
npm run seed

# 4. Build del frontend (es lo que sirve nginx desde frontend/dist)
npm run build

# 5. Reiniciar el backend
sudo systemctl restart edumind-miclase-api

# 6. Verificar
curl -s https://miclase.edumind.es/api/health        # → {"status":"ok",...}
curl -s https://miclase.edumind.es/healthz            # → miclase ok
systemctl status edumind-miclase-api --no-pager | head -5
```

Notas:
- La PWA usa `registerType: autoUpdate`: los navegadores de los usuarios se
  actualizan solos al recargar tras el despliegue de un build nuevo.
- No hay remoto git: el "deploy" es merge local + build + restart.
- El backend valida al arrancar que `JWT_SECRET` exista y tenga ≥32 caracteres
  cuando `NODE_ENV=production`; si el servicio no arranca tras actualizar,
  revisar `journalctl -u edumind-miclase-api -n 20`.

## Pendientes conocidos (archivos de sistema — cambiarlos a mano)

1. **Typo en el unit systemd**: la variable `JWT_SECRET` tiene el valor con el
   prefijo `JWT_SECRET=` duplicado. Funciona (es solo una cadena más larga),
   pero conviene corregirlo. Mejor aún: mover los secretos del unit a
   `EnvironmentFile=/var/www/edumind_miclase/backend/.env` con permisos 600,
   para que no sean legibles en `systemctl cat`.
   Tras editar: `sudo systemctl daemon-reload && sudo systemctl restart edumind-miclase-api`.
   (Cambiar el secreto invalida las sesiones activas de 7 días — impacto mínimo.)
2. **CSP y la IA local**: la cabecera `Content-Security-Policy` de nginx tiene
   `connect-src 'self'`, que bloquea la descarga del modelo WebLLM
   (Phi-3.5 se baja de huggingface.co / CDN). Si se quiere IA local en
   producción, añadir esos hosts a `connect-src` (y probablemente
   `'wasm-unsafe-eval'` a `script-src`). Mientras tanto, el botón
   "Copiar prompt" para IA externa funciona igualmente.
