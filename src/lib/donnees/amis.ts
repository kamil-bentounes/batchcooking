/**
 * Les amis entre foyers.
 *
 * Trois principes portent tout le reste :
 *
 *  · l'amitié est SYMÉTRIQUE et EXPLICITE — elle se demande par un lien, elle
 *    s'accepte, et elle se rompt des deux côtés d'un coup ;
 *  · le défaut est PRIVÉ — une recette reste au foyer tant que personne n'a
 *    décidé autre chose ;
 *  · on voit QUI — sinon « d'où sort cette recette ? » n'a pas de réponse.
 *
 * L'acceptation passe par une fonction en base et non par une écriture
 * ordinaire : elle touche un foyer qui n'est pas le sien, ce que la RLS
 * interdit à raison, et elle doit vérifier le jeton, l'expiration et la course
 * entre deux acceptations simultanées.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import { lienDeploye } from '../route.ts'

export const CLE = {
  amis: ['amis'] as const,
  prenoms: ['prenoms-visibles'] as const,
}

export type Lien = {
  id: string
  invite_par: string
  accepte_par: string | null
  jeton: string
  expire_le: string
  accepte_le: string | null
}

/** Les liens du foyer : ceux qui tiennent, et ceux qui attendent une réponse. */
export function useAmis(monFoyer: string | undefined) {
  return useQuery({
    queryKey: [...CLE.amis, monFoyer],
    enabled: !!monFoyer,
    queryFn: async () => {
      const liens = ou(await supabase.from('foyer_ami')
        .select('*').order('created_at', { ascending: false })) as Lien[]
      const prenoms = ou(await supabase.rpc('prenoms_visibles'))

      // Un foyer n'a pas de nom qu'on puisse montrer : on l'appelle par les
      // prénoms de ses membres, qui sont justement ce que l'amitié donne à voir.
      const parFoyer = new Map<string, string[]>()
      for (const p of prenoms) {
        if (!p.household_id || !p.display_name) continue
        if (!parFoyer.has(p.household_id)) parFoyer.set(p.household_id, [])
        parFoyer.get(p.household_id)!.push(p.display_name)
      }

      return liens.map(l => {
        const autre = l.accepte_par === null
          ? null
          : l.invite_par === monFoyer ? l.accepte_par : l.invite_par
        return {
          ...l,
          autre,
          nom: autre ? (parFoyer.get(autre) ?? []).join(' et ') || 'Un foyer' : null,
          enAttente: l.accepte_par === null,
          expire: new Date(l.expire_le) < new Date(),
          lien: lienDeploye(`/ami/${l.jeton}`),
        }
      })
    },
    staleTime: 30_000,
  })
}

export function useInviteAmi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      const { data: moi } = await supabase.auth.getUser()
      return ou(await supabase.from('foyer_ami').insert({
        invite_par: foyer, cree_par: moi.user?.id ?? null,
      }).select().single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.amis }),
  })
}

export function useAccepteAmi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (jeton: string) => {
      const { data, error } = await supabase.rpc('accepter_amitie', { p_jeton: jeton })
      if (error) throw new Error(messageClair(error.message))
      return data as string
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Rompre. Des deux côtés à la fois — c'est une seule ligne. */
export function useRompAmitie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('foyer_ami').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Les erreurs de la base, dites comme on les dirait à quelqu'un. */
function messageClair(brut: string): string {
  if (/déjà utilisée/.test(brut)) return 'Ce lien a déjà servi.'
  if (/expirée/.test(brut)) return 'Ce lien a expiré. Demande-lui d’en refaire un.'
  if (/inconnue/.test(brut)) return 'Ce lien ne correspond à rien.'
  if (/soi-même/.test(brut)) return 'C’est ton propre lien.'
  if (/aucun foyer/.test(brut)) return 'Crée d’abord ton foyer.'
  return brut
}
