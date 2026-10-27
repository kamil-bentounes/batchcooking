/**
 * La semaine qu'on choisit : ce que dit l'écran « La semaine », sans aucune requête.
 *
 * Sept jours en bandeau, deux points sous chacun (midi, soir) ; le jour choisi a deux cartes (« Midi », « Soir »),
 * vide ou pleine ; une carte congelée porte un bandeau bleu ; et une feuille propose, dans l'ordre : le frigo (le
 * plus pressé d'abord), le congélateur, puis autre chose. Pur, donc éprouvé sans base ni navigateur — le CHOIX de
 * la barquette est écrit par la base (`choisir_un_repas`, 0123) ; `choisirLesParts` en est le miroir, pour dire
 * avant d'écrire s'il y en aura assez.
 */
import { jour } from './semaine.ts'
import {
  JOUR_ENTIER, avant, ecartEnJours, lisLeJour, momentDuRepas, noteDeSortie, nomCourt, partsDuPlat, partsLibres,
  sortableDes, unSeulMot,
} from './frigo.ts'
import type { Groupe, Part, Prevu, Quand } from './frigo.ts'
import { urgence } from './peremption.ts'
import type { Lieu } from './peremption.ts'
import { pourLeFoyer } from './ranger.ts'

/** Les deux repas que la semaine propose de choisir ; le petit déjeuner et la collation restent des en-plus. */
export const REPAS_CHOISIS = ['dejeuner', 'diner'] as const
export type RepasChoisi = (typeof REPAS_CHOISIS)[number]

export const MOT_DU_REPAS: Record<RepasChoisi, { titre: string; minuscule: string }> = {
  dejeuner: { titre: 'Midi', minuscule: 'midi' },
  diner: { titre: 'Soir', minuscule: 'soir' },
}

/** Les moments que « La semaine » ne choisit pas : on les note après coup (le petit déjeuner, la collation). */
export const MOMENTS_EN_PLUS: ('petit_dejeuner' | 'collation')[] = ['petit_dejeuner', 'collation']

export const estUnRepasChoisi = (m: string | null | undefined): m is RepasChoisi =>
  m === 'dejeuner' || m === 'diner'

// ── Les sept jours ──────────────────────────────────────────────────────────

const COURT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre',
  'octobre', 'novembre', 'décembre']

export type JourDuBandeau = {
  /** « 2026-10-26 », en heure locale. */
  jour: string
  /** « auj. » pour aujourd'hui, « hier » pour hier, sinon « mar. ». */
  court: string
  num: number
  /** « Lundi 26 octobre » ; « Dimanche 1er novembre ». */
  long: string
  /** « Lundi » : le début du titre de la feuille. */
  semaine: string
  aujourdhui: boolean
  /** Avant aujourd'hui : un jour qu'on note, au lieu de le choisir. */
  passe: boolean
  hier: boolean
}

const majuscule = (t: string) => `${t[0].toUpperCase()}${t.slice(1)}`

export function dateEnToutesLettres(d: Date): string {
  return `${majuscule(JOUR_ENTIER[d.getDay()])} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]}`
}

/** Les jours qu'on peut encore noter, avant aujourd'hui : une semaine (la base le borne de même, 0128). */
export const JOURS_PASSES = 7
/** Les jours qu'on peut déjà choisir, après aujourd'hui. */
export const JOURS_A_VENIR = 6

/**
 * Le bandeau : sept jours passés, aujourd'hui, puis les six suivants. Le premier est le plus ancien ; aujourd'hui est à
 * l'indice `avant` (`indexDAujourdhui`). Un jour passé s'écrit « hier » pour hier, et par son jour de la semaine
 * ensuite : on y note ce qu'on a mangé.
 */
