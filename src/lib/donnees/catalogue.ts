/**
 * Chercher une recette (lot 4, §10.0 et §10.1) — refait pour la liste B (R1).
 *
 * L'ordre du parcours est une exigence, pas une préférence : **le gratuit
 * d'abord, toujours**. On filtre le catalogue — déterministe, instantané — et
 * l'IA n'intervient que sur un bouton explicite, à côté des résultats.
 *
 * Le catalogue entier tient désormais dans le navigateur : quelque 1 390 recettes
 * en LÉGER (titre, photo, temps, macros). Filtrer et trier ne coûtent plus de
 * requête, et la liste n'est plus tronquée aux quatre-vingts premières : « Avec ce
 * que j'ai » et « Jamais essayée » cherchent enfin dans tout le catalogue. Ce qui
 * pèse — les ingrédients, les étapes — ne se charge que pour ce qui est affiché.
 *
 * Deux règles portent tout le reste :
 *
 *  · **Le temps ACTIF, pas le temps total.** Dix minutes de gestes et quarante
 *    de four ne font pas cinquante minutes de travail (D19, D30).
 *  · **La borne DÉFAVORABLE, jamais la moyenne** (D18). « Au moins 30 g de
 *    protéines » se lit sur la borne basse, « au plus 600 kcal » sur la borne
 *    haute.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import { plie } from '../recettes/texte.ts'
import { actifConnu } from '../recettes/temps.ts'

export type Filtres = {
  texte: string
  /** Minutes actives au plus. `null` = peu importe. */
  tempsActifMax: number | null
  /** Grammes de protéines au moins, sur la borne BASSE. */
  proteinesMin: number | null
  /** Kilocalories au plus, sur la borne HAUTE. */
  kcalMax: number | null
  /** Recettes réalisables avec ces appareils seulement. Vide = peu importe. */
  appareils: string[]
  /** `true` = seulement ce qui se congèle. `null` = peu importe. */
  congelable: boolean | null
  /**
   * D28 : une BASCULE, pas un filtre imposé. En mode « tout », chaque recette
   * affiche ses manques ; en mode « ce que j'ai », on ne montre que le faisable.
   */
  avecCeQuOnA: boolean
  /** Écarte les recettes déjà cuisinées par le foyer. */
  jamaisFaites: boolean
}

export const FILTRES_VIDES: Filtres = {
  texte: '',
  tempsActifMax: null,
  proteinesMin: null,
  kcalMax: null,
  appareils: [],
  congelable: null,
  avecCeQuOnA: false,
  jamaisFaites: false,
}

/** Une recette du catalogue, en léger : ce qu'il faut à la liste et aux filtres. */
export type Candidate = {
  id: string
  title: string | null
  /** La photo du site, en lien (R3). */
  image_url: string | null
  yield_servings: number | null
  total_time_min: number | null
  active_time_min: number | null
  appliances: string[]
  freezable: boolean | null
  /** Le foyer propriétaire. `null` = le catalogue mutualisé. */
  owner_household_id: string | null
  /** Le prénom de qui l'a ajoutée, quand elle vient d'un foyer. */
  ajoutePar: string | null
  /** `true` quand elle vient d'un foyer AMI, pas du nôtre. */
  dUnAmi: boolean
  nutrition: {
    kcal: number
    protein_g: number
    kcal_margin: number
    protein_g_margin: number
    fiber_g: number
    coverage: number
  } | null
}

/** Les huit appareils de l'écran : ceux qu'on coche et qu'on dessine (R4). */
export const CODES_APPAREILS = ['four', 'plaques', 'air_fryer', 'micro_ondes',
  'autocuiseur', 'blender', 'batteur', 'robot_cuiseur'] as const

/** Les bornes affichables d'une recette. Jamais la moyenne (D18). */
export function bornes(c: Candidate) {
  if (!c.nutrition) return null
  return {
    proteinesMin: Math.round(c.nutrition.protein_g - c.nutrition.protein_g_margin),
    proteinesMax: Math.round(c.nutrition.protein_g + c.nutrition.protein_g_margin),
    kcalMin: Math.round(c.nutrition.kcal - c.nutrition.kcal_margin),
    kcalMax: Math.round(c.nutrition.kcal + c.nutrition.kcal_margin),
    sur: c.nutrition.coverage,
  }
}

