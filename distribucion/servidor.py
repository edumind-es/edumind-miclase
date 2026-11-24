#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Servidor local de EDUmind MiClase (macOS, Linux, Abalar).

Sirve la carpeta «app» en http://localhost:8765 y abre el navegador. No
necesita internet ni EDUmind: la app guarda los datos en el navegador.

El puerto es SIEMPRE el mismo a propósito: el navegador guarda los datos
asociados a la dirección, y con otro puerto la app aparecería vacía.
"""
import http.server
import os
import socketserver
import sys
import threading
import urllib.request
import webbrowser

# MICLASE_PUERTO solo para pruebas: con otro puerto los datos no son los mismos
PUERTO = int(os.environ.get("MICLASE_PUERTO", "8765"))
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")
DIRECCION = f"http://localhost:{PUERTO}/"


class Manejador(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".wasm": "application/wasm",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def send_head(self):
        # La app es de una sola página: /evaluacion, /alumnos… son index.html
        ruta = self.translate_path(self.path)
        ultimo = self.path.split("?", 1)[0].rstrip("/").rsplit("/", 1)[-1]
        if not os.path.exists(ruta) and "." not in ultimo and not self.path.startswith("/api/"):
            self.path = "/index.html"
        return super().send_head()

    def end_headers(self):
        # El service worker tiene que poder actualizarse siempre
        if self.path.endswith(("sw.js", "index.html", "/")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass  # sin ruido en la ventana


def es_miclase():
    """¿Lo que ya escucha en el puerto es MiClase, o es otro programa?"""
    try:
        with urllib.request.urlopen(DIRECCION + "manifest.webmanifest", timeout=2) as r:
            return b"MiClase" in r.read()
    except Exception:
        return False


def main():
    if not os.path.isdir(RAIZ):
        print("No encuentro la carpeta «app» junto a este fichero. Descomprime el .zip entero.")
        input("Pulsa Intro para salir…")
        sys.exit(1)
    socketserver.TCPServer.allow_reuse_address = True
    try:
        servidor = socketserver.ThreadingTCPServer(("127.0.0.1", PUERTO), Manejador)
    except OSError:
        if es_miclase():
            # Ya hay un MiClase abierto en ese puerto: basta con abrir el navegador
            print(f"MiClase ya está en marcha. Abriendo {DIRECCION}")
            webbrowser.open(DIRECCION)
            return
        print(f"Otro programa está usando el puerto {PUERTO} y MiClase no puede abrirse.")
        print("Cierra ese programa (o reinicia el equipo) y vuelve a abrir MiClase.")
        input("Pulsa Intro para salir…")
        sys.exit(1)
    print("EDUmind MiClase")
    print(f"Abierta en {DIRECCION}")
    print("Deja esta ventana abierta mientras la uses. Para terminar, ciérrala o pulsa Ctrl+C.")
    print("Consejo: instálala desde el navegador (icono de instalar en la barra de direcciones)")
    print("y después se abrirá sin esta ventana.")
    threading.Timer(0.8, lambda: webbrowser.open(DIRECCION)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
