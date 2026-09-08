/**
 * Plantillas de rúbrica.
 *
 * Hasta ahora, crear una rúbrica te dejaba delante de una tabla con
 * «Indicador 1», «Indicador 2» y ocho celdas en blanco. El docente tenía que
 * inventarse de cero la estructura y los cuatro descriptores de cada fila, que
 * es justo la parte lenta. Estas plantillas son puntos de partida completos y
 * editables: se cargan rellenas y se retocan.
 *
 * Son deliberadamente genéricas —sirven en cualquier área— y están redactadas
 * en términos observables, como pide la evaluación competencial LOMLOE.
 */
import { NIVELES_DEFAULT, type RubricaParsed } from './rubricaPrompt'

type Fila = [indicador: string, excelente: string, notable: string, bien: string, insuficiente: string]

export interface PlantillaRubrica {
  id: string
  nombre: string
  descripcion: string
  icono: string
  filas: Fila[]
}

export const PLANTILLAS_RUBRICA: PlantillaRubrica[] = [
  {
    id: 'cuaderno',
    nombre: 'Cuaderno o portfolio',
    descripcion: 'Registro del trabajo diario: contenido, orden y revisión.',
    icono: '📓',
    filas: [
      ['Registro del trabajo',
       'Recoge todas las tareas, completas y con la fecha.',
       'Recoge casi todas las tareas, alguna incompleta.',
       'Faltan varias tareas o están a medias.',
       'Apenas hay registro del trabajo hecho.'],
      ['Organización y presentación',
       'Ordenado y limpio; se localiza cualquier cosa al momento.',
       'Ordenado en general, con algún descuido.',
       'Cuesta encontrar las cosas; presentación irregular.',
       'Desordenado: no permite seguir el trabajo.'],
      ['Corrección lingüística',
       'Redacta con claridad y sin apenas errores.',
       'Se entiende bien, con algunos errores.',
       'Errores frecuentes que dificultan la lectura.',
       'La redacción impide entender lo escrito.'],
      ['Revisión y mejora',
       'Corrige lo señalado y añade mejoras por iniciativa propia.',
       'Corrige lo que se le señala.',
       'Corrige solo una parte de lo señalado.',
       'No revisa ni corrige.'],
    ],
  },
  {
    id: 'oral',
    nombre: 'Exposición oral',
    descripcion: 'Presentaciones ante el grupo: discurso, contenido y apoyo.',
    icono: '🗣️',
    filas: [
      ['Claridad del discurso',
       'Habla con buen ritmo y volumen; se sigue sin esfuerzo.',
       'Se entiende bien, con algún titubeo.',
       'Ritmo o volumen irregulares; cuesta seguirle.',
       'No se le entiende o lee de corrido.'],
      ['Dominio del contenido',
       'Explica con sus palabras y responde a las preguntas.',
       'Explica lo esencial y responde a casi todo.',
       'Se apoya demasiado en el texto; responde con dificultad.',
       'Repite sin comprender lo que dice.'],
      ['Organización de las ideas',
       'Introducción, desarrollo y cierre bien enlazados.',
       'Estructura reconocible, con algún salto.',
       'Ideas sueltas, sin hilo claro.',
       'Sin estructura: no se distingue un orden.'],
      ['Recursos de apoyo',
       'El apoyo visual añade información y lo usa con soltura.',
       'Usa apoyo adecuado, sin sacarle todo el partido.',
       'El apoyo repite lo que dice o distrae.',
       'No usa apoyo o lo usa de forma que estorba.'],
    ],
  },
  {
    id: 'equipo',
    nombre: 'Trabajo en equipo',
    descripcion: 'Cómo participa cada alumno dentro del grupo.',
    icono: '🤝',
    filas: [
      ['Aportación al grupo',
       'Aporta ideas y hace avanzar el trabajo de los demás.',
       'Aporta cuando se le pide y cumple su parte.',
       'Participa poco; hay que reclamarle.',
       'No aporta al trabajo común.'],
      ['Escucha y respeto',
       'Escucha, pregunta y respeta los turnos siempre.',
       'Escucha y respeta, con algún despiste.',
       'Interrumpe o desatiende con frecuencia.',
       'No escucha ni respeta los turnos.'],
      ['Cumplimiento de tareas',
       'Entrega su parte a tiempo y con calidad.',
       'Entrega su parte a tiempo.',
       'Entrega tarde o incompleta.',
       'No entrega su parte.'],
      ['Resolución de desacuerdos',
       'Busca acuerdos y propone soluciones al grupo.',
       'Acepta los acuerdos del grupo.',
       'Le cuesta ceder; necesita mediación.',
       'Bloquea el trabajo ante el desacuerdo.'],
    ],
  },
  {
    id: 'practica',
    nombre: 'Producción práctica o motriz',
    descripcion: 'Tareas de ejecución: técnica, adaptación, seguridad y esfuerzo.',
    icono: '🤸',
    filas: [
      ['Ejecución',
       'Resuelve la tarea con precisión y control.',
       'Resuelve la tarea con algún fallo puntual.',
       'Resuelve con dificultad; fallos frecuentes.',
       'No consigue resolver la tarea.'],
      ['Adaptación a la situación',
       'Ajusta su respuesta a lo que pide cada momento.',
       'Se adapta a las situaciones habituales.',
       'Repite siempre la misma respuesta.',
       'No ajusta su respuesta a la situación.'],
      ['Seguridad y cuidado del material',
       'Respeta las normas y cuida el material sin que se le recuerde.',
       'Respeta las normas y el material.',
       'Necesita que se le recuerden las normas.',
       'Pone en riesgo la actividad o el material.'],
      ['Autonomía y esfuerzo',
       'Trabaja solo, insiste y busca mejorar.',
       'Trabaja con constancia.',
       'Necesita que se le anime a menudo.',
       'Abandona ante la dificultad.'],
    ],
  },
]

/** Convierte una plantilla en una rúbrica editable con el título que se le dé. */
export function rubricaDesdePlantilla(plantilla: PlantillaRubrica, titulo: string): RubricaParsed {
  return {
    titulo,
    niveles: [...NIVELES_DEFAULT],
    indicadores: plantilla.filas.map(([nombre, ...descripciones]) => ({
      nombre,
      descriptores: Object.fromEntries(
        NIVELES_DEFAULT.map((n, i) => [n.nombre, descripciones[i]])
      ),
    })),
  }
}
