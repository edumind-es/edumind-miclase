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
- Si dos ficheros cubren el mismo curso y no comparten ningún código de criterio, son
  trozos del mismo decreto y se funden. Si comparten alguno, manda el más específico.
- Matemáticas A y B de 4.º de ESO son áreas distintas (`matematicas-a`, `matematicas-b`).
- Un área sin saberes en origen se importa con sus criterios y se apunta aquí.
- Las erratas del origen solo se corrigen si se comprueban contra la norma, en
  `CORRECCIONES` del conversor y con la fuente al lado.
- No se importa lo que no tiene área o curso fiable. Queda aquí, sin inventarlo.
- El nombre legible de cada área sale de `meta.asignatura_nombre` y el conversor lo
  vuelca en `frontend/src/components/nombresAreas.ts` (generado).

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

### Secundaria — importada
26 áreas, 98 JSON. Las materias que el origen da como «Toda la etapa» (Filosofía,
Latín, Digitalización, Economía y Emprendimiento…) salen en los cuatro cursos, como
en las comunidades anteriores: el docente elige el suyo.

Hecho al importar:
- Biología y Geología 1.º y 3.º: dos ficheros complementarios (CE2 en uno, el resto
  en otro) fundidos en 19 criterios.
- Biología y Geología: el origen pone CE5.2 a «hábitos sostenibles» y a «hábitos
  saludables»; según el RD 217/2022 el segundo es **5.3**. Corregido.
- Educación Plástica, Visual y Audiovisual 1.º y 3.º: fundido el fichero «1.º y 3.º»
  (CE2, 3, 6, 7) con el de cada curso (CE1, 4, 5, 8).
- Matemáticas 4.º: A y B por separado.

Pendiente (huecos de la fuente; hay que sacarlos del decreto asturiano):
- **Matemáticas 1.º, 2.º y 3.º sin saberes.** El «Toda la etapa» trae 270 saberes de
  todos los cursos mezclados, sin marca de curso: no se reparten a ojo.
- **Educación Física 3.º y 4.º sin saberes.** El «Toda la etapa» solo repite los de 1.º-2.º.
