# Privacidad y protección de datos — EDUmind MiClase

Este documento describe **qué datos maneja la aplicación, dónde se guardan y
quién puede leerlos**. Está escrito para tres lectores: el docente que la usa,
la persona responsable de protección de datos de un centro que se plantee
adoptarla, y quien vaya a leer o auditar el código.

No es asesoramiento jurídico: es la descripción técnica de cómo funciona el
programa, para que quien tenga que tomar la decisión legal lo haga con datos
ciertos. Todo lo que se afirma aquí es comprobable en el código fuente
(AGPL-3.0-or-later / EUPL-1.2) y buena parte está cubierto por pruebas
automáticas en `pruebas/`.

Última revisión: 8 de noviembre de 2026 (seguimiento de tutorías).

---

## 1. El principio de diseño

**Los datos del alumnado no salen del dispositivo del docente.**

No es una política que prometemos cumplir: es la arquitectura. La aplicación
guarda todo el cuaderno en el almacenamiento del propio navegador o de la app
instalada. El servidor no tiene ninguna tabla donde quepan un nombre, una nota
o una fotografía en claro, ni existe ningún endpoint que los reciba. Ni
siquiera la programación didáctica en PDF sale del dispositivo: se lee en él
(punto 3.3).

Esto tiene una contrapartida que conviene decir en voz alta: **si el docente
pierde el dispositivo y no tiene copia de seguridad ni sincronización activada,
los datos se pierden**. Es el precio de que nadie más los tenga. Por eso la
aplicación insiste con las copias de seguridad.

---

## 2. Qué datos se tratan

### 2.1 Datos del alumnado — solo en el dispositivo

| Dato | Para qué |
|---|---|
| Nombre y apellidos | Identificar a quién se evalúa |
| Código de anonimización (5 caracteres) | Los QR de mesa, para no exponer nombres |
| Indicador de NEAE | Adaptaciones y su reflejo en los informes |
| Medidas de atención a la diversidad (adaptación curricular, refuerzo educativo) por área | Calcular la nota del alumno con sus criterios y porcentajes propios |
| Etiquetas y observaciones del docente | Seguimiento individual |
| Calificaciones por criterio, instrumento y trimestre | Evaluación competencial |
| Evidencias: fotografías, audio y vídeo de producciones | Justificar la calificación |
| Asistencia | Control de faltas |
| Tutorías: fecha, tipo, alumnado, asistentes y su relación (madre, orientadora…), temas tratados, acuerdos y su seguimiento, próxima cita | Registro de las tutorías y sus actas |
| Fecha de nacimiento *(campo opcional, no se pide en la interfaz)* | — |

**Ninguno de estos datos se transmite a EDUmind en claro, en ninguna
circunstancia.**

### 2.2 Datos del docente — mínimos

En **modo local** (sin iniciar sesión) la aplicación no envía ningún dato del
alumnado: funciona entera contra el almacenamiento del dispositivo y solo
descarga el currículo, que es información pública.

Si el docente decide iniciar sesión con su cuenta EDUmind, el servidor guarda:

- un identificador numérico interno,
- el nombre de usuario o correo asociado a la cuenta,
- el identificador de la cuenta en el proveedor de identidad (Authentik).

Se usa para una única cosa: saber de quién es cada buzón de sincronización.

### 2.3 Lo que **no** se recoge

- No hay analítica, telemetría ni estadísticas de uso.
- No hay cookies de seguimiento. No hay cookies en absoluto.
- No hay identificadores publicitarios ni fingerprinting.
- No hay servicios de terceros incrustados en la página (ni fuentes, ni
  mapas, ni chats). Las tipografías van dentro de la propia aplicación.
- La aplicación no registra la actividad del docente. El servidor web guarda
  los registros de acceso habituales (punto 3.4).

La cabecera `Content-Security-Policy` de la instalación oficial es:

```
default-src 'self'; connect-src 'self' https://huggingface.co
https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com; …
```

Es el propio navegador el que impide que la aplicación conecte con cualquier
otro sitio, aunque alguien introdujera código que lo intentase. Los cuatro
orígenes abiertos son los de la descarga del modelo de IA opcional (punto 5),
y solo se usan si el docente pulsa expresamente el botón de descargarlo.

---

## 3. Dónde vive cada cosa

### 3.1 En el dispositivo del docente