/** Ce que les filtres consultent hors de la recette elle-même. */
export type Contexte = {
  /** Les recettes que le foyer a déjà cuisinées. */
  dejaFaites: Set<string>
  /** Les recettes faisables avec le placard ; `null` tant qu'on ne sait pas. */
  faisables: Set<string> | null
}

/**
 * Le candidat passe-t-il les filtres ?
 *
 * Extrait pour être éprouvé : c'est ici que vit la règle de la BORNE
 * DÉFAVORABLE, et une inversion de signe y passerait inaperçue — l'écran
 * afficherait simplement quelques recettes de trop. Les bornes se comparent
 * avant tout arrondi : seul l'affichage arrondit.
 */
export function retient(c: Candidate, f: Filtres, ctx: Contexte): boolean {
  /* Chaque MOT doit se trouver dans le titre, dans n'importe quel ordre : la phrase entière,
     cherchée d'un bloc, ne trouvait rien dès qu'un mot s'intercalait (« tarte poireaux »
     contre « Tarte aux poireaux »). */
  const mots = plie(f.texte).split(/\s+/).filter(Boolean)
  const titre = plie(c.title ?? '')
  if (!mots.every(m => titre.includes(m))) return false

  // Un temps inconnu ne tient aucune promesse de temps (R6).
  if (f.tempsActifMax !== null
      && !(actifConnu(c.active_time_min) && Number(c.active_time_min) <= f.tempsActifMax)) {
    return false
  }
  // « On ne sait pas » n'est pas « oui » : seul `true` se congèle (D27).
  if (f.congelable === true && c.freezable !== true) return false
  // Un appareil non coché ne doit apparaître dans AUCUNE étape. Un code que
  // l'écran ne dessine pas ne compte pas : la base ne le comptait pas non plus.
  if (f.appareils.length > 0 && c.appliances.some(a =>
    (CODES_APPAREILS as readonly string[]).includes(a) && !f.appareils.includes(a))) {
    return false
  }
  if (f.jamaisFaites && ctx.dejaFaites.has(c.id)) return false
  if (f.avecCeQuOnA && !(ctx.faisables?.has(c.id) ?? false)) return false

  // Une recette sans macros connues n'est pas écartée par défaut : elle ne
  // l'est que si l'on filtre justement sur ce qu'on ignore.
  if (f.proteinesMin === null && f.kcalMax === null) return true
  const n = c.nutrition
  if (!n) return false
  // On compare les valeurs EXACTES : `bornes()` arrondit pour l'écran, et 29,6 g
  // affichés « 30 » ne tiennent pas une promesse de 30 g. La tolérance ne couvre
  // que le flottant (16,4 − 0,4 = 15,999999999999998), pas une vraie différence.
  // Protéines : la borne BASSE doit atteindre le seuil.
  if (f.proteinesMin !== null
      && n.protein_g - n.protein_g_margin < f.proteinesMin - TOLERANCE) return false
  // Calories : la borne HAUTE doit rester sous le plafond.
  if (f.kcalMax !== null && n.kcal + n.kcal_margin > f.kcalMax + TOLERANCE) return false
  return true
}

/** Le bruit d'une soustraction ou d'une addition en flottant, très en deçà du dixième. */
const TOLERANCE = 1e-9

const ORDRE_DES_TITRES = new Intl.Collator('fr')

/**
 * Le temps actif croissant, l'inconnu à la fin, puis le titre, puis l'id.
 *
 * Un ordre TOTAL : sans lui, deux chargements pourraient ranger différemment
 * deux recettes à 12 minutes, et une recette changerait de page sous les yeux.
 */
export function trie(liste: Candidate[]): Candidate[] {
  return [...liste].sort((a, b) => {
    const ka = actifConnu(a.active_time_min)
    const kb = actifConnu(b.active_time_min)
    if (ka !== kb) return ka ? -1 : 1
    if (ka && Number(a.active_time_min) !== Number(b.active_time_min)) {
      return Number(a.active_time_min) - Number(b.active_time_min)
    }
    return ORDRE_DES_TITRES.compare(a.title ?? '', b.title ?? '') || a.id.localeCompare(b.id)
  })
}

/** Combien de filtres sont posés. Sert à la pastille du bouton des filtres. */
export function nombreDeFiltres(f: Filtres): number {
  return [f.tempsActifMax, f.proteinesMin, f.kcalMax, f.congelable].filter(x => x !== null).length
    + (f.appareils.length > 0 ? 1 : 0)
    + (f.avecCeQuOnA ? 1 : 0)
    + (f.jamaisFaites ? 1 : 0)
}

