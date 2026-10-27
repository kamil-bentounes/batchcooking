/**
 * « En plus » : ce qu'on ajoute à un repas, dit sans aucune requête.
 *
 *  · la saisie à la main : « Quoi », « Calories », « Protéines, en g » — les calories ET les protéines sont obligatoires
 *    (une case vide ne vaut pas 0 : le bilan lit ces deux chiffres) ;
 *  · la quantité de nos aliments : « 2 pots » (un aliment qui a une unité) ou « 30 g » (un aliment au gramme), avec ce
 *    que ça pèse en calories et en protéines ;
 *  · l'étiquette photographiée : les valeurs lues pour 100 g, ce qu'on en a mangé, et l'aliment qu'on en garde.
 *
 * Les valeurs écrites dans le repas sont une COPIE (jamais une référence à l'aliment) : corriger l'aliment demain ne
 * réécrit pas le bilan d'hier. Les arrondis sont ceux de `calcul.ts` : les calories à l'unité, les grammes au dixième.
 */
import { brouillonVide, lis, lisLeNombre } from './brouillon.ts'
import type { Brouillon, Erreurs, Valeurs } from './brouillon.ts'
import { ecrit, pourUneUnite } from './calcul.ts'
import type { AlimentLu, Pour100g } from './calcul.ts'

/** Le plus qu'on mange en une fois, en grammes (la borne de l'unité d'un aliment, 0124). */
export const GRAMMES_MAX = 5000

// ── La saisie à la main ─────────────────────────────────────────────────────

export type SaisieAMain = { label: string; kcal: string; prot: string }
export type ErreursDeLaSaisie = Partial<Record<keyof SaisieAMain, string>>

/** Un nombre tapé, ou la phrase de ce qui ne va pas. `max` : au-delà, c'est presque sûrement une faute de frappe. */
function nombreExige(saisie: string, manque: string, max: number, trop: string): { n: number } | { erreur: string } {
  const n = lisLeNombre(saisie)
  if (n === null) return { erreur: manque }
  if (Number.isNaN(n)) return { erreur: 'Je ne lis pas ce nombre.' }
  if (n < 0) return { erreur: 'Pas de valeur négative.' }
  if (n > max) return { erreur: trop }
  return { n }
}

/**
 * Lire la saisie à la main : ce qu'on écrit, ou une phrase par champ refusé. Chaque manque a son message
 * (« Il manque les calories. », « Il manque les protéines. »), un nombre illisible ou négatif est refusé.
 */
export function lisLaSaisieAMain(s: SaisieAMain):
  | { ok: true; valeurs: { label: string; kcal: number; proteinG: number } }
  | { ok: false; erreurs: ErreursDeLaSaisie } {
  const erreurs: ErreursDeLaSaisie = {}
  const label = s.label.replace(/\s+/g, ' ').trim()
  if (label === '') erreurs.label = 'Dis ce que c’est.'
  else if (label.length > 80) erreurs.label = '80 caractères au plus.'
  const k = nombreExige(s.kcal, 'Il manque les calories.', 5000, 'Plus de 5 000 kcal : vérifie ce nombre.')
  if ('erreur' in k) erreurs.kcal = k.erreur
  const p = nombreExige(s.prot, 'Il manque les protéines.', 500, 'Plus de 500 g de protéines : vérifie ce nombre.')
  if ('erreur' in p) erreurs.prot = p.erreur
  if (Object.keys(erreurs).length > 0 || 'erreur' in k || 'erreur' in p) return { ok: false, erreurs }
  return { ok: true, valeurs: { label, kcal: k.n, proteinG: p.n } }
}

/** Le premier champ à qui rendre le focus, dans l'ordre où ils sont à l'écran. */
export const premierChampRefuse = (e: ErreursDeLaSaisie): keyof SaisieAMain | null =>
  (['label', 'kcal', 'prot'] as const).find(c => e[c]) ?? null

// ── Le moment, en mots ──────────────────────────────────────────────────────

/** « Ajouter au soir », « Ajouter à la collation » : le bouton qui écrit. */
export const boutonAjouter = (au: string) => `Ajouter ${au}`

