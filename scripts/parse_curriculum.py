#!/usr/bin/env python3
"""
Convierte los ficheros XLSX de matrices curriculares (iDoceo) en JSON canónico.
Soporta todas las comunidades autónomas disponibles en el directorio de matrices.

Uso: python3 parse_curriculum.py
Salida: ../curriculum/{comunidad_slug}/{etapa_slug}/{asignatura}_{curso_safe}.json

Novedades v2:
 - Normaliza el campo Tipo (string en algunas comunidades, int en otras)
 - Extrae asignatura y ciclo/curso del nombre de archivo con regex robusto
 - Expande ciclos (2o-ciclo → cursos 3º y 4º) generando un JSON por curso
 - Maneja "toda-la-etapa" generando para todos los cursos de la etapa
"""
import json
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

# ── Tipos de fila ──────────────────────────────────────────────────────────────
TIPO_COMPETENCIA = 0
TIPO_DESCRIPTOR  = 1
TIPO_OBJETIVO    = 2
TIPO_CRITERIO    = 3
TIPO_SABER       = 4

# ── Cursos por etapa (para expansión de "toda-la-etapa") ──────────────────────
CURSOS_PRIMARIA   = ['1º', '2º', '3º', '4º', '5º', '6º']
CURSOS_SECUNDARIA = ['1º', '2º', '3º', '4º']

# ── Mapa ciclo/curso nombre-de-archivo → cursos canónicos ──────────────────────
CICLO_A_CURSOS = {
    # Ciclos primaria
    '1er-ciclo':     ['1º', '2º'],
    '2o-ciclo':      ['3º', '4º'],
    '3er-ciclo':     ['5º', '6º'],
    'primer-ciclo':  ['1º', '2º'],
    'segundo-ciclo': ['3º', '4º'],
    'tercer-ciclo':  ['5º', '6º'],
    '1-ciclo':       ['1º', '2º'],
    '2-ciclo':       ['3º', '4º'],
    '3-ciclo':       ['5º', '6º'],
    # Cursos primaria
    'primer-curso':  ['1º'],
    'primero':       ['1º'],
    'segundo-curso': ['2º'],
    'tercero':       ['3º'],
    'tercer-curso':  ['3º'],
    'cuarto-curso':  ['4º'],
    'cuarto':        ['4º'],
    'quinto-curso':  ['5º'],
    'quinto':        ['5º'],
    'sexto-curso':   ['6º'],
    'sexto':         ['6º'],
    # Cursos directos (Galicia)
    '1':  ['1º'],  '2':  ['2º'],  '3':  ['3º'],
    '4':  ['4º'],  '5':  ['5º'],  '6':  ['6º'],
    '1º': ['1º'],  '2º': ['2º'],  '3º': ['3º'],
    '4º': ['4º'],  '5º': ['5º'],  '6º': ['6º'],
    # ESO
    '1-eso':              ['1º'],
    '2-eso':              ['2º'],
    '2-de-eso':           ['2º'],
    '3-eso':              ['3º'],
    '4-eso':              ['4º'],
    '4-de-eso':           ['4º'],
    'cursos-primero-y-segundo':    ['1º', '2º'],
    'cursos-tercero-y-cuarto':     ['3º', '4º'],
    'cursos-de-primero-a-tercero': ['1º', '2º', '3º'],
    'primera-etapa':               ['1º', '2º'],
    'segunda-etapa':               ['3º', '4º'],
    # Toda la etapa (se resuelve después según etapa)
    'toda-la-etapa':     None,
    'toda-etapa':        None,
    'todos-los-cursos':  None,
    'cursos':            None,
}

# Patrón para identificar la parte de ciclo/curso al FINAL del nombre de archivo
_CICLO_PATTERN = re.compile(
    r'[-_]('
    r'toda-la-etapa|toda-etapa|todos-los-cursos|'
    r'cursos-de-primero-a-tercero|cursos-primero-y-segundo|cursos-tercero-y-cuarto|'
    r'primera-etapa|segunda-etapa|'
    r'primer-ciclo|segundo-ciclo|tercer-ciclo|'
    r'1er-ciclo|2o-ciclo|3er-ciclo|'
    r'1-ciclo|2-ciclo|3-ciclo|'
    r'primer-curso|segundo-curso|tercer-curso|cuarto-curso|quinto-curso|sexto-curso|'
    r'primero|segundo|tercero|cuarto|quinto|sexto|'
    r'cursos|'
    r'4-de-eso|2-de-eso|1-eso|2-eso|3-eso|4-eso|'
    r'[1-6]er?-eso|'
    r'[1-6]º|[1-6]ª|[1-6]'
    r')$',
    re.IGNORECASE
)

