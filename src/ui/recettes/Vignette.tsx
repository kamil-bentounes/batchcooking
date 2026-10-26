/**
 * Une recette de la liste (R1), refaite le 26/10/2026 d'après la maquette
 * `choisir.html` : une grande photo, le temps des mains en pastille dessus, les
 * protéines en gros chiffres (c'est le critère de choix), et un bouton rond —
 * « + » safran, « ✓ » vert quand elle est retenue.
 *
 * Ce que la maquette ne montrait pas et que la carte garde : la provenance
 * (« Partagée par »), « il manque », la part de la recette connue, les pictos
 * des appareils.
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
  const tag = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[13px] font-medium'
  return (
    <article className={`relative rounded-[26px] bg-surface shadow-carte
                         ${prise ? 'ring-2 ring-herbe' : ''}`}>
      <div className="relative h-44 rounded-t-[26px] overflow-hidden">
        <Photo url={r.image_url} glyphe={56} className="size-full" />
        {/* Le temps ACTIF d'abord : c'est celui qui décide (D30). */}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 h-8 px-3
                         rounded-full bg-surface/95 text-[13.5px] font-semibold">
          <Icone nom="horloge" taille={16} />
          {actifConnu(r.active_time_min)
            ? `${duree(Number(r.active_time_min))} actives`
            : 'Gestes non comptés'}
        </span>
        <button type="button" onClick={surInfo} aria-label={`${titre}, la recette en détail`}
                className="absolute top-2.5 right-2.5 size-11 grid place-items-center rounded-full
                           bg-surface/95 text-encre">
          <Icone nom="info" taille={24} />
        </button>
      </div>

      {prise ? (
        <span role="img" aria-label="Retenue"
              className="absolute right-4 top-[148px] size-14 grid place-items-center rounded-full
                         bg-herbe text-surface shadow-[0_6px_16px_rgba(47,93,69,.35)]">
          <Icone nom="coche" taille={28} epaisseur={2.2} />
        </span>
      ) : (
        <button type="button" onClick={surAjoute} aria-label={`Ajouter ${titre}`}
                className="absolute right-4 top-[148px] size-14 grid place-items-center rounded-full
                           bg-safran text-encre shadow-[0_6px_16px_rgba(143,90,13,.35)]">
          <Icone nom="plus" taille={28} epaisseur={2.2} />
        </button>
      )}

      <div className="px-4 pt-3.5 pb-4">
        <h3 className="titre-fort text-[22px] !leading-[1.15] font-[560] pr-[72px] line-clamp-2
                       [overflow-wrap:anywhere]">
          {titre}
        </h3>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {r.yield_servings ? (
            <span className={`${tag} bg-piste text-doux`}>
              <Icone nom="pot" taille={15} />{parts(r.yield_servings)}
            </span>
          ) : null}
          {r.freezable === true && (
            <span className={`${tag} bg-congel-fond text-congel-encre`}>
              <Icone nom="flocon" taille={15} />se congèle
            </span>
          )}
          {prise && (
            <span className={`${tag} bg-frais-fond text-frais-encre`}>
              <Icone nom="coche" taille={15} epaisseur={2.2} />retenue
            </span>
          )}
        </div>

        {/* Les chiffres en valeur, en fourchette (D18). */}
        {n ? (
          <div className="mt-3.5 flex items-end gap-[22px]">
            <div>
              <div className="chiffre text-[34px] font-semibold leading-none text-herbe whitespace-nowrap">
                {ecrit(Number(n.protein_g), Number(n.protein_g_margin))}{INSECABLE}
                <small className="text-[18px] font-semibold">g</small>
              </div>
              <div className="mt-1 text-[12.5px] text-doux">de protéines par part</div>
            </div>
            {/* Comme les protéines : « 390– » puis « 430 kcal » ne se lit pas. */}
            <div>
              <div className="chiffre text-[22px] font-semibold leading-none whitespace-nowrap">
                {ecrit(Number(n.kcal), Number(n.kcal_margin))}{INSECABLE}
                <span className="block mt-1 font-[family-name:var(--font-texte)] text-[12.5px]
                                 font-normal tracking-normal text-doux">kcal</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[14px] text-doux">Macros inconnues</p>
        )}

        {n && Number(n.coverage) < 0.9 && (
          <p className="mt-2.5 text-[13px] text-ocre">
            {`${Math.round(Number(n.coverage) * 100)} % des ingrédients connus`}
          </p>
        )}

        {/* D'où elle vient. Sans ça, une recette arrivée d'un foyer ami n'a pas
            de provenance, et « d'où sort celle-là ? » reste sans réponse. */}
        {r.ajoutePar && (
          <p className={`mt-2 text-[13px] [overflow-wrap:anywhere] ${r.dUnAmi ? 'text-ocre' : 'text-doux'}`}>
            {r.dUnAmi ? `Partagée par ${r.ajoutePar}` : `Ajoutée par ${r.ajoutePar}`}
          </p>
        )}

        {manques.length > 0 && (
          <p className="mt-2 text-[13px] text-ocre [overflow-wrap:anywhere]">
            il manque {manques.length === 1 ? manques[0] : `${manques.length} ingrédients`}
          </p>
        )}

        {r.appliances.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.appliances.map(a => (
              <Picto key={a} code={a} taille={17} className="size-8 bg-piste text-herbe" />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
