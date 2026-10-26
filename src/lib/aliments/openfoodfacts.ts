/**
 * Open Food Facts : un code-barres → les valeurs pour 100 g d'un produit.
 *
 * `https://world.openfoodfacts.org/api/v2/product/<code>.json` rend `nutriments` pour 100 g et, quand l'emballage
 * l'annonce, `serving_quantity` (le poids d'une portion, en grammes). Aucune clé, aucun compte ; la base est
 * collaborative : une valeur peut être fausse ou manquer, d'où « Vérifie-les avant d'enregistrer » à l'écran.
 *
 * La LECTURE de la réponse (`lisLaReponse`) est pure et éprouvée sur une vraie réponse enregistrée
 * (`fixtures/off-skyr-danone.json`) : aucun test n'appelle le réseau. L'appel (`cherche`) n'est qu'un `fetch`.
 */

/** Un code-barres valide : 8, 12, 13 ou 14 chiffres dont la clé (le dernier chiffre) est juste. */
export function codeBarresValide(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false
  const chiffres = [...code].map(Number)
  const cle = chiffres.pop()!
  /* En partant de la droite, les poids alternent 3, 1, 3, 1… (GS1). */
  const somme = chiffres.reverse().reduce((s, c, i) => s + c * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (somme % 10)) % 10 === cle
}

/** Ce que l'écran reprend d'un produit. `uniteG` est `null` quand l'emballage n'annonce aucune portion. */
export type Produit = {
  label: string
  kcal: number
  protein: number
  carb: number
  fat: number
  fiber: number
  uniteG: number | null
}

export type Lecture =
  | { etat: 'ok'; produit: Produit }
  /** Open Food Facts ne connaît pas ce code. */
  | { etat: 'introuvable' }
  /** Il le connaît, mais sans calories : rien d'utile à remplir. */
  | { etat: 'sans_valeurs'; label: string }
  /** Il le connaît, mais ses chiffres ne tiennent pas (900 kcal pour 100 g au plus, 100 g de macros) : une erreur de saisie chez eux. */
  | { etat: 'incoherent'; label: string }

/** Open Food Facts rend des nombres, parfois des chaînes (« 125 »), parfois rien. */
function nombre(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  if (typeof x === 'string' && x.trim() !== '') {
    const n = Number(x.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

const KJ_PAR_KCAL = 4.184

/** Le nom du produit, avec sa première marque quand le nom ne la dit pas : « Skyr » + « Danone » → « Skyr Danone ». */
function nomDuProduit(p: Record<string, unknown>): string {
  const nom = typeof p.product_name === 'string' ? p.product_name.trim() : ''
  const marque = typeof p.brands === 'string' ? p.brands.split(',')[0].trim() : ''
  const complet = marque && !nom.toLowerCase().includes(marque.toLowerCase()) ? `${nom} ${marque}`.trim() : nom
  return complet.slice(0, 80)
}

/** Lit une réponse d'Open Food Facts (le JSON déjà décodé). Ne lève jamais. */
export function lisLaReponse(reponse: unknown): Lecture {
  const r = (reponse && typeof reponse === 'object' ? reponse : {}) as Record<string, unknown>
  const p = r.product && typeof r.product === 'object' ? r.product as Record<string, unknown> : null
  if (r.status === 0 || !p) return { etat: 'introuvable' }

  const label = nomDuProduit(p)
  const n = (p.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {}) as Record<string, unknown>

  /* Les kcal d'abord ; à défaut les kJ (`energy_100g` est en kJ), convertis. */
  const kj = nombre(n['energy-kj_100g']) ?? nombre(n['energy_100g'])
  const kcal = nombre(n['energy-kcal_100g']) ?? (kj !== null ? Math.round(kj / KJ_PAR_KCAL) : null)
  if (kcal === null) return { etat: 'sans_valeurs', label }

  const protein = nombre(n['proteins_100g']) ?? 0
  const carb = nombre(n['carbohydrates_100g']) ?? 0
  const fat = nombre(n['fat_100g']) ?? 0
  const fiber = nombre(n['fiber_100g']) ?? 0
  const bornes = [kcal, protein, carb, fat, fiber].every(v => v >= 0)
    && kcal <= 900 && [protein, carb, fat, fiber].every(v => v <= 100) && protein + carb + fat <= 105
  if (!bornes) return { etat: 'incoherent', label }

  const portion = nombre(p.serving_quantity)
  return {
    etat: 'ok',
    produit: { label, kcal, protein, carb, fat, fiber, uniteG: portion !== null && portion >= 1 && portion <= 5000 ? portion : null },
  }
}

export const urlDuProduit = (code: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${code}.json`
  + '?fields=product_name,brands,quantity,product_quantity,serving_quantity,serving_size,nutriments'

/** Une panne à dire telle quelle : une phrase française, jamais « Failed to fetch ». */
export class ErreurOpenFoodFacts extends Error {}

/**
 * Cherche un code-barres. `lit` est `fetch` — remplacé dans les tests, qui n'appellent jamais le réseau. Délai de
 * 10 s : un `fetch` suspendu ne doit pas laisser « Je cherche… » à l'écran pour toujours.
 */
export async function cherche(code: string, lit: typeof fetch = fetch): Promise<Lecture> {
  if (!codeBarresValide(code)) throw new ErreurOpenFoodFacts('Ce code ne ressemble pas à un code-barres : un chiffre doit être faux.')
  let res: Response
  try {
    res = await lit(urlDuProduit(code), { signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new ErreurOpenFoodFacts('Open Food Facts ne répond pas. Vérifie ta connexion, ou remplis à la main.')
  }
  /* 404 : « inconnu » aussi. Le reste (429, 5xx) est une panne de leur côté. */
  if (res.status === 404) return { etat: 'introuvable' }
  if (!res.ok) throw new ErreurOpenFoodFacts('Open Food Facts est indisponible pour l’instant. Réessaie dans un moment, ou remplis à la main.')
  try {
    return lisLaReponse(await res.json())
  } catch {
    throw new ErreurOpenFoodFacts('Open Food Facts a répondu quelque chose d’illisible. Remplis à la main.')
  }
}
