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

/**
 * Un montant saisi vers des centimes entiers. `null` si ce n'est pas un montant.
 *
 * Elle existe parce que `Number(x.replace(',', '.'))` échouait sur « 1 234,56 »
 * — l'espace insécable que `toLocaleString('fr-FR')` produit LUI-MÊME, si bien
 * que recopier un montant affiché par l'app était rejeté — sur « 1,2,3 » (une
 * seule virgule remplacée), et acceptait « 1e3 » comme mille euros.
 *
 * Et `Math.round(12.345 * 100)` rend 1234 : le flottant vaut 1234,4999…, donc
 * on ne multiplie jamais, on découpe la chaîne.
 */
export function enCentimes(saisi: string): number | null {
  const net = saisi.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.')
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(net)) return null
  const [entier, decimales = ''] = net.split('.')
  return Number(entier) * 100 + Number(decimales.padEnd(2, '0'))
}

/** « 1 619 € » — pour les gros chiffres, où les centimes n'aident personne. */
export function eurosRonds(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString('fr-FR')} €`
}

export type Depense = {
  id: string
  charge_id: string | null
  libelle: string
  montant_cents: number
  montant_prevu_cents: number | null
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
      /* ⚠️ On n'ouvre JAMAIS un mois futur.
       *
       *    `ouvre_le_mois` est idempotente et fige la clé au premier appel :
       *    feuilleter jusqu'en 2028 y créait donc les dépenses avec le partage
       *    d'aujourd'hui, définitivement. Regarder l'avenir ne doit rien y
       *    écrire — on le lit, on ne le décide pas. */
      if (mois <= moisDe()) {
        const { error } = await supabase.rpc('ouvre_le_mois', { le_mois: mois })
        if (error) throw new Error(error.message)
      }
      const lignes = ou(await supabase.from('depense')
        /* ⚠️ Une seule chaîne LITTÉRALE. PostgREST infère le type du résultat
           depuis le texte du `select` ; une concaténation n'est plus un
           littéral pour TypeScript, et tout retombe sur `GenericStringError`. */
        .select('id, charge_id, libelle, montant_cents, montant_prevu_cents, nature, source, enveloppe_id, compte_id, depense_part(user_profile_id, part_cents)')
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
    /* Mon PROPRE compte perso : je me dois à moi-même, c'est-à-dire rien. La
       première version demandait de se virer de l'argent à soi, et gonflait le
       total d'autant. */
    if (c?.genre === 'perso' && c.titulaire_id === moi) continue
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

/* ── Ce qui manquait : de quoi POSER les prérequis ─────────────────────────
 *
 * Les écrans du budget lisaient des comptes, des enveloppes et des revenus
 * qu'aucun écran ne permettait d'écrire. Conséquence mesurée : les virements ne
 * rendaient qu'une ligne « à répartir », la section des enveloppes ne
 * s'affichait jamais, et le prorata basculait silencieusement en moitié-moitié
 * faute de revenu — le formulaire proposait « Au prorata » et ne l'honorait pas.
 */

export type Revenu = { id: string; user_profile_id: string; net_mensuel_cents: number; valid_from: string }

/** Le dernier revenu connu de chacun. C'est lui qui rend le prorata possible. */
export function useRevenus() {
  return useQuery({
    queryKey: CLE.revenus,
    queryFn: async (): Promise<Revenu[]> => {
      const l = ou(await supabase.from('revenu')
        .select('id, user_profile_id, net_mensuel_cents, valid_from')
        .order('valid_from', { ascending: false }))
      const derniers = new Map<string, Revenu>()
      for (const r of l) if (!derniers.has(r.user_profile_id)) derniers.set(r.user_profile_id, r)
      return [...derniers.values()]
    },
  })
}

/**
 * Poser son revenu.
 *
 * Toujours un INSERT, jamais un update : un revenu est un fait daté, et la
 * clé de chaque mois passé se lit dessus (D62). Le corriger au lieu d'en
 * ajouter un réécrirait le partage des mois déjà ouverts.
 *
 * La date d'effet est le premier du mois en cours : « à partir de maintenant ».
 */
export function usePoseRevenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { foyerId: string; userId: string; cents: number }) => {
      const depuis = moisDe()
      // Deux saisies le même mois sont la même intention : on remplace celle du
      // mois courant plutôt que d'échouer sur l'unicité (user, valid_from).
      await supabase.from('revenu')
        .delete().eq('user_profile_id', v.userId).eq('valid_from', depuis)
      return ou(await supabase.from('revenu').insert({
        household_id: v.foyerId, user_profile_id: v.userId,
        net_mensuel_cents: v.cents, valid_from: depuis,
      }).select().single())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLE.revenus })
      qc.invalidateQueries({ queryKey: ['budget-mois'] })
    },
  })
}

export function usePoseCompte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: {
      foyerId: string; nom: string; genre: 'commun' | 'perso' | 'epargne'
      titulaireId: string | null; matelasCents: number
    }) => ou(await supabase.from('compte').insert({
      household_id: c.foyerId, nom: c.nom, genre: c.genre,
      /* La contrainte l'exige : un compte `perso` a un titulaire, les autres
         n'en ont pas. Un compte commun avec titulaire prétendrait le contraire
         de ce qu'il est. */
      titulaire_id: c.genre === 'perso' ? c.titulaireId : null,
      matelas_cents: c.matelasCents,
    }).select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLE.comptes })
      qc.invalidateQueries({ queryKey: ['budget-mois'] })
    },
  })
}

export function usePoseEnveloppe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: { foyerId: string; libelle: string; plafondCents: number }) =>
      ou(await supabase.from('enveloppe').insert({
        household_id: e.foyerId, libelle: e.libelle, plafond_cents: e.plafondCents,
      }).select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget-enveloppes'] })
    },
  })
}

export function useEnveloppesPosees() {
  return useQuery({
    queryKey: ['enveloppes-posees'],
    queryFn: async () => ou(await supabase.from('enveloppe')
      .select('id, libelle, plafond_cents').is('archive_le', null).order('libelle')),
  })
}

/** Rattacher une charge à un compte et à une enveloppe, après coup. */
export function useRattacheCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: { id: string; compteId?: string | null; enveloppeId?: string | null }) =>
      ou(await supabase.from('charge').update({
        ...(r.compteId !== undefined ? { compte_id: r.compteId } : {}),
        ...(r.enveloppeId !== undefined ? { enveloppe_id: r.enveloppeId } : {}),
      }).eq('id', r.id).select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLE.charges })
      qc.invalidateQueries({ queryKey: ['budget-mois'] })
    },
  })
}

/* ── L'épargne : verser, et savoir à qui c'est ────────────────────────────── */

export function usePosePoche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      foyerId: string; libelle: string; genre: 'urgence' | 'projet'
      objectifCents: number | null; echeance: string | null; cle: 'prorata' | 'moitie' | null
    }) => ou(await supabase.from('poche_epargne').insert({
      household_id: p.foyerId, libelle: p.libelle, genre: p.genre,
      objectif_cents: p.objectifCents, echeance: p.echeance, cle: p.cle,
    }).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.poches }),
  })
}

/**
 * Verser — ou retirer, le montant étant signé.
 *
 * Une seule colonne signée plutôt qu'un booléen de sens : on n'a pas à se
 * rappeler dans quelle direction lire un drapeau, et la somme se fait toute
 * seule.
 */
export function useVerse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      foyerId: string; pocheId: string; userId: string; cents: number
      motif?: 'mensuel' | 'balayage' | 'retrait' | 'correction'
    }) => ou(await supabase.from('versement_epargne').insert({
      household_id: v.foyerId, poche_id: v.pocheId, user_profile_id: v.userId,
      montant_cents: v.cents, motif: v.motif ?? (v.cents < 0 ? 'retrait' : 'mensuel'),
    }).select().single()),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: CLE.soldes(v.pocheId) })
      qc.invalidateQueries({ queryKey: CLE.poches })
    },
  })
}

/* ── La régularisation : ce qu'on a VRAIMENT payé ─────────────────────────── */

/**
 * Remplacer une provision par le montant réel.
 *
 * ⚠️ On ne pose PAS une ligne d'ajustement ici, et c'est réfléchi : un réel
 *    INFÉRIEUR à la provision — l'énergie d'un mois doux — demanderait une
 *    dépense négative, que la contrainte `montant_cents >= 0` interdit à bon
 *    droit. On corrige donc la ligne du mois et on repose ses parts.
 *
 *    La ligne d'ajustement de D62 reste nécessaire pour la régularisation
 *    ANNUELLE, où l'écart se répartit sur douze mois déjà partagés ; elle
 *    viendra avec elle, et l'unicité partielle du générateur est déjà posée
 *    pour la rendre possible.
 *
 * Les nouvelles parts gardent les POINTS DE BASE de la provision, pas la clé
 * d'aujourd'hui : corriger un montant n'est pas l'occasion de repartager. Le
 * centime résiduel va au plus gros contributeur, sans quoi la somme ne
 * recomposerait pas le montant et le trigger différé refuserait l'écriture.
 *
 * Trois requêtes, dans cet ordre imposé : PostgREST valide chacune dans sa
 * propre transaction, et le contrôle de somme n'admet que zéro part ou un total
 * exact. Retirer les parts d'abord est donc le seul chemin.
 */
export function useRegularise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: { foyerId: string; depense: Depense; reelCents: number }) => {
      const anciennes = r.depense.parts
      const total = anciennes.reduce((s, p) => s + p.part_cents, 0)

      ou(await supabase.from('depense_part').delete().eq('depense_id', r.depense.id).select())
      ou(await supabase.from('depense')
        .update({ montant_cents: r.reelCents, nature: 'connue' })
        .eq('id', r.depense.id).select())

      if (anciennes.length === 0) return
      const brut = anciennes.map(p => ({
        user_profile_id: p.user_profile_id,
        poids: total === 0 ? 1 : p.part_cents,
        cents: 0,
      }))
      const poidsTotal = brut.reduce((s, b) => s + b.poids, 0) || 1
      for (const b of brut) b.cents = Math.floor(r.reelCents * b.poids / poidsTotal)
      const reste = r.reelCents - brut.reduce((s, b) => s + b.cents, 0)
      const ainee = [...brut].sort((a, b) => b.poids - a.poids)[0]
      if (ainee) ainee.cents += reste

      ou(await supabase.from('depense_part').insert(brut.map(b => ({
        depense_id: r.depense.id, user_profile_id: b.user_profile_id,
        household_id: r.foyerId, part_cents: b.cents,
        part_bps: Math.round(b.poids * 10_000 / poidsTotal),
      }))).select())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget-mois'] }),
  })
}

/** La règle par défaut du foyer. Datée : elle ne réécrit pas les mois passés. */
export function useRegle() {
  return useQuery({
    queryKey: ['regle-partage'],
    queryFn: async () => {
      const l = ou(await supabase.from('regle_partage')
        .select('cle, valid_from').order('valid_from', { ascending: false }).limit(1))
      return (l[0]?.cle ?? 'prorata') as 'prorata' | 'moitie'
    },
  })
}

export function usePoseRegle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: { foyerId: string; cle: 'prorata' | 'moitie' }) => {
      const depuis = moisDe()
      // Comme un revenu : une nouvelle règle est un FAIT DATÉ, pas une
      // correction. Deux changements le même mois sont la même intention.
      await supabase.from('regle_partage')
        .delete().eq('household_id', r.foyerId).eq('valid_from', depuis)
      return ou(await supabase.from('regle_partage').insert({
        household_id: r.foyerId, cle: r.cle, valid_from: depuis,
      }).select().single())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['regle-partage'] })
      qc.invalidateQueries({ queryKey: ['budget-mois'] })
    },
  })
}

/**
 * Le relevé annuel est arrivé.
 *
 * On ne touche PAS aux mois déjà partagés : on pose une ligne d'ajustement dans
 * le mois courant, répartie selon ce que chacun a porté sur l'année. Quelqu'un
 * arrivé en octobre ne porte donc que ses trois mois, sans qu'aucune règle de
 * date soit écrite — elle est déjà dans les parts figées.
 */
export function useRegulariseAnnuel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: { chargeId: string; annee: number; reelCents: number }) =>
      ou(await supabase.rpc('regularise_annuel', {
        la_charge: r.chargeId, annee: r.annee, reel_cents: r.reelCents,
      })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget-mois'] }),
  })
}

/** Ce qui a été provisionné sur une charge pour une année, et par qui. */
export function useProvisionsDe(chargeId: string | undefined, annee: number) {
  return useQuery({
    queryKey: ['provisions', chargeId, annee],
    enabled: !!chargeId,
    queryFn: async () => {
      const l = ou(await supabase.rpc('provisions_de',
        { la_charge: chargeId!, annee }))
      return {
        total: Number(l[0]?.total_cents ?? 0),
        parPersonne: l.map(x => ({ userId: x.user_profile_id, cents: Number(x.porte_cents) })),
      }
    },
  })
}

/* ── Les projets (D72) ────────────────────────────────────────────────────── */

export type Poste = { id: string; libelle: string; montant_cents: number; ordre: number }

export function usePostes(pocheId: string | undefined) {
  return useQuery({
    queryKey: ['poche-postes', pocheId],
    enabled: !!pocheId,
    queryFn: async (): Promise<Poste[]> => ou(await supabase.from('poche_poste')
      .select('id, libelle, montant_cents, ordre')
      .eq('poche_id', pocheId!).order('ordre')) as Poste[],
  })
}

export function usePosePoste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      foyerId: string; pocheId: string; libelle: string; cents: number; ordre: number
    }) => ou(await supabase.from('poche_poste').insert({
      household_id: p.foyerId, poche_id: p.pocheId,
      libelle: p.libelle, montant_cents: p.cents, ordre: p.ordre,
    }).select().single()),
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ['poche-postes', p.pocheId] })
      qc.invalidateQueries({ queryKey: CLE.poches })
    },
  })
}

export function useRetirePoste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id: string; pocheId: string }) =>
      ou(await supabase.from('poche_poste').delete().eq('id', p.id).select()),
    onSuccess: (_d, p) => qc.invalidateQueries({ queryKey: ['poche-postes', p.pocheId] }),
  })
}

export function useMajPoche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      id: string; objectifCents?: number | null; echeance?: string | null
      cle?: 'prorata' | 'moitie' | null
    }) => ou(await supabase.from('poche_epargne').update({
      ...(p.objectifCents !== undefined ? { objectif_cents: p.objectifCents } : {}),
      ...(p.echeance !== undefined ? { echeance: p.echeance } : {}),
      ...(p.cle !== undefined ? { cle: p.cle } : {}),
    }).eq('id', p.id).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.poches }),
  })
}

/**
 * L'effort mensuel qu'il reste à fournir pour tenir une échéance.
 *
 * `null` quand il n'y a ni objectif ni date : sans les deux, il n'y a rien à
 * tenir. Zéro mois restant veut dire « c'est maintenant », pas « divise par
 * zéro ».
 */
export function effortMensuel(
  objectifCents: number | null, echeance: string | null, dejaCents: number,
): { parMois: number; mois: number } | null {
  if (!objectifCents || !echeance) return null
  const [a, m] = echeance.split('-').map(Number)
  const n = new Date()
  const mois = Math.max(0, (a - n.getFullYear()) * 12 + (m - 1 - n.getMonth()))
  const reste = Math.max(0, objectifCents - dejaCents)
  return { parMois: mois === 0 ? reste : Math.ceil(reste / mois), mois }
}

/**
 * L'excédent du mois, par personne.
 *
 * Chacun a viré sa part des PROVISIONS ; une fois les réels saisis, la
 * différence lui revient. Aucun solde bancaire n'est nécessaire — je l'ai cru
 * un moment, à tort : l'écart entre le prévu et le payé suffit.
 *
 * Positif = versé en trop. Négatif = il reste à payer.
 */
export function useExcedent(mois: string) {
  return useQuery({
    queryKey: ['excedent', mois],
    queryFn: async () => {
      const l = ou(await supabase.rpc('excedent_du_mois', { le_mois: mois }))
      return l.map(x => ({ userId: x.user_profile_id, cents: Number(x.excedent_cents) }))
    },
  })
}

/** Le jour du mois à partir duquel on réclame le relevé. */
export const JOUR_DU_RELEVE = 27

export function cestLHeureDuReleve(mois: string): boolean {
  const n = new Date()
  const [a, m] = mois.split('-').map(Number)
  // Un mois passé est toujours à confirmer ; le mois courant seulement à partir
  // du 27 — avant, on n'a pas encore tout dépensé.
  if (a < n.getFullYear() || (a === n.getFullYear() && m < n.getMonth() + 1)) return true
  return a === n.getFullYear() && m === n.getMonth() + 1 && n.getDate() >= JOUR_DU_RELEVE
}
