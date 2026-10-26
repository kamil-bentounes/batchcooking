/**
 * Le frigo : ce que le frigo américain dit, sans aucune requête.
 *
 * Les barquettes se regroupent en PLATS (une carte par recette, lieu et état), les repas posés dessus se
 * lisent en puces (« mar. midi »), et deux phrases sortent de là : celle de l'afficheur du congélateur (le
 * dîner de ce soir) et celle du magnet du frigo (ce qui presse). Pur, donc éprouvé sans base ni navigateur.
 */
import { jour } from './semaine.ts'
import type { Repas } from './semaine.ts'
import { JOURS_AU_CONGELO, JOURS_AU_FRAIS, jourAbrege, plusDeJours, pourLeFoyer } from './ranger.ts'
import { rayonDe } from './rayons.ts'
import type { Rayon } from './rayons.ts'
import { urgence } from './peremption.ts'
import type { Lieu } from './peremption.ts'

/** Ce que la fiche et les cartes lisent d'une barquette (une ligne de `portion`). */
export type Part = {
  id: string
  recipe_id: string | null
  label: string
  location: string
  state: string
  grams: number | string
  kcal: number | string
  protein_g: number | string
  prepared_at: string
  frozen_at: string | null
  expires_at: string
}

/** Un repas posé sur une barquette : une ligne `meal_slot` encore « prévue ». */
export type Prevu = {
  id: string
  day: string
  meal: string
  user_profile_id: string
  portion_id: string | null
}

export type Groupe<P extends Part = Part> = {
  cle: string
  recipeId: string | null
  label: string
  /** Le nom court, celui des cartes et de l'afficheur. */
  nom: string
  location: Lieu
  state: string
  /** Les plus pressées d'abord. */
  parts: P[]
}

// ── Les noms ────────────────────────────────────────────────────────────────

/**
 * « Lasagnes au saumon-poireaux » → « Lasagnes saumon-poireaux », « Pizza vietnamienne protéinée » →
 * « Pizza vietnamienne » : les cartes et l'afficheur n'ont pas la place du nom entier (la fiche, si).
 */
