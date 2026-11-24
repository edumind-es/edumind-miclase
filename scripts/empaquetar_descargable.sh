#!/bin/bash
# Monta la versión descargable de MiClase: la app compilada + lanzadores de
# doble clic (Windows, macOS, Linux/Abalar) + docker-compose para el servidor
# del centro, en descargas/miclase.zip.
#
#   ./scripts/empaquetar_descargable.sh            → solo crea el .zip
#   ./scripts/empaquetar_descargable.sh --publicar → además lo sube como
#                                                    versión nueva a GitHub
#
# La página «Instalar MiClase» enlaza siempre la última versión publicada en
# GitHub (releases/latest/download/miclase.zip): el fichero se tiene que
# llamar exactamente así. GitHub, y no este servidor, es lo que hace que la
# descarga siga viva aunque EDUmind cierre.
#
# Compila en una carpeta temporal: nunca toca frontend/dist (producción).
set -e

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SALIDA="$RAIZ/descargas"
VERSION="$(date +%Y.%m.%d)-$(git -C "$RAIZ" rev-parse --short HEAD)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
CARPETA="$TMP/MiClase"

echo "Compilando MiClase $VERSION…"
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
echo "$VERSION" > "$CARPETA/VERSION.txt"
chmod +x "$CARPETA/abrir-miclase.sh" "$CARPETA/Abrir MiClase (Mac).command" "$CARPETA/servidor.py"

mkdir -p "$SALIDA"
rm -f "$SALIDA/miclase.zip"
( cd "$TMP" && zip -qr -X "$SALIDA/miclase.zip" MiClase )
echo "Listo: $SALIDA/miclase.zip ($(du -h "$SALIDA/miclase.zip" | cut -f1), versión $VERSION)"

if [ "${1:-}" = "--publicar" ]; then
  echo "Publicando la versión v$VERSION en GitHub…"
  gh release create "v$VERSION" "$SALIDA/miclase.zip" \
    --repo edumind-es/edumind-miclase \
    --title "MiClase $VERSION (descargable)" \
    --notes "Versión descargable de EDUmind MiClase: descomprime el .zip y abre el lanzador de tu sistema (instrucciones en LEEME.txt). Funciona sin internet y sin EDUmind."
fi