- **IndexedDB** (base `miclase_db`): el cuaderno completo. Quince tablas con
  clases, alumnado, calificaciones, programación, instrumentos, rúbricas,
  evidencias, asistencia y plano de aula. El plano dibujado con AulaMap (de
  Juan José de Haro, copiado dentro de la app en `aulamap/`) se guarda en el
  registro del plano del grupo, sin nombres del alumnado: solo sus
  identificadores internos, su equipo y su tipología A·B·C si el docente la
  marca. AulaMap se abre desde la propia app, no carga nada de fuera ni llama
  a ningún servidor (añadido el 08/11/2026).
- **localStorage**: solo preferencias de interfaz (también el idioma y el tema
  de AulaMap) y el rango de identificadores del dispositivo. Ningún dato
  personal.
- **sessionStorage**: el testigo de sesión mientras dura, si se ha iniciado
  sesión. Se borra al cerrar el navegador.

### 3.2 En el servidor

- **Currículo LOMLOE** (10.590 criterios de evaluación y sus saberes): datos
  públicos publicados en los boletines oficiales.
- **Tabla de docentes**: lo descrito en el punto 2.2.
- **Buzón de sincronización**: sobres cifrados, solo si el docente activa la
  sincronización. Ver el punto 4.

### 3.3 La programación en PDF: se lee en el dispositivo

Para importar una programación de PROENS, la aplicación abre el PDF **en el
propio dispositivo** con pdf.js (biblioteca libre de Mozilla, servida por la
propia aplicación) y lee de él unidades, criterios e instrumentos. El PDF no
se envía a ningún sitio.

Queda una reserva por si un PDF no se pudiera leer así: el servidor de
EDUmind (`/api/programacion/texto`) lo pasa por `pdftotext`, devuelve el texto
y **borra el fichero en el mismo momento**, sin guardarlo. **Solo se usa si el
docente lo acepta** en un aviso que dice que el PDF saldrá del dispositivo.
Se admiten PDF de hasta 15 MB y el servidor web limita el número de
peticiones.

Una programación es un documento del centro, no del alumnado, pero puede
llevar el nombre del docente y, si incluye adaptaciones, alguna referencia a
alumnado concreto. Por eso la reserva pregunta antes, y conviene no enviarla
si lleva anexos de adaptaciones o iniciales de alumnos.

### 3.4 Proveedores de la infraestructura

La instalación oficial (miclase.edumind.es) usa dos proveedores:

| Proveedor | Qué hace | Qué ve |
|---|---|---|
| **Hetzner Online GmbH** (centro de datos en la UE) | Aloja el servidor | Todo lo que guarda el servidor (puntos 3.2 y 4.2) |
| **Cloudflare, Inc.** | Red de distribución y protección delante del servidor; termina la conexión TLS | El tráfico en tránsito: direcciones IP, rutas pedidas, cabeceras y cuerpos de las peticiones |

Los sobres de sincronización viajan ya cifrados en el dispositivo (punto 4.1),
así que Cloudflare tampoco puede leer su contenido. Solo si el docente acepta
la reserva del punto 3.3, el PDF de la programación pasaría por Cloudflare tal
cual, como cualquier fichero enviado a una web.

El servidor web guarda los registros de acceso ordinarios para la seguridad
del servicio: dirección IP **anonimizada**, fecha, ruta pedida y navegador. No
llevan datos del alumnado.

Un centro que instale su propio servidor (punto 6) no depende de ninguno de
los dos.

---

## 4. La sincronización entre dispositivos

Es **opcional** y está desactivada por defecto. La aplicación completa funciona
sin ella. Quien aloja el servidor puede además **cerrar el buzón** por completo
(`MICLASE_BUZON=cerrado`): entonces la aplicación no ofrece ni buzón ni cuenta,
y el servidor solo admite vaciar lo que ya hubiera.

### 4.1 Cómo se cifra

- El docente elige una **contraseña de sincronización** que nunca sale del
  dispositivo.
- De ella se deriva una clave con **PBKDF2-SHA256, 210.000 iteraciones**
  (recomendación OWASP), y una sal aleatoria de 128 bits.
- Ojo: esas 210.000 iteraciones son las del **buzón de sincronización**. Las
  copias de seguridad que se exportan a un fichero `.miclase` usan el mismo
  algoritmo con **100.000 iteraciones**. Son dos cifrados distintos y no
  comparten contraseña.
- Cada registro se cifra por separado con **AES-256-GCM**, con vector de
  inicialización propio.
