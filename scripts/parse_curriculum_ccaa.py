#!/usr/bin/env python3
"""
Convierte al JSON canónico de curriculum/ las matrices iDoceo de CURRICULOS_NUEVOS,
una comunidad y una etapa cada vez, para revisarlas por separado.

Los ficheros de origen ya están renombrados a «Comunidad · Etapa · Área · Ciclo.xlsx»
(ver _idoceo_tools/rename_idoceo.py). De ahí salen el área y los cursos; la lectura
de filas es la de parse_curriculum.py, sin cambios: Tipo 0-4, con la columna Enlaces
tal cual (descriptores de cada competencia específica, CE de cada criterio, criterios
de cada saber).

No se importa —y se lista como pendiente— lo que no tiene área o curso fiable:
ficheros [REVISAR], «Materia NN», ciclos «revisar curso» o «Configuración N».
Nunca sobrescribe un JSON que ya exista: las comunidades que ya están no se tocan.

Uso:
  python3 scripts/parse_curriculum_ccaa.py ASTURIAS primaria            # vista previa
  python3 scripts/parse_curriculum_ccaa.py ASTURIAS primaria --apply    # escribe
"""
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from parse_curriculum import parse_xlsx  # noqa: E402

ORIGEN = Path("/var/www/edumind_content/idoceo_matrices/CURRICULOS_NUEVOS")
OUT_ROOT = Path(__file__).parent.parent / "curriculum"

# Carpeta de origen → (valor de `comunidad` en la BD y en GruposPage, carpeta en curriculum/)
COMUNIDADES = {
    'ANDALUCIA':     ('Andalucia',    'andalucia'),
    'ASTURIAS':      ('Asturias',     'asturias'),
    'BALEARS':       ('Baleares',     'baleares'),
    'CANTABRIA':     ('Cantabria',    'cantabria'),
    'CATALUNYA':     ('Cataluna',     'cataluna'),
    'EXTREMADURA':   ('Extremadura',  'extremadura'),
    'LA RIOJA':      ('LaRioja',      'larioja'),
    'MURCIA':        ('Murcia',       'murcia'),
    'NAVARRA':       ('Navarra',      'navarra'),
    'ceuta_melilla': ('CeutaMelilla', 'ceutamelilla'),
}

CURSOS = {
    'primaria':   ['1º', '2º', '3º', '4º', '5º', '6º'],
    'secundaria': ['1º', '2º', '3º', '4º'],
}

# Palabras que el renombrado dejó partidas (vocal acentuada → espacio)
REPARAR = {
    'Matem Ticas': 'Matemáticas',
    'Cl Sica': 'Clásica',
}

ORDINALES = {
    'primer': 1, 'primero': 1, '1r': 1, '1er': 1, 'inicial': 1,
    'segundo': 2, 'segon': 2, '2n': 2, '2o': 2,
    'tercer': 3, 'tercero': 3, '3r': 3,
    'cuarto': 4, 'quart': 4, '4t': 4,
    'quinto': 5, 'sexto': 6,
}


def slug(s: str) -> str:
    """Slug con acentos plegados: «Educación Física» → «educacion-fisica»."""
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def nombre_area(crudo: str) -> str:
    for roto, bien in REPARAR.items():
        crudo = crudo.replace(roto, bien)
    return crudo.strip()


def cursos_de_ciclo(ciclo: str, etapa: str):
    """Cursos que cubre la etiqueta de ciclo, o None si no se puede saber."""
    c = ciclo.lower().strip()
    if 'revisar' in c or 'configuraci' in c:
        return None
    if c == 'toda la etapa':
        return list(CURSOS[etapa])
    if etapa == 'primaria' and ('ciclo' in c or 'cicle' in c):
        palabras = re.findall(r'[a-z0-9]+', c)
        n = next((ORDINALES[p] for p in palabras if p in ORDINALES), None)
        if n is None:
            n = next((int(p) for p in palabras if p.isdigit() and 1 <= int(p) <= 3), None)
        if n is None:
            return None
        return [f'{2 * n - 1}º', f'{2 * n}º']
    # Cursos sueltos o rangos: «Primer curso», «1º ESO», «Cursos primero y segundo»,
    # «Cursos de primero a tercero», «Tercer y cuarto curso»
    palabras = re.findall(r'[a-z0-9º]+', c)
    nums = []
    for p in palabras:
        p = p.rstrip('º')
        if p in ORDINALES:
            nums.append(ORDINALES[p])
        elif p.isdigit():
            nums.append(int(p))
    if not nums:
        return None
    if re.search(r'\ba\b', c) and len(nums) == 2:   # «de primero a tercero»
        nums = list(range(nums[0], nums[1] + 1))
    validos = CURSOS[etapa]
    cursos = [f'{n}º' for n in nums]
    if any(x not in validos for x in cursos):
        return None
    return cursos


