/** Le filtre Tout / Commun / Moi, chacun avec son total (§ 3.1, point 8). */
import { montant, type Filtre } from '../../lib/budget/mois.ts'

const CHOIX: [Filtre, string][] = [['tout', 'Tout'], ['commun', 'Commun'], ['moi', 'Moi']]

/**
 * La flèche d'un `radiogroup` : → et ↓ vont au suivant, ← et ↑ au précédent, en boucle.
 * Toute autre touche rend `null` : Tab, Entrée et les lettres restent au navigateur.
 */
export function filtreVoisin(filtre: Filtre, touche: string): Filtre | null {
  const pas = touche === 'ArrowRight' || touche === 'ArrowDown' ? 1
    : touche === 'ArrowLeft' || touche === 'ArrowUp' ? -1 : 0
  if (pas === 0) return null
  return CHOIX[(CHOIX.findIndex(([f]) => f === filtre) + pas + CHOIX.length) % CHOIX.length][0]
}

export function FiltreDuMois({ filtre, totaux, choisir }: {
  filtre: Filtre; totaux: Record<Filtre, number>; choisir: (f: Filtre) => void
}) {
  return (
    <div role="radiogroup" aria-label="Filtrer les lignes"
         className="mt-3 grid grid-cols-3 gap-1 rounded-[18px] bg-piste p-1">
      {CHOIX.map(([f, nom]) => (
        <button key={f} role="radio" aria-checked={filtre === f} onClick={() => choisir(f)}
                /* Tabulation itinérante : seul le coché est dans l'ordre de Tab, les
                   flèches déplacent le reste — comme un vrai `radiogroup`. */
                tabIndex={filtre === f ? 0 : -1}
                onKeyDown={e => {
                  const voisin = filtreVoisin(f, e.key)
                  if (!voisin) return
                  e.preventDefault()
                  choisir(voisin)
                  const freres = e.currentTarget.parentElement?.children
                  ;(freres?.[CHOIX.findIndex(([x]) => x === voisin)] as HTMLElement | undefined)?.focus()
                }}
                className={`min-h-11 rounded-[14px] py-1.5 leading-tight transition-colors
                            ${filtre === f ? 'bg-surface shadow-carte' : ''}`}>
          <span className="block text-[15px] font-semibold">{nom}</span>
          {/* En encre, pas en doux : le doux sur la piste fait 4,4:1, sous le seuil
              de l'audit des contrastes (`parcours.spec.ts`). */}
          <span className="block text-[13px] tabular-nums">{montant(totaux[f])}</span>
        </button>
      ))}
    </div>
  )
}
