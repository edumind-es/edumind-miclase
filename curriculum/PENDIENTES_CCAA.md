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

## Estado (8 de noviembre de 2026)

| Comunidad | Primaria | ESO | Descriptores (P / ESO) |
|---|---|---|---|
| Asturias | 10 áreas, 60 JSON | 28 áreas (con Mat. A/B), 98 JSON | 95 % / 88 % |
| Extremadura | 7 áreas, 38 JSON | 27 áreas, 62 JSON | 93 % / 83 % (90 % en materias del RD) |
| Murcia | 13 áreas, 74 JSON | 36 áreas, 123 JSON | 99 % / 97 % |
| Ceuta y Melilla | 6 áreas, 36 JSON | 21 áreas, 69 JSON | 100 % / 100 % |
| Cantabria | 7 áreas, 42 JSON | — (matriz recortada) | 100 % / — |
| Illes Balears | — (columnas mezcladas) | 8 áreas, 10 JSON | — / 100 % |
| La Rioja | 9 áreas, 46 JSON | 6 áreas, 15 JSON | 84 % (98 % RD) / 98 % |
| Navarra | 9 áreas, 50 JSON | 20 áreas, 71 JSON | 100 % / 100 % |
| Catalunya | — | — | sin «Enllaços»: 0 % |
| Andalucía | — | — | — |

Cada comunidad tiene abajo lo que se hizo y lo que quedó. Lo más importante que
falta, por orden de valor:
1. **Andalucía entera** (ver su apartado): extractor propio de las tablas del BOJA.
2. **Catalunya**: una fuente de conexiones competencia específica → descriptores.
3. **Cantabria ESO, Baleares Primaria y Ceuta y Melilla** (Conocimiento del Medio,
   Biología, EF, Geografía e Historia): sacar los criterios del decreto u Orden,
   porque la matriz está recortada, mezclada o sin curso.
4. **Saberes** de las áreas repartidas por tandas (Extremadura, Murcia, Ceuta y
   Melilla) y criterios que el decreto trae y la matriz no.
5. **Etapas que faltan en las 7 de antes** (Aragón, Canarias y CyL ESO; CLM Primaria;
   Valencia ESO): sin decidir si se añaden.

Cómo se comprueba la calidad, comunidad a comunidad (conversor):
- Con decreto en PDF, cada criterio tiene que estar tal cual en él (el 90 % del
  fichero, o el fichero no entra); lo que la matriz pegó detrás se recorta al texto
  literal del decreto.
- Las tandas de criterios con los mismos códigos se reparten por el encabezado de
  curso del decreto (o, en Ceuta y Melilla, por las matrices de los RD).
- Erratas solo corregidas contra la norma (`CORRECCIONES`).
- Donde el nombre del fichero no es fiable, la materia se identifica por el texto de
  sus competencias específicas frente a las del RD.
- Lo importado antes se regenera en una carpeta aparte tras cada cambio del conversor
  y se compara campo a campo: solo cambia lo que se quiere cambiar.

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

## Cantabria (`Cantabria`)

### Primaria — importada
7 áreas, 42 JSON, 100 % con descriptor. Dos erratas del origen corregidas contra el
Decreto 66/2022 (`PRIMARIA/Cantabria_Primaria.pdf`): en el primer ciclo, Educación
Artística «Explorar manifestaciones culturales y artísticas…» es 1.2 (no 2.2) y
Matemáticas «Reconocer las matemáticas presentes en la vida cotidiana…» es 5.2 (no 6.2).

### Secundaria — sin importar
La matriz de iDoceo está recortada: Lengua Castellana trae 5 criterios por tramo,
Biología 2 o 3, ningún área trae saberes, hay áreas duplicadas con número
(«Lengua Extranjera (16)», «Tecnología (19)») y 11 ficheros [REVISAR]. Importarla
dejaría un currículo engañosamente incompleto. El decreto bueno es
`SECUNDARIA/Cantabria_Secundaria.pdf` (Decreto 73/2022, mismo formato que Murcia:
«Cursos primero y segundo», «Criterios de evaluación», «1.1. …» y, en cada
competencia, «se conecta con los siguientes descriptores: …»). **Ojo:**
`SECUNDARIA/2022-6239.pdf` no es el currículo, es la Orden EDU/42/2022 de
implantación del Bachillerato. Hace falta sacar la ESO de Cantabria del decreto.

## Catalunya — sin importar

