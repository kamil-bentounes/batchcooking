/** Le filtre Tout / Commun / Moi, chacun avec son total (§ 3.1, point 8). */
import { montant, type Filtre } from '../../lib/budget/mois.ts'

const CHOIX: [Filtre, string][] = [['tout', 'Tout'], ['commun', 'Commun'], ['moi', 'Moi']]

export function FiltreDuMois({ filtre, totaux, choisir }: {
  filtre: Filtre; totaux: Record<Filtre, number>; choisir: (f: Filtre) => void
}) {
  return (
    <div role="radiogroup" aria-label="Filtrer les lignes"
         className="mt-3 grid grid-cols-3 gap-1 rounded-[18px] bg-piste p-1">
      {CHOIX.map(([f, nom]) => (
        <button key={f} role="radio" aria-checked={filtre === f} onClick={() => choisir(f)}
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
