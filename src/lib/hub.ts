/**
 * Ce que le hub dit de la journée : des phrases et des regroupements, sans aucune requête.
 *
 * Tout vient de lectures que l'appli fait déjà (les cases de la semaine, les barquettes, les repas posés, la date
 * d'arrivée) ; rien n'est inventé ici. Pur, donc éprouvé sans base ni navigateur (`hub.test.ts`).
 */
import type { Case } from './donnees/barquettes.ts'
import { JOUR_ENTIER, ecartEnJours, lisLeJour, momentDuRepas, ordreDuRepas, sortableDes } from './frigo.ts'
import type { Prevu } from './frigo.ts'
import { jour } from './semaine.ts'

const MOT_REPAS: Record<string, string> = {
  petit_dejeuner: 'matin', dejeuner: 'midi', collation: 'goûter', diner: 'soir',
}
const mot = (repas: string) => MOT_REPAS[repas] ?? repas
const majuscule = (t: string) => (t ? `${t[0].toUpperCase()}${t.slice(1)}` : t)
const trie = (repas: string[]) => [...new Set(repas)].sort((a, b) => ordreDuRepas(a) - ordreDuRepas(b))
const enListe = (mots: string[]) =>
  mots.length > 1 ? `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}` : (mots[0] ?? '')

// ── La phrase sous la date ──────────────────────────────────────────────────

/**
 * « La semaine tourne : 30 barquettes, dont 8 au frigo. » : le geste du cycle, puis ce qu'il y a dans le frigo.
 * Appelée une fois les barquettes LUES : « aucune barquette » dit avant leur retour serait un mensonge.
 */
export function phraseDeLaSemaine(titre: string, lieux: string[]): string {
  const n = lieux.length
  const frigo = lieux.filter(l => l === 'frigo').length
  const s = n > 1 ? 's' : ''
  const compte = n === 0 ? 'aucune barquette'
    : frigo === 0 ? `${n} barquette${s}, ${n > 1 ? 'aucune au frigo' : 'au congélateur'}`
    : frigo === n ? `${n} barquette${s}, ${n > 1 ? 'toutes au frigo' : 'au frigo'}`
    : `${n} barquettes, dont ${frigo} au frigo`
  return `${titre} : ${compte}.`
}

// ── Le moment d'un repas ────────────────────────────────────────────────────

/** « Ce midi », « Ce midi et ce soir » : les repas d'aujourd'hui. */
export function quandAujourdhui(repas: string[]): string {
  return majuscule(enListe(trie(repas).map(r => `ce ${mot(r)}`)))
}

/**
 * « Ce soir », « Demain midi », « Jeudi, midi et soir » : le moment d'un ou plusieurs repas d'un même jour.
 * Le jour de la semaine suffit dans la semaine qui vient ; au-delà, le quantième lève le doute.
 */
export function quandDuRepas(jourDit: string, repas: string[], maintenant: Date): string {
  const ecart = ecartEnJours(jourDit, maintenant)
  if (ecart <= 0) return quandAujourdhui(repas)
  const d = lisLeJour(jourDit)
  const jr = ecart === 1 ? 'Demain'
    : ecart > 6 ? `${majuscule(JOUR_ENTIER[d.getDay()])} ${d.getDate()}`
    : majuscule(JOUR_ENTIER[d.getDay()])
  const ms = trie(repas)
  return ms.length > 1 ? `${jr}, ${enListe(ms.map(mot))}` : `${jr} ${mot(ms[0])}`
}

/** « à sortir mercredi » : le jour où sortir du congélateur ce qui se mange ce repas (24 h avant, `sortableDes`). */
export function pastilleASortir(jourDit: string, repas: string, maintenant: Date): string {
  const des = sortableDes(jourDit, repas)
  if (des.getTime() <= maintenant.getTime()) return 'à sortir maintenant'
  if (ecartEnJours(jourDit, maintenant) <= 1) return `à sortir dès ${des.getHours()} h`
  return `à sortir ${JOUR_ENTIER[des.getDay()]}`
}

// ── Ce qui vient ────────────────────────────────────────────────────────────

export type RangeeAVenir = {
  cle: string
  day: string
  repas: string[]
  label: string
  recipeId: string | null
  /** « Demain midi », « Jeudi, midi et soir ». */
  quand: string
  /** « à sortir mercredi » quand les parts dorment au congélateur, sinon `null`. */
  pastille: string | null
}

/**
 * Les prochains repas posés POUR MOI, une ligne par plat et par jour (« Jeudi, midi et soir »), les plus proches
 * d'abord. `exclus` : les cases que la carte du jour dit déjà.
 */
