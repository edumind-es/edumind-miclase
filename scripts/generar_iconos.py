#!/usr/bin/env python3
"""
Genera todos los iconos de EDUmind MiClase desde una única definición.

El icono es la matriz del calificador: cinco columnas —una por cada uno de
Los Cinco Mundos, que es la firma visual de EDUmind— por tres filas de
celdas. La última celda queda sin rellenar: una matriz a medio evaluar, que
es exactamente lo que hace la app.

Se dibuja a 4x y se reduce con LANCZOS porque PIL no suaviza los bordes de
las formas; sin ese paso las esquinas redondeadas salen dentadas.

Uso:  python3 scripts/generar_iconos.py
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
PUBLICO = RAIZ / "frontend/public"
IOS = RAIZ / "frontend/ios/App/App/Assets.xcassets"
ANDROID = RAIZ / "frontend/android/app/src/main/res"

# ─── Paleta ──────────────────────────────────────────────────────────────
# Los Cinco Mundos en color pleno (canon Sistema Lámina v1.1)
MUNDOS = ["#e8613f", "#e8a92e", "#6ea94a", "#3f7d99", "#2c5c66"]
FONDO = "#0f2d4a"        # azul-900: el mismo del menú lateral de la app
PAPEL = "#e9e6dd"        # papel de lámina, para el contorno de la celda vacía

SUPER = 4                # factor de supermuestreo


def _hex(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def dibujar_marca(d: ImageDraw.ImageDraw, cx: float, cy: float, lado: float) -> None:
    """
    Dibuja la matriz 5x3 centrada en (cx, cy) ocupando un cuadrado de `lado`.

    La proporción es 5 columnas x 3 filas, así que el bloque es más ancho que
    alto: se encaja dentro del cuadrado disponible sin deformarlo.
    """
    cols, filas = 5, 3
    hueco = lado * 0.045
    ancho_celda = (lado - hueco * (cols - 1)) / cols
    # La altura de celda se iguala a la anchura para que las celdas sean
    # cuadradas: es una matriz, no un gráfico de barras.
    alto_celda = ancho_celda
    alto_bloque = alto_celda * filas + hueco * (filas - 1)

    x0 = cx - lado / 2
    y0 = cy - alto_bloque / 2
    radio = ancho_celda * 0.22
    grosor = max(2, int(ancho_celda * 0.11))

    for c in range(cols):
        for f in range(filas):
            x = x0 + c * (ancho_celda + hueco)
            y = y0 + f * (alto_celda + hueco)
            caja = [x, y, x + ancho_celda, y + alto_celda]

            # La última celda queda sin evaluar: solo el contorno
            if c == cols - 1 and f == filas - 1:
                d.rounded_rectangle(caja, radius=radio, outline=_hex(PAPEL), width=grosor)
            else:
                d.rounded_rectangle(caja, radius=radio, fill=_hex(MUNDOS[c]))


def lienzo(
    tam: int,
    *,
    fondo: str | None = FONDO,
    radio_pct: float = 0.0,
    ocupacion: float = 0.72,
) -> Image.Image:
    """
    Un icono cuadrado con la marca centrada.

    `radio_pct`  redondea el propio icono (para la PWA, que no aplica máscara).
    `ocupacion`  cuánto del lado ocupa la marca: baja para iconos enmascarables,
                 donde el sistema recorta los bordes.
    """
    s = tam * SUPER
    modo = "RGBA" if fondo is None else "RGB"
    img = Image.new(modo, (s, s), (0, 0, 0, 0) if fondo is None else _hex(fondo))
    d = ImageDraw.Draw(img)

    if fondo is not None and radio_pct > 0:
        # Recortar a esquinas redondeadas mediante máscara
        mascara = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mascara).rounded_rectangle(
            [0, 0, s - 1, s - 1], radius=int(s * radio_pct), fill=255)
        img = img.convert("RGBA")
        img.putalpha(mascara)
        d = ImageDraw.Draw(img)

    dibujar_marca(d, s / 2, s / 2, s * ocupacion)
    return img.resize((tam, tam), Image.LANCZOS)


def guardar(img: Image.Image, destino: Path, *, opaco: bool = False) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    if opaco and img.mode == "RGBA":
        fondo = Image.new("RGB", img.size, _hex(FONDO))
        fondo.paste(img, mask=img.split()[3])
        img = fondo
    img.save(destino, "PNG", optimize=True)
    print(f"  · {destino.relative_to(RAIZ)}  ({img.size[0]}px)")


def splash(ancho: int, alto: int) -> Image.Image:
    s_w, s_h = ancho * 2, alto * 2
    img = Image.new("RGB", (s_w, s_h), _hex(FONDO))
    d = ImageDraw.Draw(img)

    # Barra de los Cinco Mundos a sangre, arriba
    barra = int(s_h * 0.012)
    for i, color in enumerate(MUNDOS):
        x0 = s_w * i / 5
        x1 = s_w * (i + 1) / 5
        d.rectangle([x0, 0, x1, barra], fill=_hex(color))

    dibujar_marca(d, s_w / 2, s_h / 2, min(s_w, s_h) * 0.30)
    return img.resize((ancho, alto), Image.LANCZOS)


FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="EDUmind MiClase">
  <rect width="512" height="512" rx="112" fill="{fondo}"/>
  <g>
{celdas}
  </g>
</svg>
"""