/** Les parts qu'« Ajouter » pose : ce qui manque, borné par le rendement, 2 à défaut. */
export function partsAProposer(cible: number, prises: number, rendement: number | null): number {
  return Math.max(1, Math.min(cible - prises || 2, rendement ?? 2))
}

/**
 * Les ingrédients reconnus qui ne sont pas au placard, recette par recette.
 * Une ligne non rattachée ne manque pas : on ne sait pas, on se tait.
 */
export function manquesDe(
  lignes: { recipe_id: string; food_id: string | null; raw_text: string }[],
  placard: Set<string>,
): Map<string, string[]> {
  const parRecette = new Map<string, string[]>()
  for (const l of lignes) {
    if (!l.food_id || placard.has(l.food_id)) continue
    const deja = parRecette.get(l.recipe_id) ?? []
    deja.push(l.raw_text)
    parRecette.set(l.recipe_id, deja)
  }
  return parRecette
}

type LigneBrute = Omit<Candidate, 'nutrition' | 'ajoutePar' | 'dUnAmi'> & {
  created_by: string | null
  recipe_nutrition: Candidate['nutrition'] | Candidate['nutrition'][] | null
}

/** PostgREST plafonne une réponse à mille lignes, sans le dire. Une RPC aussi. */
const PAGE_DE_LA_BASE = 1000

/**
 * Lit par tranches de mille, PAR CLÉ : chaque tranche reprend après le dernier
 * `id` vu (`order by id`, puis `id > dernier`), jusqu'à une tranche courte.
 *
 * Pas par décalage (`.range`) : une recette ajoutée entre deux tranches décalait
 * tout d'un cran et la dernière ligne de la première revenait en tête de la
 * seconde — 1 501 lignes pour 1 500 recettes, une clé React en double ; une
 * recette supprimée en faisait sauter une. La clé ne bouge pas quand la table
 * bouge.
 *
 * Une tranche qui échoue lève : jamais un catalogue tronqué rendu comme entier.
 */
async function parClef<T extends { id: string }>(
  lit: (apresId: string | null) => Promise<T[]>,
): Promise<T[]> {
  const tout: T[] = []
  let apresId: string | null = null
  for (;;) {
    const tranche: T[] = await lit(apresId)
    tout.push(...tranche)
    if (tranche.length < PAGE_DE_LA_BASE) return tout
    const dernier: string = tranche[tranche.length - 1].id
    // Une base qui ignorerait le filtre rendrait la même tranche à l'infini.
    if (dernier === apresId) throw new Error('La lecture du catalogue ne progresse pas.')
    apresId = dernier
  }
}

/**
 * Le décalage, pour ce qui n'a pas de clé à filtrer : le résultat d'une RPC
 * (`setof uuid`) n'accepte pas `.gt`. L'appelant dédoublonne — une insertion
 * entre deux tranches fait revenir une ligne.
 */
async function parTranches<T>(lit: (de: number, a: number) => Promise<T[]>): Promise<T[]> {
  const tout: T[] = []
  for (let de = 0; ; de += PAGE_DE_LA_BASE) {
    const tranche = await lit(de, de + PAGE_DE_LA_BASE - 1)
    tout.push(...tranche)
    if (tranche.length < PAGE_DE_LA_BASE) return tout
  }
}

const COLONNES = `id, title, image_url, yield_servings, total_time_min, active_time_min,
  appliances, freezable, owner_household_id, created_by,
  recipe_nutrition(kcal, protein_g, kcal_margin, protein_g_margin, fiber_g, coverage)`

