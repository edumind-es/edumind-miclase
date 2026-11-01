#!/usr/bin/env python3
"""
Extrae del currículo estatal (matrices madre de los Reales Decretos) lo que
las competencias clave necesitan y no todas las comunidades traen:

 - los descriptores operativos del Perfil de salida (Anexo I), por etapa;
 - la conexión de cada competencia específica con sus descriptores, por materia.

Fuente:  /var/www/edumind_content/idoceo_matrices/RealesDecretos/{Primaria,Secundaria}/HTML/matriz_*.html
Salida:  ../curriculum/_estatal/{primaria,secundaria}.json

El seed (backend/src/db/seed.js) lo usa de dos formas: el texto de los
descriptores es el estatal en todas las comunidades (el Anexo I es enseñanza
mínima, igual para todas) y la conexión estatal es la RESERVA para una
competencia específica cuya comunidad no la declara, buscándola por el texto
de la competencia. Ver backend/src/db/conexiones.js.

Uso: python3 scripts/extraer_estatal.py
"""
import html
import json
import re
import sys
from datetime import date
from pathlib import Path

RD_ROOT = Path("/var/www/edumind_content/idoceo_matrices/RealesDecretos")
OUT_DIR = Path(__file__).parent.parent / "curriculum" / "_estatal"

ETAPAS = {"primaria": "Primaria", "secundaria": "Secundaria"}

COMPETENCIAS = [
    ("CCL", "CCL · Competencia en comunicación lingüística"),
    ("CP", "CP · Competencia plurilingüe"),
    ("STEM", "STEM · Competencia matemática y en ciencia, tecnología e ingeniería"),
    ("CD", "CD · Competencia digital"),
    ("CPSAA", "CPSAA · Competencia personal, social y de aprender a aprender"),
    ("CC", "CC · Competencia ciudadana"),
    ("CE", "CE · Competencia emprendedora"),
    ("CCEC", "CCEC · Competencia en conciencia y expresión culturales"),
]
_DESCRIPTOR = re.compile(r"^(CCL|CP|STEM|CD|CPSAA|CC|CE|CCEC)(\d)$")


def texto(fragmento: str) -> str:
    """Quita etiquetas y normaliza espacios de una celda HTML."""
    t = re.sub(r"<[^>]+>", " ", fragmento)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def limpiar_descriptor(t: str) -> str:
    """
    Un descriptor es una sola frase. La matriz madre arrastra detrás lo que
    había en el PDF del BOE hasta el siguiente descriptor: cabeceras de página
    («Página BOLETÍN OFICIAL…») y la introducción de la competencia siguiente.
    Se corta en el primer punto final (comprobado contra los textos de Galicia).
    """
    m = re.search(r"\.(\s|$)", t)
    return t[: m.start() + 1] if m else t


def seccion(doc: str, ident: str) -> str:
    m = re.search(r"<section id=['\"]%s['\"].*?</section>" % re.escape(ident), doc, re.S)
    return m.group(0) if m else ""


def filas(fragmento: str) -> list:
    """Filas de datos (sin la de cabecera) como listas de celdas en texto."""
    salida = []
    for tr in re.findall(r"<tr>(.*?)</tr>", fragmento, re.S):
        if "<th" in tr:
            continue
        salida.append([texto(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)])
    return salida


def extraer_etapa(carpeta: Path) -> dict:
    descriptores = {}
    competencias_especificas = []
    for f in sorted(carpeta.glob("matriz_*.html")):
        doc = f.read_text(encoding="utf-8")
        materia = f.stem.removeprefix("matriz_")
        for celdas in filas(seccion(doc, "s-descriptores")):
            if len(celdas) >= 2 and _DESCRIPTOR.match(celdas[0]):
                descriptores.setdefault(celdas[0], limpiar_descriptor(celdas[1]))
        for celdas in filas(seccion(doc, "s-competencias")):
            if len(celdas) < 3 or not re.match(r"^CE\d+$", celdas[0]):
                continue
            ids = [x.strip() for x in celdas[2].split(",") if _DESCRIPTOR.match(x.strip())]
            competencias_especificas.append({
                "materia": materia,
                "id": celdas[0],
                "descripcion": celdas[1],
                "descriptores_ids": ids,
            })
    orden = {c: i for i, (c, _) in enumerate(COMPETENCIAS)}
    lista = sorted(
        ({"id": k, "competencia_id": _DESCRIPTOR.match(k).group(1), "descripcion": v}
         for k, v in descriptores.items()),
        key=lambda d: (orden[d["competencia_id"]], int(d["id"][-1])),
    )
    return {"descriptores": lista, "competencias_especificas": competencias_especificas}


def main():
    if not RD_ROOT.exists():
        sys.exit(f"No se encuentra: {RD_ROOT}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for etapa, carpeta in ETAPAS.items():
        datos = extraer_etapa(RD_ROOT / carpeta / "HTML")
        salida = {
            "meta": {
                "etapa": etapa,
                "fuente": f"RealesDecretos/{carpeta}/HTML",
                "norma": "RD 157/2022 (Primaria)" if etapa == "primaria" else "RD 217/2022 (ESO)",
                "generado": str(date.today()),
            },
            "competencias": [{"id": c, "titulo": t} for c, t in COMPETENCIAS],
            **datos,
        }
        destino = OUT_DIR / f"{etapa}.json"
        destino.write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  ✓ {etapa}: {len(datos['descriptores'])} descriptores, "
              f"{len(datos['competencias_especificas'])} competencias específicas → {destino}")


if __name__ == "__main__":
    main()
