# Currículo de las CCAA incorporadas desde CURRICULOS_NUEVOS

Origen: `/var/www/edumind_content/idoceo_matrices/CURRICULOS_NUEVOS` (matrices iDoceo
renombradas a «Comunidad · Etapa · Área · Ciclo.xlsx»). Conversor:
`scripts/parse_curriculum_ccaa.py <CARPETA> <etapa> [--apply]`, una comunidad y una
etapa cada vez. No sobrescribe ningún JSON: las 7 comunidades anteriores (Aragón,
Canarias, CLM, CyL, Galicia, Madrid, Valencia) siguen exactamente igual.

Reglas de importación:
- Un JSON por curso. Un ciclo se reparte en sus dos cursos; «Toda la etapa» va a todos
  los cursos, salvo que el área traiga ficheros por ciclo o curso (entonces es la unión
  de esos y se descarta).
- La columna Enlaces se conserva tal cual: descriptores de cada competencia específica
  (`objetivos[].descriptores_ids`), CE de cada criterio y criterios de cada saber.
- No se importa lo que no tiene área o curso fiable. Queda aquí, sin inventarlo.

Prueba de no regresión: Valencia EF 1.º leída con el mismo lector da criterios,
competencias específicas, bloques y saberes idénticos al repositorio. Solo difiere
el texto de los descriptores, que en el origen nuevo viene limpio y en el repo está
mezclado (columnas del PDF). No se ha tocado Valencia.

## Asturias (`Asturias`)

### Primaria — importada
10 áreas, 1.º a 6.º, 60 JSON, 902 criterios: Ciencias de la Naturaleza, Ciencias
Sociales, Cultura Asturiana, Educación Artística, Educación Física, Educación en
Valores Cívicos y Éticos (toda la etapa), Lengua Asturiana y Literatura, Lengua
Castellana y Literatura, Lengua Extranjera, Matemáticas.

Pendiente: nada. Descartados por repetir los ciclos: «Toda la etapa» de Ciencias
Sociales, Ciencias de la Naturaleza y Educación Artística.
