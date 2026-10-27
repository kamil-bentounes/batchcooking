/**
 * « Ce qui vient » : les prochains repas posés après celui du jour, trois lignes au plus — la vignette du plat, le
 * moment (« Demain midi », « Jeudi, midi et soir »), le nom, et « à sortir mercredi » quand les parts dorment au
 * congélateur. Le lien « La semaine » mène à `/semaine`.
 *
 * Sans repas à venir, pas de liste vide : une phrase et le lien. Avant la lecture de la semaine, « … » : « rien de
 * posé » dit trop tôt serait faux.
 */
import { Erreur } from '../coque.tsx'
import { Appareil, PlatImage } from '../frigo/PlatImage.tsx'
import type { RangeeAVenir } from '../../lib/hub.ts'

export function CeQuiVient({ lignes, photoDe, chargement, erreur, va }: {
  lignes: RangeeAVenir[]
  photoDe: (recipeId: string | null) => string | null
  chargement: boolean
  erreur: unknown
  va: (v: string) => void
}) {
  return (
    <section aria-labelledby="t-suite" data-section="a-venir"
             className="rounded-[22px] bg-surface p-3.5 shadow-carte max-[899px]:order-4 max-[899px]:col-span-2 min-[900px]:rounded-[26px] min-[900px]:p-[18px]">
      <div className="mb-1 flex items-center justify-between gap-3 min-[900px]:mb-2">
        <h2 id="t-suite" className="titre text-[18px] font-semibold min-[900px]:text-[21px]">Ce qui vient</h2>
        <button type="button" onClick={() => va('/semaine')}
                className="-my-2 -mr-2 inline-flex min-h-11 items-center whitespace-nowrap rounded-[14px] px-2 text-[15px] font-semibold text-herbe">
          La semaine
        </button>
      </div>
      {erreur ? <Erreur de={erreur} />
        : chargement ? <p className="titre py-2 text-[24px] font-semibold opacity-50">…</p>
        : lignes.length === 0 ? (
          <p className="pb-1 text-[15px] text-doux">Rien n’est posé pour la suite de la semaine.</p>
        ) : (
          <ul className="grid">
            {lignes.map(l => (
              <li key={l.cle}
                  className="grid min-h-[60px] grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-3 border-t border-brume first:border-t-0 min-[900px]:min-h-[72px] min-[900px]:grid-cols-[56px_minmax(0,1fr)_auto]
                             max-[360px]:grid-cols-[40px_minmax(0,1fr)]">
                <span className="relative grid size-[46px] place-items-center overflow-hidden rounded-[13px] bg-piste text-doux max-[360px]:size-10 min-[900px]:size-14 min-[900px]:rounded-2xl">
                  {photoDe(l.recipeId) ? <PlatImage url={photoDe(l.recipeId)} texte={false} glyphe={20} />
                    : <Appareil taille={22} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] text-doux min-[900px]:text-[13.5px]">{l.quand}</span>
                  <span className="block text-[15px] font-semibold leading-[1.25] [overflow-wrap:anywhere] min-[900px]:text-[15.5px]">{l.label}</span>
                </span>
                {l.pastille && (
                  <span data-pastille="a-sortir"
                        className="whitespace-nowrap rounded-full bg-congel-fond px-2.5 py-[5px] text-[13px] font-semibold text-congel-encre max-[360px]:col-start-2 max-[360px]:mb-2.5 max-[360px]:justify-self-start">
                    {l.pastille}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}
