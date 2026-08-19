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

Última revisión: 19 de agosto de 2026 · versión RTM.

---

## 1. El principio de diseño

**Los datos del alumnado no salen del dispositivo del docente.**

No es una política que prometemos cumplir: es la arquitectura. La aplicación
guarda todo el cuaderno en el almacenamiento del propio navegador o de la app
instalada. El servidor no tiene ninguna tabla donde quepan un nombre, una nota
o una fotografía en claro, ni existe ningún endpoint que los reciba.

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
| Etiquetas y observaciones del docente | Seguimiento individual |
| Calificaciones por criterio, instrumento y trimestre | Evaluación competencial |
| Evidencias: fotografías, audio y vídeo de producciones | Justificar la calificación |
| Asistencia | Control de faltas |
| Fecha de nacimiento *(campo opcional, no se pide en la interfaz)* | — |

**Ninguno de estos datos se transmite a EDUmind en claro, en ninguna
circunstancia.**

### 2.2 Datos del docente — mínimos

En **modo local** (sin iniciar sesión) la aplicación no envía absolutamente
ningún dato personal: funciona entera contra el almacenamiento del dispositivo
y solo descarga el currículo, que es información pública.

Si el docente decide iniciar sesión con su cuenta EDUmind, el servidor guarda:

- un identificador numérico interno,
- el nombre de usuario o correo asociado a la cuenta,
- el identificador de la cuenta en el proveedor de identidad (Authentik).

Se usa para una única cosa: saber de quién es cada buzón de sincronización.

### 2.3 Lo que **no** se recoge

- No hay analítica, telemetría ni estadísticas de uso.
- No hay cookies de seguimiento. No hay cookies en absoluto.
- No hay identificadores publicitarios ni fingerprinting.
- No hay servicios de terceros incrustados (ni fuentes, ni mapas, ni chats).
- No se registra la actividad del docente en el servidor.

La cabecera `Content-Security-Policy` del servidor incluye
`default-src 'self'` y `connect-src 'self'`: **es el propio navegador el que
impide que la aplicación conecte con ningún tercero**, aunque alguien
introdujera código que lo intentase.

---

## 3. Dónde vive cada cosa

### 3.1 En el dispositivo del docente

- **IndexedDB** (base `miclase_db`): el cuaderno completo. Quince tablas con
  clases, alumnado, calificaciones, programación, instrumentos, rúbricas,
  evidencias, asistencia y plano de aula.
- **localStorage**: solo preferencias de interfaz y el rango de identificadores
  del dispositivo. Ningún dato personal.
- **sessionStorage**: el testigo de sesión mientras dura, si se ha iniciado
  sesión. Se borra al cerrar el navegador.

### 3.2 En el servidor

- **Currículo LOMLOE** (10.590 criterios de evaluación y sus saberes): datos
  públicos publicados en los boletines oficiales.
- **Tabla de docentes**: lo descrito en el punto 2.2.
- **Buzón de sincronización**: sobres cifrados, solo si el docente activa la
  sincronización. Ver el punto 4.

---

## 4. La sincronización entre dispositivos

Es **opcional** y está desactivada por defecto. La aplicación completa funciona
sin ella.

### 4.1 Cómo se cifra

- El docente elige una **contraseña de sincronización** que nunca sale del
  dispositivo.
- De ella se deriva una clave con **PBKDF2-SHA256, 210.000 iteraciones**
  (recomendación OWASP), y una sal aleatoria de 128 bits.
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

## 5. La única conexión con un tercero, y es opcional

La aplicación incluye un asistente **opcional** para redactar rúbricas con un
modelo de lenguaje que se ejecuta **dentro del navegador**. Si el docente pulsa
expresamente el botón de cargarlo, se descarga un modelo desde una red de
distribución pública. Conviene ser preciso sobre qué implica:

- Es **descarga**, no envío: no se transmite ningún dato del aula.
- El modelo se ejecuta en el dispositivo; ninguna consulta viaja a un servidor
  de inferencia.
- Ese tercero puede registrar la dirección IP de la descarga, como cualquier
  descarga de un fichero.
- **En la instalación oficial esta descarga está bloqueada** por la política de
  seguridad de contenido del servidor (`connect-src 'self'`).

Existe además la alternativa «copiar el prompt», que no conecta con nada: el
docente pega el texto en la herramienta de IA que ya use, bajo su criterio.

---

## 6. Quién es responsable de qué

- **El docente y su centro** son quienes deciden qué datos introducen y para
  qué: son los responsables del tratamiento en el sentido del RGPD.
- **EDUmind** proporciona la herramienta. En modo local no recibe ningún dato
  personal del alumnado, por lo que no actúa como encargado del tratamiento de
  esos datos.
- Si el docente activa la sincronización, EDUmind aloja sobres cifrados cuyo
  contenido no puede leer ni descifrar. Cada centro debería valorar con su
  delegado de protección de datos cómo encaja ese alojamiento en su registro de
  actividades; la aplicación se puede usar indefinidamente sin activarlo.
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
