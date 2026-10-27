/**
 * L'épargne, et les projets.
 *
 * Une chose à ne jamais perdre de vue : une épargne PERSISTE, donc elle appartient à quelqu'un. Le registre
 * dit qui a versé quoi (D64), et deux poches, pas une : l'urgence et les voyages dans le même pot, ce sont
 * les voyages qui gagnent, toujours. La carte d'une poche est dans `ui/epargne/CartePoche.tsx`.
 */
import { Vide, Attente, Erreur } from '../ui/coque.tsx'
import { CartePoche } from '../ui/epargne/CartePoche.tsx'
import { OuvrirUnePoche } from '../ui/epargne/OuvrirUnePoche.tsx'
import { useFoyer, prenomDe } from '../lib/donnees/foyer.ts'
import { usePoches, usePosePoche } from '../lib/donnees/budget.ts'

export function Epargne({ userId, retour }: { userId: string; retour: () => void }) {
  const { data: foyer } = useFoyer()
  const poches = usePoches()
  const pose = usePosePoche()

  const foyerId = foyer?.id ?? ''
  const membres = (foyer?.membres ?? []).map(m => ({ id: m.id, prenom: prenomDe(m.display_name) }))

  return (
    <main className="min-h-dvh px-4 pt-4 pb-16 min-[900px]:px-8">
      <div className="mx-auto w-full max-w-[1180px]">
        <header className="flex h-14 items-center">
          <button type="button" onClick={retour}
                  className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full pl-2 pr-3.5
                             text-[15px] font-semibold text-doux hover:text-encre">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
            Le mois
          </button>
        </header>
        <h1 className="titre mt-3.5 text-[34px] font-semibold max-[360px]:text-[30px] min-[900px]:mt-5 min-[900px]:text-[46px]">
          L’épargne
        </h1>
        <p className="mt-2 max-w-[46ch] text-[15.5px] leading-[1.45] text-doux">
          Ce qui est versé appartient à qui l’a versé. Le registre le suit, parce qu’un livret joint est
          présumé moitié-moitié, et vos versements, non.
        </p>

        <Erreur de={poches.error ?? pose.error} />
        <div className="mt-[18px] grid items-start gap-3 min-[900px]:mt-[26px] min-[900px]:grid-cols-[7fr_5fr]
                        min-[900px]:gap-5">
          <div className="grid min-w-0 gap-3 min-[900px]:gap-5">
            {poches.isPending ? <Attente /> : (poches.data ?? []).length === 0 ? (
              <Vide titre="Rien encore"
                    texte="Commence par un fonds d’urgence : quatre mois de ce qui est nécessaire, et intouchable pour le reste." />
            ) : (
              (poches.data ?? []).map(p => (
                <CartePoche key={p.id} poche={p} userId={userId} foyerId={foyerId} membres={membres} />
              ))
            )}
          </div>
          <OuvrirUnePoche foyerId={foyerId} pose={pose} />
        </div>
      </div>
    </main>
  )
}