export function nomCourt(label: string): string {
  const court = label.trim()
    .replace(/\s+(?:au|aux|à la|à l[’'])\s+/i, ' ')
    .replace(/\s+prot[ée]in[ée]e?s?$/i, '')
    .replace(/\s{2,}/g, ' ')
  return court || label.trim()
}

/** « burger » → « burgers » ; « wraps » reste « wraps » ; un seul : pas de s. */
export function motDuPlat(label: string, n: number): string {
  const mot = nomCourt(label).split(/\s+/)[0].toLowerCase()
  return n > 1 && !/[sxz]$/.test(mot) ? `${mot}s` : mot
}

// ── Les groupes ─────────────────────────────────────────────────────────────

/** Les barquettes encore là, regroupées par recette, libellé, lieu et état : une carte par plat. */
export function groupeLesParts<P extends Part>(parts: P[]): Groupe<P>[] {
  const par = new Map<string, Groupe<P>>()
  for (const p of parts) {
    if (p.state !== 'au_frais' && p.state !== 'decongelee') continue
    if (p.location !== 'frigo' && p.location !== 'congelateur') continue
    const cle = [p.recipe_id ?? '', p.label, p.location, p.state].join('|')
    let g = par.get(cle)
    if (!g) {
      g = {
        cle, recipeId: p.recipe_id, label: p.label, nom: nomCourt(p.label),
        location: p.location as Lieu, state: p.state, parts: [],
      }
      par.set(cle, g)
    }
    g.parts.push(p)
  }
  const groupes = [...par.values()]
  for (const g of groupes) g.parts.sort((a, b) => a.expires_at.localeCompare(b.expires_at))
  return groupes.sort((a, b) => a.parts[0].expires_at.localeCompare(b.parts[0].expires_at))
}

// ── Les repas posés ─────────────────────────────────────────────────────────

const MOT_REPAS: Record<string, string> = {
  petit_dejeuner: 'matin', dejeuner: 'midi', diner: 'soir', collation: 'goûter',
}
const JOUR_SEMAINE = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const JOUR_ENTIER = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** « 2026-10-27 » lu en heure locale (jamais `new Date('2026-10-27')`, qui est minuit UTC). */
function lisLeJour(j: string): Date {
  const [a, m, d] = j.split('-').map(Number)
  return new Date(a, m - 1, d)
}

/** Nombre de jours de calendrier entre aujourd'hui et `j` (négatif : passé). */
function ecartEnJours(j: string, maintenant: Date): number {
  const a = lisLeJour(j)
  const b = lisLeJour(jour(maintenant))
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

/**
 * « ce soir », « ce midi », sinon « mar. midi » ; au-delà d'une semaine le quantième lève le doute
 * (« lun. 2 midi »).
 */
export function repasEnMots(j: string, repas: string, maintenant: Date): string {
  const mot = MOT_REPAS[repas] ?? repas
  const ecart = ecartEnJours(j, maintenant)
  if (ecart === 0) return repas === 'diner' ? 'ce soir' : repas === 'dejeuner' ? 'ce midi' : `ce ${mot}`
  const d = lisLeJour(j)
  const jr = ecart > 6 || ecart < 0 ? `${JOUR_SEMAINE[d.getDay()]} ${d.getDate()}` : JOUR_SEMAINE[d.getDay()]
  return `${jr} ${mot}`
}

/** Le repas qu'on est en train de vivre : de quoi poser « j'en mange une maintenant ». */
export function repasEnCours(maintenant: Date): Repas {
  const h = maintenant.getHours()
  return h < 10 ? 'petit_dejeuner' : h < 16 ? 'dejeuner' : 'diner'
}

/** Les repas posés sur les barquettes de ce groupe, dans l'ordre du calendrier. */
export function prevusDe(g: Groupe, prevus: Prevu[]): Prevu[] {
  const ids = new Set(g.parts.map(p => p.id))
  return prevus.filter(r => r.portion_id && ids.has(r.portion_id))
    .sort((a, b) => a.day.localeCompare(b.day) || ordreDuRepas(a.meal) - ordreDuRepas(b.meal))
}

const ordreDuRepas = (m: string) => ['petit_dejeuner', 'dejeuner', 'collation', 'diner'].indexOf(m)

/** Les barquettes du groupe qu'aucun repas ne réclame. */
export function partsLibres<P extends Part>(g: Groupe<P>, prevus: Prevu[]): P[] {
  const posees = new Set(prevus.map(r => r.portion_id))
  return g.parts.filter(p => !posees.has(p.id))
}

/** Les barquettes du groupe posées sur un repas d'aujourd'hui ou de demain. */
export function partsPourBientot<P extends Part>(
  g: Groupe<P>, prevus: Prevu[], maintenant: Date, jusquaDemain = true,
): P[] {
  const limite = jusquaDemain ? 1 : 0
  const ids = new Set(prevus
    .filter(r => { const e = ecartEnJours(r.day, maintenant); return e >= 0 && e <= limite })
    .map(r => r.portion_id))
  return g.parts.filter(p => ids.has(p.id))
}

/**
 * « Prévues pour vous deux » / « Prévues pour Kamil » et les puces qui vont avec.
 * Quand les repas n'ont pas tous le même public, la puce le dit (« mar. midi · Kamil ») et le titre reste
 * « Prévues ».
 */
export function prevuesPour(
  g: Groupe, prevus: Prevu[], membres: { id: string; prenom: string }[], maintenant: Date,
): { titre: string; puces: string[] } {
  const mes = prevusDe(g, prevus)
  const accord = g.parts.length > 1 ? 'Prévues' : 'Prévue'
  if (mes.length === 0) return { titre: accord, puces: [] }
  const parRepas = new Map<string, { j: string; m: string; qui: Set<string> }>()
  for (const r of mes) {
    const k = `${r.day}|${r.meal}`
    if (!parRepas.has(k)) parRepas.set(k, { j: r.day, m: r.meal, qui: new Set() })
    parRepas.get(k)!.qui.add(r.user_profile_id)
  }
  const repas = [...parRepas.values()]
  const tous = membres.length
  const nom = (id: string) => membres.find(m => m.id === id)?.prenom ?? 'quelqu’un'
  const memePublic = repas.every(r => r.qui.size === repas[0].qui.size
    && [...r.qui].every(q => repas[0].qui.has(q)))
  if (memePublic) {
    const qui = [...repas[0].qui]
    const pour = qui.length >= tous && tous > 1
      ? ['', '', 'vous deux', 'vous trois', 'vous quatre'][tous] ?? `vous ${tous}`
      : qui.map(nom).join(' et ')
    return {
      titre: `${accord} pour ${pour}`,
      puces: repas.map(r => repasEnMots(r.j, r.m, maintenant)),
    }
  }
  return {
    titre: accord,
    puces: repas.map(r => {
      const publicDuRepas = r.qui.size >= tous ? '' : ` · ${[...r.qui].map(nom).join(' et ')}`
      return `${repasEnMots(r.j, r.m, maintenant)}${publicDuRepas}`
    }),
  }
}

// ── Ce que disent les cartes ────────────────────────────────────────────────

/** `encre` : la couleur du texte (l'urgence, ou l'ocre d'un geste à faire, ou le doux d'un repos). */
export type Quand = { texte: string; encre: string }

const OCRE = 'var(--color-ocre)'
const DOUX = 'var(--color-doux)'
const GLACE = 'var(--color-congel-encre)'

/** La ligne sous le nom d'une carte : le plus pressé d'abord, puis ce qui est prévu, puis l'urgence. */
export function quand(g: Groupe, prevus: Prevu[], maintenant: Date): Quand {
  const mes = prevusDe(g, prevus)
  const u = urgence(g.parts[0].expires_at, g.location, maintenant)
  if (g.location === 'congelateur') {
    const bientot = mes.filter(r => { const e = ecartEnJours(r.day, maintenant); return e >= 0 && e <= 1 })
    if (bientot.length > 0) {
      const r = bientot[0]
      const aujourdhui = ecartEnJours(r.day, maintenant) === 0
      const mots = repasEnMots(r.day, r.meal, maintenant)
      return {
        texte: aujourdhui
          ? `${mots[0].toUpperCase()}${mots.slice(1)} : à sortir maintenant`
          : 'Demain : à sortir ce soir',
        encre: OCRE,
      }
    }
  }
  const libres = partsLibres(g, prevus).length
  if (g.location === 'frigo' && libres > 0 && u.niveau !== 'ok') {
    return { texte: u.mot, encre: u.encre }
  }
  if (mes.length > 0) {
    const premier = repasEnMots(mes[0].day, mes[0].meal, maintenant)
    const dernier = repasEnMots(mes[mes.length - 1].day, mes[mes.length - 1].meal, maintenant)
    return { texte: premier === dernier ? premier : `${premier} → ${dernier}`, encre: g.location === 'congelateur' ? GLACE : DOUX }
  }
  return { texte: u.mot, encre: u.niveau !== 'ok' ? u.encre : g.location === 'congelateur' ? GLACE : DOUX }
}

/** Le texte lu par un lecteur d'écran sur la carte : « Lasagnes, 6 parts, mar. midi → mer. midi ». */
export function ariaDeCarte(g: Groupe, q: Quand): string {
  const n = g.parts.length
  return `${g.nom}, ${n} part${n > 1 ? 's' : ''}, ${q.texte}`
}

// ── La porte gauche : l'afficheur ───────────────────────────────────────────

export type Afficheur = { titre: string; plat: string | null }

/** Ce que l'afficheur du congélateur dit : le dîner de ce soir pour cette personne, ou rien. */
export function afficheur(prevus: Prevu[], parts: Part[], moi: string, maintenant: Date): Afficheur {
  const j = jour(maintenant)
  const mien = prevus.find(r => r.user_profile_id === moi && r.day === j && r.meal === 'diner' && r.portion_id)
  const part = mien && parts.find(p => p.id === mien.portion_id)
  return part
    ? { titre: 'Ce soir', plat: nomCourt(part.label) }
    : { titre: 'Rien de prévu ce soir', plat: null }
}

// ── La porte droite : le magnet ─────────────────────────────────────────────

export type Magnet = { texte: string; sorsLesAujourdhui: boolean }

/**
 * Le plus pressé, et un seul :
 *  1. des barquettes congelées posées sur un repas d'aujourd'hui ou de demain : « Sors les 2 burgers :
 *     c'est ce soir » (c'est ce qui se fait la veille) ;
 *  2. sinon, des barquettes du frigo qui périment sous 72 h et que rien ne réclame : « 2 pizzas à prévoir
 *     avant jeudi » ;
 *  3. sinon rien : pas de magnet.
 */
export function magnet(parts: Part[], prevus: Prevu[], maintenant: Date): Magnet | null {
  const groupes = groupeLesParts(parts)
  const congeles = groupes.filter(g => g.location === 'congelateur')
    .map(g => ({ g, bientot: partsPourBientot(g, prevus, maintenant) }))
    .filter(x => x.bientot.length > 0)
    .map(x => {
      const jours = prevus.filter(r => x.bientot.some(p => p.id === r.portion_id))
        .map(r => ecartEnJours(r.day, maintenant))
      return { ...x, plusTot: Math.min(...jours) }
    })
    .sort((a, b) => a.plusTot - b.plusTot)
  if (congeles.length > 0) {
    const { g, bientot, plusTot } = congeles[0]
    const n = bientot.length
    return {
      texte: `Sors ${n > 1 ? `les ${n}` : '1'} ${motDuPlat(g.label, n)} : c’est ${plusTot === 0 ? 'ce soir' : 'demain'}`,
      sorsLesAujourdhui: plusTot === 0,
    }
  }
  const limite = maintenant.getTime() + 72 * 3_600_000
  const presses = groupes.filter(g => g.location === 'frigo')
    .map(g => ({
      g,
      libres: partsLibres(g, prevus).filter(p => {
        const t = new Date(p.expires_at).getTime()
        return t <= limite
      }),
    }))
    .filter(x => x.libres.length > 0)
    .sort((a, b) => a.libres[0].expires_at.localeCompare(b.libres[0].expires_at))
  if (presses.length > 0) {
    const { g, libres } = presses[0]
    const n = libres.length
    return { texte: `${n} ${motDuPlat(g.label, n)} à prévoir avant ${avant(new Date(libres[0].expires_at), maintenant)}`, sorsLesAujourdhui: false }
  }
  return null
}

/** « ce soir », « demain », ou le jour de la semaine : « avant jeudi ». */
function avant(fin: Date, maintenant: Date): string {
  const e = ecartEnJours(jour(fin), maintenant)
  if (e <= 0) return 'ce soir'
  if (e === 1) return 'demain'
  return JOUR_ENTIER[fin.getDay()]
}

// ── La fiche ────────────────────────────────────────────────────────────────

/** « C'est pour ce soir : … » quand des barquettes encore congelées sont posées sur un repas d'aujourd'hui. */
export const NOTE_DU_SOIR =
  'C’est pour ce soir : sors-les maintenant, ou passe-les au micro-ondes avant de manger.'

export function noteDeLaFiche(g: Groupe, prevus: Prevu[], maintenant: Date): string {
  return g.location === 'congelateur' && partsPourBientot(g, prevus, maintenant, false).length > 0
    ? NOTE_DU_SOIR : ''
}

/** « 784 g, 682 kcal et 56 g de protéines la part » (la moyenne du groupe). */
export function macrosDuGroupe(g: Groupe): string {
  const n = g.parts.length
  const moy = (cle: 'grams' | 'kcal' | 'protein_g') =>
    Math.round(g.parts.reduce((s, p) => s + Number(p[cle]), 0) / n)
  return `${moy('grams')} g, ${moy('kcal')} kcal et ${moy('protein_g')} g de protéines la part`
}

/**
 * La date de péremption que la base poserait (`tg_portion_peremption`, migration 0047) : quatre jours après
 * la préparation au frigo, quatre-vingt-dix après la mise au congélateur. Le front la recalcule quand on
 * corrige « Au frigo depuis » ou « Congelés le », exactement comme le ferait le trigger à l'insertion — un
 * UPDATE, lui, ne touche pas à `expires_at` si on la lui donne.
 *
 * Une barquette DÉCONGELÉE ne suit pas cette règle (elle se mange dans les 24 h de la décongélation, pas
 * quatre jours après la préparation) : `null`, on ne recalcule rien.
 */
export function peremptionApres(lieu: Lieu, etat: string, debut: Date): Date | null {
  if (lieu === 'congelateur') return plusDeJours(debut, JOURS_AU_CONGELO)
  if (etat === 'decongelee') return null
  return plusDeJours(debut, JOURS_AU_FRAIS)
}

/** La ligne « À manger avant » : la date, et au frigo ce qu'en dit l'urgence (« jeu. 29 oct., encore 3 jours »). */
export function auPlusTard(g: Groupe, maintenant: Date): string {
  const fin = new Date(g.parts[0].expires_at)
  const date = jourAbrege(fin)
  return g.location === 'frigo' ? `${date}, ${urgence(fin, 'frigo', maintenant).mot}` : date
}

/** Les parts à bouger pour « Congeler » ou « Jeter » : les libres d'abord, puis celles posées le plus tard. */
export function partsAChoisir<P extends Part>(g: Groupe<P>, prevus: Prevu[], n: number): P[] {
  const libres = partsLibres(g, prevus)
  const dernier = new Map<string, string>()
  for (const r of prevus) {
    if (!r.portion_id) continue
    const v = `${r.day}|${ordreDuRepas(r.meal)}`
    if (!dernier.has(r.portion_id) || v > dernier.get(r.portion_id)!) dernier.set(r.portion_id, v)
  }
  const posees = g.parts.filter(p => dernier.has(p.id))
    .sort((a, b) => dernier.get(b.id)!.localeCompare(dernier.get(a.id)!))
  return [...libres, ...posees].slice(0, n)
}

/**
 * Les parts à sortir du congélateur : celles posées sur un repas d'aujourd'hui ou de demain si il y en a ;
 * sinon `null` (c'est à la personne de dire combien).
 */
export function partsASortir<P extends Part>(
  g: Groupe<P>, prevus: Prevu[], maintenant: Date,
): P[] | null {
  const bientot = partsPourBientot(g, prevus, maintenant)
  return bientot.length > 0 ? bientot : null
}

// ── Les ingrédients ─────────────────────────────────────────────────────────

export type Etagere = 'Laitages et frais' | 'Viandes et poissons' | 'Autres' | 'Bac à légumes'

const LAITAGE = /yaourt|yogourt|skyr|fromage|\blaits?\b|crème|creme|beurre|œuf|oeuf|faisselle|kéfir|kefir|mozzarella|jambon|lardon/i

/**
 * L'étagère d'un ingrédient du frigo : le rayon du magasin (`rayonDe`) dit où il vit — les laitages et le
 * frais ensemble, la viande et le poisson, le reste — et les fruits et légumes vont au bac.
 * Un yaourt sans aliment connu n'a pas de groupe : son nom le range (« Yaourts dessert protéinés »).
 */
export function etagereDe(
  item: { label: string; groupe?: string | null; sousGroupe?: string | null },
): Etagere {
  let rayon: Rayon = rayonDe({ groupe: item.groupe, sousGroupe: item.sousGroupe, libelle: item.label })
  if (rayon === 'Autre' && LAITAGE.test(item.label)) rayon = 'Frais'
  if (rayon === 'Frais') return 'Laitages et frais'
  if (rayon === 'Boucherie, poissonnerie') return 'Viandes et poissons'
  if (rayon === 'Fruits et légumes') return 'Bac à légumes'
  return 'Autres'
}

export const ORDRE_DES_ETAGERES: Etagere[] = ['Laitages et frais', 'Viandes et poissons', 'Autres', 'Bac à légumes']

/** « 8 parts prêtes, et des yaourts » : le sous-titre de l'intérieur du frigo. */
export function soustitreDuFrigo(parts: number, ingredients: number): string {
  const p = parts > 0 ? `${parts} part${parts > 1 ? 's' : ''} prête${parts > 1 ? 's' : ''}` : ''
  const i = ingredients > 0 ? `${ingredients} ingrédient${ingredients > 1 ? 's' : ''}` : ''
  if (p && i) return `${p}, et ${i}`
  return p || i || 'Vide pour l’instant'
}

/** « 22 parts, jusqu'en janvier » : le sous-titre de l'intérieur du congélateur. */
export function soustitreDuCongelo(parts: number, plusTard: Date | null): string {
  if (parts === 0) return 'Vide pour l’instant'
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre',
    'octobre', 'novembre', 'décembre']
  return `${parts} part${parts > 1 ? 's' : ''}${plusTard ? `, jusqu’en ${mois[plusTard.getMonth()]}` : ''}`
}

// ── Pour qui ────────────────────────────────────────────────────────────────

/**
 * « vous deux », « toi », « Thauba », « Kamil et Thauba » : pour qui un repas est posé, vu de `moi`.
 * Tout le foyer (à plusieurs) se dit comme `pourLeFoyer`.
 */
export function pourQui(
  convives: string[], membres: { id: string; prenom: string }[], moi: string,
): string {
  const ids = [...new Set(convives)]
  if (ids.length > 1 && ids.length >= membres.length) return pourLeFoyer(membres.length)
  if (ids.length === 1) return ids[0] === moi ? 'toi' : membres.find(m => m.id === ids[0])?.prenom ?? 'quelqu’un'
  return ids.map(i => membres.find(m => m.id === i)?.prenom ?? 'quelqu’un').join(' et ')
}

/** Les repas d'un jour dits comme « midi et soir », « midi », « soir » (dans l'ordre de la journée). */
export function repasDuJour(repas: string[]): string {
  const ordre = ['petit_dejeuner', 'dejeuner', 'collation', 'diner']
  const mots = [...new Set(repas)].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b))
    .map(r => MOT_REPAS[r] ?? r)
  return mots.length > 1 ? `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}` : mots[0] ?? ''
}

// ── Les couleurs de ce qui n'a pas de photo ─────────────────────────────────

const TEINTES = ['#EADBC2', '#F1E2C6', '#F6EAD2', '#E6DCCF', '#EFE3CB']
/** Le fond d'un plat sans photo : une teinte chaude, toujours la même pour le même nom. */
export function fondDuPlat(label: string): string {
  let h = 0
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TEINTES[h % TEINTES.length]
}

