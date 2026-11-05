/**
 * Conexión de cada competencia específica con las competencias clave.
 *
 * Puro: sin base de datos ni ficheros, para probarlo solo
 * (pruebas/conexiones.test.mjs). Lo usa seed.js con cada JSON del currículo.
 *
 * Las matrices de iDoceo declaran la conexión en la columna «Enlaces» de la
 * competencia específica (Tipo 2), y parse_curriculum.py la deja tal cual en
 * `objetivos[].descriptores_ids`. Lo que llega no es uniforme:
 *  - descriptores («CCL1, STEM2…»): lo normal;
 *  - solo competencias clave («CCL, CP, CPSAA»): Valencia en Primaria;
 *  - nada: Madrid en Primaria.
 * Por eso cada conexión dice de dónde sale (`origen`):
 *  - 'comunidad'   la declara la comunidad, con descriptores;
 *  - 'competencia' la comunidad solo nombra competencias clave: se sabe qué
 *                  competencia trabaja, pero no qué descriptor;
 *  - 'estatal'     la comunidad no la declara y se toma la del Real Decreto
 *                  para la competencia específica con el mismo texto;
 *  - 'ninguna'     no hay forma de saberlo.
 */

export const COMPETENCIAS_CLAVE = ['CCL', 'CP', 'STEM', 'CD', 'CPSAA', 'CC', 'CE', 'CCEC']

/** Siglas en otras lenguas oficiales que significan lo mismo. */
const ALIAS = { CMCCTE: 'STEM' }

/**
 * Parecido mínimo de texto para aceptar la conexión estatal de una competencia
 * específica: más laxo si además lleva el mismo número (CE3 con CE3), porque
 * las comunidades retocan la redacción pero rara vez renumeran.
 */
export const UMBRAL_MISMO_NUMERO = 0.5
export const UMBRAL_PARECIDO = 0.75

/**
 * Lee un código de la columna «Enlaces».
 * @returns {{tipo:'descriptor'|'competencia', codigo:string}|null}
 */
export function leerCodigo(bruto) {
  const limpio = String(bruto ?? '').toUpperCase().replace(/[\s.·]/g, '')
  const m = /^([A-Z]+)(\d?)$/.exec(limpio)
  if (!m) return null
  const sigla = ALIAS[m[1]] ?? m[1]
  if (!COMPETENCIAS_CLAVE.includes(sigla)) return null
  return m[2] ? { tipo: 'descriptor', codigo: sigla + m[2] } : { tipo: 'competencia', codigo: sigla }
}

/** La competencia clave de un descriptor: CPSAA3 → CPSAA. */
export function competenciaDeDescriptor(id) {
  const m = /^([A-Z]+)\d$/.exec(id)
  return m ? m[1] : null
}

function palabras(t) {
  return new Set(
    String(t ?? '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9ñ]+/)
      .filter(p => p.length > 3)
  )
}

/** Parecido de dos textos: palabras comunes entre las del más corto (0-1). */
export function parecido(a, b) {
  const pa = palabras(a), pb = palabras(b)
  if (!pa.size || !pb.size) return 0
  let comunes = 0
  for (const p of pa) if (pb.has(p)) comunes++
  return comunes / Math.min(pa.size, pb.size)
}

/**
 * Busca la competencia específica estatal con el mismo texto.
 * @param {{id?:string, descripcion:string}} objetivo competencia específica de la comunidad
 * @param {{id:string, descripcion:string, descriptores_ids:string[]}[]} estatales
 */
export function buscarEstatal(objetivo, estatales) {
  let mejor = null, nota = 0
  for (const e of estatales) {
    const p = parecido(objetivo.descripcion, e.descripcion)
    const umbral = e.id === objetivo.id ? UMBRAL_MISMO_NUMERO : UMBRAL_PARECIDO
    if (p >= umbral && p > nota) { nota = p; mejor = e }
  }
  return mejor
}

/**
 * Resuelve la conexión de una competencia específica.
 *
 * @param {{id?:string, descripcion:string, descriptores_ids?:string[]}} objetivo
 * @param {{validos:Set<string>, estatales:{descripcion:string, descriptores_ids:string[]}[]}} ctx
 *   `validos`: los descriptores de la etapa; `estatales`: las competencias
 *   específicas del Real Decreto de la misma etapa.
 * @returns {{descriptores:string[], competencias:string[], origen:string}}
 */
export function conexionDeObjetivo(objetivo, { validos, estatales }) {
  const descriptores = new Set()
  const competencias = new Set()
  for (const bruto of objetivo.descriptores_ids ?? []) {
    const c = leerCodigo(bruto)
    if (!c) continue
    if (c.tipo === 'descriptor') {
      if (validos.has(c.codigo)) descriptores.add(c.codigo)
    } else {
      competencias.add(c.codigo)
    }
  }

  let origen
  if (descriptores.size) {
    origen = 'comunidad'
  } else {
    const estatal = buscarEstatal(objetivo, estatales)
    if (estatal) {
      // Si la comunidad nombró competencias, el Real Decreto solo precisa
      // dentro de ellas: no se añade una competencia que la comunidad no puso.
      for (const d of estatal.descriptores_ids) {
        if (!competencias.size || competencias.has(competenciaDeDescriptor(d))) descriptores.add(d)
      }
    }
    origen = descriptores.size ? 'estatal' : competencias.size ? 'competencia' : 'ninguna'
  }
  for (const d of descriptores) competencias.add(competenciaDeDescriptor(d))

  const orden = (a, b) => COMPETENCIAS_CLAVE.indexOf(competenciaDeDescriptor(a) ?? a) -
    COMPETENCIAS_CLAVE.indexOf(competenciaDeDescriptor(b) ?? b) || a.localeCompare(b)
  return {
    descriptores: [...descriptores].sort(orden),
    competencias: [...competencias].sort(orden),
    origen,
  }
}

/**
 * La competencia específica de un criterio cuando la matriz no la enlaza:
 * CE2.3 → CE2. El currículo LOMLOE numera así en todas las comunidades.
 */
export function objetivoDeCriterio(criterio) {
  if (criterio.objetivo_id) return criterio.objetivo_id
  const m = /^\s*((?:CE|CA)?\s*\d+)\s*[.\-]/i.exec(criterio.id)
  return m ? m[1].replace(/\s/g, '').toUpperCase() : null
}
