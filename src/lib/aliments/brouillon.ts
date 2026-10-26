/**
 * Un aliment à moitié rempli : ce que les champs de l'écran contiennent (des TEXTES), et ce qu'on en tire pour la base.
 *
 * Les bornes sont celles de la migration 0124 : si le client les laissait passer, la base répondrait par un nom de
 * contrainte (`aliment_kcal_100g_check`) ; ici, une phrase française par champ, sous le champ.
 */
import { codeBarresValide } from './openfoodfacts.ts'

export type Source = 'main' | 'etiquette' | 'code_barres'

/** D'où viennent les chiffres, dit comme l'écran le dit. */
export const MOT_DE_LA_SOURCE: Record<Source, string> = {
  main: 'à la main', etiquette: 'étiquette', code_barres: 'code-barres',
}

export type Brouillon = {
  label: string
  kcal: string
  proteines: string
  glucides: string
  lipides: string
  fibres: string
  unite: string
  poids: string
  codeBarres: string
  source: Source
}

export type Champ = keyof Brouillon

export const brouillonVide = (): Brouillon => ({
  label: '', kcal: '', proteines: '', glucides: '', lipides: '', fibres: '',
  unite: 'pot', poids: '', codeBarres: '', source: 'main',
})

/** Un nombre tapé « 5,6 », « 5.6 » ou « 1 250 ». `null` : vide ; `NaN` : illisible. */
export function lisLeNombre(saisie: string): number | null {
  const t = saisie.trim().replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  return /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN
}

/** Ce que la base reçoit d'un aliment (sans `household_id`, que l'écriture ajoute). */
export type Valeurs = {
  label: string
  kcal_100g: number
  protein_100g: number
  carb_100g: number
  fat_100g: number
  fiber_100g: number
  unite: string
  unite_g: number
  code_barres: string | null
  source: Source
}

export type Erreurs = Partial<Record<Champ | 'macros', string>>

/** Le texte d'un nombre pour un champ : 12.5 → « 12,5 ». */
const texte = (n: number | string) => String(n).replace('.', ',')

/** Un aliment déjà rangé → les champs de l'écran. */
export function depuisLaBase(a: {
  label: string; kcal_100g: number | string; protein_100g: number | string; carb_100g: number | string
  fat_100g: number | string; fiber_100g: number | string; unite: string; unite_g: number | string
  code_barres: string | null; source: string
}): Brouillon {
  /* Zéro est une vraie valeur pour les glucides, les lipides, les fibres : on l'écrit, on ne le laisse pas vide. */
  return {
    label: a.label, kcal: texte(Number(a.kcal_100g)), proteines: texte(Number(a.protein_100g)),
    glucides: texte(Number(a.carb_100g)), lipides: texte(Number(a.fat_100g)), fibres: texte(Number(a.fiber_100g)),
    unite: a.unite, poids: texte(Number(a.unite_g)), codeBarres: a.code_barres ?? '',
    source: a.source === 'etiquette' || a.source === 'code_barres' ? a.source : 'main',
  }
}

/**
 * Lire les champs : les valeurs à écrire, ou une phrase par champ refusé.
 *
 * Les calories et les protéines sont EXIGÉES : ce sont elles que le bilan lit, et un zéro n'est pas « inconnu », c'est
 * « ce repas ne t'a rien apporté ». Glucides, lipides et fibres vides valent zéro.
 */
export function lis(b: Brouillon): { ok: true; valeurs: Valeurs } | { ok: false; erreurs: Erreurs } {
  const erreurs: Erreurs = {}

  const label = b.label.trim()
  if (label === '') erreurs.label = 'Donne-lui un nom.'
  else if (label.length > 80) erreurs.label = '80 caractères au plus.'

  const nombre = (c: 'kcal' | 'proteines' | 'glucides' | 'lipides' | 'fibres', max: number, exige: boolean, manque: string): number => {
    const n = lisLeNombre(b[c])
    if (n === null) { if (exige) erreurs[c] = manque; return 0 }
    if (Number.isNaN(n)) { erreurs[c] = 'Je ne lis pas ce nombre.'; return 0 }
    if (n < 0) { erreurs[c] = 'Pas de valeur négative.'; return 0 }
    if (n > max) {
      erreurs[c] = c === 'kcal'
        ? 'Plus de 900 kcal pour 100 g, c’est de l’huile pure : vérifie que ce ne sont pas des kJ.'
        : 'Pas plus de 100 g pour 100 g.'
      return 0
    }
    return n
  }
  const kcal = nombre('kcal', 900, true, 'Il manque les calories.')
  const proteines = nombre('proteines', 100, true, 'Il manque les protéines.')
  const glucides = nombre('glucides', 100, false, '')
  const lipides = nombre('lipides', 100, false, '')
  const fibres = nombre('fibres', 100, false, '')
  if (!erreurs.proteines && !erreurs.glucides && !erreurs.lipides && proteines + glucides + lipides > 105) {
    erreurs.macros = 'Protéines, glucides et lipides font plus de 100 g pour 100 g : un chiffre est faux.'
  }

  const unite = b.unite.trim()
  if (unite === '') erreurs.unite = 'Donne un nom à l’unité : pot, part, portion…'
  else if (unite.length > 20) erreurs.unite = '20 caractères au plus.'

  const poids = lisLeNombre(b.poids)
  if (poids === null) erreurs.poids = `Dis combien pèse ${unite === '' ? '1 unité' : `1 ${unite}`}.`
  else if (Number.isNaN(poids)) erreurs.poids = 'Je ne lis pas ce nombre.'
  else if (poids < 1) erreurs.poids = 'Au moins 1 g.'
  else if (poids > 5000) erreurs.poids = 'Pas plus de 5 000 g.'

  const code = b.codeBarres.replace(/\s/g, '')
  if (code !== '' && !/^\d{8,14}$/.test(code)) erreurs.codeBarres = 'Un code-barres a de 8 à 14 chiffres.'

  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs }
  return {
    ok: true,
    valeurs: {
      label, kcal_100g: kcal, protein_100g: proteines, carb_100g: glucides, fat_100g: lipides, fiber_100g: fibres,
      unite, unite_g: poids as number, code_barres: code === '' ? null : code, source: b.source,
    },
  }
}

/** Le code-barres est-il de ceux qu'on cherche ? (dit « faux » avant de déranger Open Food Facts) */
export const codeAChercher = (saisie: string): { code: string; valide: boolean } => {
  const code = saisie.replace(/\s/g, '')
  return { code, valide: codeBarresValide(code) }
}

/** La phrase d'une panne d'écriture, d'après la contrainte que la base a nommée. */
export function phraseDeLEcriture(message: string): string {
  if (/aliment_label_unique/.test(message)) return 'Un aliment porte déjà ce nom dans le foyer. Change-le, ou modifie l’autre.'
  if (/aliment_code_barres_unique/.test(message)) return 'Ce code-barres est déjà dans nos aliments : modifie l’aliment qui le porte.'
  if (/aliment_kcal_100g_check/.test(message)) return 'Les calories pour 100 g doivent être entre 0 et 900.'
  if (/aliment_macros_plausibles/.test(message)) return 'Protéines, glucides et lipides font plus de 100 g pour 100 g : un chiffre est faux.'
  if (/aliment_unite_g_check/.test(message)) return 'L’unité doit peser entre 1 g et 5 000 g.'
  return message
}
