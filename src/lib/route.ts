/**
 * Une navigation minuscule.
 *
 * Pas de bibliothèque de routage : l'app a neuf écrans, aucun paramètre dans
 * l'URL, et c'est l'ÉTAT DU CYCLE qui décide de ce qu'on voit, pas le chemin.
 * Le chemin ne sert qu'à revenir en arrière et à partager un lien.
 */
import { useCallback, useSyncExternalStore } from 'react'

const BASE = import.meta.env.BASE_URL

/** Le chemin applicatif, débarrassé du préfixe de déploiement. */
function chemin(): string {
  return '/' + window.location.pathname.slice(BASE.length).replace(/^\/+/, '')
}

function href(vers: string): string {
  return (BASE + vers.replace(/^\/+/, '')).replace(/\/{2,}/g, '/')
}

/**
 * Un lien ABSOLU vers un chemin de l'application.
 *
 * `window.location.origin` seul perd le préfixe de déploiement : le site est
 * servi sous `/batchcooking/` sur GitHub Pages, et un lien d'invitation
 * construit sans lui tombait sur une 404.
 */
export function lienDeploye(vers: string): string {
  return `${window.location.origin}${href(vers)}`
}

/*
 * Le chemin est un état PARTAGÉ, pas un état de composant.
 *
 * Il a d'abord été un `useState` dans le hook. Tant qu'un seul composant
 * l'appelait, ça marchait ; le jour où un deuxième l'a fait, chacun a eu sa
 * copie — et comme `pushState` n'émet PAS `popstate`, celui qui naviguait était
 * le seul à le savoir. L'URL changeait, l'écran non.
 *
 * `useSyncExternalStore` supprime la classe entière du problème : il n'y a plus
 * qu'un chemin, et n'importe quel composant peut appeler `useRoute()` sans
 * qu'on ait à se demander lequel est le vrai.
 */
const abonnes = new Set<() => void>()

function abonne(f: () => void) {
  if (abonnes.size === 0) window.addEventListener('popstate', previens)
  abonnes.add(f)
  return () => {
    abonnes.delete(f)
    if (abonnes.size === 0) window.removeEventListener('popstate', previens)
  }
}

function previens() {
  courant = chemin()
  for (const f of abonnes) f()
}

/* `useSyncExternalStore` compare les instantanés par identité : rendre une
   chaîne fraîche à chaque appel le ferait boucler. On garde donc la valeur. */
let courant = chemin()

export function useRoute() {
  const ici = useSyncExternalStore(abonne, () => courant, () => courant)

  const va = useCallback((vers: string) => {
    window.history.pushState(null, '', href(vers))
    previens()
    window.scrollTo(0, 0)
  }, [])

  const retour = useCallback(() => window.history.back(), [])

  return { ici, va, retour, href }
}
