/**
 * Les foyers des bancs du budget.
 *
 * La préparation passe par la clé de service, JAMAIS par le client : un banc
 * doit dire si une règle tient, pas échouer parce qu'une autre règle refuse la
 * mise en place. Le client n'agit que pour le geste qu'on éprouve.
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { admin, makeActor, type Actor } from './db'

export type Foyer = Actor & { compte: string }
type Mode = 'fixe' | 'facture' | 'au_fil' | 'mis_de_cote'

/** Lève si la base refuse : une préparation ratée ne passe pas en silence. */
export function ou<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

/**
 * Un foyer d'une personne, arrivée le 1er janvier 2026, payée depuis
 * septembre : la forme du foyer de Kamil au 01/10/2026.
 *
 * Le revenu se pose AVANT la date d'arrivée. Premier revenu d'un membre, il
 * remonterait sinon au mois de son arrivée (0103) ; Kamil l'a posé avant que
 * cette règle existe, et c'est son état qu'on reproduit.
 */
export async function foyerSolo(nom: string, o: {
  revenu?: number | null; depuis?: string; arrivee?: string
} = {}): Promise<Foyer> {
  const a = await makeActor(nom)
  if (o.revenu !== null) {
    ou(await admin().from('revenu').insert({
      household_id: a.householdId, user_profile_id: a.userId,
      net_mensuel_cents: o.revenu ?? 432_500, valid_from: o.depuis ?? '2026-09-01',
    }).select())
  }
  ou(await admin().from('user_profile').update({ entre_le: o.arrivee ?? '2026-01-01' })
    .eq('id', a.userId).select())
  const c = ou(await admin().from('compte').insert({
    household_id: a.householdId, nom: 'Commun', genre: 'commun',
  }).select().single()) as { id: string }
  return { ...a, compte: c.id }
}

/** Un second membre dans le même foyer, avec son propre client connecté. */
export async function membre(f: { householdId: string }, nom: string, o: {
  arrivee?: string; revenu?: number; depuis?: string
} = {}): Promise<Actor> {
  const email = `${nom}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`
  const mdp = 'test-password-12345'
  const u = ou(await admin().auth.admin.createUser({ email, password: mdp, email_confirm: true }))
  ou(await admin().from('user_profile').insert({
    id: u.user!.id, household_id: f.householdId, display_name: nom,
    entre_le: o.arrivee ?? '2026-01-01',
  }).select())
  if (o.revenu !== undefined) {
    ou(await admin().from('revenu').insert({
      household_id: f.householdId, user_profile_id: u.user!.id,
      net_mensuel_cents: o.revenu, valid_from: o.depuis ?? '2026-09-01',
    }).select())
  }
  const client = createClient(process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: mdp })
  if (error) throw error
  return { client, userId: u.user!.id, householdId: f.householdId, email }
}

/** Une charge et ses participants (lui seul, par défaut). */
export async function poseCharge(f: { householdId: string; userId: string; compte?: string }, o: {
  libelle: string; cents: number; mode?: Mode
  periodicite?: 'mensuel' | 'trimestriel' | 'annuel'
  categorie?: string; commun?: boolean; debut?: string; participants?: string[]
}): Promise<string> {
  const c = ou(await admin().from('charge').insert({
    household_id: f.householdId, libelle: o.libelle, montant_cents: o.cents,
    mode: o.mode ?? 'fixe',
    periodicite: o.periodicite ?? (o.mode === 'mis_de_cote' ? 'annuel' : 'mensuel'),
    categorie: o.categorie ?? 'autre', commun: o.commun ?? false,
    debut: o.debut ?? '2026-01-01', compte_id: f.compte ?? null,
  }).select().single()) as { id: string }
  ou(await admin().from('charge_participant').insert(
    (o.participants ?? [f.userId]).map(u => ({
      charge_id: c.id, user_profile_id: u, household_id: f.householdId,
    }))).select())
  return c.id
}

