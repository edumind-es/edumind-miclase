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
