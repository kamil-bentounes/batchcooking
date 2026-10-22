/**
 * Ce que la page de clôture décide avant de montrer ou d'envoyer quoi que ce soit
 * (§ 3.5) — pur, sans réseau : l'écran n'a pas de banc de composants, c'est ici que
 * le test fige les règles. Les étapes (`etapes.ts`) disent ce que l'argent fait ;
 * ici, ce que la PAGE fait : quelle porte, quel appel, quel double clic.
 */
import type { Choix, Cloture, Depense, Poche } from '../donnees/budget.ts'
import { etatDeLEcran, type Lecture } from './ecran.ts'
import { envoiDuReste, type ChoixDuReste } from './etapes.ts'
import { aDesSaisies, montant, nomDuMois, nomDuMoisDate, type Saisie } from './mois.ts'

export type Porte = 'trop-tot' | 'chargement' | 'erreur' | 'close' | 'sans-revenu' | 'a-clore'

/**
 * Ce que la page ouvre.
 *
 * - Le mois en cours (ou à venir) ne se clôture jamais : ses derniers jours ont
 *   encore des dépenses. La garde ne lit rien — elle ne dépend d'aucune lecture.
 * - Les clôtures décident avant tout le reste : sans elles on ne sait pas si le mois
 *   est déjà clos, et lui offrir « Clôturer » serait offrir ce que la base refuse.
 *   Pas lues, c'est « Un instant » ; en panne, c'est la panne.
 * - Un mois clos se lit, même si le reste n'est pas revenu : seul « Revenir dessus » agit.
 * - Sans revenu on ne clôture pas (§ 4.5) — mais seulement quand les revenus sont LUS :
 *   « Ajoute ton revenu » dit à qui l'a posé qu'il ne l'a pas fait.
 */
export function porteDeLaCloture(o: {
  mois: string; courant: string
  clotures: { data: Cloture[] | undefined; error: unknown }
  /** Lignes du mois, saisies, revenus : de quoi chiffrer la clôture. */
  lectures: Lecture[]
  /** Mon revenu de ce mois ; null s'il n'y en a pas (ou pas encore lu). */
  revenu: number | null
}): { porte: Porte; fermee: Cloture | null } {
  if (o.mois >= o.courant) return { porte: 'trop-tot', fermee: null }
  if (o.clotures.data === undefined) {
    return { porte: o.clotures.error ? 'erreur' : 'chargement', fermee: null }
  }
  const fermee = o.clotures.data.find(k => k.mois === o.mois) ?? null
  if (fermee) return { porte: 'close', fermee }
  const etat = etatDeLEcran(o.lectures)
  if (etat !== 'pret') return { porte: etat, fermee: null }
  return { porte: o.revenu === null ? 'sans-revenu' : 'a-clore', fermee: null }
}

/** « d'octobre », « de mars » : la base dit la même chose (`de_mois`, 0094). Avec `courant`,
    l'année quand ce n'est pas la courante : « de septembre 2025 ». */
export function deMois(mois: string, courant?: string): string {
  const nom = courant === undefined ? nomDuMois(mois) : nomDuMoisDate(mois, courant)
  return /^[aeiouyéè]/.test(nom) ? `d’${nom}` : `de ${nom}`
}

/**
 * Les lignes déjà confirmées à 0 € sans aucune saisie — une reclôture après « Rien
 * dépensé » — arrivent basculées (§ 3.5). Elles se retrouvent par leur CHARGE : c'est
 * ce que `cloture_le_mois` attend dans `rien`.
 */
export function rienDOffice(lignes: Depense[], saisies: Saisie[]): Set<string> {
  return new Set(lignes
    .filter(l => l.facon === 'au_fil' && l.charge_id && l.confirme_le !== null
                 && l.montant_cents === 0 && !aDesSaisies(l, saisies))
    .map(l => l.charge_id!))
}

/**
 * Ce que « Rien dépensé » enverra vraiment. `choisi` à `null` : on n'a rien touché, c'est
 * l'état d'office. Ensuite c'est ce qu'on a choisi, MOINS les lignes qui ont une saisie
 * entre-temps : « Rien dépensé » allumé, puis 47,90 € déclarés par la feuille, le bouton
 * disparaît mais la charge restait dans l'envoi — et la page comptait 0 € là où la
 * clôture compterait 47,90 €. Les charges qui ne sont plus au fil du mois ne partent pas.
 */
export function rienEffectif(lignes: Depense[], saisies: Saisie[], choisi: Set<string> | null): Set<string> {
  const base = choisi ?? rienDOffice(lignes, saisies)
  const sansSaisie = new Set(lignes
    .filter(l => l.facon === 'au_fil' && l.charge_id && !aDesSaisies(l, saisies))
    .map(l => l.charge_id!))
  return new Set([...base].filter(c => sansSaisie.has(c)))
}

