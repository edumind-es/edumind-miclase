#!/usr/bin/env bash
#
# Despliegue de EDUmind MiClase.
#
#   ./desplegar.sh              pruebas, compilar y publicar
#   ./desplegar.sh --volver     deshacer: volver a la versión anterior
#   ./desplegar.sh --sin-pruebas   publicar sin pasar las pruebas (a tu riesgo)
#
# Nunca se dispara solo: lo lanzas tú.
#
# Por qué existe: `npm run build` vacía `frontend/dist`, que es exactamente el
# directorio que sirve nginx. Durante la compilación la app estaba a medias, y
# si la compilación fallaba se quedaba rota sin forma rápida de volver atrás.
# Aquí se compila aparte y se cambia la versión viva de golpe, con un enlace
# simbólico: el cambio es instantáneo y volver atrás también.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASES="$RAIZ/frontend/releases"
VIVA="$RAIZ/frontend/dist"
SERVICIO="edumind-miclase-api"
URL="https://miclase.edumind.es"
CONSERVAR=5

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] && { rojo "No lo lances como root."; exit 1; }

# ── Cambiar la versión viva, de golpe ───────────────────────────────────
# `ln` seguido de `mv -T` es atómico: no hay ni un instante en que nginx vea
# un directorio a medias.
publicar() {
  local destino="$1"
  # Relativo, no absoluto: el enlace vive dentro de frontend/ y asi no lleva
  # dentro la ruta de esta maquina.
  ln -sfn "releases/$(basename "$destino")" "$RAIZ/frontend/.dist-nueva"
  mv -Tf "$RAIZ/frontend/.dist-nueva" "$VIVA"
}

# ── ¿Responde la app y sirve lo que acabamos de publicar? ───────────────
comprobar() {
  local esperado="$1" intento
  for intento in 1 2 3 4 5 6; do
    sleep 2
    local html
    html="$(curl -fsS --max-time 15 "$URL/?despliegue=$(date +%s)" || true)"
    if [ -n "$html" ] && grep -q "$esperado" <<<"$html"; then return 0; fi
  done
  return 1
}

# ── Volver atrás ────────────────────────────────────────────────────────
if [ "${1:-}" = "--volver" ]; then
  actual="$(basename "$(readlink -f "$VIVA")")"
  anterior="$(ls -1 "$RELEASES" | grep -v "^$actual\$" | sort | tail -1 || true)"
  [ -z "$anterior" ] && { rojo "No hay ninguna versión anterior guardada."; exit 1; }
  gris "Volviendo de $actual a $anterior"
  publicar "$RELEASES/$anterior"
  verde "Hecho. Sirviendo $anterior"
  exit 0
fi

# ── Comprobaciones previas ──────────────────────────────────────────────
cd "$RAIZ"

if [ -n "$(git status --porcelain)" ]; then
  rojo "Hay cambios sin guardar en git. Producción debe salir de un commit:"
  git status --short
  exit 1
fi

rama="$(git branch --show-current)"
[ "$rama" != "main" ] && gris "Aviso: estás desplegando la rama '$rama', no main."

commit="$(git rev-parse --short HEAD)"
anterior_commit=""
[ -L "$VIVA" ] && [ -f "$(readlink -f "$VIVA")/.commit" ] &&
  anterior_commit="$(cat "$(readlink -f "$VIVA")/.commit")"

# ── Pruebas ─────────────────────────────────────────────────────────────
if [ "${1:-}" = "--sin-pruebas" ]; then
  rojo "Publicando SIN pasar las pruebas."
else
  gris "Pasando las pruebas…"
  npm test
fi

# ── Compilar aparte, nunca encima de lo que se está sirviendo ───────────
version="$(date +%Y%m%d-%H%M%S)-$commit"
destino="$RELEASES/$version"
mkdir -p "$RELEASES"
gris "Compilando en releases/$version"
# Desde frontend/, porque vite toma su raiz del directorio de trabajo.
( cd "$RAIZ/frontend" && npx vite build --outDir "$destino" --emptyOutDir )
echo "$commit" > "$destino/.commit"

# La primera vez, `dist` todavía es un directorio de verdad: se guarda como
# versión anterior para poder volver a lo que hay ahora mismo en el aire.
if [ -d "$VIVA" ] && [ ! -L "$VIVA" ]; then
  rescate="$RELEASES/00000000-000000-anterior"
  gris "Guardando la versión actual como $(basename "$rescate")"
  mv "$VIVA" "$rescate"
fi

# ── Backend: solo se reinicia si de verdad ha cambiado ──────────────────
if [ -n "$anterior_commit" ] &&
   git diff --quiet "$anterior_commit" HEAD -- backend/ 2>/dev/null; then
  gris "El backend no ha cambiado: no se reinicia."
else
  gris "Reiniciando $SERVICIO…"
  sudo systemctl restart "$SERVICIO"
  for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -fsS --max-time 5 http://127.0.0.1:3270/api/health >/dev/null 2>&1 && break
    sleep 1
  done
fi

# ── Publicar y comprobar ────────────────────────────────────────────────
paquete="$(basename "$(ls -1 "$destino"/assets/index-*.js | head -1)")"
publicar "$destino"
gris "Publicado. Comprobando que $URL sirve $paquete…"

if comprobar "$paquete"; then
  verde "✓ Desplegado $version"
else
  rojo "✗ La comprobación ha fallado. Volviendo atrás."
  "$RAIZ/desplegar.sh" --volver
  rojo "Producción ha vuelto a la versión anterior. Revisa antes de reintentar."
  exit 1
fi

# ── Limpiar versiones viejas, conservando la viva ───────────────────────
viva="$(basename "$(readlink -f "$VIVA")")"
ls -1 "$RELEASES" | sort -r | tail -n +$((CONSERVAR + 1)) | while read -r vieja; do
  [ "$vieja" = "$viva" ] && continue
  gris "Borrando versión antigua $vieja"
  rm -rf "${RELEASES:?}/$vieja"
done