// ── La quantité de nos aliments ─────────────────────────────────────────────

/** L'aliment, réduit à ce que la quantité lit (une ligne de `aliment`, 0124). */
export type AlimentDeLaQuantite = AlimentLu & { id: string }

/** Un aliment « au gramme » n'a pas d'unité qu'on compte : son unité EST le gramme (« g »). */
export const auGramme = (a: Pick<AlimentLu, 'unite'>): boolean => /^(g|gr|gramme|grammes)$/i.test(a.unite.trim())

/** « pot » → « pots » ; un mot qui finit par s, x ou z ne change pas. */
export const pluriel = (unite: string, n: number): string => (n > 1 && !/[sxz]$/i.test(unite.trim()) ? `${unite.trim()}s` : unite.trim())

/** Une quantité : des unités entières, ou des grammes (`null` : pas encore dits). */
export type Quantite = { mode: 'unites'; n: number } | { mode: 'grammes'; g: number | null }

export const UNITES_MAX = 20

const pour100 = (a: AlimentLu): Pour100g => ({
  kcal: Number(a.kcal_100g), protein: Number(a.protein_100g), carb: Number(a.carb_100g), fat: Number(a.fat_100g), fiber: Number(a.fiber_100g),
})

/** Combien ça pèse : `null` tant que les grammes ne sont pas dits. */
export function grammesDe(a: AlimentLu, q: Quantite): number | null {
  if (q.mode === 'grammes') return q.g
  return Math.round(q.n * Number(a.unite_g) * 10) / 10
}

/** Ce que pèse la quantité en calories, protéines… (null : pas de grammes). */
export function valeursDeLaQuantite(a: AlimentLu, q: Quantite) {
  const g = grammesDe(a, q)
  return g === null || !(g > 0) ? null : pourUneUnite(pour100(a), g)
}

/** « 114 kcal · 3 g de protéines » : ce que la quantité ajoute. */
export function phraseDuCalcul(v: { kcal: number; protein: number }): string {
  return `${ecrit(v.kcal)} kcal · ${ecrit(v.protein)} g de protéines`
}
/** « 96 kcal · 14 g prot. » : la même chose, en deux mots. */
export const phraseCourteDuCalcul = (v: { kcal: number; protein: number }): string =>
  `${ecrit(v.kcal)} kcal · ${ecrit(v.protein)} g prot.`

const LIBELLE_MAX = 80

/** La ligne écrite dans le repas : « Yaourt nature × 2 pots », « Céréales, 30 g ». Le nom se coupe pour tenir en 80 caractères. */
export function libelleDeLaQuantite(a: Pick<AlimentLu, 'label' | 'unite' | 'unite_g'>, q: Quantite): string {
  const suite = q.mode === 'unites' ? ` × ${q.n} ${pluriel(a.unite, q.n)}` : `, ${ecrit(q.g ?? 0)} g`
  const nom = a.label.trim()
  return `${nom.length + suite.length > LIBELLE_MAX ? nom.slice(0, LIBELLE_MAX - suite.length).trim() : nom}${suite}`
}

/** Ce qu'on écrit dans le repas pour cette quantité : une COPIE des valeurs, avec l'aliment et les grammes. */
export function extraDeLaQuantite(a: AlimentDeLaQuantite, q: Quantite) {
  const v = valeursDeLaQuantite(a, q)
  const g = grammesDe(a, q)
  if (!v || g === null) throw new Error('La quantité n’est pas dite.')
  return {
    label: libelleDeLaQuantite(a, q), grammes: g, kcal: v.kcal, proteinG: v.protein, carbG: v.carb, fatG: v.fat, fiberG: v.fiber,
    alimentId: a.id,
  }
}

/** La même chose pour la feuille de choix (`choisir_un_repas`, type `repere`). */
export function choixDeLaQuantite(a: AlimentDeLaQuantite, q: Quantite) {
  const e = extraDeLaQuantite(a, q)
  return {
    type: 'repere' as const, label: e.label, grams: e.grammes, kcal: e.kcal, protein_g: e.proteinG, carb_g: e.carbG, fat_g: e.fatG,
    fiber_g: e.fiberG, aliment_id: e.alimentId,
  }
}

