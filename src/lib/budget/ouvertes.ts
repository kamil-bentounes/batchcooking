/**
 * Les catégories du mois que l'appareil a ouvertes ou repliées (§ 3.1, point 10).
 *
 * Par appareil (`localStorage`), pas en base : c'est un confort, pas une donnée du foyer.
 * Le stockage peut être bloqué (navigation privée) ou contenir n'importe quoi : sans
 * ces gardes, l'écran du mois lèverait au rendu. Il ne retient alors rien, et marche.
 */
export const CLE_LOCALE = 'popote.budget.ouvertes'

/** Ce qui a été retenu, catégorie par catégorie. Une valeur absente : « pas choisi ». */
export function lisOuvertes(): Record<string, boolean> {
  try {
    const brut: unknown = JSON.parse(localStorage.getItem(CLE_LOCALE) ?? '{}')
    if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return {}
    /* Seuls les booléens : une valeur étrangère ne doit ni ouvrir ni fermer une catégorie. */
    return Object.fromEntries(Object.entries(brut).filter(([, v]) => typeof v === 'boolean'))
  } catch { return {} }
}

/** Le geste du bouton de la catégorie : l'état d'après, déjà retenu. Sans la retenue, un
    rechargement rouvrait ce qu'on venait de replier. */
export function bascule(cle: string, ouverte: boolean): boolean {
  retiens(cle, !ouverte)
  return !ouverte
}

export function retiens(cle: string, ouverte: boolean) {
  try { localStorage.setItem(CLE_LOCALE, JSON.stringify({ ...lisOuvertes(), [cle]: ouverte })) }
  catch { /* rien : l'état ne se retient pas, l'écran marche */ }
}