export function joursDuBandeau(debut: Date, apres = JOURS_A_VENIR, avant = JOURS_PASSES): JourDuBandeau[] {
  return Array.from({ length: avant + 1 + apres }, (_, k) => {
    const i = k - avant
    const d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i)
    return {
      jour: jour(d), num: d.getDate(), aujourdhui: i === 0, passe: i < 0, hier: i === -1,
      court: i === 0 ? 'auj.' : i === -1 ? 'hier' : COURT[d.getDay()],
      long: dateEnToutesLettres(d), semaine: majuscule(JOUR_ENTIER[d.getDay()]),
    }
  })
}

/** Où est aujourd'hui dans le bandeau : c'est le jour qui s'ouvre. */
export const indexDAujourdhui = (jours: JourDuBandeau[]): number => Math.max(0, jours.findIndex(j => j.aujourdhui))

/** « Lundi midi » : le titre de la feuille de choix. */
export function titreDeLaFeuille(j: JourDuBandeau, repas: RepasChoisi): string {
  return `${j.semaine} ${MOT_DU_REPAS[repas].minuscule}`
}

/**
 * Ce que dit l'adresse (`/semaine?jour=2026-10-26&repas=diner`) : l'indice du jour dans le bandeau et le repas dont
 * la feuille s'ouvre. Un jour hors du bandeau, ou illisible, est ignoré (on ouvre aujourd'hui) ; un repas
 * ignoré aussi (le petit déjeuner et la collation n'ont pas de feuille) — et sans jour, il n'y a pas de feuille.
 */
export function lisLAdresse(recherche: string, jours: JourDuBandeau[]): { index: number; repas: RepasChoisi | null } {
  const q = new URLSearchParams(recherche)
  const index = jours.findIndex(j => j.jour === q.get('jour'))
  const repas = q.get('repas')
  return { index: index >= 0 ? index : indexDAujourdhui(jours), repas: index >= 0 && estUnRepasChoisi(repas) ? repas : null }
}

// ── Ce que porte une case ───────────────────────────────────────────────────

/** Ce que l'écran lit d'une case (`Case` de `useSemaine`, réduit à ce qui sert). */
export type CaseLue = {
  id: string
  user_profile_id: string
  day: string
  meal: string
  state: string
  /** L'heure à laquelle le repas a été noté mangé. */
  eaten_at?: string | null
  portion: (Part & { recipe_id: string | null }) | null
  extras: { label: string; kcal?: number | string; protein_g?: number | string }[]
}

export type Contenu =
  | { genre: 'vide' }
  | { genre: 'plat'; lieu: Lieu; label: string; recipeId: string | null }
  | { genre: 'autre'; label: string }
  | { genre: 'saute' }

/**
 * Ce qu'une case dit qu'on mange : un plat (sa barquette), autre chose (pas de barquette, un extra qui dit quoi),
 * rien (« sauté ») ou rien du tout (une case « prévue » sans barquette ni extra : on ne sait pas).
 */
export function contenuDe(c: Pick<CaseLue, 'state' | 'portion' | 'extras'>): Contenu {
  if (c.state === 'saute') return { genre: 'saute' }
  if (c.portion) {
    return {
      genre: 'plat', lieu: c.portion.location === 'congelateur' ? 'congelateur' : 'frigo',
      label: c.portion.label, recipeId: c.portion.recipe_id,
    }
  }
  if (c.extras.length > 0) return { genre: 'autre', label: c.extras.map(e => e.label).join(' + ') }
  return { genre: 'vide' }
}

export type PointDuJour = 'frigo' | 'congelateur' | 'autre' | 'vide'

/**
 * La couleur du point d'un repas : vert, du frigo ; bleu, du congélateur ; safran, autre chose (et sauter) ; creux,
 * rien. Quand les personnes ne mangent pas la même chose, le premier contenu (le mien d'abord) donne le ton.
 */
export function couleurDuPoint(contenus: Contenu[]): PointDuJour {
  const c = contenus.find(x => x.genre !== 'vide')
  if (!c) return 'vide'
  return c.genre === 'plat' ? c.lieu : 'autre'
}