/**
 * Les quantités récentes d'un aliment, de la plus récente à la plus ancienne : les deux ou trois dernières DIFFÉRENTES.
 * Ce qui n'est pas un poids (vide, zéro, négatif, au-delà de 5 kg) est ignoré. Sans historique : rien.
 */
export function quantitesRecentes(grammes: (number | string | null)[], max = 3): number[] {
  const vus: number[] = []
  for (const brut of grammes) {
    if (brut === null || brut === '') continue
    const g = Math.round(Number(brut) * 10) / 10
    if (!Number.isFinite(g) || g <= 0 || g > GRAMMES_MAX || vus.includes(g)) continue
    vus.push(g)
    if (vus.length === max) break
  }
  return vus
}

/**
 * Par où le panneau commence. Un aliment à l'unité : un pot — ou, si la dernière fois c'était un nombre entier d'unités
 * (deux yaourts), le même nombre : le geste d'hier se refait en un appui. Un aliment au gramme : la dernière quantité,
 * ou rien (la personne tape).
 */
export function quantiteParDefaut(a: Pick<AlimentLu, 'unite' | 'unite_g'>, recentes: number[]): Quantite {
  if (auGramme(a)) return { mode: 'grammes', g: recentes[0] ?? null }
  const unite = Number(a.unite_g)
  const dernier = recentes[0]
  if (dernier !== undefined && unite > 0) {
    const n = dernier / unite
    if (Math.abs(n - Math.round(n)) < 1e-6 && Math.round(n) >= 1 && Math.round(n) <= UNITES_MAX) return { mode: 'unites', n: Math.round(n) }
  }
  return { mode: 'unites', n: 1 }
}

/** Des grammes tapés : le nombre, ou la phrase de ce qui ne va pas. */
export function lisLesGrammes(saisie: string): { g: number } | { erreur: string } {
  const n = lisLeNombre(saisie)
  if (n === null) return { erreur: 'Dis combien, en grammes.' }
  if (Number.isNaN(n)) return { erreur: 'Je ne lis pas ce nombre.' }
  if (n < 0) return { erreur: 'Pas de valeur négative.' }
  if (n === 0) return { erreur: 'Il faut plus de 0 g.' }
  if (n > GRAMMES_MAX) return { erreur: 'Pas plus de 5 000 g.' }
  return { g: Math.round(n * 10) / 10 }
}

/** Ce que l'aliment dit de lui sur sa pastille : « pot » (à l'unité), « 100 g » (au gramme). */
export const motDeLaPastille = (a: Pick<AlimentLu, 'unite' | 'unite_g'>): string =>
  auGramme(a) ? `${ecrit(Number(a.unite_g))} g` : a.unite.trim()

// ── L'étiquette photographiée ───────────────────────────────────────────────

/** Ce que la feuille de l'étiquette tient : des TEXTES (ce sont des champs), et l'unité lue. */
export type EtiquetteEnPlus = {
  label: string
  kcal: string; proteines: string; glucides: string; lipides: string; fibres: string
  /** Ce que pèse UNE unité (le poids net divisé par les portions) ; vide : l'étiquette ne le dit pas. */
  poidsUnite: string
  /** L'unité lue (« pot ») ; vide : aucune n'est dite. */
  unite: string
  /** Ce qu'on en a mangé, en grammes. */
  grammes: string
}

export const etiquetteVide = (): EtiquetteEnPlus => ({
  label: '', kcal: '', proteines: '', glucides: '', lipides: '', fibres: '', poidsUnite: '', unite: '', grammes: '',
})

/**
 * Les champs d'une lecture → ce que la feuille tient. « J'en ai mangé » commence au poids lu (le pot entier) ; vide quand
 * la lecture n'en donne pas.
 */