El conversor la lee (nombres desde la matriz madre, ciclos en catalán), pero:
- **Ninguna competencia específica trae «Enllaços»**, ni en la matriz ni en la madre,
  y el Decret 175/2022 (`PRIMARIA/1928585.pdf.txt`) solo nombra los descriptores en
  el Anexo 1, sin vincularlos a cada competencia. Al estar en catalán, la reserva
  estatal no puede casarlas por parecido: 0 % conectado, muy por debajo del 85 % de
  `conexiones.test.mjs`. Hace falta una tabla de conexiones (a mano o desde otra
  fuente oficial) antes de poder importarla.
- Además, en ESO hay ficheros con criterios de otras materias mezclados (Cultura
  Clàssica con criterios de Tecnologia, Educació Física con criterios de Música), y
  Tecnologia, Filosofia y Valors llevan pegado al criterio el texto explicativo de la
  competencia («Aquesta competència específica aborda…»).
- No hay decreto de ESO en la carpeta.

## Illes Balears (`Baleares`)

Decretos: `PRIMARIA/8702.pdf` y `SECUNDARIA/8703.pdf`. Cada criterio de la matriz se
busca tal cual en el decreto: si menos del 90 % aparece, el fichero no se importa.

### Primaria — sin importar
Solo 114 de 354 criterios aparecen tal cual en el decreto: la matriz mezcló las dos
columnas de las tablas del decreto («Identificar els Explorar les possibilitats de la
pròpia motricitat a través desplaçaments actius com a del joc…»). Hay que sacarla
del decreto.

### Secundaria — importada en parte
10 ficheros, 100 % con descriptor: Biologia i Geologia 4.º, Educació Plàstica 2.º,
Valors 4.º, Física i Química 4.º, Geografia i Història 2.º, Introducció a la
Filosofia 3.º, Matemàtiques 4.º y Música 1.º, 3.º y 4.º.

Hecho al importar:
- Cada criterio llevaba pegadas las «aclariments orientatius» del decreto (las
  viñetas que siguen a «CA 1.1 …»): recortados al texto literal del decreto.
- Competencias específicas repetidas (una copia con «Enllaços» y otra sin ellos):
  se queda la que trae enlaces.

Pendiente:
- **Llengua Estrangera y Segona Llengua Estrangera (1.º a 4.º)**: ninguna competencia
  trae «Enllaços» y en catalán no casan con el RD. Criterio CE6.1 de 1.º y 2.º, además,
  sin recortar (más de 700 caracteres).
- **Sin criterios en origen**: Cooperació i Serveis a la Comunitat, Digitalització,
  Economia i Emprenedoria, Educació Física, Expressió Artística, FOPP, Igualtat de
  Gènere, Introducció a les tècniques experimentals, Llatí, Llengua Castellana, Llengua
  Catalana, Taller de Finances, Tecnologia i Digitalització y Tecnologia.
- Tres ficheros [REVISAR] sin área clara («àrea 09», «àrea 23», Cultura Clàssica).

## La Rioja (`LaRioja`)

Decretos: Decreto 41/2022 (`PRIMARIA/8506.pdf`) y Decreto 42/2022
(`SECUNDARIA/8507.pdf`). **Ojo:** `SECUNDARIA/8967.pdf` es el Decreto 30/2025, que
modifica el currículo de la ESO; no se ha cruzado con él.

### Primaria — importada
9 áreas, 46 JSON. 84 % con descriptor (98 % en las materias del RD). No conectan
Dramatización y Teatro (optativa propia) ni parte de Educación Plástica y Visual y de
Música y Danza, que en La Rioja son áreas separadas y en el RD forman Educación
Artística.

Hecho al importar: criterios que arrastraban lo que seguía en el decreto (número de
página «- 48 -», «3. Competencia específica 3», «DESCRIPTORES DE CONTENIDO…»),
recortados al texto literal del decreto.

Pendiente: Educación Plástica y Visual 3.º-6.º sin saberes.

### Secundaria — importada en parte
6 materias, 15 JSON, 98 % con descriptor. Casi todos los ficheros se llaman
«[Revisar] Materia (L…)»: la materia se identifica por el texto de sus competencias
específicas frente a las del RD (parecido ≥ 0,7 y 0,4 por encima de la siguiente).
Importadas: Biología y Geología 4.º, Educación Física 1.º-4.º, Educación Plástica 1.º
y 3.º, Lengua Castellana 1.º-4.º, Matemáticas 1.º-2.º (**trae 5 de las 10
competencias específicas**) y Tecnología y Digitalización 1.º-2.º.