# Patrón para sufijos de variantes de matemáticas y otras asignaturas especiales
_VARIANT_PATTERN = re.compile(
    r'[-_](matem-ticas-[ab]|matematicas-[ab]|academicas|aplicadas)$',
    re.IGNORECASE
)


def parse_enlaces(raw):
    if not raw:
        return []
    return [e.strip() for e in str(raw).split(",") if e.strip()]


def normalizar_tipo(tipo):
    """Convierte el campo Tipo a entero (algunas comunidades lo guardan como string)."""
    if tipo is None:
        return None
    try:
        return int(tipo)
    except (ValueError, TypeError):
        return None


def extraer_asignatura_ciclo(stem: str):
    """
    Extrae el slug de asignatura y el indicador de ciclo/curso del nombre del archivo.

    Ejemplos:
      iDoceo_educacion-fisica_3º              → ('educacion-fisica', '3º')
      iDoceo_educacion-fisica_2o-ciclo        → ('educacion-fisica', '2o-ciclo')
      iDoceo_04_educaci_n_f_sica_primer-ciclo → ('educaci-n-f-sica', 'primer-ciclo')
      iDoceo_ciencias-de-la-naturaleza_1er-ciclo → ('ciencias-de-la-naturaleza', '1er-ciclo')
    """
    # Quitar prefijo 'iDoceo_'
    s = re.sub(r'^iDoceo[-_]', '', stem, flags=re.IGNORECASE)

    # Quitar prefijo numérico opcional: '04_', '01_', etc.
    s = re.sub(r'^\d{1,2}[-_]', '', s)

    # Detectar y extraer sufijo de ciclo/curso
    m = _CICLO_PATTERN.search(s)
    if m:
        ciclo = m.group(1).lower()
        asignatura = s[:m.start()].strip('-_')
    else:
        # Sin ciclo identificado: asumir que el último segmento es el curso
        partes = s.rsplit('_', 1) if '_' in s else s.rsplit('-', 1)
        asignatura = partes[0] if len(partes) > 1 else s
        ciclo = partes[1] if len(partes) > 1 else 'desconocido'

    # Normalizar asignatura: underscores residuales → guiones
    asignatura = asignatura.replace('_', '-').strip('-')
    # Colapsar guiones múltiples
    asignatura = re.sub(r'-{2,}', '-', asignatura)

    return asignatura.lower(), ciclo.lower()


def ciclo_a_cursos_lista(ciclo: str, etapa: str) -> list:
    """Devuelve la lista de cursos canónicos para un ciclo/curso dado."""
    clave = ciclo.lower()

    if clave in CICLO_A_CURSOS:
        cursos = CICLO_A_CURSOS[clave]
        if cursos is None:
            return CURSOS_PRIMARIA if 'prim' in etapa.lower() else CURSOS_SECUNDARIA
        return cursos

    # Intentar extraer número directamente: '4ºA' → '4º'
    m = re.match(r'^(\d+)', clave)
    if m:
        n = m.group(1)
        return [f'{n}º']

    return [ciclo]  # devolver tal cual si no se reconoce


