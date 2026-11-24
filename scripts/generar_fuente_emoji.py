#!/usr/bin/env python3
"""
Genera frontend/public/fonts/EmojiLamina.woff: una fuente que dibuja cada emoji
que usa la interfaz como un icono de línea de la familia de MiClase.

Por qué una fuente: la interfaz lleva unos 365 emoji repartidos por las
pantallas, y un emoji lo dibuja cada sistema a su manera y en color. Quitarlos
uno a uno cambiaría también el aspecto de siempre, que no debe cambiar hasta la
2.0.0. Con esta fuente puesta la primera de la pila tipográfica de Lámina
(lamina.css, con `unicode-range` para que solo atienda a estos caracteres), el
mismo «📋» del código se ve como un portapapeles de línea, del color del texto,
en todos los sistemas; con el aspecto de siempre la fuente ni se descarga.

Los dibujos y qué emoji lleva cada uno están en scripts/emoji_lamina.json, en
rejilla de 24 y solo línea, como frontend/src/iconos.ts. Aquí se convierte cada
línea en su contorno (una fuente rellena, no traza): un rectángulo por tramo,
con extremos cuadrados, y un anillo por círculo.

Uso:  python3 scripts/generar_fuente_emoji.py      (necesita fontTools)
Al añadir un emoji a la interfaz, pruebas/emoji-lamina.test.mjs falla hasta que
se le da dibujo en el JSON y se vuelve a generar.
"""
import json
import math
import re
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "scripts" / "emoji_lamina.json"
SALIDA = RAIZ / "frontend" / "public" / "fonts" / "EmojiLamina.woff"
HOJA = RAIZ / "frontend" / "src" / "emoji-lamina.css"

UPM = 1000
ESCALA = 40          # la rejilla de 24 ocupa 960 unidades
MARGEN = 20          # a cada lado: el icono ocupa un cuadratín entero
BASE = -150          # dónde cae el borde inferior de la rejilla respecto a la línea de base
GROSOR = 1.5         # el trazo de la familia, en unidades de la rejilla
LADOS = 28           # lados del polígono con que se aproxima un círculo

NUMERO = re.compile(r"-?\d*\.?\d+")
ORDEN = re.compile(r"([MmLlHhVvZzCcSs])([^MmLlHhVvZzCcSs]*)")


def trazos_de(d):
    """Un trazo SVG (M L H V Z C S, absolutos o relativos) → lista de polilíneas."""
    lineas, actual, x, y, inicio, control = [], [], 0.0, 0.0, (0.0, 0.0), None
    for orden, resto in ORDEN.findall(d):
        n = [float(v) for v in NUMERO.findall(resto)]
        rel = orden.islower()
        o = orden.upper()
        if o == "M":
            if len(actual) > 1:
                lineas.append(actual)
            x, y = (x + n[0], y + n[1]) if rel else (n[0], n[1])
            inicio, actual = (x, y), [(x, y)]
            # Tras el primer par, los siguientes son líneas
            for i in range(2, len(n), 2):
                x, y = (x + n[i], y + n[i + 1]) if rel else (n[i], n[i + 1])
                actual.append((x, y))
        elif o == "L":
            for i in range(0, len(n), 2):
                x, y = (x + n[i], y + n[i + 1]) if rel else (n[i], n[i + 1])
                actual.append((x, y))
        elif o == "H":
            for v in n:
                x = x + v if rel else v
                actual.append((x, y))
        elif o == "V":
            for v in n:
                y = y + v if rel else v
                actual.append((x, y))
        elif o in "CS":
            paso = 6 if o == "C" else 4
            for i in range(0, len(n), paso):
                p = n[i:i + paso]
                if rel:
                    p = [v + (x if k % 2 == 0 else y) for k, v in enumerate(p)]
                if o == "C":
                    c1, c2, fin = (p[0], p[1]), (p[2], p[3]), (p[4], p[5])
                else:   # S: el primer control es el reflejo del último
                    c1 = (2 * x - control[0], 2 * y - control[1]) if control else (x, y)
                    c2, fin = (p[0], p[1]), (p[2], p[3])
                for t in (k / 10 for k in range(1, 11)):
                    u = 1 - t
                    actual.append((u**3 * x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * fin[0],
                                   u**3 * y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * fin[1]))
                control, (x, y) = c2, fin
            continue
        elif o == "Z":
            actual.append(inicio)
            x, y = inicio
        control = None
    if len(actual) > 1:
        lineas.append(actual)
    return lineas


def a_fuente(x, y):
    """Rejilla de 24 con la y hacia abajo → unidades de la fuente con la y hacia arriba."""
    return (round(MARGEN + x * ESCALA), round(BASE + (24 - y) * ESCALA))


