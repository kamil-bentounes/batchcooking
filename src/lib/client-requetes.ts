import { QueryClient, onlineManager } from '@tanstack/react-query'
import { PAS_DE_RESEAU } from './reseau.ts'

/**
 * Le client de requêtes de l'appli.
 *
 * ⚠️ `networkMode: 'always'`, pour les mutations ET les lectures. Par défaut TanStack Query 5
 * MET EN PAUSE tout ce qui part quand `navigator.onLine` est faux : en mode avion, « Ajouter 9 € »
 * restait sur « J'ajoute… » sans un mot de réseau, puis PARTAIT à la reconnexion — et si l'on avait
 * quitté l'écran et recliqué entre-temps, la saisie était écrite DEUX fois. Une écriture hors ligne
 * échoue tout de suite, avec la phrase de réseau (`enFrancais`), et c'est à la personne de
 * recommencer. Les lectures, de même : une lecture en pause laissait « Un instant… » indéfiniment,
 * alors qu'une lecture qui échoue dit « tu n'as plus de connexion » (`messageDeLecture`).
 */
/**
 * Une lecture qui échoue pour cause de réseau ne se relance pas ici : supabase-js a déjà réessayé
 * (jusqu'à sept secondes), et trois relances de plus faisaient attendre une demi-minute avant de
 * dire « Pas de réseau ». Les autres erreurs gardent les trois relances d'usage.
 */
export function relancer(echecs: number, e: unknown): boolean {
  if (!onlineManager.isOnline()) return false
  if (e instanceof Error && e.message === PAS_DE_RESEAU) return false
  return echecs < 3
}

export const OPTIONS_DU_CLIENT = {
  queries: { staleTime: 30_000, refetchOnWindowFocus: false, networkMode: 'always' as const,
             retry: relancer },
  mutations: { networkMode: 'always' as const },
}

export function creeLeClient(): QueryClient {
  return new QueryClient({ defaultOptions: OPTIONS_DU_CLIENT })
}