export function ceQuiVient(
  cases: Case[], moi: string, maintenant: Date, o: { exclus?: Set<string>; max?: number } = {},
): RangeeAVenir[] {
  const aujourdhui = jour(maintenant)
  const mes = cases
    .filter(c => c.user_profile_id === moi && c.state === 'prevu' && c.portion && c.day >= aujourdhui
      && !o.exclus?.has(c.id))
    .sort((a, b) => a.day.localeCompare(b.day) || ordreDuRepas(a.meal) - ordreDuRepas(b.meal) || a.id.localeCompare(b.id))
  const lignes: { day: string; label: string; recipeId: string | null; repas: string[]; froid: boolean }[] = []
  for (const c of mes) {
    const p = c.portion!
    const dernier = lignes[lignes.length - 1]
    if (dernier && dernier.day === c.day && dernier.label === p.label && dernier.recipeId === p.recipe_id) {
      if (!dernier.repas.includes(c.meal)) dernier.repas.push(c.meal)
    } else {
      lignes.push({ day: c.day, label: p.label, recipeId: p.recipe_id, repas: [c.meal], froid: p.location === 'congelateur' })
    }
  }
  return lignes.slice(0, o.max ?? 3).map(l => ({
    cle: `${l.day}|${l.repas.join('+')}|${l.label}`,
    day: l.day, repas: l.repas, label: l.label, recipeId: l.recipeId,
    quand: quandDuRepas(l.day, l.repas, maintenant),
    pastille: l.froid ? pastilleASortir(l.day, trie(l.repas)[0], maintenant) : null,
  }))
}

// ── La note de la carte du jour ─────────────────────────────────────────────

/** Une note dont un morceau se met en valeur : « Elles périment <b>jeudi soir</b> : … ». */
export type Note = { debut: string; fort?: string; fin?: string }

/** « ce soir », « demain soir », « jeudi soir » : le moment où une part périme. */
export function momentDePeremption(fin: Date, maintenant: Date): string {
  const h = fin.getHours()
  const ecart = ecartEnJours(jour(fin), maintenant)
  if (ecart <= 0) return h < 12 ? 'ce matin' : h < 18 ? 'cet après-midi' : 'ce soir'
  const periode = h < 12 ? 'matin' : h < 18 ? 'après-midi' : 'soir'
  return `${ecart === 1 ? 'demain' : JOUR_ENTIER[fin.getDay()]} ${periode}`
}

/**
 * Ce que le frigo sait du plat de la carte : combien de parts, quand elles périment, et — quand chaque part est
 * réclamée par un repas — lequel finit le plat. `null` quand il n'y a rien à en dire (aucune part au frigo).
 */
export function noteDuPlat(
  parts: { id: string; expires_at: string }[], reclames: Prevu[], maintenant: Date,
): Note | null {
  const n = parts.length
  if (n === 0) return null
  const debut = `Au frigo, ${n} part${n > 1 ? 's' : ''}.`
  const perimees = parts.filter(p => new Date(p.expires_at).getTime() <= maintenant.getTime()).length
  if (perimees > 0) {
    return { debut: `${debut} ${perimees === n ? (n > 1 ? 'Elles sont périmées.' : 'Elle est périmée.')
      : `${perimees} ${perimees > 1 ? 'sont périmées' : 'est périmée'}.`}` }
  }
  const premiere = parts.map(p => new Date(p.expires_at)).sort((a, b) => a.getTime() - b.getTime())[0]
  const ids = new Set(parts.map(p => p.id))
  const mes = reclames.filter(r => r.portion_id && ids.has(r.portion_id))
    .sort((a, b) => a.day.localeCompare(b.day) || ordreDuRepas(a.meal) - ordreDuRepas(b.meal))
  const dernier = mes[mes.length - 1]
  /* Le plat est fini quand chaque part a son repas, et que le dernier tombe avant la péremption. */
  const fini = mes.length === n && dernier !== undefined
    && momentDuRepas(dernier.day, dernier.meal).getTime() <= premiere.getTime()
  return {
    debut: `${debut} ${n > 1 ? 'Elles périment' : 'Elle périme'} `,
    fort: momentDePeremption(premiere, maintenant),
    fin: fini ? ` : ${quandDuRepas(dernier.day, [dernier.meal], maintenant).toLowerCase()} finit le plat.` : '.',
  }
}

// ── Le budget ───────────────────────────────────────────────────────────────

/** Les jours qui restent avant le premier jour du mois d'arrivée (`entre_le`) : « 2026-11-15 » compte jusqu'au 1er novembre. */
export function joursAvantLArrivee(entreLe: string, aujourdhui: string): number {
  const premier = lisLeJour(`${entreLe.slice(0, 7)}-01`)
  return Math.round((premier.getTime() - lisLeJour(aujourdhui).getTime()) / 86_400_000)
}

/** « Dans 5 jours », « Demain » : la pastille du compte à rebours. */
export function pastilleDuCompteARebours(jours: number): string {
  return jours <= 1 ? 'Demain' : `Dans ${jours} jours`
}

/**
 * La barre charges / reste. Sans revenu (`reste` nul) ou sans rien à comparer, pas de barre : une barre vide ou
 * pleine d'office ne dirait rien de vrai. Un reste négatif ne se dessine pas (il se lit : « Il te manque »).
 */
export function barreDuBudget(charges: number, reste: number | null): { charges: number; reste: number } | null {
  if (reste === null) return null
  const c = Math.max(charges, 0)
  const r = Math.max(reste, 0)
  return c + r > 0 ? { charges: c, reste: r } : null
}

/** La ligne de suite du budget, en deux mots pour la tuile du téléphone (la phrase entière reste à `ligneDuHub`). */
export function pastilleDeSuite(o: { aCloturer: string | null; aDire: number; nomDuMois: (iso: string) => string }): string {
  if (o.aCloturer) return `${majuscule(o.nomDuMois(o.aCloturer))} à clôturer`
  return o.aDire > 0 ? `${o.aDire} à dire` : 'À jour'
}
