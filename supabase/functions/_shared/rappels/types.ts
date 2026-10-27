/**
 * Les rappels par mail : les types, et ce que la base (`rappels_a_envoyer`, migration 0126) rend pour chacun.
 *
 * Ce dossier ne touche à aucune API de Deno : les gabarits, les textes et l'orchestration se testent avec
 * Vitest (`tests/rappels-mails.test.ts`). Seul `rappels/index.ts` parle à Deno, au SMTP et à la base.
 */

export const TYPES_DE_RAPPEL = [
  'sortir_du_congelateur',
  'barquette_perime',
  'choisir_les_repas',
  'noter_les_depenses',
  'confirmer_les_charges',
  'cloturer_le_mois',
  'facture_annuelle',
] as const

export type TypeDeRappel = (typeof TYPES_DE_RAPPEL)[number]

export const estUnType = (t: unknown): t is TypeDeRappel =>
  typeof t === 'string' && (TYPES_DE_RAPPEL as readonly string[]).includes(t)

/** Une ligne de `rappels_a_envoyer`. */
export type RappelDu = {
  user_id: string
  email: string
  prenom: string
  type: string
  cle: string
  cles: string[]
  donnees: Record<string, unknown>
}

/** Ce que le gabarit sait de l'envoi : d'où viennent les liens, quand ça part, et si c'est un exemple. */
export type Contexte = {
  /** `APP_BASE_URL` : jamais un autre domaine dans un lien. */
  base: string
  maintenant: Date
  /** Le prénom du destinataire. */
  prenom: string
  /** Un mail d'exemple (« M'envoyer un exemple ») : il le dit, et rien n'est à faire. */
  exemple?: boolean
}

export type Mail = {
  sujet: string
  /** Le texte qu'une messagerie montre à côté du sujet. */
  preEntete: string
  html: string
  /** Le repli pour qui n'affiche pas le HTML. */
  texte: string
}

// ── Les données de chaque type (ce que `rappels_a_envoyer` met dans `donnees`) ─────────────────────────────

export type Repas = 'petit_dejeuner' | 'dejeuner' | 'collation' | 'diner'

export type PlatASortir = {
  label: string
  recipe_id: string | null
  image_url: string | null
  /** Combien de barquettes à sortir. */
  n: number
  portion_ids: string[]
  /** Combien il en reste au congélateur une fois celles-ci sorties. */
  restant: number
  repas: { meal: Repas; pour: string[] }[]
}
export type DonneesSortir = { jour: string; plats: PlatASortir[] }

/** Un plat dont des barquettes périment (ou ont péri il y a moins de 24 h). */
export type PlatQuiPerime = {
  label: string
  recipe_id: string | null
  image_url: string | null
  n: number
  portion_ids: string[]
  /** L'instant où la première périme (ISO) ; passé, elle est périmée. */
  expire: string
  /** Une entrée par barquette prévue pour un repas APRÈS sa péremption : le jour de ce repas (ISO). */
  tardives: string[]
}
/** UN mail par membre et par jour : tous les plats concernés. */
export type DonneesPerime = { n: number; plats: PlatQuiPerime[] }

export type PointDuJour = 'frigo' | 'congelateur' | 'autre' | 'vide'
export type DonneesChoisir = {
  semaine: string
  vides: number
  jours: { jour: string; midi: PointDuJour; soir: PointDuJour }[]
  congelateur: number
  frigo: number
}

export type DonneesNoter = { mois: string; semaine: string; depuis_jours: number | null; lignes: number }

export type DonneesConfirmer = {
  mois: string
  n: number
  lignes: { libelle: string; montant_cents: number }[]
}

/** `absent` : le prénom de l'autre membre qui n'a pas posé son revenu du mois (la clôture serait refusée). */
export type DonneesCloturer = { mois: string; lignes: number; a_confirmer: number; absent?: string | null }

export type ChargeAnnuelle = {
  charge_id: string
  libelle: string
  annee: number
  mois: string
  derniere_paye_le: string
  derniere_montant_cents: number
}
/** UN mail par membre et par jour : toutes les charges annuelles qui approchent. */
export type DonneesFacture = { n: number; charges: ChargeAnnuelle[] }
