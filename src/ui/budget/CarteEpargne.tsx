/**
 * L'épargne (§ 3.1, point 6) : une carte par poche — vignette, nom, « X € mis de
 * côté sur Y € », une jauge. Les projets n'apparaissent que s'il y en a. Un
 * toucher mène à /epargne.
 */
import { usePoches, useSolde, type Poche } from '../../lib/donnees/budget.ts'
import { montant } from '../../lib/budget/mois.ts'
import { Jauge } from './Jauge.tsx'
import { Photo } from './Photo.tsx'

function UnePoche({ poche, va }: { poche: Poche; va: (v: string) => void }) {
  const solde = useSolde(poche.id)
  const dessus = (solde.data ?? []).reduce((t, s) => t + s.cents, 0)
  const cible = poche.objectif_cents ?? 0
  const texte = cible > 0 ? `${montant(dessus)} mis de côté sur ${montant(cible)}`
                          : `${montant(dessus)} mis de côté`
  return (
    <button onClick={() => va('/epargne')}
            className="w-full text-left rounded-[22px] bg-surface shadow-carte p-3.5 flex items-center gap-3.5">
      <Photo epargne taille={54} />
      <span className="grow min-w-0">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[17px] font-semibold truncate">{poche.libelle}</span>
          {cible > 0 && (
            <span className="text-[14px] text-doux tabular-nums">
              {Math.max(0, Math.min(100, Math.floor((dessus * 100) / cible)))} %
            </span>
          )}
        </span>
        <span className="block text-[14px] text-doux">{texte}</span>
        {/* Au-delà de l'objectif n'est pas un dépassement : la jauge s'arrête pleine.
            Un solde négatif la laisse vide : un `meter` de valeur négative est invalide. */}
        {cible > 0 && <span className="mt-2 block"><Jauge valeur={Math.max(0, Math.min(dessus, cible))} plafond={cible} nom={texte} /></span>}
      </span>
      <span aria-hidden="true" className="text-[20px] text-doux">›</span>
    </button>
  )
}

export function CarteEpargne({ va }: { va: (v: string) => void }) {
  const { data: poches = [] } = usePoches()
  if (poches.length === 0) return null
  return (
    <div className="mt-4 flex flex-col gap-3">
      {poches.map(p => <UnePoche key={p.id} poche={p} va={va} />)}
    </div>
  )
}