def etapa_de(ruta: Path) -> str:
    up = str(ruta).upper()
    if 'INFANTIL' in up:
        return 'infantil'
    if 'SECUNDARIA' in up or '/ESO/' in up:
        return 'secundaria'
    return 'primaria'


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    aplicar = '--apply' in sys.argv
    if len(args) != 2 or args[0] not in COMUNIDADES or args[1] not in CURSOS:
        sys.exit(__doc__)
    carpeta, etapa = args
    comunidad, dir_slug = COMUNIDADES[carpeta]

    ficheros = sorted(
        p for p in (ORIGEN / carpeta).rglob('*.xlsx')
        if p.parent.name == 'iDoceo' and '_TEST' not in str(p)
        and not p.name.startswith('~$') and etapa_de(p) == etapa
    )

    pendientes = []
    candidatos = []   # (asignatura, nombre, cursos, ruta, datos)
    for p in ficheros:
        partes = [x.strip() for x in p.stem.split(' · ')]
        if len(partes) != 4:
            pendientes.append((p.name, 'nombre sin el esquema Comunidad · Etapa · Área · Ciclo'))
            continue
        area, ciclo = nombre_area(partes[2]), partes[3]
        if 'revisar' in p.stem.lower():
            pendientes.append((p.name, 'marcado [REVISAR] en origen: área o curso sin confirmar'))
            continue
        cursos = cursos_de_ciclo(ciclo, etapa)
        if not cursos:
            pendientes.append((p.name, f'curso no recuperable («{ciclo}»)'))
            continue
        datos = parse_xlsx(p, comunidad, etapa)
        if not datos['criterios']:
            pendientes.append((p.name, 'sin criterios (Tipo 3) en origen'))
            continue
        candidatos.append((slug(area), area, ciclo, cursos, p, datos))

    # Matemáticas A y B de 4.º son materias distintas: el ciclo lo dice
    # («Cuarto curso matem ticas b»), así que van con su propio slug.
    for i, (asig, area, ciclo, cursos, p, datos) in enumerate(candidatos):
        m = re.search(r'matem\s*ticas\s+([ab])\b|matemáticas\s+([ab])\b', ciclo.lower())
        if m:
            letra = (m.group(1) or m.group(2)).upper()
            candidatos[i] = (f'{asig}-{letra.lower()}', f'{area} {letra}', ciclo, cursos, p, datos)

    # «Toda la etapa» suele ser la unión de los ciclos: solo se usa si el área
    # no trae ficheros por ciclo o curso.
    con_ciclos = {c[0] for c in candidatos if c[2].lower() != 'toda la etapa'}
    # Si dos ficheros cubren el mismo curso, manda el más específico (el que
    # cubre menos cursos): «Primer curso» antes que «Primer y tercer curso».
    candidatos.sort(key=lambda c: (len(c[3]), c[4].name))
    salida = {}
    for asig, area, ciclo, cursos, p, datos in candidatos:
        if ciclo.lower() == 'toda la etapa' and asig in con_ciclos:
            pendientes.append((p.name, 'descartado: «Toda la etapa» repite los ficheros por ciclo/curso'))
            continue
        for curso in cursos:
            clave = (asig, curso)
            if clave in salida:
                otro = salida[clave][1]
                igual = salida[clave][3]['criterios'] == datos['criterios']
                pendientes.append((p.name, f'{curso}: ya cubierto por {otro.name}'
                                   + (' (mismos criterios)' if igual else ' (criterios DISTINTOS: revisar)')))
                continue
            salida[clave] = (area, p, ciclo, datos)

    out_dir = OUT_ROOT / dir_slug / etapa
    escritos = existentes = 0
    resumen = {}
    for (asig, curso), (area, p, ciclo, datos) in sorted(salida.items()):
        doc = dict(datos)
        doc['meta'] = {
            'comunidad': comunidad,
            'etapa': etapa,
            'asignatura': asig,
            'asignatura_nombre': area,
            'ciclo_origen': ciclo,
            'fuente': p.name,
            'generado': str(date.today()),
            'curso': curso,
        }
        destino = out_dir / f"{asig}_{curso.replace('º', '')}.json"
        if destino.exists():
            existentes += 1
            continue
        if aplicar:
            out_dir.mkdir(parents=True, exist_ok=True)
            destino.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding='utf-8')
        escritos += 1
        r = resumen.setdefault(area, {'slug': asig, 'cursos': [], 'cr': 0, 'sb': 0, 'ce': 0})
        r['cursos'].append(curso)
        r['cr'] += len(datos['criterios'])
        r['sb'] += len(datos['saberes'])
        r['ce'] = max(r['ce'], len(datos['objetivos']))

    print(f"{comunidad} · {etapa} — {len(ficheros)} ficheros de origen")
    for area, r in sorted(resumen.items()):
        print(f"  {area:55s} {r['slug']:45s} {' '.join(r['cursos']):20s} "
              f"{r['ce']}CE {r['cr']}cr {r['sb']}sb (sumados por curso)")
    print(f"JSON {'escritos' if aplicar else 'a escribir'}: {escritos}"
          + (f" · ya existían y no se tocan: {existentes}" if existentes else ''))
    if pendientes:
        print(f"Pendientes ({len(pendientes)}):")
        for nombre, motivo in pendientes:
            print(f"  - {nombre}: {motivo}")
    if not aplicar:
        print('(vista previa: añade --apply para escribir)')


if __name__ == '__main__':
    main()