- La clave se guarda como objeto criptográfico **no extraíble**: ni siquiera el
  código de la aplicación puede volver a leerla, solo pedirle que cifre o
  descifre.
- Todo el cifrado ocurre en el dispositivo, con la Web Crypto API del sistema.

### 4.2 Qué ve el servidor

| Dato | ¿Visible? | Por qué |
|---|---|---|
| Contenido del registro | **No** | Cifrado extremo a extremo |
| Contraseña de sincronización | **Nunca se envía** | Solo se usa en el dispositivo |
| Identificador del docente | Sí | Para repartir los sobres a sus dispositivos |
| Nombre de la tabla e id del registro | Sí | Para saber qué sobre sustituye a cuál |
| Fecha de última modificación | Sí | Para resolver conflictos sin descifrar |
| Identificador del dispositivo emisor | Sí | Para no devolverle lo que él mismo envió |
| Número y tamaño de los sobres | Se deduce | Metadato inevitable en cualquier buzón |

El nombre de la tabla revela la *categoría* del dato (que existe un registro en
`calificaciones`, por ejemplo), nunca su contenido. Es el mínimo necesario para
que la sincronización sea incremental en lugar de reenviar todo cada vez.

Hay una prueba automática (`pruebas/sync-dos-dispositivos.test.mjs`) que crea
una clase real, la sincroniza e inspecciona lo almacenado en el servidor
buscando el apellido, el nombre y el nombre de la clase. **La prueba falla si
alguno aparece.**

### 4.3 Consecuencias que conviene conocer

- Si se olvida la contraseña de sincronización, el contenido del buzón es
  **irrecuperable**, también para EDUmind. No existe puerta trasera, y esa es
  precisamente la garantía. Los datos locales de cada dispositivo no se ven
  afectados.
- El docente puede **vaciar el buzón** en cualquier momento desde la propia
  aplicación (Sincronizar → Opciones avanzadas).

---

## 5. La IA opcional, y su única conexión con un tercero

La aplicación incluye un asistente **opcional** para redactar rúbricas y
exámenes con un
modelo de lenguaje que se ejecuta **dentro del navegador**. Si el docente pulsa
expresamente el botón de cargarlo, se descarga un modelo desde una red de
distribución pública. Conviene ser preciso sobre qué implica:

- Es **descarga**, no envío: no se transmite ningún dato del aula.
- El modelo se ejecuta en el dispositivo; ninguna consulta viaja a un servidor
  de inferencia.
- El modelo (Phi-3.5-mini, de Microsoft) se descarga de Hugging Face
  (huggingface.co) y una pieza auxiliar de raw.githubusercontent.com. Esos
  terceros pueden registrar la dirección IP de la descarga, como cualquier
  descarga de un fichero.
- Desde el 24 de agosto de 2026, **la instalación oficial permite esta
  descarga** (punto 2.3). Un centro que no la quiera puede cerrar esos orígenes
  en su propio servidor; la aplicación sigue funcionando y la IA se queda sin
  cargar.
- Lo que se le pide al modelo lleva área, nivel, criterios y el contexto que
  escriba el docente; **nunca datos del alumnado**. La aplicación avisa de que
  no se escriban nombres en el contexto.
- Lo que genera es un **borrador**: el docente lo revisa y lo guarda. La IA no
  califica ni decide nada sobre el alumnado; las notas se calculan con reglas
  fijas de ponderación. Las rúbricas y exámenes generados quedan marcados como
  tales (`generada_ia`), también al exportarlos.

Existe además la alternativa «copiar el prompt», que no conecta con nada: el
docente pega el texto en la herramienta de IA que ya use, bajo su criterio. En
ese caso **nunca debe adjuntar ficheros con alumnado** (listas, hojas de notas
o la plantilla de iDoceo): todo lo que se pega en una IA externa sale del
dispositivo y lo recibe ese tercero.

---

## 6. Quién es responsable de qué

- **El responsable del tratamiento** es quien decide para qué se usan los
  datos, y depende del tipo de centro:
  - En un **centro público**, la normativa autonómica suele atribuir esa
    responsabilidad a la administración educativa (en Galicia, a la
    Consellería, según el anteproyecto de Lei de educación dixital), que es
    también quien autoriza las herramientas digitales con las que se tratan
    datos del alumnado. **El uso en un centro público debe contar con esa
    autorización.**
  - En un **centro privado o concertado**, el responsable es el titular del
    centro.
  - El docente decide qué datos introduce y es quien los custodia en su
    dispositivo, dentro de las instrucciones de su centro.
