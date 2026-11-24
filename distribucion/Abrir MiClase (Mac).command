#!/bin/sh
# EDUmind MiClase: abre la app en el navegador desde esta carpeta, sin internet.
# Si macOS dice que no puede abrirlo: clic derecho → Abrir → Abrir.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1 && python3 -c 'import http.server' >/dev/null 2>&1; then
  exec python3 servidor.py
fi
echo "Este Mac no tiene Python 3. Si macOS ofrece instalar las «herramientas de línea de comandos», acepta y vuelve a abrir este fichero."
echo "Otra opción: abre MiClase en https://miclase.edumind.es o en el servidor de tu centro e instálala desde el navegador."
read -r _