export type Membre = { id: string; prenom: string }

export type Carte = {
  cle: string
  contenu: Exclude<Contenu, { genre: 'vide' }>
  /** Les personnes à qui ce repas est destiné, dans l'ordre du foyer (moi d'abord quand j'en suis). */
  personnes: string[]
  /** Celles qui l'ont mangé. */
  mangePar: string[]
  /** Les cases de ces personnes. */
  cases: CaseLue[]
}

/**
 * Les cartes d'un repas : une par contenu différent. « Du frigo, pour vous deux » est UNE carte ; si Kamil prend
 * des lasagnes et Thauba une pizza, ce sont deux cartes. Les personnes sans choix sont rendues à part
 * (`sansChoix`) : c'est pour elles que « + Choisir le midi » reste proposé.
 */
export function cartesDuRepas(cases: CaseLue[], membres: Membre[], moi: string): { cartes: Carte[]; sansChoix: string[] } {
  const rang = (id: string) => (id === moi ? -1 : membres.findIndex(m => m.id === id))
  const parCle = new Map<string, Carte>()
  const sansChoix: string[] = []
  const ordonnees = [...cases].sort((a, b) => rang(a.user_profile_id) - rang(b.user_profile_id))
  for (const c of ordonnees) {
    const contenu = contenuDe(c)
    if (contenu.genre === 'vide') continue
    const cle = contenu.genre === 'plat' ? `plat|${contenu.label}|${contenu.lieu}|${contenu.recipeId ?? ''}`
      : contenu.genre === 'autre' ? `autre|${contenu.label}` : 'saute'
    let carte = parCle.get(cle)
    if (!carte) { carte = { cle, contenu, personnes: [], mangePar: [], cases: [] }; parCle.set(cle, carte) }
    carte.personnes.push(c.user_profile_id)
    carte.cases.push(c)
    if (c.state === 'mange') carte.mangePar.push(c.user_profile_id)
  }
  const avecCarte = new Set([...parCle.values()].flatMap(c => c.personnes))
  for (const m of membres) if (!avecCarte.has(m.id)) sansChoix.push(m.id)
  return { cartes: [...parCle.values()], sansChoix }
}

/** « vous deux », « Kamil », « Kamil et Thauba » : pour qui, dit comme la maquette (les prénoms, jamais « toi »). */
export function pourDit(ids: string[], membres: Membre[]): string {
  const uniques = [...new Set(ids)]
  if (uniques.length > 1 && uniques.length >= membres.length) return pourLeFoyer(membres.length)
  const nom = (id: string) => membres.find(m => m.id === id)?.prenom ?? 'quelqu’un'
  return uniques.map(nom).join(' et ')
}

/**
 * La ligne sous le nom : « Du frigo, pour vous deux », « Du congélateur, pour Kamil », « Pour vous deux ». Sur un jour
 * PASSÉ (`passe`), un repas qui n'est pas marqué mangé le dit : « … · pas encore noté », et « … · Kamil l'a mangé, pas
 * encore noté pour Thauba » quand une partie seulement l'est.
 */
export function ligneDeLaCarte(carte: Carte, membres: Membre[], passe = false): string {
  const pour = pourDit(carte.personnes, membres)
  const c = carte.contenu
  const base = c.genre === 'plat'
    ? `${c.lieu === 'congelateur' ? 'Du congélateur' : 'Du frigo'}, pour ${pour}`
    : `Pour ${pour}`
  const nom = (id: string) => membres.find(m => m.id === id)?.prenom ?? 'quelqu’un'
  if (carte.mangePar.length === 0) return passe && c.genre !== 'saute' ? `${base} · pas encore noté` : base
  const tous = carte.mangePar.length === carte.personnes.length
  if (tous) return `${base} · mangé`
  const mangeurs = `${carte.mangePar.map(nom).join(' et ')} ${carte.mangePar.length > 1 ? 'l’ont' : 'l’a'} mangé`
  const restent = carte.personnes.filter(id => !carte.mangePar.includes(id))
  return passe ? `${base} · ${mangeurs}, pas encore noté pour ${restent.map(nom).join(' et ')}` : `${base} · ${mangeurs}`
}