- **EDUmind** proporciona la herramienta. En modo local no recibe ningún dato
  personal del alumnado, por lo que no actúa como encargado del tratamiento de
  esos datos.
- Si el docente activa la sincronización, EDUmind aloja sobres cifrados cuyo
  contenido no puede leer ni descifrar. Aun cifrados, pueden seguir siendo
  datos personales, así que lo prudente es considerar a EDUmind **encargado
  del tratamiento** de esos sobres, con el contrato del art. 28 del RGPD que
  corresponda. Cada centro debería valorarlo con su delegado de protección de
  datos. La aplicación se puede usar indefinidamente sin activarlo: el enlace
  directo entre dispositivos, el fichero por AirDrop y la copia en una carpeta
  no pasan por el servidor.
- El **indicador de NEAE** y las **evidencias en foto, audio o vídeo** son los
  datos más delicados del cuaderno: el primero puede revelar información de
  salud o discapacidad, y las segundas son imagen y voz de menores. Antes de
  usarlos conviene una evaluación de riesgos con el delegado de protección de
  datos, y ambos son prescindibles: la aplicación funciona sin ellos. Por eso
  **vienen apagados** en un aparato nuevo: no se ofrece marcar NEAE ni
  capturar evidencias hasta que el docente los enciende en Alumnado → «Datos
  sensibles», con un aviso. Un aparato que ya los tenía en uso al actualizar
  los conserva encendidos. Apagarlos no borra nada: dejan de ofrecerse y de
  mostrarse, también en los informes.
- Las **medidas de atención a la diversidad** (adaptación curricular y refuerzo
  educativo, por alumno y área; noviembre de 2026) son dato de NEAE y van tras
  el mismo interruptor: sin él no se ofrecen, no se enseñan ni salen en los
  informes. La nota del alumno se calcula con ellas en todo caso, porque es la
  nota que le corresponde. Los criterios de otro curso que una adaptación pueda
  usar se piden al servidor como dato público del currículo; el nombre del
  alumno nunca va en esa petición.
- Las **tutorías** (8 de noviembre de 2026) guardan lo que se habla con las
  familias, el alumno o el equipo docente: nombres de los asistentes, temas y
  acuerdos. Son datos personales de menores y de terceros (las familias) y
  viven donde todo lo demás: en el dispositivo, en la copia de seguridad y,
  si se sincroniza, cifrados de extremo a extremo. **No van tras el interruptor
  de datos sensibles**: registrar las entrevistas con las familias es tarea
  ordinaria de la tutoría, no un dato de categoría especial por sí mismo, y
  esconderlas por defecto dejaría al tutor sin su registro. A cambio, el
  formulario recuerda que se anote solo lo necesario y que se eviten
  diagnósticos o datos de salud que no hagan falta (minimización, art. 5.1.c
  RGPD); si aun así se anotan, pasan a ser de categoría especial y la
  responsabilidad es la del resto del cuaderno. El acta se imprime o se guarda
  como fichero desde el propio dispositivo y lleva un aviso de que contiene
  datos de menores. Borrar una tutoría la marca como borrada (para que el
  borrado llegue a los demás aparatos) y deja de verse; los modelos de tutoría
  no llevan datos de nadie.
- La **planificación semanal y el calendario** (noviembre de 2026) viven
  también solo en el aparato, como el resto del cuaderno: sesiones previstas
  por clase y eventos. No llevan datos de alumnado. El fichero .md que se
  vuelca se lee en el aparato y no sale de él; para comprobar los códigos de
  criterio se piden al servidor los criterios del área, que son dato público
  del currículo.
- Un centro puede además **instalar su propio servidor**: el código es libre y
  la aplicación permite apuntar a otra dirección sin recompilarla. En ese caso
  EDUmind no interviene en absoluto.

---

## 7. Ejercicio de derechos

Como los datos están en poder del docente, los derechos se ejercen sin
intermediarios y sin plazos de espera:

| Derecho | Cómo |
|---|---|
| Acceso | Informes → Informe individual, o exportación CSV |
| Rectificación | Editar la ficha, la nota o la observación |
| Supresión | Eliminar al alumno, la clase o cada evidencia |
| Portabilidad | Copia de seguridad en JSON y exportación CSV |
| Limitación | Desactivar la sincronización; los datos quedan solo en el dispositivo |

