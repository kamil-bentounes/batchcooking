/**
 * Cuisiner à plusieurs.
 *
 * Deux choses distinctes, qu'on confond facilement :
 *
 *  · À L'INTÉRIEUR DU FOYER, deux téléphones suivent déjà la même session. Ce
 *    qui manquait n'était pas le droit de lire, c'était d'être PRÉVENU — voir
 *    `useTempsReel`.
 *  · ENTRE FOYERS, on convie un ami à sa session. Il suit l'avancement et prend
 *    des gestes ; il ne touche pas au plan. La frontière est tenue en base
 *    (0037), pas ici : cet écran ne fait que la rendre visible.
 *
 * « Prévenir » veut dire ce qu'il dit, et rien de plus : l'invité voit
 * l'invitation en ouvrant l'application. Il n'y a pas de notification poussée,
 * et prétendre le contraire ferait manquer une session à quelqu'un.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'

export const CLE = {
  convives: (cycleId: string | undefined) => ['convives', cycleId] as const,
  invitations: ['invitations-session'] as const,
}

export type Convive = {
  id: string
  invite_id: string
  nom: string
  rejoint: boolean
}

/** Les prénoms visibles, rangés par foyer. Un foyer n'a pas de nom montrable. */
async function foyersNommes(): Promise<Map<string, string>> {
  const prenoms = ou(await supabase.rpc('prenoms_visibles'))
  const parFoyer = new Map<string, string[]>()
  for (const p of prenoms) {
    if (!p.household_id || !p.display_name) continue
    if (!parFoyer.has(p.household_id)) parFoyer.set(p.household_id, [])
    parFoyer.get(p.household_id)!.push(p.display_name)
  }
  return new Map([...parFoyer].map(([id, noms]) => [id, noms.join(' et ')]))
}

/**
 * Le prénom de chacun, par identifiant.
 *
 * `useFoyer()` ne connaît que les siens : en session partagée, l'hôte et le
 * convive ont besoin de se nommer l'un l'autre. Sans cela l'écran affichait
 * « À toi » pour le geste de quelqu'un d'autre — le pire des malentendus quand
 * il s'agit de savoir qui émince les oignons.
 */
export function usePrenoms() {
  return useQuery({
    queryKey: ['prenoms'] as const,
    queryFn: async (): Promise<Map<string, string>> => {
      const prenoms = ou(await supabase.rpc('prenoms_visibles'))
      return new Map(prenoms
        .filter(p => p.id && p.display_name)
        .map(p => [p.id as string, p.display_name as string]))
    },
    staleTime: 60_000,
  })
}

/** Les foyers amis, nommés par les prénoms de leurs membres. */
export function useFoyersAmis() {
  return useQuery({
    queryKey: ['foyers-amis'] as const,
    queryFn: async () => {
      const ids = ou(await supabase.rpc('foyers_amis')) as string[]
      const noms = await foyersNommes()
      return ids.map(id => ({ id, nom: noms.get(id) ?? 'Un foyer' }))
    },
    staleTime: 60_000,
  })
}

/** Qui est convié à MA session, et qui est déjà entré. */
export function useConvives(cycleId: string | undefined) {
  return useQuery({
    queryKey: CLE.convives(cycleId),
    enabled: !!cycleId,
    queryFn: async (): Promise<Convive[]> => {
      const lignes = ou(await supabase.from('session_convive')
        .select('id, invite_id, rejoint_le').eq('cycle_id', cycleId!))
      const noms = await foyersNommes()
      return lignes.map(l => ({
        id: l.id,
        invite_id: l.invite_id,
        nom: noms.get(l.invite_id) ?? 'Un foyer',
        rejoint: l.rejoint_le !== null,
      }))
    },
  })
}

export function useConvie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cycleId, foyers }: { cycleId: string; foyers: string[] }) => {
      const mien = ou(await supabase.rpc('current_household'))
      if (!mien) throw new Error('Aucun foyer.')
      // `hote_id` est reposé par la base d'après le cycle : ce qu'on envoie ici
      // n'est qu'un remplissage de la colonne NOT NULL.
      const lignes = foyers.map(f => ({ cycle_id: cycleId, hote_id: mien, invite_id: f }))
      if (lignes.length === 0) return []
      return ou(await supabase.from('session_convive')
        .upsert(lignes, { onConflict: 'cycle_id,invite_id', ignoreDuplicates: true })
        .select())
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: CLE.convives(v.cycleId) }),
  })
}

export function useRetireConvive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; cycleId: string }) =>
      ou(await supabase.from('session_convive').delete().eq('id', id).select()),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: CLE.convives(v.cycleId) }),
  })
}

export type Invitation = {
  id: string
  cycle_id: string
  nom: string
  rejoint: boolean
}

/**
 * Les sessions où l'on m'attend. C'est ce que l'accueil montre en haut.
 *
 * ⚠️ Par une fonction en base, et pas par une lecture de `session_convive`.
 *
 *    Tant qu'on n'a pas rejoint, on ne peut pas lire le cycle — c'est voulu —
 *    donc on ne peut pas savoir si la session est encore vivante. L'accueil
 *    affichait « Alice t'invite à cuisiner » indéfiniment, sur une session
 *    close depuis des semaines. La fonction, elle, voit les deux côtés.
 */
export function useInvitations() {
  return useQuery({
    queryKey: CLE.invitations,
    queryFn: async (): Promise<Invitation[]> => {
      const lignes = ou(await supabase.rpc('invitations_de_session'))
      const noms = await foyersNommes()
      return lignes.map(l => ({
        id: l.id,
        cycle_id: l.cycle_id,
        nom: noms.get(l.hote_id) ?? 'Un foyer',
        rejoint: l.rejoint,
      }))
    },
    staleTime: 15_000,
  })
}

/** S'en aller d'une session où l'on était convié. */
export function useQuitteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cycleId: string) =>
      ou(await supabase.from('session_convive').delete().eq('cycle_id', cycleId).select()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useRejoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('session_convive')
        .update({ rejoint_le: new Date().toISOString() }).eq('id', id).select().single()),
    onSuccess: () => qc.invalidateQueries(),
  })
}
