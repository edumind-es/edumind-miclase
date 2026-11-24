# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[versión semántica](https://semver.org/lang/es/).

- **Mayor**: cambia cómo se usa la app o exige actualizar todos los aparatos antes de seguir.
- **Menor**: una función nueva.
- **Parche**: un arreglo.

Cada cambio se anota en «Sin publicar» en su propio PR. Al desplegar,
`npm run version:subir -- parche|menor|mayor` sube el número en todos los
sitios y sella esa sección con la versión y la fecha.

## [Sin publicar]

## [1.14.0] — 2026-11-24

### Añadido
- Con Lámina encendida, una clase con **una sola área entra directa** al
  Calificador y a «Exámenes y pruebas»: el hub de áreas solo sale cuando hay
  entre qué elegir.
- Con Lámina encendida y sesión de EDUmind, el pie del menú dice «Conectado
  con EDUmind».

### Corregido
- Con Lámina encendida, Ctrl+B no plegaba ni desplegaba el menú.

## [1.13.0] — 2026-11-24

### Añadido
- Con Lámina encendida, **los emoji de toda la interfaz se ven como iconos de
  línea** de un solo color, iguales en todos los sistemas. Los dibuja una
  fuente propia (`EmojiLamina.woff`, 5 KB) que solo se usa con Lámina; con el
  aspecto de siempre no se descarga y los emoji siguen como estaban.
- Con Lámina encendida, las notas que cada diálogo pintaba por su cuenta
  (panel de la casilla, explicación de la nota, pasadas de clase, corrector)
  obedecen también a «filete o relleno», y desaparecen los fondos de blanco
  puro y las sombras que quedaban escritos en las pantallas.

## [1.12.0] — 2026-11-24

### Añadido
- Con Lámina encendida, el hub de «Exámenes y pruebas» lleva arriba la cola
  **«Por corregir»**: los exámenes de la clase a los que les faltan alumnos,
  con cuántos lleva corregidos cada uno y el botón «Corregir».
- Con Lámina encendida, cada sesión de Planificación lleva el color y la
  sigla de su área.

## [1.11.0] — 2026-11-24

### Añadido
- Con Lámina encendida, «Exámenes y pruebas» entra por un **hub de áreas** en
  vez de por pestañas: una casilla por área con su sigla, su color y cuántos
  exámenes tiene, y «Todas las áreas» para volver.
- Con Lámina encendida, las pestañas no se deslizan ni se cortan: las que no
  caben pasan enteras a «Más · N» y la elegida queda siempre a la vista.
- Con Lámina encendida, los desplegables que quedan se ven igual cerrados en
  todos los sistemas, y el aspa de cerrar un diálogo es un icono de línea.

## [1.10.0] — 2026-11-24

El interruptor, el marco y los iconos (fases 0 y 1 de Lámina) se desplegaron
ya el mismo día con la etiqueta 1.9.0, antes de que el paso de subir versión
estuviera en uso; se anotan aquí, que es donde quedaron escritos.

### Añadido
- Interruptor del aspecto Lámina, **apagado por defecto**: la app se ve igual
  que antes. Se enciende en un aparato abriendo la app con `?aspecto=lamina`
  y se apaga con `?aspecto=clasico`. Encendido, los colores, radios, sombras y
  tipografía pasan a papel, tinta y filete; el interior de cada pantalla se
  irá haciendo por fases hasta la 2.0.0.
- Familia de iconos propios, de línea y de un solo color, para sustituir a
  los emoji. Todavía no se usan en ninguna pantalla.
- Con Lámina encendida, **marco nuevo**: menú con iconos en tres formas
  (ancho, plegado con nombre corto y barra inferior con «Más» en el móvil),
  barra superior con la clase, el área y el trimestre en listas propias, y
  «Acerca de» con la versión, el idioma, el aspecto, la cuenta e «Instalar».
- Con Lámina encendida, botones, campos, tarjetas, diálogos, pestañas y
  títulos en papel, tinta y filete, y los avisos sin fondos pastel.
- Con Lámina encendida, la tabla del Calificador sobre papel y las **notas en
  filete o en relleno**, a elegir en «Acerca de» (filete por defecto).
- Con Lámina encendida, **hub de áreas**: el Calificador entra por una
  pantalla con todas las áreas de la clase, cada una con su sigla y su color,
  y «seguir donde lo dejaste». Dentro de un área, una franja de su color bajo
  la barra y la sigla en el selector. El color y la sigla de cada área se
  cambian en Mis clases → Áreas.

### Corregido
- Asistencia en el móvil: el pase de lista quedaba en una columna de 78 px y
  su contenido se salía de la pantalla. Ahora el historial y el pase de
  lista van uno debajo del otro.

## [1.9.0] — 2026-11-24

Primera versión numerada con este protocolo. Recoge lo que la app es hoy, tras
133 PR sin número: hasta aquí los `package.json` decían 0.1.0 y el pie del
menú, «v1.0» escrito a mano.

### Añadido
- La versión se lee del `package.json` al compilar y sale en el pie del menú.
- `npm run version:subir`, este registro y una prueba que falla si la versión
  no coincide en todos sus sitios o no tiene entrada aquí.
- `desplegar.sh` etiqueta cada versión publicada y no publica dos commits
  distintos con el mismo número.

### Lo que ya hacía la app
- **Local primero**: los datos de aula viven en el aparato; el servidor solo
  sirve el currículo y la cuenta. Sincronización entre aparatos por QR, por
  paquete (AirDrop, Quick Share) y copia automática en carpeta.
- **Calificador** por instrumento y por criterio, con unidades estancas,
  instrumentos y actividades, rúbricas, diario de evaluación, nota directa y
  «Todo el curso».
- **Exámenes y pruebas**: editor, planilla de corrección, test con hoja de
  respuestas y corrección por cámara, examen en varias unidades, informes de
  la prueba, del grupo y de un alumno.
- **Programación** desde el PDF de PROENS, leída en el aparato, y
  planificación semanal y mensual.
- **Atención a la diversidad**: adaptación curricular y refuerzo por alumno.
- **Competencias clave** por descriptor, con el currículo de 15 comunidades
  empaquetado en la app.
- **Seguimiento**, análisis de un alumno frente a su grupo, tutorías con actas,
  asistencia, plano de clase (AulaMap) y equipos.
- **Informes** en Lámina: boletines, informe individual, acta y competencias.
- **Castellano o galego** (fase 1: menú, Inicio, puesta en marcha e instalar)
  y versión descargable para usar sin instalar.
- Web instalable (PWA) y proyectos nativos de iOS y Android con Capacitor.