Para borrar todo rastro en el servidor basta con vaciar el buzón de
sincronización, lo que elimina los sobres cifrados de forma inmediata.

---

## 8. Conservación

La aplicación **no borra nada por su cuenta**: los datos permanecen mientras el
docente los conserve. Es su decisión y su responsabilidad aplicar la política de
conservación de su centro al terminar el curso —normalmente, archivar la copia
de seguridad y limpiar el dispositivo.

El borrado dentro de la aplicación es lógico, no físico: un registro eliminado
se marca como borrado y deja de mostrarse en todas partes. Esto es necesario
para que el borrado se propague a los demás dispositivos; sin ello, un registro
eliminado en la tablet reaparecería en el portátil en la siguiente
sincronización. La copia de seguridad y la restauración sí sustituyen la base
por completo.

---

## 9. Medidas técnicas

- Cifrado en tránsito con TLS y certificado válido.
- Cifrado extremo a extremo del buzón de sincronización (punto 4.1).
- Los códigos QR de las mesas llevan **solo el código de anonimización**, nunca
  el nombre: la hoja puede estar a la vista en el aula.
- **Modo anonimizar** para proyectar en clase, que oculta los nombres.
- Aislamiento entre docentes verificado por pruebas automáticas: un docente no
  puede leer ni escribir en el buzón de otro.
- Sin acceso a la cámara ni al micrófono salvo cuando el docente pulsa
  expresamente el botón de capturar una evidencia.
- Código fuente abierto y auditable.

---

## 10. Recomendaciones para el centro

1. **Activar la sincronización o hacer copias de seguridad periódicas.** El
   mayor riesgo real de esta aplicación no es la fuga de datos: es la pérdida.
2. **Proteger el dispositivo** con código de acceso o contraseña. Es donde están
   los datos.
3. **Imprimir los QR sin nombres** (la aplicación lo pregunta y es la opción
   recomendada).
4. **Guardar la contraseña de sincronización** donde el centro guarde las cosas
   importantes: no se puede recuperar.
5. **Al terminar el curso**, archivar la copia de seguridad según la política
   del centro y limpiar los dispositivos que cambien de manos.

---

## Contacto

EDUmind® — Luis Vilela Acuña · <contacto@edumind.es>
Código fuente: <https://github.com/edumind-es/edumind-miclase>

Si detectas un fallo de seguridad, escríbenos antes de publicarlo para que
podamos corregirlo.

## Copia automática en una carpeta

Además del buzón, del enlace directo y del fichero por AirDrop, la app puede
escribir **una copia incremental en una carpeta del propio docente**:

- En el ordenador (Chrome o Edge), una carpeta que el docente elige una vez.
  Si está dentro de iCloud Drive, Dropbox o OneDrive, es ese servicio quien la
  sube; la app no habla con ninguno de ellos.
- En la app instalada (iPad, Android), la carpeta de documentos de la app,
  visible en Archivos y dentro de la copia de seguridad del aparato.

Lo que se escribe son **los mismos sobres cifrados** que viajan por el buzón o
por AirDrop (`PaqueteSync`), con la contraseña de sincronización que nunca sale
del aparato. Un manifiesto sin cifrar (`MiClase.copia.json`) guarda la sal y el
verificador —los mismos que ve el servidor— para que un aparato nuevo pueda
desbloquear con la contraseña. Quien acceda a la carpeta ve tabla, id y fecha de
cada registro, y nada más. Restaurar aplica los paquetes en orden con la misma
fusión de la sincronización: no borra lo que ya haya.

Si la carpeta vive en un servicio de nube, el centro debe tener en cuenta que
los datos cifrados pasan por ese proveedor. Sin la contraseña no son legibles.

## Sincronizar sin servidor

Desde agosto de 2026 dos dispositivos del mismo docente pueden sincronizarse
**directamente entre ellos**, sin que nada quede depositado en ningún sitio.
Se emparejan escaneando un código QR que contiene el saludo de la conexión, y
a partir de ahí los sobres cifrados viajan de un aparato al otro.

En ese modo el servidor de EDUmind **no interviene en nada**: ni guarda, ni
reparte, ni sirve para presentar los dispositivos. Ni siquiera hace falta
iniciar sesión, ni haber usado nunca el buzón: la contraseña de
sincronización se puede crear sin conexión.

Requisito: los dos aparatos tienen que estar en la misma red. No se usa
ningún servidor de relevo, precisamente para no volver a poner a un tercero
por medio.
