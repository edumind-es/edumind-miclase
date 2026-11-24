#!/bin/sh
# EDUmind MiClase: abre la app en el navegador desde esta carpeta, sin internet
# (Linux, Abalar). Ejecútalo con doble clic («Ejecutar») o desde un terminal.
set -e
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Hace falta Python 3 (sudo apt install python3)."
  exit 1
fi
exec python3 servidor.py