export type AppelDeCloture = {
  mois: string; rien: string[]
  misDeCote: number | null; poche: string | null
}

/**
 * L'appel de `cloture_le_mois` pour ce que l'écran montre. Aucune facture n'y est
 * jointe : « C'est ça » et « Modifier » valident tout de suite (choix 17), la base confirme
 * le reste à son montant (`clotureLeMois` envoie `factures: []`). `valide` à faux : une saisie illisible — rien ne part.
 */
export function envoiDeLaCloture(o: {
  mois: string; reste: number; poches: Poche[]; choix: ChoixDuReste; rien: Set<string>
  /** Le reste est « avant les soldes d'année » : voir `leReste`. */
  incertain?: boolean
}): { valide: boolean; appel: AppelDeCloture | null } {
  const e = envoiDuReste({ reste: o.reste, poches: o.poches, choix: o.choix, incertain: o.incertain })
  if (!e.valide) return { valide: false, appel: null }
  return { valide: true, appel: { mois: o.mois, rien: [...o.rien],
                                  misDeCote: e.misDeCote, poche: e.poche } }
}

/**
 * Ce que « Revenir dessus » retire de l'épargne : le versement de TOUS les membres encore
 * dans le foyer (`rouvre_le_mois` les efface tous), pas ma part seule. Un membre parti
 * garde le sien dans la poche. `presents` à `undefined` : le foyer n'est pas lu — on ne sait
 * pas qui est parti, donc on ne chiffre rien (`null`) : compter tout le monde annonçait un
 * total trop grand à qui a un membre parti, le temps de la lecture.
 */
export function misDeCoteDuFoyer(choix: Choix[], presents: string[] | undefined): number | null {
  if (presents === undefined) return null
  return choix
    .filter(c => presents.includes(c.user_profile_id))
    .reduce((t, c) => t + c.mis_de_cote_cents, 0)
}

/**
 * La feuille « choix » (« Déclarer ») restée ouverte au moment où le mois se clôt : elle
 * disparaît, et le focus avec elle — il retombait sur le corps de la page. L'écran la ferme alors
 * lui-même et rend le focus au geste qui reste, « Revenir dessus ».
 */
export function choixAFermer(ouverte: { geste: string } | null, clos: boolean): boolean {
  return clos && ouverte?.geste === 'choix'
}

/** La question posée avant de rouvrir un mois : l'épargne en perd le versement. */
export function questionPourRevenir(mois: string, misDeCote: number): string {
  return misDeCote > 0
    ? `Revenir sur ${nomDuMois(mois)} ? Les ${montant(misDeCote)} mis de côté seront retirés de l’épargne.`
    : `Revenir sur ${nomDuMois(mois)} ?`
}

/**
 * Un geste qui ne part qu'une fois : `prends()` rend vrai au premier appel, faux ensuite,
 * jusqu'à `rends()`. `disabled={isPending}` ne suffit pas : entre deux clics rapprochés,
 * React n'a pas toujours rendu — le second partait, et une clôture se jouait deux fois.
 */
export function unSeulEnvoi() {
  let enVol = false
  return {
    prends(): boolean {
      if (enVol) return false
      enVol = true
      return true
    },
    rends(): void { enVol = false },
  }
}

export type Garde = ReturnType<typeof unSeulEnvoi>

/**
 * « Revenir dessus » : la question, puis la réouverture — une seule fois. Le garde est pris
 * AVANT la question : un second clic pendant que `confirm` est ouvert, ou avant la réponse de la
 * base, ne rouvre pas deux fois. Refusée, la question rend le garde. Échouée, la réouverture
 * aussi : on peut recommencer. `apres` part quand la base a répondu, même si le bouton a disparu.
 */
export function revenirSiConfirme(o: {
  garde: Garde; question: string; confirmer: (q: string) => boolean
  rouvrir: () => Promise<unknown>; apres?: () => void
}): void {
  if (!o.garde.prends()) return
  if (!o.confirmer(o.question)) { o.garde.rends(); return }
  o.rouvrir().then(() => o.apres?.(), () => o.garde.rends())
}

/**
 * « Clôturer » : un seul envoi par clic utile. `disabled={isPending}` ne tient pas deux
 * clics rapprochés — React n'a pas toujours rendu entre les deux, et la clôture partait
 * deux fois. Une saisie illisible n'envoie rien ET ne prend pas le garde : on corrige, puis on
 * reclique. Échouée, la clôture rend le garde. Réussie, il reste pris : la page s'en va.
 */
export function cloreUneFois(o: {
  garde: Garde; envoi: { valide: boolean; appel: AppelDeCloture | null }
  cloturer: (a: AppelDeCloture) => Promise<unknown>; apres: () => void
}): void {
  if (!o.envoi.valide || o.envoi.appel === null) return
  if (!o.garde.prends()) return
  o.cloturer(o.envoi.appel).then(() => o.apres(), () => o.garde.rends())
}
