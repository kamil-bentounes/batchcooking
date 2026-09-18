/**
 * Ce qu'il reste à peser, et dans quel ordre (lot 0c, §5.2.1).
 *
 * « 2 oignons » ne se convertit pas en grammes tout seul. Une table de
 * référence donne un ordre de grandeur — 110 g l'oignon, d'après l'USDA — mais
 * un oignon d'ici n'est pas un oignon médian américain, et c'est précisément
 * l'écart qui fait mentir une promesse de macros.
 *
 * D'où la boucle : on pèse ce qu'on a en main, le foyer apprend SES poids, et
 * la friction DÉCROÎT — on ne pèse un aliment que jusqu'à le connaître, trois
 * fois, puis plus jamais.
 *
 * Ce fichier ne décide que d'une chose : **par quoi commencer**. Trente lignes
 * à peser, personne ne les fait ; les trois qui reviennent dans quatre
 * recettes, si.
 */

export type LigneAPeser = {
  food_id: string
  /** Le nom de l'aliment, tel que le référentiel l'écrit. */
  nom: string
  /** Le texte de la recette : « 2 oignons jaunes ». */
  raw_text: string
  recipe_id: string
  qty: number
}

export type Connu = {
  food_id: string
  /** Le poids appris, s'il l'est. */
  grams: number
  observations: number
  seuil: number
  actif: boolean
}

export type APeser = {
  food_id: string
  nom: string
  /** Dans combien de recettes du cycle cet aliment apparaît au compte. */
  recettes: number
  /** Un exemple tiré des recettes, pour reconnaître de quoi on parle. */
  exemple: string
  /** Les pesées déjà faites, et ce qu'il en faut. `null` = aucune. */
  progres: { faites: number; seuil: number } | null
  /** Le poids de référence, en attendant. `null` quand on ne sait rien. */
  reference: number | null
}

/**
 * Regroupe les lignes à peser par aliment, les plus utiles d'abord.
 *
 * L'ordre est le sujet : peser d'abord ce qui sert le plus fait baisser le
 * nombre de recettes sans macros au rythme le plus rapide possible. À égalité,
 * on préfère ce qui est DÉJÀ commencé — finir une série de deux coûte une
 * pesée, en commencer une autre en coûte trois.
 */
export function regroupe(
  lignes: LigneAPeser[],
  connus: Connu[],
  references: Map<string, number>,
): APeser[] {
  const parAliment = new Map<string, { nom: string; recettes: Set<string>; exemple: string }>()
  for (const l of lignes) {
    const e = parAliment.get(l.food_id)
      ?? { nom: l.nom, recettes: new Set<string>(), exemple: l.raw_text }
    e.recettes.add(l.recipe_id)
    // Le texte le plus court est le plus lisible : « 2 oignons » plutôt que
    // « 2 oignons jaunes émincés finement ».
    if (l.raw_text.length < e.exemple.length) e.exemple = l.raw_text
    parAliment.set(l.food_id, e)
  }

  const parId = new Map(connus.map(c => [c.food_id, c]))
  const sortie: APeser[] = []
  for (const [food_id, e] of parAliment) {
    const c = parId.get(food_id)
    // Ce que le foyer sait déjà ne se repèse pas : c'est toute la promesse
    // d'une friction décroissante.
    if (c?.actif) continue
    sortie.push({
      food_id,
      nom: e.nom,
      recettes: e.recettes.size,
      exemple: e.exemple,
      progres: c ? { faites: c.observations, seuil: c.seuil } : null,
      reference: references.get(food_id) ?? null,
    })
  }

  return sortie.sort((a, b) =>
    b.recettes - a.recettes
    || (b.progres?.faites ?? 0) - (a.progres?.faites ?? 0)
    || a.nom.localeCompare(b.nom, 'fr'))
}

/**
 * Le nom d'un aliment, tel qu'on peut le montrer à quelqu'un.
 *
 * CIQUAL écrit « Courgette, pulpe et peau, crue » — c'est un nom de catalogue,
 * précis et fait pour être indexé, pas pour être lu dans une cuisine. On garde
 * la tête du nom, qui est la seule partie que quelqu'un reconnaît.
 */
export function nomCourt(nom: string): string {
  const tete = nom.split(',')[0].trim()
  return tete.length > 0 ? tete : nom
}

/** Les bornes d'acceptation d'une observation (§5.2.1, règle 2). */
export const BORNE_BASSE = 0.4
export const BORNE_HAUTE = 2.5

/**
 * Cette pesée sera-t-elle retenue, ou rejetée comme aberrante ?
 *
 * Le calcul est refait en base — c'est là qu'il fait autorité. On le refait
 * ici pour une seule raison : **le dire avant d'enregistrer**. « 1,2 kg pour un
 * oignon » est une faute de frappe, et l'annoncer au moment du geste vaut mieux
 * que de la laisser disparaître en silence dans un filtre.
 */
export function seraRetenue(
  grammes: number, quantite: number, reference: number | null,
): boolean {
  if (reference === null) return true      // sans référence, on ne filtre pas
  if (quantite <= 0) return false
  const unitaire = grammes / quantite
  return unitaire >= reference * BORNE_BASSE && unitaire <= reference * BORNE_HAUTE
}