export function depuisLaLecture(c: Partial<{
  label: string; kcal: string; proteines: string; glucides: string; lipides: string; fibres: string; poids: string; unite: string
}>): EtiquetteEnPlus {
  return {
    label: c.label ?? '', kcal: c.kcal ?? '', proteines: c.proteines ?? '', glucides: c.glucides ?? '', lipides: c.lipides ?? '',
    fibres: c.fibres ?? '', poidsUnite: c.poids ?? '', unite: c.unite ?? '', grammes: c.poids ?? '',
  }
}

/**
 * L'aliment qu'on garde : les valeurs pour 100 g lues, l'unité et son poids quand l'étiquette ou la consigne les donne
 * (« pot », 150 g) ; sinon un aliment AU GRAMME (« g », pour 100 g) — c'est la quantité qu'on tape à chaque fois.
 */
export function brouillonDeLAliment(e: EtiquetteEnPlus): Brouillon {
  const poids = lisLeNombre(e.poidsUnite)
  const aUnUnite = poids !== null && Number.isFinite(poids) && poids >= 1
  return {
    ...brouillonVide(),
    label: e.label, kcal: e.kcal, proteines: e.proteines, glucides: e.glucides, lipides: e.lipides, fibres: e.fibres,
    unite: aUnUnite ? (e.unite.trim() || 'pot') : 'g',
    poids: aUnUnite ? e.poidsUnite : '100',
    source: 'etiquette',
  }
}

export type ErreursDeLEtiquette = Erreurs & { grammes?: string }

/**
 * Lire la feuille de l'étiquette : l'extra à écrire (et l'aliment à garder), ou une phrase par champ refusé. Les mêmes
 * règles que le formulaire de nos aliments (`lis`) : les calories et les protéines sont exigées, les bornes sont celles
 * de la base. `energieJuste` : la personne a confirmé des calories qui ne cadrent pas avec les macros.
 */
export function lisLEtiquette(e: EtiquetteEnPlus, o: { energieJuste?: boolean } = {}):
  | { ok: true; extra: { label: string; grammes: number; kcal: number; proteinG: number; carbG: number; fatG: number; fiberG: number }; aliment: Valeurs }
  | { ok: false; erreurs: ErreursDeLEtiquette } {
  const r = lis(brouillonDeLAliment(e), { energieJuste: o.energieJuste ?? false })
  const erreurs: ErreursDeLEtiquette = r.ok ? {} : { ...r.erreurs }
  /* L'unité et son poids ne se voient pas ici : ce que la personne ne peut pas corriger ne se refuse pas. */
  delete erreurs.unite; delete erreurs.poids; delete erreurs.codeBarres
  const g = lisLesGrammes(e.grammes)
  if ('erreur' in g) erreurs.grammes = g.erreur
  if (Object.keys(erreurs).length > 0 || !r.ok || 'erreur' in g) return { ok: false, erreurs }
  const v = pourUneUnite({
    kcal: r.valeurs.kcal_100g, protein: r.valeurs.protein_100g, carb: r.valeurs.carb_100g, fat: r.valeurs.fat_100g, fiber: r.valeurs.fiber_100g,
  }, g.g)
  return {
    ok: true, aliment: r.valeurs,
    extra: { label: `${r.valeurs.label}, ${ecrit(g.g)} g`, grammes: g.g, kcal: v.kcal, proteinG: v.protein, carbG: v.carb, fatG: v.fat, fiberG: v.fiber },
  }
}

/** Ce que la feuille montre en direct à côté des grammes : « 96 kcal · 14 g prot. », ou `null` tant que les chiffres manquent. */
export function calculEnDirect(e: EtiquetteEnPlus): { kcal: number; protein: number } | null {
  const [k, p, g] = [lisLeNombre(e.kcal), lisLeNombre(e.proteines), lisLeNombre(e.grammes)]
  const bon = (n: number | null): n is number => n !== null && Number.isFinite(n) && n >= 0
  if (!bon(k) || !bon(p) || !bon(g) || g <= 0 || g > GRAMMES_MAX) return null
  const v = pourUneUnite({ kcal: k, protein: p, carb: 0, fat: 0, fiber: 0 }, g)
  return { kcal: v.kcal, protein: v.protein }
}
