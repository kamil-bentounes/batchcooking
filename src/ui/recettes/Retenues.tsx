/**
 * Ce qu'il reste à couvrir, et ce qui est déjà retenu (§ 3.2 de la spec).
 *
 * La carte encre de la maquette (`carte_encre()`) : le chiffre qui décide du
 * choix, en grand. Elle porte aussi les gestes que la maquette ne montrait pas et
 * que l'écran ne peut pas perdre : régler les parts visées, les parts de chaque
 * recette, et la retirer.
 */
import { useState } from 'react'
import type { RecetteChoisie } from '../../lib/donnees/cycle.ts'
import { PARTS_MAX_CYCLE, PARTS_MAX_RECETTE, parts } from '../../lib/recettes/parts.ts'
import { Erreur } from '../coque.tsx'
import { ChampParts } from './ChampParts.tsx'
import { Photo } from './Photo.tsx'

/** « 6 parts » en grand : l'espace insécable garde le chiffre et le mot sur une ligne. */
const enGrand = (texte: string) => texte.replace(' ', ' ')

export function Retenues({
  cible, choisies, erreur, reprise = 0, surRefus, surCible, surParts, surRetire,
}: {
  cible: number
  choisies: RecetteChoisie[]
  /** Ce qui a raté (retirer, parts, cible), dit en français ; `null` après un succès. */
  erreur?: string | null
  /** Change quand un réglage a raté : les champs repartent de la base. */
  reprise?: number
  /** Le motif d'un refus de saisie (« 2.5 », « 21 »), ou `null` quand elle est valide. */
  surRefus: (message: string | null) => void
  surCible: (parts: number) => void
  surParts: (recipeId: string, parts: number) => void
  surRetire: (id: string) => void
}) {
  const [regle, setRegle] = useState(false)
  const prises = choisies.reduce((s, c) => s + c.servings, 0)
  const manque = cible - prises

  return (
    <section aria-label="Ce qu’on cuisine"
             className="sur-encre mt-5 rounded-[28px] bg-encre text-fond px-5 pt-5 pb-[18px]">
      <div className="flex items-center justify-between gap-2 text-[15px] text-fond/70">
        <span>{manque > 0 ? 'Il manque' : manque === 0 ? 'C’est couvert' : 'Au-delà du prévu'}</span>
        {/* La cible fait 44 px, transparente ; le dessin garde les 28 px de la maquette. */}
        <button type="button" onClick={() => setRegle(r => !r)} aria-expanded={regle}
                className="inline-flex items-center min-h-11 -my-2 whitespace-nowrap">
          <span className="rounded-full bg-fond/8 px-[11px] py-[5px] text-[13px] text-brume">
            {cible} repas à couvrir
          </span>
        </button>
      </div>
      <p className="chiffre font-semibold mt-0.5 text-safran text-[60px] leading-[1.05]">
        {enGrand(manque > 0 ? parts(manque) : manque === 0 ? parts(cible) : `+${parts(-manque)}`)}
      </p>
      <p className="mt-1 text-[14px] text-fond/70">
        {manque > 0
          ? `${prises === 0 ? 'Rien de retenu pour l’instant.'
              : `${prises} déjà retenue${prises > 1 ? 's' : ''}.`} On fait les courses samedi.`
          : manque === 0
            ? 'Il ne reste qu’à faire la liste.'
            : `${prises} parts retenues pour ${cible} prévues.`}
      </p>

      {regle && (
        <label className="mt-3.5 flex items-center justify-between gap-3 text-[14px] text-brume">
          Parts visées cette semaine
          <ChampParts key={reprise} valeur={cible} max={PARTS_MAX_CYCLE}
                      surValeur={surCible} surRefus={surRefus}
                      className="w-20 h-11 rounded-[14px] bg-fond/10 px-3 text-right text-fond
                                 outline-none focus:bg-fond/15" />
        </label>
      )}

      {choisies.length > 0 && (
        <ul className="mt-3.5 space-y-2">
          {choisies.map(c => (c.recipe === null ? (
            /*
             * La recette d'un ami, retenue puis devenue illisible — amitié rompue,
             * ou partage retiré. La ligne du cycle survit ; sans ce cas, elle
             * s'affichait « Recette » et la liste de courses perdait ses
             * ingrédients en silence.
             */
            <li key={c.id} className="flex items-center gap-2.5 p-2 rounded-[16px] bg-fond/7">
              <span className="grow text-[14px] text-brume">
                Recette devenue inaccessible
                <span className="block text-[13px] text-fond/70">
                  Son foyer ne la partage plus. Elle n’apporte plus rien aux courses.
                </span>
              </span>
              {/* « Retirer » garde la même couleur partout : le rouge est réservé
                  à ce qui ne se défait pas. */}
              <button type="button" onClick={() => surRetire(c.id)}
                      className="min-h-11 px-2 text-[13px] text-fond/70">Retirer</button>
            </li>
          ) : (
            /*
             * Deux lignes : le nom d'abord, sur deux lignes au plus, puis les gestes
             * à droite. Tout sur une seule ligne laissait au titre une douzaine de
             * caractères (« Banc recette… ») : on ne reconnaissait plus ce qu'on avait
             * retenu.
             */
            <li key={c.id} className="p-2 rounded-[16px] bg-fond/7">
              <div className="flex items-center gap-2.5">
                <Photo url={c.recipe.image_url} glyphe={20} className="size-[38px] rounded-[12px]" />
                <span className="grow min-w-0 line-clamp-2 text-[14px] leading-[1.3] text-brume">
                  {c.recipe.title}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2.5">
                {/* 44 px de cible, 36 de dessin : 4 px de bordure transparente, et le fond
                    ne couvre que la zone de padding (`bg-clip-padding`). */}
                <ChampParts key={reprise} valeur={c.servings} max={PARTS_MAX_RECETTE}
                            libelle={`Parts de ${c.recipe.title}`}
                            surValeur={n => surParts(c.recipe_id, n)} surRefus={surRefus}
                            className="w-12 h-11 border-y-4 border-transparent bg-clip-padding
                                       rounded-[12px] bg-fond/10 px-1.5 text-right text-fond
                                       outline-none focus:bg-fond/15" />
                <span className="text-[13px] text-fond/70">{c.servings > 1 ? 'parts' : 'part'}</span>
                <button type="button" onClick={() => surRetire(c.id)}
                        className="min-h-11 px-2 text-[13px] text-fond/70">Retirer</button>
              </div>
            </li>
          )))}
        </ul>
      )}
      <Erreur de={erreur} />
    </section>
  )
}
