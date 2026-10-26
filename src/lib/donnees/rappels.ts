/**
 * Les rappels par mail : MES réglages (un par type), les basculer, et demander un exemple.
 *
 * La RLS fait le gros du travail : on ne lit que les lignes à son nom (`user_id = auth.uid()`), on n'écrit que les
 * siennes. Pas de ligne = rappel COUPÉ : on n'envoie rien à qui ne l'a pas demandé.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { callFunction, ou, supabase } from '../supabase.ts'
import { TYPES_DE_RAPPEL, estUnType } from '../rappels.ts'
import type { TypeDeRappel } from '../rappels.ts'

export const CLE_RAPPELS = ['rappels', 'reglages'] as const

export type Reglages = Record<TypeDeRappel, boolean>

const tousCoupes = (): Reglages =>
  Object.fromEntries(TYPES_DE_RAPPEL.map(t => [t, false])) as Reglages

/** Mes réglages : chaque type, activé ou non (coupé quand il n'y a pas de ligne). */
export function useReglagesRappels() {
  return useQuery({
    queryKey: CLE_RAPPELS,
    queryFn: async (): Promise<Reglages> => {
      const lus = ou(await supabase.from('rappel_reglage').select('type, actif'))
      const r = tousCoupes()
      for (const l of lus) if (estUnType(l.type)) r[l.type] = l.actif
      return r
    },
    staleTime: 30_000,
  })
}

/** Un rappel est-il activé POUR MOI ? `false` tant que les réglages ne sont pas lus : on ne promet pas un mail. */
export function useRappelActif(type: TypeDeRappel): boolean {
  return useReglagesRappels().data?.[type] === true
}

/** Activer ou couper un rappel. L'écran change tout de suite, et revient en arrière si la base refuse. */
export function useBasculeRappel(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ type, actif }: { type: TypeDeRappel; actif: boolean }) => {
      ou(await supabase.from('rappel_reglage')
        .upsert({ user_id: userId, type, actif }, { onConflict: 'user_id,type' }).select())
    },
    onMutate: async ({ type, actif }) => {
      await qc.cancelQueries({ queryKey: CLE_RAPPELS })
      const avant = qc.getQueryData<Reglages>(CLE_RAPPELS)
      qc.setQueryData<Reglages>(CLE_RAPPELS, { ...(avant ?? tousCoupes()), [type]: actif })
      return { avant }
    },
    onError: (_e, _v, ctx) => { if (ctx?.avant) qc.setQueryData(CLE_RAPPELS, ctx.avant) },
    onSettled: () => qc.invalidateQueries({ queryKey: CLE_RAPPELS }),
  })
}

/** « M'envoyer un exemple » : UN mail d'exemple, à mon adresse de connexion et à personne d'autre. */
export function useEssaiRappel() {
  return useMutation({
    mutationFn: async (type: TypeDeRappel) => callFunction('rappels', { essai: type }, 30_000),
  })
}