Pendiente:
- **Curso «Configuración N»** que el decreto tampoco dice (criterio no localizado
  bajo un encabezado de curso): Tecnología, Digitalización, Valores Cívicos, Latín,
  Economía y Emprendimiento, FOPP, Biología (dos ficheros), Lengua Castellana (otro),
  Expresión Artística.
- **Sin identificar** (no casan con ninguna materia del RD: optativas propias o, en
  Geografía e Historia, quizá el texto de la modificación de 2025): L10689 (parecido
  0,33 con Música), L12169, L13254, L13836, L14303, L15319 (0,36 con Biología), L15625,
  L16473 (0,30 con Física y Química), L17314, L3874 (0,33 con Geografía e Historia) y
  Taller de Plástica, Visual y Audiovisual.
- **Dos Lengua Extranjera** con criterios distintos (L12416 nombra el francés; L6906 el
  inglés y la «segunda lengua»): no se sabe cuál es la primera; no se importa ninguna.
- Física y Química y Música («Cursos Segundo y Tercero») y Matemáticas 1.º-3.º (L5711)
  traen varias tandas que el decreto no reparte.
- Biología «Configuración 2» choca con «Configuración 1» en 1.º.

## Navarra (`Navarra`)

Decretos Forales 67/2022 (Primaria) y 71/2022 (ESO), en castellano. Las matrices no
traen «Enlaces»: la conexión sale toda de la reserva estatal (100 % en las dos etapas).

### Primaria — importada
9 áreas, 50 JSON, con Lengua Vasca y Literatura. El decreto pone los tres ciclos en
columnas paralelas: un criterio que no aparece seguido en el texto se acepta si no
tiene ninguna señal de mezcla de columnas (`COLUMNAS_PARALELAS`; Navarra: 0 de 400
criterios con señales, frente a 223 de 354 en Baleares).

Pendiente: Valores Cívicos y Éticos 5.º-6.º sin saberes.

### Secundaria — importada
20 materias, 71 JSON. Los nombres de la matriz no son fiables y se identifican por
contenido: «Lengua Castellana y Literatura» es Biología y Geología, «Conocimientos,
destrezas y actitudes» es **Lengua Vasca y Literatura** (por su texto: nombra el
euskera), «Situaciones de aprendizaje» es el Ámbito de Ciencias Aplicadas,
«Tipologías corporales predominantes» es Educación Plástica, y las «Materia NN»
son Educación Física, Geografía e Historia, Matemáticas, Lengua Castellana, Lengua
Extranjera, Latín, Música, Tecnología, etc. (cada caso, con su parecido, en los avisos
del conversor).

Pendiente:
- **Sin identificar** (optativas propias): Materia 02, 10, 19, 20 y 22.
- **Sin curso en el decreto**, en los cuatro cursos: diez materias que el fichero da
  como «Toda la etapa» (Digitalización, Economía, Valores Cívicos, FOPP, Latín,
  Tecnología, Tecnología y Digitalización, Expresión Artística y los dos Ámbitos).

## Andalucía — sin importar

- **La matriz de iDoceo no sirve**: EF de 1.º de Primaria trae 3 criterios, los
  saberes son solo códigos («EFI.1.A.1») y en ESO casi todas las áreas mezclan cursos.
- **Los JSON intermedios de la carpeta** (`PRIMARIA/_and_pri3.json`, el más completo,
  con Valores Cívicos; `SECUNDARIA/_and_sec.json`), sacados del BOJA, tampoco bastan:
  - En Primaria el curso se deduce bien del código (cada ciclo empieza en «1.1.a»;
    «a» es el primer curso del ciclo y «b» el segundo, como confirman los pocos
    criterios que sí lo traen), y los 619 criterios están en la Orden. Pero **104
    están cortados** a media frase («…comprendiendo y»): las celdas de la tabla del
    BOJA saltan de página y la extracción se quedó con la primera parte.
  - En ESO **ningún criterio trae curso**, 182 de 705 están cortados y 55 no aparecen
    en la Orden.
  - Ninguno trae el texto de los saberes, solo sus códigos.
- **Lo que sí está en la Orden** (`BOJA23-104-…pdf.txt`): la conexión de cada
  competencia específica con sus descriptores («Esta competencia específica se conecta
  con los siguientes descriptores del Perfil de salida: CCL1, CCL2…»), así que una
  extracción buena tendría las competencias clave completas.
- **Plan**: un extractor de las tablas de la Orden de Primaria (Orden de 30 de mayo de
  2023) y de ESO que reconstruya cada celda a través del salto de página y lea el
  curso de la cabecera de la tabla; validarlo contra los criterios que sí están
  enteros en `_and_pri3.json`.