def parse_xlsx(path: Path, comunidad: str, etapa: str) -> dict:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active

    asignatura, ciclo = extraer_asignatura_ciclo(path.stem)

    competencias = []
    descriptores = []
    objetivos    = []
    criterios    = []
    bloques      = []
    saberes      = []
    bloque_actual = None

    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or len(row) < 5:
            continue
        tipo    = normalizar_tipo(row[1])
        codigo  = row[2]
        enlaces_raw = row[3]
        titulo  = row[4]
        peso    = row[7] if len(row) > 7 else None

        if tipo is None or codigo is None or titulo is None:
            continue
        codigo = str(codigo).strip()
        titulo = str(titulo).strip()
        if not codigo or not titulo:
            continue

        if tipo == TIPO_COMPETENCIA:
            competencias.append({"id": codigo, "titulo": titulo})

        elif tipo == TIPO_DESCRIPTOR:
            enlace_list = parse_enlaces(enlaces_raw)
            descriptores.append({
                "id": codigo,
                "competencia_id": enlace_list[0] if enlace_list else None,
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
            if re.match(r"^B\d+$", codigo):
                bloque_actual = codigo
                bloques.append({"id": codigo, "titulo": titulo})
            else:
                saberes.append({
                    "id": codigo,
                    "bloque_id": bloque_actual,
                    "descripcion": titulo,
                    "criterios_ids": parse_enlaces(enlaces_raw),
                })

    wb.close()

    return {
        "meta": {
            "comunidad": comunidad,
            "etapa": etapa,
            "asignatura": asignatura,
            "ciclo_origen": ciclo,
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
        if not etapa_dir.is_dir() or etapa_dir.name.startswith('.'):
            continue
        etapa = etapa_dir.name.lower()
        # normalizar etapa: 'Primaria' → 'primaria', 'SECUNDARIA' → 'secundaria'
        etapa_norm = 'primaria' if 'prim' in etapa else 'secundaria'

        for xlsx in sorted(etapa_dir.glob("*.xlsx")):
            try:
                datos = parse_xlsx(xlsx, comunidad, etapa_norm)
                asignatura = datos["meta"]["asignatura"]
                ciclo      = datos["meta"]["ciclo_origen"]

                cursos = ciclo_a_cursos_lista(ciclo, etapa_norm)

                for curso in cursos:
                    datos_curso = dict(datos)
                    datos_curso["meta"] = {**datos["meta"], "curso": curso}

                    curso_safe = curso.replace("º", "").replace("ª", "")
                    out_dir = OUT_ROOT / comunidad.lower() / etapa_norm
                    out_dir.mkdir(parents=True, exist_ok=True)
                    out_file = out_dir / f"{asignatura}_{curso_safe}.json"
                    out_file.write_text(
                        json.dumps(datos_curso, ensure_ascii=False, indent=2),
                        encoding="utf-8"
                    )

                n_cr = len(datos["criterios"])
                n_sa = len(datos["saberes"])
                cursos_str = ', '.join(cursos)
                print(f"  ✓ {xlsx.name[:52]:52s} → {asignatura} [{cursos_str}] {n_cr}cr {n_sa}sb")
                total += 1

            except Exception as e:
                errores.append((xlsx.name, str(e)))
                print(f"  ✗ {xlsx.name}: {e}")

    return total, errores


def main():
    if not MATRICES_ROOT.exists():
        sys.exit(f"No se encuentra: {MATRICES_ROOT}")

    print(f"Parser curricular EDUmind v2 — {date.today()}")
    print(f"Fuente:  {MATRICES_ROOT}")
    print(f"Salida:  {OUT_ROOT}\n")

    total_global = 0
    errores_global = []

    # Directorios a ignorar (no son comunidades)
    ignorar = {'dl_service', '__pycache__', 'atlas.css', 'atlas.js',
               'index.html', 'inyectar_metadata.py', 'spain-communities.svg',
               'MAP_LICENSE.md'}

    for comunidad_dir in sorted(MATRICES_ROOT.iterdir()):
        if not comunidad_dir.is_dir():
            continue
        if comunidad_dir.name in ignorar or comunidad_dir.name.startswith('.'):
            continue

        comunidad = comunidad_dir.name
        print(f"\n── {comunidad} ──")
        total, errores = procesar_directorio(comunidad_dir, comunidad)
        total_global += total
        errores_global += errores

    print(f"\n{'─'*60}")
    print(f"Total procesados: {total_global} ficheros (expandidos por curso)")
    if errores_global:
        print(f"Errores ({len(errores_global)}):")
        for nombre, msg in errores_global:
            print(f"  • {nombre}: {msg}")
    else:
        print("Sin errores.")


if __name__ == "__main__":
    main()