/** Un repas passé que personne n'a mangé : qu'il reste à noter. */
export const aNoter = (carte: Carte): boolean => carte.contenu.genre !== 'saute' && carte.mangePar.length < carte.personnes.length

/**
 * Le texte de la carte vide : « + Choisir le midi » (à venir), « + Noter ce que j'ai mangé ce midi » (un jour passé).
 * `pour` : les personnes sans choix quand une autre carte existe déjà (« + Choisir le midi pour Thauba », « + Noter ce
 * que Thauba a mangé ce midi » ; moi seul : « j'ai ») ; absent : tout le monde.
 */
export function texteDeLaCarteVide(repas: RepasChoisi, passe: boolean, pour?: { ids: string[]; membres: Membre[]; moi: string }): string {
  const mot = MOT_DU_REPAS[repas].minuscule
  const ce = repas === 'dejeuner' ? 'ce midi' : 'ce soir'
  if (!passe) return `+ Choisir le ${mot}${pour ? ` pour ${pourDit(pour.ids, pour.membres)}` : ''}`
  if (!pour) return `+ Noter ce que j’ai mangé ${ce}`
  const ids = [...new Set(pour.ids)]
  if (ids.length === 1 && ids[0] === pour.moi) return `+ Noter ce que j’ai mangé ${ce}`
  const eux = pourDit(ids, pour.membres)
  return `+ Noter ce que ${eux} ${ids.length > 1 ? 'ont' : 'a'} mangé ${ce}`
}

/** « au soir », « du soir » : le moment, dit comme les boutons de « en plus ». */
export const MOT_DU_MOMENT: Record<string, { au: string; du: string }> = {
  petit_dejeuner: { au: 'au petit déjeuner', du: 'du petit déjeuner' },
  dejeuner: { au: 'au midi', du: 'du midi' },
  diner: { au: 'au soir', du: 'du soir' },
  collation: { au: 'à la collation', du: 'de la collation' },
}

/** Le nom de la carte : le plat (nom court), ce qu'on mange à la place, ou « On saute ce repas ». */
export function nomDeLaCarte(carte: Carte): string {
  const c = carte.contenu
  return c.genre === 'plat' ? nomCourt(c.label) : c.genre === 'autre' ? c.label : 'On saute ce repas'
}

/** Une case « prévue » sans barquette ni extra : ni un plat, ni une réponse. Elle ne dit rien, et ne se montre pas. */
export const caseVide = (c: Pick<CaseLue, 'state' | 'portion' | 'extras'>): boolean =>
  c.state === 'prevu' && !c.portion && c.extras.length === 0

/**
 * Ce que pèse la part de la personne sur la carte : « 784 g · 682 kcal · 56 g de protéines » (comme l'ancien écran, et la
 * fiche du frigo). La mienne quand j'en suis ; sinon celle de la première personne, nommée. `''` : pas un plat, ou
 * tout est mangé.
 */
export function detailDeLaPart(carte: Carte, membres: Membre[], moi: string): string {
  if (carte.contenu.genre !== 'plat' || carte.mangePar.length === carte.cases.length) return ''
  const c = carte.cases.find(x => x.user_profile_id === moi && x.portion) ?? carte.cases.find(x => x.portion)
  const p = c?.portion
  if (!c || !p) return ''
  const dit = `${Math.round(Number(p.grams))} g · ${Math.round(Number(p.kcal))} kcal · ${Math.round(Number(p.protein_g))} g de protéines`
  return c.user_profile_id === moi
    ? dit : `${membres.find(m => m.id === c.user_profile_id)?.prenom ?? 'quelqu’un'} : ${dit}`
}

