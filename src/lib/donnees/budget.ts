/**
 * Le budget du foyer.
 *
 * Tout ce que cet écran montre se calcule en base : les parts sont figées en
 * centimes sur chaque dépense au moment où elle naît (D60), et rien ici ne les
 * recalcule. Ce module ne fait que lire et présenter.
 *
 * ⚠️ Les montants sont des CENTIMES ENTIERS de bout en bout. Ils ne deviennent
 *    des euros qu'à l'affichage, par `euros()`. Un `number` flottant traversant
 *    la couche de données finirait par rendre 10,26 € pour deux parts de 5,125,
 *    et un budget dont les parts ne recomposent pas le total est abandonné au
 *    troisième mois.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'

export const CLE = {
  mois: (m: string) => ['budget-mois', m] as const,
  enveloppes: (m: string) => ['budget-enveloppes', m] as const,
  charges: ['budget-charges'] as const,
  comptes: ['budget-comptes'] as const,
  poches: ['budget-poches'] as const,
  soldes: (p: string) => ['budget-solde', p] as const,
  revenus: ['budget-revenus'] as const,
}

/** Le premier jour du mois d'une date, en heure LOCALE. */
export function moisDe(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Des centimes vers « 1 618,53 € ». Jamais l'inverse ailleurs qu'ici. */
export function euros(cents: number, avecUnite = true): string {
  const s = (cents / 100).toLocaleString('fr-FR',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return avecUnite ? `${s} €` : s
}

/** « 1 619 € » — pour les gros chiffres, où les centimes n'aident personne. */
export function eurosRonds(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString('fr-FR')} €`
}

export type Depense = {
  id: string
  libelle: string
  montant_cents: number
  nature: 'estimee' | 'connue'
  source: string
  enveloppe_id: string | null
  compte_id: string | null
  parts: { user_profile_id: string; part_cents: number }[]
}

/**
 * Le mois : ses dépenses et les parts de chacun.
 *
 * L'ouverture du mois est PARESSEUSE — il n'y a pas de tâche planifiée, donc
 * c'est la première lecture qui la déclenche. `ouvre_le_mois` est idempotente :
 * la clé se fige au premier appel, les suivants ne touchent rien.
 */
export function useMois(mois: string) {
  return useQuery({
    queryKey: CLE.mois(mois),
    queryFn: async (): Promise<Depense[]> => {
      await supabase.rpc('ouvre_le_mois', { le_mois: mois })
      const lignes = ou(await supabase.from('depense')
        /* ⚠️ Une seule chaîne LITTÉRALE. PostgREST infère le type du résultat
           depuis le texte du `select` ; une concaténation n'est plus un
           littéral pour TypeScript, et tout retombe sur `GenericStringError`. */
        .select('id, libelle, montant_cents, nature, source, enveloppe_id, compte_id, depense_part(user_profile_id, part_cents)')
        .eq('mois', mois).order('libelle'))
      return lignes.map(l => ({
        ...l,
        nature: l.nature as 'estimee' | 'connue',
        parts: (l.depense_part ?? []) as Depense['parts'],
      }))
    },
  })
}

export type Virement = { vers: string; compteId: string | null; cents: number; detail: string }

/**
 * Ce que quelqu'un doit verser, et où.
 *
 * On ne rend pas un solde abstrait mais des VIREMENTS À FAIRE : c'est la seule
 * forme sur laquelle on peut agir. L'écart entre ce qu'on doit et ce qu'on a
 * réellement payé est tout le moteur — une charge due à deux mais débitée du
 * compte de l'un crée une dette envers lui, pas envers le compte commun.
 */
export function virements(
  depenses: Depense[], moi: string, comptes: Compte[], prenoms: Map<string, string>,
): Virement[] {
  const parCompte = new Map<string | null, number>()
  for (const d of depenses) {
    const mienne = d.parts.find(p => p.user_profile_id === moi)
    if (!mienne) continue
    parCompte.set(d.compte_id, (parCompte.get(d.compte_id) ?? 0) + mienne.part_cents)
  }

  const sortie: Virement[] = []
  for (const [compteId, cents] of parCompte) {
    if (cents === 0) continue
    const c = comptes.find(x => x.id === compteId)
    // Un compte perso qui n'est pas le sien : on doit à son titulaire, pas au
    // compte. C'est ce que la personne comprend, et ce qu'elle fera.
    const versQuelquun = c?.genre === 'perso' && c.titulaire_id && c.titulaire_id !== moi
    sortie.push({
      vers: versQuelquun ? (prenoms.get(c!.titulaire_id!) ?? 'l’autre') : (c?.nom ?? 'à répartir'),
      compteId: compteId,
      cents,
      detail: versQuelquun ? 'avancé par lui' : 'charges et enveloppes',
    })
  }
  return sortie.sort((a, b) => b.cents - a.cents)
}

export type Compte = {
  id: string; nom: string; genre: 'commun' | 'perso' | 'epargne'
  titulaire_id: string | null; matelas_cents: number
}

export function useComptes() {
  return useQuery({
    queryKey: CLE.comptes,
    queryFn: async (): Promise<Compte[]> => ou(await supabase.from('compte')
      .select('id, nom, genre, titulaire_id, matelas_cents')
      .is('archive_le', null).order('nom')) as Compte[],
  })
}

export type ResteEnveloppe = {
  enveloppe_id: string; libelle: string
  plafond_cents: number; depense_cents: number; reste_cents: number
}

export function useEnveloppes(mois: string) {
  return useQuery({
    queryKey: CLE.enveloppes(mois),
    queryFn: async (): Promise<ResteEnveloppe[]> => {
      const l = ou(await supabase.rpc('reste_enveloppe', { le_mois: mois }))
      // Les agrégats reviennent en `bigint`, donc en chaîne : `Number` ici une
      // fois, plutôt que dans chaque composant qui les affiche.
      return l.map(x => ({
        ...x,
        depense_cents: Number(x.depense_cents),
        reste_cents: Number(x.reste_cents),
      }))
    },
  })
}

export type Charge = {
  id: string; libelle: string; montant_cents: number
  periodicite: 'mensuel' | 'trimestriel' | 'annuel'
  variable: boolean; cle: 'prorata' | 'moitie' | null
  compte_id: string | null; enveloppe_id: string | null
  archive_le: string | null
  participants: string[]
}

export function useCharges() {
  return useQuery({
    queryKey: CLE.charges,
    queryFn: async (): Promise<Charge[]> => {
      const l = ou(await supabase.from('charge')
        .select('id, libelle, montant_cents, periodicite, variable, cle, compte_id, enveloppe_id, archive_le, charge_participant(user_profile_id)')
        .order('libelle'))
      return l.map(c => ({
        ...c,
        periodicite: c.periodicite as Charge['periodicite'],
        cle: c.cle as Charge['cle'],
        participants: (c.charge_participant ?? []).map(p => p.user_profile_id),
      }))
    },
  })
}

/** Le catalogue, groupé par section, dans l'ordre voulu. */
export function useCatalogue() {
  return useQuery({
    queryKey: ['catalogue-charges'],
    queryFn: async () => {
      const l = ou(await supabase.from('catalogue_charge')
        .select('id, section, libelle, periode, portee, precision_txt, ordre').order('ordre'))
      const sections = new Map<string, typeof l>()
      for (const x of l) {
        if (!sections.has(x.section)) sections.set(x.section, [])
        sections.get(x.section)!.push(x)
      }
      return [...sections].map(([nom, lignes]) => ({ nom, lignes }))
    },
    staleTime: Infinity,   // un référentiel ne bouge pas pendant une session
  })
}

export type Poche = {
  id: string; libelle: string; genre: 'urgence' | 'projet'
  objectif_cents: number | null; echeance: string | null
  cle: 'prorata' | 'moitie' | null
}

export function usePoches() {
  return useQuery({
    queryKey: CLE.poches,
    queryFn: async (): Promise<Poche[]> => ou(await supabase.from('poche_epargne')
      .select('id, libelle, genre, objectif_cents, echeance, cle')
      .order('genre').order('libelle')) as Poche[],
  })
}

/** Le cumul de chacun sur une poche. Jamais un solde seul (D64). */
export function useSolde(pocheId: string | undefined) {
  return useQuery({
    queryKey: CLE.soldes(pocheId ?? ''),
    enabled: !!pocheId,
    queryFn: async () => {
      const l = ou(await supabase.rpc('solde_epargne', { la_poche: pocheId! }))
      return l.map(x => ({ userId: x.user_profile_id, cents: Number(x.cumul_cents) }))
    },
  })
}

export function useAjouteCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: {
      libelle: string; montantCents: number; periodicite: string
      participants: string[]; cle?: string | null; catalogueId?: string | null
      variable?: boolean; compteId?: string | null; enveloppeId?: string | null
      foyerId: string
    }) => {
      const ligne = ou(await supabase.from('charge').insert({
        household_id: c.foyerId, libelle: c.libelle, montant_cents: c.montantCents,
        periodicite: c.periodicite, cle: c.cle ?? null, catalogue_id: c.catalogueId ?? null,
        variable: c.variable ?? false, compte_id: c.compteId ?? null,
        enveloppe_id: c.enveloppeId ?? null, debut: moisDe(),
      }).select().single())
      /* Une charge sans participant n'engendre rien : le générateur l'ignore.
         Les deux écritures vont donc ensemble, toujours. */
      ou(await supabase.from('charge_participant').insert(
        c.participants.map(u => ({
          charge_id: ligne.id, user_profile_id: u, household_id: c.foyerId,
        }))).select())
      return ligne
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLE.charges })
      qc.invalidateQueries({ queryKey: ['budget-mois'] })
    },
  })
}

export function useArchiveCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      /* On tente la suppression : une charge qui n'a rien produit part sans
         laisser de trace. Si elle a une histoire, la base refuse (`restrict`)
         et on l'archive — arrêter de payer Netflix n'efface pas les douze mois
         où on l'a payé. */
      const { error } = await supabase.from('charge').delete().eq('id', id)
      if (!error) return 'supprimee' as const
      ou(await supabase.from('charge')
        .update({ archive_le: new Date().toISOString() }).eq('id', id).select())
      return 'archivee' as const
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.charges }),
  })
}
