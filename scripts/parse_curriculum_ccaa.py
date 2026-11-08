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
import subprocess
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

# Erratas del origen comprobadas contra la norma. Clave: (carpeta, slug de área,
# código repetido, comienzo del texto) → código correcto. Solo lo verificado.
CORRECCIONES = {
    # RD 217/2022, Biología y Geología 1.º-3.º: «hábitos sostenibles» es 5.2 y
    # «hábitos saludables» es 5.3; la matriz de Asturias pone 5.2 a los dos.
    ('ASTURIAS', 'biologia-y-geologia', 'CE5.2', 'Proponer y adoptar hábitos saludables'): 'CE5.3',
}

# Decretos para repartir por curso las matrices que traen varias tandas de
# criterios con los mismos códigos (una por curso o grupo de cursos) sin decir
# de cuál es cada una. Ruta relativa a ORIGEN.
DECRETOS = {
    ('EXTREMADURA', 'primaria'):   'EXTREMADURA/PRIMARIA/22040159C.pdf',
    ('EXTREMADURA', 'secundaria'): 'EXTREMADURA/SECUNDARIA/22040165C.pdf',
    ('MURCIA', 'primaria'):        'MURCIA/PRIMARIA/2022-5907.pdf',
    ('MURCIA', 'secundaria'):      'MURCIA/SECUNDARIA/2022-6346.pdf',
    # Ceuta y Melilla: currículo del Ministerio; referencia, las matrices de los RD
    ('ceuta_melilla', 'primaria'):   'REALES DECRETOS/PRIMARIA/MATRICES/XLSX',
    ('ceuta_melilla', 'secundaria'): 'REALES DECRETOS/SECUNDARIA/MATRICES/XLSX',
}

# Encabezado de curso en el texto del decreto: «Primero y segundo de ESO»,
# «Tercero y cuarto de ESO», «Segundo curso», «Cuarto de ESO»…
# Matemáticas de 4.º lo lleva delante: «Matemáticas B. Cuarto Curso ESO».
_CURSO = r'(?:primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|[1-6]\.?\s*º)'
# Murcia escribe «Curso cuarto» y pone «Matemáticas A» / «Matemáticas B» a secas.
_ENCABEZADO_CURSO = re.compile(
    r'^\s*(?:matemáticas\s+([ab])(?:\.\s+|\s*$))?'
    r'((?:curso\s+)?' + _CURSO + r'(?:\s+(?:y|a|o)\s+' + _CURSO + r')?'
    r'(?:\s+(?:curso|ciclo))?(?:\s+(?:de\s+eso|eso|de\s+la\s+eso))?)?\s*$', re.IGNORECASE)


def encabezado_curso(linea: str):
    """El encabezado de curso de la línea, o None. Todo el patrón es opcional
    (una línea vacía también casa): hace falta curso o letra de Matemáticas."""
    m = _ENCABEZADO_CURSO.match(linea)
    return m if m and (m.group(1) or m.group(2)) else None


# Matemáticas A y B solo existen en 4.º de ESO (RD 217/2022, art. 9).
CURSO_MATEMATICAS_AB = ['4º']


