/**
 * Le foyer : qui en est, ce que chacun vise, ce qu'on a comme appareils.
 *
 * Tout le reste de l'app en dépend — les portions (D25), l'ordonnancement (D8),
 * la liste de courses (D56) — donc c'est chargé une fois et gardé longtemps.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import type { Ligne } from '../supabase.ts'

export type Membre = Ligne<'user_profile'> & {
  objectif: Ligne<'nutrition_target'> | null
}

export type Foyer = {
  id: string
  nom: string
  plafondLlmEur: number
  membres: Membre[]
}

export const CLE = {
  foyer: ['foyer'] as const,
  magasins: ['magasins'] as const,
  appareils: ['appareils'] as const,
}

async function chargeFoyer(): Promise<Foyer | null> {
  const id = ou(await supabase.rpc('current_household'))
  if (!id) return null

  const [maison, profils, objectifs] = await Promise.all([
    supabase.from('household').select('*').eq('id', id).single(),
    supabase.from('user_profile').select('*').order('created_at'),
    // Les objectifs sont historisés (un INSERT par changement) : on ne garde
    // que le dernier de chaque personne.
    supabase.from('nutrition_target_courante').select('*').order('valid_from', { ascending: false }),
  ])

  const h = ou(maison)
  // La vue rend UNE ligne par personne, et toutes ses colonnes nullables au
  // typage : on écarte ce qui ne peut pas arriver plutôt que de forcer.
  const derniers = new Map<string, Ligne<'nutrition_target'>>()
  for (const o of ou(objectifs)) {
    if (o.user_profile_id) derniers.set(o.user_profile_id, o as Ligne<'nutrition_target'>)
  }

  return {
    id: h.id,
    nom: h.name,
    plafondLlmEur: Number(h.llm_monthly_cap_eur),
    membres: ou(profils).map(p => ({ ...p, objectif: derniers.get(p.id) ?? null })),
  }
}

export function useFoyer() {
  return useQuery({ queryKey: CLE.foyer, queryFn: chargeFoyer, staleTime: 5 * 60_000 })
}

/** Le catalogue d'appareils, commun à tous les foyers (classe A). */
export function useAppareils() {
  return useQuery({
    queryKey: CLE.appareils,
    queryFn: async () => ou(await supabase.from('appliance_catalog').select('*').order('label')),
    staleTime: Infinity,
  })
}

export function useMagasins() {
  return useQuery({
    queryKey: CLE.magasins,
    queryFn: async () => ou(await supabase.from('store').select('*')
      .order('is_default', { ascending: false }).order('position').order('name')),
    staleTime: 5 * 60_000,
  })
}

export function useCreeMagasin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ nom, parDefaut }: { nom: string; parDefaut: boolean }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      // Un seul magasin par défaut : l'index partiel l'impose, on retire donc
      // l'ancien AVANT d'écrire le nouveau plutôt que d'essuyer un conflit.
      if (parDefaut) {
        ou(await supabase.from('store').update({ is_default: false })
          .eq('household_id', foyer).eq('is_default', true).select())
      }
      return ou(await supabase.from('store')
        .insert({ household_id: foyer, name: nom.trim(), is_default: parDefaut })
        .select().single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.magasins }),
  })
}

export function useSupprimeMagasin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('store').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.magasins }),
  })
}

/** L'objectif d'un membre ramené à une part de repas (D25). */
export function objectifDe(m: Membre): { kcal: number; proteinG: number } {
  return {
    kcal: Number(m.objectif?.kcal ?? 0),
    proteinG: Number(m.objectif?.protein_g ?? 0),
  }
}

/**
 * Le prénom à AFFICHER.
 *
 * Quelqu'un qui vient d'accepter une invitation n'en a pas encore : on ne le
 * fabrique plus depuis son adresse — `thauba-1790147184836` s'est retrouvé
 * pré-rempli dans « Ton prénom », validé sans regarder, et lu sur chaque ligne
 * de charge pendant des mois. Un champ vide se remplit, un champ faux se garde.
 * En attendant qu'elle le pose, les écrans disent quelque chose de lisible.
 */
export function prenomDe(nom: string | null | undefined): string {
  const n = (nom ?? '').trim()
  return n === '' ? 'Sans prénom' : n
}

/**
 * A-t-il fixé ses objectifs ? Sans eux, `objectifDe` rend 0 kcal : le dressage lui dresse alors des
 * parts au poids moyen des autres (`repartit`), et le dit. L'arrivante dans le foyer est dans ce cas
 * jusqu'à ce qu'elle les fixe.
 */
export function aDesObjectifs(m: { objectif?: { kcal?: unknown } | null }): boolean {
  return Number(m.objectif?.kcal ?? 0) > 0
}

/**
 * Le bandeau du hub, sur ce qui manque à MON profil : prénom ou revenu (le partage se fait alors à
 * parts égales), objectifs (mes barquettes sont dressées à parts égales). `null` : rien ne manque. Les
 * objectifs seuls mènent à leur écran, le reste au profil.
 */
export function bandeauDuProfil(o: { prenom: boolean; revenu: boolean; objectifs: boolean }):
  { titre: string; texte: string; vers: '/profil' | '/objectifs' } | null {
  const sansRevenu = !o.prenom || !o.revenu
  if (!sansRevenu && o.objectifs) return null
  const texteRevenu = 'Sans ton revenu, le partage se fait à parts égales.'
  const texteObjectifs = 'Sans tes objectifs, tes barquettes sont dressées à parts égales.'
  if (sansRevenu) {
    return { titre: 'Complète ton profil.', vers: '/profil',
             texte: o.objectifs ? texteRevenu : `${texteRevenu} ${texteObjectifs}` }
  }
  return { titre: 'Fixe tes objectifs.', texte: texteObjectifs, vers: '/objectifs' }
}

/**
 * Ce que le dressage dit de ceux qui n'ont pas d'objectifs : leurs barquettes sont dressées à
 * parts égales (elles étaient omises, sans un mot, avant le 26/10). `null` : tout le monde en a.
 */
export function phraseSansObjectifs(prenoms: string[]): string | null {
  if (prenoms.length === 0) return null
  return prenoms.length === 1
    ? `${prenoms[0]} n’a pas encore fixé ses objectifs : ses barquettes sont dressées à parts égales.`
    : `${prenoms.join(' et ')} n’ont pas encore fixé leurs objectifs : leurs barquettes sont dressées à parts égales.`
}

/** « Dans le foyer : Kamil, Thauba » : la seule liste des membres hors des écrans du budget. */
export function ceuxDuFoyer(membres: { display_name: string | null }[] | undefined): string | null {
  if (!membres || membres.length === 0) return null
  return `Dans le foyer : ${membres.map(m => prenomDe(m.display_name)).join(', ')}`
}

/** L'initiale de l'avatar : `?` tant que le prénom est vide, jamais un rond vide. */
export function initialeDe(nom: string | null | undefined): string {
  return ((nom ?? '').trim().slice(0, 1) || '?').toUpperCase()
}
