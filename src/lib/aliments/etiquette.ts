/**
 * Ce que la fonction `etiquette` a LU sur une photo d'emballage, ramené à un aliment du foyer.
 *
 * La fonction recopie le tableau nutritionnel (valeurs POUR 100 G, c'est la forme légale), le poids net et, quand
 * l'emballage l'annonce, le nombre de portions. Elle ne valide rien : l'écran remplit les champs, et la personne
 * les vérifie avant d'enregistrer. Ce module décide de ce qu'on remplit — et de ce qu'on laisse VIDE plutôt que
 * d'y mettre un chiffre douteux, car un chiffre inventé entrerait dans le bilan sans que personne s'en aperçoive.
 */
import { ecrit } from './calcul.ts'

export type LectureEtiquette = {
  nom: string | null
  marque?: string | null
  poids_g: number | null
  parts: number | null
  kcal_100g: number | null
  proteines_100g: number | null
  glucides_100g: number | null
  lipides_100g: number | null
  fibres_100g: number | null
  lisible: boolean
  confiance: number
  commentaire: string | null
  restantes?: number
  erreur?: string
}

/** Les champs de l'écran que la lecture remplit (des textes : ce sont des champs de saisie). */
export type ChampsLus = Partial<{
  label: string; kcal: string; proteines: string; glucides: string; lipides: string; fibres: string; poids: string
}>

/** Un texte de champ : « 12,5 », « 95 ». */
const champ = (n: number) => String(n).replace('.', ',')

const entre = (v: number | null, max: number): v is number => v !== null && Number.isFinite(v) && v >= 0 && v <= max

/**
 * Remplit ce qui est sûr, dit ce qui ne l'est pas. `notes` : une phrase par doute, dans l'ordre où l'on vérifie.
 */
export function champsDeLEtiquette(l: LectureEtiquette): { champs: ChampsLus; notes: string[] } {
  if (!l.lisible) return { champs: {}, notes: ['Je n’ai rien pu lire sur cette photo. Reprends-la plus près, ou remplis à la main.'] }

  const champs: ChampsLus = {}
  const notes: string[] = []

  const nom = (l.nom ?? '').trim()
  const marque = (l.marque ?? '').trim()
  const label = marque && !nom.toLowerCase().includes(marque.toLowerCase()) ? `${nom} ${marque}`.trim() : nom
  if (label) champs.label = label.slice(0, 80)

  /* ⚠️ 900 kcal pour 100 g est le plafond physique d'un aliment (l'huile pure) : au-delà, le tableau a été lu en
     kJ. On ne remplit rien et on le dit, plutôt que de mettre des kJ dans des kcal. */
  if (l.kcal_100g === null) notes.push('Les calories ne sont pas lisibles : écris-les d’après l’étiquette.')
  else if (l.kcal_100g > 900) {
    notes.push(`Les calories lues (${ecrit(l.kcal_100g)} pour 100 g) sont trop hautes pour des kcal, sans doute des kJ : je ne les ai pas remplies.`)
  } else if (entre(l.kcal_100g, 900)) champs.kcal = champ(Math.round(l.kcal_100g))

  if (entre(l.proteines_100g, 100)) champs.proteines = champ(l.proteines_100g)
  else notes.push('Les protéines ne sont pas lisibles : écris-les d’après l’étiquette.')
  if (entre(l.glucides_100g, 100)) champs.glucides = champ(l.glucides_100g)
  if (entre(l.lipides_100g, 100)) champs.lipides = champ(l.lipides_100g)
  if (entre(l.fibres_100g, 100)) champs.fibres = champ(l.fibres_100g)

  /* Le poids d'UNE unité : le poids net du paquet divisé par ses portions quand l'emballage en annonce plusieurs
     (4 pots de 125 g : 500 g / 4), sinon le poids net lui-même (un pot de 125 g). */
  if (l.poids_g !== null && l.poids_g > 0) {
    const n = l.parts !== null && l.parts > 1 ? l.parts : 1
    const g = l.poids_g / n
    const rond = g >= 10 ? Math.round(g) : Math.round(g * 10) / 10
    if (rond >= 1 && rond <= 5000) {
      champs.poids = champ(rond)
      if (n > 1) notes.push(`Le paquet annonce ${n} portions de ${ecrit(l.poids_g)} g en tout : je compte ${champ(rond)} g l’unité.`)
    }
  }
  if (champs.poids === undefined) notes.push('Je n’ai pas vu le poids net : dis combien pèse un pot.')

  if (l.confiance < 0.7) notes.push('Le tableau n’est pas net : vérifie chaque chiffre.')
  if (l.commentaire && l.commentaire.trim()) notes.push(l.commentaire.trim())
  return { champs, notes }
}

/** Une erreur de `callFunction('etiquette', …)` : le corps est du JSON qui porte déjà une phrase française. */
export function phraseDeLErreur(e: unknown): string {
  const brut = e instanceof Error ? e.message : ''
  let dit = brut || 'La lecture a échoué.'
  try { dit = JSON.parse(brut).erreur ?? dit } catch { /* pas du JSON */ }
  return dit
}