class Decreto:
    """Texto de un decreto (pdftotext -layout) para localizar criterios."""

    def __init__(self, pdf: Path):
        texto = subprocess.run(['pdftotext', '-layout', str(pdf), '-'],
                               capture_output=True, text=True, check=True).stdout
        self.lineas = texto.splitlines()
        # Texto corrido sin espacios ni guiones de corte, con la línea de cada carácter
        self.plano, self.linea_de, self.inicio = [], [], []
        for i, l in enumerate(self.lineas):
            self.inicio.append(len(self.plano))
            for ch in re.sub(r'[\s\-]+', '', l.lower()):
                self.plano.append(ch)
                self.linea_de.append(i)
        self.plano = ''.join(self.plano)

    def encabezado_antes(self, descripcion: str, desde: int = 0, codigo: str = '',
                         preferidos=None, etapa: str = 'secundaria'):
        """(etiqueta, variante, cursos, posición) del encabezado de curso encima
        del criterio cuyo texto empieza como `descripcion`, desde `desde`. La
        variante es la letra de Matemáticas A/B, o None. Si el mismo criterio
        está literal en varios cursos y se dan `preferidos` (los cursos que dice
        el fichero), manda la aparición cuyo encabezado coincide con ellos."""
        # El texto del criterio pegado a su código («Criterio 1.1.», «Criterio.
        # 1.1.» o, en Murcia, «1.1.» a secas): suelto puede aparecer antes,
        # citado en la introducción de la materia.
        texto = re.escape(re.sub(r'[\s\-]+', '', descripcion.lower())[:60])
        num = re.escape(codigo.replace('CE', '')) if codigo else r'\d+\.\d+'
        patron = re.compile(r'(?:criterio\.?)?' + num + r'\.?' + texto)
        primero = None
        for m in patron.finditer(self.plano, desde):
            hallado = (*self._encabezado(m.start(), etapa), m.start(), m.end())
            if primero is None:
                primero = hallado
            if not preferidos or (hallado[2] and set(hallado[2]) & set(preferidos)):
                break
        else:
            hallado = primero
        if hallado is None:
            self.fin = desde
            return None, None, None, -1
        self.fin = hallado[4]
        return hallado[:4]

    def _encabezado(self, pos: int, etapa: str):
        linea = self.linea_de[pos]
        for j in range(linea, max(linea - 12, -1), -1):
            m = encabezado_curso(self.lineas[j])
            if m:
                etiqueta = m.group(2) or f'Matemáticas {m.group(1).upper()}'
                cursos = cursos_de_ciclo(m.group(2), etapa) if m.group(2) else CURSO_MATEMATICAS_AB
                return etiqueta, m.group(1), cursos
        return None, None, None


    def codigos_de_tanda(self, pos: int, hasta):
        """Códigos de criterio del decreto en el tramo de la tanda que empieza
        en `pos` (hasta la siguiente tanda o el siguiente apartado)."""
        return self.codigos_en_tramo(max(pos - 30, 0), pos + 40000 if hasta is None else hasta)

    def codigos_en_tramo(self, desde: int, hasta: int) -> set:
        """Códigos «Criterio X.Y» del decreto entre dos posiciones del texto
        corrido, cortando en el siguiente apartado (saberes, competencias,
        otro bloque de criterios)."""
        # Corta también en el siguiente encabezado de curso o ciclo
        primera = self.linea_de[min(desde, len(self.linea_de) - 1)] + 2
        for j in range(primera, len(self.lineas)):
            if self.inicio[j] >= hasta:
                break
            if encabezado_curso(self.lineas[j]):
                hasta = self.inicio[j]
                break
        tramo = self.plano[desde:hasta]
        fin = min([i for i in (tramo.find('saberesbásicos'), tramo.find('competenciasespecíficas'),
                               tramo.find('criteriosdeevaluación')) if i > 0] or [len(tramo)])
        # Por líneas: «Criterio 1.1.», «Criterio. 1.1.» o «1.1.» al principio de
        # línea. Los códigos de saberes («A.1.2.1.») empiezan por letra.
        ultima = self.linea_de[min(desde + fin, len(self.linea_de) - 1)]
        codigos = set()
        for j in range(self.linea_de[desde], ultima + 1):
            m = re.match(r'\s*(?:criterio\.?\s*)?(\d+)\.(\d+)\.?\s', self.lineas[j], re.IGNORECASE)
            if m:
                codigos.add(f'CE{m.group(1)}.{m.group(2)}')
        return codigos


