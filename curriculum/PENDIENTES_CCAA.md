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

## Estado (1 de noviembre de 2026)

| Comunidad | Primaria | ESO | Descriptores (P / ESO) |
|---|---|---|---|
| Asturias | 10 áreas, 60 JSON | 26 áreas (+ Mat. A/B), 98 JSON | 95 % / 88 % |
| Extremadura | 7 áreas, 38 JSON | 25 áreas (+ Mat. A/B), 62 JSON | 93 % / 84 % (90 % en materias del RD) |
| Murcia | 13 áreas, 74 JSON | 34 áreas (+ Mat. A/B), 123 JSON | 99 % / 97 % |

Sin hacer todavía, en este orden propuesto:
1. **Ceuta y Melilla**: limpia en el inventario (7 áreas en Primaria, 22 en ESO; 8
   ficheros de ESO vacíos que se descartan; Infantil no, la app no tiene esa etapa).
2. **Andalucía**: la matriz no sirve tal cual (EF 1.º de Primaria trae 3 criterios; los
   saberes son solo códigos como «EFI.1.A.1»; en ESO casi todas las áreas mezclan
   cursos). Hay que sacarla de la Orden: en la carpeta están ya el texto
   (`BOJA23-104-…pdf.txt`, `Decreto101-2023EducacionPrimaria.pdf.txt`) y unos JSON
   intermedios (`_and_pri*.json`, `_and_sec.json`).
3. **Cantabria** (ESO sin ningún saber, 11 [REVISAR]), **Catalunya** y **Baleares**
   (en catalán; Baleares ESO con 17 de 35 ficheros sin criterios).
4. **La Rioja** y **Navarra** ESO: la mayoría de áreas sin nombre («Materia (L10689)»,
   «Materia 05») y cursos «Configuración N». Primaria de las dos sí está bien.
5. **Etapas que faltan en las 7 de antes** (Aragón, Canarias y CyL ESO; CLM Primaria;
   Valencia ESO): sin decidir si se añaden.

Para cada comunidad: añadir sus decretos a `DECRETOS` si están en la carpeta, vista
previa, revisar avisos y pendientes, `--apply`, añadirla a `COMUNIDADES` de
`GruposPage.tsx`, `node pruebas/conexiones.test.mjs` y seed en una copia.

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

### Descriptores (`pruebas/conexiones.test.mjs`)
Primaria 95 % conectada, ESO 88 % (mínimo 85 %). Sin «Enlaces» en origen y sin
competencia específica estatal con la que casar: Lengua Asturiana y Literatura
(las dos etapas), Proyecto de Emprendimiento Social o Empresarial y Taller de
Economía Aplicada (optativas propias), y Filosofía y Educación en Valores Cívicos y
Éticos de ESO. Lengua Castellana de ESO tampoco trae «Enlaces» y la cubre la
reserva estatal.

## Extremadura (`Extremadura`)

Las matrices no traen descriptores en «Enlaces» y el decreto tampoco vincula cada
competencia específica con ellos: la conexión sale toda de la reserva estatal.

Los cursos se comprueban contra el decreto (Decreto 110/2022 de ESO,
`SECUNDARIA/22040165C.pdf`, y el de Primaria, `PRIMARIA/22040159C.pdf`): cada tanda de
criterios se busca pegada a su «Criterio X.Y.» y toma el encabezado de curso que el
decreto le pone encima. Así, materias que el fichero daba como «Toda la etapa» quedan
en su curso real (Digitalización, Economía y Emprendimiento, Expresión Artística, FOPP e
Introducción a la Filosofía en 4.º; Valores Cívicos y Emprendimiento Social en 2.º;
Cultura Clásica en 3.º; Unión Europea en 3.º o 4.º).

### Primaria — importada
7 áreas, 38 JSON. Valores Cívicos en 5.º y 6.º.

Hecho al importar:
- Educación Artística: el fichero «Primer ciclo» trae dos tandas (primer y segundo
  ciclo); repartidas por el decreto.
- Descartadas competencias específicas que no lo son (saberes colados al extraer):
  CE1978 en Conocimiento del Medio; CE999 y CE9999 en Matemáticas.

Pendiente:
- **Educación Artística 1.º-4.º sin saberes**: la matriz da una sola lista para las
  dos tandas, sin curso.

### Secundaria — importada
25 áreas (27 con Matemáticas A y B), 62 JSON.

Hecho al importar:
- Nueve áreas traían en un solo fichero varias tandas de criterios con los mismos
  códigos (una por grupo de cursos). Repartidas por el decreto: Biología y Geología
  (1.º y 3.º | 4.º), Educación Física, Geografía e Historia, Lengua Castellana, Lengua
  Extranjera y Segunda Lengua (1.º-2.º | 3.º-4.º), Física y Química (2.º-3.º | 4.º),
  Música (1.º-2.º | 4.º) y Matemáticas (1.º-3.º | 4.º A | 4.º B).
- Descartada la competencia específica CE112 «Pautas.» de Educación Física.

Pendiente:
- **Sin saberes las nueve áreas repartidas.** La matriz da una sola lista sin curso y
  la madre los etiqueta mal (pone «Segundo ciclo» a saberes que el decreto da en 1.º-2.º).
  En el decreto están en tablas a dos columnas con el curso en el código
  (A.1.**2**.1 = 1.º-2.º, A.1.**4**.1 = 3.º-4.º): se pueden sacar de ahí.
- **Criterios que el decreto trae y la matriz no**: Biología 4.º CE3.6; Lengua
  Castellana 3.º-4.º CE3.3; Matemáticas A CE2.1 y CE3.4; Matemáticas B CE2.1, CE3.4,
  CE5.1, CE5.2, CE7.2, CE8.1, CE8.2 y CE10.1.