/** Tout le catalogue planifiable, en léger, trié (R1). */
export function useCatalogue() {
  return useQuery({
    queryKey: ['catalogue-leger'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Candidate[]> => {
      const lignes = await parClef(async apresId => {
        const q = supabase.from('recipe').select(COLONNES)
          .not('title', 'is', null)
          .eq('plannable', true)
        return ou(await (apresId ? q.gt('id', apresId) : q)
          .order('id').limit(PAGE_DE_LA_BASE)) as unknown as LigneBrute[]
      })

      /*
       * La provenance, quand la recette vient d'un foyer.
       *
       * `user_profile` est cadrée sur le foyer — on n'a pas à lire la liste des
       * membres d'un ami. Mais si l'on voit sa recette, on doit pouvoir en voir
       * l'origine : `prenoms_visibles` ne rend que le prénom, et seulement pour
       * les foyers qu'on a le droit de connaître.
       */
      const prenoms = new Map<string, string>()
      let monFoyer: string | null = null
      if (lignes.some(l => l.owner_household_id !== null)) {
        monFoyer = ou(await supabase.rpc('current_household'))
        for (const p of ou(await supabase.rpc('prenoms_visibles'))) {
          if (p.id && p.display_name) prenoms.set(p.id, p.display_name)
        }
      }

      return trie(lignes.map(({ created_by, recipe_nutrition, ...l }) => {
        // La jointure rend un objet ou un tableau selon la cardinalité déduite.
        const n = Array.isArray(recipe_nutrition) ? recipe_nutrition[0] ?? null : recipe_nutrition
        return {
          ...l,
          appliances: l.appliances ?? [],
          nutrition: n ?? null,
          ajoutePar: created_by ? prenoms.get(created_by) ?? null : null,
          dUnAmi: l.owner_household_id !== null && l.owner_household_id !== monFoyer,
        }
      }))
    },
  })
}

/** Ce qui manque au placard, pour les SEULES recettes affichées (R1, D28). */
export function useManques(ids: string[], placard: Set<string>) {
  return useQuery({
    queryKey: ['manques', ids, [...placard].sort()],
    enabled: ids.length > 0 && placard.size > 0,
    staleTime: 60_000,
    // Sans cela, les « il manque… » clignotent à chaque frappe et à chaque page :
    // la clé change, et la requête repartirait de rien. Mais un placard VIDE n'a
    // rien qui manque : la requête est éteinte, et garder l'ancien résultat
    // afficherait les manques de l'ancien placard.
    placeholderData: (precedent: Map<string, string[]> | undefined) =>
      placard.size > 0 ? keepPreviousData(precedent) : undefined,
    queryFn: async () => manquesDe(ou(await supabase.from('recipe_ingredient')
      .select('recipe_id, food_id, raw_text').in('recipe_id', ids)), placard),
  })
}

/**
 * Les recettes faisables avec le placard, sur TOUT le catalogue : c'est la base
 * qui répond (0092). La clé porte le placard : il change, la réponse aussi.
 *
 * Le résultat d'une RPC n'a pas de `.gt` : on lit par décalage, et le `Set`
 * dédoublonne ce qu'une insertion entre deux tranches ferait revenir.
 */
export function useFaisables(actif: boolean, placard: Set<string>) {
  return useQuery({
    queryKey: ['faisables', [...placard].sort()],
    enabled: actif && placard.size > 0,
    staleTime: 60_000,
    queryFn: async () => new Set(await parTranches(async (de, a) =>
      ou(await supabase.rpc('recettes_faisables').range(de, a)) as string[])),
  })
}

/**
 * Ce que le foyer a déjà cuisiné, pour « Jamais essayée ».
 *
 * Le cycle EN COURS ne compte pas : une recette qu'on vient de retenir ne doit
 * pas disparaître de la liste, elle y passe à « Retenue » (spec § 8). On ne lit
 * donc que les `cycle_recipe` des AUTRES cycles.
 *
 * `cycleId` a trois états, et ils ne se confondent pas :
 *  · `undefined` — le cycle SE CHARGE : la requête est éteinte. Partir sans
 *    savoir quel cycle exclure cacherait un instant, sous « Jamais essayée »,
 *    des recettes pourtant retenues ;
 *  · `null` — il n'y a PAS de cycle ouvert : rien à exclure, on lit tous les
 *    cycles ;
 *  · un identifiant — on lit tous les cycles SAUF celui-là.
 */
export function useDejaFaites(actif: boolean, cycleId: string | null | undefined) {
  return useQuery({
    queryKey: ['deja-faites', cycleId === null ? 'tous' : cycleId],
    enabled: actif && cycleId !== undefined,
    queryFn: async () => {
      const lignes = await parClef(async apresId => {
        const q = supabase.from('cycle_recipe').select('id, recipe_id')
        const autres = cycleId ? q.neq('cycle_id', cycleId) : q
        return ou(await (apresId ? autres.gt('id', apresId) : autres)
          .order('id').limit(PAGE_DE_LA_BASE))
      })
      return new Set(lignes.map(r => r.recipe_id))
    },
  })
}
