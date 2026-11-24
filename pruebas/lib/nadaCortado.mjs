/**
 * «Nada cortado»: lo que Luis pidió cuidar al definir el aspecto Lámina. Mide,
 * en la página que haya abierta, las cuatro formas en que una interfaz se
 * rompe al cambiar de tamaño:
 *
 *  · desborda: la página entera se puede deslizar de lado;
 *  · sale:     algo asoma fuera de la ventana (y no vive en una tabla que se desliza);
 *  · corta:    el texto de un botón, una pestaña o una sigla no cabe en su caja;
 *  · bajo:     algo que se toca mide menos de 44 px.
 *
 * Es el mismo criterio con el que se comprobaron las maquetas.
 */

/** Tamaños de referencia: escritorio, iPad en horizontal y en vertical, y móvil. */
export const TAMANOS = {
  escritorio: { width: 1440, height: 900 },
  'ipad-horizontal': { width: 1180, height: 820 },
  'ipad-vertical': { width: 820, height: 1180 },
  movil: { width: 390, height: 844 },
}

/**
 * Devuelve `{ desborda, sale, corta, bajo }`, cada uno una lista de textos
 * cortos que dicen qué elemento es.
 */
export function medirCortes(p) {
  return p.evaluate(() => {
    const ancho = document.documentElement.clientWidth
    const quien = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} «${(e.textContent || '').trim().slice(0, 24)}»`
    // Dentro de algo que se desliza de lado a propósito (una tabla ancha) no cuenta como salirse
    const enDeslizable = (e) => {
      for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) {
        const o = getComputedStyle(x).overflowX
        if ((o === 'auto' || o === 'scroll') && x.scrollWidth > x.clientWidth) return true
      }
      return false
    }
    const r = { desborda: [], sale: [], corta: [], bajo: [] }
    if (document.documentElement.scrollWidth > ancho + 1) r.desborda.push(`la página mide ${document.documentElement.scrollWidth} px y la ventana ${ancho}`)
    for (const e of document.querySelectorAll('body *')) {
      const s = getComputedStyle(e)
      if (s.display === 'none' || s.visibility === 'hidden') continue
      const c = e.getBoundingClientRect()
      if (!c.width || !c.height) continue
      const deslizable = enDeslizable(e)
      if (!deslizable && (c.right > ancho + 1 || c.left < -1)) r.sale.push(quien(e))
      const seToca = e.matches('button, a[href], [role="tab"], [role="button"], select, summary, input[type="checkbox"], input[type="radio"]')
      if (seToca && !deslizable && c.height < 43.5) r.bajo.push(`${Math.round(c.height)} px · ${quien(e)}`)
      if (e.matches('button, [role="tab"]') && e.scrollWidth > e.clientWidth + 1 && s.overflow !== 'visible') r.corta.push(quien(e))
    }
    for (const k of Object.keys(r)) r[k] = [...new Set(r[k])]
    return r
  })
}
