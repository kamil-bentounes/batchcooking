/**
 * Du groupe CIQUAL au rayon du magasin.
 *
 * CIQUAL classe par nature d'aliment, un magasin par circulation. Les deux ne
 * coïncident pas : le lait est un « produit laitier » chez l'ANSES, il est au
 * frais chez Lidl, et les yaourts aussi mais trois mètres plus loin.
 *
 * Cette table n'est qu'un POINT DE DÉPART. L'ordre réel des rayons s'apprend du
 * geste (D58, trigger `shopping_check`) : dès la deuxième sortie, c'est
 * l'observation qui commande, pas cette liste.
 */

export const RAYONS = [
  'Fruits et légumes',
  'Boucherie, poissonnerie',
  'Frais',
  'Surgelés',
  'Épicerie salée',
  'Épicerie sucrée',
  'Boissons',
  'Entretien',
  'Hygiène',
  'Autre',
] as const

export type Rayon = (typeof RAYONS)[number]

/** Groupe CIQUAL → rayon. Les clés sont celles de la base, en toutes lettres. */
const PAR_GROUPE: Record<string, Rayon> = {
  'fruits, légumes, légumineuses et oléagineux': 'Fruits et légumes',
  'viandes, œufs, poissons et assimilés': 'Boucherie, poissonnerie',
  'produits laitiers et assimilés': 'Frais',
  'glaces et sorbets': 'Surgelés',
  'produits céréaliers': 'Épicerie salée',
  'aides culinaires et ingrédients divers': 'Épicerie salée',
  'matières grasses': 'Épicerie salée',
  'entrées et plats composés': 'Épicerie salée',
  'produits sucrés': 'Épicerie sucrée',
  'eaux et autres boissons': 'Boissons',
  'aliments infantiles': 'Autre',
}

/** Catégorie du catalogue « Compléter ma liste » (D43) → rayon. */
const PAR_CATEGORIE: Record<string, Rayon> = {
  Entretien: 'Entretien',
  'Hygiène': 'Hygiène',
  Papeterie: 'Autre',
  Animaux: 'Autre',
  Cuisine: 'Autre',
  'Épicerie de fond': 'Épicerie salée',
}

/**
 * Quelques aliments trahissent leur groupe : les surgelés en sont le cas type.
 * On ne cherche pas l'exhaustivité, seulement à ne pas envoyer quelqu'un
 * chercher des petits pois surgelés au rayon fruits et légumes.
 */
const INDICES: [RegExp, Rayon][] = [
  [/\bsurgel|congel/i, 'Surgelés'],
  [/\bglace\b|sorbet/i, 'Surgelés'],
  [/\bconserve|\bboîte\b|bocal/i, 'Épicerie salée'],
  [/\bsec(s|he|hes)?\b|\bséché/i, 'Épicerie salée'],
]

export function rayonDe(
  { groupe, categorie, libelle }:
  { groupe?: string | null; categorie?: string | null; libelle?: string | null },
): Rayon {
  if (categorie && PAR_CATEGORIE[categorie]) return PAR_CATEGORIE[categorie]
  if (libelle) for (const [motif, rayon] of INDICES) if (motif.test(libelle)) return rayon
  if (groupe && PAR_GROUPE[groupe]) return PAR_GROUPE[groupe]
  return 'Autre'
}

/** Rang par défaut d'un rayon, tant que le magasin n'a rien appris de vous. */
export function rangParDefaut(rayon: string): number {
  const i = (RAYONS as readonly string[]).indexOf(rayon)
  return i < 0 ? RAYONS.length : i
}
