/**
 * Los modelos que trae la app de serie: una rúbrica, una lista de control y
 * una escala de estimación listas para copiar a una actividad y adaptar.
 *
 * Viven en el código y no en la tabla `rubricas`, como los modelos de
 * tutoría: sembrarlos en cada aparato los triplicaría al sincronizar. Usar
 * uno es siempre una COPIA (decisión de Luis, nov 2026): retocarla no cambia
 * el modelo ni las otras actividades.
 *
 * Puro: sin base de datos ni pantalla.
 */
import { NIVELES_DEFAULT, type RubricaParsed } from '../ia/rubricaPrompt'

export type ModeloDeSerie = {
  id: string
  nombre: string
  /** Qué forma tiene, para decirlo al lado del nombre. */
  forma: 'rúbrica' | 'lista de control' | 'escala de estimación'
  rubrica: RubricaParsed
}

const [EX, NT, BI, IN] = NIVELES_DEFAULT.map(n => n.nombre)
const fila = (nombre: string, ex: string, nt: string, bi: string, ins: string) =>
  ({ nombre, descriptores: { [EX]: ex, [NT]: nt, [BI]: bi, [IN]: ins } })

const SI_NO = [{ nombre: 'Sí', valor: 1 }, { nombre: 'No', valor: 0 }]
const item = (nombre: string) => ({ nombre, descriptores: { Sí: '', No: '' } })
const aspecto = (nombre: string) => ({ nombre, descriptores: Object.fromEntries(NIVELES_DEFAULT.map(n => [n.nombre, ''])) })

export const MODELOS_DE_SERIE: readonly ModeloDeSerie[] = [
  {
    id: 'exposicion-oral',
    nombre: 'Rúbrica de exposición oral',
    forma: 'rúbrica',
    rubrica: {
      titulo: 'Exposición oral',
      niveles: [...NIVELES_DEFAULT],
      indicadores: [
        fila('Contenido',
          'Explica el tema completo, con ideas propias y ejemplos.',
          'Explica el tema completo y sin errores.',
          'Explica lo principal, con algún hueco o error.',
          'Faltan las ideas principales o hay errores importantes.'),
        fila('Orden y claridad',
          'Presenta, desarrolla y cierra; se sigue sin esfuerzo.',
          'Sigue un orden claro, con algún salto.',
          'Se entiende, pero mezcla o repite ideas.',
          'No se distingue un orden.'),
        fila('Voz y ritmo',
          'Se oye en toda la clase, vocaliza y cambia el tono para destacar.',
          'Se oye y se entiende, con ritmo adecuado.',
          'A ratos habla bajo o demasiado deprisa.',
          'Cuesta oír o entender lo que dice.'),
        fila('Mirada y postura',
          'Mira al grupo y apoya con gestos lo que dice.',
          'Mira al grupo casi siempre.',
          'Lee la mayor parte del tiempo.',
          'Lee todo o da la espalda al grupo.'),
        fila('Apoyo visual y tiempo',
          'El apoyo ayuda a entender y se ajusta al tiempo.',
          'El apoyo es correcto y casi se ajusta al tiempo.',
          'El apoyo aporta poco o el tiempo se desvía bastante.',
          'Sin apoyo, o muy lejos del tiempo previsto.'),
      ],
    },
  },
  {
    id: 'cuaderno',
    nombre: 'Lista de control del cuaderno',
    forma: 'lista de control',
    rubrica: {
      titulo: 'Cuaderno',
      niveles: SI_NO,
      indicadores: [
        item('Pone la fecha y el título de cada sesión'),
        item('Están todas las actividades de la unidad'),
        item('Las actividades están corregidas'),
        item('La letra se lee y respeta los márgenes'),
        item('Está limpio y ordenado'),
        item('Lo trae a clase'),
      ],
    },
  },
  {
    id: 'trabajo-en-equipo',
    nombre: 'Escala de trabajo en equipo',
    forma: 'escala de estimación',
    rubrica: {
      titulo: 'Trabajo en equipo',
      niveles: [...NIVELES_DEFAULT],
      indicadores: [
        aspecto('Participa y aporta ideas'),
        aspecto('Escucha y respeta las opiniones de los demás'),
        aspecto('Cumple con la parte que le toca'),
        aspecto('Ayuda a quien lo necesita'),
        aspecto('Ayuda a resolver los desacuerdos'),
      ],
    },
  },
]
