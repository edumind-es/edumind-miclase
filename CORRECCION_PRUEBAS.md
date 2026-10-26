# Corregir pruebas escritas en MiClase: protocolo

Cómo pasar de un examen en papel a corregirlo pregunta a pregunta en MiClase
pulsando un nivel por pregunta, sin volcar a mano ni preguntas ni claves. Un
examen = un fichero de planilla = un instrumento de prueba escrita en una
unidad. Todo se lee en el aparato; nada sale de él.

## 1. Lo que hace falta antes de pedir la planilla

- El examen tal cual se da al alumnado (PDF, foto o texto).
- Los criterios que la programación asigna a la prueba escrita en ESA unidad
  (lo que trae PROENS). Si el examen pregunta por criterios que la unidad no
  programa con ese instrumento, esas preguntas no pondrán nota en ningún
  criterio: o se añade el criterio al instrumento en la unidad (gestor de
  instrumentos), o se asume que el examen solo califica los programados.
  Ejemplo real: en CN UD1, CA2.2 y CA2.3 son el 46 % de los puntos y PROENS
  no los lleva en la UD1.
- Las decisiones de corrección que dependan del libro (qué se admite, qué no).

## 2. Pedir la planilla a la IA

El prompt lo genera la app (editor del examen → bloque de IA → «Copiar
prompt»): lleva ya el área, el curso y los criterios del instrumento. Se pega
en Claude, ChatGPT o Gemini junto con el examen, y devuelve una tabla con una
fila por pregunta:

| Ítem | Pregunta | Criterio | Tipo | Máximo | Clave | Puntuación | Nivel 1 … Nivel 6 | Notas |
|---|---|---|---|---|---|---|---|---|

- **Ítem**: número de la pregunta. Una pregunta con apartados de criterios
  distintos se parte en dos filas («5 (a-d)», «5 (e-j)»).
- **Pregunta**: enunciado resumido («P3 Tabla tejido-órgano»). En la planilla
  pensada para iDoceo esta columna se llama «Columna» y lleva el criterio y
  el máximo dentro («CA2.1 · P3 Táboa tecido-órgano (/1)»): se lee igual.
- **Criterio**: el id del criterio de la programación (CA2.1). Con él, cada
  criterio recibe la nota de SUS preguntas.
- **Tipo**: «Respuesta cerrada» o «Desarrollo». Informativo.
- **Máximo**: lo que vale la pregunta.
- **Clave** (o «Resposta correcta / clave»): la respuesta esperada.
- **Puntuación**: cómo se reparten los puntos («0,25 por cada acierto»,
  «4 indicadores × 0,25: …»).
- **Nivel 1 … Nivel 6**: solo en las de desarrollo, de más a menos, cada
  celda «0,75 pt · cómo se reconoce». «Non procede» o vacío = sin niveles.
- **Notas**: lo que se admite y lo que no, y lo que queda por decidir o
  comprobar («COMPROBAR CON EL LIBRO…»). Se ve al corregir.

Lo que devuelve la IA se revisa (sobre todo Clave y Notas) y se guarda como
`.csv` o `.xlsx` con un nombre que diga área y unidad (`CN_UD1_clave.csv`), o
se pega directamente en el editor del examen. Las cabeceras valen en
castellano y en gallego. En un `.xlsx` con varias hojas se busca la hoja que
tenga la planilla, aunque no sea la primera (la de iDoceo con el alumnado va
delante).

## 3. Meterla en MiClase

- Desde «Evaluar con QR y cámara» → «Nuevo examen» → clase, área, unidad e
  instrumento de prueba escrita → «Importar»; o desde la cabecera de la
  columna del examen en el Calificador → «Editar examen» → «Importar».
- El editor enseña las preguntas con su clave, su reparto y sus niveles.
- **Criterios.** Si el fichero no trae criterios, la nota del examen va a
  todos los criterios que la programación asigna al instrumento en esa
  unidad. Si los trae y alguno no está entre los del instrumento, el editor
  lo señala y ofrece, por criterio, elegir adónde van sus preguntas de una
  vez: a uno de los criterios que el instrumento sí evalúa (el listado sale
  de PROENS) o a «todos los del examen». La alternativa es añadir el
  criterio al instrumento en la programación (punto 1), que es la que manda.
- Guardar. El examen queda en la columna del instrumento y en el banco.

## 4. Corregir

Panel de la casilla del alumno (o evaluación rápida con el QR de mesa) →
«Corregir». Bajo cada pregunta están la clave, el reparto y las notas, y una
fila de botones:

- Con niveles: un botón por nivel, con sus puntos y su texto. Pulsar uno pone
  esos puntos; volver a pulsarlo lo quita.
- Sin niveles (respuesta cerrada): los escalones que deja el reparto
  («0,25 por cada acierto» → 1 · 0,75 · 0,5 · 0,25 · 0; «a) 0,3 · b) 0,3 ·
  c) 0,4» → cualquier combinación).
- La casilla de teclear y los botones ✓ / 0 siguen ahí para lo que no encaje.

La nota del examen y la de cada criterio salen solas (`notaDePrueba`); lo no
anotado vale cero. El informe de la prueba (cabecera de la columna) dice qué
pregunta y qué criterio fallan en el grupo.

## 5. Dónde vive cada cosa

- Modelo: `frontend/src/db/prueba.ts` (`PreguntaPrueba.niveles`, `.notas`,
  `escalonesDePregunta`).
- Lectura: `frontend/src/ia/pruebaImportar.ts` (`pruebaDeFilas`,
  `filasDeCsv`, hojas del xlsx en `xlsxMinimo.leerXlsxHojas`).
- Prompt: `frontend/src/ia/pruebaPrompt.ts` (`generarPromptPlanilla`).
- Corrector: `frontend/src/components/CorregirPrueba.tsx`
  (`[data-pregunta-niveles]`, `[data-nivel]`, `[data-pregunta-notas]`).
- Fixture real: `pruebas/fixtures/planilla_clave_rubricas.csv` y `.xlsx`
  (CN 6.º, UD1; sin datos personales), en `pruebas/prueba-escrita.test.ts`.
