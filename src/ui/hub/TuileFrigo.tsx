/**
 * La tuile du frigo : combien de parts au frigo, combien au congélateur, et la porte vers `/frigo`.
 *
 * Au bureau, le petit frigo inox à côté de deux chiffres teintés (piste, glace) ; au téléphone, pas de dessin, deux
 * lignes teintées. La tuile entière se touche (le bouton « Ouvrir le frigo » s'étend sur elle) : le bouton reste UN
 * seul contrôle, avec une cible de 44 px au moins.
 *
 * Rien ne se dit avant la lecture des barquettes : « … » en attendant, et une panne s'affiche comme une panne.
 */
import { Erreur } from '../coque.tsx'
import { IconeFrigo, MiniFrigo } from './MiniFrigo.tsx'

export function TuileFrigo({ auFrais, auFroid, chargement, erreur, magnet, va }: {
  auFrais: number; auFroid: number; chargement: boolean; erreur: unknown; magnet: boolean
  va: (v: string) => void
}) {
  const valeur = (n: number) => (chargement ? '…' : String(n))
  return (
    <section aria-labelledby="t-frigo" data-tuile="frigo"
             className="relative rounded-[22px] bg-surface p-3.5 shadow-carte max-[899px]:order-2 min-[900px]:rounded-[26px] min-[900px]:p-[18px]">
      <div className="mb-1 flex items-center justify-between min-[900px]:mb-3">
        <h2 id="t-frigo" className="titre flex items-center gap-2 text-[18px] font-semibold min-[900px]:text-[21px]">
          <IconeFrigo />Le frigo
        </h2>
        <button type="button" aria-label="Ouvrir le frigo" onClick={() => va('/frigo')}
                className="-my-2 -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[14px] px-2 text-herbe
                           after:absolute after:inset-0 after:rounded-[inherit] after:content-['']">
          <span aria-hidden="true" className="text-[22px] leading-none text-doux min-[900px]:hidden">›</span>
          <span aria-hidden="true" className="hidden text-[15px] font-semibold min-[900px]:inline">Ouvrir</span>
        </button>
      </div>
      {erreur ? <Erreur de={erreur} /> : (
        <div className="min-[900px]:grid min-[900px]:grid-cols-[92px_minmax(0,1fr)] min-[900px]:items-center min-[900px]:gap-[18px]">
          <span className="hidden min-[900px]:block"><MiniFrigo magnet={magnet} /></span>
          <div className="grid gap-1.5 min-[900px]:grid-cols-2 min-[900px]:gap-2.5">
            <div data-compte="frigo"
                 className="flex items-baseline gap-1.5 rounded-[14px] bg-piste px-2 py-[7px] max-[360px]:gap-[5px] max-[360px]:px-2 min-[900px]:block min-[900px]:rounded-[18px] min-[900px]:p-3">
              <b className="chiffre block text-[26px] font-semibold leading-none max-[360px]:text-[23px] min-[900px]:text-[32px]">{valeur(auFrais)}</b>
              <span className="text-[12.5px] leading-[1.2] text-frais-encre max-[360px]:text-[12px] min-[900px]:mt-1 min-[900px]:block min-[900px]:text-[13.5px]">
                {auFrais > 1 ? 'parts' : 'part'} au frigo
              </span>
            </div>
            <div data-compte="congelateur"
                 className="flex items-baseline gap-1.5 rounded-[14px] bg-congel-fond px-2 py-[7px] max-[360px]:gap-[5px] min-[900px]:block min-[900px]:rounded-[18px] min-[900px]:p-3">
              <b className="chiffre block text-[26px] font-semibold leading-none text-congel-encre max-[360px]:text-[23px] min-[900px]:text-[32px]">{valeur(auFroid)}</b>
              <span className="text-[12.5px] leading-[1.2] text-congel-encre max-[360px]:text-[12px] min-[900px]:mt-1 min-[900px]:block min-[900px]:text-[13.5px]">
                au congélateur
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