def contornos_de(dibujo):
    """Los contornos rellenos de un dibujo de línea. Todos giran igual, para que al solaparse sumen."""
    m, contornos = GROSOR / 2, []
    for pieza in dibujo:
        if isinstance(pieza, str):
            for linea in trazos_de(pieza):
                for (ax, ay), (bx, by) in zip(linea, linea[1:]):
                    largo = math.hypot(bx - ax, by - ay)
                    if largo < 1e-6:
                        continue
                    dx, dy = (bx - ax) / largo, (by - ay) / largo
                    # Extremos cuadrados: el tramo se alarga medio grosor por cada lado
                    ax2, ay2, bx2, by2 = ax - dx * m, ay - dy * m, bx + dx * m, by + dy * m
                    nx, ny = -dy * m, dx * m
                    contornos.append([(ax2 + nx, ay2 + ny), (bx2 + nx, by2 + ny), (bx2 - nx, by2 - ny), (ax2 - nx, ay2 - ny)])
        else:
            cx, cy, r = pieza
            def aro(radio, sentido):
                return [(cx + radio * math.cos(sentido * 2 * math.pi * k / LADOS), cy + radio * math.sin(sentido * 2 * math.pi * k / LADOS)) for k in range(LADOS)]
            # El de fuera gira como los rectángulos y el de dentro al revés: queda un anillo
            contornos.append(aro(r + m, 1))
            if r - m > 0.05:
                contornos.append(aro(r - m, -1))
    return contornos


def glifo_de(dibujo):
    pluma = TTGlyphPen(None)
    for contorno in contornos_de(dibujo):
        puntos = [a_fuente(x, y) for x, y in contorno]
        pluma.moveTo(puntos[0])
        for p in puntos[1:]:
            pluma.lineTo(p)
        pluma.closePath()
    glifo = pluma.glyph()
    if glifo.numberOfContours > 0:
        glifo.flags[0] |= 0x40   # los contornos se solapan a propósito
    return glifo


def vacio():
    return TTGlyphPen(None).glyph()


def principal():
    datos = json.loads(DATOS.read_text(encoding="utf-8"))
    dibujos, emoji = datos["dibujos"], datos["emoji"]
    faltan = sorted({d for d in emoji.values() if d not in dibujos})
    if faltan:
        raise SystemExit(f"Sin dibujo: {', '.join(faltan)}")
    usados = sorted(set(emoji.values()))

    glifos = {".notdef": vacio(), "nada": vacio()}
    for nombre in usados:
        glifos[nombre] = glifo_de(dibujos[nombre])
    orden = [".notdef", "nada"] + usados

    mapa = {}
    for caracter, nombre in emoji.items():
        puntos = [ord(c) for c in caracter]
        if len(puntos) != 1:
            raise SystemExit(f"«{caracter}» no es un solo carácter: en el JSON va sin selector de variación")
        mapa[puntos[0]] = nombre
    mapa[0xFE0F] = "nada"   # el selector «como emoji» que suele seguirles: aquí no pinta nada

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(orden)
    fb.setupCharacterMap(mapa)
    fb.setupGlyf(glifos)
    fb.setupHorizontalMetrics({g: ((0 if g == "nada" else UPM), 0) for g in orden})
    fb.setupHorizontalHeader(ascent=850, descent=-150)
    fb.setupNameTable({"familyName": "Emoji Lamina", "styleName": "Regular",
                       "copyright": "EDUmind® · Luis Vilela Acuña. Iconos de línea de EDUmind MiClase."})
    fb.setupOS2(sTypoAscender=850, sTypoDescender=-150, usWinAscent=850, usWinDescent=150)
    fb.setupPost()
    fb.font.flavor = "woff"
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    fb.save(str(SALIDA))

    # La declaración de la fuente, con el `unicode-range` exacto: solo atiende a estos caracteres
    rango = ", ".join(f"U+{p:X}" for p in sorted(mapa))
    HOJA.write_text(
        "/* GENERADO por scripts/generar_fuente_emoji.py — no editar a mano.\n"
        "   La fuente que dibuja los emoji de la interfaz como iconos de línea. Solo la\n"
        "   usa la pila tipográfica de Lámina (lamina.css); con el aspecto de siempre\n"
        "   no se descarga. */\n"
        "@font-face {\n"
        "  font-family: 'Emoji Lamina'; font-style: normal; font-weight: 100 900;\n"
        "  font-display: block; src: url('/fonts/EmojiLamina.woff') format('woff');\n"
        f"  unicode-range: {rango};\n"
        "}\n", encoding="utf-8")
    print(f"{SALIDA.relative_to(RAIZ)}: {len(usados)} dibujos para {len(emoji)} emoji, {SALIDA.stat().st_size} bytes")
    print(f"{HOJA.relative_to(RAIZ)}: {len(mapa)} caracteres en unicode-range")


if __name__ == "__main__":
    principal()