/**
 * Ce que la carte dit de la péremption, dans les mots du frigo (`urgence`) : « périmée », « périme avant ce repas » (en
 * ocre), ou, au frigo, le mot d'urgence (« à manger aujourd'hui », « demain dernier délai »). La plus pressée des parts
 * qui n'ont pas été mangées ; `null` : rien à dire (un repas mangé, autre chose, une part encore bonne).
 */
export function peremptionDeLaCarte(carte: Carte, jour: string, repas: string, maintenant: Date): Quand | null {
  if (carte.contenu.genre !== 'plat') return null
  /* Un repas passé n'a plus à « périmer avant » : il a eu lieu. */
  if (ecartEnJours(jour, maintenant) < 0) return null
  const restantes = carte.cases.filter(c => c.state !== 'mange' && c.portion)
  if (restantes.length === 0) return null
  const premiere = restantes.map(c => c.portion!).sort((a, b) => a.expires_at.localeCompare(b.expires_at))[0]
  const lieu: Lieu = carte.contenu.lieu
  const u = urgence(premiere.expires_at, lieu, maintenant)
  if (u.niveau === 'perime') return { texte: u.mot, encre: u.encre }
  if (new Date(premiere.expires_at).getTime() < momentDuRepas(jour, repas).getTime()) {
    return { texte: 'périme avant ce repas', encre: 'var(--color-ocre)' }
  }
  return lieu === 'frigo' && u.niveau !== 'ok' ? { texte: u.mot, encre: u.encre } : null
}

// ── Le bandeau bleu d'un plat congelé ───────────────────────────────────────


/**
 * Le bandeau d'un plat congelé, sous sa carte ; `''` quand il n'y a rien à dire (le jour est passé).
 *  · aujourd'hui : « C'est pour aujourd'hui : décongèle les 2 wraps au micro-ondes. » ;
 *  · demain, et l'heure de sortir est venue (vingt-quatre heures avant le repas) : la phrase de la fiche du frigo,
 *    mot pour mot ;
 *  · un jour futur : avec un rappel par mail actif, « Mail mardi à 19 h : sortir 2 wraps du congélateur pour la
 *    nuit au frigo. » ; sans rappel (les rappels arrivent au chantier 5), « Pense à sortir les 2 wraps la veille
 *    au soir. ».
 * `n` : combien de barquettes ce repas porte (une par personne). Les mots disent le nombre : « sors-la » pour une seule
 * barquette, « la barquette de petit salé aux lentilles » quand le libellé a plusieurs mots (`partsDuPlat`).
 */
export function phraseDuBandeau(o: {
  jour: string; repas: string; label: string; n: number; rappelActif: boolean; maintenant: Date
}): string {
  const { jour: j, repas, label, n, rappelActif, maintenant } = o
  const ecart = ecartEnJours(j, maintenant)
  if (ecart < 0) return ''
  const les = partsDuPlat(label, n, true)
  if (ecart === 0) return `C’est pour aujourd’hui : décongèle ${les} au micro-ondes.`
  if (ecart === 1 && sortableDes(j, repas).getTime() <= maintenant.getTime()) return noteDeSortie(j, repas, maintenant, n)
  if (rappelActif) {
    const veille = lisLeJour(j)
    veille.setDate(veille.getDate() - 1)
    const quand = ecart === 1 ? 'ce soir' : JOUR_ENTIER[veille.getDay()]
    return `Mail ${quand} à 19 h : sortir ${partsDuPlat(label, n)} du congélateur pour la nuit au frigo.`
  }
  return `Pense à sortir ${les} la veille au soir.`
}

// ── Les parts libres, et le choix de la part de chacun ──────────────────────

/** Le repas qu'on est en train de remplir : les cases de ces personnes ne retiennent pas leur part. */
export type Cible = { jour: string; repas: string; personnes: string[] }

