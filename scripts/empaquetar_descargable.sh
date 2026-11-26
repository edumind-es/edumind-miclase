#!/bin/bash
# Monta la versión descargable de MiClase: la app compilada + lanzadores de
# doble clic (Windows, macOS, Linux/Abalar) + docker-compose para el servidor
# del centro, en descargas/miclase.zip.
#
#   ./scripts/empaquetar_descargable.sh             → solo crea el .zip (y lo prueba)
#   ./scripts/empaquetar_descargable.sh --publicar  → además lo sube a GitHub
#                                                     como versión vX.Y.Z
#   ./scripts/empaquetar_descargable.sh --comprobar → no compila: dice si la
#                                                     descarga responde y de
#                                                     qué versión es
#
# La página «Instalar MiClase» enlaza siempre la última versión publicada en
# GitHub (releases/latest/download/miclase.zip): el fichero se tiene que
# llamar exactamente así. GitHub, y no este servidor, es lo que hace que la
# descarga siga viva aunque EDUmind cierre.
#
# La descargable lleva el MISMO número que la app (package.json) y se publica
# sobre la etiqueta vX.Y.Z que pone desplegar.sh: primero se despliega, se sube
# la etiqueta (git push origin vX.Y.Z) y después se publica el .zip. Estuvo
# seis versiones sin publicar (nov 2026) porque nada lo pedía ni lo vigilaba:
# el botón de la página daba «no encontrado».
#
# Compila en una carpeta temporal: nunca toca frontend/dist (producción).
set -e

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SALIDA="$RAIZ/descargas"
REPO="edumind-es/edumind-miclase"
FICHERO="miclase.zip"
ENLACE="https://github.com/$REPO/releases/latest/download/$FICHERO"
NUMERO="$(node -p "require('$RAIZ/package.json').version")"
ETIQUETA="v$NUMERO"
MODO="${1:-}"
# Lo que entra en el .zip sale de aquí: si algo de esto no es lo de la
# etiqueta, lo publicado no sería la versión que dice ser.
CONTENIDO="frontend distribucion curriculum LICENSE NOTICE package.json"

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }

case "$MODO" in
  ""|--publicar|--comprobar) ;;
  *) rojo "No conozco «$MODO». Vale sin nada, --publicar o --comprobar."; exit 1 ;;
esac

# ── ¿Qué versión sirve hoy el enlace de la página? ──────────────────────
# El enlace «latest» redirige a releases/download/<etiqueta>/miclase.zip: de
# esa redirección sale la versión, sin API ni credenciales.
version_publicada() {
  curl -sI --max-time 15 "$ENLACE" | tr -d '\r' |
    sed -n 's#^[Ll]ocation: .*/releases/download/\([^/]*\)/.*#\1#p' | head -1
}

# Devuelve 0 si la descarga responde y es de esta versión.
comprobar_descarga() {
  local publicada codigo
  publicada="$(version_publicada)"
  if [ -z "$publicada" ]; then
    rojo "✗ La descarga no existe en GitHub: el botón de «Instalar MiClase» da «no encontrado»."
    gris "  $ENLACE"
    return 1
  fi
  codigo="$(curl -sIL --max-time 30 -o /dev/null -w '%{http_code}' "$ENLACE" || true)"
  if [ "$codigo" != "200" ]; then
    rojo "✗ La descarga responde $codigo en vez de 200."
    gris "  $ENLACE"
    return 1
  fi
  if [ "$publicada" != "$ETIQUETA" ]; then
    rojo "✗ La descargable publicada es $publicada y la app va por $ETIQUETA."
    return 1
  fi
  verde "✓ La descarga responde y es la $ETIQUETA."
  return 0
}

como_publicar() {
  gris "  Para publicarla (con la $NUMERO ya desplegada):"
  gris "    git push origin $ETIQUETA     (si la etiqueta no está ya en GitHub)"
  gris "    ./scripts/empaquetar_descargable.sh --publicar"
}