class MatrizReferencia:
    """Matrices con el curso en cada fila (hoja «Criterios de evaluación»:
    curso o ciclo, competencia, código, texto), con la misma interfaz que
    Decreto. Ceuta y Melilla siguen el currículo del Ministerio, así que su
    referencia son las matrices de los Reales Decretos."""

    def __init__(self, carpeta: Path):
        import openpyxl
        self.filas = []   # (etiqueta, código CE, texto plano)
        self.materia = []  # nº de fichero de cada fila: cada materia es un fichero
        for n, f in enumerate(sorted(carpeta.glob('*.xlsx'))):
            wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
            if 'Criterios de evaluación' not in wb.sheetnames:
                continue
            for r in wb['Criterios de evaluación'].iter_rows(min_row=2, values_only=True):
                if len(r) >= 4 and r[2] and r[3]:
                    codigo = 'CE' + str(r[2]).strip().rstrip('.')
                    self.filas.append((str(r[0] or '').strip(), codigo,
                                       re.sub(r'[\s\-]+', '', str(r[3]).lower())))
                    self.materia.append(n)
            wb.close()
        self.fin = 0

    def encabezado_antes(self, descripcion: str, desde: int = 0, codigo: str = '',
                         preferidos=None, etapa: str = 'secundaria'):
        texto = re.sub(r'[\s\-]+', '', descripcion.lower())[:60]
        primero = None
        for i in range(desde, len(self.filas)):
            etiqueta, cod, plano = self.filas[i]
            if cod != codigo or not plano.startswith(texto):
                continue
            hallado = (*self._curso(etiqueta, etapa), i)
            if primero is None:
                primero = hallado
            if not preferidos or (hallado[2] and set(hallado[2]) & set(preferidos)):
                break
        else:
            hallado = primero
        if hallado is None:
            self.fin = desde
            return None, None, None, -1
        self.fin = hallado[3] + 1
        return hallado

    @staticmethod
    def _curso(etiqueta: str, etapa: str):
        # «Cuarto curso · MATEMÁTICAS A», «Cursos de primero a tercero», «Primer ciclo»
        m = re.search(r'matemáticas\s+([ab])\b', etiqueta, re.IGNORECASE)
        base = re.split(r'\s*·\s*', etiqueta)[0]
        cursos = cursos_de_ciclo(base, etapa) if base else None
        return etiqueta, (m.group(1).upper() if m else None), cursos

    def codigos_de_tanda(self, pos: int, hasta):
        etiqueta, materia = self.filas[pos][0], self.materia[pos]
        return {f[1] for f, m in zip(self.filas, self.materia) if f[0] == etiqueta and m == materia}


def repartir_tandas(datos: dict, decreto: 'Decreto', etapa: str, preferidos=None):
    """Parte los criterios en tandas (cada vez que vuelve el primer código) y da
    a cada una los cursos del encabezado que el decreto le pone encima.
    Devuelve [(etiqueta, variante, cursos, criterios, faltan)] o None si alguna
    tanda no se localiza; `faltan` son los códigos que el decreto trae en el
    tramo de esa tanda y la matriz no."""
    crit = datos['criterios']
    cortes = [i for i, c in enumerate(crit) if c['id'] == crit[0]['id']] + [len(crit)]
    tandas, desde = [], 0
    for a, b in zip(cortes, cortes[1:]):
        etiqueta, variante, cursos, pos = decreto.encabezado_antes(
            crit[a]['descripcion'], desde, crit[a]['id'],
            preferidos if not tandas else None, etapa)
        if not cursos:
            return None
        tandas.append([etiqueta, variante, cursos, crit[a:b], pos])
        desde = decreto.fin   # tras la coincidencia entera: si no, casa otra vez con ella
    # Lo que el decreto trae en el tramo de cada tanda y la matriz no
    for i, t in enumerate(tandas):
        hasta = tandas[i + 1][4] if i + 1 < len(tandas) else None
        en_decreto = decreto.codigos_de_tanda(t[4], hasta)
        t[4] = sorted(en_decreto - {c['id'] for c in t[3]},
                      key=lambda x: [int(n) for n in re.findall(r'\d+', x)])
    return [tuple(t) for t in tandas]


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


def fundir(a: dict, b: dict) -> dict:
    """Une dos trozos de la misma área y curso. Cada lista se une por id, sin
    repetir; ante un id repetido manda el primero. Los criterios salen en el
    orden de su competencia específica."""
    out = dict(a)
    for k in ('competencias', 'descriptores', 'objetivos', 'criterios', 'bloques', 'saberes'):
        previos = {x['id']: x for x in a[k]}
        out[k] = list(a[k]) + [x for x in b[k] if x['id'] not in previos]
        if k in ('criterios', 'saberes', 'bloques'):
            distintos = [x['id'] for x in b[k] if x['id'] in previos and previos[x['id']] != x]
            if distintos:
                out.setdefault('_choques', []).append(f"{k} {', '.join(distintos)}")

    def orden(c):
        return [int(n) for n in re.findall(r'\d+', c['id'])]
    out['criterios'].sort(key=orden)
    return out


def etapa_de(ruta: Path) -> str:
    up = str(ruta).upper()
    if 'INFANTIL' in up:
        return 'infantil'
    if 'SECUNDARIA' in up or '/ESO/' in up:
        return 'secundaria'
    return 'primaria'