- **Sin curso en el decreto**, se quedan en los cuatro cursos del fichero: Latín
  (solo la introducción dice «al finalizar cuarto de ESO») y los dos Ámbitos.
- **Descriptores**: 84 % conectado, por debajo del 85 % de `conexiones.test.mjs`.
  Contando solo materias del RD, 90 %. No conectan las optativas propias (Cultura
  Clásica, Unión Europea, Introducción a la Filosofía, Emprendimiento Social y
  Sostenibilidad, Digitalización Básica) ni algunas CE que Extremadura reescribió
  (EF CE5, Biología CE6-CE7, Plástica…).

## Murcia (`Murcia`)

Las matrices traen descriptores en «Enlaces»: 99 % conectado en Primaria y 97 % en
ESO. Decretos: `PRIMARIA/2022-5907.pdf` y `SECUNDARIA/2022-6346.pdf` (BORM). El decreto
solo se consulta para los ficheros con varias tandas o «Toda la etapa»: si el fichero
ya dice su curso, manda el fichero (Murcia repite criterios literales en varios cursos
y el decreto casaría con el primero).

### Primaria — importada
13 áreas, 74 JSON, incluidas Lengua de Signos Española, Profundización Educativa y
Refuerzo de la Competencia en Comunicación Lingüística.

Hecho al importar:
- Educación Física: el fichero «Primer ciclo» trae dos tandas (primer y segundo
  ciclo); repartidas por el decreto.

Pendiente:
- **Educación Física 1.º-4.º sin saberes**: una sola lista para las dos tandas.
- **Sin curso en el decreto**, en todos los cursos: Valores Cívicos y Éticos, Lengua de
  Signos Española y Refuerzo de la Competencia en Comunicación Lingüística.

### Secundaria — importada
36 áreas (con Matemáticas A y B), 123 JSON.

Hecho al importar:
- Educación Física «Tercer curso» trae también 4.º («Curso cuarto»), y Matemáticas
  «Tercer curso» trae también 4.º A y 4.º B: repartidas por el decreto. Matemáticas A
  y B van a 4.º porque solo existen ahí (RD 217/2022, art. 9).

Pendiente:
- **Criterios que el decreto trae y la matriz no**: Educación Física 4.º CE2.1-2.3,
  CE4.1, CE4.3, CE5.1, CE5.2; Matemáticas A CE2.1, CE3.3; **Matemáticas B trece**
  (CE2.1, CE3.3, CE5.1, CE5.2, CE6.1, CE7.1, CE7.2, CE8.1, CE8.2, CE9.1, CE9.2,
  CE10.1, CE10.2: solo trae 10).
- **Sin saberes**: Educación Física 3.º-4.º, Matemáticas 3.º, 4.º A y 4.º B.
- **Sin curso en el decreto**, en los cuatro cursos: Artes Escénicas y Danza,
  Comunicación Audiovisual, Cultura Clásica, Digitalización, Digitalización Creativa,
  Economía y Emprendimiento, Valores Cívicos y Éticos, Emprendimiento Personal y Social,
  Expresión Artística, FOPP, Latín, Tecnología y los seis Proyectos de Investigación.

## Ceuta y Melilla (`CeutaMelilla`)

Currículo del Ministerio. No hay decreto en la carpeta: la referencia para repartir
las tandas son las matrices de los Reales Decretos
(`REALES DECRETOS/{PRIMARIA,SECUNDARIA}/MATRICES/XLSX`, `MatrizReferencia` en el
conversor), casando cada tanda por código y texto exactos con su fila «Curso / ciclo».
Descriptores: 100 % en las dos etapas (las matrices traen «Enlaces»).
Infantil no se importa: la app no tiene esa etapa.

### Primaria — importada
6 áreas, 36 JSON. Educación Artística, Educación Física, Lengua Castellana, Lengua
Extranjera y Matemáticas traían los tres ciclos en un fichero «Toda la etapa»;
repartidos por el RD 157/2022.

Pendiente:
- **Conocimiento del Medio Natural, Social y Cultural, sin importar**: sus tres tandas
  no son las del RD (texto propio de Ceuta y Melilla) y nada dice de qué ciclo es cada
  una. Hace falta la Orden del Ministerio para Ceuta y Melilla.
- **Sin saberes** las cinco áreas repartidas: una sola lista para los tres ciclos.

### Secundaria — importada
20 áreas (con Matemáticas A y B), 69 JSON.

Pendiente:
- **Sin importar, por la misma razón** (tandas con texto propio, curso a curso, que no
  casan con el RD 217/2022 y no dicen su curso): **Biología y Geología** (tres
  tandas en «Primer curso»), **Educación Física** (cuatro tandas: por los verbos,
  «Diseñar», «Establecer», «Planificar», «Autorregular», serían 1.º a 4.º, pero no
  se puede comprobar), **Geografía e Historia** (cuatro tandas) y **Física y Química
  de 3.º**. Hace falta la Orden del Ministerio para la ESO de Ceuta y Melilla.
- Ocho ficheros «Toda la etapa» vacíos (sin criterios): Biología, Plástica, Física y
  Química, Lengua Castellana, Lengua Extranjera, Matemáticas, Música y Tecnología y
  Digitalización. Las que tienen ficheros por curso entran por ellos.
- **Sin saberes**: Matemáticas 1.º-3.º, 4.º A y 4.º B.
- **Sin curso en la referencia**, en los cuatro cursos: Cultura Clásica,
  Digitalización, Valores Cívicos y Éticos, Introducción a la Filosofía, Medios y
  Recursos Digitales y Tecnología.
