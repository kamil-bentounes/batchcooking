/**
 * « C'est fait, c'est au frigo » du mail « Sortir du congélateur » mène à `/frigo?sortir=<ids>`. Rien ne bouge tant
 * qu'on n'a pas répondu : une feuille demande « Sortir 4 wraps du congélateur ? », et c'est le geste d'à côté
 * (`useSortDuCongelo`, comme la fiche d'un plat) qui passe les barquettes au frigo, décongelées.
 *
 * Un lien est un lien : il se rouvre, se transfère, s'ouvre sur un autre appareil. Les identifiants qui ne désignent
 * plus rien de sortable (inconnus, d'un autre foyer, déjà sortis, mangés, jetés) sont donc ignorés sans bruit : s'il
 * n'y en a plus aucun, la feuille dit qu'il n'y a rien à sortir au lieu de poser une question.
 */
import { useState } from 'react'
import { Feuille } from '../budget/Feuille.tsx'
import { Attente, Erreur } from '../coque.tsx'
import { useSortDuCongelo } from '../../lib/donnees/frigo.ts'
import { detailDeSortie, phraseDApresSortie, questionDeSortie, sortablesDuLien } from '../../lib/rappels.ts'
import type { Part } from '../../lib/frigo.ts'
import { groupeLesParts } from '../../lib/frigo.ts'

export function SortirParLien({ ids, barquettes, chargement, erreur, reessayer, surFerme, surReporte }: {
  /** Les identifiants du lien ; `null` : le lien n'en portait pas, la feuille reste fermée. */
  ids: string[] | null
  barquettes: Part[]
  chargement: boolean
  /** Le frigo n'a pas pu être LU : on ne sait pas ce qui est au congélateur, on ne dit donc ni « rien à sortir » ni
   *  « oui je les sors ». Le lien n'est pas consommé : il reste dans l'adresse, et se rouvre. */
  erreur: unknown
  reessayer: () => void
  surFerme: () => void
  /** « Plus tard » depuis l'erreur : la feuille se ferme, le lien reste dans l'adresse. */
  surReporte: () => void
}) {
  const sort = useSortDuCongelo()
  /** Ce qui a été dit une fois les barquettes sorties : les barquettes n'étant plus au congélateur, on le fige. */
  const [fait, setFait] = useState<string | null>(null)

  if (ids === null) return null
  const { asortir } = sortablesDuLien(ids, barquettes)
  const plusieursPlats = groupeLesParts(asortir).length > 1

  async function sortir() {
    const phrase = phraseDApresSortie(asortir)
    try {
      await sort.mutateAsync(asortir.map(p => p.id))
      setFait(phrase)
    } catch { /* l'erreur est dite dans la feuille (`sort.error`) */ }
  }

  const illisible = fait === null && !!erreur && !chargement

  const titre = fait !== null ? 'C’est fait'
    : illisible ? 'Je n’ai pas pu lire ton frigo'
    : chargement ? 'Un instant'
      : asortir.length === 0 ? 'Rien à sortir'
        : questionDeSortie(asortir)

  return (
    <Feuille ouverte fermer={surFerme} titre={titre}>
      <h2 className="titre mx-1 text-[24px] font-semibold leading-[1.15]">{titre}</h2>
      {fait !== null ? (
        <>
          <p role="status" className="mx-1 mt-2 text-[15px] leading-[1.45]">{fait}</p>
          <div className="mx-1 mt-4">
            <button type="button" onClick={surFerme}
                    className="min-h-12 w-full rounded-[14px] bg-herbe text-[15px] font-medium text-fond">
              Fermer
            </button>
          </div>
        </>
      ) : illisible ? (
        <>
          <p role="alert" className="mx-1 mt-2 text-[15px] leading-[1.45]">
            Rien n’a été sorti du congélateur. Le lien reste valable : réessaie, ou reviens plus tard.
          </p>
          <Erreur de={erreur} />
          <div className="mx-1 mt-4 flex gap-2.5">
            <button type="button" onClick={reessayer}
                    className="min-h-12 grow rounded-[14px] bg-herbe text-[15px] font-medium text-fond">
              Réessayer
            </button>
            <button type="button" onClick={surReporte}
                    className="min-h-12 grow rounded-[14px] border border-herbe text-[15px] text-herbe">
              Plus tard
            </button>
          </div>
        </>
      ) : chargement ? (
        <Attente />
      ) : asortir.length === 0 ? (
        <>
          <p className="mx-1 mt-2 text-[15px] leading-[1.45] text-doux">
            Ces barquettes ne sont plus au congélateur : elles ont déjà été sorties, mangées, ou elles n’existent plus.
          </p>
          <div className="mx-1 mt-4">
            <button type="button" onClick={surFerme}
                    className="min-h-12 w-full rounded-[14px] bg-herbe text-[15px] font-medium text-fond">
              D’accord
            </button>
          </div>
        </>
      ) : (
        <>
          {plusieursPlats && <p className="mx-1 mt-2 text-[15px] leading-[1.45]">{detailDeSortie(asortir)}.</p>}
          <p className="mx-1 mt-2 text-[14px] leading-[1.45] text-doux">
            Elles passent au frigo, décongelées : à manger dans les 24 heures.
          </p>
          <Erreur de={sort.error} />
          <div className="mx-1 mt-4 flex gap-2.5">
            <button type="button" onClick={sortir} disabled={sort.isPending}
                    className="min-h-12 grow rounded-[14px] bg-herbe text-[15px] font-medium text-fond disabled:opacity-60">
              {sort.isPending ? 'Un instant…' : 'Oui, je les sors'}
            </button>
            <button type="button" onClick={surFerme} disabled={sort.isPending}
                    className="min-h-12 grow rounded-[14px] border border-herbe text-[15px] text-herbe disabled:opacity-60">
              Pas maintenant
            </button>
          </div>
        </>
      )}
    </Feuille>
  )
}