NOMBRES_TS = Path(__file__).parent.parent / "frontend/src/components/nombresAreas.ts"


def escribir_nombres_areas():
    """Regenera el mapa slug → nombre de área que usa el frontend, con el
    `asignatura_nombre` de todos los JSON que lo traen (los de este conversor)."""
    nombres = {}
    for f in sorted(OUT_ROOT.glob('*/*/*.json')):
        meta = json.loads(f.read_text(encoding='utf-8')).get('meta', {})
        if meta.get('asignatura_nombre'):
            nombres.setdefault(meta['asignatura'], meta['asignatura_nombre'])
    filas = ''.join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},\n"
                    for k, v in sorted(nombres.items()))
    NOMBRES_TS.write_text(
        "// Generado por scripts/parse_curriculum_ccaa.py: no editar a mano.\n"
        "// Nombre legible de cada área de las comunidades incorporadas desde\n"
        "// CURRICULOS_NUEVOS. El mapa manual de AsignaturasPanel manda sobre este.\n"
        "export const NOMBRES_AREAS: Record<string, string> = {\n" + filas + "}\n",
        encoding='utf-8')


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
    avisos = []       # importado, pero con algo que conviene saber
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
        # «CE112 Pautas.» o «CE999 A.1.2.1.» son saberes colados al extraer: un
        # número de tres cifras, que ni un ámbito alcanza (los de Murcia llegan
        # a CE29), y ningún criterio que cuelgue de ella.
        usadas = {c.get('objetivo_id') for c in datos['criterios']} | \
                 {c['id'].split('.')[0] for c in datos['criterios']}
        basura = [o for o in datos['objetivos']
                  if re.fullmatch(r'CE(\d+)', o['id']) and int(o['id'][2:]) >= 100
                  and o['id'] not in usadas]
        if basura:
            datos['objetivos'] = [o for o in datos['objetivos'] if o not in basura]
            avisos.append(f'{area} ({ciclo}): descartadas competencias específicas que no lo son: '
                          + '; '.join(f"{o['id']} «{o['descripcion'][:30]}»" for o in basura))
        for c in datos['criterios']:
            for (carp, asig_c, cod, inicio), nuevo in CORRECCIONES.items():
                if (carp == carpeta and asig_c == slug(area) and c['id'] == cod
                        and c['descripcion'].startswith(inicio)):
                    c['id'] = nuevo
                    avisos.append(f'{area} ({ciclo}): {cod} «{inicio}…» corregido a {nuevo} (errata del origen)')
        candidatos.append((slug(area), area, ciclo, cursos, p, datos))

    # «Toda la etapa» suele ser la unión de los ciclos: solo se usa si el área
    # no trae ficheros por ciclo o curso.
    con_ciclos = {c[0] for c in candidatos if c[2].lower() != 'toda la etapa'}
    quedan = []
    for c in candidatos:
        if c[2].lower() == 'toda la etapa' and c[0] in con_ciclos:
            pendientes.append((c[4].name, 'descartado: «Toda la etapa» repite los ficheros por ciclo/curso'))
        else:
            quedan.append(c)
    candidatos = quedan

    # Con decreto, los cursos los dice el encabezado que el decreto pone encima
    # de cada tanda de criterios, no el nombre del fichero.
    if (carpeta, etapa) in DECRETOS:
        fuente = ORIGEN / DECRETOS[(carpeta, etapa)]
        decreto = MatrizReferencia(fuente) if fuente.is_dir() else Decreto(fuente)
        repartidos = []
        for asig, area, ciclo, cursos, p, datos in candidatos:
            ids = [c['id'] for c in datos['criterios']]
            varias = ids.count(ids[0]) > 1
            # Un fichero que ya dice su curso y trae una sola tanda no se toca:
            # el mismo criterio puede repetirse literal en varios cursos del
            # decreto y casaría con el primero.
            if not varias and ciclo.lower() != 'toda la etapa':
                repartidos.append((asig, area, ciclo, cursos, p, datos))
                continue
            tandas = repartir_tandas(datos, decreto, etapa,
                                     None if ciclo.lower() == 'toda la etapa' else cursos)
            if not tandas:
                if varias:
                    pendientes.append((p.name, 'varias tandas de criterios con los mismos códigos '
                                       'y el decreto no dice de qué curso es cada una'))
                else:
                    if ciclo.lower() == 'toda la etapa':
                        avisos.append(f'{area}: no localizado en el decreto; cursos según el fichero («{ciclo}»)')
                    repartidos.append((asig, area, ciclo, cursos, p, datos))
                continue
            for etiqueta, variante, cursos_t, crit, faltan in tandas:
                d = dict(datos, criterios=crit)
                a, n = asig, area
                if variante:
                    a, n = f'{asig}-{variante.lower()}', f'{area} {variante}'
                if varias:
                    # Los saberes de la matriz son una sola lista sin curso
                    d['bloques'], d['saberes'] = [], []
                if faltan:
                    avisos.append(f'{n} ({etiqueta}): el decreto trae {", ".join(faltan)} '
                                  'y la matriz no: faltan en origen')
                repartidos.append((a, n, etiqueta, cursos_t, p, d))
            if varias:
                avisos.append(f'{area}: {len(tandas)} tandas repartidas por el decreto '
                              f'({"; ".join(t[0] for t in tandas)}); saberes sin curso, no se importan')
        candidatos = repartidos

    # Matemáticas A y B de 4.º son materias distintas: el ciclo lo dice
    # («Cuarto curso matem ticas b»), así que van con su propio slug.
    for i, (asig, area, ciclo, cursos, p, datos) in enumerate(candidatos):
        m = re.search(r'matem\s*ticas\s+([ab])\b|matemáticas\s+([ab])\b', ciclo.lower())
        if m and not re.search(r'-[ab]$', asig):   # el decreto ya la separó
            letra = (m.group(1) or m.group(2)).upper()
            candidatos[i] = (f'{asig}-{letra.lower()}', f'{area} {letra}', ciclo, cursos, p, datos)

    # Si dos ficheros cubren el mismo curso:
    # - sin ningún código de criterio en común, son trozos del mismo decreto
    #   (Asturias parte Biología de 1.º y 3.º en dos tablas) y se funden;
    # - si comparten alguno, manda el más específico (el que cubre menos
    #   cursos): «Primer curso» antes que «Primer y tercer curso».
    candidatos.sort(key=lambda c: (len(c[3]), c[4].name))
    salida = {}
    for asig, area, ciclo, cursos, p, datos in candidatos:
        for curso in cursos:
            clave = (asig, curso)
            if clave not in salida:
                salida[clave] = (area, p, ciclo, datos)
                continue
            area0, p0, ciclo0, datos0 = salida[clave]
            ids0 = {c['id'] for c in datos0['criterios']}
            comunes = ids0 & {c['id'] for c in datos['criterios']}
            if comunes:
                igual = datos0['criterios'] == datos['criterios']
                pendientes.append((p.name, f'{curso}: ya cubierto por {p0.name}'
                                   + (' (mismos criterios)' if igual else ' (criterios DISTINTOS: revisar)')))
                continue
            junto = fundir(datos0, datos)
            choques = junto.pop('_choques', [])
            salida[clave] = (area0, p0, f'{ciclo0} + {ciclo}', junto)
            avisos.append(f'{area} {curso}: fundidos «{ciclo0}» y «{ciclo}» (criterios complementarios)'
                          + (f'; ids repetidos con otro texto, manda el primero: {"; ".join(choques)}' if choques else ''))

    out_dir = OUT_ROOT / dir_slug / etapa
    escritos = existentes = 0
    sin_saberes = {}
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
        repes = sorted({c['id'] for c in datos['criterios']
                        if sum(1 for x in datos['criterios'] if x['id'] == c['id']) > 1})
        if repes:
            avisos.append(f'{area} {curso}: códigos de criterio repetidos {", ".join(repes)}; '
                          'al cargar solo queda uno: revisar')
        if not datos['saberes']:
            sin_saberes.setdefault(area, []).append(curso)
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
    for area, cursos in sin_saberes.items():
        avisos.append(f'{area} {" ".join(cursos)}: sin saberes básicos (se importan los criterios)')
    if avisos:
        print(f"Avisos ({len(avisos)}):")
        for a in avisos:
            print(f"  · {a}")
    if pendientes:
        print(f"Pendientes ({len(pendientes)}):")
        for nombre, motivo in pendientes:
            print(f"  - {nombre}: {motivo}")
    if aplicar:
        escribir_nombres_areas()
    if not aplicar:
        print('(vista previa: añade --apply para escribir)')


if __name__ == '__main__':
    main()