/** Les repas posés, sans ceux que la cible va remplacer : la part d'un repas qu'on change redevient candidate. */
export function sansLaCible(prevus: Prevu[], cible: Cible): Prevu[] {
  return prevus.filter(r => !(r.day === cible.jour && r.meal === cible.repas && cible.personnes.includes(r.user_profile_id)))
}

/** Les parts du plat qu'un repas peut prendre : libres (aucun repas à venir ne les réclame), hors la cible. */
export function libresPourLeChoix<P extends Part>(g: Groupe<P>, prevus: Prevu[], cible: Cible, maintenant: Date): P[] {
  return partsLibres(g, sansLaCible(prevus, cible), maintenant)
}

/**
 * Qui reçoit quelle part, comme le fait la base (`choisir_un_repas`, 0123 et 0125) : d'abord celles qui seront encore
 * bonnes à l'heure du repas (`moment` ; sans lui, toutes), puis, faute de mieux, celles qui périment avant — et pour
 * chacune de ces deux fournées, dans cet ordre : la part que la case de la personne porte déjà, puis une part POUR ELLE
 * (`for_user_id`), puis une pour personne, puis celle d'un autre en dernier recours ; à égalité la plus pressée d'abord.
 * Les passes se font toutes personnes confondues : la part de Thauba ne part pas chez Kamil tant qu'il en reste une
 * pour Kamil. `null` quand il n'y en a pas assez pour tout le monde (la base refuserait, sans rien écrire).
 */
export function choisirLesParts<P extends Part>(
  libres: P[], personnes: string[], dejaPosees: Record<string, string> = {}, moment?: Date,
): Map<string, P> | null {
  const ordre = [...libres].sort((a, b) => a.expires_at.localeCompare(b.expires_at) || a.id.localeCompare(b.id))
  const pris = new Map<string, P>()
  const dispo = new Set(ordre.map(p => p.id))
  const passes: ((p: P, u: string) => boolean)[] = [
    (p, u) => p.id === dejaPosees[u],
    (p, u) => p.for_user_id === u,
    p => (p.for_user_id ?? null) === null,
    () => true,
  ]
  const bonne = (p: P) => !moment || new Date(p.expires_at).getTime() >= moment.getTime()
  for (const exigeBonne of moment ? [true, false] : [false]) {
    for (const passe of passes) {
      for (const u of [...personnes].sort()) {
        if (pris.has(u)) continue
        const p = ordre.find(x => dispo.has(x.id) && (!exigeBonne || bonne(x)) && passe(x, u))
        if (p) { pris.set(u, p); dispo.delete(p.id) }
      }
    }
  }
  return pris.size === personnes.length ? pris : null
}

/** Les parts que ces cases portent déjà (« personne » → « part »), tirées des repas posés : ce que la base reprend en premier. */
export function dejaPosees(prevus: Prevu[], cible: Cible): Record<string, string> {
  const r: Record<string, string> = {}
  for (const p of prevus) {
    if (p.day === cible.jour && p.meal === cible.repas && p.portion_id && cible.personnes.includes(p.user_profile_id)) {
      r[p.user_profile_id] = p.portion_id
    }
  }
  return r
}

export type ChoixDuFrigo<P extends Part = Part> = {
  groupe: Groupe<P>
  libres: P[]
}

/** Les plats d'un lieu, ceux qui ont des parts libres d'abord, le plus pressé (sa part libre la plus pressée) en tête. */
export function ordonneLesChoix<P extends Part>(choix: ChoixDuFrigo<P>[]): ChoixDuFrigo<P>[] {
  const premiere = (c: ChoixDuFrigo<P>) => c.libres.length === 0 ? '9' : `0${[...c.libres].map(p => p.expires_at).sort()[0]}`
  return [...choix].sort((a, b) => premiere(a).localeCompare(premiere(b))
    || a.groupe.label.localeCompare(b.groupe.label) || a.groupe.cle.localeCompare(b.groupe.cle))
}