if [ "$MODO" = "--comprobar" ]; then
  comprobar_descarga || { como_publicar; exit 1; }
  exit 0
fi

# ── Antes de publicar: que lo que se sube sea la versión que dice ser ───
if [ "$MODO" = "--publicar" ]; then
  cd "$RAIZ"
  command -v gh >/dev/null 2>&1 || { rojo "Hace falta la herramienta «gh» de GitHub."; exit 1; }
  if ! git rev-parse -q --verify "refs/tags/$ETIQUETA" >/dev/null; then
    rojo "No existe la etiqueta $ETIQUETA: la pone desplegar.sh al publicar la web."
    gris "La descargable se publica de una versión ya desplegada."
    exit 1
  fi
  if ! git ls-remote --exit-code --tags origin "refs/tags/$ETIQUETA" >/dev/null 2>&1; then
    rojo "La etiqueta $ETIQUETA no está en GitHub. Súbela antes: git push origin $ETIQUETA"
    exit 1
  fi
  # shellcheck disable=SC2086
  if ! git diff --quiet "$ETIQUETA" -- $CONTENIDO ||
     [ -n "$(git status --porcelain -- $CONTENIDO)" ]; then
    rojo "Lo que hay en esta carpeta no es la $NUMERO tal como se desplegó."
    gris "Cambia a la etiqueta (git switch --detach $ETIQUETA) o sube la versión antes."
    # shellcheck disable=SC2086
    git status --short -- $CONTENIDO | head -10
    exit 1
  fi
fi

