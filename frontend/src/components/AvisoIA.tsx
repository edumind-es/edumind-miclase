/**
 * Avisos comunes de los bloques de IA (rúbricas, exámenes y planificación).
 *
 * Lo que se escribe en el contexto viaja en el prompt: a la IA local no sale
 * del equipo, pero «Copiar prompt» lo lleva a una IA externa. Por eso el
 * aviso va pegado al campo, no en una ayuda aparte (AI Act, art. 4, y la
 * regla de que a la IA nunca van datos del alumnado).
 */
export function AvisoContextoIA() {
  return (
    <div data-aviso-contexto-ia
      style={{ marginTop: 4, fontSize: 11, color: '#92400e' }}>
      🔒 No escribas nombres ni datos del alumnado: este texto va en el prompt,
      y si lo copias a una IA externa sale de este equipo.
    </div>
  )
}

/**
 * Lo que genera la IA es un borrador. La marca `generada_ia` se guarda y se
 * exporta (AI Act, art. 50.2); aquí se dice a la vista mientras se edita.
 */
export function AvisoBorradorIA({ que }: { que: 'rúbrica' | 'examen' | 'planificación' }) {
  return (
    <div data-borrador-ia
      style={{ padding: '8px 12px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 12, color: '#5b21b6' }}>
      🤖 <strong>Borrador generado con IA.</strong> Revisa {que === 'rúbrica' ? 'la rúbrica' : que === 'examen' ? 'el examen' : 'la planificación'} antes
      de usarlo: la IA puede equivocarse. Quedará marcado como generado con IA, también al exportarlo.
    </div>
  )
}
