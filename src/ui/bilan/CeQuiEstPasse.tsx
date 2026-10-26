/**
 * « Ce qui est passé » : chaque recette de la période avec sa photo, ce qui s'en est mangé sur ce qui a été dressé,
 * et ce qui est parti à la poubelle.
 *
 * Le décompte reste d'un seul tenant (`whitespace-nowrap`) : « 6 / 6 » passait à la ligne, « 6 / » puis « 6 », pour
 * une recette au nom long, parce que rien ne protégeait le nombre de la coupure.
 */
import { PlatImage } from '../frigo/PlatImage.tsx'

export type RecettePassee = { label: string; recipeId: string | null; dressees: number; mangees: number; jetees: number }

export function CeQuiEstPasse({ recettes, photoDe }: {
  recettes: RecettePassee[]
  photoDe: (recipeId: string | null) => string | null
}) {
  return (
    <section className="rounded-[26px] bg-surface p-5 shadow-carte" aria-label="Ce qui est passé">
      <h2 className="titre text-[24px] font-semibold">Ce qui est passé</h2>
      <ul className="mt-1.5">
        {recettes.map(r => {
          const fini = r.dressees > 0 && r.mangees === r.dressees
          return (
            <li key={r.label} className="flex min-h-[76px] items-center gap-3.5 border-t border-brume py-2.5 first:border-t-0">
              <span className="relative size-14 shrink-0 overflow-hidden rounded-2xl bg-piste">
                <PlatImage url={photoDe(r.recipeId)} glyphe={20} texte={false} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight">{r.label}</span>
                <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-piste">
                  <span className="block h-full rounded-full bg-herbe"
                        style={{ width: `${r.dressees > 0 ? Math.min(100, (r.mangees / r.dressees) * 100) : 0}%` }} />
                </span>
                {r.jetees > 0 && (
                  <span className="mt-1.5 block text-[13px] text-ocre">
                    {r.jetees} jetée{r.jetees > 1 ? 's' : ''}
                  </span>
                )}
              </span>
              <span className={`chiffre whitespace-nowrap text-[20px] font-semibold ${fini ? 'text-herbe' : 'text-doux'}`}>
                {r.mangees} / {r.dressees}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[13px] leading-snug text-doux">
        Ce tableau garde la trace de ce qu’on finit et de ce qu’on jette.
      </p>
    </section>
  )
}
