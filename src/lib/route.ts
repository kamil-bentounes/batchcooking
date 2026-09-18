/**
 * Une navigation minuscule.
 *
 * Pas de bibliothèque de routage : l'app a neuf écrans, aucun paramètre dans
 * l'URL, et c'est l'ÉTAT DU CYCLE qui décide de ce qu'on voit, pas le chemin.
 * Le chemin ne sert qu'à revenir en arrière et à partager un lien.
 */
import { useCallback, useEffect, useState } from 'react'

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

export function useRoute() {
  const [ici, setIci] = useState(chemin)

  useEffect(() => {
    const relire = () => setIci(chemin())
    window.addEventListener('popstate', relire)
    return () => window.removeEventListener('popstate', relire)
  }, [])

  const va = useCallback((vers: string) => {
    window.history.pushState(null, '', href(vers))
    setIci(chemin())
    window.scrollTo(0, 0)
  }, [])

  const retour = useCallback(() => window.history.back(), [])

  return { ici, va, retour, href }
}