COMMIT="$(git -C "$RAIZ" rev-parse --short HEAD)"
TMP="$(mktemp -d)"
SERVIDOR_PID=""
al_salir() {
  [ -n "$SERVIDOR_PID" ] && kill "$SERVIDOR_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap al_salir EXIT
CARPETA="$TMP/MiClase"

echo "Compilando MiClase $NUMERO ($COMMIT)…"
mkdir -p "$CARPETA"
# Desde frontend/, porque vite toma su raíz del directorio de trabajo.
( cd "$RAIZ/frontend" && npx vite build --outDir "$CARPETA/app" --emptyOutDir --logLevel warn )

# Sin servidor de EDUmind detrás no hay buzón de sincronización: se dice con
# la misma respuesta que da el servidor con el buzón cerrado, para que la app
# no lo ofrezca (un 404 contaría como abierto, ver db/buzon.ts).
mkdir -p "$CARPETA/app/api/sync"
printf '{"abierto":false}' > "$CARPETA/app/api/sync/disponible"

cp "$RAIZ/distribucion/"* "$CARPETA/"
cp "$RAIZ/LICENSE" "$RAIZ/NOTICE" "$CARPETA/"
printf 'MiClase %s\ncommit %s · %s\n' "$NUMERO" "$COMMIT" "$(date +%Y-%m-%d)" > "$CARPETA/VERSION.txt"
chmod +x "$CARPETA/abrir-miclase.sh" "$CARPETA/Abrir MiClase (Mac).command" "$CARPETA/servidor.py"

# ── Probar el paquete con su propio lanzador ────────────────────────────
# Lo que se va a descargar un docente tiene que abrirse: se arranca el
# lanzador de macOS/Linux en un puerto de prueba y se le piden la portada, una
# ruta de la app, el manifiesto y la respuesta del buzón.
probar_paquete() {
  local puerto base intento
  puerto="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
  base="http://localhost:$puerto"
  # BROWSER=true: que el lanzador no intente abrir un navegador en el servidor
  MICLASE_PUERTO="$puerto" BROWSER=true python3 "$CARPETA/servidor.py" >/dev/null 2>&1 &
  SERVIDOR_PID=$!
  for intento in 1 2 3 4 5 6 7 8 9 10; do
    curl -fsS --max-time 2 "$base/" >/dev/null 2>&1 && break
    sleep 0.5
  done
  curl -fsS --max-time 5 "$base/" | grep -q "name=\"miclase-version\" content=\"$NUMERO\"" ||
    { rojo "✗ La portada del paquete no dice la versión $NUMERO."; return 1; }
  curl -fsS --max-time 5 "$base/evaluacion" | grep -q 'miclase-version' ||
    { rojo "✗ Una ruta de la app (/evaluacion) no devuelve la app."; return 1; }
  curl -fsS --max-time 5 "$base/manifest.webmanifest" | grep -q 'MiClase' ||
    { rojo "✗ El paquete no sirve el manifiesto: no se podría instalar."; return 1; }
  curl -fsS --max-time 5 "$base/sw.js" >/dev/null ||
    { rojo "✗ El paquete no sirve el service worker: no abriría sin red."; return 1; }
  curl -fsS --max-time 5 "$base/curriculo/indice.json" >/dev/null ||
    { rojo "✗ El paquete no lleva el currículo."; return 1; }
  [ "$(curl -fsS --max-time 5 "$base/api/sync/disponible")" = '{"abierto":false}' ] ||
    { rojo "✗ El paquete no dice que el buzón está cerrado."; return 1; }
  kill "$SERVIDOR_PID" 2>/dev/null
  SERVIDOR_PID=""
  return 0
}

if command -v python3 >/dev/null 2>&1; then
  probar_paquete || { rojo "El paquete no se ha creado."; exit 1; }
  gris "Probado con su lanzador: abre, se puede instalar y lleva el currículo."
elif [ "$MODO" = "--publicar" ]; then
  rojo "Sin python3 no se puede probar el paquete, y sin probarlo no se publica."
  exit 1
else
  gris "Sin python3 en esta máquina: el paquete va sin probar."
fi

mkdir -p "$SALIDA"
rm -f "$SALIDA/$FICHERO"
( cd "$TMP" && zip -qr -X "$SALIDA/$FICHERO" MiClase )
verde "Listo: $SALIDA/$FICHERO ($(du -h "$SALIDA/$FICHERO" | cut -f1), versión $NUMERO)"

# ── Publicar ────────────────────────────────────────────────────────────
if [ "$MODO" = "--publicar" ]; then
  # Las novedades de esta versión, tal como están en el CHANGELOG
  novedades="$(awk -v v="## [$NUMERO]" 'index($0, v) == 1 { dentro = 1; next } /^## \[/ { dentro = 0 } dentro' "$RAIZ/CHANGELOG.md")"
  notas="Versión descargable de EDUmind MiClase $NUMERO.

Descarga **$FICHERO**, descomprímelo y abre el lanzador de tu sistema (instrucciones en LEEME.txt, en castellano y en galego). Funciona sin internet y sin EDUmind.

## Novedades de la $NUMERO
$novedades"

  if gh release view "$ETIQUETA" --repo "$REPO" >/dev/null 2>&1; then
    echo "La versión $ETIQUETA ya está en GitHub: se sustituye su .zip…"
    gh release upload "$ETIQUETA" "$SALIDA/$FICHERO" --repo "$REPO" --clobber
  else
    echo "Publicando la versión $ETIQUETA en GitHub…"
    gh release create "$ETIQUETA" "$SALIDA/$FICHERO" \
      --repo "$REPO" --verify-tag --latest \
      --title "MiClase $NUMERO" \
      --notes "$notas"
  fi

  # GitHub tarda unos segundos en servir lo recién subido
  for intento in 1 2 3 4 5 6; do
    sleep 3
    if comprobar_descarga >/dev/null 2>&1; then
      verde "✓ Publicada: la página «Instalar MiClase» ya descarga la $NUMERO."
      gris "  $ENLACE"
      exit 0
    fi
  done
  comprobar_descarga || true
  rojo "Subida, pero el enlace de la página todavía no responde. Vuelve a mirar con --comprobar."
  exit 1
fi