/** « 2 libres », « 1 libre », « 0 libre » : ce qu'il reste à choisir, à droite de la ligne. */
export function resteLibre(n: number): string {
  return `${n} libre${n > 1 ? 's' : ''}`
}

/**
 * Ce que dit la ligne d'un plat du frigo : quand il faut le manger (« à manger avant jeudi »), ou qu'il périme avant
 * ce repas. `encre` : la couleur du mot.
 */
export function detailDuFrigo(
  libres: Part[], cible: Cible, maintenant: Date,
): { texte: string; urgent: boolean } {
  if (libres.length === 0) return { texte: 'déjà choisi pour d’autres repas', urgent: false }
  /* Un repas passé : la barquette sort du frigo, il n'y a plus de délai à tenir. */
  if (ecartEnJours(cible.jour, maintenant) < 0) return { texte: 'sort du frigo', urgent: false }
  const premiere = [...libres].sort((a, b) => a.expires_at.localeCompare(b.expires_at))[0]
  const fin = new Date(premiere.expires_at)
  if (fin.getTime() < momentDuRepas(cible.jour, cible.repas).getTime()) {
    return { texte: 'périme avant ce repas', urgent: true }
  }
  const u = urgence(fin, 'frigo', maintenant)
  return { texte: `à manger ${avant(fin, maintenant) === 'ce soir' ? 'ce soir' : `avant ${avant(fin, maintenant)}`}`, urgent: u.niveau === 'urgent' || u.niveau === 'bientot' }
}

/** Ce que dit la ligne d'un plat congelé : la même heure que le frigo (vingt-quatre heures avant le repas). */
export function detailDuCongele(cible: Cible, maintenant: Date): string {
  if (ecartEnJours(cible.jour, maintenant) < 0) return 'sort du congélateur'
  const des = sortableDes(cible.jour, cible.repas)
  return des.getTime() <= maintenant.getTime() ? 'à sortir maintenant' : `à sortir la veille, dès ${des.getHours()} h`
}

// ── Ce qu'on dit après un changement ────────────────────────────────────────

export type PartLachee = { label: string; location: string }

/**
 * « Les 2 wraps restent au congélateur. » ; « Les 2 barquettes de lasagnes au saumon-poireaux retournent au frigo, libres
 * pour un autre jour. » ; une seule part : « La barquette de petit salé aux lentilles retourne au frigo, libre pour un
 * autre jour. », « Une part de pizza retourne au frigo, libre pour un autre jour. » (un libellé d'un seul mot). Un plat
 * par phrase ; `''` quand rien n'a été lâché.
 */
export function messageDeLiberation(liberees: PartLachee[]): string {
  const par = new Map<string, { label: string; froid: boolean; n: number }>()
  for (const p of liberees) {
    const froid = p.location === 'congelateur'
    const cle = `${p.label}|${froid}`
    const g = par.get(cle) ?? { label: p.label, froid, n: 0 }
    g.n += 1
    par.set(cle, g)
  }
  const majuscule = (t: string) => `${t[0].toUpperCase()}${t.slice(1)}`
  return [...par.values()].map(({ label, froid, n }) => {
    const sujet = n === 1 && unSeulMot(label)
      ? `Une part de ${label.trim().toLowerCase()}` : majuscule(partsDuPlat(label, n, true))
    const pluriel = n > 1
    if (froid) return `${sujet} ${pluriel ? 'restent' : 'reste'} au congélateur.`
    return `${sujet} ${pluriel ? 'retournent' : 'retourne'} au frigo, ${pluriel ? 'libres' : 'libre'} pour un autre jour.`
  }).join(' ')
}

/** Combien de personnes le choix couvre : « Vous deux » (tout le foyer) ou une personne. */
export function personnesDuChoix(pour: 'tous' | string, membres: Membre[]): string[] {
  return pour === 'tous' ? membres.map(m => m.id) : [pour]
}