/** Ouvre un mois comme l'écran le fait : par le client. */
export async function ouvre(a: Actor, mois: string) {
  ou(await a.client.rpc('ouvre_le_mois', { le_mois: mois }))
}

/** Ouvre les douze mois d'une charge, comme `regularise_annuel` le faisait. */
export async function ouvreLAnnee(a: Actor, charge: string, annee: number) {
  for (let m = 1; m <= 12; m++) {
    ou(await a.client.rpc('ouvre_la_charge', {
      la_charge: charge, foyer: a.householdId,
      le_mois: `${annee}-${String(m).padStart(2, '0')}-01`,
    }))
  }
}

export type LigneLue = {
  id: string; mois: string; libelle: string; montant_cents: number
  montant_prevu_cents: number | null; facon: Mode | null; nature: string
  source: string; confirme_le: string | null; regularise_annee: number | null
  depense_part: { user_profile_id: string; part_cents: number }[]
}
const COLONNES = 'id, mois, libelle, montant_cents, montant_prevu_cents, facon, nature, '
  + 'source, confirme_le, regularise_annee, depense_part(user_profile_id, part_cents)'

/** La ligne `modele` d'une charge pour un mois, ou null. */
export async function ligne(charge: string, mois: string): Promise<LigneLue | null> {
  const r = await admin().from('depense').select(COLONNES)
    .eq('charge_id', charge).eq('mois', mois).eq('source', 'modele').maybeSingle()
  return ou(r) as LigneLue | null
}

/** Les ajustements d'une charge (lignes `manuel` qui portent une année). */
export async function ajustements(charge: string): Promise<LigneLue[]> {
  return ou(await admin().from('depense').select(COLONNES).eq('charge_id', charge)
    .eq('source', 'manuel').order('created_at')) as LigneLue[]
}

/** Un mois marqué clôturé SANS passer par la clôture : pour éprouver le gel seul. */
export async function clos(f: { householdId: string }, mois: string) {
  ou(await admin().from('cloture').insert({
    household_id: f.householdId, mois, cloture_le: new Date().toISOString(),
  }).select())
}

/** Une dépense déclarée par ce membre ; rend la réponse de la base. */
export async function declare(a: Actor, depense: string, faitLe: string, cents: number,
  id: string = randomUUID()) {
  return a.client.from('saisie').insert({
    id, household_id: a.householdId, depense_id: depense, fait_le: faitLe,
    montant_cents: cents, saisi_par: a.userId,
  }).select()
}

/**
 * Une année soldée comme la migration les laisse : le relevé, avec son prévu
 * figé, et la facture qui le porte. On ouvre les mois AVANT : une fois l'année
 * soldée, plus aucun n'y naît.
 */
export async function soldeEnAdmin(f: { householdId: string; userId: string }, charge: string,
  annee: number, o: { reel: number; prevu: number }) {
  ou(await admin().from('releve_annuel').insert({
    household_id: f.householdId, charge_id: charge, annee, reel_cents: o.reel,
    prevu_cents: o.prevu, ecart_cents: o.reel - o.prevu, saisi_par: f.userId,
  }).select())
  ou(await admin().from('facture').insert({
    id: randomUUID(), household_id: f.householdId, charge_id: charge, annee,
    paye_le: `${annee}-09-25`, montant_cents: o.reel, origine: 'releve', saisi_par: f.userId,
  }).select())
}

/** Une ligne d'ajustement, comme celles de `regularise_annuel` ou de `recale_l_annee`. */
export async function ajustementEnAdmin(f: { householdId: string; userId: string },
  charge: string, mois: string, annee: number, cents: number, libelle = 'Ajustement') {
  const d = ou(await admin().from('depense').insert({
    household_id: f.householdId, charge_id: charge, mois, libelle, montant_cents: cents,
    nature: 'connue', source: 'manuel', regularise_annee: annee,
  }).select().single()) as { id: string }
  ou(await admin().from('depense_part').insert({
    depense_id: d.id, user_profile_id: f.userId, household_id: f.householdId,
    part_cents: cents, part_bps: 10000,
  }).select())
  return d.id
}
