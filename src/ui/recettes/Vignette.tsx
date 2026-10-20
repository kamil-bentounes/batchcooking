/**
 * Une recette de la liste B (R1) : la photo à gauche, ce qui décide au milieu,
 * les deux gestes à droite. Cinq par écran de téléphone.
 *
 * `carte_vignette` dans `docs/superpowers/maquettes/recettes/build.py`.
 */
import { duree } from '../coque.tsx'
import { ecrit } from '../../lib/nutrition/macros.ts'
import { parts } from '../../lib/recettes/parts.ts'
import { actifConnu } from '../../lib/recettes/temps.ts'
import type { Candidate } from '../../lib/donnees/catalogue.ts'
import { Photo } from './Photo.tsx'
import { Icone, Picto } from './pictos.tsx'

/** Entre un chiffre et son unité : « 32 g » ne se coupe pas en fin de ligne. */
const INSECABLE = ' '

export function Vignette({ recette: r, prise, manques, surInfo, surAjoute }: {
  recette: Candidate
  prise: boolean
  /** Ce qui manque au placard, quand on le sait. */
  manques: string[]
  surInfo: () => void
  surAjoute: () => void
}) {
  const titre = r.title ?? 'Recette'
  const n = r.nutrition
  return (
    <article className="flex gap-3 p-2.5 rounded-[22px] bg-surface shadow-carte">
      <Photo url={r.image_url} className="size-[88px] rounded-[16px]" />

      <div className="grow min-w-0 pt-0.5">
        <h3 className="text-[15.5px] font-semibold leading-[1.3] line-clamp-2 [overflow-wrap:anywhere]">
          {titre}
        </h3>

        {/* Le temps ACTIF d'abord : c'est celui qui décide (D30). */}
        <p className="mt-[3px] text-[13px] leading-[1.4] text-doux">
          {actifConnu(r.active_time_min)
            ? `${duree(Number(r.active_time_min))} actives`
            : 'Gestes non comptés'}
          {r.yield_servings ? ` · ${parts(r.yield_servings)}` : ''}
          {r.freezable === true ? ' · se congèle' : ''}
        </p>

        {/* Les chiffres en valeur, en fourchette (D18). */}
        {n ? (
          <p className="mt-[3px] text-[13px] leading-[1.4] text-doux">
            <strong className="text-herbe font-semibold whitespace-nowrap">
              {ecrit(Number(n.protein_g), Number(n.protein_g_margin))}{INSECABLE}g
            </strong>
            {' de protéines · '}
            {/* Comme les protéines : « 390– » puis « 430 kcal » ne se lit pas. */}
            <span className="whitespace-nowrap">
              {ecrit(Number(n.kcal), Number(n.kcal_margin))}{INSECABLE}kcal
            </span>
            {Number(n.coverage) < 0.9 && (
              <span className="text-ocre">
                {` · ${Math.round(Number(n.coverage) * 100)} % des ingrédients connus`}
              </span>
            )}
          </p>
        ) : (
          <p className="mt-[3px] text-[13px] leading-[1.4] text-doux">Macros inconnues</p>
        )}

        {/* D'où elle vient. Sans ça, une recette arrivée d'un foyer ami n'a pas
            de provenance, et « d'où sort celle-là ? » reste sans réponse. */}
        {r.ajoutePar && (
          <p className={`mt-[3px] text-[13px] [overflow-wrap:anywhere] ${r.dUnAmi ? 'text-ocre' : 'text-doux'}`}>
            {r.dUnAmi ? `Partagée par ${r.ajoutePar}` : `Ajoutée par ${r.ajoutePar}`}
          </p>
        )}

        {manques.length > 0 && (
          <p className="mt-[3px] text-[13px] text-ocre [overflow-wrap:anywhere]">
            il manque {manques.length === 1 ? manques[0] : `${manques.length} ingrédients`}
          </p>
        )}

        {r.appliances.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {r.appliances.map(a => (
              <Picto key={a} code={a} taille={15} className="size-[26px] bg-piste text-herbe" />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-between shrink-0 -mt-1 -mr-0.5 -mb-0.5">
        <button type="button" onClick={surInfo} aria-label={`${titre}, la recette en détail`}
                className="size-11 grid place-items-center rounded-full text-doux hover:text-encre">
          <Icone nom="info" taille={22} />
        </button>
        {prise ? (
          <span role="img" aria-label="Retenue"
                className="size-11 grid place-items-center rounded-full bg-herbe/10 text-herbe">
            <Icone nom="coche" taille={20} epaisseur={2.4} />
          </span>
        ) : (
          <button type="button" onClick={surAjoute} aria-label={`Ajouter ${titre}`}
                  className="size-11 grid place-items-center rounded-full bg-safran text-encre">
            <Icone nom="plus" taille={20} epaisseur={2.4} />
          </button>
        )}
      </div>
    </article>
  )
}
