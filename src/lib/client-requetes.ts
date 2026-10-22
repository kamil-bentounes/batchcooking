import { QueryClient } from '@tanstack/react-query'

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
export const OPTIONS_DU_CLIENT = {
  queries: { staleTime: 30_000, refetchOnWindowFocus: false, networkMode: 'always' as const },
  mutations: { networkMode: 'always' as const },
}

export function creeLeClient(): QueryClient {
  return new QueryClient({ defaultOptions: OPTIONS_DU_CLIENT })
}
