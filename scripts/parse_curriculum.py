#!/usr/bin/env python3
"""
Convierte los ficheros XLSX de matrices curriculares en JSON canónico.
Uso: python3 parse_curriculum.py
Salida: ../curriculum/{comunidad}/{etapa}/{asignatura}_{curso}.json
"""
import json
import os
import re
import sys
from pathlib import Path
from datetime import date

try:
    import openpyxl
except ImportError:
    sys.exit("Requiere openpyxl: pip3 install openpyxl")

MATRICES_ROOT = Path("/var/www/edumind_content/idoceo_matrices")
OUT_ROOT = Path(__file__).parent.parent / "curriculum"

# Tipos de fila según la columna "Tipo" del XLSX
TIPO_COMPETENCIA  = 0
TIPO_DESCRIPTOR   = 1
TIPO_OBJETIVO     = 2
TIPO_CRITERIO     = 3
TIPO_SABER        = 4  # incluye cabeceras de bloque (sin código de saber)


def parse_enlaces(raw):
    """'CE1.2, CE1.3' → ['CE1.2', 'CE1.3']"""
    if not raw:
        return []
    return [e.strip() for e in str(raw).split(",") if e.strip()]


def parse_xlsx(path: Path, comunidad: str, etapa: str) -> dict:
    wb = openpyxl.load_workbook(path)
    ws = wb.active

    nombre_archivo = path.stem  # p.ej. iDoceo_educacion-fisica_3º
    # extraer asignatura y curso del nombre
    partes = nombre_archivo.split("_")
    asignatura = partes[1] if len(partes) > 1 else "desconocida"
    curso = partes[2] if len(partes) > 2 else "desconocido"

    competencias = []
    descriptores = []
    objetivos    = []
    criterios    = []
    bloques      = []
    saberes      = []

    bloque_actual = None

    for row in ws.iter_rows(min_row=2, values_only=True):
        tipo = row[1]
        codigo = row[2]
        enlaces_raw = row[3]
        titulo = row[4]
        peso = row[7]

        if tipo is None or codigo is None or titulo is None:
            continue

        if tipo == TIPO_COMPETENCIA:
            competencias.append({"id": codigo, "titulo": titulo})

        elif tipo == TIPO_DESCRIPTOR:
            descriptores.append({
                "id": codigo,
                "competencia_id": parse_enlaces(enlaces_raw)[0] if parse_enlaces(enlaces_raw) else None,
                "descripcion": titulo,
            })

        elif tipo == TIPO_OBJETIVO:
            objetivos.append({
                "id": codigo,
                "descripcion": titulo,
                "descriptores_ids": parse_enlaces(enlaces_raw),
            })

        elif tipo == TIPO_CRITERIO:
            criterios.append({
                "id": codigo,
                "objetivo_id": parse_enlaces(enlaces_raw)[0] if parse_enlaces(enlaces_raw) else None,
                "descripcion": titulo,
                "peso": int(peso) if peso else 1,
            })

        elif tipo == TIPO_SABER:
            # distinguir cabecera de bloque (p.ej. 'B1') de saber (p.ej. 'B1.1')
            if re.match(r"^B\d+$", str(codigo)):
                bloque_actual = codigo
                bloques.append({"id": codigo, "titulo": titulo})
            else:
                saberes.append({
                    "id": codigo,
                    "bloque_id": bloque_actual,
                    "descripcion": titulo,
                    "criterios_ids": parse_enlaces(enlaces_raw),
                })

    return {
        "meta": {
            "comunidad": comunidad,
            "etapa": etapa,
            "asignatura": asignatura,
            "curso": curso,
            "fuente": path.name,
            "generado": str(date.today()),
        },
        "competencias": competencias,
        "descriptores": descriptores,
        "objetivos": objetivos,
        "criterios": criterios,
        "bloques": bloques,
        "saberes": saberes,
    }


def procesar_directorio(comunidad_path: Path, comunidad: str):
    total = 0
    errores = []
    for etapa_dir in sorted(comunidad_path.iterdir()):
        if not etapa_dir.is_dir():
            continue
        etapa = etapa_dir.name
        out_dir = OUT_ROOT / comunidad.lower() / etapa
        out_dir.mkdir(parents=True, exist_ok=True)

        for xlsx in sorted(etapa_dir.glob("*.xlsx")):
            try:
                datos = parse_xlsx(xlsx, comunidad, etapa)
                asignatura = datos["meta"]["asignatura"]
                curso = datos["meta"]["curso"]
                # normalizar curso para nombre de archivo
                curso_safe = curso.replace("º", "").replace("ª", "")
                out_file = out_dir / f"{asignatura}_{curso_safe}.json"
                out_file.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
                n_criterios = len(datos["criterios"])
                n_saberes   = len(datos["saberes"])
                print(f"  ✓ {xlsx.name:55s} → {n_criterios:2d} criterios, {n_saberes:3d} saberes")
                total += 1
            except Exception as e:
                errores.append((xlsx.name, str(e)))
                print(f"  ✗ {xlsx.name}: {e}")

    return total, errores


def main():
    if not MATRICES_ROOT.exists():
        sys.exit(f"No se encuentra: {MATRICES_ROOT}")

    print(f"Parser curricular EDUmind Clase — {date.today()}")
    print(f"Fuente:  {MATRICES_ROOT}")
    print(f"Salida:  {OUT_ROOT}\n")

    total_global = 0
    errores_global = []

    for comunidad_dir in sorted(MATRICES_ROOT.iterdir()):
        if not comunidad_dir.is_dir() or comunidad_dir.name.startswith("."):
            continue
        comunidad = comunidad_dir.name
        print(f"── {comunidad} ──")
        total, errores = procesar_directorio(comunidad_dir, comunidad)
        total_global += total
        errores_global += errores

    print(f"\n{'─'*60}")
    print(f"Total procesados: {total_global} ficheros")
    if errores_global:
        print(f"Errores ({len(errores_global)}):")
        for nombre, msg in errores_global:
            print(f"  • {nombre}: {msg}")
    else:
        print("Sin errores.")


if __name__ == "__main__":
    main()