def favicon_svg() -> str:
    """El favicon se escribe a mano en SVG: nítido a cualquier tamaño."""
    lado = 512 * 0.72
    cols, filas = 5, 3
    hueco = lado * 0.045
    celda = (lado - hueco * (cols - 1)) / cols
    alto_bloque = celda * filas + hueco * (filas - 1)
    x0 = 256 - lado / 2
    y0 = 256 - alto_bloque / 2
    radio = celda * 0.22
    grosor = celda * 0.11

    lineas = []
    for c in range(cols):
        for f in range(filas):
            x = round(x0 + c * (celda + hueco), 1)
            y = round(y0 + f * (celda + hueco), 1)
            w = round(celda, 1)
            if c == cols - 1 and f == filas - 1:
                lineas.append(
                    f'    <rect x="{x + grosor / 2:.1f}" y="{y + grosor / 2:.1f}" '
                    f'width="{w - grosor:.1f}" height="{w - grosor:.1f}" rx="{radio:.1f}" '
                    f'fill="none" stroke="{PAPEL}" stroke-width="{grosor:.1f}"/>')
            else:
                lineas.append(
                    f'    <rect x="{x}" y="{y}" width="{w}" height="{w}" '
                    f'rx="{radio:.1f}" fill="{MUNDOS[c]}"/>')
    return FAVICON_SVG.format(fondo=FONDO, celdas="\n".join(lineas))


def main() -> None:
    print("Web / PWA")
    # «any»: la PWA lo muestra tal cual, así que lleva sus propias esquinas
    for tam in (32, 180, 192, 512):
        nombre = "apple-touch-icon.png" if tam == 180 else f"icon-{tam}.png"
        opaco = tam == 180  # iOS no admite transparencia en el apple-touch-icon
        guardar(lienzo(tam, radio_pct=0.22), PUBLICO / nombre, opaco=opaco)

    # «maskable»: el sistema recorta; la marca se encoge a la zona segura
    guardar(lienzo(512, radio_pct=0.0, ocupacion=0.56), PUBLICO / "icon-512-maskable.png")

    (PUBLICO / "favicon.svg").write_text(favicon_svg(), encoding="utf-8")
    print(f"  · {(PUBLICO / 'favicon.svg').relative_to(RAIZ)}")

    print("\niOS")
    # Apple exige 1024x1024 opaco y sin canal alfa; la máscara la pone el sistema
    guardar(lienzo(1024, radio_pct=0.0, ocupacion=0.66),
            IOS / "AppIcon.appiconset/AppIcon-512@2x.png", opaco=True)
    for nombre in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        guardar(splash(2732, 2732), IOS / "Splash.imageset" / nombre)

    print("\nAndroid")
    # Iconos heredados (previos a los adaptativos)
    densidades = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for dens, tam in densidades.items():
        guardar(lienzo(tam, radio_pct=0.22), ANDROID / f"mipmap-{dens}/ic_launcher.png")
        guardar(lienzo(tam, radio_pct=0.5), ANDROID / f"mipmap-{dens}/ic_launcher_round.png")
        # La capa de primer plano del icono adaptativo es transparente y su
        # contenido debe caber en el 66% central: el sistema recorta el resto
        guardar(lienzo(int(tam * 108 / 48), fondo=None, ocupacion=0.42),
                ANDROID / f"mipmap-{dens}/ic_launcher_foreground.png")

    # El fondo del icono adaptativo es un color plano
    colores = ANDROID / "values/ic_launcher_background.xml"
    colores.parent.mkdir(parents=True, exist_ok=True)
    colores.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        f'    <color name="ic_launcher_background">{FONDO}</color>\n'
        '</resources>\n', encoding="utf-8")
    print(f"  · {colores.relative_to(RAIZ)}")

    print("\nListo. Recuerda `npm run nativo:sync` para llevarlos al proyecto nativo.")


if __name__ == "__main__":
    main()
